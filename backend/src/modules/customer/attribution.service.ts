import { Injectable, Logger } from '@nestjs/common';
import { AcquisitionSource, Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AttributionInput, NormalizedAttribution } from './attribution.types';

@Injectable()
export class AttributionService {
  private readonly logger = new Logger(AttributionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Deterministically resolves incoming parameters to one of the 9 controlled AcquisitionSource enums:
   * RM, GOOGLE, META, MARKETING, PARTNER, ORGANIC, REFERRAL, WEBSITE, OTHER.
   */
  resolveAcquisitionSource(input?: AttributionInput | null): AcquisitionSource {
    if (!input) return AcquisitionSource.WEBSITE;

    const rawSource = input.acquisitionSource ? String(input.acquisitionSource).trim().toUpperCase() : null;
    const utmSource = input.utmSource ? String(input.utmSource).trim().toLowerCase() : null;
    const utmMedium = input.utmMedium ? String(input.utmMedium).trim().toLowerCase() : null;
    const utmCampaign = input.utmCampaign ? String(input.utmCampaign).trim().toLowerCase() : null;
    const rmId = input.rmId ? String(input.rmId).trim() : null;
    const rmName = input.rmName ? String(input.rmName).trim() : null;
    const partnerCode = input.partnerCode ? String(input.partnerCode).trim() : null;
    const partnerName = input.partnerName ? String(input.partnerName).trim() : null;
    const referralCode = input.referralCode ? String(input.referralCode).trim() : null;
    const clickId = input.clickId ? String(input.clickId).trim().toLowerCase() : null;
    const referrer = input.referrer ? String(input.referrer).trim().toLowerCase() : null;

    // 1. Explicit RM channel identifiers
    if (rawSource === 'RM' || rmId || rmName || utmSource === 'rm' || utmMedium === 'rm') {
      return AcquisitionSource.RM;
    }

    // 2. Explicit PARTNER / DSA channel identifiers
    if (rawSource === 'PARTNER' || partnerCode || partnerName || utmSource === 'partner' || utmSource === 'dsa') {
      return AcquisitionSource.PARTNER;
    }

    // 3. Referral flow (ref / referralCode)
    if (rawSource === 'REFERRAL' || referralCode || utmSource === 'referral' || utmMedium === 'referral') {
      return AcquisitionSource.REFERRAL;
    }

    // 4. Google Ads / Search Attribution
    if (
      rawSource === 'GOOGLE' ||
      clickId?.startsWith('gclid') ||
      clickId?.includes('gclid') ||
      utmSource === 'google' ||
      utmSource === 'googleads' ||
      utmSource === 'adwords' ||
      ((utmMedium === 'cpc' || utmMedium === 'ppc' || utmMedium === 'search') && referrer?.includes('google'))
    ) {
      return AcquisitionSource.GOOGLE;
    }

    // 5. Meta / Facebook / Instagram Ads Attribution
    if (
      rawSource === 'META' ||
      clickId?.startsWith('fbclid') ||
      clickId?.includes('fbclid') ||
      utmSource === 'meta' ||
      utmSource === 'facebook' ||
      utmSource === 'instagram' ||
      utmSource === 'fb' ||
      utmSource === 'ig' ||
      ((utmMedium === 'paid_social' || utmMedium === 'social_paid') && (referrer?.includes('facebook') || referrer?.includes('instagram')))
    ) {
      return AcquisitionSource.META;
    }

    // 6. Explicit valid enum matches
    if (rawSource && Object.values(AcquisitionSource).includes(rawSource as AcquisitionSource)) {
      return rawSource as AcquisitionSource;
    }

    // 7. General Marketing campaigns (email, newsletter, affiliates, sms, banners, other UTMs)
    if (
      rawSource === 'MARKETING' ||
      utmCampaign ||
      utmSource ||
      (utmMedium && ['email', 'newsletter', 'sms', 'whatsapp', 'affiliate', 'display', 'banner', 'cpm'].includes(utmMedium))
    ) {
      return AcquisitionSource.MARKETING;
    }

    // 8. Organic search traffic
    if (
      rawSource === 'ORGANIC' ||
      utmMedium === 'organic' ||
      (referrer && (referrer.includes('google.') || referrer.includes('bing.') || referrer.includes('yahoo.') || referrer.includes('duckduckgo.')))
    ) {
      return AcquisitionSource.ORGANIC;
    }

    // 9. Explicit OTHER
    if (rawSource === 'OTHER') {
      return AcquisitionSource.OTHER;
    }

    // 10. Default Direct / Website visit
    return AcquisitionSource.WEBSITE;
  }

  /**
   * Normalizes an incoming attribution payload and ensures non-empty strings or null.
   */
  normalizeAttribution(input?: AttributionInput | null): NormalizedAttribution {
    const acquisitionSource = this.resolveAcquisitionSource(input);
    const cleanStr = (val: unknown, maxLen = 150): string | null => {
      if (typeof val !== 'string') return null;
      const trimmed = val.trim();
      return trimmed.length > 0 ? trimmed.slice(0, maxLen) : null;
    };

    return {
      acquisitionSource,
      utmSource: cleanStr(input?.utmSource, 100),
      utmMedium: cleanStr(input?.utmMedium, 100),
      utmCampaign: cleanStr(input?.utmCampaign, 150),
      utmTerm: cleanStr(input?.utmTerm, 150),
      utmContent: cleanStr(input?.utmContent, 150),
      rmId: cleanStr(input?.rmId, 100),
      rmName: cleanStr(input?.rmName, 150),
      partnerCode: cleanStr(input?.partnerCode, 100),
      partnerName: cleanStr(input?.partnerName, 150),
      referralCode: cleanStr(input?.referralCode, 100),
      clickId: cleanStr(input?.clickId, 255),
      landingPage: cleanStr(input?.landingPage, 500),
      referrer: cleanStr(input?.referrer, 500),
    };
  }

  /**
   * Records attribution for a customer.
   * - If no attribution exists yet: creates First-Touch attribution (IMMUTABLE).
   * - If customer already exists: updates Last-Touch attribution if new marketing data is provided.
   */
  async recordCustomerAttribution(
    tx: Prisma.TransactionClient | PrismaService,
    customerId: bigint,
    input?: AttributionInput | null,
  ) {
    const normalized = this.normalizeAttribution(input);
    const existing = await tx.customerAttribution.findUnique({
      where: { customerId },
    });

    const now = new Date();

    if (!existing) {
      // First-Touch Attribution creation
      this.logger.log(`Recording first-touch attribution for customer ${customerId.toString()}: ${normalized.acquisitionSource}`);
      return tx.customerAttribution.create({
        data: {
          customerId,
          firstSource: normalized.acquisitionSource,
          firstUtmSource: normalized.utmSource,
          firstUtmMedium: normalized.utmMedium,
          firstUtmCampaign: normalized.utmCampaign,
          firstUtmTerm: normalized.utmTerm,
          firstUtmContent: normalized.utmContent,
          firstRmId: normalized.rmId,
          firstRmName: normalized.rmName,
          firstPartnerCode: normalized.partnerCode,
          firstPartnerName: normalized.partnerName,
          firstReferralCode: normalized.referralCode,
          firstClickId: normalized.clickId,
          firstLandingPage: normalized.landingPage,
          firstReferrer: normalized.referrer,
          firstTouchAt: now,
        },
      });
    }

    // If existing record was previously just default unassigned 'WEBSITE' with no campaign/channel params,
    // and now we receive actual RM / Partner / Campaign attribution on customer sign-in:
    const isFirstTouchUnassigned =
      existing.firstSource === AcquisitionSource.WEBSITE &&
      !existing.firstRmId &&
      !existing.firstPartnerCode &&
      !existing.firstReferralCode &&
      !existing.firstUtmSource &&
      !existing.firstUtmCampaign;

    if (isFirstTouchUnassigned && normalized.acquisitionSource !== AcquisitionSource.WEBSITE) {
      this.logger.log(`Assigning first-touch attribution for customer ${customerId.toString()}: ${normalized.acquisitionSource}`);
      return tx.customerAttribution.update({
        where: { customerId },
        data: {
          firstSource: normalized.acquisitionSource,
          firstUtmSource: normalized.utmSource,
          firstUtmMedium: normalized.utmMedium,
          firstUtmCampaign: normalized.utmCampaign,
          firstUtmTerm: normalized.utmTerm,
          firstUtmContent: normalized.utmContent,
          firstRmId: normalized.rmId,
          firstRmName: normalized.rmName,
          firstPartnerCode: normalized.partnerCode,
          firstPartnerName: normalized.partnerName,
          firstReferralCode: normalized.referralCode,
          firstClickId: normalized.clickId,
          firstLandingPage: normalized.landingPage,
          firstReferrer: normalized.referrer,
        },
      });
    }

    // If new marketing/touch parameters are present, update Last-Touch without modifying First-Touch
    const hasNewTouchData =
      normalized.acquisitionSource !== AcquisitionSource.WEBSITE ||
      normalized.utmSource !== null ||
      normalized.utmCampaign !== null ||
      normalized.rmId !== null ||
      normalized.partnerCode !== null ||
      normalized.referralCode !== null;

    if (hasNewTouchData) {
      this.logger.log(`Updating last-touch attribution for customer ${customerId.toString()}: ${normalized.acquisitionSource}`);
      return tx.customerAttribution.update({
        where: { customerId },
        data: {
          lastSource: normalized.acquisitionSource,
          lastUtmSource: normalized.utmSource,
          lastUtmMedium: normalized.utmMedium,
          lastUtmCampaign: normalized.utmCampaign,
          lastUtmTerm: normalized.utmTerm,
          lastUtmContent: normalized.utmContent,
          lastRmId: normalized.rmId,
          lastRmName: normalized.rmName,
          lastPartnerCode: normalized.partnerCode,
          lastPartnerName: normalized.partnerName,
          lastReferralCode: normalized.referralCode,
          lastClickId: normalized.clickId,
          lastLandingPage: normalized.landingPage,
          lastReferrer: normalized.referrer,
          lastTouchAt: now,
        },
      });
    }


    return existing;
  }

  /**
   * Creates an immutable attribution snapshot for a newly created application.
   * Links application attribution to the customer's acquisition data.
   */
  async createApplicationAttributionSnapshot(
    tx: Prisma.TransactionClient | PrismaService,
    applicationId: bigint,
    customerId: bigint,
    sessionInput?: AttributionInput | null,
  ) {
    // Check if application attribution already exists
    const existing = await tx.applicationAttribution.findUnique({
      where: { applicationId },
    });
    if (existing) return existing;

    // Fetch customer attribution or normalize session input
    const customerAttr = await tx.customerAttribution.findUnique({
      where: { customerId },
    });

    const now = new Date();

    if (customerAttr) {
      // Use the most relevant source: lastTouch if present, otherwise firstTouch
      const source = customerAttr.lastSource || customerAttr.firstSource;
      const isLast = Boolean(customerAttr.lastSource);

      return tx.applicationAttribution.create({
        data: {
          applicationId,
          acquisitionSource: source,
          utmSource: isLast ? customerAttr.lastUtmSource : customerAttr.firstUtmSource,
          utmMedium: isLast ? customerAttr.lastUtmMedium : customerAttr.firstUtmMedium,
          utmCampaign: isLast ? customerAttr.lastUtmCampaign : customerAttr.firstUtmCampaign,
          utmTerm: isLast ? customerAttr.lastUtmTerm : customerAttr.firstUtmTerm,
          utmContent: isLast ? customerAttr.lastUtmContent : customerAttr.firstUtmContent,
          rmId: isLast ? customerAttr.lastRmId : customerAttr.firstRmId,
          rmName: isLast ? customerAttr.lastRmName : customerAttr.firstRmName,
          partnerCode: isLast ? customerAttr.lastPartnerCode : customerAttr.firstPartnerCode,
          partnerName: isLast ? customerAttr.lastPartnerName : customerAttr.firstPartnerName,
          referralCode: isLast ? customerAttr.lastReferralCode : customerAttr.firstReferralCode,
          clickId: isLast ? customerAttr.lastClickId : customerAttr.firstClickId,
          landingPage: isLast ? customerAttr.lastLandingPage : customerAttr.firstLandingPage,
          referrer: isLast ? customerAttr.lastReferrer : customerAttr.firstReferrer,
          capturedAt: now,
        },
      });
    }

    // Fallback: normalize from session input
    const normalized = this.normalizeAttribution(sessionInput);
    return tx.applicationAttribution.create({
      data: {
        applicationId,
        acquisitionSource: normalized.acquisitionSource,
        utmSource: normalized.utmSource,
        utmMedium: normalized.utmMedium,
        utmCampaign: normalized.utmCampaign,
        utmTerm: normalized.utmTerm,
        utmContent: normalized.utmContent,
        rmId: normalized.rmId,
        rmName: normalized.rmName,
        partnerCode: normalized.partnerCode,
        partnerName: normalized.partnerName,
        referralCode: normalized.referralCode,
        clickId: normalized.clickId,
        landingPage: normalized.landingPage,
        referrer: normalized.referrer,
        capturedAt: now,
      },
    });
  }
}
