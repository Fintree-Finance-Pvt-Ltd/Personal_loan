import { AcquisitionSource } from '@prisma/client';
import { AttributionService } from './attribution.service';

describe('AttributionService', () => {
  let service: AttributionService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      customerAttribution: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      applicationAttribution: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };
    service = new AttributionService(mockPrisma);
  });

  describe('resolveAcquisitionSource - all 9 controlled sources', () => {
    it('1. resolves RM source when rm_id, rm_name or RM utm is present', () => {
      expect(service.resolveAcquisitionSource({ rmId: 'RM-101', rmName: 'Rahul Sharma' })).toBe(AcquisitionSource.RM);
      expect(service.resolveAcquisitionSource({ utmSource: 'rm' })).toBe(AcquisitionSource.RM);
      expect(service.resolveAcquisitionSource({ acquisitionSource: 'RM' })).toBe(AcquisitionSource.RM);
    });

    it('2. resolves GOOGLE source when gclid, google utm_source, or google cpc is present', () => {
      expect(service.resolveAcquisitionSource({ utmSource: 'google', utmMedium: 'cpc', utmCampaign: 'search_pl' })).toBe(AcquisitionSource.GOOGLE);
      expect(service.resolveAcquisitionSource({ clickId: 'gclid_12345' })).toBe(AcquisitionSource.GOOGLE);
      expect(service.resolveAcquisitionSource({ utmSource: 'googleads' })).toBe(AcquisitionSource.GOOGLE);
      expect(service.resolveAcquisitionSource({ utmMedium: 'cpc', referrer: 'https://www.google.com/' })).toBe(AcquisitionSource.GOOGLE);
    });

    it('3. resolves META source when fbclid, facebook/meta/instagram utm_source or paid_social is present', () => {
      expect(service.resolveAcquisitionSource({ utmSource: 'facebook', utmMedium: 'paid_social', utmCampaign: 'festive_offer' })).toBe(AcquisitionSource.META);
      expect(service.resolveAcquisitionSource({ utmSource: 'meta' })).toBe(AcquisitionSource.META);
      expect(service.resolveAcquisitionSource({ utmSource: 'instagram' })).toBe(AcquisitionSource.META);
      expect(service.resolveAcquisitionSource({ clickId: 'fbclid_98765' })).toBe(AcquisitionSource.META);
    });

    it('4. resolves MARKETING source when campaign, newsletter, email, or general UTMs are present', () => {
      expect(service.resolveAcquisitionSource({ utmSource: 'newsletter', utmMedium: 'email', utmCampaign: 'monsoon_sale' })).toBe(AcquisitionSource.MARKETING);
      expect(service.resolveAcquisitionSource({ utmCampaign: 'diwali_blast' })).toBe(AcquisitionSource.MARKETING);
      expect(service.resolveAcquisitionSource({ utmMedium: 'affiliate' })).toBe(AcquisitionSource.MARKETING);
    });

    it('5. resolves PARTNER source when partner_code, partner_name or partner utm is present', () => {
      expect(service.resolveAcquisitionSource({ partnerCode: 'DSA-555', partnerName: 'FinServe Prime' })).toBe(AcquisitionSource.PARTNER);
      expect(service.resolveAcquisitionSource({ utmSource: 'partner' })).toBe(AcquisitionSource.PARTNER);
      expect(service.resolveAcquisitionSource({ acquisitionSource: 'PARTNER' })).toBe(AcquisitionSource.PARTNER);
    });

    it('6. resolves ORGANIC source when organic medium or search engine referrer is present without paid utms', () => {
      expect(service.resolveAcquisitionSource({ utmMedium: 'organic' })).toBe(AcquisitionSource.ORGANIC);
      expect(service.resolveAcquisitionSource({ referrer: 'https://www.google.com/search?q=personal+loan' })).toBe(AcquisitionSource.ORGANIC);
      expect(service.resolveAcquisitionSource({ referrer: 'https://www.bing.com/' })).toBe(AcquisitionSource.ORGANIC);
    });

    it('7. resolves REFERRAL source when referralCode, ref or referral utm is present', () => {
      expect(service.resolveAcquisitionSource({ referralCode: 'REF-USER-789' })).toBe(AcquisitionSource.REFERRAL);
      expect(service.resolveAcquisitionSource({ utmSource: 'referral' })).toBe(AcquisitionSource.REFERRAL);
      expect(service.resolveAcquisitionSource({ utmMedium: 'referral' })).toBe(AcquisitionSource.REFERRAL);
    });

    it('8. resolves WEBSITE source when direct / internal navigation without marketing parameters', () => {
      expect(service.resolveAcquisitionSource({})).toBe(AcquisitionSource.WEBSITE);
      expect(service.resolveAcquisitionSource(null)).toBe(AcquisitionSource.WEBSITE);
      expect(service.resolveAcquisitionSource({ acquisitionSource: 'WEBSITE' })).toBe(AcquisitionSource.WEBSITE);
    });

    it('9. resolves OTHER source when explicit OTHER is provided', () => {
      expect(service.resolveAcquisitionSource({ acquisitionSource: 'OTHER' })).toBe(AcquisitionSource.OTHER);
    });
  });

  describe('First-Touch Immutability and Last-Touch Tracking', () => {
    it('creates first-touch attribution on first interaction', async () => {
      const customerId = 100n;
      mockPrisma.customerAttribution.findUnique.mockResolvedValue(null);
      mockPrisma.customerAttribution.create.mockImplementation((args: any) => Promise.resolve({ id: 1n, ...args.data }));

      const result = await service.recordCustomerAttribution(mockPrisma, customerId, {
        utmSource: 'google',
        utmMedium: 'cpc',
        utmCampaign: 'pl_launch',
        clickId: 'gclid_abc123',
      });

      expect(mockPrisma.customerAttribution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerId: 100n,
            firstSource: AcquisitionSource.GOOGLE,
            firstUtmSource: 'google',
            firstUtmMedium: 'cpc',
            firstUtmCampaign: 'pl_launch',
            firstClickId: 'gclid_abc123',
          }),
        }),
      );
      expect(result.firstSource).toBe(AcquisitionSource.GOOGLE);
    });

    it('preserves first-touch attribution and updates last-touch when customer returns through another campaign', async () => {
      const customerId = 100n;
      const existingFirstTouch = {
        id: 1n,
        customerId: 100n,
        firstSource: AcquisitionSource.GOOGLE,
        firstUtmSource: 'google',
        firstUtmMedium: 'cpc',
        firstUtmCampaign: 'pl_launch',
        lastSource: null,
        lastUtmSource: null,
      };

      mockPrisma.customerAttribution.findUnique.mockResolvedValue(existingFirstTouch);
      mockPrisma.customerAttribution.update.mockImplementation((args: any) => Promise.resolve({ ...existingFirstTouch, ...args.data }));

      const result = await service.recordCustomerAttribution(mockPrisma, customerId, {
        utmSource: 'facebook',
        utmMedium: 'paid_social',
        utmCampaign: 'retargeting_q3',
        clickId: 'fbclid_xyz789',
      });

      expect(mockPrisma.customerAttribution.create).not.toHaveBeenCalled();
      expect(mockPrisma.customerAttribution.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId: 100n },
          data: expect.objectContaining({
            lastSource: AcquisitionSource.META,
            lastUtmSource: 'facebook',
            lastUtmMedium: 'paid_social',
            lastUtmCampaign: 'retargeting_q3',
            lastClickId: 'fbclid_xyz789',
          }),
        }),
      );

      // First touch fields remain unchanged
      expect(result.firstSource).toBe(AcquisitionSource.GOOGLE);
      expect(result.lastSource).toBe(AcquisitionSource.META);
    });
  });

  describe('Application Attribution Snapshot', () => {
    it('snapshots customer attribution to newly created application', async () => {
      const applicationId = 501n;
      const customerId = 100n;

      mockPrisma.applicationAttribution.findUnique.mockResolvedValue(null);
      mockPrisma.customerAttribution.findUnique.mockResolvedValue({
        customerId: 100n,
        firstSource: AcquisitionSource.RM,
        firstRmId: 'RM-99',
        firstRmName: 'Priya Mehta',
        lastSource: null,
      });
      mockPrisma.applicationAttribution.create.mockImplementation((args: any) => Promise.resolve({ id: 10n, ...args.data }));

      const snapshot = await service.createApplicationAttributionSnapshot(mockPrisma, applicationId, customerId);

      expect(mockPrisma.applicationAttribution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            applicationId: 501n,
            acquisitionSource: AcquisitionSource.RM,
            rmId: 'RM-99',
            rmName: 'Priya Mehta',
          }),
        }),
      );
      expect(snapshot.acquisitionSource).toBe(AcquisitionSource.RM);
    });
  });
});
