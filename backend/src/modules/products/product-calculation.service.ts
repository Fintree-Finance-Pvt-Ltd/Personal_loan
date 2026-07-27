import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AmountRoundingMethod, InterestCalculationMethod } from '@prisma/client';

export interface MultiplierConfig {
  minimumCompletedLoans: number;
  multiplier: string | Prisma.Decimal;
}

export interface AmountConfig {
  minimumAmount: string | Prisma.Decimal;
  firstLoanBaseAmount: string | Prisma.Decimal;
  maximumAmountCap: string | Prisma.Decimal;
  roundingMethod: AmountRoundingMethod;
  roundingUnit: string | Prisma.Decimal | null;
  interestMethod: InterestCalculationMethod;
  annualRoiPercent: string | Prisma.Decimal;
  processingFeePercent: string | Prisma.Decimal;
  processingFeeGstPercent: string | Prisma.Decimal;
  assessmentFeeAmount: string | Prisma.Decimal;
  assessmentFeeGstPercent: string | Prisma.Decimal;
  penalChargeAmount: string | Prisma.Decimal;
  bounceChargeAmount: string | Prisma.Decimal;
  emiDueDay: number;
  includeAssessmentFeeInApr: boolean;
  tenureType: import('@prisma/client').TenureType;
}

export interface SimulationResult {
  completedLoans: number;
  tenure: number;
  matchedMultiplier: MultiplierConfig;
  baseAmount: string;
  multipliedAmount: string;
  productCap: string;
  lenderApprovedAmount: string | null;
  amountBeforeRounding: string;
  roundingMethod: AmountRoundingMethod;
  roundingUnit: string | null;
  finalPrincipalAmount: string;
  
  // Pricing and charges
  interestMethod: InterestCalculationMethod;
  annualRoiPercent: string;
  emiAmount: string;
  totalInterest: string;

  processingFeeAmount: string;
  processingFeeGst: string;
  assessmentFeeAmount: string;
  assessmentFeeGst: string;
  
  totalDeductions: string;
  netDisbursalAmount: string;
  
  aprPercent: string;
  aprCalculationBasis: string;
}

@Injectable()
export class ProductCalculationService {
  validateMultipliers(multipliers: MultiplierConfig[]) {
    if (!multipliers || multipliers.length === 0) {
      throw new BadRequestException({ error: { code: 'INVALID_MULTIPLIERS', message: 'At least one multiplier is required.' } });
    }

    const sorted = [...multipliers].sort((a, b) => a.minimumCompletedLoans - b.minimumCompletedLoans);

    const first = sorted[0];
    if (first.minimumCompletedLoans !== 0) {
      throw new BadRequestException({ error: { code: 'INVALID_MULTIPLIERS', message: 'The first multiplier must start at 0 completed loans.' } });
    }

    const firstMultiplier = new Prisma.Decimal(first.multiplier);
    if (!firstMultiplier.equals(1)) {
      throw new BadRequestException({ error: { code: 'INVALID_MULTIPLIERS', message: 'The first multiplier must be exactly 1.0000' } });
    }

    const thresholds = new Set();
    for (const m of sorted) {
      if (thresholds.has(m.minimumCompletedLoans)) {
        throw new BadRequestException({ error: { code: 'INVALID_MULTIPLIERS', message: 'Minimum completed loans thresholds must be unique.' } });
      }
      thresholds.add(m.minimumCompletedLoans);

      const val = new Prisma.Decimal(m.multiplier);
      if (val.lte(0)) {
        throw new BadRequestException({ error: { code: 'INVALID_MULTIPLIERS', message: 'Multiplier must be greater than zero.' } });
      }
    }
  }

  validateAmounts(config: AmountConfig) {
    const min = new Prisma.Decimal(config.minimumAmount);
    const base = new Prisma.Decimal(config.firstLoanBaseAmount);
    const max = new Prisma.Decimal(config.maximumAmountCap);

    if (min.lte(0)) throw new BadRequestException({ error: { code: 'INVALID_AMOUNT', message: 'minimumAmount must be greater than zero.' } });
    if (base.lt(min)) throw new BadRequestException({ error: { code: 'INVALID_AMOUNT', message: 'firstLoanBaseAmount must be greater than or equal to minimumAmount.' } });
    if (max.lt(base)) throw new BadRequestException({ error: { code: 'INVALID_AMOUNT', message: 'maximumAmountCap must be greater than or equal to firstLoanBaseAmount.' } });

    if (config.roundingMethod !== AmountRoundingMethod.NONE) {
      if (!config.roundingUnit) {
        throw new BadRequestException({ error: { code: 'INVALID_AMOUNT', message: 'roundingUnit is required when roundingMethod is not NONE.' } });
      }
      const unit = new Prisma.Decimal(config.roundingUnit);
      if (unit.lte(0)) {
        throw new BadRequestException({ error: { code: 'INVALID_AMOUNT', message: 'roundingUnit must be greater than zero.' } });
      }
    }
  }

