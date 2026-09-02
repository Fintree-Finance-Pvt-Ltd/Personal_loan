import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { signDocumentUrl } from '../../common/utils/document-url-signer.helper';

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) { }

  async list(query: { search?: string; status?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const search = query.search?.trim();

    // Combined via AND (each as its own OR clause), not spread as sibling `OR` keys —
    // a second `OR` on the same object literal would silently clobber the first when
    // both a status filter and a search term are active at once.
    const conditions: Prisma.PlApplicationWhereInput[] = [];
    if (query.status) {
      // The status filter now covers the same two sources the list's displayed status
      // does (see below): the application's own status, OR — once a loan exists — the
      // loan's (richer, further-progressing) status. Values like DISBURSED only ever
      // exist on PlLoan, never on PlApplication, so without the second branch selecting
      // "Disbursed" in the filter would always return zero results.
      conditions.push({
        OR: [
          { status: query.status as any },
          { loans: { some: { status: query.status as any } } },
        ],
      });
    }
    if (search) {
      conditions.push({
        OR: [
          { applicationNumber: { contains: search } },
          { platformLan: { contains: search } },
          { customer: { fullName: { contains: search } } },
          { customer: { mobileNumber: { contains: search } } },
          { customer: { customerCode: { contains: search } } },
        ],
      });
    }
    const where: Prisma.PlApplicationWhereInput = conditions.length ? { AND: conditions } : {};

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

    // PlApplication.status intentionally freezes at LENDER_APPROVED once a lender
    // decision lands — everything after that (mandate, e-sign, disbursal, repayment)
    // is deliberately tracked on PlLoan instead (see the comment in
    // LoanService.selectPreApprovalOffer). That's correct for the business logic that
    // depends on it staying stable, but it meant this admin list showed "Lender
    // Approved" forever after disbursal, since it only ever read PlApplication.status.
    // PlLoanStatus is the richer, further-progressing enum once a loan exists.
    const applicationIds = applications.map((a) => a.id);
    const loans = applicationIds.length
      ? await this.prisma.plLoan.findMany({
        where: { applicationId: { in: applicationIds } },
        select: { applicationId: true, status: true },
      })
      : [];
    const loanStatusByApplicationId = new Map(loans.map((l) => [l.applicationId.toString(), l.status]));

    return {
      total,
      page,
      pageSize,
      applications: applications.map((application) => {
        const customer = customerById.get(application.customerId.toString());
        const loanStatus = loanStatusByApplicationId.get(application.id.toString());
        return {
          applicationId: application.id.toString(),
          applicationNumber: application.applicationNumber,
          status: loanStatus || application.status,
          applicationStatus: application.status,
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
    const loan = application.loans[0] ?? null;

    const [
      customer,
      documents,
      mandates,
      schedules,
      kycStatus,
      kycSnapshot,
      employmentSnapshot,
      addresses,
      bankVerification,
      liveness,
      faceMatch,
    ] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: application.customerId } }),
      this.prisma.plCustomerDocument.findMany({
        where: {
          OR: [
            { customerId: application.customerId },
            { applicationId: application.id },
          ],
        },
        orderBy: { uploadedAt: 'desc' },
      }),
      loan
        ? this.prisma.plLoanMandate.findMany({
            where: { loanId: loan.id },
            orderBy: { id: 'desc' },
          })
        : Promise.resolve([]),
      loan
        ? this.prisma.plRepaymentSchedule.findMany({
            where: { loanId: loan.id },
            include: {
              debitRequests: {
                orderBy: { id: 'desc' },
                take: 1,
              },
            },
            orderBy: { installmentNumber: 'asc' },
          })
        : Promise.resolve([]),
      this.prisma.kycVerificationStatus.findUnique({
        where: { customerId: application.customerId },
      }),
      this.prisma.applicationKycSnapshot.findUnique({
        where: { applicationId: application.id },
      }),
      this.prisma.applicationEmploymentSnapshot.findUnique({
        where: { applicationId: application.id },
      }),
      this.prisma.applicationAddress.findMany({
        where: { applicationId: application.id },
      }),
      this.prisma.plBankVerification.findFirst({
        where: {
          OR: [
            { applicationId: application.id },
            { customerId: application.customerId },
            ...(loan ? [{ loanId: loan.id }] : []),
          ],
        },
        orderBy: { id: 'desc' },
      }),
      this.prisma.applicationLiveness.findUnique({
        where: { applicationId: application.id },
      }),
      this.prisma.applicationFaceMatch.findUnique({
        where: { applicationId: application.id },
      }),
    ]);
    const link = application.lenderApplicationLink;
    const charges = loan
      ? await this.prisma.plLoanCharge.findMany({
          where: { loanId: loan.id },
          include: { waivers: { orderBy: { id: 'desc' } } },
          orderBy: { id: 'desc' },
        })
      : [];

    let panRegisteredName: string | null = null;
    if (kycStatus?.panApiResponse) {
      try {
        const parsed = JSON.parse(kycStatus.panApiResponse);
        panRegisteredName =
          parsed?.data?.response?.name ||
          parsed?.data?.name ||
          parsed?.name ||
          parsed?.registered_name ||
          parsed?.full_name ||
          null;
      } catch {
        // ignore json parse error
      }
    }
    if (!panRegisteredName) {
      const parts = [kycStatus?.firstName, kycStatus?.middleName, kycStatus?.lastName].filter(Boolean).join(' ');
      if (parts) panRegisteredName = parts;
    }
    if (!panRegisteredName && customer?.fullName) {
      panRegisteredName = customer.fullName;
    }

    const aadhaarVerifiedName = kycStatus?.aadhaarName || kycSnapshot?.verifiedName || null;
    const aadhaarMaskedNumber =
      kycStatus?.aadhaarMaskedNumber || kycSnapshot?.maskedAadhaar || customer?.maskedAadhaar || null;
    const bankBeneficiaryName = bankVerification?.providerBeneficiaryName || null;
    const bankAccountHolderName = bankVerification?.accountHolderName || null;

    const livePhotoDoc = documents.find((doc) => doc.documentType === 'CUSTOMER_LIVE_PHOTO') || null;

    const normalize = (val?: string | null) =>
      val ? val.trim().toUpperCase().replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ') : '';
    const calcMatch = (a?: string | null, b?: string | null) => {
      const na = normalize(a);
      const nb = normalize(b);
      if (!na || !nb) return { match: false, score: 0, status: 'UNKNOWN' };
      if (na === nb) return { match: true, score: 100, status: 'EXACT' };
      const wa = na.split(' ');
      const wb = nb.split(' ');
      const matches = wa.filter((w) => wb.includes(w) || wb.some((x) => x.startsWith(w) || w.startsWith(x)));
      const score = Math.round((matches.length / Math.max(wa.length, wb.length)) * 100);
      return { match: score >= 60, score, status: score >= 60 ? 'PARTIAL' : 'MISMATCH' };
    };

    const profileVsPan = calcMatch(customer?.fullName, panRegisteredName);
    const profileVsAadhaar = calcMatch(customer?.fullName, aadhaarVerifiedName);
    const panVsAadhaar = calcMatch(panRegisteredName, aadhaarVerifiedName);
    const profileVsBank = bankBeneficiaryName ? calcMatch(customer?.fullName, bankBeneficiaryName) : null;

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
            firstName: customer.firstName,
            middleName: customer.middleName,
            lastName: customer.lastName,
            fatherName: customer.fatherName,
            dateOfBirth: customer.dateOfBirth,
            gender: customer.gender,
            mobileNumber: customer.mobileNumber,
            mobileVerified: customer.mobileVerified,
            mobileVerifiedAt: customer.mobileVerifiedAt,
            email: customer.email,
            emailVerified: customer.emailVerified,
            emailVerifiedAt: customer.emailVerifiedAt,
            panNumber: customer.panNumber,
            panVerified: customer.panVerified,
            panVerifiedAt: customer.panVerifiedAt,
            panHolderType: customer.panHolderType,
            residentialPincode: customer.residentialPincode,
            residentialCity: customer.residentialCity,
            residentialState: customer.residentialState,
            workPincode: customer.workPincode,
            residenceStatus: customer.residenceStatus,
            employmentType: customer.employmentType,
            companyType: customer.companyType,
            companyName: customer.companyName,
            designation: customer.designation,
            businessName: customer.businessName,
            businessConstitution: customer.businessConstitution,
            monthlyIncome: customer.monthlyIncome?.toNumber() ?? null,
            annualTurnover: customer.annualTurnover?.toNumber() ?? null,
            salaryMode: customer.salaryMode,
            employmentVintage: customer.employmentVintage,
            totalExperience: customer.totalExperience,
            aadhaarVerified: customer.aadhaarVerified,
            aadhaarKycStatus: customer.aadhaarKycStatus,
            maskedAadhaar: customer.maskedAadhaar,
            aadhaarLastFourDigits: customer.aadhaarLastFourDigits,
            aadhaarVerifiedAt: customer.aadhaarVerifiedAt,
            digilockerStatus: customer.digilockerStatus,
          }
        : {
            customerId: application.customerId.toString(),
            customerCode: null,
            fullName: '(customer record missing)',
            firstName: null,
            middleName: null,
            lastName: null,
            fatherName: null,
            dateOfBirth: null,
            gender: null,
            mobileNumber: null,
            mobileVerified: false,
            mobileVerifiedAt: null,
            email: null,
            emailVerified: false,
            emailVerifiedAt: null,
            panNumber: null,
            panVerified: false,
            panVerifiedAt: null,
            panHolderType: null,
            residentialPincode: null,
            residentialCity: null,
            residentialState: null,
            workPincode: null,
            residenceStatus: null,
            employmentType: null,
            companyType: null,
            companyName: null,
            designation: null,
            businessName: null,
            businessConstitution: null,
            monthlyIncome: null,
            annualTurnover: null,
            salaryMode: null,
            employmentVintage: null,
            totalExperience: null,
            aadhaarVerified: false,
            aadhaarKycStatus: null,
            maskedAadhaar: null,
            aadhaarLastFourDigits: null,
            aadhaarVerifiedAt: null,
            digilockerStatus: null,
          },
      kyc: {
        panStatus: kycStatus?.panStatus ?? (customer?.panVerified ? 'VERIFIED' : 'PENDING'),
        panNumber: customer?.panNumber ?? null,
        panRegisteredName,
        panVerifiedAt: customer?.panVerifiedAt ?? null,
        aadhaarStatus: kycStatus?.aadhaarStatus ?? customer?.digilockerStatus ?? (customer?.aadhaarVerified ? 'VERIFIED' : 'PENDING'),
        aadhaarName: aadhaarVerifiedName,
        aadhaarMaskedNumber,
        aadhaarDob: kycStatus?.aadhaarDob ?? kycSnapshot?.verifiedDateOfBirth ?? null,
        aadhaarAddress: kycStatus?.aadhaarAddress ?? null,
        digilockerStatus: customer?.digilockerStatus ?? null,
        nameMatchAnalysis: {
          profileName: customer?.fullName ?? null,
          panName: panRegisteredName,
          aadhaarName: aadhaarVerifiedName,
          bankName: bankBeneficiaryName || bankAccountHolderName,
          profileVsPan,
          profileVsAadhaar,
          panVsAadhaar,
          profileVsBank,
          overallMatched:
            panVsAadhaar.match &&
            profileVsPan.match &&
            (profileVsBank ? profileVsBank.match : true),
        },
      },
      livePhoto: livePhotoDoc
        ? {
            documentId: livePhotoDoc.id.toString(),
            fileUrl: signDocumentUrl(livePhotoDoc.fileUrl),
            status: livePhotoDoc.status,
            capturedAt: livePhotoDoc.capturedAt || livePhotoDoc.uploadedAt,
            faceLivenessStatus: livePhotoDoc.faceLivenessStatus || liveness?.verificationStatus || 'VERIFIED',
            faceLivenessScore: livePhotoDoc.faceLivenessScore ? Number(livePhotoDoc.faceLivenessScore) : (liveness?.score ? liveness.score.toNumber() : null),
            latitude: livePhotoDoc.latitude ? Number(livePhotoDoc.latitude) : null,
            longitude: livePhotoDoc.longitude ? Number(livePhotoDoc.longitude) : null,
            accuracy: livePhotoDoc.accuracy ? Number(livePhotoDoc.accuracy) : null,
            formattedAddress: livePhotoDoc.formattedAddress || null,
            city: livePhotoDoc.city || null,
            state: livePhotoDoc.state || null,
            postalCode: livePhotoDoc.postalCode || null,
            country: livePhotoDoc.country || 'India',
          }
        : liveness
          ? {
              documentId: null,
              fileUrl: null,
              status: liveness.verificationStatus,
              capturedAt: liveness.verifiedAt || liveness.createdAt,
              faceLivenessStatus: liveness.verificationStatus,
              faceLivenessScore: liveness.score ? liveness.score.toNumber() : null,
              latitude: null,
              longitude: null,
              accuracy: null,
              formattedAddress: null,
              city: null,
              state: null,
              postalCode: null,
              country: 'India',
            }
          : null,
      // Digitap FaceMatch: live photo vs the photo on the DigiLocker Aadhaar. Advisory —
      // never gates the journey, recorded here for the reviewer to weigh.
      faceMatch: faceMatch
        ? {
            status: faceMatch.status,
            provider: faceMatch.provider,
            isSameFace: faceMatch.isSameFace,
            sameFaceConfidence: faceMatch.sameFaceConfidence ? Number(faceMatch.sameFaceConfidence) : null,
            personImageBlurry: faceMatch.personImageBlurry,
            cardImageBlurry: faceMatch.cardImageBlurry,
            personImageFaceDetected: faceMatch.personImageFaceDetected,
            cardImageFaceDetected: faceMatch.cardImageFaceDetected,
            failureReason: faceMatch.failureReason,
            providerRequestId: faceMatch.providerRequestId,
            matchedAt: faceMatch.matchedAt,
            updatedAt: faceMatch.updatedAt,
          }
        : null,
      addresses: addresses.map((addr) => ({
        id: addr.id,
        addressType: addr.addressType,
        source: addr.source,
        addressLine1: addr.addressLine1,
        addressLine2: addr.addressLine2,
        landmark: addr.landmark,
        locality: addr.locality,
        district: addr.district,
        city: addr.city,
        state: addr.state,
        country: addr.country,
        pincode: addr.pincode,
        sameAsPermanent: addr.sameAsPermanent,
        sourceVerifiedAt: addr.sourceVerifiedAt,
      })),
      employment: employmentSnapshot
        ? {
            employmentType: employmentSnapshot.employmentType,
            companyType: employmentSnapshot.companyType,
            companyName: employmentSnapshot.companyName,
            designation: employmentSnapshot.designation,
            businessName: employmentSnapshot.businessName,
            businessConstitution: employmentSnapshot.businessConstitution,
            monthlyIncome: employmentSnapshot.monthlyIncome.toNumber(),
            annualTurnover: employmentSnapshot.annualTurnover?.toNumber() ?? null,
            employmentVintage: employmentSnapshot.employmentVintage,
            businessVintage: employmentSnapshot.businessVintage,
            salaryMode: employmentSnapshot.salaryMode,
            completedAt: employmentSnapshot.completedAt,
          }
        : customer
          ? {
              employmentType: customer.employmentType,
              companyType: customer.companyType,
              companyName: customer.companyName,
              designation: customer.designation,
              businessName: customer.businessName,
              businessConstitution: customer.businessConstitution,
              monthlyIncome: customer.monthlyIncome?.toNumber() ?? null,
              annualTurnover: customer.annualTurnover?.toNumber() ?? null,
              employmentVintage: customer.employmentVintage,
              businessVintage: customer.businessVintage,
              salaryMode: customer.salaryMode,
              completedAt: customer.profileCompletedAt,
            }
          : null,
      bankVerification: bankVerification
        ? {
            id: bankVerification.id.toString(),
            accountHolderName: bankVerification.accountHolderName,
            providerBeneficiaryName: bankVerification.providerBeneficiaryName,
            accountNumberMasked: bankVerification.accountNumberMasked,
            accountType: bankVerification.accountType,
            ifscCode: bankVerification.ifscCode,
            bankName: bankVerification.bankName || bankVerification.providerBankName,
            branchName: bankVerification.branchName || bankVerification.providerBranchName,
            provider: bankVerification.provider,
            providerVerified: bankVerification.providerVerified,
            nameMatched: bankVerification.nameMatched,
            fuzzyMatchScore: bankVerification.fuzzyMatchScore?.toNumber() ?? null,
            verificationAmount: bankVerification.verificationAmount?.toNumber() ?? null,
            status: bankVerification.status,
            verifiedAt: bankVerification.verifiedAt,
          }
        : null,
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
            mandates: mandates.map((m) => ({
              id: m.id.toString(),
              mandateType: m.mandateType,
              status: m.status,
              amount: m.amount?.toNumber() ?? null,
              merchantTransactionId: m.merchantTransactionId,
              providerMandateId: m.providerMandateId,
              portalUrl: m.portalUrl,
              frequency: m.frequency,
              createdAt: m.createdAt,
              updatedAt: m.updatedAt,
            })),
            repaymentSchedules: schedules.map((s) => ({
              id: s.id.toString(),
              installmentNumber: s.installmentNumber,
              dueDate: s.dueDate,
              emi: s.emi?.toNumber() ?? null,
              principal: s.principal?.toNumber() ?? null,
              interest: s.interest?.toNumber() ?? null,
              remainingAmount: s.remainingAmount?.toNumber() ?? null,
              paidAmount: s.paidAmount?.toNumber() ?? 0,
              paymentStatus: s.paymentStatus,
              paymentDate: s.paymentDate,
              latestDebitRequest: s.debitRequests?.[0]
                ? {
                    id: s.debitRequests[0].id.toString(),
                    merchantRequestNumber: s.debitRequests[0].merchantRequestNumber,
                    status: s.debitRequests[0].status,
                    amount: s.debitRequests[0].amount?.toNumber() ?? null,
                    attemptNumber: s.debitRequests[0].attemptNumber,
                    failureReason: s.debitRequests[0].failureReason,
                    initiatedAt: s.debitRequests[0].initiatedAt,
                    completedAt: s.debitRequests[0].completedAt,
                  }
                : null,
            })),
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
        fileUrl: signDocumentUrl(document.fileUrl),
        mimeType: document.mimeType,
        fileSize: document.fileSize,
        source: document.source,
        uploadedAt: document.uploadedAt,
        latitude: document.latitude ? Number(document.latitude) : null,
        longitude: document.longitude ? Number(document.longitude) : null,
        accuracy: document.accuracy ? Number(document.accuracy) : null,
        formattedAddress: document.formattedAddress,
        city: document.city,
        state: document.state,
        country: document.country,
        postalCode: document.postalCode,
        capturedAt: document.capturedAt,
        faceLivenessStatus: document.faceLivenessStatus,
        faceLivenessScore: document.faceLivenessScore ? Number(document.faceLivenessScore) : null,
      })),
    };
  }
}

