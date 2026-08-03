import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { LenderAdapterRegistry } from './lender-adapter.registry';
import { LenderIntegrationError } from './lender-integration.errors';
import { LenderCreateApplicationContext, LenderDecisionContext, LenderIntegrationTransportConfig, LenderStatusContext, LenderUpdateApplicationContext } from './lender-integration.types';
import { LenderIntegrationOutboxService } from './lender-integration-outbox.service';
import { LenderDecisionProcessor } from './lender-decision-processor.service';

@Injectable()
export class LenderIntegrationService {
  constructor(private readonly prisma: PrismaService, private readonly registry: LenderAdapterRegistry, private readonly outbox: LenderIntegrationOutboxService, private readonly decisions: LenderDecisionProcessor) {}

  async processEvent(eventId: string, lockToken: string): Promise<boolean> {
    const event = await this.prisma.lenderIntegrationOutbox.findUnique({ where: { id: eventId } });
    if (!event || event.status !== 'PROCESSING' || event.lockToken !== lockToken) throw new LenderIntegrationError('LENDER_EVENT_LEASE_LOST', 'Lender event is not owned by this worker.', 'TEMPORARY', true);
    const application = await this.prisma.plApplication.findUnique({
      where: { id: event.applicationId },
      include: { customer: true, lenderApplicationLink: { include: { integrationConfig: true } } },
    });
    if (!application) throw new LenderIntegrationError('LENDER_APPLICATION_NOT_FOUND', 'Canonical application was not found.', 'PERMANENT_VALIDATION');
    this.verifyEventAllocation(event, application);
    const allocation = await this.prisma.mlmAllocationDecision.findUnique({ where: { id: application.mlmAllocationDecisionId! } });
    if (!allocation || allocation.status !== 'ASSIGNED' || allocation.lenderId !== application.lenderId || allocation.productId !== application.lenderProductId || allocation.productVersionId !== application.productStrategyVersionId) {
      throw new LenderIntegrationError('LENDER_ALLOCATION_MISMATCH', 'Persisted MLM allocation does not match the application.', 'PERMANENT_VALIDATION');
    }
    const link = application.lenderApplicationLink ?? await this.createLink(application);
    this.verifyLinkAllocation(link, application);
    const config = link.integrationConfig ?? await this.prisma.lenderIntegrationConfig.findUnique({ where: { id: link.integrationConfigId } });
    if (!config || !config.isActive || config.adapterKey !== link.adapterKey || config.adapterVersion !== link.adapterVersion) {
      throw new LenderIntegrationError('LENDER_INTEGRATION_CONFIG_INVALID', 'Persisted lender integration configuration is unavailable or inactive.', 'AUTHENTICATION_CONFIGURATION');
    }
    const adapter = this.registry.resolve(link.adapterKey, link.adapterVersion);
    if (event.integrationStage === 'CREATE') {
      await this.processCreate(event, application, link, config, adapter);
      return false;
    }
    if (event.integrationStage === 'CONSENT') {
      await this.processConsent(event, application, link, config, adapter);
      return false;
    }
    if (event.integrationStage === 'UPDATE') {
      await this.processUpdate(event, application, link, config, adapter);
      return false;
    }
    if (event.integrationStage === 'DECISION' || event.integrationStage === 'STATUS') {
      await this.processDecision(event, application, link, config, adapter, lockToken);
      return true;
    }
    throw new LenderIntegrationError('LENDER_STAGE_UNSUPPORTED', `Integration stage ${event.integrationStage} is unsupported.`, 'PERMANENT_VALIDATION');
  }

