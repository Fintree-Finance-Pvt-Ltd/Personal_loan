import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ApplicationConsentType, LenderIntegrationOperationStatus } from '@prisma/client';

import {
  createHash,
  randomUUID,
} from 'crypto';

import {
  PrismaService,
} from '../../infrastructure/prisma/prisma.service';

import {
  LenderAdapterRegistry,
} from './lender-adapter.registry';

import {
  LenderDecisionProcessor,
} from './lender-decision-processor.service';

import {
  LenderDocumentFileService,
} from './lender-document-file.service';

import {
  LenderIntegrationError,
} from './lender-integration.errors';

import {
  LenderAdapter,
  LenderChargeContext,
  LenderChargeWaiverContext,
  LenderConsentContext,
  LenderCreateApplicationContext,
  LenderDecisionContext,
  LenderDisburseContext,
  LenderDocumentCandidate,
  LenderDocumentUploadContext,
  LenderIntegrationTransportConfig,
  LenderRepaymentContext,
  LenderStatusContext,
  LenderUpdateApplicationContext,
} from './lender-integration.types';

import {
  LenderIntegrationOutboxService,
} from './lender-integration-outbox.service';

import {
  decryptBankAccountNumber,
} from '../../common/utils/bank-security.helper';

@Injectable()
export class LenderIntegrationService {
  private readonly logger = new Logger(LenderIntegrationService.name);

  constructor(
  private readonly prisma:
    PrismaService,

  private readonly registry:
    LenderAdapterRegistry,

  private readonly outbox:
    LenderIntegrationOutboxService,

  private readonly decisions:
    LenderDecisionProcessor,

  private readonly documentFiles:
    LenderDocumentFileService,
) {}
  async processEvent(
  eventId: string,
  lockToken: string,
): Promise<boolean> {
  const event =
    await this.prisma
      .lenderIntegrationOutbox
      .findUnique({
        where: {
          id: eventId,
        },
      });

  if (
    !event ||
    event.status !== 'PROCESSING' ||
    event.lockToken !== lockToken
  ) {
    throw new LenderIntegrationError(
      'LENDER_EVENT_LEASE_LOST',
      'Lender event is not owned by this worker.',
      'TEMPORARY',
      true,
    );
  }

  const application =
    await this.prisma
      .plApplication
      .findUnique({
        where: {
          id:
            event.applicationId,
        },

        include: {
          customer: true,

          lenderApplicationLink: {
            include: {
              integrationConfig:
                true,
            },
          },
        },
      });

  if (!application) {
    throw new LenderIntegrationError(
      'LENDER_APPLICATION_NOT_FOUND',
      'Canonical application was not found.',
      'PERMANENT_VALIDATION',
    );
  }

  this.verifyEventAllocation(
    event,
    application,
  );

  const allocation =
    await this.prisma
      .mlmAllocationDecision
      .findUnique({
        where: {
          id:
            application
              .mlmAllocationDecisionId!,
        },
      });

  if (
    !allocation ||
    allocation.status !== 'ASSIGNED' ||
    allocation.lenderId !==
      application.lenderId ||
    allocation.productId !==
      application.lenderProductId ||
    allocation.productVersionId !==
      application
        .productStrategyVersionId
  ) {
    throw new LenderIntegrationError(
      'LENDER_ALLOCATION_MISMATCH',
      'Persisted MLM allocation does not match the application.',
      'PERMANENT_VALIDATION',
    );
  }

  const link =
    application
      .lenderApplicationLink ??
    await this.createLink(
      application,
    );

  this.verifyLinkAllocation(
    link,
    application,
  );

  const config =
    link.integrationConfig ??
    await this.prisma
      .lenderIntegrationConfig
      .findUnique({
        where: {
          id:
            link.integrationConfigId,
        },
      });

  if (
    !config ||
    !config.isActive ||
    config.adapterKey !==
      link.adapterKey ||
    config.adapterVersion !==
      link.adapterVersion
  ) {
    throw new LenderIntegrationError(
      'LENDER_INTEGRATION_CONFIG_INVALID',
      'Persisted lender integration configuration is unavailable or inactive.',
      'AUTHENTICATION_CONFIGURATION',
    );
  }

  const adapter =
    this.registry.resolve(
      link.adapterKey,
      link.adapterVersion,
    );

  switch (
    event.integrationStage
  ) {
    case 'CREATE':
      return this.processCreate(
        event,
        application,
        link,
        config,
        adapter,
      );

    case 'CONSENT':
      return this.processConsent(
        event,
        application,
        link,
        config,
        adapter,
      );

    case 'UPDATE':
      return this.processUpdate(
        event,
        application,
        link,
        config,
        adapter,
      );

    case 'DOCUMENT':
      return this.processDocument(
        event,
        application,
        link,
        config,
        adapter,
      );

    case 'DECISION':
    case 'STATUS':
      if (
        event.integrationStage ===
          'DECISION' &&
        !adapter.capabilities
          .decisionRequest
      ) {
        throw new LenderIntegrationError(
          'FINTREE_DECISION_CONTRACT_NOT_ENABLED',
          'Decision contract is disabled for this adapter.',
          'PERMANENT_VALIDATION',
        );
      }

      if (
        event.integrationStage ===
          'STATUS' &&
        !adapter.capabilities
          .statusPolling
      ) {
        throw new LenderIntegrationError(
          'FINTREE_STATUS_CONTRACT_NOT_ENABLED',
          'Status polling is disabled for this adapter.',
          'PERMANENT_VALIDATION',
        );
      }

      await this.processDecision(
        event,
        application,
        link,
        config,
        adapter,
        lockToken,
      );

      return true;

    case 'DISBURSE':
      if (
        !adapter.capabilities
          .disbursement
      ) {
        throw new LenderIntegrationError(
          'FINTREE_DISBURSE_CONTRACT_NOT_ENABLED',
          'Disbursal trigger is disabled for this adapter.',
          'PERMANENT_VALIDATION',
        );
      }

      return this.processDisburse(
        event,
        application,
        link,
        config,
        adapter,
      );

    case 'REPAYMENT':
      if (!adapter.capabilities.repaymentNotification) {
        throw new LenderIntegrationError(
          'FINTREE_REPAYMENT_CONTRACT_NOT_ENABLED',
          'Repayment notification is disabled for this adapter.',
          'PERMANENT_VALIDATION',
        );
      }
      return this.processRepaymentNotify(event, application, link, config, adapter);

    case 'CHARGE':
      if (!adapter.capabilities.chargeNotification) {
        throw new LenderIntegrationError(
          'FINTREE_CHARGE_CONTRACT_NOT_ENABLED',
          'Charge notification is disabled for this adapter.',
          'PERMANENT_VALIDATION',
        );
      }
      return this.processChargeNotify(event, application, link, config, adapter);

    case 'CHARGE_WAIVER':
      if (!adapter.capabilities.chargeWaiverNotification) {
        throw new LenderIntegrationError(
          'FINTREE_CHARGE_WAIVER_CONTRACT_NOT_ENABLED',
          'Charge waiver notification is disabled for this adapter.',
          'PERMANENT_VALIDATION',
        );
      }
      return this.processChargeWaiverNotify(event, application, link, config, adapter);

    default:
      throw new LenderIntegrationError(
        'LENDER_STAGE_UNSUPPORTED',
        `Integration stage ${event.integrationStage} is unsupported.`,
        'PERMANENT_VALIDATION',
      );
  }
}

async markStageFailure(
  eventId: string,
  lockToken: string,
  error: LenderIntegrationError,
  retrying: boolean,
): Promise<void> {
  await this.prisma.$transaction(async (tx) => {
    const event = await tx.lenderIntegrationOutbox.findFirst({
      where: {
        id: eventId,
        status: 'PROCESSING',
        lockToken,
      },
    });

    if (!event) {
      return;
    }

    if (event.integrationStage === 'DOCUMENT' && event.documentTransferId) {
      await tx.lenderDocumentTransfer.updateMany({
        where: {
          id: event.documentTransferId,
        },
        data: {
          transferStatus: retrying ? 'PENDING' : 'FAILED',
          lastErrorCode: error.code,
          lastErrorMessage: error.message,
        },
      });
      return;
    }

    // DISBURSE has no LenderApplicationLink status column — it tracks state on
    // PlLoan.disbursalStatus directly (see processDisburse()). While retries remain,
    // leave the loan's status alone (still DISBURSAL_REQUESTED/PROCESSING from
    // LoanService.requestDisbursal()); only mark it failed once retries are exhausted,
    // so the customer sees a support/retry state instead of "processing" forever.
    if (event.integrationStage === 'DISBURSE') {
      if (!retrying) {
        await tx.plLoan.updateMany({
          where: { applicationId: event.applicationId },
          data: { disbursalStatus: 'DISBURSAL_TRIGGER_FAILED' },
        });
      }
      return;
    }

    const status = (
      retrying ? 'RETRY_PENDING' : 'FAILED'
    ) as LenderIntegrationOperationStatus;

    // consentStatus tracks the gating data-sharing consent, because that is what
    // processUpdate() requires to be COMPLETED. A supplementary consent (Aadhaar KYC,
    // Account Aggregator, live photo, and the three decision consents) is evidence we
    // forward — its rejection must not regress the column and strand the application on
    // LENDER_UPDATE_BEFORE_CONSENT. Its own outbox row still records the failure.
    const isGatingConsent =
      event.integrationStage === 'CONSENT' && (event.consentType ?? 'DATA_SHARING') === 'DATA_SHARING';

    const data =
      event.integrationStage === 'CREATE'
        ? { createStatus: status }
        : event.integrationStage === 'CONSENT'
          ? (isGatingConsent ? { consentStatus: status } : null)
          : event.integrationStage === 'UPDATE'
            ? { updateStatus: status }
            : { decisionStatus: status };

    if (!data) return;

    await tx.lenderApplicationLink.updateMany({
      where: {
        applicationId: event.applicationId,
      },
      data: {
        ...data,
        lastAttemptAt: new Date(),
        lastErrorCode: error.code,
        lastErrorMessage: error.message,
      },
    });
  });
}

