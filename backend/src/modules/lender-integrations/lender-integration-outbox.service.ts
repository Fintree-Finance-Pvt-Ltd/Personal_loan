import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { ApplicationConsentType, Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  CONSENT_CATALOGUE,
  canSubmitConsentToLender,
  consentTextFor,
  hashConsentText,
  isConsentEvidenceIntact,
} from './consent-catalogue';

type TransactionClient = Prisma.TransactionClient;

import { LenderAdapterRegistry } from './lender-adapter.registry';

@Injectable()
export class LenderIntegrationOutboxService {
  private readonly logger = new Logger(LenderIntegrationOutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapters: LenderAdapterRegistry,
  ) {}

  /**
   * Records one journey consent as evidence and queues it for submission to the lender.
   *
   * This is the single entry point for every consent point — live photo, Aadhaar KYC,
   * data sharing, Account Aggregator and the three decision consents. The wording and
   * version come from CONSENT_CATALOGUE rather than the caller, so a consent can never be
   * stored with text that differs from what the customer was shown.
   *
   * Deliberately tolerant: consent capture must never break the step that triggers it. If
   * no lender is allocated yet (an auto-created DRAFT application, say) it records nothing
   * and returns null rather than throwing.
   */
  async recordJourneyConsent(input: {
    applicationId: bigint;
    consentType: ApplicationConsentType;
    ipAddress?: string | null;
    userAgent?: string | null;
    /** Skip queueing a lender submission — used when the caller enqueues in bulk itself. */
    deferSubmission?: boolean;
  }) {
    const application = await this.prisma.plApplication.findUnique({
      where: { id: input.applicationId },
      select: { id: true, customerId: true, applicationNumber: true, lenderId: true },
    });
    if (!application?.lenderId) {
      this.logger.warn(
        `Skipping ${input.consentType} consent for application ${input.applicationId}: no lender allocated yet.`,
      );
      return null;
    }

    const lender = await this.prisma.lender.findUnique({
      where: { id: application.lenderId },
      select: { displayName: true },
    });
    if (!lender) return null;

    const definition = CONSENT_CATALOGUE[input.consentType];
    const consentText = consentTextFor(input.consentType, lender.displayName);
    const consentTextHash = hashConsentText(consentText);

    const stageConsent = await this.prisma.applicationStageConsent.upsert({
      where: {
        applicationId_lenderId_consentType_consentVersion: {
          applicationId: application.id,
          lenderId: application.lenderId,
          consentType: input.consentType,
          consentVersion: definition.version,
        },
      },
      create: {
        applicationId: application.id,
        lenderId: application.lenderId,
        consentType: input.consentType,
        consentTemplateId: definition.templateId,
        consentVersion: definition.version,
        consentText,
        consentTextHash,
        acceptedAt: new Date(),
        ipAddress: input.ipAddress?.slice(0, 64),
        userAgent: input.userAgent?.slice(0, 512),
      },
      // Re-consenting is a no-op: the first acceptance is the evidence, and overwriting
      // acceptedAt would destroy the record of when consent was actually given.
      update: {},
    });

    // The consent itself is now durably recorded. Queueing its forwarding is best-effort:
    // if it fails the evidence still stands, and the next consent recorded (or a CREATE
    // completion) queues it again.
    if (!input.deferSubmission) {
      try {
        await this.enqueueConsentSubmissions(application.id);
      } catch (error: any) {
        this.logger.error(
          `Recorded ${input.consentType} consent but could not queue its submission: ${error?.message}`,
        );
      }
    }
    return stageConsent;
  }

