import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AmountRoundingMethod } from '@prisma/client';

export interface TierConfig {
  completedLoansFrom: number;
  completedLoansTo: number | null;
  multiplier: string | Prisma.Decimal;
  tierCap: string | Prisma.Decimal | null;
}

export interface AmountConfig {
  minimumAmount: string | Prisma.Decimal;
  firstLoanBaseAmount: string | Prisma.Decimal;
  maximumAmountCap: string | Prisma.Decimal;
  roundingMethod: AmountRoundingMethod;
  roundingUnit: string | Prisma.Decimal | null;
}

export interface SimulationResult {
  completedLoans: number;
  matchedTier: TierConfig;
  baseAmount: string;
  multipliedAmount: string;
  productCap: string;
  tierCapApplied: string;
  lenderApprovedAmount: string | null;
  amountBeforeRounding: string;
  roundingMethod: AmountRoundingMethod;
  roundingUnit: string | null;
  finalAmount: string;
}

@Injectable()
export class ProductCalculationService {
  validateTiers(tiers: TierConfig[]) {
    if (!tiers || tiers.length === 0) {
      throw new BadRequestException({ error: { code: 'INVALID_TIERS', message: 'At least one tier is required.' } });
    }

    const sortedTiers = [...tiers].sort((a, b) => a.completedLoansFrom - b.completedLoansFrom);

    const firstTier = sortedTiers[0];
    if (firstTier.completedLoansFrom !== 0) {
      throw new BadRequestException({ error: { code: 'INVALID_TIERS', message: 'The first tier must start at 0 completed loans.' } });
    }

    const firstTierMultiplier = new Prisma.Decimal(firstTier.multiplier);
    if (firstTierMultiplier.lte(0)) {
      throw new BadRequestException({ error: { code: 'INVALID_TIERS', message: 'Multiplier must be greater than zero.' } });
    }

    let expectedNextStart: number;
    if (firstTier.completedLoansTo === null) {
      if (sortedTiers.length > 1) {
        throw new BadRequestException({ error: { code: 'INVALID_TIERS', message: 'Only the final tier can be open-ended.' } });
      }
      expectedNextStart = Infinity;
    } else {
      if (firstTier.completedLoansTo < firstTier.completedLoansFrom) {
        throw new BadRequestException({ error: { code: 'INVALID_TIERS', message: 'completedLoansTo cannot be less than completedLoansFrom.' } });
      }
      expectedNextStart = firstTier.completedLoansTo + 1;
    }

    for (let i = 1; i < sortedTiers.length; i++) {
      const tier = sortedTiers[i];

      if (tier.completedLoansFrom !== expectedNextStart) {
        if (tier.completedLoansFrom < expectedNextStart) {
          throw new BadRequestException({ error: { code: 'INVALID_TIERS', message: `Tier ranges overlap at completed loans: ${tier.completedLoansFrom}` } });
        } else {
          throw new BadRequestException({ error: { code: 'INVALID_TIERS', message: `Tier ranges have a gap before completed loans: ${tier.completedLoansFrom}` } });
        }
      }

      const multiplier = new Prisma.Decimal(tier.multiplier);
      if (multiplier.lte(0)) {
        throw new BadRequestException({ error: { code: 'INVALID_TIERS', message: 'Multiplier must be greater than zero.' } });
      }

      if (tier.completedLoansTo === null) {
        if (i !== sortedTiers.length - 1) {
          throw new BadRequestException({ error: { code: 'INVALID_TIERS', message: 'Only the final tier can be open-ended.' } });
        }
        expectedNextStart = Infinity; // Validated
      } else {
        if (tier.completedLoansTo < tier.completedLoansFrom) {
          throw new BadRequestException({ error: { code: 'INVALID_TIERS', message: 'completedLoansTo cannot be less than completedLoansFrom.' } });
        }
        expectedNextStart = tier.completedLoansTo + 1;
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

  simulate(completedLoans: number, lenderApprovedAmount: string | null, config: AmountConfig, tiers: TierConfig[]): SimulationResult {
    const min = new Prisma.Decimal(config.minimumAmount);
    const base = new Prisma.Decimal(config.firstLoanBaseAmount);
    const maxProduct = new Prisma.Decimal(config.maximumAmountCap);

    const matchedTier = tiers.find(t => 
      completedLoans >= t.completedLoansFrom && 
      (t.completedLoansTo === null || completedLoans <= t.completedLoansTo)
    );

    if (!matchedTier) {
      throw new BadRequestException({ error: { code: 'NO_MATCHING_TIER', message: 'No offer tier matches the completed loans count.' } });
    }

    const multiplier = new Prisma.Decimal(matchedTier.multiplier);
    const multipliedAmount = base.mul(multiplier);

    let cappedAmount = multipliedAmount;
    
    if (matchedTier.tierCap) {
      const tCap = new Prisma.Decimal(matchedTier.tierCap);
      if (cappedAmount.gt(tCap)) cappedAmount = tCap;
    }

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
      
      // Never allow rounding to increase the result above any applicable cap
      if (candidateAmount.gt(cappedAmount)) {
        // If it rounded up past the cap, fallback to FLOOR rounding
        candidateAmount = div.floor().mul(unit);
      }
      finalAmount = candidateAmount;
    }

    // Never return less than minimumAmount unless input constraints are invalid
    if (finalAmount.lt(min)) {
      finalAmount = min;
    }

    return {
      completedLoans,
      matchedTier,
      baseAmount: base.toFixed(2),
      multipliedAmount: multipliedAmount.toFixed(2),
      productCap: maxProduct.toFixed(2),
      tierCapApplied: matchedTier.tierCap ? new Prisma.Decimal(matchedTier.tierCap).toFixed(2) : maxProduct.toFixed(2),
      lenderApprovedAmount: lenderApprovedAmount ? new Prisma.Decimal(lenderApprovedAmount).toFixed(2) : null,
      amountBeforeRounding: cappedAmount.toFixed(2),
      roundingMethod: config.roundingMethod,
      roundingUnit: config.roundingMethod !== AmountRoundingMethod.NONE ? new Prisma.Decimal(config.roundingUnit!).toFixed(2) : null,
      finalAmount: finalAmount.toFixed(2),
    };
  }
}