  async markStageFailure(eventId: string, lockToken: string, error: LenderIntegrationError, retrying: boolean): Promise<void> {
    const event = await this.prisma.lenderIntegrationOutbox.findFirst({ where: { id: eventId, status: 'PROCESSING', lockToken } });
    if (!event) return;
    const field = event.integrationStage === 'CREATE' ? 'createStatus' : event.integrationStage === 'UPDATE' ? 'updateStatus' : 'decisionStatus';
    await this.prisma.lenderApplicationLink.updateMany({
      where: { applicationId: event.applicationId },
      data: { [field]: retrying ? 'RETRY_PENDING' : 'FAILED', lastAttemptAt: new Date(), lastErrorCode: error.code, lastErrorMessage: error.message },
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

  private async processCreate(event: any, application: any, link: any, config: any, adapter: any): Promise<void> {
    if (link.createStatus === 'ACKNOWLEDGED' || link.createStatus === 'COMPLETED') {
      return;
    }
    const context = await this.buildCreateContext(event, application, config);
    const requestHash = this.hash(context);
    await this.prisma.lenderApplicationLink.update({ where: { id: link.id }, data: { createStatus: 'PROCESSING', lastAttemptAt: new Date(), lastRequestHash: requestHash, lastErrorCode: null, lastErrorMessage: null } });
    
    const result = await adapter.createApplication(context);
    
    if (!result.acknowledged || !result.partnerApplicationId) {
      throw new LenderIntegrationError('LENDER_CREATE_NOT_ACKNOWLEDGED', 'Lender create response was not acknowledged or did not contain an application reference.', 'PERMANENT_VALIDATION');
    }

    const consentIdempotencyKey = `${application.applicationNumber}:LENDER_SUBMIT_CONSENT:V1`;

    await this.prisma.$transaction(async (tx) => {
      await tx.lenderApplicationLink.update({
        where: { id: link.id },
        data: { 
          createStatus: 'COMPLETED', 
          lastSyncedStage: 'CREATE', 
          partnerLeadId: result.partnerLeadId ?? null, 
          partnerApplicationId: result.partnerApplicationId, 
          partnerReference: result.partnerReference ?? null, 
          lastResponseStatus: result.providerStatus, 
          lastSuccessAt: new Date(), 
          lastErrorCode: null, 
          lastErrorMessage: null 
        },
      });

      await tx.lenderIntegrationOutbox.update({
        where: { id: event.id },
        data: { status: 'COMPLETED', processedAt: new Date() }
      });

      await tx.lenderIntegrationOutbox.upsert({
        where: { idempotencyKey: consentIdempotencyKey },
        create: {
          eventType: 'LENDER_SUBMIT_CONSENT' as any,
          applicationId: application.id,
          applicationReference: application.applicationNumber,
          lenderId: application.lenderId,
          integrationStage: 'CONSENT' as any,
          payloadVersion: 1,
          idempotencyKey: consentIdempotencyKey
        },
        update: {}
      });
    });
  }

  private async processConsent(event: any, application: any, link: any, config: any, adapter: any): Promise<void> {
    if (!link.partnerApplicationId || link.createStatus !== 'COMPLETED') {
      throw new LenderIntegrationError('LENDER_CONSENT_BEFORE_CREATE', 'Lender consent requires a completed create and partner application ID.', 'PERMANENT_VALIDATION');
    }
    const context = await this.buildConsentContext(event, application, config, link);
    if (!adapter.submitConsent) {
      await this.prisma.$transaction(async (tx) => {
        await tx.lenderIntegrationOutbox.update({ where: { id: event.id }, data: { status: 'COMPLETED', processedAt: new Date() } });
        await tx.lenderApplicationLink.update({ where: { id: link.id }, data: { lastSyncedStage: 'CONSENT' } });
      });
      await this.outbox.enqueueUpdateWhenReady(application.id);
      return;
    }
    const result = await adapter.submitConsent(context);
    if (!result.acknowledged) {
      throw new LenderIntegrationError('LENDER_CONSENT_NOT_ACKNOWLEDGED', 'Lender consent was not acknowledged.', 'PERMANENT_VALIDATION');
    }
    await this.prisma.$transaction(async (tx) => {
      // mark event completed
      await tx.lenderIntegrationOutbox.update({ where: { id: event.id }, data: { status: 'COMPLETED', processedAt: new Date() } });
      // persist consent reference on link if any, and last synced stage
      await tx.lenderApplicationLink.update({
        where: { id: link.id },
        data: { 
          lastSyncedStage: 'CONSENT', 
          lastResponseStatus: result.providerStatus, 
          lastSuccessAt: new Date(), 
          lastErrorCode: null, 
          lastErrorMessage: null 
        }
      });
    });
    // Queue UPDATE
    await this.outbox.enqueueUpdateWhenReady(application.id);
  }

  private async buildConsentContext(event: any, application: any, config: any, link: any) {
    const consent = await this.prisma.lenderDataSharingConsent.findFirst({ where: { applicationId: application.id, lenderId: application.lenderId }, orderBy: { acceptedAt: 'desc' } });
    if (!consent) throw new LenderIntegrationError('LENDER_CONSENT_MISSING', 'Lender data-sharing consent is missing.', 'PERMANENT_VALIDATION');
    return {
      idempotencyKey: event.idempotencyKey,
      correlationId: randomUUID(),
      payloadVersion: event.payloadVersion,
      transport: this.transport(config),
      partnerApplicationId: link.partnerApplicationId,
      applicationReference: application.applicationNumber,
      consentType: 'DATA_SHARING',
      consentTemplateId: consent.consentTemplateId,
      consentVersion: consent.consentVersion,
      consentTextHash: consent.consentTextHash,
      consentReference: consent.consentReference,
      acceptedAt: consent.acceptedAt.toISOString(),
      ipAddress: consent.ipAddress,
      userAgent: consent.userAgent
    };
  }

  private async processUpdate(event: any, application: any, link: any, config: any, adapter: any): Promise<void> {
    if (link.updateStatus === 'ACKNOWLEDGED' || link.updateStatus === 'COMPLETED') {
      try { await this.outbox.enqueueDecisionWhenReady(application.id); } catch (error) { if (!(error instanceof BadRequestException)) throw error; }
      return;
    }
    if (!link.partnerApplicationId || !['ACKNOWLEDGED', 'COMPLETED'].includes(link.createStatus)) {
      throw new LenderIntegrationError('LENDER_UPDATE_BEFORE_CREATE', 'Lender update requires an acknowledged create and partner application ID.', 'PERMANENT_VALIDATION');
    }
    const context = await this.buildUpdateContext(event, application, config);
    await this.prisma.lenderApplicationLink.update({ where: { id: link.id }, data: { updateStatus: 'PROCESSING', updateIdempotencyKey: event.idempotencyKey, lastAttemptAt: new Date(), lastRequestHash: this.hash(context), lastErrorCode: null, lastErrorMessage: null } });
    const result = await adapter.updateApplication(context);
    if (!result.acknowledged) throw new LenderIntegrationError('LENDER_UPDATE_NOT_ACKNOWLEDGED', 'Lender update response was not acknowledged.', 'PERMANENT_VALIDATION');
    await this.prisma.lenderApplicationLink.update({ where: { id: link.id }, data: { updateStatus: 'ACKNOWLEDGED', updateIdempotencyKey: event.idempotencyKey, lastSyncedStage: 'UPDATE', partnerReference: result.partnerReference ?? link.partnerReference, lastResponseStatus: result.providerStatus, lastSuccessAt: new Date(), lastErrorCode: null, lastErrorMessage: null } });
    try { await this.outbox.enqueueDecisionWhenReady(application.id); } catch (error) { if (!(error instanceof BadRequestException)) throw error; }
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

  private async buildUpdateContext(event: any, application: any, config: any): Promise<LenderUpdateApplicationContext> {
    const readiness = await this.outbox.getUpdateReadiness(application.id);
    if (!readiness.ready) throw new LenderIntegrationError('LENDER_UPDATE_CONTEXT_INCOMPLETE', readiness.reasons.join(','), 'PERMANENT_VALIDATION');
    const snapshot = readiness.application.employmentSnapshot!;
    const kyc = readiness.application.kycSnapshot!;
    const liveness = readiness.application.liveness!;
    const photo = liveness.photoDocument!;
    const consent = readiness.application.stageConsents.find((item: any) => item.consentType === 'DATA_SHARING' && !item.revokedAt)!;
    const mapAddress = (address: any) => ({ addressLine1: address.addressLine1, addressLine2: address.addressLine2, landmark: address.landmark, locality: address.locality, district: address.district, city: address.city, state: address.state, country: address.country, pincode: address.pincode, source: address.source });
    return {
      idempotencyKey: event.idempotencyKey, correlationId: randomUUID(), payloadVersion: event.payloadVersion, transport: this.transport(config), partnerApplicationId: readiness.application.lenderApplicationLink!.partnerApplicationId!, applicationReference: application.applicationNumber,
      employment: { employmentType: snapshot.employmentType, companyName: snapshot.companyName, designation: snapshot.designation, businessName: snapshot.businessName, businessConstitution: snapshot.businessConstitution, monthlyIncome: snapshot.monthlyIncome.toString(), employmentVintage: snapshot.employmentVintage, businessVintage: snapshot.businessVintage, salaryMode: snapshot.salaryMode },
      verification: { photoDocumentReference: photo.id.toString(), livenessReference: liveness.providerTransactionId, livenessStatus: liveness.verificationStatus, digilockerReference: kyc.providerReference, digilockerStatus: kyc.verificationStatus, verifiedKycName: kyc.verifiedName },
      address: { permanent: mapAddress(readiness.permanent), current: mapAddress(readiness.current), currentAddressSameAsPermanent: readiness.current!.sameAsPermanent! },
      consent: { consentTemplateId: consent.consentTemplateId, consentVersion: consent.consentVersion, consentTextHash: consent.consentTextHash, acceptedAt: consent.acceptedAt.toISOString() },
    };
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

  private async buildCreateContext(event: any, application: any, config: any): Promise<LenderCreateApplicationContext> {
    const product = await this.prisma.lenderProduct.findUnique({ where: { id: application.lenderProductId } });
    const payment = await this.prisma.plPaymentLink.findFirst({ where: { applicationId: application.id, purpose: 'ASSESSMENT_FEE', status: 'SUCCESS' }, orderBy: { paidAt: 'desc' } });
    const consent = await this.prisma.lenderDataSharingConsent.findFirst({ where: { applicationId: application.id, lenderId: application.lenderId }, orderBy: { acceptedAt: 'desc' } });
    if (!product || product.lenderId !== application.lenderId) throw new LenderIntegrationError('LENDER_PRODUCT_MISMATCH', 'Allocated lender product is invalid.', 'PERMANENT_VALIDATION');
    if (!payment?.paidAt) throw new LenderIntegrationError('ASSESSMENT_PAYMENT_MISSING', 'Verified assessment-fee payment is missing.', 'PERMANENT_VALIDATION');
    if (!consent) throw new LenderIntegrationError('LENDER_CONSENT_MISSING', 'Lender data-sharing consent is missing.', 'PERMANENT_VALIDATION');
    for (const value of [application.assessmentFeeBaseAmount, application.assessmentFeeGstRate, application.assessmentFeeGstAmount, application.assessmentFeeTotalAmount]) {
      if (value == null) throw new LenderIntegrationError('ASSESSMENT_FEE_SNAPSHOT_MISSING', 'Assessment-fee snapshot is incomplete.', 'PERMANENT_VALIDATION');
    }
    const customer = application.customer;
    return {
      idempotencyKey: event.idempotencyKey, correlationId: randomUUID(), payloadVersion: event.payloadVersion, transport: this.transport(config),
      application: { applicationId: application.id.toString(), applicationReference: application.applicationNumber, platformProductId: application.platformProductId, requestedAmount: application.requestedAmount?.toString() ?? null, scopeCode: application.scopeCode },
      allocation: { lenderId: application.lenderId, lenderProductId: application.lenderProductId, productStrategyVersionId: application.productStrategyVersionId, externalProductCode: product.code, allocatedAt: application.allocatedAt.toISOString() },
      customer: { fullName: customer.fullName, firstName: customer.firstName, middleName: customer.middleName, lastName: customer.lastName, mobileNumber: customer.mobileNumber, email: customer.email, dateOfBirth: customer.dateOfBirth?.toISOString().slice(0, 10) ?? null, gender: customer.gender, panNumber: customer.panNumber, panVerified: customer.panVerified },
      assessmentFee: { baseAmount: application.assessmentFeeBaseAmount.toString(), gstRate: application.assessmentFeeGstRate.toString(), gstAmount: application.assessmentFeeGstAmount.toString(), totalAmount: application.assessmentFeeTotalAmount.toString(), currency: application.assessmentFeeCurrency || 'INR', providerTransactionId: payment.txnid, paymentReference: payment.easebuzzId, paidAt: payment.paidAt.toISOString() },
      consent: { consentVersion: consent.consentVersion, consentTextHash: consent.consentTextHash, consentReference: consent.consentReference, acceptedAt: consent.acceptedAt.toISOString(), ipAddress: consent.ipAddress, userAgent: consent.userAgent, allocatedLenderId: consent.lenderId },
    };
  }

  private transport(config: any): LenderIntegrationTransportConfig {
    return { lenderId: config.lenderId, baseUrl: config.baseUrl, authType: config.authType, clientId: config.clientId, consentPath: config.consentPath, credentialSecretReference: config.credentialSecretReference, createApplicationPath: config.createApplicationPath, updateApplicationPath: config.updateApplicationPath, decisionPath: config.decisionPath, statusPath: config.statusPath, connectTimeoutMs: config.connectTimeoutMs, requestTimeoutMs: config.requestTimeoutMs };
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