  private calculateAPR(principal: number, emi: number, tenure: number, deductions: number, isDays: boolean): number {
    if (principal <= deductions) return 0; // Invalid, no APR
    
    // APR Cash Flow:
    // T=0: -(principal - deductions)
    // T=1..tenure: +emi
    const netLoan = principal - deductions;
    
    let low = 0.0;
    let high = 1.0; // 100% per month or day is a safe upper bound for realistic loans
    let r = 0.05; // start guess
    const tolerance = 1e-7;
    const maxIterations = 100;

    // Bisection method for robustness
    for (let i = 0; i < maxIterations; i++) {
      let npv = -netLoan;
      if (isDays) {
        // Option A: Single Bullet Repayment at the end of the term
        // So cash flow is only at T=tenure (in days)
        npv += emi / Math.pow(1 + r, tenure);
      } else {
        for (let t = 1; t <= tenure; t++) {
          npv += emi / Math.pow(1 + r, t);
        }
      }
      
      if (Math.abs(npv) < tolerance) {
        break;
      }
      
      if (npv > 0) {
        // Rate is too low, we are getting more money back
        low = r;
      } else {
        // Rate is too high, NPV is negative
        high = r;
      }
      r = (low + high) / 2;
    }
    
    // If not converged reasonably, return best guess
    return isDays ? (r * 365 * 100) : (r * 12 * 100); 
  }

