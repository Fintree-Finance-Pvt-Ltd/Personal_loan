import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { BorrowerAgreementTemplateData } from '../types/loan-agreement-template-data.type';
import { numberToWords } from '../helpers/handlebars-helpers';

@Injectable()
export class LoanAgreementDataBuilder {
  private readonly logger = new Logger(LoanAgreementDataBuilder.name);

  constructor(private readonly prisma: PrismaService) {}

  async buildForLoan(input: {
    lan: string;
    authenticatedCustomerId?: bigint;
    applicationId?: bigint;
  }): Promise<BorrowerAgreementTemplateData> {
    const loan = await this.prisma.plLoan.findFirst({
      where: { lan: input.lan },
      include: {
        customer: true,
        application: true,
        bankVerification: true,
        mandates: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        electronicSignTransactions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!loan) {
      throw new NotFoundException(`Loan record for LAN ${input.lan} not found.`);
    }

    const rawLoanAny = loan as any;
    const customer = (loan.customer || {}) as any;
    const application = (loan.application || {}) as any;
    const bank = (loan.bankVerification || {}) as any;
    const mandate = (loan.mandates?.[0] || {}) as any;
    const esignTx = loan.electronicSignTransactions?.[0];

    const now = new Date();

    const formattedDate = new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    }).format(now);

    const appDateFormatted = application?.createdAt
      ? new Intl.DateTimeFormat('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          timeZone: 'Asia/Kolkata',
        }).format(new Date(application.createdAt))
      : formattedDate;