  private async createLink(application: any): Promise<any> {
    const configs = await this.prisma.lenderIntegrationConfig.findMany({ where: { lenderId: application.lenderId, isActive: true } });
    if (configs.length !== 1) {
      throw new LenderIntegrationError('LENDER_INTEGRATION_CONFIG_INVALID', 'Exactly one active lender integration configuration is required.', 'AUTHENTICATION_CONFIGURATION');
    }
    const config = configs[0];
    const createIdempotencyKey = `${application.applicationNumber}:LENDER_CREATE_APPLICATION:V1`;
    try {
      return await this.prisma.lenderApplicationLink.create({
        data: {
          applicationId: application.id,
          applicationReference: application.applicationNumber,
          lenderId: application.lenderId,
          lenderProductId: application.lenderProductId,
          productStrategyVersionId: application.productStrategyVersionId,
          integrationConfigId: config.id,
          adapterKey: config.adapterKey,
          adapterVersion: config.adapterVersion,
          createIdempotencyKey,
          createStatus: 'PENDING',
        },
        include: { integrationConfig: true },
      });
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
      return this.prisma.lenderApplicationLink.findUniqueOrThrow({ where: { applicationId: application.id }, include: { integrationConfig: true } });
    }
  }

  private async processCreate(
  event: any,
  application: any,
  link: any,
  config: any,
  adapter: LenderAdapter,
): Promise<boolean> {
  if (
    ['ACKNOWLEDGED', 'COMPLETED']
      .includes(link.createStatus) &&
    link.partnerApplicationId
  ) {
    return false;
  }

  const context =
    await this.buildCreateContext(
      event,
      application,
      config,
    );

  await this.prisma
    .lenderApplicationLink
    .update({
      where: {
        id: link.id,
      },

      data: {
        createStatus:
          'PROCESSING',

        lastAttemptAt:
          new Date(),

        lastRequestHash:
          this.hash(context),

        lastErrorCode:
          null,

        lastErrorMessage:
          null,
      },
    });

  const result =
    await adapter
      .createApplication(
        context,
      );

  if (
    !result.acknowledged ||
    !result.partnerApplicationId
  ) {
    throw new LenderIntegrationError(
      'LENDER_CREATE_NOT_ACKNOWLEDGED',
      'Lender CREATE was not acknowledged.',
      'PERMANENT_VALIDATION',
    );
  }

  // The gating data-sharing consent keeps its original key so events queued before the
  // per-type fan-out shipped still resolve to the same row.
  const consentKey =
    `${application.applicationNumber}:LENDER_SUBMIT_CONSENT:V1`;

  await this.prisma
    .$transaction(
      async (tx) => {
        await tx
          .lenderApplicationLink
          .update({
            where: {
              id: link.id,
            },

            data: {
              createStatus:
                'COMPLETED',

              consentStatus:
                'PENDING',

              consentIdempotencyKey:
                consentKey,

              consentPayloadVersion:
                1,

              lastSyncedStage:
                'CREATE',

              partnerLeadId:
                result
                  .partnerLeadId ??
                null,

              partnerApplicationId:
                result
                  .partnerApplicationId,

              partnerReference:
                result
                  .partnerReference ??
                null,

              lastResponseStatus:
                result
                  .providerStatus,

              lastSuccessAt:
                new Date(),

              lastErrorCode:
                null,

              lastErrorMessage:
                null,
            },
          });

        const _result = await tx
            .lenderIntegrationOutbox
            .updateMany({
              where: {
                id: event.id,
                status: 'PROCESSING',
                lockToken: event.lockToken,
              },
              data: {
              status:
                'COMPLETED',

              processedAt:
                new Date(),

              lockedAt:
                null,

              lockedBy:
                null,

              lockToken:
                null,

              leaseExpiresAt:
                null,
            },
            });
          if (_result.count !== 1) {
            throw new LenderIntegrationError(
              'LENDER_EVENT_LEASE_LOST',
              'Event lock was lost during completion.',
              'TEMPORARY',
              true
            );
          }

        await tx
          .lenderIntegrationOutbox
          .upsert({
            where: {
              idempotencyKey:
                consentKey,
            },

            create: {
              eventType:
                'LENDER_SUBMIT_CONSENT',

              applicationId:
                application.id,

              applicationReference:
                application
                  .applicationNumber,

              lenderId:
                application.lenderId,

              integrationStage:
                'CONSENT',

              payloadVersion:
                1,

              idempotencyKey:
                consentKey,

              consentType:
                'DATA_SHARING',
            },

            update: {},
          });
      },
    );

  // Every other consent already recorded by this point (live photo, Aadhaar KYC, and any
  // later ones once they land) gets its own submission event now that a
  // partnerApplicationId exists to address them to.
  //
  // Best-effort: CREATE has already succeeded at the lender and been committed above.
  // Throwing here would fail the event and force a retry of a call that has already
  // landed, to fix nothing — the next recorded consent queues these again anyway.
  try {
    await this.outbox.enqueueConsentSubmissions(application.id);
  } catch (error: any) {
    this.logger.error(
      `CREATE completed for ${application.applicationNumber} but queueing consent submissions failed: ${error?.message}`,
    );
  }

  return true;
}

