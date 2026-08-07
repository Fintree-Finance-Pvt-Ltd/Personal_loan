import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

type TransactionClient = Prisma.TransactionClient;

import { LenderAdapterRegistry } from './lender-adapter.registry';

@Injectable()
export class LenderIntegrationOutboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adapters: LenderAdapterRegistry,
  ) {}

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
    const consentTemplateId = process.env.LENDER_DATA_SHARING_CONSENT_TEMPLATE_ID || 'LENDER_DATA_SHARING_V1';
    const consentVersion = process.env.LENDER_DATA_SHARING_CONSENT_VERSION || '1.0';
    const consentReference = process.env.LENDER_DATA_SHARING_CONSENT_REFERENCE || 'CUSTOMER_LENDER_DATA_SHARING';
    const consentText = `I consent to share my application data with ${lender.displayName} for eligibility assessment and final decision.`;
    if (input.consentTemplateId !== consentTemplateId || input.consentVersion !== consentVersion || input.consentText !== consentText) {
      throw new BadRequestException('The lender data-sharing consent text or version is invalid.');
    }
    const consentTextHash = createHash('sha256').update(consentText, 'utf8').digest('hex');
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
    const templates = {
      BUREAU_ENQUIRY: { id: 'BUREAU_ENQUIRY_V1', version: '1.0', text: 'I authorize a bureau enquiry for this loan application.' },
      LENDER_CREDIT_ASSESSMENT: { id: 'LENDER_CREDIT_ASSESSMENT_V1', version: '1.0', text: 'I authorize the allocated lender to assess my eligibility and credit profile.' },
      LENDER_DECISION_REQUEST: { id: 'LENDER_DECISION_REQUEST_V1', version: '1.0', text: 'I authorize submission of my completed application to the allocated lender for a lending decision.' },
    } as const;
    if (input.consents.length !== 3) throw new BadRequestException('All lender-decision consents are required.');
    await this.prisma.$transaction(async (tx) => {
      for (const submitted of input.consents) {
        const expected = templates[submitted.consentType];
        if (!expected || submitted.consentTemplateId !== expected.id || submitted.consentVersion !== expected.version || submitted.consentText !== expected.text) throw new BadRequestException(`Invalid ${submitted.consentType} consent evidence.`);
        const consentTextHash = createHash('sha256').update(expected.text, 'utf8').digest('hex');
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
    if (!event || event.status !== 'FAILED') throw new BadRequestException('Only a permanently failed lender event can be replayed.');
    const application = await this.prisma.plApplication.findUnique({ where: { id: event.applicationId }, include: { lenderApplicationLink: true } });
    if (!application || ['LENDER_APPROVED', 'LENDER_REJECTED'].includes(application.status)) throw new BadRequestException('Terminal lender decisions cannot be replayed.');
    await this.prisma.$transaction(async (tx) => {
      await tx.lenderIntegrationOutbox.update({ where: { id: event.id }, data: { status: 'PENDING', attemptCount: 0, availableAt: new Date(), processedAt: null, lockedAt: null, lockedBy: null, lockToken: null, leaseExpiresAt: null, lastErrorCode: null, lastErrorMessage: null } });
      if (application.lenderApplicationLink) {
        const field = event.integrationStage === 'CREATE' ? 'createStatus' : event.integrationStage === 'UPDATE' ? 'updateStatus' : 'decisionStatus';
        await tx.lenderApplicationLink.update({ where: { id: application.lenderApplicationLink.id }, data: { [field]: 'PENDING', lastErrorCode: null, lastErrorMessage: null } });
      }
    });
    return { success: true, eventId: event.id, status: 'PENDING' };
  }
}
