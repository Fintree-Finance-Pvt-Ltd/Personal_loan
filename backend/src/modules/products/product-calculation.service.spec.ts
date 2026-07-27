import { Test, TestingModule } from '@nestjs/testing';
import { ProductCalculationService, TierConfig, AmountConfig } from './product-calculation.service';
import { AmountRoundingMethod } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

describe('ProductCalculationService', () => {
  let service: ProductCalculationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProductCalculationService],
    }).compile();

    service = module.get<ProductCalculationService>(ProductCalculationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateTiers', () => {
    it('should pass for valid contiguous tiers', () => {
      const tiers: TierConfig[] = [
        { completedLoansFrom: 0, completedLoansTo: 0, multiplier: '1.0000', tierCap: null },
        { completedLoansFrom: 1, completedLoansTo: 2, multiplier: '1.2500', tierCap: null },
        { completedLoansFrom: 3, completedLoansTo: null, multiplier: '1.5000', tierCap: null },
      ];
      expect(() => service.validateTiers(tiers)).not.toThrow();
    });

    it('should throw if first tier is not 0-0', () => {
      const tiers: TierConfig[] = [
        { completedLoansFrom: 0, completedLoansTo: 1, multiplier: '1.0000', tierCap: null },
      ];
      expect(() => service.validateTiers(tiers)).toThrow(BadRequestException);
    });

    it('should throw if first tier multiplier is not 1', () => {
      const tiers: TierConfig[] = [
        { completedLoansFrom: 0, completedLoansTo: 0, multiplier: '1.1000', tierCap: null },
      ];
      expect(() => service.validateTiers(tiers)).toThrow(BadRequestException);
    });

    it('should throw on gap', () => {
      const tiers: TierConfig[] = [
        { completedLoansFrom: 0, completedLoansTo: 0, multiplier: '1.0000', tierCap: null },
        { completedLoansFrom: 2, completedLoansTo: null, multiplier: '1.5000', tierCap: null },
      ];
      expect(() => service.validateTiers(tiers)).toThrow(BadRequestException);
    });

    it('should throw on overlap', () => {
      const tiers: TierConfig[] = [
        { completedLoansFrom: 0, completedLoansTo: 0, multiplier: '1.0000', tierCap: null },
        { completedLoansFrom: 1, completedLoansTo: 2, multiplier: '1.5000', tierCap: null },
        { completedLoansFrom: 2, completedLoansTo: null, multiplier: '2.0000', tierCap: null },
      ];
      expect(() => service.validateTiers(tiers)).toThrow(BadRequestException);
    });

    it('should throw if non-final tier is open-ended', () => {
      const tiers: TierConfig[] = [
        { completedLoansFrom: 0, completedLoansTo: 0, multiplier: '1.0000', tierCap: null },
        { completedLoansFrom: 1, completedLoansTo: null, multiplier: '1.5000', tierCap: null },
        { completedLoansFrom: 2, completedLoansTo: null, multiplier: '2.0000', tierCap: null },
      ];
      expect(() => service.validateTiers(tiers)).toThrow(BadRequestException);
    });
  });

  describe('simulate', () => {
    const config: AmountConfig = {
      minimumAmount: '1000.00',
      firstLoanBaseAmount: '5000.00',
      maximumAmountCap: '10000.00',
      roundingMethod: AmountRoundingMethod.NONE,
      roundingUnit: null,
    };

    const tiers: TierConfig[] = [
      { completedLoansFrom: 0, completedLoansTo: 0, multiplier: '1.0000', tierCap: null },
      { completedLoansFrom: 1, completedLoansTo: 1, multiplier: '1.5000', tierCap: '7000.00' },
      { completedLoansFrom: 2, completedLoansTo: null, multiplier: '2.5000', tierCap: null },
    ];

    it('should calculate base amount correctly for first loan', () => {
      const result = service.simulate(0, null, config, tiers);
      expect(result.finalAmount).toBe('5000.00');
      expect(result.multipliedAmount).toBe('5000.00');
    });

    it('should apply tier cap correctly', () => {
      const result = service.simulate(1, null, config, tiers);
      // Base (5000) * Multiplier (1.5) = 7500. Tier cap is 7000.
      expect(result.multipliedAmount).toBe('7500.00');
      expect(result.finalAmount).toBe('7000.00');
    });

    it('should apply maximum product cap correctly', () => {
      const result = service.simulate(2, null, config, tiers);
      // Base (5000) * Multiplier (2.5) = 12500. Max Cap is 10000.
      expect(result.multipliedAmount).toBe('12500.00');
      expect(result.finalAmount).toBe('10000.00');
    });

    it('should apply lender approved amount correctly', () => {
      const result = service.simulate(2, '9000.00', config, tiers);
      expect(result.finalAmount).toBe('9000.00');
    });

    it('should enforce rounding FLOOR', () => {
      const result = service.simulate(1, null, { ...config, roundingMethod: AmountRoundingMethod.FLOOR, roundingUnit: '500.00' }, [
        { completedLoansFrom: 0, completedLoansTo: 0, multiplier: '1.0000', tierCap: null },
        { completedLoansFrom: 1, completedLoansTo: 1, multiplier: '1.1000', tierCap: null }, // 5000 * 1.1 = 5500. No change.
        { completedLoansFrom: 2, completedLoansTo: null, multiplier: '1.1500', tierCap: null }, // 5000 * 1.15 = 5750. FLOOR(500) -> 5500.
      ]);
      expect(result.finalAmount).toBe('5500.00');
    });

    it('should enforce rounding NEAREST', () => {
      const result = service.simulate(2, null, { ...config, roundingMethod: AmountRoundingMethod.NEAREST, roundingUnit: '500.00' }, [
        { completedLoansFrom: 0, completedLoansTo: 0, multiplier: '1.0000', tierCap: null },
        { completedLoansFrom: 1, completedLoansTo: 1, multiplier: '1.1000', tierCap: null },
        { completedLoansFrom: 2, completedLoansTo: null, multiplier: '1.1500', tierCap: null }, // 5750. NEAREST(500) -> 6000.
      ]);
      expect(result.finalAmount).toBe('6000.00');
    });
    
    it('should enforce rounding CEIL but not exceed caps', () => {
      const result = service.simulate(2, null, { ...config, maximumAmountCap: '5800.00', roundingMethod: AmountRoundingMethod.CEIL, roundingUnit: '500.00' }, [
        { completedLoansFrom: 0, completedLoansTo: 0, multiplier: '1.0000', tierCap: null },
        { completedLoansFrom: 1, completedLoansTo: 1, multiplier: '1.1000', tierCap: null },
        { completedLoansFrom: 2, completedLoansTo: null, multiplier: '1.1500', tierCap: null }, // 5750. Cap=5800. CEIL(500)=6000 (Exceeds cap!). Should fallback to FLOOR=5500.
      ]);
      expect(result.finalAmount).toBe('5500.00');
    });
  });
});