  private async processConsent(
  event: any,
  application: any,
  link: any,
  config: any,
  adapter: LenderAdapter,
): Promise<boolean> {
  // link.consentStatus tracks the DATA_SHARING consent specifically, because that is what
  // gates UPDATE. The other consent types each have their own outbox row and must not be
  // short-circuited by (or allowed to regress) that single column.
  const isGatingConsent = (event.consentType ?? 'DATA_SHARING') === 'DATA_SHARING';

  if (
    isGatingConsent &&
    link.consentStatus ===
      'COMPLETED' &&
    ['CONSENT', 'UPDATE', 'DOCUMENT']
      .includes(
        link.lastSyncedStage,
      )
  ) {
    return false;
  }

  if (
    !link.partnerApplicationId ||
    link.createStatus !==
      'COMPLETED'
  ) {
    throw new LenderIntegrationError(
      'LENDER_CONSENT_BEFORE_CREATE',
      'Consent submission requires a completed CREATE and partner application ID.',
      'PERMANENT_VALIDATION',
    );
  }

  if (
    adapter.capabilities
      .separateConsentSubmission &&
    !adapter.submitConsent
  ) {
    throw new LenderIntegrationError(
      'LENDER_CONSENT_METHOD_MISSING',
      'The adapter declares separate consent support but does not implement submitConsent.',
      'AUTHENTICATION_CONFIGURATION',
    );
  }

  const context =
    await this.buildConsentContext(
      event,
      application,
      config,
      link,
    );

  await this.prisma
    .lenderApplicationLink
    .update({
      where: {
        id: link.id,
      },

      data: {
        // Only the gating consent moves consentStatus; a supplementary consent going out
        // must not drag the link back out of COMPLETED and block UPDATE.
        ...(isGatingConsent
          ? {
              consentStatus:
                'PROCESSING' as const,

              consentIdempotencyKey:
                event.idempotencyKey,
            }
          : {}),

        lastAttemptAt:
          new Date(),

        lastRequestHash:
          this.hash(context),

        lastErrorCode:
          null,

        lastErrorMessage:
          null,
      },
    });

  const result =
    adapter.submitConsent
      ? await adapter
          .submitConsent(
            context,
          )
      : {
          acknowledged: true,
          providerStatus:
            'NOT_REQUIRED',
          consentReference:
            context.consentId,
          acknowledgedAt:
            new Date()
              .toISOString(),
        };

  if (!result.acknowledged) {
    throw new LenderIntegrationError(
      'LENDER_CONSENT_NOT_ACKNOWLEDGED',
      'Lender consent was not acknowledged.',
      'PERMANENT_VALIDATION',
    );
  }

  await this.prisma
    .$transaction(
      async (tx) => {
        await tx
          .lenderApplicationLink
          .update({
            where: {
              id: link.id,
            },

            data: {
              // See above: only the gating DATA_SHARING consent owns this column.
              ...(isGatingConsent
                ? {
                    consentStatus:
                      'COMPLETED' as const,

                    lastSyncedStage:
                      'CONSENT' as const,
                  }
                : {}),

              lastResponseStatus:
                result
                  .providerStatus,

              lastSuccessAt:
                new Date(
                  result
                    .acknowledgedAt,
                ),

              lastErrorCode:
                null,

              lastErrorMessage:
                null,
            },
          });

        const _result = await tx
            .lenderIntegrationOutbox
            .updateMany({
              where: {
                id: event.id,
                status: 'PROCESSING',
                lockToken: event.lockToken,
              },
              data: {
              status:
                'COMPLETED',

              processedAt:
                new Date(),

              lockedAt:
                null,

              lockedBy:
                null,

              lockToken:
                null,

              leaseExpiresAt:
                null,
            },
            });
          if (_result.count !== 1) {
            throw new LenderIntegrationError(
              'LENDER_EVENT_LEASE_LOST',
              'Event lock was lost during completion.',
              'TEMPORARY',
              true
            );
          }
      },
    );

  await this.outbox
    .enqueueUpdateWhenReady(
      application.id,
    );

  return true;
}

  private async buildConsentContext(
  event: any,
  application: any,
  config: any,
  link: any,
): Promise<LenderConsentContext> {
  // Each CONSENT event carries the one consent type it is responsible for submitting
  // (the lender's endpoint takes one per POST). Legacy events created before the
  // per-type fan-out have no consentType and mean the data-sharing consent.
  const consentType: ApplicationConsentType = event.consentType ?? 'DATA_SHARING';

  const consent =
    consentType === 'DATA_SHARING'
      ? await this.prisma.lenderDataSharingConsent.findFirst({
          where: {
            applicationId: application.id,
            customerId: application.customerId,
            lenderId: application.lenderId,
            revokedAt: null,
          },
          orderBy: { acceptedAt: 'desc' },
        })
      : await this.prisma.applicationStageConsent.findFirst({
          where: {
            applicationId: application.id,
            lenderId: application.lenderId,
            consentType,
            revokedAt: null,
          },
          orderBy: { acceptedAt: 'desc' },
        });

  if (!consent) {
    throw new LenderIntegrationError(
      'LENDER_CONSENT_MISSING',
      `Valid ${consentType} consent evidence was not found.`,
      'PERMANENT_VALIDATION',
    );
  }

  const calculatedHash =
    createHash('sha256')
      .update(
        consent.consentText,
        'utf8',
      )
      .digest('hex');

  if (
    calculatedHash !==
    consent.consentTextHash
  ) {
    throw new LenderIntegrationError(
      'LENDER_CONSENT_HASH_MISMATCH',
      'Persisted consent text hash is invalid.',
      'PERMANENT_VALIDATION',
    );
  }

  if (!application.platformLan) {
    throw new LenderIntegrationError(
      'PLATFORM_LAN_MISSING',
      'Platform LAN is missing.',
      'PERMANENT_VALIDATION',
    );
  }

  const userAgentHash =
    consent.userAgent
      ? createHash('sha256')
          .update(
            consent.userAgent,
            'utf8',
          )
          .digest('hex')
      : null;

  return {
    idempotencyKey:
      event.idempotencyKey,

    correlationId:
      randomUUID(),

    payloadVersion:
      event.payloadVersion,

    transport:
      this.transport(config),

    partnerApplicationId:
      link.partnerApplicationId,

    applicationReference:
      application
        .applicationNumber,

    platformLan:
      application.platformLan,

    consentId:
      consent.id,

    // LENDER_DATA_SHARING is the name the lender's contract uses for what we call
    // DATA_SHARING; every other type goes across under its own name.
    consentType:
      consentType === 'DATA_SHARING'
        ? 'LENDER_DATA_SHARING'
        : consentType,

    consentTemplateId:
      consent
        .consentTemplateId,

    consentVersion:
      consent
        .consentVersion,

    consentTextHash:
      consent
        .consentTextHash,

    // Only LenderDataSharingConsent carries a reference; stage consents fall back to
    // their type, which is what the lender uses to categorise the submission.
    consentReference:
      'consentReference' in consent
        ? consent.consentReference
        : consentType,

    acceptedAt:
      consent
        .acceptedAt
        .toISOString(),

    ipAddress:
      consent.ipAddress,

    userAgentHash,
  };
}

