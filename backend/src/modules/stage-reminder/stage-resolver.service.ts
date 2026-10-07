import { Injectable, Logger } from '@nestjs/common';
import { CustomerAccountStatus, PlApplicationStatus, PlLoanStatus } from '@prisma/client';
import { ApplicationStageResolution } from './stage-reminder.types';

@Injectable()
export class StageResolverService {
  private readonly logger = new Logger(StageResolverService.name);

  /**
   * Resolves the canonical stage and terminal status for a loan application.
   */
  resolveStage(app: any): ApplicationStageResolution {
    if (!app) {
      return {
        stage: 'UNKNOWN',
        stageDisplayName: 'Application',
        isTerminal: true,
        terminalReason: 'Application not found',
      };
    }

    const customer = app.customer;
    const loan = Array.isArray(app.loans) && app.loans.length > 0 ? app.loans[0] : app.loan || null;
    const customerMobile = customer?.mobileNumber || '';
    const customerName = customer?.fullName || 'Customer';
    const reference = app.platformLan || app.applicationNumber || (loan ? loan.lan : `APP-${app.id}`);
    const lan = loan?.lan || app.platformLan || undefined;

    // 1. Check Customer Account Terminal Status
    if (customer?.accountStatus && customer.accountStatus !== CustomerAccountStatus.ACTIVE) {
      return {
        stage: 'CUSTOMER_INACTIVE',
        stageDisplayName: 'Account Inactive',
        isTerminal: true,
        terminalReason: `Customer account is ${customer.accountStatus}`,
        customerMobile,
        customerName,
        reference,
        lan,
      };
    }

    // 2. Check Loan Terminal Statuses (Disbursed, Closed, Cancelled)
    if (loan) {
      if (
        loan.status === PlLoanStatus.DISBURSED ||
        loan.disbursalStatus === 'DISBURSED' ||
        loan.disbursalCompletedAt != null
      ) {
        return {
          stage: 'DISBURSED',
          stageDisplayName: 'Loan Disbursed',
          isTerminal: true,
          terminalReason: 'Loan has already been successfully disbursed',
          customerMobile,
          customerName,
          reference,
          lan,
        };
      }

      if (loan.status === PlLoanStatus.FULLY_PAID) {
        return {
          stage: 'LOAN_CLOSED',
          stageDisplayName: 'Loan Closed',
          isTerminal: true,
          terminalReason: 'Loan has been fully paid / closed',
          customerMobile,
          customerName,
          reference,
          lan,
        };
      }

      if (loan.status === PlLoanStatus.CANCELLED || loan.status === PlLoanStatus.FAILED) {
        return {
          stage: 'LOAN_CANCELLED',
          stageDisplayName: 'Loan Cancelled',
          isTerminal: true,
          terminalReason: `Loan status is ${loan.status}`,
          customerMobile,
          customerName,
          reference,
          lan,
        };
      }
    }

    // 3. Check Application Status Terminal Statuses (Rejected, Closed)
    if (app.status === PlApplicationStatus.PLATFORM_REJECTED) {
      return {
        stage: 'PLATFORM_REJECTED',
        stageDisplayName: 'Application Rejected',
        isTerminal: true,
        terminalReason: 'Application was rejected by platform BRE',
        customerMobile,
        customerName,
        reference,
        lan,
      };
    }

    if (app.status === PlApplicationStatus.LENDER_REJECTED) {
      return {
        stage: 'LENDER_REJECTED',
        stageDisplayName: 'Lender Rejected',
        isTerminal: true,
        terminalReason: 'Application was rejected by lender',
        customerMobile,
        customerName,
        reference,
        lan,
      };
    }

    if (app.status === PlApplicationStatus.LOAN_CLOSED) {
      return {
        stage: 'LOAN_CLOSED',
        stageDisplayName: 'Loan Closed',
        isTerminal: true,
        terminalReason: 'Application marked as LOAN_CLOSED',
        customerMobile,
        customerName,
        reference,
        lan,
      };
    }

    // 4. Post-Approval Stages (when loan record exists)
    if (loan) {
      const step = String(loan.currentStep || '').toUpperCase();

      if (
        loan.status === PlLoanStatus.READY_FOR_DISBURSAL ||
        loan.status === PlLoanStatus.DISBURSAL_PROCESSING ||
        step === 'READY_FOR_DISBURSAL' ||
        step === 'DISBURSAL_PROCESSING' ||
        loan.esignCompleted
      ) {
        return {
          stage: 'READY_FOR_DISBURSAL',
          stageDisplayName: 'Loan Disbursal Processing',
          isTerminal: false,
          customerMobile,
          customerName,
          reference,
          lan,
        };
      }

      if (step === 'ESIGN' || loan.mandateCompleted) {
        return {
          stage: 'ESIGN',
          stageDisplayName: 'e-Sign Loan Agreement',
          isTerminal: false,
          customerMobile,
          customerName,
          reference,
          lan,
        };
      }

      if (step === 'EMANDATE' || step === 'MANDATE' || loan.kfsAccepted) {
        return {
          stage: 'EMANDATE',
          stageDisplayName: 'e-Mandate Setup',
          isTerminal: false,
          customerMobile,
          customerName,
          reference,
          lan,
        };
      }

      if (step === 'KFS' || step === 'KFS_ACCEPTANCE' || loan.bankVerified) {
        return {
          stage: 'KFS_ACCEPTANCE',
          stageDisplayName: 'KFS (Key Fact Statement) Review',
          isTerminal: false,
          customerMobile,
          customerName,
          reference,
          lan,
        };
      }

      if (step === 'BANK_VERIFICATION' || step === 'BANK_DETAILS' || loan.acceptedTenureDays) {
        return {
          stage: 'BANK_VERIFICATION',
          stageDisplayName: 'Bank Account Verification',
          isTerminal: false,
          customerMobile,
          customerName,
          reference,
          lan,
        };
      }

      if (step === 'ADDRESS_CONFIRMATION' || step === 'CURRENT_ADDRESS') {
        return {
          stage: 'ADDRESS_CONFIRMATION',
          stageDisplayName: 'Current Address Confirmation',
          isTerminal: false,
          customerMobile,
          customerName,
          reference,
          lan,
        };
      }

      if (step === 'DIGILOCKER_KYC') {
        return {
          stage: 'DIGILOCKER_KYC',
          stageDisplayName: 'Aadhaar DigiLocker KYC',
          isTerminal: false,
          customerMobile,
          customerName,
          reference,
          lan,
        };
      }

      return {
        stage: 'APPROVAL_SUMMARY',
        stageDisplayName: 'Loan Offer Acceptance',
        isTerminal: false,
        customerMobile,
        customerName,
        reference,
        lan,
      };
    }

    // 5. Pre-Approval Application Stages (Based on PlApplicationStatus)
    switch (app.status) {
      case PlApplicationStatus.LENDER_APPROVED:
        return {
          stage: 'LENDER_APPROVED',
          stageDisplayName: 'Loan Offer Acceptance',
          isTerminal: false,
          customerMobile,
          customerName,
          reference,
          lan,
        };

      case PlApplicationStatus.LENDER_PRE_APPROVED:
        return {
          stage: 'LENDER_PRE_APPROVED',
          stageDisplayName: 'Pre-Approved Offer Selection',
          isTerminal: false,
          customerMobile,
          customerName,
          reference,
          lan,
        };

      case PlApplicationStatus.PENDING_CREDIT_REVIEW:
        return {
          stage: 'PENDING_CREDIT_REVIEW',
          stageDisplayName: 'Credit Review',
          isTerminal: false,
          customerMobile,
          customerName,
          reference,
          lan,
        };

      case PlApplicationStatus.LENDER_REVIEW:
        return {
          stage: 'LENDER_REVIEW',
          stageDisplayName: 'Lender Verification',
          isTerminal: false,
          customerMobile,
          customerName,
          reference,
          lan,
        };

      case PlApplicationStatus.LENDER_ALLOCATED:
      case PlApplicationStatus.ALLOCATION_PENDING:
        return {
          stage: 'ALLOCATION_PENDING',
          stageDisplayName: 'Lender Allocation',
          isTerminal: false,
          customerMobile,
          customerName,
          reference,
          lan,
        };

      case PlApplicationStatus.ASSESSMENT_FEE_PAID:
        return {
          stage: 'ASSESSMENT_FEE_PAID',
          stageDisplayName: 'Lender Allocation Processing',
          isTerminal: false,
          customerMobile,
          customerName,
          reference,
          lan,
        };

      case PlApplicationStatus.SUBMITTED:
        return {
          stage: 'SUBMITTED',
          stageDisplayName: 'Application Verification',
          isTerminal: false,
          customerMobile,
          customerName,
          reference,
          lan,
        };

      case PlApplicationStatus.DRAFT:
      default:
        // Identify specific missing part of draft
        if (!customer?.panNumber || !customer?.panStatus) {
          return {
            stage: 'PAN_VERIFICATION',
            stageDisplayName: 'PAN Verification',
            isTerminal: false,
            customerMobile,
            customerName,
            reference,
            lan,
          };
        }
        if (!customer?.employmentType || !customer?.monthlyIncome) {
          return {
            stage: 'EMPLOYMENT_DETAILS',
            stageDisplayName: 'Employment & Income Details',
            isTerminal: false,
            customerMobile,
            customerName,
            reference,
            lan,
          };
        }
        if (!customer?.aadhaarNumber && !customer?.aadhaarVerified) {
          return {
            stage: 'AADHAAR_VERIFICATION',
            stageDisplayName: 'Aadhaar Verification',
            isTerminal: false,
            customerMobile,
            customerName,
            reference,
            lan,
          };
        }
        return {
          stage: 'DRAFT',
          stageDisplayName: 'Application Details Submission',
          isTerminal: false,
          customerMobile,
          customerName,
          reference,
          lan,
        };
    }
  }
}
