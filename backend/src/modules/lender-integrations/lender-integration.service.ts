import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { LenderIntegrationOperationStatus } from '@prisma/client';

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
  LenderConsentContext,
  LenderCreateApplicationContext,
  LenderDecisionContext,
  LenderDocumentCandidate,
  LenderDocumentUploadContext,
  LenderIntegrationTransportConfig,
  LenderStatusContext,
  LenderUpdateApplicationContext,
} from './lender-integration.types';

import {
  LenderIntegrationOutboxService,
} from './lender-integration-outbox.service';

@Injectable()
export class LenderIntegrationService {
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
  const event =
    await this.prisma
      .lenderIntegrationOutbox
      .findFirst({
        where: {
          id: eventId,
          status: 'PROCESSING',
          lockToken,
        },
      });

  if (!event) {
    return;
  }

  if (
    event.integrationStage ===
      'DOCUMENT' &&
    event.documentTransferId
  ) {
    await this.prisma
      .lenderDocumentTransfer
      .updateMany({
        where: {
          id:
            event.documentTransferId,
        },

        data: {
          transferStatus:
            retrying
              ? 'PENDING'
              : 'FAILED',

          lastErrorCode:
            error.code,

          lastErrorMessage:
            error.message,
        },
      });

    return;
  }

  const status = (
    retrying ? 'RETRY_PENDING' : 'FAILED'
  ) as LenderIntegrationOperationStatus;

  const data =
    event.integrationStage ===
      'CREATE'
      ? {
          createStatus:
            status,
        }
      : event.integrationStage ===
          'CONSENT'
        ? {
            consentStatus:
              status,
          }
        : event.integrationStage ===
            'UPDATE'
          ? {
              updateStatus:
                status,
            }
          : {
              decisionStatus:
                status,
            };

  await this.prisma
    .lenderApplicationLink
    .updateMany({
      where: {
        applicationId:
          event.applicationId,
      },

      data: {
        ...data,

        lastAttemptAt:
          new Date(),

        lastErrorCode:
          error.code,

        lastErrorMessage:
          error.message,
      },
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
            },

            update: {},
          });
      },
    );

  return true;
}

  private async processConsent(
  event: any,
  application: any,
  link: any,
  config: any,
  adapter: LenderAdapter,
): Promise<boolean> {
  if (
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
        consentStatus:
          'PROCESSING',

        consentIdempotencyKey:
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
              consentStatus:
                'COMPLETED',

              lastSyncedStage:
                'CONSENT',

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
  const consent =
    await this.prisma
      .lenderDataSharingConsent
      .findFirst({
        where: {
          applicationId:
            application.id,

          customerId:
            application.customerId,

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

  if (!consent) {
    throw new LenderIntegrationError(
      'LENDER_CONSENT_MISSING',
      'Valid lender data-sharing consent was not found.',
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

    consentType:
      'LENDER_DATA_SHARING',

    consentTemplateId:
      consent
        .consentTemplateId,

    consentVersion:
      consent
        .consentVersion,

    consentTextHash:
      consent
        .consentTextHash,

    consentReference:
      consent
        .consentReference,

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
      .includes(link.updateStatus)
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

  if (
    adapter.capabilities
      .decisionRequest
  ) {
    await this.outbox
      .enqueueDecisionWhenReady(
        application.id,
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
      await this.decisions.process(event.id, lockToken, link.partnerApplicationId, result);
      return;
    }
    const context = await this.buildDecisionContext(event, application, link, config);
    await this.prisma.lenderApplicationLink.update({ where: { id: link.id }, data: { decisionStatus: 'PROCESSING', decisionIdempotencyKey: event.idempotencyKey, lastAttemptAt: new Date(), lastRequestHash: this.hash(context), lastErrorCode: null, lastErrorMessage: null } });
    const result = await adapter.requestDecision(context);
    await this.decisions.process(event.id, lockToken, link.partnerApplicationId, result);
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
    document.applicationId !==
      application.id ||
    document.customerId !==
      application.customerId ||
    document.status !==
      'VERIFIED'
  ) {
    throw new LenderIntegrationError(
      'LENDER_DOCUMENT_OWNERSHIP_MISMATCH',
      'Source document is not a verified document for this application.',
      'PERMANENT_VALIDATION',
    );
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
    return { idempotencyKey: event.idempotencyKey, correlationId: randomUUID(), payloadVersion: event.payloadVersion, transport: this.transport(config), partnerApplicationId: link.partnerApplicationId, applicationReference: application.applicationNumber, externalProductCode: product.code, profileComplete: true, bureauConsentReference: bureau.consentTemplateId, bureauConsentHash: bureau.consentTextHash, lenderDecisionConsentReference: decision.consentTemplateId, lenderDecisionConsentHash: decision.consentTextHash };
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

      scopeCode:
        application.scopeCode,
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