  private async processUpdate(
  event: any,
  application: any,
  link: any,
  config: any,
  adapter: LenderAdapter,
): Promise<boolean> {
  if (
    ['ACKNOWLEDGED', 'COMPLETED']
      .includes(link.updateStatus) &&
    link.updatePayloadVersion >=
      event.payloadVersion
  ) {
    return false;
  }

  if (
    link.consentStatus !==
      'COMPLETED' ||
    !link.partnerApplicationId
  ) {
    throw new LenderIntegrationError(
      'LENDER_UPDATE_BEFORE_CONSENT',
      'Lender UPDATE requires acknowledged consent and a partner application ID.',
      'PERMANENT_VALIDATION',
    );
  }

  const context =
    await this.buildUpdateContext(
      event,
      application,
      config,
    );

  await this.prisma
    .lenderApplicationLink
    .update({
      where: {
        id: link.id,
      },

      data: {
        updateStatus:
          'PROCESSING',

        updateIdempotencyKey:
          event.idempotencyKey,

        lastAttemptAt:
          new Date(),

        lastRequestHash:
          this.hash(context),

        lastErrorCode:
          null,

        lastErrorMessage:
          null,
      },
    });

  const result =
    await adapter
      .updateApplication(
        context,
      );

  if (!result.acknowledged) {
    throw new LenderIntegrationError(
      'LENDER_UPDATE_NOT_ACKNOWLEDGED',
      'Lender details update was not acknowledged.',
      'PERMANENT_VALIDATION',
    );
  }

  const sourceDocuments =
    adapter.capabilities
      .documentUpload
      ? await this.prisma
          .plCustomerDocument
          .findMany({
            where: {
              applicationId:
                application.id,

              customerId:
                application.customerId,

              status:
                'VERIFIED',
            },
          })
      : [];

  const candidates:
    LenderDocumentCandidate[] =
    sourceDocuments.map(
      (document) => ({
        sourceDocumentId:
          document.id.toString(),

        sourceDocumentType:
          document.documentType,

        status:
          document.status,

        applicantType:
          document.applicantType,

        fileName:
          document.fileName,

        originalFileName:
          document
            .originalFileName,

        mimeType:
          document.mimeType,

        fileSize:
          document.fileSize,

        source:
          document.source,

        capturedAt:
          (
            document.capturedAt ??
            document.uploadedAt
          ).toISOString(),
      }),
    );

  const selections =
    adapter.selectDocuments
      ? adapter.selectDocuments(
          candidates,
        )
      : [];

  await this.prisma
    .$transaction(
      async (tx) => {
        await tx
          .lenderApplicationLink
          .update({
            where: {
              id: link.id,
            },

            data: {
              updateStatus:
                'COMPLETED',

              updateIdempotencyKey:
                event.idempotencyKey,

              updatePayloadVersion:
                event.payloadVersion,

              lastSyncedStage:
                'UPDATE',

              partnerReference:
                result
                  .partnerReference ??
                link.partnerReference,

              lastResponseStatus:
                result
                  .providerStatus,

              lastSuccessAt:
                new Date(
                  result
                    .acknowledgedAt,
                ),

              lastErrorCode:
                null,

              lastErrorMessage:
                null,
            },
          });

        const _result = await tx
            .lenderIntegrationOutbox
            .updateMany({
              where: {
                id: event.id,
                status: 'PROCESSING',
                lockToken: event.lockToken,
              },
              data: {
              status:
                'COMPLETED',

              processedAt:
                new Date(),

              lockedAt:
                null,

              lockedBy:
                null,

              lockToken:
                null,

              leaseExpiresAt:
                null,
            },
            });
          if (_result.count !== 1) {
            throw new LenderIntegrationError(
              'LENDER_EVENT_LEASE_LOST',
              'Event lock was lost during completion.',
              'TEMPORARY',
              true
            );
          }

        for (
          const selection
          of selections
        ) {
          const sourceDocumentId =
            BigInt(
              selection
                .sourceDocumentId,
            );

          const key =
            [
              application
                .applicationNumber,

              'LENDER_DOCUMENT',

              selection
                .documentType,

              selection
                .sourceDocumentId,

              'V1',
            ].join(':');

          const transfer =
            await tx
              .lenderDocumentTransfer
              .upsert({
                where: {
                  idempotencyKey:
                    key,
                },

                create: {
                  applicationId:
                    application.id,

                  lenderApplicationLinkId:
                    link.id,

                  sourceDocumentId,

                  documentType:
                    selection
                      .documentType,

                  idempotencyKey:
                    key,
                },

                update: {},
              });

          await tx
            .lenderIntegrationOutbox
            .upsert({
              where: {
                idempotencyKey:
                  key,
              },

              create: {
                eventType:
                  'LENDER_UPLOAD_DOCUMENT',

                applicationId:
                  application.id,

                applicationReference:
                  application
                    .applicationNumber,

                lenderId:
                  application
                    .lenderId,

                integrationStage:
                  'DOCUMENT',

                payloadVersion:
                  1,

                idempotencyKey:
                  key,

                documentTransferId:
                  transfer.id,
              },

              update: {},
            });
        }
      },
    );

  // Only the onboarding-profile UPDATE (V1, pre-approval) and the offer-selection
  // UPDATE (V2, final approval) should ever trigger a decision request. Later staged
  // pushes (bank V3, mandate V4, ...) must never re-request a lender decision.
  // decisionPayloadVersion defaults to 1 in the schema even when no decision has
  // ever been requested, so it cannot by itself distinguish "never requested" from
  // "V1 already requested" — decisionIdempotencyKey (null until a decision is
  // genuinely requested) is the reliable signal for that.
  if (
    adapter.capabilities
      .decisionRequest &&
    event.payloadVersion <= 2 &&
    (
      !link.decisionIdempotencyKey ||
      link.decisionPayloadVersion <
        event.payloadVersion
    )
  ) {
    await this.outbox
      .enqueueDecisionWhenReady(
        application.id,
        event.payloadVersion,
      );
  }

  return true;
}

  private async processDecision(event: any, application: any, link: any, config: any, adapter: any, lockToken: string): Promise<void> {
    if (!link.partnerApplicationId || !['ACKNOWLEDGED', 'COMPLETED'].includes(link.updateStatus)) {
      throw new LenderIntegrationError('LENDER_DECISION_BEFORE_UPDATE', 'Lender decision requires an acknowledged lender update.', 'PERMANENT_VALIDATION');
    }
    if (event.integrationStage === 'STATUS') {
      if (!adapter.getStatus) throw new LenderIntegrationError('LENDER_STATUS_NOT_SUPPORTED', 'Selected lender adapter does not support status inquiry.', 'AUTHENTICATION_CONFIGURATION');
      const context = await this.buildStatusContext(event, application, link, config);
      const result = await adapter.getStatus(context);
      await this.decisions.process(event.id, lockToken, link.partnerApplicationId, result, adapter.capabilities.statusPolling);
      return;
    }
    const context = await this.buildDecisionContext(event, application, link, config);
    await this.prisma.lenderApplicationLink.update({ where: { id: link.id }, data: { decisionStatus: 'PROCESSING', decisionIdempotencyKey: event.idempotencyKey, lastAttemptAt: new Date(), lastRequestHash: this.hash(context), lastErrorCode: null, lastErrorMessage: null } });
    const result = await adapter.requestDecision(context);
    await this.decisions.process(event.id, lockToken, link.partnerApplicationId, result, adapter.capabilities.statusPolling);
  }

  private async processDisburse(event: any, application: any, link: any, config: any, adapter: LenderAdapter): Promise<boolean> {
    if (!adapter.requestDisbursal) {
      throw new LenderIntegrationError('LENDER_DISBURSE_METHOD_MISSING', 'The adapter declares disbursement support but does not implement requestDisbursal.', 'AUTHENTICATION_CONFIGURATION');
    }
    if (!link.partnerApplicationId) {
      throw new LenderIntegrationError('LENDER_DISBURSE_BEFORE_CREATE', 'Disbursal trigger requires a completed CREATE and partner application ID.', 'PERMANENT_VALIDATION');
    }
    if (application.status !== 'LENDER_APPROVED') {
      throw new LenderIntegrationError('LENDER_DISBURSE_BEFORE_APPROVAL', 'Disbursal can only be triggered for a lender-approved application.', 'PERMANENT_VALIDATION');
    }

    const loan = await this.prisma.plLoan.findUnique({ where: { applicationId: application.id } });
    if (!loan) {
      throw new LenderIntegrationError('LENDER_DISBURSE_LOAN_MISSING', 'No loan exists for this application yet.', 'PERMANENT_VALIDATION');
    }
    if (loan.disbursalStatus === 'DISBURSED' || loan.status === 'DISBURSED') {
      return false;
    }
    if (!loan.approvedAmount || Number(loan.approvedAmount) <= 0) {
      throw new LenderIntegrationError('LENDER_DISBURSE_AMOUNT_MISSING', 'Loan is missing a valid approved amount to disburse.', 'PERMANENT_VALIDATION');
    }

    const context = await this.buildDisburseContext(event, application, link, config, loan);
    const result = await adapter.requestDisbursal(context);

    if (!result.acknowledged) {
      throw new LenderIntegrationError('LENDER_DISBURSE_NOT_ACKNOWLEDGED', 'Lender disbursal trigger was not acknowledged.', 'PERMANENT_VALIDATION');
    }

    await this.prisma.$transaction(async (tx) => {
      // Only advance disbursalStatus if the async webhook hasn't already resolved it —
      // the webhook can, in principle, race ahead of this ACK completing.
      await tx.plLoan.updateMany({
        where: { id: loan.id, disbursalStatus: { notIn: ['DISBURSED', 'DISBURSAL_FAILED'] } },
        data: {
          disbursalStatus: 'DISBURSAL_PROCESSING',
          disbursalProviderRef: result.disbursalReference ?? loan.disbursalProviderRef,
        },
      });

      const _result = await tx.lenderIntegrationOutbox.updateMany({
        where: { id: event.id, status: 'PROCESSING', lockToken: event.lockToken },
        data: { status: 'COMPLETED', processedAt: new Date(), lockedAt: null, lockedBy: null, lockToken: null, leaseExpiresAt: null, lastErrorCode: null, lastErrorMessage: null },
      });
      if (_result.count !== 1) {
        throw new LenderIntegrationError('LENDER_EVENT_LEASE_LOST', 'Event lock was lost during completion.', 'TEMPORARY', true);
      }
    });

    return true;
  }

