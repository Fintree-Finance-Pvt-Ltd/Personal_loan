export interface FinanalyzPanResponse {
  message?: string;

  data?: {
    endUserId?: string;

    response?: {
      code?: number;
      pan?: string;
      maskedAadhaar?: string;
      lastFourDigit?: string;
      typeOfHolder?: string;
      name?: string;
      firstName?: string;
      middleName?: string;
      lastName?: string;
      gender?: string;
      dob?: string;
      address?: string;
      city?: string;
      state?: string;
      country?: string;
      pincode?: string;
      mobile_no?: string;
      email?: string;
      isValid?: boolean;
      aadhaarSeedingStatus?: boolean;
      tax?: boolean;
    };

    applicationId?: string;

    status?: {
      statusCode?: number;
      statusMessage?: string;

      input?: {
        panNumber?: string;
      };

      timestamp?: string;
    };
  };
}

export interface NormalizedPanVerificationData {
  providerApplicationId: string | null;
  panNumber: string;
  isValid: boolean;
  fullName: string | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  fatherName?: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  dateOfBirth: string | null;
  maskedAadhaar: string | null;
  aadhaarLastFourDigits: string | null;
  aadhaarSeedingStatus: boolean | null;
  typeOfHolder: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pincode: string | null;
  maskedMobile: string | null;
  maskedEmail: string | null;
  providerStatusCode: number | null;
  providerStatusMessage: string | null;
  providerTimestamp: string | null;
}