  /**
   * Queues a CONSENT-stage outbox event for every recorded consent that has not been sent
   * yet. Safe to call repeatedly — each consent type gets its own idempotency key, so
   * re-running only ever adds the newly recorded ones.
   *
   * Consents accumulate across the journey (Account Aggregator lands well after CREATE),
   * so this runs both when CREATE completes and whenever a new consent is recorded.
   */
  async enqueueConsentSubmissions(applicationId: bigint) {
    const application = await this.prisma.plApplication.findUnique({
      where: { id: applicationId },
      select: { id: true, applicationNumber: true, lenderId: true },
    });
    if (!application?.lenderId) return [];

    // Nothing can be submitted before CREATE has returned a partnerApplicationId — the
    // lender's consent endpoint is addressed by it. Those consents stay queued and go out
    // when CREATE completes, which calls this method again.
    const link = await this.prisma.lenderApplicationLink.findUnique({
      where: { applicationId },
      select: { partnerApplicationId: true, createStatus: true },
    });
    if (!link?.partnerApplicationId || !['ACKNOWLEDGED', 'COMPLETED'].includes(link.createStatus)) {
      return [];
    }

    const consents = await this.prisma.applicationStageConsent.findMany({
      where: { applicationId, lenderId: application.lenderId, revokedAt: null },
    });

    const events = [];
    for (const consent of consents) {
      // Recording and forwarding are separate: consents the lender cannot yet accept stay
      // stored as evidence and are queued later, rather than failing against their API.
      if (!canSubmitConsentToLender(consent.consentType)) continue;
      // A consent whose text no longer hashes to its stored hash is not evidence and must
      // not be forwarded as though it were.
      if (!isConsentEvidenceIntact(consent)) {
        this.logger.error(
          `Refusing to submit tampered ${consent.consentType} consent for application ${application.applicationNumber}.`,
        );
        continue;
      }
      const idempotencyKey = `${application.applicationNumber}:LENDER_SUBMIT_CONSENT:${consent.consentType}:V1`;
      events.push(
        await this.prisma.lenderIntegrationOutbox.upsert({
          where: { idempotencyKey },
          create: {
            eventType: 'LENDER_SUBMIT_CONSENT',
            applicationId: application.id,
            applicationReference: application.applicationNumber,
            lenderId: application.lenderId,
            integrationStage: 'CONSENT',
            consentType: consent.consentType,
            payloadVersion: 1,
            idempotencyKey,
          },
          update: {},
        }),
      );
    }
    return events;
  }

