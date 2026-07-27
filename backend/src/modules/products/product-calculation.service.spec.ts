import { Test, TestingModule } from '@nestjs/testing';
import { ProductCalculationService, MultiplierConfig, AmountConfig } from './product-calculation.service';
import { AmountRoundingMethod, InterestCalculationMethod } from '@prisma/client';
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

  describe('validateMultipliers', () => {
    it('should pass for valid multipliers', () => {
      const multipliers: MultiplierConfig[] = [
        { minimumCompletedLoans: 0, multiplier: '1.0000' },
        { minimumCompletedLoans: 1, multiplier: '1.2500' },
        { minimumCompletedLoans: 3, multiplier: '1.5000' },
      ];
      expect(() => service.validateMultipliers(multipliers)).not.toThrow();
    });

    it('should throw if first multiplier is not 0', () => {
      const multipliers: MultiplierConfig[] = [
        { minimumCompletedLoans: 1, multiplier: '1.0000' },
      ];
      expect(() => service.validateMultipliers(multipliers)).toThrow(BadRequestException);
    });

    it('should throw if first multiplier value is not 1', () => {
      const multipliers: MultiplierConfig[] = [
        { minimumCompletedLoans: 0, multiplier: '1.1000' },
      ];
      expect(() => service.validateMultipliers(multipliers)).toThrow(BadRequestException);
    });

    it('should throw on duplicate thresholds', () => {
      const multipliers: MultiplierConfig[] = [
        { minimumCompletedLoans: 0, multiplier: '1.0000' },
        { minimumCompletedLoans: 1, multiplier: '1.5000' },
        { minimumCompletedLoans: 1, multiplier: '2.0000' },
      ];
      expect(() => service.validateMultipliers(multipliers)).toThrow(BadRequestException);
    });
  });

  describe('simulate', () => {
    const config: AmountConfig = {
      minimumAmount: '1000.00',
      firstLoanBaseAmount: '5000.00',
      maximumAmountCap: '10000.00',
      roundingMethod: AmountRoundingMethod.NONE,
      roundingUnit: null,
      interestMethod: InterestCalculationMethod.REDUCING_BALANCE,
      annualRoiPercent: '12.00', // 1% per month
      processingFeePercent: '2.00',
      processingFeeGstPercent: '18.00',
      assessmentFeeAmount: '500.00',
      assessmentFeeGstPercent: '18.00',
      penalChargeAmount: '50.00',
      bounceChargeAmount: '200.00',
      emiDueDay: 5,
      includeAssessmentFeeInApr: false,
      tenureType: 'MONTHS',
    };

    const multipliers: MultiplierConfig[] = [
      { minimumCompletedLoans: 0, multiplier: '1.0000' },
      { minimumCompletedLoans: 1, multiplier: '1.5000' },
      { minimumCompletedLoans: 2, multiplier: '2.5000' },
    ];

    const validTenures = [3, 6, 12];

    it('should throw if tenure is invalid', () => {
      expect(() => service.simulate(0, 4, null, config, multipliers, validTenures)).toThrow(BadRequestException);
    });

    it('should calculate base amount and deductions correctly for first loan', () => {
      const result = service.simulate(0, 12, null, config, multipliers, validTenures);
      expect(result.finalPrincipalAmount).toBe('5000.00');
      expect(result.multipliedAmount).toBe('5000.00');
      
      // PF: 5000 * 2% = 100
      // PF GST: 100 * 18% = 18
      // AF: 500
      // AF GST: 500 * 18% = 90
      // Total Deductions = 100 + 18 + 500 + 90 = 708
      expect(result.processingFeeAmount).toBe('100.00');
      expect(result.processingFeeGst).toBe('18.00');
      expect(result.assessmentFeeAmount).toBe('500.00');
      expect(result.assessmentFeeGst).toBe('90.00');
      expect(result.totalDeductions).toBe('708.00');
      expect(result.netDisbursalAmount).toBe('4292.00');
    });

    it('should calculate EMI for reducing balance', () => {
      const result = service.simulate(0, 12, null, config, multipliers, validTenures);
      // Principal: 5000, ROI: 12% pa (1% pm), Tenure: 12
      // EMI = 5000 * 0.01 * (1.01)^12 / ((1.01)^12 - 1)
      // EMI = approx 444.24
      expect(parseFloat(result.emiAmount)).toBeCloseTo(444.24, 1);
    });

    it('should apply maximum product cap correctly', () => {
      const result = service.simulate(2, 6, null, config, multipliers, validTenures);
      // Base (5000) * Multiplier (2.5) = 12500. Max Cap is 10000.
      expect(result.multipliedAmount).toBe('12500.00');
      expect(result.finalPrincipalAmount).toBe('10000.00');
    });

    it('should apply lender approved amount correctly', () => {
      const result = service.simulate(2, 6, '9000.00', config, multipliers, validTenures);
      expect(result.finalPrincipalAmount).toBe('9000.00');
    });

    it('should enforce rounding FLOOR', () => {
      const result = service.simulate(1, 6, null, { ...config, roundingMethod: AmountRoundingMethod.FLOOR, roundingUnit: '500.00' }, [
        { minimumCompletedLoans: 0, multiplier: '1.0000' },
        { minimumCompletedLoans: 1, multiplier: '1.1500' }, // 5000 * 1.15 = 5750. FLOOR(500) -> 5500.
      ], validTenures);
      expect(result.finalPrincipalAmount).toBe('5500.00');
    });
    
    it('should calculate a valid APR', () => {
      const result = service.simulate(0, 12, null, config, multipliers, validTenures);
      // It should calculate some APR, ensure it's a number and greater than 0
      const apr = parseFloat(result.aprPercent);
      expect(apr).toBeGreaterThan(0);
    });
  });
});
