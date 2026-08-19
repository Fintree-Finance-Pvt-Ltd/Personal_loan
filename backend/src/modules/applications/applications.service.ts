import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) { }

  async list(query: { search?: string; status?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const search = query.search?.trim();

    const where: Prisma.PlApplicationWhereInput = {
      ...(query.status ? { status: query.status as any } : {}),
      ...(search
        ? {
          OR: [
            { applicationNumber: { contains: search } },
            { platformLan: { contains: search } },
            { customer: { fullName: { contains: search } } },
            { customer: { mobileNumber: { contains: search } } },
            { customer: { customerCode: { contains: search } } },
          ],
        }
        : {}),
    };

    // customer is NOT included via a relation `include` here — some historical rows'
    // customerId points at a Customer that no longer exists (FK cascade is configured
    // correctly at the DB level, but rows were removed with a raw delete that bypassed
    // it at some point), and Prisma throws hard on a required relation resolving to
    // null. Fetched separately below and tolerated as missing instead of crashing the
    // whole list over one bad row.
    const [total, applications] = await Promise.all([
      this.prisma.plApplication.count({ where }),
      this.prisma.plApplication.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          lenderApplicationLink: {
            select: { createStatus: true, consentStatus: true, updateStatus: true, decisionStatus: true, normalizedDecision: true },
          },
        },
      }),
    ]);

    const customerIds = [...new Set(applications.map((a) => a.customerId))];
    const customers = customerIds.length
      ? await this.prisma.customer.findMany({
        where: { id: { in: customerIds } },
        select: { id: true, customerCode: true, fullName: true, mobileNumber: true },
      })
      : [];
    const customerById = new Map(customers.map((c) => [c.id.toString(), c]));

    return {
      total,
      page,
      pageSize,
      applications: applications.map((application) => {
        const customer = customerById.get(application.customerId.toString());
        return {
          applicationId: application.id.toString(),
          applicationNumber: application.applicationNumber,
          status: application.status,
          customerCode: customer?.customerCode ?? null,
          customerName: customer?.fullName ?? '(customer record missing)',
          customerMobile: customer?.mobileNumber ?? null,
          lenderCode: application.lenderCode,
          platformLan: application.platformLan,
          requestedAmount: application.requestedAmount?.toNumber() ?? null,
          selectedAmount: application.selectedAmount?.toNumber() ?? null,
          approvedAmount: application.approvedAmount?.toNumber() ?? null,
          lenderApprovedAmount: application.lenderApprovedAmount?.toNumber() ?? null,
          link: application.lenderApplicationLink
            ? {
              createStatus: application.lenderApplicationLink.createStatus,
              consentStatus: application.lenderApplicationLink.consentStatus,
              updateStatus: application.lenderApplicationLink.updateStatus,
              decisionStatus: application.lenderApplicationLink.decisionStatus,
              normalizedDecision: application.lenderApplicationLink.normalizedDecision,
            }
            : null,
          createdAt: application.createdAt,
          updatedAt: application.updatedAt,
        };
      }),
    };
  }

  async getDetails(applicationId: bigint) {
    const application = await this.prisma.plApplication.findUnique({
      where: { id: applicationId },
      include: {
        lenderApplicationLink: true,
        lenderIntegrationOutbox: { orderBy: { createdAt: 'desc' } },
        loans: { orderBy: { id: 'desc' }, take: 1 },
      },
    });
    if (!application) throw new NotFoundException('Application not found.');

    const [customer, documents] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: application.customerId } }),
      this.prisma.plCustomerDocument.findMany({
        where: { customerId: application.customerId },
        orderBy: { uploadedAt: 'desc' },
      }),
    ]);
    const loan = application.loans[0] ?? null;
    const link = application.lenderApplicationLink;
    const charges = loan
      ? await this.prisma.plLoanCharge.findMany({
        where: { loanId: loan.id },
        include: { waivers: { orderBy: { id: 'desc' } } },
        orderBy: { id: 'desc' },
      })
      : [];

    return {
      application: {
        applicationId: application.id.toString(),
        applicationNumber: application.applicationNumber,
        status: application.status,
        platformLan: application.platformLan,
        lenderCode: application.lenderCode,
        lenderId: application.lenderId,
        requestedAmount: application.requestedAmount?.toNumber() ?? null,
        requestedTenure: application.requestedTenure,
        selectedAmount: application.selectedAmount?.toNumber() ?? null,
        selectedTenure: application.selectedTenure,
        selectedAt: application.selectedAt,
        approvedAmount: application.approvedAmount?.toNumber() ?? null,
        lenderApprovedAmount: application.lenderApprovedAmount?.toNumber() ?? null,
        lenderApprovedTenure: application.lenderApprovedTenure,
        lenderApprovedRoi: application.lenderApprovedRoi?.toNumber() ?? null,
        lenderDecisionReference: application.lenderDecisionReference,
        lenderDecisionReason: application.lenderDecisionReason,
        lenderDecisionAt: application.lenderDecisionAt,
        platformDecisionOutcome: application.platformDecisionOutcome,
        submittedAt: application.submittedAt,
        createdAt: application.createdAt,
        updatedAt: application.updatedAt,
      },
      customer: customer
        ? {
          customerId: customer.id.toString(),
          customerCode: customer.customerCode,
          fullName: customer.fullName,
          mobileNumber: customer.mobileNumber,
          email: customer.email,
          panNumber: customer.panNumber,
        }
        : {
          customerId: application.customerId.toString(),
          customerCode: null,
          fullName: '(customer record missing)',
          mobileNumber: null,
          email: null,
          panNumber: null,
        },
      link: link
        ? {
          partnerApplicationId: link.partnerApplicationId,
          partnerReference: link.partnerReference,
          createStatus: link.createStatus,
          consentStatus: link.consentStatus,
          updateStatus: link.updateStatus,
          decisionStatus: link.decisionStatus,
          lastSyncedStage: link.lastSyncedStage,
          normalizedDecision: link.normalizedDecision,
          rejectionReasonCode: link.rejectionReasonCode,
          lastResponseStatus: link.lastResponseStatus,
          lastAttemptAt: link.lastAttemptAt,
          lastSuccessAt: link.lastSuccessAt,
          lastErrorCode: link.lastErrorCode,
          lastErrorMessage: link.lastErrorMessage,
        }
        : null,
      loan: loan
        ? {
          lan: loan.lan,
          status: loan.status,
          disbursalStatus: loan.disbursalStatus,
          approvedAmount: loan.approvedAmount?.toNumber() ?? null,
          charges: charges.map((charge) => ({
            chargeId: charge.id.toString(),
            chargeType: charge.chargeType,
            amount: charge.amount.toNumber(),
            paidAmount: charge.paidAmount.toNumber(),
            remainingAmount: charge.remainingAmount.toNumber(),
            status: charge.status,
            dueDate: charge.dueDate,
            description: charge.description,
            createdAt: charge.createdAt,
            waivers: charge.waivers.map((waiver) => ({
              waiverId: waiver.id.toString(),
              waiverAmount: waiver.waiverAmount.toNumber(),
              waivedAt: waiver.waivedAt,
              remarks: waiver.remarks,
              lenderNotifiedAt: waiver.lenderNotifiedAt,
            })),
          })),
        }
        : null,
      stages: application.lenderIntegrationOutbox.map((event) => ({
        eventId: event.id,
        eventType: event.eventType,
        integrationStage: event.integrationStage,
        payloadVersion: event.payloadVersion,
        status: event.status,
        attemptCount: event.attemptCount,
        lastErrorCode: event.lastErrorCode,
        lastErrorMessage: event.lastErrorMessage,
        availableAt: event.availableAt,
        processedAt: event.processedAt,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      })),
      documents: documents.map((document) => ({
        documentId: document.id.toString(),
        documentType: document.documentType,
        applicantType: document.applicantType,
        status: document.status,
        fileName: document.originalFileName || document.fileName,
        fileUrl: document.fileUrl,
        mimeType: document.mimeType,
        fileSize: document.fileSize,
        source: document.source,
        uploadedAt: document.uploadedAt,
      })),
    };
  }
}