    let authorizedSignatoryImage = '';
    try {
      const candidates = [
        path.resolve(process.cwd(), '..', 'frontend', 'public', 'image', 'Picture1-removebg-preview.png'),
        path.resolve(process.cwd(), 'frontend', 'public', 'image', 'Picture1-removebg-preview.png'),
        path.resolve(process.cwd(), 'public', 'image', 'Picture1-removebg-preview.png'),
        'C:\\Personal_loan\\frontend\\public\\image\\Picture1-removebg-preview.png',
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          const buf = fs.readFileSync(cand);
          authorizedSignatoryImage = `data:image/png;base64,${buf.toString('base64')}`;
          break;
        }
      }
    } catch (e: any) {
      this.logger.warn(`Could not load Authorized Signatory image: ${e?.message}`);
    }

    // Lender details (centralized config)
    const lender = {
      legalName: 'Fintree Finance Private Limited',
      shortName: 'FFPL',
      registeredAddress:
        '4th Floor, Engineering Centre, 9 Mathew Road, Opera House, Charni Road (East), Mumbai 400004, Maharashtra',
      supportEmail: 'wecare@fintreefinance.com',
      website: 'https://www.fintreefinance.com',
      customerCareNumber: '18002678111',
      authorizedSignatory: {
        name: 'Authorized Signatory',
        designation: 'Authorized Representative',
        imageUrl: authorizedSignatoryImage,
      },
      grievanceOfficer: {
        name: 'Ms. Sneha Shetty',
        designation: 'Grievance Redressal Officer',
        address:
          '4th Floor, Engineering Centre, 9 Mathew Road, Opera House, Charni Road (East), Mumbai 400004, Maharashtra',
        contactNumber: '18002678111',
        email: 'wecare@fintreefinance.com',
        availableFrom: '10:00 AM',
        availableTo: '06:00 PM',
      },
      principalNodalOfficer: {
        name: 'Mr. Sandeep Chhowala',
        designation: 'Principal Nodal Officer',
        address:
          '4th Floor, Engineering Centre, 9 Mathew Road, Opera House, Charni Road (East), Mumbai 400004, Maharashtra',
        contactNumber: '18002678111',
        email: 'pno@fintreefinance.com',
      },
    };

    // Customer & Address Resolution
    const rawMobile = customer?.mobileNumber || loan.bankAccountHolderName || '';
    const maskedMobile =
      rawMobile.length >= 10
        ? `${rawMobile.slice(0, 2)}XXXX${rawMobile.slice(-4)}`
        : rawMobile || '80XXXX8231';

    const addr1 = loan.currentAddrLine1 || customer?.addressLine1 || customer?.address || '';
    const addr2 = loan.currentAddrLine2 || customer?.addressLine2 || '';
    const city = loan.currentAddrCity || customer?.residentialCity || customer?.city || '';
    const state = loan.currentAddrState || customer?.residentialState || customer?.state || '';
    const pincode = loan.currentAddrPincode || customer?.residentialPincode || customer?.pincode || '';

    const addressParts = [addr1, addr2, city, state, pincode ? `- ${pincode}` : ''].filter(Boolean);
    const formattedAddress =
      addressParts.length > 0 ? addressParts.join(', ') : 'Borrower Address, City, State - Pincode';

    const rawPan = customer?.panNumber || '';
    const maskedPan =
      rawPan.length === 10 ? `${rawPan.slice(0, 2)}XXXX${rawPan.slice(-2)}` : rawPan || '—';

    // Financial Values
    const sanctionedAmount = Number(loan.approvedAmount || rawLoanAny.offeredAmount || 500000);
    const tenureDays = Number(loan.acceptedTenureDays || 365);
    const interestRate = Number(loan.acceptedInterestRate || 24);
    const emiAmount = Number(loan.acceptedEmiAmount || sanctionedAmount);
    const totalRepayment = Number(loan.acceptedTotalRepayment || sanctionedAmount * 1.2);
    const processingFee = Number(rawLoanAny.processingFeeAmount || sanctionedAmount * 0.15);
    const totalInterest = Math.max(0, totalRepayment - sanctionedAmount);
    const netDisbursed = Math.max(0, sanctionedAmount - processingFee);
    const apr = Number(rawLoanAny.aprRate || 42);

    // Dynamic Repayment Schedule (1 single installment or EMI)
    const repayments = [
      {
        installmentNumber: 1,
        dueDate: new Date(Date.now() + tenureDays * 86400000),
        dueDateFormatted: new Intl.DateTimeFormat('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          timeZone: 'Asia/Kolkata',
        }).format(new Date(Date.now() + tenureDays * 86400000)),
        openingPrincipal: sanctionedAmount,
        principal: sanctionedAmount,
        interest: totalInterest,
        fees: processingFee,
        installmentAmount: totalRepayment,
        closingPrincipal: 0,
      },
    ];

    const illustrativeAprSchedule = [
      {
        installmentNumber: 1,
        outstandingPrincipal: sanctionedAmount,
        principal: sanctionedAmount,
        interest: totalInterest,
        installmentAmount: totalRepayment,
      },
    ];

    // Electronic Acceptance Status
    const isSigned = esignTx?.status === 'SIGNED';

    let electronicAcceptance: BorrowerAgreementTemplateData['electronicAcceptance'];
    if (esignTx) {
      const showEnvLabel = process.env.ELECTRONIC_SIGN_SHOW_ENVIRONMENT_LABEL === 'true';
      electronicAcceptance = {
        completed: isSigned,
        signerName: esignTx.signerName || customer?.fullName || 'Borrower',
        maskedMobile: esignTx.verifiedMobileMasked || maskedMobile,
        acceptedAt: esignTx.signedAt || undefined,
        acceptedAtFormatted: esignTx.signedAt
          ? new Intl.DateTimeFormat('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true,
              timeZone: 'Asia/Kolkata',
            }).format(new Date(esignTx.signedAt)) + ' IST'
          : undefined,
        ipAddress: esignTx.ipAddress || '127.0.0.1',
        environmentLabel: showEnvLabel ? 'LOCAL DEVELOPMENT' : undefined,
        transactionReference: esignTx.signedAt
          ? `ESIGN_${loan.lan}_${esignTx.id}`
          : `ESIGN_${loan.lan}_DRAFT`,
        originalDocumentHash: esignTx.originalDocumentHash || '',
        acceptedDocumentHash: esignTx.acceptedDocumentHash || undefined,
        consentText:
          esignTx.consentText ||
          'I confirm that I have read and understood the Personal Loan Agreement and consent to accept it electronically using OTP.',
        consentVersion: esignTx.consentVersion || '1.0',
        signedPageNumber: esignTx.signedPageNumber || undefined,
        stampHeading: 'ELECTRONICALLY ACCEPTED THROUGH VERIFIED-MOBILE OTP',
        stampFooterText: 'OTP-verified electronic acceptance',
      };
    } else {
      electronicAcceptance = {
        completed: false,
        signerName: customer?.fullName || 'Borrower',
        maskedMobile,
        stampHeading: 'ELECTRONICALLY ACCEPTED THROUGH VERIFIED-MOBILE OTP',
        stampFooterText: 'OTP-verified electronic acceptance',
      };
    }

    return {
      document: {
        agreementNumber: `AGR_${loan.lan}_v1`,
        agreementVersion: '1.0',
        language: 'EN',
        generatedAt: now,
        generatedDateFormatted: formattedDate,
        originalDocumentHash: esignTx?.originalDocumentHash || undefined,
      },
      lender,
      borrower: {
        customerId: String(loan.customerId),
        fullName: customer?.fullName || loan.bankAccountHolderName || 'VISHAL RAMASHANKAR YADAV',
        email: customer?.email || 'customer@example.com',
        mobile: customer?.mobileNumber || '9876543210',
        maskedMobile,
        panMasked: maskedPan,
        address: {
          line1: addr1 || 'Borrower Address',
          line2: addr2 || '',
          city: city || 'City',
          state: state || 'State',
          pincode: pincode || '400001',
          country: 'India',
          formatted: formattedAddress,
        },
        annualHouseholdIncome: Number(customer?.annualHouseholdIncome || customer?.monthlyIncome * 12 || 350000),
      },
      application: {
        applicationId: String(loan.applicationId),
        applicationNumber: application?.applicationNumber || `PL${loan.id}`,
        applicationDate: application?.createdAt ? new Date(application.createdAt) : now,
        applicationDateFormatted: appDateFormatted,
        loanAccountNumber: loan.lan,
      },
      loan: {
        loanId: String(loan.id),
        lan: loan.lan,
        loanType: 'Unsecured Personal Loan',
        productName: 'Personal Loan',
        sanctionedAmount,
        sanctionedAmountFormatted: `₹${sanctionedAmount.toLocaleString('en-IN')}`,
        sanctionedAmountWords: numberToWords(sanctionedAmount),
        tenureValue: tenureDays,
        tenureUnit: 'DAYS',
        tenureFormatted: `${tenureDays} Days`,
        numberOfInstallments: 1,
        installmentType: 'Bullet Repayment',
        installmentFrequency: 'One-time',
        installmentAmount: emiAmount,
        installmentAmountFormatted: `₹${emiAmount.toLocaleString('en-IN')}`,
        totalInterestAmount: totalInterest,
        totalInterestAmountFormatted: `₹${totalInterest.toLocaleString('en-IN')}`,
        totalRepaymentAmount: totalRepayment,
        totalRepaymentAmountFormatted: `₹${totalRepayment.toLocaleString('en-IN')}`,
        netDisbursedAmount: netDisbursed,
        netDisbursedAmountFormatted: `₹${netDisbursed.toLocaleString('en-IN')}`,
        repaymentCommencementText: 'Post sanction / expiry of tenure',
        disbursementScheduleText: '100% Upfront',
        bulletRepayment: true,
      },
      pricing: {
        annualInterestRate: interestRate,
        annualInterestRateFormatted: `${interestRate}%`,
        interestType: 'FIXED',
        interestMethod: 'Reducing Balance',
        apr,
        aprFormatted: `${apr}%`,
        processingFeeAmount: processingFee,
        processingFeeAmountFormatted: `₹${processingFee.toLocaleString('en-IN')}`,
      },
      bank: {
        bankName: bank?.bankName || loan.bankName || 'Verified Bank',
        accountHolderName: bank?.accountHolderName || loan.bankAccountHolderName || customer?.fullName || 'Borrower',
        maskedAccountNumber: bank?.accountNumberMasked || loan.bankAccountMasked || 'XXXXXXXX3684',
        ifscCode: bank?.ifscCode || loan.bankIfsc || 'KKBK0000629',
        accountType: 'SAVINGS',
      },
      mandate: {
        status: mandate?.status || (loan.mandateCompleted ? 'AUTHORIZED' : 'PENDING'),
        mandateType: mandate?.mandateType || 'ENACH',
        mandateReference: mandate?.mandateReference || mandate?.umrn || 'N/A',
      },
      kfs: {
        loanProposalNumber: loan.lan,
        loanType: 'Unsecured Personal Loan',
        sanctionedAmount,
        disbursementInStages: false,
        disbursementSchedule: '100% Upfront',
        loanTerm: `${tenureDays} Days`,
        installment: {
          type: 'Bullet Payment',
          count: 1,
          amount: totalRepayment,
          commencement: 'Post sanction',
        },
        interest: {
          rate: interestRate,
          type: 'Fixed',
          benchmarkApplicable: false,
        },
        annualPercentageRate: apr,
        recoveryAgentClauseNumber: 'Clause 27',
        grievanceClauseNumber: 'Clause 26',
        transferableOrSecuritisable: false,
        collaborativeLendingApplicable: false,
        coolingOffPeriodDays: 3,
      },
      apr: {
        sanctionedAmount,
        term: `${tenureDays} Days`,
        principalInstallmentCount: 1,
        epiType: 'Bullet Payment',
        epiAmount: totalRepayment,
        epiCount: 1,
        repaymentCommencement: 'Post sanction',
        interestRateType: 'Fixed',
        interestRate,
        totalInterestAmount: totalInterest,
        feePayableToRe: processingFee,
        thirdPartyFee: 0,
        netDisbursedAmount: netDisbursed,
        totalAmountPayable: totalRepayment,
        annualPercentageRate: apr,
      },
      fees: {
        processingFee: {
          rate: 15,
          amount: processingFee,
          payableTo: 'Fintree Finance Private Limited',
          frequency: 'ONE_TIME',
        },
        thirdPartyFees: [],
      },
      charges: {
        penalCharge: {
          description: 'One-time penal charges up to 10% + Applicable Taxes',
          minimumAmount: 100,
          maximumAmount: 3000,
          applicableTaxText: 'GST / Statutory Taxes',
        },
        bounceCharges: [
          {
            minimumAmount: 500,
            maximumAmount: 500,
            displayRange: 'Per bounce event',
            chargeAmount: 500,
          },
        ],
        foreclosure: {
          applicable: true,
          rate: 6,
          description: '6% per annum after cooling-off period',
        },
      },
      schedules: {
        repayments,
        illustrativeAprSchedule,
      },
      coolingOff: {
        days: 3,
        startEventText: 'Commences from date of electronic acceptance',
        cancellationEmail: 'wecare@fintreefinance.com',
        penaltyFree: true,
        proportionateInterestPayable: true,
        policyText: '3 Days cooling off period without prepayment penalty',
      },
      grievance: {
        officerName: 'Ms. Sneha Shetty',
        officerDesignation: 'Grievance Redressal Officer',
        officerAddress:
          '4th Floor, Engineering Centre, 9 Mathew Road, Opera House, Charni Road (East), Mumbai 400004',
        officerContact: '18002678111',
        officerEmail: 'wecare@fintreefinance.com',
        resolutionDays: 15,
        principalNodalOfficerName: 'Mr. Sandeep Chhowala',
        principalNodalOfficerAddress:
          '4th Floor, Engineering Centre, 9 Mathew Road, Opera House, Charni Road (East), Mumbai 400004',
        principalNodalOfficerContact: '18002678111',
        principalNodalOfficerEmail: 'pno@fintreefinance.com',
        policyUrl: 'https://www.fintreefinance.com',
      },
      recovery: {
        methods: [
          'In-house / Outsource Recovery Agents',
          'Telephone Recovery (Human)',
          'Digital Recovery',
          'Reminder Communication',
          'Legal Notice',
          'Arbitration, Mediation & Conciliation',
          'Civil / Criminal legal actions',
        ],
        communicationStartTime: '08:00 AM',
        communicationEndTime: '07:00 PM',
        recoveryAgentClause: 'Clause 27',
        legalNoticeAllowed: true,
        arbitrationAllowed: true,
        civilActionAllowed: true,
        criminalActionAllowed: true,
      },
      declarations: {
        householdIncomeConfirmed: true,
        annualHouseholdIncome: Number(customer?.annualHouseholdIncome || customer?.monthlyIncome * 12 || 350000),
        microfinanceExcluded: true,
        vernacularApplicable: false,
        endUsePurpose: 'Personal / Business Needs',
        endUseUndertakingApplicable: true,
        selfDeclarationAccepted: true,
      },
      authorizedSignatory: {
        name: 'Authorized Signatory',
        designation: 'Fintree Finance Private Limited',
        imageUrl: authorizedSignatoryImage,
      },
      authorizedSignatoryImage,
      electronicAcceptance,
    };
  }
}