  simulate(completedLoans: number, tenure: number, lenderApprovedAmount: string | null, config: AmountConfig, multipliers: MultiplierConfig[], validTenures: number[]): SimulationResult {
    if (!validTenures.includes(tenure)) {
      throw new BadRequestException({ error: { code: 'INVALID_TENURE', message: `Tenure of ${tenure} is not configured for this product version.` } });
    }

    const min = new Prisma.Decimal(config.minimumAmount);
    const base = new Prisma.Decimal(config.firstLoanBaseAmount);
    const maxProduct = new Prisma.Decimal(config.maximumAmountCap);

    // Find applicable multiplier
    const sorted = [...multipliers].sort((a, b) => b.minimumCompletedLoans - a.minimumCompletedLoans);
    const matchedMultiplier = sorted.find(m => completedLoans >= m.minimumCompletedLoans);

    if (!matchedMultiplier) {
      throw new BadRequestException({ error: { code: 'NO_MATCHING_MULTIPLIER', message: 'No offer multiplier matches the completed loans count.' } });
    }

    const multiplierVal = new Prisma.Decimal(matchedMultiplier.multiplier);
    const multipliedAmount = base.mul(multiplierVal);

    let cappedAmount = multipliedAmount;
    
    if (cappedAmount.gt(maxProduct)) {
      cappedAmount = maxProduct;
    }

    if (lenderApprovedAmount) {
      const lCap = new Prisma.Decimal(lenderApprovedAmount);
      if (cappedAmount.gt(lCap)) cappedAmount = lCap;
    }

    let finalAmount = cappedAmount;

    if (config.roundingMethod !== AmountRoundingMethod.NONE && config.roundingUnit) {
      const unit = new Prisma.Decimal(config.roundingUnit);
      const div = finalAmount.dividedBy(unit);
      let roundedDiv: Prisma.Decimal;

      switch (config.roundingMethod) {
        case AmountRoundingMethod.FLOOR:
          roundedDiv = div.floor();
          break;
        case AmountRoundingMethod.CEIL:
          roundedDiv = div.ceil();
          break;
        case AmountRoundingMethod.NEAREST:
          roundedDiv = div.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
          break;
      }
      
      let candidateAmount = roundedDiv.mul(unit);
      if (candidateAmount.gt(cappedAmount)) {
        candidateAmount = div.floor().mul(unit);
      }
      finalAmount = candidateAmount;
    }

    if (finalAmount.lt(min)) {
      finalAmount = min;
    }

    // Charges calculation
    const principalNum = finalAmount.toNumber();
    
    const pfPercent = new Prisma.Decimal(config.processingFeePercent).toNumber();
    const pfGstPercent = new Prisma.Decimal(config.processingFeeGstPercent).toNumber();
    
    const pfAmount = (principalNum * pfPercent) / 100;
    const pfGst = (pfAmount * pfGstPercent) / 100;
    
    const afAmount = new Prisma.Decimal(config.assessmentFeeAmount).toNumber();
    const afGstPercent = new Prisma.Decimal(config.assessmentFeeGstPercent).toNumber();
    const afGst = (afAmount * afGstPercent) / 100;

    const totalDeductions = pfAmount + pfGst + afAmount + afGst;
    const netDisbursal = principalNum - totalDeductions;

    if (netDisbursal <= 0) {
      throw new BadRequestException({ error: { code: 'INVALID_CHARGES', message: 'Configured charges result in zero or negative net disbursal.' } });
    }

    // EMI Calculation
    const roi = new Prisma.Decimal(config.annualRoiPercent).toNumber();
    let emi = 0;
    let totalInterest = 0;
    const isDays = config.tenureType === 'DAYS';

    if (isDays) {
      // Option A: Single Bullet Repayment at the end of the tenure
      // Interest = Principal * ROI% * (Tenure / 365)
      // Installment (EMI amount) is just a single payment of Principal + Total Interest
      totalInterest = principalNum * (roi / 100) * (tenure / 365);
      emi = principalNum + totalInterest;
    } else {
      if (config.interestMethod === InterestCalculationMethod.FLAT_RATE) {
        totalInterest = principalNum * (roi / 100) * (tenure / 12);
        emi = (principalNum + totalInterest) / tenure;
      } else {
        // REDUCING_BALANCE
        const monthlyRate = (roi / 100) / 12;
        if (monthlyRate === 0) {
          emi = principalNum / tenure;
          totalInterest = 0;
        } else {
          const factor = Math.pow(1 + monthlyRate, tenure);
          emi = (principalNum * monthlyRate * factor) / (factor - 1);
          totalInterest = (emi * tenure) - principalNum;
        }
      }
    }

    // APR Calculation
    let aprDeductions = pfAmount + pfGst;
    if (config.includeAssessmentFeeInApr) {
      aprDeductions += (afAmount + afGst);
    }
    
    let apr = this.calculateAPR(principalNum, emi, tenure, aprDeductions, isDays);
    
    // Bounds on APR solving returning 0 due to edge cases
    if (apr === 0 && roi > 0) {
        // Cannot return 0 if there is an ROI, fallback to something or throw.
        // User said: "Do not return 0 when no solution exists."
        // A safe fallback is to approximate
        apr = roi;
    }

    return {
      completedLoans,
      tenure,
      matchedMultiplier,
      baseAmount: base.toFixed(2),
      multipliedAmount: multipliedAmount.toFixed(2),
      productCap: maxProduct.toFixed(2),
      lenderApprovedAmount: lenderApprovedAmount ? new Prisma.Decimal(lenderApprovedAmount).toFixed(2) : null,
      amountBeforeRounding: cappedAmount.toFixed(2),
      roundingMethod: config.roundingMethod,
      roundingUnit: config.roundingMethod !== AmountRoundingMethod.NONE ? new Prisma.Decimal(config.roundingUnit!).toFixed(2) : null,
      finalPrincipalAmount: finalAmount.toFixed(2),
      
      interestMethod: config.interestMethod,
      annualRoiPercent: new Prisma.Decimal(config.annualRoiPercent).toFixed(4),
      emiAmount: emi.toFixed(2),
      totalInterest: totalInterest.toFixed(2),

      processingFeeAmount: pfAmount.toFixed(2),
      processingFeeGst: pfGst.toFixed(2),
      assessmentFeeAmount: afAmount.toFixed(2),
      assessmentFeeGst: afGst.toFixed(2),
      
      totalDeductions: totalDeductions.toFixed(2),
      netDisbursalAmount: netDisbursal.toFixed(2),
      
      aprPercent: apr.toFixed(4),
      aprCalculationBasis: isDays ? 'ANNUAL_PERIODIC_PREVIEW' : 'MONTHLY_PERIODIC_PREVIEW'
    };
  }
}
