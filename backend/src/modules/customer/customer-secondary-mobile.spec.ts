import { BadRequestException } from '@nestjs/common';
import { UnaportService } from '../integrations/unaport/unaport.service';
import { CustomerService } from './customer.service';

describe('Secondary Bank Mobile Number Support', () => {
  describe('CustomerService direct secondary mobile save (without OTP)', () => {
    it('directly saves secondary mobile number to database without OTP', async () => {
      const mockPrisma: any = {
        customer: {
          findUnique: jest.fn().mockResolvedValue({
            id: 1n,
            mobileNumber: '9876543210',
            accountStatus: 'ACTIVE',
          }),
          update: jest.fn().mockImplementation(({ data }) => ({
            id: 1n,
            mobileNumber: '9876543210',
            ...data,
          })),
        },
      };

      const customerService = new CustomerService(
        mockPrisma,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      const res = await customerService.saveSecondaryMobile(1n, '9123456780');

      expect(res.success).toBe(true);
      expect(mockPrisma.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1n },
          data: expect.objectContaining({
            secondaryMobileNumber: '9123456780',
            secondaryMobileVerified: true,
          }),
        }),
      );
      // Primary mobile must NOT be touched!
      expect(mockPrisma.customer.update.mock.calls[0][0].data.mobileNumber).toBeUndefined();
    });

    it('rejects invalid mobile numbers when saving secondary mobile', async () => {
      const mockPrisma: any = { customer: { findUnique: jest.fn() } };
      const customerService = new CustomerService(
        mockPrisma,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await expect(customerService.saveSecondaryMobile(1n, 'invalid')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('UnaportService AA Mobile Number Selection Logic', () => {
    it('prioritizes verified secondary mobile number over primary login mobile number', async () => {
      const mockPrisma: any = {
        customer: {
          findUnique: jest.fn().mockResolvedValue({
            id: 1n,
            mobileNumber: '9876543210',
            secondaryMobileNumber: '9123456780',
            secondaryMobileVerified: true,
          }),
        },
        plLoan: { findFirst: jest.fn().mockResolvedValue(null) },
        plApplication: { findFirst: jest.fn().mockResolvedValue({ id: 10n }) },
        customerAccountAggregatorRequest: {
          findFirst: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({}),
        },
      };

      const mockTokenService: any = {
        getValidTokens: jest.fn().mockResolvedValue({ accessToken: 'acc_token', refreshToken: 'ref_token' }),
      };

      const mockConfigService: any = {
        get: jest.fn((key: string, def?: any) => {
          if (key === 'UNAPORT_PRODUCT_ID') return 'prod_123';
          if (key === 'UNAPORT_FIU_ID') return 'fiu_123';
          if (key === 'UNAPORT_SDK_URL') return 'https://sdk.sandbox.unaport.com/view';
          return def;
        }),
      };

      const unaportService = new UnaportService(
        mockPrisma,
        mockConfigService,
        mockTokenService,
        {} as any,
        {} as any,
      );

      const res = await unaportService.initiateAccountAggregator(1n, 'APP-10');
      expect(res.sdkUrl).toBeDefined();

      // Decode the config parameter from sdkUrl
      const url = new URL(res.sdkUrl);
      const encodedConfig = url.searchParams.get('config');
      const decodedConfig = JSON.parse(Buffer.from(encodedConfig!, 'base64').toString('utf8'));

      // Verified secondary number MUST be passed to the SDK config!
      expect(decodedConfig.phoneNumber).toBe('9123456780');
    });

    it('falls back to customer primary mobile number when secondary is not verified', async () => {
      const mockPrisma: any = {
        customer: {
          findUnique: jest.fn().mockResolvedValue({
            id: 1n,
            mobileNumber: '9876543210',
            secondaryMobileNumber: '9123456780',
            secondaryMobileVerified: false, // NOT verified
          }),
        },
        plLoan: { findFirst: jest.fn().mockResolvedValue(null) },
        plApplication: { findFirst: jest.fn().mockResolvedValue({ id: 10n }) },
        customerAccountAggregatorRequest: {
          findFirst: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({}),
        },
      };

      const mockTokenService: any = {
        getValidTokens: jest.fn().mockResolvedValue({ accessToken: 'acc_token', refreshToken: 'ref_token' }),
      };

      const mockConfigService: any = {
        get: jest.fn((key: string, def?: any) => {
          if (key === 'UNAPORT_PRODUCT_ID') return 'prod_123';
          if (key === 'UNAPORT_FIU_ID') return 'fiu_123';
          if (key === 'UNAPORT_SDK_URL') return 'https://sdk.sandbox.unaport.com/view';
          return def;
        }),
      };

      const unaportService = new UnaportService(
        mockPrisma,
        mockConfigService,
        mockTokenService,
        {} as any,
        {} as any,
      );

      const res = await unaportService.initiateAccountAggregator(1n, 'APP-10');
      const url = new URL(res.sdkUrl);
      const encodedConfig = url.searchParams.get('config');
      const decodedConfig = JSON.parse(Buffer.from(encodedConfig!, 'base64').toString('utf8'));

      // Primary login number MUST be used when secondary is unverified!
      expect(decodedConfig.phoneNumber).toBe('9876543210');
    });
  });
});