  private async processRepaymentNotify(event: any, application: any, link: any, config: any, adapter: LenderAdapter): Promise<boolean> {
    if (!adapter.recordRepayment) {
      throw new LenderIntegrationError('LENDER_REPAYMENT_METHOD_MISSING', 'The adapter declares repayment-notification support but does not implement recordRepayment.', 'AUTHENTICATION_CONFIGURATION');
    }
    if (!link.partnerApplicationId) {
      throw new LenderIntegrationError('LENDER_SERVICING_BEFORE_CREATE', 'Servicing notifications require a completed CREATE and partner application ID.', 'PERMANENT_VALIDATION');
    }
    if (!event.repaymentId) {
      throw new LenderIntegrationError('LENDER_REPAYMENT_EVENT_MISSING_REF', 'Repayment notification event is missing its repayment reference.', 'PERMANENT_VALIDATION');
    }

    const repayment = await this.prisma.plRepayment.findUnique({ where: { id: event.repaymentId } });
    if (!repayment) {
      throw new LenderIntegrationError('LENDER_REPAYMENT_MISSING', 'The referenced repayment no longer exists.', 'PERMANENT_VALIDATION');
    }

    const context = await this.buildRepaymentContext(event, application, link, config, repayment);
    const result = await adapter.recordRepayment(context);

    if (!result.acknowledged) {
      throw new LenderIntegrationError('LENDER_REPAYMENT_NOT_ACKNOWLEDGED', 'Lender did not acknowledge the repayment notification.', 'PERMANENT_VALIDATION');
    }

    const completed = await this.prisma.lenderIntegrationOutbox.updateMany({
      where: { id: event.id, status: 'PROCESSING', lockToken: event.lockToken },
      data: { status: 'COMPLETED', processedAt: new Date(), lockedAt: null, lockedBy: null, lockToken: null, leaseExpiresAt: null, lastErrorCode: null, lastErrorMessage: null },
    });
    if (completed.count !== 1) {
      throw new LenderIntegrationError('LENDER_EVENT_LEASE_LOST', 'Event lock was lost during completion.', 'TEMPORARY', true);
    }

    return true;
  }

  private async processChargeNotify(event: any, application: any, link: any, config: any, adapter: LenderAdapter): Promise<boolean> {
    if (!adapter.addCharge) {
      throw new LenderIntegrationError('LENDER_CHARGE_METHOD_MISSING', 'The adapter declares charge-notification support but does not implement addCharge.', 'AUTHENTICATION_CONFIGURATION');
    }
    if (!link.partnerApplicationId) {
      throw new LenderIntegrationError('LENDER_SERVICING_BEFORE_CREATE', 'Servicing notifications require a completed CREATE and partner application ID.', 'PERMANENT_VALIDATION');
    }
    if (!event.chargeId) {
      throw new LenderIntegrationError('LENDER_CHARGE_EVENT_MISSING_REF', 'Charge notification event is missing its charge reference.', 'PERMANENT_VALIDATION');
    }

    const charge = await this.prisma.plLoanCharge.findUnique({ where: { id: event.chargeId } });
    if (!charge) {
      throw new LenderIntegrationError('LENDER_CHARGE_MISSING', 'The referenced charge no longer exists.', 'PERMANENT_VALIDATION');
    }

    const context = await this.buildChargeContext(event, application, link, config, charge);
    const result = await adapter.addCharge(context);

    if (!result.acknowledged) {
      throw new LenderIntegrationError('LENDER_CHARGE_NOT_ACKNOWLEDGED', 'Lender did not acknowledge the charge notification.', 'PERMANENT_VALIDATION');
    }

    const completed = await this.prisma.lenderIntegrationOutbox.updateMany({
      where: { id: event.id, status: 'PROCESSING', lockToken: event.lockToken },
      data: { status: 'COMPLETED', processedAt: new Date(), lockedAt: null, lockedBy: null, lockToken: null, leaseExpiresAt: null, lastErrorCode: null, lastErrorMessage: null },
    });
    if (completed.count !== 1) {
      throw new LenderIntegrationError('LENDER_EVENT_LEASE_LOST', 'Event lock was lost during completion.', 'TEMPORARY', true);
    }

    return true;
  }

  private async processChargeWaiverNotify(event: any, application: any, link: any, config: any, adapter: LenderAdapter): Promise<boolean> {
    if (!adapter.waiveCharge) {
      throw new LenderIntegrationError('LENDER_CHARGE_WAIVER_METHOD_MISSING', 'The adapter declares charge-waiver-notification support but does not implement waiveCharge.', 'AUTHENTICATION_CONFIGURATION');
    }
    if (!link.partnerApplicationId) {
      throw new LenderIntegrationError('LENDER_SERVICING_BEFORE_CREATE', 'Servicing notifications require a completed CREATE and partner application ID.', 'PERMANENT_VALIDATION');
    }
    if (!event.chargeWaiverId) {
      throw new LenderIntegrationError('LENDER_CHARGE_WAIVER_EVENT_MISSING_REF', 'Charge waiver notification event is missing its waiver reference.', 'PERMANENT_VALIDATION');
    }

    const waiver = await this.prisma.plLoanChargeWaiver.findUnique({ where: { id: event.chargeWaiverId }, include: { charge: true } });
    if (!waiver) {
      throw new LenderIntegrationError('LENDER_CHARGE_WAIVER_MISSING', 'The referenced charge waiver no longer exists.', 'PERMANENT_VALIDATION');
    }

    const context = await this.buildChargeWaiverContext(event, application, link, config, waiver);
    const result = await adapter.waiveCharge(context);

    if (!result.acknowledged) {
      throw new LenderIntegrationError('LENDER_CHARGE_WAIVER_NOT_ACKNOWLEDGED', 'Lender did not acknowledge the charge waiver notification.', 'PERMANENT_VALIDATION');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.plLoanChargeWaiver.update({ where: { id: waiver.id }, data: { lenderNotifiedAt: new Date() } });

      const completed = await tx.lenderIntegrationOutbox.updateMany({
        where: { id: event.id, status: 'PROCESSING', lockToken: event.lockToken },
        data: { status: 'COMPLETED', processedAt: new Date(), lockedAt: null, lockedBy: null, lockToken: null, leaseExpiresAt: null, lastErrorCode: null, lastErrorMessage: null },
      });
      if (completed.count !== 1) {
        throw new LenderIntegrationError('LENDER_EVENT_LEASE_LOST', 'Event lock was lost during completion.', 'TEMPORARY', true);
      }
    });

