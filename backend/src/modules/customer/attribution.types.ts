import { AcquisitionSource } from '@prisma/client';

export { AcquisitionSource };

export interface AttributionInput {
  acquisitionSource?: string | AcquisitionSource | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  rmId?: string | null;
  rmName?: string | null;
  partnerCode?: string | null;
  partnerName?: string | null;
  referralCode?: string | null;
  clickId?: string | null;
  landingPage?: string | null;
  referrer?: string | null;
}

export interface NormalizedAttribution {
  acquisitionSource: AcquisitionSource;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  rmId: string | null;
  rmName: string | null;
  partnerCode: string | null;
  partnerName: string | null;
  referralCode: string | null;
  clickId: string | null;
  landingPage: string | null;
  referrer: string | null;
}