  async recordDataSharingConsent(input: {
    customerId: bigint;
    applicationId: bigint;
    consentTemplateId?: string;
    consentVersion?: string;
    consentText?: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    const application = await this.prisma.plApplication.findFirst({
      where: { id: input.applicationId, customerId: input.customerId },
      select: { id: true, customerId: true, lenderId: true, mlmAllocationDecisionId: true },
    });
    if (!application?.lenderId || !application.mlmAllocationDecisionId) {
      throw new BadRequestException('A completed lender allocation is required before consent.');
    }
    const lenderId = application.lenderId;
    const lender = await this.prisma.lender.findUnique({ where: { id: lenderId } });
    if (!lender) throw new BadRequestException('Allocated lender was not found.');
    // Definition comes from the catalogue so this stays in lockstep with every other
    // consent point; the env overrides are kept for the two values that were already
    // deployment-configurable.
    const definition = CONSENT_CATALOGUE.DATA_SHARING;
    const consentTemplateId = process.env.LENDER_DATA_SHARING_CONSENT_TEMPLATE_ID || definition.templateId;
    const consentVersion = process.env.LENDER_DATA_SHARING_CONSENT_VERSION || definition.version;
    const consentReference = process.env.LENDER_DATA_SHARING_CONSENT_REFERENCE || 'CUSTOMER_LENDER_DATA_SHARING';
    const consentText = consentTextFor('DATA_SHARING', lender.displayName);
    if (input.consentTemplateId !== consentTemplateId || input.consentVersion !== consentVersion || input.consentText !== consentText) {
      throw new BadRequestException('The lender data-sharing consent text or version is invalid.');
    }
    const consentTextHash = hashConsentText(consentText);
    const acceptedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      let consent = await tx.lenderDataSharingConsent.findUnique({
        where: { applicationId_lenderId_consentVersion: { applicationId: application.id, lenderId, consentVersion } },
      });
      if (consent) {
        if (consent.revokedAt) {
          throw new BadRequestException('Consent was revoked and cannot be overwritten.');
        }
      } else {
        consent = await tx.lenderDataSharingConsent.create({
          data: { applicationId: application.id, customerId: application.customerId, lenderId, consentTemplateId, consentVersion, consentText, consentTextHash, consentReference, acceptedAt, ipAddress: input.ipAddress?.slice(0, 64), userAgent: input.userAgent?.slice(0, 512) },
        });
      }

      let stageConsent = await tx.applicationStageConsent.findUnique({
        where: { applicationId_lenderId_consentType_consentVersion: { applicationId: application.id, lenderId, consentType: 'DATA_SHARING', consentVersion } },
      });
      if (stageConsent) {
        if (stageConsent.revokedAt) {
          throw new BadRequestException('Stage consent was revoked and cannot be overwritten.');
        }
      } else {
        stageConsent = await tx.applicationStageConsent.create({
          data: { applicationId: application.id, lenderId, consentType: 'DATA_SHARING', consentTemplateId, consentVersion, consentText, consentTextHash, acceptedAt, ipAddress: input.ipAddress?.slice(0, 64), userAgent: input.userAgent?.slice(0, 512) },
        });
      }
      return consent;
    });
  }

  async assertValidDataSharingConsent(applicationId: bigint) {
    const consent = await this.prisma.lenderDataSharingConsent.findFirst({ where: { applicationId, revokedAt: null }, orderBy: { acceptedAt: 'desc' } });
    if (!consent || createHash('sha256').update(consent.consentText, 'utf8').digest('hex') !== consent.consentTextHash) {
      throw new BadRequestException('Valid lender data-sharing consent evidence is required.');
    }
    return consent;
  }

  async enqueueCreateAfterVerifiedPayment(tx: TransactionClient, applicationId: bigint) {
    const application = await tx.plApplication.findUnique({ where: { id: applicationId } });
    if (!application) throw new BadRequestException('Canonical application was not found.');
    if (application.status !== 'ASSESSMENT_FEE_PAID') throw new BadRequestException('Assessment fee must be paid before lender submission.');
    if (!application.mlmAllocationDecisionId || !application.lenderId || !application.lenderProductId || !application.productStrategyVersionId) {
      throw new BadRequestException('Completed MLM allocation evidence is required before lender submission.');
    }
    const allocation = await tx.mlmAllocationDecision.findUnique({ where: { id: application.mlmAllocationDecisionId } });
    if (!allocation || allocation.status !== 'ASSIGNED' || allocation.lenderId !== application.lenderId || allocation.productId !== application.lenderProductId || allocation.productVersionId !== application.productStrategyVersionId) {
      throw new BadRequestException('Persisted lender allocation does not match the canonical application.');
    }
    const payment = await tx.plPaymentLink.findFirst({
      where: { applicationId: application.id, purpose: 'ASSESSMENT_FEE', status: 'SUCCESS' },
      orderBy: { paidAt: 'desc' },
      select: { id: true },
    });
    if (!payment) throw new BadRequestException('Verified assessment-fee payment evidence is missing.');
    const consent = await tx.lenderDataSharingConsent.findFirst({
      where: { applicationId: application.id, lenderId: application.lenderId, revokedAt: null },
      orderBy: { acceptedAt: 'desc' },
      select: { id: true, consentText: true, consentTextHash: true },
    });
    if (!consent || createHash('sha256').update(consent.consentText, 'utf8').digest('hex') !== consent.consentTextHash) throw new BadRequestException('Lender data-sharing consent evidence is missing or invalid.');
    const existingLink = await tx.lenderApplicationLink.findUnique({ where: { applicationId: application.id } });
    if (existingLink && (existingLink.lenderId !== application.lenderId || existingLink.lenderProductId !== application.lenderProductId || existingLink.productStrategyVersionId !== application.productStrategyVersionId)) {
      throw new BadRequestException('Existing lender application link conflicts with the immutable MLM allocation.');
    }
    const idempotencyKey = `${application.applicationNumber}:LENDER_CREATE_APPLICATION:V1`;
    
    let platformLan =
  application.platformLan;

if (!platformLan) {
  const generatedLan =
    `FTPL${application.id
      .toString()
      .padStart(8, '0')}`;

  await tx.plApplication
    .updateMany({
      where: {
        id:
          application.id,

        platformLan:
          null,
      },

      data: {
        platformLan:
          generatedLan,
      },
    });

  const updated =
    await tx.plApplication
      .findUniqueOrThrow({
        where: {
          id:
            application.id,
        },

        select: {
          platformLan:
            true,
        },
      });

  platformLan =
    updated.platformLan;
}

if (!platformLan) {
  throw new BadRequestException(
    'Platform LAN could not be generated.',
  );
}

    return tx.lenderIntegrationOutbox.upsert({
      where: { idempotencyKey },
      create: {
        eventType: 'LENDER_CREATE_APPLICATION',
        applicationId: application.id,
        applicationReference: application.applicationNumber,
        lenderId: application.lenderId,
        integrationStage: 'CREATE',
        payloadVersion: 1,
        idempotencyKey,
      },
      update: {},
    });
  }

  async enqueueStage(input: { applicationId: bigint; stage: 'UPDATE' | 'DECISION' | 'STATUS'; payloadVersion?: number }) {
    return this.prisma.$transaction(async (tx) => {
      const application = await tx.plApplication.findUnique({ where: { id: input.applicationId } });
      if (!application?.lenderId) throw new BadRequestException('Allocated lender is missing.');
      const version = input.payloadVersion ?? 1;
      const eventType = input.stage === 'UPDATE' ? 'LENDER_UPDATE_APPLICATION' : input.stage === 'DECISION' ? 'LENDER_REQUEST_DECISION' : 'LENDER_STATUS_CHECK';
      const idempotencyKey = `${application.applicationNumber}:${eventType}:V${version}`;
      return tx.lenderIntegrationOutbox.upsert({
        where: { idempotencyKey },
        create: { eventType, applicationId: application.id, applicationReference: application.applicationNumber, lenderId: application.lenderId, integrationStage: input.stage, payloadVersion: version, idempotencyKey },
        update: {},
      });
    });
  }

  async getUpdateReadiness(applicationId: bigint) {
    const application = await this.prisma.plApplication.findUnique({
      where: { id: applicationId },
      include: {
        customer: true,
        lenderApplicationLink: true,
        employmentSnapshot: true,
        kycSnapshot: true,
        addresses: true,
        liveness: { include: { photoDocument: true } },
        stageConsents: true,
      },
    });
    if (!application) throw new BadRequestException('Canonical application was not found.');
    const reasons: string[] = [];
    const link = application.lenderApplicationLink;
    if (!application.platformLan) reasons.push('PLATFORM_LAN_MISSING');
    if (!link || !['ACKNOWLEDGED', 'COMPLETED'].includes(link.createStatus)) reasons.push('CREATE_NOT_COMPLETED');
    if (!link?.partnerApplicationId) reasons.push('PARTNER_APPLICATION_ID_MISSING');
    if (!link || !['ACKNOWLEDGED', 'COMPLETED'].includes(link.consentStatus)) reasons.push('CONSENT_NOT_COMPLETED');
    const employment = application.employmentSnapshot;
    if (!employment?.completedAt) reasons.push('EMPLOYMENT_SNAPSHOT_MISSING');
    if (!employment?.monthlyIncome || Number(employment.monthlyIncome) <= 0) reasons.push('MONTHLY_INCOME_MISSING');
    if (employment?.employmentType === 'SALARIED' && (!employment.companyName || !employment.designation)) reasons.push('SALARIED_DETAILS_INCOMPLETE');
    if (employment?.employmentType === 'SELF_EMPLOYED' && (!employment.businessName || !employment.businessConstitution)) reasons.push('BUSINESS_DETAILS_INCOMPLETE');
    if (!application.liveness || application.liveness.verificationStatus !== 'VERIFIED' || !application.liveness.verifiedAt || !application.liveness.photoDocument) reasons.push('LIVENESS_NOT_VERIFIED');
    if (!application.kycSnapshot || application.kycSnapshot.verificationStatus !== 'VERIFIED' || !application.kycSnapshot.verifiedAt) reasons.push('DIGILOCKER_KYC_NOT_VERIFIED');
    if (!application.kycSnapshot?.verifiedName) reasons.push('AADHAAR_VERIFIED_NAME_MISSING');
    const permanent = application.addresses.find((address) => address.addressType === 'PERMANENT');
    const current = application.addresses.find((address) => address.addressType === 'CURRENT');
    if (!permanent) reasons.push('PERMANENT_ADDRESS_MISSING');
    if (!current) reasons.push('CURRENT_ADDRESS_MISSING');
    if (current && current.sameAsPermanent == null) reasons.push('SAME_ADDRESS_DECISION_MISSING');
    const consent = application.stageConsents.find((item) => item.consentType === 'DATA_SHARING' && !item.revokedAt);
    if (!consent || createHash('sha256').update(consent.consentText, 'utf8').digest('hex') !== consent.consentTextHash) reasons.push('UPDATE_CONSENT_MISSING');
    return { ready: reasons.length === 0, reasons, application, permanent, current };
  }

  async enqueueUpdateWhenReady(applicationId: bigint, version: number = 1) {
    const readiness = await this.getUpdateReadiness(applicationId);
    if (!readiness.ready) return { enqueued: false, readiness: { ready: false, reasons: readiness.reasons } };
    const application = readiness.application;
    const idempotencyKey = `${application.applicationNumber}:LENDER_UPDATE_APPLICATION:V${version}`;
    const event = await this.prisma.$transaction(async (tx) => {
      const created = await tx.lenderIntegrationOutbox.upsert({
        where: { idempotencyKey },
        create: { eventType: 'LENDER_UPDATE_APPLICATION', applicationId, applicationReference: application.applicationNumber, lenderId: application.lenderId!, integrationStage: 'UPDATE', payloadVersion: version, idempotencyKey },
        update: {},
      });
      // Don't regress a stage that already succeeded at this same version — re-saving
      // the same address (or any other trigger of this method) must not undo a
      // completed UPDATE. A higher version (staged offer/bank/mandate push) must still
      // go out even though a lower version already completed.
      const existingLink = await tx.lenderApplicationLink.findUnique({ where: { applicationId }, select: { updateStatus: true, updatePayloadVersion: true } });
      if (!existingLink || !['ACKNOWLEDGED', 'COMPLETED'].includes(existingLink.updateStatus) || existingLink.updatePayloadVersion < version) {
        await tx.lenderApplicationLink.update({ where: { applicationId }, data: { updateStatus: 'PENDING', updateIdempotencyKey: idempotencyKey, updatePayloadVersion: version } });
      }
      return created;
    });
    return { enqueued: true, event, readiness: { ready: true, reasons: [] } };
  }

  async recordDecisionConsents(input: { customerId: bigint; applicationId: bigint; consents: Array<{ consentType: 'BUREAU_ENQUIRY' | 'LENDER_CREDIT_ASSESSMENT' | 'LENDER_DECISION_REQUEST'; consentTemplateId: string; consentVersion: string; consentText: string }>; ipAddress?: string | null; userAgent?: string | null }) {
    const application = await this.prisma.plApplication.findFirst({ where: { id: input.applicationId, customerId: input.customerId } });
    if (!application?.lenderId) throw new BadRequestException('Allocated canonical application was not found.');
    // Definitions come from the catalogue rather than a local copy — the previous inline
    // table was a second source of truth for the same three consents.
    const lender = await this.prisma.lender.findUnique({ where: { id: application.lenderId }, select: { displayName: true } });
    if (!lender) throw new BadRequestException('Allocated lender was not found.');
    const templates = {
      BUREAU_ENQUIRY: { id: CONSENT_CATALOGUE.BUREAU_ENQUIRY.templateId, version: CONSENT_CATALOGUE.BUREAU_ENQUIRY.version, text: consentTextFor('BUREAU_ENQUIRY', lender.displayName) },
      LENDER_CREDIT_ASSESSMENT: { id: CONSENT_CATALOGUE.LENDER_CREDIT_ASSESSMENT.templateId, version: CONSENT_CATALOGUE.LENDER_CREDIT_ASSESSMENT.version, text: consentTextFor('LENDER_CREDIT_ASSESSMENT', lender.displayName) },
      LENDER_DECISION_REQUEST: { id: CONSENT_CATALOGUE.LENDER_DECISION_REQUEST.templateId, version: CONSENT_CATALOGUE.LENDER_DECISION_REQUEST.version, text: consentTextFor('LENDER_DECISION_REQUEST', lender.displayName) },
    } as const;
    if (input.consents.length !== 3) throw new BadRequestException('All lender-decision consents are required.');
    await this.prisma.$transaction(async (tx) => {
      for (const submitted of input.consents) {
        const expected = templates[submitted.consentType];
        if (!expected || submitted.consentTemplateId !== expected.id || submitted.consentVersion !== expected.version || submitted.consentText !== expected.text) throw new BadRequestException(`Invalid ${submitted.consentType} consent evidence.`);
        const consentTextHash = hashConsentText(expected.text);
        let stageConsent = await tx.applicationStageConsent.findUnique({
          where: { applicationId_lenderId_consentType_consentVersion: { applicationId: application.id, lenderId: application.lenderId!, consentType: submitted.consentType, consentVersion: expected.version } },
        });
        if (stageConsent) {
          if (stageConsent.revokedAt) {
            throw new BadRequestException(`${submitted.consentType} consent was revoked and cannot be overwritten.`);
          }
        } else {
          stageConsent = await tx.applicationStageConsent.create({
            data: { applicationId: application.id, lenderId: application.lenderId!, consentType: submitted.consentType, consentTemplateId: expected.id, consentVersion: expected.version, consentText: expected.text, consentTextHash, acceptedAt: new Date(), ipAddress: input.ipAddress?.slice(0, 64), userAgent: input.userAgent?.slice(0, 512) },
          });
        }
      }
    });
    // These three were previously stored but never sent as consent submissions — only
    // bureau and decision rode along inside the DECISION payload, and credit assessment
    // was validated then dropped. They now go to the lender in their own right.
    //
    // Swallowed deliberately: this runs on the customer's Submit Application click. The
    // consents are already durably recorded above, so failing to *queue* their forwarding
    // must not fail the submit — the next consent recorded, or a CREATE completion, queues
    // them again.
    try {
      await this.enqueueConsentSubmissions(application.id);
    } catch (error: any) {
      this.logger.error(
        `Unable to queue consent submissions for application ${application.id}: ${error?.message}`,
      );
    }
    try {
      const event = await this.enqueueDecisionWhenReady(application.id);
      return { enqueued: true, event };
    } catch (error) {
      if (error instanceof BadRequestException && error.message.includes('UPDATE must be acknowledged')) {
        return { enqueued: false, event: null };
      }
      throw error;
    }
  }

  async enqueueDecisionWhenReady(applicationId: bigint, version: number = 1) {
    const application = await this.prisma.plApplication.findUnique({ where: { id: applicationId }, include: { lenderApplicationLink: true, stageConsents: true } });
    if (!application?.lenderId || !application.lenderApplicationLink) throw new BadRequestException('Lender application link is missing.');
    const link = application.lenderApplicationLink;
    if (!['ACKNOWLEDGED', 'COMPLETED'].includes(link.updateStatus)) throw new BadRequestException('Lender UPDATE must be acknowledged before requesting a decision.');
    // A later-generation decision (e.g. the final approval call after offer selection)
    // must not be requested before its own prerequisite UPDATE version has landed.
    if (link.updatePayloadVersion < version) throw new BadRequestException('Lender UPDATE for this stage must be acknowledged before requesting a decision.');

    const config = await this.prisma.lenderIntegrationConfig.findFirst({ where: { lenderId: application.lenderId } });
    if (!config) throw new BadRequestException('Lender integration config not found.');

    const adapter = this.adapters.resolve(config.adapterKey, config.adapterVersion);
    if (!adapter.capabilities.decisionRequest && !adapter.capabilities.statusPolling) {
      throw new BadRequestException('The selected lender adapter does not support decision request or status polling.');
    }
    const required = ['BUREAU_ENQUIRY', 'LENDER_CREDIT_ASSESSMENT', 'LENDER_DECISION_REQUEST'] as const;
    for (const type of required) {
      const consent = application.stageConsents.find((item) => item.consentType === type && !item.revokedAt);
      if (!consent || createHash('sha256').update(consent.consentText, 'utf8').digest('hex') !== consent.consentTextHash) throw new BadRequestException(`${type} consent evidence is missing or invalid.`);
    }
    const idempotencyKey = `${application.applicationNumber}:LENDER_REQUEST_DECISION:V${version}`;
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.lenderIntegrationOutbox.upsert({
        where: { idempotencyKey },
        create: { eventType: 'LENDER_REQUEST_DECISION', applicationId, applicationReference: application.applicationNumber, lenderId: application.lenderId!, integrationStage: 'DECISION', payloadVersion: version, idempotencyKey },
        update: {},
      });
      if ((link.decisionPayloadVersion ?? 0) <= version) {
        await tx.lenderApplicationLink.update({ where: { applicationId }, data: { decisionStatus: 'PENDING', decisionIdempotencyKey: idempotencyKey, decisionPayloadVersion: version } });
      }
      return event;
    });
  }

  async replayFailedEvent(eventId: string) {
    const event = await this.prisma.lenderIntegrationOutbox.findUnique({ where: { id: eventId } });
    // RETRY_PENDING is replayable too: the call already failed, it just has attempts left
    // and is sitting on its backoff (the schedule ends at 3600s, so the last wait is an
    // hour). An operator who has fixed the cause, or who knows the lender-side error was
    // transient, should not have to wait that out. PROCESSING is deliberately excluded —
    // a worker still holds the lease, and resetting underneath it would let the same
    // lender call go out twice.
    if (!event || !['FAILED', 'RETRY_PENDING'].includes(event.status)) {
      throw new BadRequestException(
        'Only a lender event that has failed or is awaiting retry can be replayed.',
      );
    }
    const application = await this.prisma.plApplication.findUnique({ where: { id: event.applicationId }, include: { lenderApplicationLink: true } });
    // A DISBURSE-stage event is expected to run while the application is already
    // LENDER_APPROVED (disbursal only happens post-approval) — that is not "terminal"
    // for this stage the way it is for CREATE/UPDATE/DECISION. LOAN_CLOSED (the loan
    // linked to this application has been fully repaid) is unconditionally terminal
    // for every stage, including DISBURSE — there is nothing left to replay once the
    // loan itself is closed.
    if (
      !application ||
      application.status === 'LOAN_CLOSED' ||
      (event.integrationStage !== 'DISBURSE' && ['LENDER_APPROVED', 'LENDER_REJECTED'].includes(application.status))
    ) {
      throw new BadRequestException('Terminal lender decisions cannot be replayed.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.lenderIntegrationOutbox.update({ where: { id: event.id }, data: { status: 'PENDING', attemptCount: 0, availableAt: new Date(), processedAt: null, lockedAt: null, lockedBy: null, lockToken: null, leaseExpiresAt: null, lastErrorCode: null, lastErrorMessage: null } });
      // DISBURSE has no LenderApplicationLink status column of its own (see
      // LenderIntegrationService.processDisburse/markStageFailure) — it tracks state
      // directly on PlLoan.disbursalStatus instead, so there is nothing to reset here.
      if (application.lenderApplicationLink && event.integrationStage !== 'DISBURSE') {
        // CONSENT needs its own branch — without it a replayed consent event reset
        // decisionStatus (the fall-through) and left consentStatus stuck on FAILED.
        const statusColumn: Record<string, string> = {
          CREATE: 'createStatus',
          CONSENT: 'consentStatus',
          UPDATE: 'updateStatus',
          DECISION: 'decisionStatus',
        };
        const field = statusColumn[event.integrationStage];
        if (field) {
          await tx.lenderApplicationLink.update({ where: { id: application.lenderApplicationLink.id }, data: { [field]: 'PENDING', lastErrorCode: null, lastErrorMessage: null } });
        }
      }
      if (event.integrationStage === 'DISBURSE') {
        await tx.plLoan.updateMany({ where: { applicationId: application.id }, data: { disbursalStatus: 'DISBURSAL_REQUESTED' } });
      }
    });
    return { success: true, eventId: event.id, status: 'PENDING' };
  }

  async enqueueDisbursalWhenReady(applicationId: bigint) {
    const application = await this.prisma.plApplication.findUnique({ where: { id: applicationId } });
    if (!application?.lenderId) throw new BadRequestException('Allocated lender is missing.');
    const loan = await this.prisma.plLoan.findUnique({ where: { applicationId } });
    if (!loan) throw new BadRequestException('No loan exists for this application yet.');

    const idempotencyKey = `${application.applicationNumber}:LENDER_REQUEST_DISBURSAL:V1`;
    return this.prisma.lenderIntegrationOutbox.upsert({
      where: { idempotencyKey },
      create: { eventType: 'LENDER_REQUEST_DISBURSAL', applicationId, applicationReference: application.applicationNumber, lenderId: application.lenderId, integrationStage: 'DISBURSE', payloadVersion: 1, idempotencyKey },
      update: {},
    });
  }

  // Repayment/charge/waiver are many-per-application (unlike the one-shot stages
  // above), so the idempotency key is keyed on the specific sub-entity id, not just
  // the application — otherwise a second repayment on the same loan would upsert
  // into the first one's already-completed outbox row and never get sent.

  async enqueueRepaymentNotification(applicationId: bigint, repaymentId: bigint) {
    const application = await this.prisma.plApplication.findUnique({ where: { id: applicationId } });
    if (!application?.lenderId) throw new BadRequestException('Allocated lender is missing.');

    const idempotencyKey = `${application.applicationNumber}:LENDER_NOTIFY_REPAYMENT:${repaymentId}`;
    return this.prisma.lenderIntegrationOutbox.upsert({
      where: { idempotencyKey },
      create: { eventType: 'LENDER_NOTIFY_REPAYMENT', applicationId, applicationReference: application.applicationNumber, lenderId: application.lenderId, integrationStage: 'REPAYMENT', payloadVersion: 1, idempotencyKey, repaymentId },
      update: {},
    });
  }

  async enqueueChargeNotification(applicationId: bigint, chargeId: bigint) {
    const application = await this.prisma.plApplication.findUnique({ where: { id: applicationId } });
    if (!application?.lenderId) throw new BadRequestException('Allocated lender is missing.');

    const idempotencyKey = `${application.applicationNumber}:LENDER_NOTIFY_CHARGE:${chargeId}`;
    return this.prisma.lenderIntegrationOutbox.upsert({
      where: { idempotencyKey },
      create: { eventType: 'LENDER_NOTIFY_CHARGE', applicationId, applicationReference: application.applicationNumber, lenderId: application.lenderId, integrationStage: 'CHARGE', payloadVersion: 1, idempotencyKey, chargeId },
      update: {},
    });
  }

  async enqueueChargeWaiverNotification(applicationId: bigint, chargeWaiverId: bigint) {
    const application = await this.prisma.plApplication.findUnique({ where: { id: applicationId } });
    if (!application?.lenderId) throw new BadRequestException('Allocated lender is missing.');

    const idempotencyKey = `${application.applicationNumber}:LENDER_NOTIFY_CHARGE_WAIVER:${chargeWaiverId}`;
    return this.prisma.lenderIntegrationOutbox.upsert({
      where: { idempotencyKey },
      create: { eventType: 'LENDER_NOTIFY_CHARGE_WAIVER', applicationId, applicationReference: application.applicationNumber, lenderId: application.lenderId, integrationStage: 'CHARGE_WAIVER', payloadVersion: 1, idempotencyKey, chargeWaiverId },
      update: {},
    });
  }
}