    return true;
  }

  private async buildUpdateContext(
  event: any,
  application: any,
  config: any,
): Promise<LenderUpdateApplicationContext> {
  const readiness =
    await this.outbox
      .getUpdateReadiness(
        application.id,
      );

  if (!readiness.ready) {
    throw new LenderIntegrationError(
      'LENDER_UPDATE_CONTEXT_INCOMPLETE',
      readiness.reasons.join(','),
      'PERMANENT_VALIDATION',
    );
  }

  const canonical =
    readiness.application;

  const customer =
    canonical.customer;

  const employment =
    canonical
      .employmentSnapshot!;

  const kyc =
    canonical.kycSnapshot!;

  const liveness =
    canonical.liveness!;

  const photo =
    liveness.photoDocument!;

  const permanent =
    readiness.permanent!;

  const current =
    readiness.current!;

  const bankVerification =
    await this.prisma
      .plBankVerification
      .findFirst({
        where: {
          applicationId: canonical.id,
          status: 'VERIFIED',
        },
        orderBy: { verifiedAt: 'desc' },
      });

  const mandate =
    await this.prisma
      .plLoanMandate
      .findFirst({
        where: {
          loan: { applicationId: canonical.id },
          status: 'AUTHORIZED',
        },
        orderBy: { authorizedAt: 'desc' },
      });

  const mapAddress =
    (address: any) => ({
      addressLine1:
        address.addressLine1,

      addressLine2:
        address.addressLine2,

      landmark:
        address.landmark,

      locality:
        address.locality,

      district:
        address.district,

      city:
        address.city,

      state:
        address.state,

      country:
        address.country,

      pincode:
        address.pincode,

      source:
        address.source,
    });

  return {
    idempotencyKey:
      event.idempotencyKey,

    correlationId:
      randomUUID(),

    payloadVersion:
      event.payloadVersion,

    transport:
      this.transport(config),

    partnerApplicationId:
      canonical
        .lenderApplicationLink!
        .partnerApplicationId!,

    applicationReference:
      canonical
        .applicationNumber,

    platformLan:
      canonical.platformLan!,

    customer: {
      fullName:
        customer.fullName!,

      firstName:
        customer.firstName!,

      middleName:
        customer.middleName,

      lastName:
        customer.lastName!,

      fatherName:
        customer.fatherName!,

      panNumber:
        customer.panNumber!,

      dateOfBirth:
        customer.dateOfBirth!
          .toISOString()
          .slice(0, 10),

      gender:
        customer.gender,

      mobileNumber:
        customer.mobileNumber,

      email:
        customer.email,
    },

    employment: {
      employmentType:
        employment
          .employmentType,

      companyType:
        employment.companyType,

      companyName:
        employment.companyName,

      designation:
        employment.designation,

      businessName:
        employment.businessName,

      businessConstitution:
        employment
          .businessConstitution,

      monthlyIncome:
        employment
          .monthlyIncome
          .toString(),

      annualTurnover:
        employment
          .annualTurnover
          ?.toString() ??
        null,

      employmentVintage:
        employment
          .employmentVintage,

      businessVintage:
        employment
          .businessVintage,

      salaryMode:
        employment.salaryMode,

      completedAt:
        employment
          .completedAt
          .toISOString(),
    },

    aadhaarKyc: {
      status:
        'VERIFIED',

      maskedAadhaar:
        kyc.maskedAadhaar!,

      verifiedName:
        kyc.verifiedName!,

      dateOfBirth:
        kyc.verifiedDateOfBirth ?? null,

      gender:
        kyc.verifiedGender,

      provider:
        kyc.provider,

      providerReference:
        kyc.providerReference,

      verifiedAt:
        kyc.verifiedAt!
          .toISOString(),
    },

    liveness: {
      provider:
        liveness.provider,

      providerTransactionId:
        liveness
          .providerTransactionId,

      status:
        'VERIFIED',

      score:
        liveness.score
          ?.toString() ??
        null,

      photoDocumentReference:
        photo.id.toString(),

      evidenceReference:
        liveness
          .evidenceReference,

      latitude:
        photo.latitude
          ?.toString() ??
        null,

      longitude:
        photo.longitude
          ?.toString() ??
        null,

      capturedAt:
        (
          photo.capturedAt ??
          photo.uploadedAt
        ).toISOString(),

      verifiedAt:
        liveness.verifiedAt!
          .toISOString(),
    },

    address: {
      permanent:
        mapAddress(
          permanent,
        ),

      current:
        mapAddress(
          current,
        ),

      currentAddressSameAsPermanent:
        current
          .sameAsPermanent!,
    },

    selectedOffer:
      canonical.selectedAmount && canonical.selectedTenure
        ? {
            amount: canonical.selectedAmount.toString(),
            tenure: canonical.selectedTenure,
            selectedAt: (canonical.selectedAt ?? new Date()).toISOString(),
          }
        : null,

    bankDetails: bankVerification
      ? {
          accountHolderName: bankVerification.accountHolderName,
          accountNumber: decryptBankAccountNumber(bankVerification.accountNumberEncrypted),
          accountNumberMasked: bankVerification.accountNumberMasked,
          ifscCode: bankVerification.ifscCode,
          bankName: bankVerification.bankName || '',
          accountType: bankVerification.accountType,
          verifiedAt: (bankVerification.verifiedAt ?? bankVerification.updatedAt).toISOString(),
        }
      : null,

    mandate: mandate?.umrn
      ? {
          umrn: mandate.umrn,
          provider: mandate.provider,
          mandateType: mandate.mandateType,
          authorizedAt: (mandate.authorizedAt ?? mandate.updatedAt).toISOString(),
        }
      : null,
  };
}

  private async processDocument(
  event: any,
  application: any,
  link: any,
  config: any,
  adapter: LenderAdapter,
): Promise<boolean> {
  if (
    !adapter.capabilities
      .documentUpload ||
    !adapter.uploadDocument
  ) {
    throw new LenderIntegrationError(
      'LENDER_DOCUMENT_UNSUPPORTED',
      'The selected lender adapter does not support document upload.',
      'PERMANENT_VALIDATION',
    );
  }

  if (!event.documentTransferId) {
    throw new LenderIntegrationError(
      'LENDER_DOCUMENT_TRANSFER_ID_MISSING',
      'Document transfer ID is missing from the outbox event.',
      'PERMANENT_VALIDATION',
    );
  }

  const transfer =
    await this.prisma
      .lenderDocumentTransfer
      .findUnique({
        where: {
          id:
            event.documentTransferId,
        },

        include: {
          sourceDocument:
            true,
        },
      });

  if (!transfer) {
    throw new LenderIntegrationError(
      'LENDER_DOCUMENT_TRANSFER_NOT_FOUND',
      'Document transfer was not found.',
      'PERMANENT_VALIDATION',
    );
  }

  if (
    transfer.applicationId !==
      application.id ||
    transfer
      .lenderApplicationLinkId !==
      link.id
  ) {
    throw new LenderIntegrationError(
      'LENDER_DOCUMENT_TRANSFER_OWNERSHIP_MISMATCH',
      'Document transfer does not belong to the current application.',
      'PERMANENT_VALIDATION',
    );
  }

  if (
    transfer.transferStatus ===
      'ACKNOWLEDGED' ||
    transfer.transferStatus ===
      'SKIPPED'
  ) {
    return false;
  }

  const document =
    transfer.sourceDocument;

  if (
    document.applicationId !== application.id ||
    document.customerId !== application.customerId ||
    document.status !== 'VERIFIED' ||
    document.applicantType !== 'BORROWER' ||
    document.documentType !== 'AADHAAR_CARD'
  ) {
    throw new LenderIntegrationError(
      'LENDER_DOCUMENT_OWNERSHIP_MISMATCH',
      'Source document is not a verified borrower Aadhaar document for this application.',
      'PERMANENT_VALIDATION',
    );
  }

  const mimeType = document.mimeType.trim().toLowerCase();
  if (transfer.documentType === 'AADHAAR_XML' && mimeType !== 'application/xml' && mimeType !== 'text/xml') {
    throw new LenderIntegrationError('LENDER_DOCUMENT_MIME_MISMATCH', 'AADHAAR_XML requires XML mime type', 'PERMANENT_VALIDATION');
  }
  if (transfer.documentType === 'AADHAAR_PDF' && mimeType !== 'application/pdf') {
    throw new LenderIntegrationError('LENDER_DOCUMENT_MIME_MISMATCH', 'AADHAAR_PDF requires PDF mime type', 'PERMANENT_VALIDATION');
  }

  if (
    !application.platformLan ||
    !link.partnerApplicationId
  ) {
    throw new LenderIntegrationError(
      'LENDER_DOCUMENT_APPLICATION_CONTEXT_MISSING',
      'Platform LAN or partner application ID is missing.',
      'PERMANENT_VALIDATION',
    );
  }

  await this.prisma
    .lenderDocumentTransfer
    .update({
      where: {
        id: transfer.id,
      },

      data: {
        transferStatus:
          'PROCESSING',

        lastErrorCode:
          null,

        lastErrorMessage:
          null,
      },
    });

  try {
    const file =
      await this.documentFiles
        .loadDocument({
          filePath:
            document.filePath,

          declaredMimeType:
            document.mimeType,
        });

    const context:
      LenderDocumentUploadContext = {
      idempotencyKey:
        event.idempotencyKey,

      correlationId:
        randomUUID(),

      payloadVersion:
        event.payloadVersion,

      transport:
        this.transport(config),

      partnerApplicationId:
        link.partnerApplicationId,

      applicationReference:
        application
          .applicationNumber,

      platformLan:
        application.platformLan,

      documentType:
        transfer.documentType as
          LenderDocumentUploadContext[
            'documentType'
          ],

      sourceDocumentId:
        document.id.toString(),

      fileName:
        document
          .originalFileName ??
        document.fileName,

      mimeType:
        file.mimeType,

      fileSize:
        file.fileSize,

      fileSha256:
        file.fileSha256,

      contentBase64:
        file.contentBase64,

      source:
        document.source,

      capturedAt:
        (
          document.capturedAt ??
          document.uploadedAt
        ).toISOString(),
    };

    const result =
      await adapter
        .uploadDocument(
          context,
        );

    if (!result.acknowledged) {
      throw new LenderIntegrationError(
        'LENDER_DOCUMENT_NOT_ACKNOWLEDGED',
        'Lender document upload was not acknowledged.',
        'PERMANENT_VALIDATION',
      );
    }

    await this.prisma
      .$transaction(
        async (tx) => {
          await tx
            .lenderDocumentTransfer
            .update({
              where: {
                id: transfer.id,
              },

              data: {
                transferStatus:
                  'ACKNOWLEDGED',

                sourceFileSha256:
                  file.fileSha256,

                sourceFileSize:
                  file.fileSize,

                sourceMimeType:
                  file.mimeType,

                partnerDocumentId:
                  result
                    .partnerDocumentId,

                providerStatus:
                  result
                    .providerStatus,

                acknowledgedAt:
                  new Date(
                    result
                      .acknowledgedAt,
                  ),

                lastErrorCode:
                  null,

                lastErrorMessage:
                  null,
              },
            });

          const _result = await tx
            .lenderIntegrationOutbox
            .updateMany({
              where: {
                id: event.id,
                status: 'PROCESSING',
                lockToken: event.lockToken,
              },
              data: {
                status:
                  'COMPLETED',

                processedAt:
                  new Date(),

                lockedAt:
                  null,

                lockedBy:
                  null,

                lockToken:
                  null,

                leaseExpiresAt:
                  null,

                lastErrorCode:
                  null,

                lastErrorMessage:
                  null,
              },
            });
          if (_result.count !== 1) {
            throw new LenderIntegrationError(
              'LENDER_EVENT_LEASE_LOST',
              'Event lock was lost during completion.',
              'TEMPORARY',
              true
            );
          }
        },
      );

    return true;
  } catch (error) {
    const normalized =
      error instanceof
        LenderIntegrationError
        ? error
        : new LenderIntegrationError(
            'LENDER_DOCUMENT_PROCESSING_FAILED',
            'Document processing failed.',
            'UNKNOWN',
          );

    await this.prisma
      .lenderDocumentTransfer
      .update({
        where: {
          id: transfer.id,
        },

        data: {
          transferStatus:
            'FAILED',

          lastErrorCode:
            normalized.code,

          lastErrorMessage:
            normalized.message,
        },
      });

    throw normalized;
  }
}

  private async buildDecisionContext(event: any, application: any, link: any, config: any): Promise<LenderDecisionContext> {
    const product = await this.prisma.lenderProduct.findUnique({ where: { id: application.lenderProductId } });
    const consents = await this.prisma.applicationStageConsent.findMany({ where: { applicationId: application.id, lenderId: application.lenderId, revokedAt: null } });
    const bureau = consents.find((item) => item.consentType === 'BUREAU_ENQUIRY');
    const decision = consents.find((item) => item.consentType === 'LENDER_DECISION_REQUEST');
    const assessment = consents.find((item) => item.consentType === 'LENDER_CREDIT_ASSESSMENT');
    if (!product || !bureau || !decision || !assessment) throw new LenderIntegrationError('LENDER_DECISION_CONSENT_NOT_AVAILABLE', 'Persisted bureau, credit-assessment and decision consent evidence is required.', 'PERMANENT_VALIDATION');
    return {
      idempotencyKey: event.idempotencyKey,
      correlationId: randomUUID(),
      payloadVersion: event.payloadVersion,
      transport: this.transport(config),
      partnerApplicationId: link.partnerApplicationId,
      applicationReference: application.applicationNumber,
      externalProductCode: product.code,
      profileComplete: true,
      bureauConsentReference: bureau.consentTemplateId,
      bureauConsentHash: bureau.consentTextHash,
      lenderDecisionConsentReference: decision.consentTemplateId,
      lenderDecisionConsentHash: decision.consentTextHash,
    };
  }

  private async buildDisburseContext(event: any, application: any, link: any, config: any, loan: any): Promise<LenderDisburseContext> {
    if (!application.platformLan) {
      throw new LenderIntegrationError('PLATFORM_LAN_MISSING', 'Platform LAN is missing.', 'PERMANENT_VALIDATION');
    }
    return {
      idempotencyKey: event.idempotencyKey,
      correlationId: randomUUID(),
      payloadVersion: event.payloadVersion,
      transport: this.transport(config),
      partnerApplicationId: link.partnerApplicationId,
      applicationReference: application.applicationNumber,
      platformLan: application.platformLan,
      // The final accepted amount, never the pre-approval credit limit.
      amount: loan.approvedAmount.toString(),
      triggerFund: true,
    };
  }

  private toDateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private async buildRepaymentContext(event: any, application: any, link: any, config: any, repayment: any): Promise<LenderRepaymentContext> {
    if (!application.platformLan) {
      throw new LenderIntegrationError('PLATFORM_LAN_MISSING', 'Platform LAN is missing.', 'PERMANENT_VALIDATION');
    }
    return {
      idempotencyKey: event.idempotencyKey,
      correlationId: randomUUID(),
      payloadVersion: event.payloadVersion,
      transport: this.transport(config),
      partnerApplicationId: link.partnerApplicationId,
      applicationReference: application.applicationNumber,
      platformLan: application.platformLan,
      amount: repayment.amountReceived.toString(),
      paymentDate: this.toDateOnly(repayment.paymentDate),
      paymentId: repayment.paymentId,
      paymentMode: repayment.paymentMode,
      utr: repayment.referenceNumber || repayment.paymentId,
    };
  }

  private async buildChargeContext(event: any, application: any, link: any, config: any, charge: any): Promise<LenderChargeContext> {
    if (!application.platformLan) {
      throw new LenderIntegrationError('PLATFORM_LAN_MISSING', 'Platform LAN is missing.', 'PERMANENT_VALIDATION');
    }
    if (!charge.dueDate) {
      throw new LenderIntegrationError('LENDER_CHARGE_DUE_DATE_MISSING', 'The charge has no due date to report to the lender.', 'PERMANENT_VALIDATION');
    }
    return {
      idempotencyKey: event.idempotencyKey,
      correlationId: randomUUID(),
      payloadVersion: event.payloadVersion,
      transport: this.transport(config),
      partnerApplicationId: link.partnerApplicationId,
      applicationReference: application.applicationNumber,
      platformLan: application.platformLan,
      chargeType: charge.chargeType,
      amount: charge.amount.toString(),
      dueDate: this.toDateOnly(charge.dueDate),
      remarks: charge.description,
    };
  }

  private async buildChargeWaiverContext(event: any, application: any, link: any, config: any, waiver: any): Promise<LenderChargeWaiverContext> {
    if (!application.platformLan) {
      throw new LenderIntegrationError('PLATFORM_LAN_MISSING', 'Platform LAN is missing.', 'PERMANENT_VALIDATION');
    }
    return {
      idempotencyKey: event.idempotencyKey,
      correlationId: randomUUID(),
      payloadVersion: event.payloadVersion,
      transport: this.transport(config),
      partnerApplicationId: link.partnerApplicationId,
      applicationReference: application.applicationNumber,
      platformLan: application.platformLan,
      chargeType: waiver.charge.chargeType,
      waiverAmount: waiver.waiverAmount.toString(),
    };
  }

  private async buildStatusContext(event: any, application: any, link: any, config: any): Promise<LenderStatusContext> {
    return { idempotencyKey: event.idempotencyKey, correlationId: randomUUID(), payloadVersion: event.payloadVersion, transport: this.transport(config), partnerApplicationId: link.partnerApplicationId, applicationReference: application.applicationNumber };
  }

  private async buildCreateContext(
  event: any,
  application: any,
  config: any,
): Promise<LenderCreateApplicationContext> {
  const product =
    await this.prisma
      .lenderProduct
      .findUnique({
        where: {
          id:
            application
              .lenderProductId,
        },
      });

  const productVersion =
    await this.prisma
      .lenderProductVersion
      .findUnique({
        where: {
          id:
            application
              .productStrategyVersionId,
        },
      });

  const payment =
    await this.prisma
      .plPaymentLink
      .findFirst({
        where: {
          applicationId:
            application.id,

          purpose:
            'ASSESSMENT_FEE',

          status:
            'SUCCESS',
        },

        orderBy: {
          paidAt:
            'desc',
        },
      });

  const consent =
    await this.prisma
      .lenderDataSharingConsent
      .findFirst({
        where: {
          applicationId:
            application.id,

          lenderId:
            application.lenderId,

          revokedAt:
            null,
        },

        orderBy: {
          acceptedAt:
            'desc',
        },
      });

  if (
    !product ||
    product.lenderId !==
      application.lenderId
  ) {
    throw new LenderIntegrationError(
      'LENDER_PRODUCT_MISMATCH',
      'Allocated lender product is invalid.',
      'PERMANENT_VALIDATION',
    );
  }

  if (!payment?.paidAt) {
    throw new LenderIntegrationError(
      'ASSESSMENT_PAYMENT_MISSING',
      'Verified assessment-fee payment is missing.',
      'PERMANENT_VALIDATION',
    );
  }

  if (!consent) {
    throw new LenderIntegrationError(
      'LENDER_CONSENT_MISSING',
      'Lender data-sharing consent is missing.',
      'PERMANENT_VALIDATION',
    );
  }

  if (!application.platformLan) {
    throw new LenderIntegrationError(
      'PLATFORM_LAN_MISSING',
      'Platform LAN is missing.',
      'PERMANENT_VALIDATION',
    );
  }

  const customer =
    application.customer;

  // Scoped to this SAME lender (not the customer's whole cross-lender history) — the
  // lender's own new-vs-repeat credit-limit determination is about their relationship
  // with this customer specifically, matching this product's repeatTierScope semantics.
  const previousLoanWithLender =
    await this.prisma
      .plLoan
      .findFirst({
        where: {
          customerId:
            application.customerId,
          status: {
            in: ['DISBURSED', 'FULLY_PAID'],
          },
          application: {
            lenderId:
              application.lenderId,
          },
        },
        orderBy: { id: 'desc' },
      });

  const previousDisbursedApplicationCount =
    await this.prisma
      .plLoan
      .count({
        where: {
          customerId:
            application.customerId,
          status: {
            in: ['DISBURSED', 'FULLY_PAID'],
          },
          application: {
            lenderId:
              application.lenderId,
          },
        },
      });

  return {
    idempotencyKey:
      event.idempotencyKey,

    correlationId:
      randomUUID(),

    payloadVersion:
      event.payloadVersion,

    transport:
      this.transport(config),

    application: {
      applicationId:
        application.id.toString(),

      applicationReference:
        application
          .applicationNumber,

      platformLan:
        application.platformLan,

      platformProductId:
        application
          .platformProductId,

      requestedAmount:
        application
          .requestedAmount
          ?.toString() ??
        null,

      requestedTenure:
        application.requestedTenure ??
        null,

      tenureType:
        productVersion?.tenureType ??
        null,

      interestRate:
        productVersion?.annualRoiPercent
          ?.toString() ??
        null,

      processingFeePercent:
        productVersion?.processingFeePercent
          ?.toString() ??
        null,

      scopeCode:
        application.scopeCode,

      previousDisbursedApplicationCount,

      previousLoanAmount:
        previousLoanWithLender?.approvedAmount
          ?.toString() ??
        null,
    },

    allocation: {
      lenderId:
        application.lenderId,

      lenderProductId:
        application
          .lenderProductId,

      productStrategyVersionId:
        application
          .productStrategyVersionId,

      externalProductCode:
        product.code,

      allocatedAt:
        application
          .allocatedAt
          .toISOString(),
    },

    customer: {
      fullName:
        customer.fullName,

      firstName:
        customer.firstName,

      middleName:
        customer.middleName,

      lastName:
        customer.lastName,

      fatherName:
        customer.fatherName,

      mobileNumber:
        customer.mobileNumber,

      email:
        customer.email,

      dateOfBirth:
        customer.dateOfBirth
          ?.toISOString()
          .slice(0, 10) ??
        null,

      gender:
        customer.gender,

      panNumber:
        customer.panNumber,

      panVerified:
        customer.panVerified,

      panVerifiedAt:
        customer.panVerifiedAt
          ?.toISOString() ??
        null,

      panProviderReference:
        customer
          .panProviderApplicationId,
    },
  };
}

  private transport(
  config: any,
): LenderIntegrationTransportConfig {
  return {
    lenderId:
      config.lenderId,

    baseUrl:
      config.baseUrl,

    authType:
      config.authType,

    clientId:
      config.clientId,

    credentialSecretReference:
      config
        .credentialSecretReference,

    createApplicationPath:
      config
        .createApplicationPath,

    consentPath:
      config.consentPath,

    updateApplicationPath:
      config
        .updateApplicationPath,

    decisionPath:
      config.decisionPath,

    statusPath:
      config.statusPath,

    documentUploadPath:
      config
        .documentUploadPath,

    disbursePath:
      config.disbursePath,

    repaymentPath:
      config.repaymentPath,

    chargePath:
      config.chargePath,

    chargeWaiverPath:
      config.chargeWaiverPath,

    connectTimeoutMs:
      config.connectTimeoutMs,

    requestTimeoutMs:
      config.requestTimeoutMs,
  };
}

  private verifyEventAllocation(event: any, application: any): void {
    if (event.applicationReference !== application.applicationNumber || event.lenderId !== application.lenderId || !application.lenderProductId || !application.productStrategyVersionId || !application.allocatedAt || !application.mlmAllocationDecisionId) {
      throw new LenderIntegrationError('LENDER_EVENT_ALLOCATION_MISMATCH', 'Outbox event does not match the immutable application allocation.', 'PERMANENT_VALIDATION');
    }
  }

  private verifyLinkAllocation(link: any, application: any): void {
    if (link.applicationReference !== application.applicationNumber || link.lenderId !== application.lenderId || link.lenderProductId !== application.lenderProductId || link.productStrategyVersionId !== application.productStrategyVersionId) {
      throw new LenderIntegrationError('LENDER_LINK_ALLOCATION_MISMATCH', 'Lender application link conflicts with the immutable MLM allocation.', 'PERMANENT_VALIDATION');
    }
  }

  private hash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
}
