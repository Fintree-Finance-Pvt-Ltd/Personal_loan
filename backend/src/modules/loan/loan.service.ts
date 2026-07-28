import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PlApplicationStatus, PlLoanStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';

@Injectable()
export class LoanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) { }

  private generateLan(): string {
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
    const sequence = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    return `PL${dateStr}${sequence}`;
  }

  async findLoanByLanAndCustomer(lan: string, customerId: bigint) {
    const loan = await this.prisma.plLoan.findFirst({
      where: {
        lan,
        customerId,
      },
      include: {
        application: true,
        customer: true,
      },
    });

    if (!loan) {
      throw new NotFoundException('Loan not found or does not belong to this customer');
    }

    return loan;
  }

  async createLoanAfterApproval(applicationId: bigint, customerId: bigint, amount: number, lenderCode: string = 'FTF') {
    // Idempotency check: see if loan already exists for this application
    const existingLoan = await this.prisma.plLoan.findFirst({
      where: { applicationId },
    });

    if (existingLoan) {
      return existingLoan;
    }

    const application = await this.prisma.plApplication.findUnique({
      where: { id: applicationId },
    });

    if (!application || application.customerId !== customerId) {
      throw new NotFoundException('Application not found');
    }

    if (application.status !== PlApplicationStatus.LENDER_APPROVED) {
      throw new BadRequestException('Application is not approved by lender');
    }

    const lan = this.generateLan();

    // Create the offer valid for 30 days
    const offerValidUntil = new Date();
    offerValidUntil.setDate(offerValidUntil.getDate() + 30);

    const loan = await this.prisma.plLoan.create({
      data: {
        lan,
        customerId,
        applicationId,
        lenderCode,
        status: PlLoanStatus.LENDER_APPROVED,
        currentStep: 'APPROVAL_SUMMARY',
        approvedAmount: amount,
        lenderApprovedAt: new Date(),
        offerStatus: 'AVAILABLE',
        offerAllowedTenures: JSON.stringify([3, 6, 9, 12, 18, 24]),
        offerValidUntil,
      },
    });

    this.auditLogs.record({
      actorUserId: null,
      module: 'LOAN',
      action: 'LOAN_LAN_CREATED',
      entityType: 'PlLoan',
      entityId: loan.id.toString(),
      outcome: 'SUCCESS',
      newValue: { lan: loan.lan, status: loan.status },
      requestId: randomBytes(16).toString('hex'),
    }).catch(() => { /* non-critical */ });

    return loan;
  }

  deriveCurrentStep(loan: any): string {
    if (loan.disbursalStatus === 'DISBURSED' || loan.status === PlLoanStatus.DISBURSED) {
      return 'DISBURSED';
    }
    if (loan.disbursalStatus === 'PROCESSING' || loan.status === PlLoanStatus.DISBURSAL_PROCESSING) {
      return 'DISBURSAL_PROCESSING';
    }
    if (loan.status === PlLoanStatus.READY_FOR_DISBURSAL) {
      return 'READY_FOR_DISBURSAL';
    }
    if (loan.esignCompleted) {
      return 'ESIGN'; // or READY_FOR_DISBURSAL depending on auto-transition
    }
    if (loan.mandateCompleted) {
      return 'ESIGN';
    }
    if (loan.kfsAccepted) {
      return 'EMANDATE';
    }
    if (loan.bankVerified) {
      return 'KFS_ACCEPTANCE';
    }
    if (loan.addressConfirmed) {
      return 'BANK_VERIFICATION';
    }
    if (loan.digilockerStatus === 'VERIFIED') {
      return 'ADDRESS_CONFIRMATION';
    }
    if (loan.acceptedTenureDays) {
      return 'DIGILOCKER_KYC';
    }

    return 'APPROVAL_SUMMARY';
  }

  async getPostApprovalJourney(lan: string, customerId: bigint) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);

    // Fire-and-forget audit log — customer ID is not an admin user, so actorUserId is null
    this.auditLogs.record({
      actorUserId: null,
      module: 'LOAN',
      action: 'POST_APPROVAL_JOURNEY_OPENED',
      entityType: 'PlLoan',
      entityId: loan.id.toString(),
      outcome: 'SUCCESS',
      requestId: randomBytes(16).toString('hex'),
    }).catch(() => { /* non-critical — never fail the request */ });

    // Derive stable workflow state
    const currentStep = this.deriveCurrentStep(loan);

    // Normalize address for frontend
    let permanentAddress = null;
    if (loan.digilockerStatus === 'VERIFIED') {
      permanentAddress = {
        addressLine1: loan.aadhaarAddrLine1,
        addressLine2: loan.aadhaarAddrLine2,
        landmark: loan.aadhaarLandmark,
        locality: loan.aadhaarLocality,
        district: loan.aadhaarDistrict,
        city: loan.aadhaarCity,
        state: loan.aadhaarState,
        country: loan.aadhaarCountry,
        pincode: loan.aadhaarPincode,
        formattedAddress: loan.aadhaarFormattedAddr,
        source: 'DIGILOCKER_AADHAAR',
        verified: true,
      };
    }

    let currentAddress = null;
    if (loan.addressConfirmed) {
      currentAddress = {
        addressLine1: loan.currentAddrLine1,
        addressLine2: loan.currentAddrLine2,
        landmark: loan.currentAddrLandmark,
        locality: loan.currentAddrLocality,
        district: loan.currentAddrDistrict,
        city: loan.currentAddrCity,
        state: loan.currentAddrState,
        country: loan.currentAddrCountry,
        pincode: loan.currentAddrPincode,
        residenceSince: loan.currentAddrResidenceSince,
        proofType: loan.currentAddrProofType,
        sameAsPermanent: loan.addressSameAsPermanent,
      };
    }

    return {
      loan: {
        id: loan.id.toString(),
        lan: loan.lan,
        status: loan.status,
        applicationId: loan.applicationId.toString(),
        applicationNumber: loan.application.applicationNumber,
        approvedAmount: loan.approvedAmount ? Number(loan.approvedAmount) : null,
        approvedAt: loan.lenderApprovedAt,
      },
      customer: {
        customerCode: loan.customer.customerCode,
        fullName: loan.customer.fullName,
      },
      lender: {
        code: loan.lenderCode,
        name: 'Fintree Finance Private Limited',
      },
      offer: {
        offerStatus: loan.offerStatus,
        approvedAmount: loan.approvedAmount ? Number(loan.approvedAmount) : null,
        allowedTenures: (() => {
          try {
            return loan.offerAllowedTenures ? JSON.parse(loan.offerAllowedTenures) : [30, 45, 60, 90];
          } catch {
            return [30, 45, 60, 90];
          }
        })(),
        validUntil: loan.offerValidUntil,
        acceptedTenureDays: loan.acceptedTenureDays,
        acceptedInterestRate: loan.acceptedInterestRate ? Number(loan.acceptedInterestRate) : null,
        acceptedProcessingFee: loan.acceptedProcessingFee ? Number(loan.acceptedProcessingFee) : null,
        acceptedEmiAmount: loan.acceptedEmiAmount ? Number(loan.acceptedEmiAmount) : null,
        acceptedTotalRepayment: loan.acceptedTotalRepayment ? Number(loan.acceptedTotalRepayment) : null,
      },
      digilocker: {
        status: loan.digilockerStatus || 'NOT_STARTED',
        maskedAadhaar: loan.aadhaarMaskedNumber,
        verifiedAt: loan.digilockerVerifiedAt,
        permanentAddress,
      },
      address: currentAddress,
      bank: {
        verified: loan.bankVerified,
        accountHolderName: loan.bankAccountHolderName,
        accountType: loan.bankAccountType,
        accountMasked: loan.bankAccountMasked,
        ifsc: loan.bankIfsc,
        bankName: loan.bankName,
      },
      workflow: {
        lenderApproved: loan.status !== PlLoanStatus.FAILED && loan.status !== PlLoanStatus.CANCELLED,
        offerAccepted: !!loan.acceptedTenureDays,
        digilockerVerified: loan.digilockerStatus === 'VERIFIED',
        addressConfirmed: loan.addressConfirmed,
        bankVerified: loan.bankVerified,
        kfsAccepted: loan.kfsAccepted,
        mandateCompleted: loan.mandateCompleted,
        esignCompleted: loan.esignCompleted,
        readyForDisbursal:
          loan.status === PlLoanStatus.READY_FOR_DISBURSAL ||
          loan.status === PlLoanStatus.DISBURSAL_PROCESSING ||
          loan.status === PlLoanStatus.DISBURSED,
        disbursalStatus: loan.disbursalStatus || 'NOT_STARTED',
        currentStep,
      },
    };
  }


  async acceptOffer(lan: string, customerId: bigint, tenureDays: number) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);

    if (loan.acceptedTenureDays) {
      throw new BadRequestException('Offer already accepted');
    }

    // Only validate tenures if the list is set
    if (loan.offerAllowedTenures) {
      try {
        const allowed = JSON.parse(loan.offerAllowedTenures);
        if (Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(tenureDays)) {
          throw new BadRequestException('Invalid tenure selected');
        }
      } catch (e) {
        if (e instanceof BadRequestException) throw e;
        // If JSON.parse fails, skip validation
      }
    }

    // Dummy pricing calculation
    const principal = Number(loan.approvedAmount) || 0;
    const interestRate = 18.0;
    const processingFee = principal * 0.02;
    const months = tenureDays / 30;
    const ratePerMonth = interestRate / 12 / 100;
    const emi = months > 0
      ? (principal * ratePerMonth * Math.pow(1 + ratePerMonth, months)) / (Math.pow(1 + ratePerMonth, months) - 1)
      : 0;
    const totalRepayment = emi * months;

    await this.prisma.plLoan.update({
      where: { id: loan.id },
      data: {
        offerStatus: 'ACCEPTED',
        acceptedTenureDays: tenureDays,
        acceptedAt: new Date(),
        acceptedInterestRate: interestRate,
        acceptedProcessingFee: processingFee,
        acceptedEmiAmount: emi,
        acceptedTotalRepayment: totalRepayment,
        status: PlLoanStatus.OFFER_ACCEPTED,
        currentStep: 'DIGILOCKER_KYC',
      },
    });

    this.auditLogs.record({
      actorUserId: null,
      module: 'LOAN',
      action: 'OFFER_ACCEPTED',
      entityType: 'PlLoan',
      entityId: loan.id.toString(),
      outcome: 'SUCCESS',
      newValue: { acceptedTenureDays: tenureDays },
      requestId: randomBytes(16).toString('hex'),
    }).catch(() => { /* non-critical */ });

    return { success: true, message: 'Offer accepted successfully.', nextStep: 'DIGILOCKER_KYC' };
  }

  async saveAddress(lan: string, customerId: bigint, payload: any) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);

    if (loan.digilockerStatus !== 'VERIFIED') {
      throw new BadRequestException('Aadhaar verification not completed');
    }

    let updateData: Prisma.PlLoanUpdateInput = {
      addressConfirmed: true,
      addressConfirmedAt: new Date(),
      status: loan.status === PlLoanStatus.OFFER_ACCEPTED ? PlLoanStatus.ADDRESS_CONFIRMED : loan.status,
    };

    if (payload.sameAsPermanent) {
      updateData.addressSameAsPermanent = true;
      // Copy from permanent Aadhaar address
      updateData.currentAddrLine1 = loan.aadhaarAddrLine1;
      updateData.currentAddrLine2 = loan.aadhaarAddrLine2;
      updateData.currentAddrLandmark = loan.aadhaarLandmark;
      updateData.currentAddrLocality = loan.aadhaarLocality;
      updateData.currentAddrDistrict = loan.aadhaarDistrict;
      updateData.currentAddrCity = loan.aadhaarCity;
      updateData.currentAddrState = loan.aadhaarState;
      updateData.currentAddrCountry = loan.aadhaarCountry;
      updateData.currentAddrPincode = loan.aadhaarPincode;
      updateData.currentAddrProofType = 'AADHAAR';
    } else {
      if (!payload.currentAddress) {
        throw new BadRequestException('Current address details missing');
      }
      updateData.addressSameAsPermanent = false;
      updateData.currentAddrLine1 = payload.currentAddress.addressLine1;
      updateData.currentAddrLine2 = payload.currentAddress.addressLine2;
      updateData.currentAddrLandmark = payload.currentAddress.landmark;
      updateData.currentAddrLocality = payload.currentAddress.locality;
      updateData.currentAddrDistrict = payload.currentAddress.district;
      updateData.currentAddrCity = payload.currentAddress.city;
      updateData.currentAddrState = payload.currentAddress.state;
      updateData.currentAddrCountry = payload.currentAddress.country || 'India';
      updateData.currentAddrPincode = payload.currentAddress.pincode;
      updateData.currentAddrResidenceSince = payload.currentAddress.residenceSince;
      updateData.currentAddrProofType = payload.currentAddress.addressProofType;
      updateData.currentAddrDocumentId = payload.currentAddress.documentId;
    }

    updateData.currentStep = 'BANK_VERIFICATION';

    const updatedLoan = await this.prisma.plLoan.update({
      where: { id: loan.id },
      data: updateData,
    });

    this.auditLogs.record({
      actorUserId: null,
      module: 'LOAN',
      action: 'ADDRESS_CONFIRMED',
      entityType: 'PlLoan',
      entityId: loan.id.toString(),
      outcome: 'SUCCESS',
      newValue: { sameAsPermanent: payload.sameAsPermanent },
      requestId: randomBytes(16).toString('hex'),
    }).catch(() => { /* non-critical */ });

    return { success: true, message: 'Address confirmed.', nextStep: 'BANK_VERIFICATION' };
  }

  // TODO: Add real provider integrations for the following methods
  async initiateDigilocker(lan: string, customerId: bigint) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);
    // 1. TODO: Call real DigiLocker provider (e.g. Protean/Karza)
    // 2. Return redirect URL or session ID
    return { success: true, message: 'Provider integration missing (TODO)' };
  }

  async getDigilockerStatus(lan: string, customerId: bigint) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);
    return { status: loan.digilockerStatus || 'NOT_STARTED' };
  }

  async verifyBankAccount(lan: string, customerId: bigint, payload: any) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);
    // 1. TODO: Call real Penny Drop provider
    // 2. Update loan with bankVerified = true
    return { success: true, message: 'Provider integration missing (TODO)' };
  }

  async generateKfs(lan: string, customerId: bigint) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);
    // 1. TODO: Generate PDF KFS
    return { success: true, message: 'Provider integration missing (TODO)' };
  }

  async acceptKfs(lan: string, customerId: bigint, payload: any) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);
    // 1. TODO: Update loan kfsAccepted = true
    return { success: true, message: 'Provider integration missing (TODO)' };
  }

  async initiateMandate(lan: string, customerId: bigint) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);
    // 1. TODO: Call eMandate provider
    return { success: true, message: 'Provider integration missing (TODO)' };
  }

  async initiateEsign(lan: string, customerId: bigint) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);
    // 1. TODO: Call eSign provider
    return { success: true, message: 'Provider integration missing (TODO)' };
  }

  async requestDisbursal(lan: string, customerId: bigint) {
    const loan = await this.findLoanByLanAndCustomer(lan, customerId);
    // 1. TODO: Call disbursal API
    return { success: true, message: 'Provider integration missing (TODO)' };
  }
}
