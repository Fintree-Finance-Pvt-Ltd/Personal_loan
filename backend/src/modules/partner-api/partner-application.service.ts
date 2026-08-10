// ──────────────────────────────────────────────────────────────────────────
// Partner API – Core Application Service
// ──────────────────────────────────────────────────────────────────────────
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  PARTNER_ALLOWED_TRANSITIONS,
  PARTNER_TERMINAL_STATES,
} from './partner-api.constants';
import { PartnerApiError } from './partner-api.errors';
import type {
  AuthorizeMandateDto,
  CreatePartnerApplicationDto,
  RecordConsentsDto,
  RequestDisbursementDto,
  RequestPreApprovalDto,
  UpdateOnboardingDto,
  UpdateProfileDto,
} from './partner-api.dto';

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class PartnerApplicationService {
  private readonly logger = new Logger(PartnerApplicationService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Helpers ──────────────────────────────────────────────────────────────

  private generatePartnerApplicationId(): string {
    return `FTPA-${Date.now()}-${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private generatePartnerApplicationNumber(): string {
    return `FTPN-${Date.now()}-${randomBytes(3).toString('hex').toUpperCase()}`;
  }

  private assertValidTransition(currentStatus: string, targetStatus: string): void {
    if (PARTNER_TERMINAL_STATES.includes(currentStatus)) {
      throw new PartnerApiError(
        'PARTNER_STATE_TERMINAL',
        `Application is in terminal state '${currentStatus}' and cannot be transitioned.`,
        409,
      );
    }
    const allowed = PARTNER_ALLOWED_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(targetStatus)) {
      throw new PartnerApiError(
        'PARTNER_STATE_INVALID_TRANSITION',
        `Cannot transition from '${currentStatus}' to '${targetStatus}'. Allowed: [${allowed.join(', ')}].`,
        409,
      );
    }
  }

  private async resolvePartnerApplication(
    partnerApplicationId: string,
    clientId: string,
  ) {
    const app = await this.prisma.partnerApplication.findUnique({
      where: { partnerApplicationId },
    });
    if (!app) {
      throw new PartnerApiError(
        'PARTNER_APPLICATION_NOT_FOUND',
        `Partner application '${partnerApplicationId}' was not found.`,
        404,
      );
    }
    if (app.clientId !== clientId) {
      // Do not reveal it exists for another client – return 404
      throw new PartnerApiError(
        'PARTNER_APPLICATION_NOT_FOUND',
        `Partner application '${partnerApplicationId}' was not found.`,
        404,
      );
    }
    return app;
  }

  // ── CREATE ────────────────────────────────────────────────────────────────

  async createApplication(
    clientDbId: string,
    dto: CreatePartnerApplicationDto,
  ) {
    // Check for existing application with same externalApplicationReference
    const existing = await this.prisma.partnerApplication.findUnique({
      where: { clientId_externalApplicationReference: { clientId: clientDbId, externalApplicationReference: dto.externalApplicationReference } },
    });
    if (existing) {
      // Idempotent – return existing
      return this.buildStatusResponse(existing);
    }

    return this.prisma.$transaction(async (tx: TransactionClient) => {
      // Find or create customer by mobile number
      let customer = await tx.customer.findFirst({
        where: { mobileNumber: dto.mobileNumber },
        select: { id: true, mobileNumber: true, email: true, firstName: true, lastName: true, accountStatus: true },
      });

      if (!customer) {
        // Create a minimal customer stub. The PLP has already done the OTP verification.
        const custDatePart = new Date().toISOString().slice(2, 10).replaceAll('-', '');
        const custRnd = randomBytes(3).toString('hex').toUpperCase();
        customer = await tx.customer.create({
          data: {
            customerCode: `FTCUST-${custDatePart}-${custRnd}`,
            mobileNumber: dto.mobileNumber,
            email: dto.email ?? null,
            firstName: dto.firstName ?? null,
            lastName: dto.lastName ?? null,
          },
          select: { id: true, mobileNumber: true, email: true, firstName: true, lastName: true, accountStatus: true },
        });
      }

      // Create canonical PlApplication
      const datePart = new Date().toISOString().slice(2, 10).replaceAll('-', '');
      const rnd = randomBytes(4).toString('hex').toUpperCase();
      const applicationNumber = `FTPA-${datePart}-${rnd}`;

      const plApplication = await tx.plApplication.create({
        data: {
          customerId: customer.id,
          applicationNumber,
          status: 'DRAFT',
        },
        select: { id: true, status: true },
      });

      const partnerApplicationId = this.generatePartnerApplicationId();
      const partnerApplicationNumber = this.generatePartnerApplicationNumber();

      const partnerApp = await tx.partnerApplication.create({
        data: {
          clientId: clientDbId,
          partnerApplicationId,
          partnerApplicationNumber,
          externalApplicationReference: dto.externalApplicationReference,
          sourceSystem: dto.sourceSystem,
          productCode: dto.productCode,
          status: 'CREATED',
          customerId: customer.id,
          plApplicationId: plApplication.id,
        },
      });

      // Enqueue CREATED webhook event
      await tx.partnerWebhookOutbox.create({
        data: {
          clientId: clientDbId,
          partnerApplicationId: partnerApp.id,
          eventType: 'APPLICATION_CREATED',
          payload: JSON.stringify({
            partnerApplicationId: partnerApp.partnerApplicationId,
            partnerApplicationNumber: partnerApp.partnerApplicationNumber,
            externalApplicationReference: partnerApp.externalApplicationReference,
            status: partnerApp.status,
            createdAt: partnerApp.createdAt,
          }),
          nextAttemptAt: new Date(),
        },
      });

      return this.buildStatusResponse(partnerApp);
    });
  }

  // ── CONSENTS ───────────────────────────────────────────────────────────────

  async recordConsents(
    clientDbId: string,
    partnerApplicationId: string,
    dto: RecordConsentsDto,
  ) {
    const app = await this.resolvePartnerApplication(partnerApplicationId, clientDbId);
    this.assertValidTransition(app.status, 'CONSENT_RECORDED');

    return this.prisma.$transaction(async (tx: TransactionClient) => {
      for (const consent of dto.consents) {
        const existing = await tx.partnerApplicationConsent.findUnique({
          where: { partnerApplicationId_consentType: { partnerApplicationId: app.id, consentType: consent.consentType } },
        });
        if (existing) continue; // Idempotent per consent type

        await tx.partnerApplicationConsent.create({
          data: {
            partnerApplicationId: app.id,
            consentReference: consent.consentReference,
            consentType: consent.consentType,
            consentTemplateId: consent.consentTemplateId,
            consentVersion: consent.consentVersion,
            consentTextHash: consent.consentTextHash,
            acceptedAt: new Date(consent.acceptedAt),
            ipAddress: consent.ipAddress,
            userAgentHash: consent.userAgentHash,
          },
        });
      }

      const updated = await tx.partnerApplication.update({
        where: { id: app.id },
        data: { status: 'CONSENT_RECORDED' },
      });

      await tx.partnerWebhookOutbox.create({
        data: {
          clientId: clientDbId,
          partnerApplicationId: app.id,
          eventType: 'CONSENT_RECORDED',
          payload: JSON.stringify({ partnerApplicationId, status: 'CONSENT_RECORDED' }),
          nextAttemptAt: new Date(),
        },
      });

      return this.buildStatusResponse(updated);
    });
  }

  // ── PROFILE ────────────────────────────────────────────────────────────────

  async updateProfile(
    clientDbId: string,
    partnerApplicationId: string,
    dto: UpdateProfileDto,
  ) {
    const app = await this.resolvePartnerApplication(partnerApplicationId, clientDbId);
    this.assertValidTransition(app.status, 'PROFILE_COMPLETE');

    // Validate required profile fields
    if (!dto.verification?.panNumber) {
      throw new PartnerApiError('PARTNER_PROFILE_VALIDATION_FAILED', 'verification.panNumber is required to complete profile.', 422);
    }
    if (!dto.addresses || dto.addresses.length < 1) {
      throw new PartnerApiError('PARTNER_PROFILE_VALIDATION_FAILED', 'At least one address is required to complete profile.', 422);
    }

    const profileData = JSON.stringify(dto);

    return this.prisma.$transaction(async (tx: TransactionClient) => {
      // Upsert profile snapshot
      await tx.partnerApplicationProfileSnapshot.upsert({
        where: { partnerApplicationId: app.id },
        create: {
          partnerApplicationId: app.id,
          profileData,
          markedCompleteAt: new Date(),
        },
        update: {
          profileData,
          markedCompleteAt: new Date(),
        },
      });

      // Update canonical customer fields
      await tx.customer.update({
        where: { id: app.customerId },
        data: {
          firstName: dto.firstName ?? undefined,
          lastName: dto.lastName ?? undefined,
          ...(dto.dateOfBirth ? { dateOfBirth: new Date(dto.dateOfBirth) } : {}),
          ...(dto.gender ? { gender: dto.gender as import('@prisma/client').CustomerGender } : {}),
          ...(dto.verification?.panNumber ? { panNumber: dto.verification.panNumber } : {}),
          ...(dto.verification?.panVerified !== undefined ? { panVerified: dto.verification.panVerified } : {}),
        },
      });

      const updated = await tx.partnerApplication.update({
        where: { id: app.id },
        data: { status: 'PROFILE_COMPLETE' },
      });

      await tx.partnerWebhookOutbox.create({
        data: {
          clientId: clientDbId,
          partnerApplicationId: app.id,
          eventType: 'PROFILE_COMPLETE',
          payload: JSON.stringify({ partnerApplicationId, status: 'PROFILE_COMPLETE' }),
          nextAttemptAt: new Date(),
        },
      });

      return this.buildStatusResponse(updated);
    });
  }

  // ── PRE-APPROVAL ───────────────────────────────────────────────────────────

  async requestPreApproval(
    clientDbId: string,
    partnerApplicationId: string,
    dto: RequestPreApprovalDto,
  ) {
    const app = await this.resolvePartnerApplication(partnerApplicationId, clientDbId);
    this.assertValidTransition(app.status, 'PRE_APPROVAL_PENDING');

    return this.prisma.$transaction(async (tx: TransactionClient) => {
      // Update the canonical application with requested amount/tenure
      await tx.plApplication.update({
        where: { id: app.plApplicationId },
        data: {
          ...(dto.requestedAmount ? { requestedAmount: new Prisma.Decimal(dto.requestedAmount) } : {}),
          ...(dto.requestedTenureMonths ? { requestedTenure: dto.requestedTenureMonths } : {}),
        },
      });

      const pending = await tx.partnerApplication.update({
        where: { id: app.id },
        data: { status: 'PRE_APPROVAL_PENDING' },
      });

      await tx.partnerWebhookOutbox.create({
        data: {
          clientId: clientDbId,
          partnerApplicationId: app.id,
          eventType: 'PRE_APPROVAL_REQUESTED',
          payload: JSON.stringify({ partnerApplicationId, status: 'PRE_APPROVAL_PENDING' }),
          nextAttemptAt: new Date(),
        },
      });

      return this.buildStatusResponse(pending);
    });
  }

  // Internal method called by the lender decision processor after evaluation
  async resolvePreApproval(
    appDbId: string,
    outcome: 'APPROVED' | 'REJECTED',
    decisionReference: string,
    reasonCode?: string,
    coolingOffDays?: number,
    offerData?: Record<string, unknown>,
  ) {
    const app = await this.prisma.partnerApplication.findUnique({ where: { id: appDbId } });
    if (!app) return;

    const newStatus = outcome === 'APPROVED' ? 'PRE_APPROVED' : 'REJECTED';
    const nextCheckAt = coolingOffDays
      ? new Date(Date.now() + coolingOffDays * 86400 * 1000)
      : undefined;

    await this.prisma.$transaction(async (tx: TransactionClient) => {
      await tx.partnerApplicationDecision.upsert({
        where: { partnerApplicationId_decisionType: { partnerApplicationId: app.id, decisionType: 'PRE_APPROVAL' } },
        create: {
          partnerApplicationId: app.id,
          decisionType: 'PRE_APPROVAL',
          outcome,
          decisionReference,
          decisionAt: new Date(),
          reasonCode,
          coolingOffDays,
          nextStatusCheckAt: nextCheckAt,
          offerData: offerData ? JSON.stringify(offerData) : null,
        },
        update: {
          outcome,
          decisionReference,
          decisionAt: new Date(),
          reasonCode,
          coolingOffDays,
          nextStatusCheckAt: nextCheckAt,
          offerData: offerData ? JSON.stringify(offerData) : null,
        },
      });

      await tx.partnerApplication.update({
        where: { id: app.id },
        data: { status: newStatus },
      });

      await tx.partnerWebhookOutbox.create({
        data: {
          clientId: app.clientId,
          partnerApplicationId: app.id,
          eventType: `PRE_APPROVAL_${outcome}`,
          payload: JSON.stringify({ partnerApplicationId: app.partnerApplicationId, outcome, decisionReference, reasonCode, coolingOffDays }),
          nextAttemptAt: new Date(),
        },
      });
    });
  }

  // ── ONBOARDING ──────────────────────────────────────────────────────────────

  async updateOnboarding(
    clientDbId: string,
    partnerApplicationId: string,
    dto: UpdateOnboardingDto,
  ) {
    const app = await this.resolvePartnerApplication(partnerApplicationId, clientDbId);
    const targetStatus = dto.markComplete ? 'ONBOARDING_COMPLETE' : 'ONBOARDING_IN_PROGRESS';

    if (!['PRE_APPROVED', 'ONBOARDING_IN_PROGRESS', 'ONBOARDING_COMPLETE'].includes(app.status)) {
      throw new PartnerApiError(
        'PARTNER_DECISION_PRE_APPROVAL_REQUIRED',
        `Onboarding requires status PRE_APPROVED. Current status: ${app.status}.`,
        409,
      );
    }

    if (dto.markComplete) {
      if (!dto.bankVerification) throw new PartnerApiError('PARTNER_PROFILE_VALIDATION_FAILED', 'bankVerification is required to complete onboarding.', 422);
      if (!dto.esignVerification) throw new PartnerApiError('PARTNER_PROFILE_VALIDATION_FAILED', 'esignVerification is required to complete onboarding.', 422);
      if (!dto.kfsAcknowledgement) throw new PartnerApiError('PARTNER_PROFILE_VALIDATION_FAILED', 'kfsAcknowledgement is required to complete onboarding.', 422);
    }

    const onboardingData = JSON.stringify(dto);

    return this.prisma.$transaction(async (tx: TransactionClient) => {
      await tx.partnerApplicationOnboardingSnapshot.upsert({
        where: { partnerApplicationId: app.id },
        create: { partnerApplicationId: app.id, onboardingData, markedCompleteAt: dto.markComplete ? new Date() : new Date(0) },
        update: { onboardingData, markedCompleteAt: dto.markComplete ? new Date() : new Date(0) },
      });

      const updated = await tx.partnerApplication.update({
        where: { id: app.id },
        data: { status: targetStatus },
      });

      await tx.partnerWebhookOutbox.create({
        data: {
          clientId: clientDbId,
          partnerApplicationId: app.id,
          eventType: dto.markComplete ? 'ONBOARDING_COMPLETE' : 'ONBOARDING_UPDATED',
          payload: JSON.stringify({ partnerApplicationId, status: targetStatus }),
          nextAttemptAt: new Date(),
        },
      });

      return this.buildStatusResponse(updated);
    });
  }

  // ── FINAL APPROVAL ─────────────────────────────────────────────────────────

  async requestFinalApproval(
    clientDbId: string,
    partnerApplicationId: string,
  ) {
    const app = await this.resolvePartnerApplication(partnerApplicationId, clientDbId);
    this.assertValidTransition(app.status, 'FINAL_APPROVAL_PENDING');

    // Verify onboarding snapshot exists and is complete
    const onboarding = await this.prisma.partnerApplicationOnboardingSnapshot.findUnique({
      where: { partnerApplicationId: app.id },
    });
    if (!onboarding || onboarding.markedCompleteAt.getTime() === new Date(0).getTime()) {
      throw new PartnerApiError(
        'PARTNER_ONBOARDING_REQUIRED',
        'Onboarding must be marked complete before requesting final approval.',
        409,
      );
    }

    return this.prisma.$transaction(async (tx: TransactionClient) => {
      const pending = await tx.partnerApplication.update({
        where: { id: app.id },
        data: { status: 'FINAL_APPROVAL_PENDING' },
      });

      await tx.partnerWebhookOutbox.create({
        data: {
          clientId: clientDbId,
          partnerApplicationId: app.id,
          eventType: 'FINAL_APPROVAL_REQUESTED',
          payload: JSON.stringify({ partnerApplicationId, status: 'FINAL_APPROVAL_PENDING' }),
          nextAttemptAt: new Date(),
        },
      });

      return this.buildStatusResponse(pending);
    });
  }

  async resolveFinalApproval(
    appDbId: string,
    outcome: 'APPROVED' | 'REJECTED',
    decisionReference: string,
    reasonCode?: string,
    offerData?: Record<string, unknown>,
  ) {
    const app = await this.prisma.partnerApplication.findUnique({ where: { id: appDbId } });
    if (!app) return;

    const newStatus = outcome === 'APPROVED' ? 'FINAL_APPROVED' : 'REJECTED';

    await this.prisma.$transaction(async (tx: TransactionClient) => {
      await tx.partnerApplicationDecision.upsert({
        where: { partnerApplicationId_decisionType: { partnerApplicationId: app.id, decisionType: 'FINAL_APPROVAL' } },
        create: {
          partnerApplicationId: app.id,
          decisionType: 'FINAL_APPROVAL',
          outcome,
          decisionReference,
          decisionAt: new Date(),
          reasonCode,
          offerData: offerData ? JSON.stringify(offerData) : null,
        },
        update: {
          outcome,
          decisionReference,
          decisionAt: new Date(),
          reasonCode,
          offerData: offerData ? JSON.stringify(offerData) : null,
        },
      });

      await tx.partnerApplication.update({
        where: { id: app.id },
        data: { status: newStatus },
      });

      await tx.partnerWebhookOutbox.create({
        data: {
          clientId: app.clientId,
          partnerApplicationId: app.id,
          eventType: `FINAL_APPROVAL_${outcome}`,
          payload: JSON.stringify({ partnerApplicationId: app.partnerApplicationId, outcome, decisionReference, reasonCode }),
          nextAttemptAt: new Date(),
        },
      });
    });
  }

  // ── MANDATE ────────────────────────────────────────────────────────────────

  async authorizeMandate(
    clientDbId: string,
    partnerApplicationId: string,
    dto: AuthorizeMandateDto,
  ) {
    const app = await this.resolvePartnerApplication(partnerApplicationId, clientDbId);
    this.assertValidTransition(app.status, 'MANDATE_AUTHORIZED');

    const existing = await this.prisma.partnerApplicationMandate.findUnique({
      where: { partnerApplicationId: app.id },
    });
    if (existing && existing.status === 'AUTHORIZED') {
      throw new PartnerApiError('PARTNER_MANDATE_ALREADY_AUTHORIZED', 'A mandate has already been authorized for this application.', 409);
    }

    return this.prisma.$transaction(async (tx: TransactionClient) => {
      await tx.partnerApplicationMandate.upsert({
        where: { partnerApplicationId: app.id },
        create: {
          partnerApplicationId: app.id,
          provider: dto.provider,
          mandateReference: dto.mandateReference,
          umrn: dto.umrn,
          status: dto.status,
          authorizedAt: new Date(dto.authorizedAt),
        },
        update: {
          provider: dto.provider,
          mandateReference: dto.mandateReference,
          umrn: dto.umrn,
          status: dto.status,
          authorizedAt: new Date(dto.authorizedAt),
        },
      });

      const updated = await tx.partnerApplication.update({
        where: { id: app.id },
        data: { status: 'MANDATE_AUTHORIZED' },
      });

      await tx.partnerWebhookOutbox.create({
        data: {
          clientId: clientDbId,
          partnerApplicationId: app.id,
          eventType: 'MANDATE_AUTHORIZED',
          payload: JSON.stringify({ partnerApplicationId, umrn: dto.umrn, provider: dto.provider, status: 'MANDATE_AUTHORIZED' }),
          nextAttemptAt: new Date(),
        },
      });

      return this.buildStatusResponse(updated);
    });
  }

  // ── DISBURSEMENT ───────────────────────────────────────────────────────────

  async requestDisbursement(
    clientDbId: string,
    partnerApplicationId: string,
    dto: RequestDisbursementDto,
  ) {
    const app = await this.resolvePartnerApplication(partnerApplicationId, clientDbId);
    this.assertValidTransition(app.status, 'DISBURSEMENT_PENDING');

    // Mandate must exist and be authorized
    const mandate = await this.prisma.partnerApplicationMandate.findUnique({
      where: { partnerApplicationId: app.id },
    });
    if (!mandate) {
      throw new PartnerApiError('PARTNER_MANDATE_REQUIRED', 'An authorized mandate is required before disbursement.', 409);
    }

    // Idempotency check on disbursementReference
    const existingDisbursement = await this.prisma.partnerApplicationDisbursement.findUnique({
      where: { disbursementReference: dto.disbursementReference },
    });
    if (existingDisbursement) {
      if (existingDisbursement.partnerApplicationId !== app.id) {
        throw new PartnerApiError('PARTNER_DISBURSEMENT_DUPLICATE', 'disbursementReference is already used by another application.', 409);
      }
      return this.buildStatusResponse(app); // Idempotent
    }

    return this.prisma.$transaction(async (tx: TransactionClient) => {
      await tx.partnerApplicationDisbursement.create({
        data: {
          partnerApplicationId: app.id,
          disbursementReference: dto.disbursementReference,
          status: 'PENDING',
          requestedAt: new Date(),
        },
      });

      const updated = await tx.partnerApplication.update({
        where: { id: app.id },
        data: { status: 'DISBURSEMENT_PENDING' },
      });

      await tx.partnerWebhookOutbox.create({
        data: {
          clientId: clientDbId,
          partnerApplicationId: app.id,
          eventType: 'DISBURSEMENT_REQUESTED',
          payload: JSON.stringify({ partnerApplicationId, disbursementReference: dto.disbursementReference, status: 'DISBURSEMENT_PENDING' }),
          nextAttemptAt: new Date(),
        },
      });

      return this.buildStatusResponse(updated);
    });
  }

  // ── STATUS ─────────────────────────────────────────────────────────────────

  async getStatus(clientDbId: string, partnerApplicationId: string) {
    const app = await this.resolvePartnerApplication(partnerApplicationId, clientDbId);
    return this.buildDetailedStatusResponse(app.id);
  }

  private buildStatusResponse(app: { partnerApplicationId: string; partnerApplicationNumber: string; externalApplicationReference: string; status: string; createdAt: Date; updatedAt: Date }) {
    return {
      partnerApplicationId: app.partnerApplicationId,
      partnerApplicationNumber: app.partnerApplicationNumber,
      externalApplicationReference: app.externalApplicationReference,
      status: app.status,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    };
  }

  private async buildDetailedStatusResponse(appDbId: string) {
    const app = await this.prisma.partnerApplication.findUnique({
      where: { id: appDbId },
      include: {
        decisions: { orderBy: { createdAt: 'desc' } },
        mandate: true,
        disbursements: { orderBy: { createdAt: 'desc' }, take: 1 },
        consents: { select: { consentType: true, acceptedAt: true } },
      },
    });

    if (!app) throw new NotFoundException('Application not found.');

    const latestDecision = app.decisions[0] ?? null;
    const preApproval = app.decisions.find((d) => d.decisionType === 'PRE_APPROVAL') ?? null;
    const finalApproval = app.decisions.find((d) => d.decisionType === 'FINAL_APPROVAL') ?? null;
    const latestDisbursement = app.disbursements[0] ?? null;

    return {
      partnerApplicationId: app.partnerApplicationId,
      partnerApplicationNumber: app.partnerApplicationNumber,
      externalApplicationReference: app.externalApplicationReference,
      status: app.status,
      consents: app.consents.map((c) => ({ consentType: c.consentType, acceptedAt: c.acceptedAt })),
      preApproval: preApproval
        ? {
            outcome: preApproval.outcome,
            decisionReference: preApproval.decisionReference,
            decisionAt: preApproval.decisionAt,
            reasonCode: preApproval.reasonCode,
            coolingOffDays: preApproval.coolingOffDays,
            nextStatusCheckAt: preApproval.nextStatusCheckAt,
            offer: preApproval.offerData ? JSON.parse(preApproval.offerData) : null,
          }
        : null,
      finalApproval: finalApproval
        ? {
            outcome: finalApproval.outcome,
            decisionReference: finalApproval.decisionReference,
            decisionAt: finalApproval.decisionAt,
            reasonCode: finalApproval.reasonCode,
            offer: finalApproval.offerData ? JSON.parse(finalApproval.offerData) : null,
          }
        : null,
      mandate: app.mandate
        ? {
            provider: app.mandate.provider,
            umrn: app.mandate.umrn,
            status: app.mandate.status,
            authorizedAt: app.mandate.authorizedAt,
          }
        : null,
      disbursement: latestDisbursement
        ? {
            disbursementReference: latestDisbursement.disbursementReference,
            status: latestDisbursement.status,
            requestedAt: latestDisbursement.requestedAt,
            processedAt: latestDisbursement.processedAt,
          }
        : null,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    };
  }
}
