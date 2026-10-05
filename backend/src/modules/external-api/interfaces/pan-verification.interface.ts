export interface FinanalyzPanV5Details {
  full_name?: string;
  full_name_split?: string[];
  masked_aadhaar?: string;
  address?: {
    line_1?: string;
    line_2?: string;
    street_name?: string;
    zip?: string;
    city?: string;
    state?: string;
    country?: string;
    full?: string;
  };
  email?: string | null;
  phone_number?: string | null;
  gender?: string;
  dob?: string;
  input_dob?: string | null;
  aadhaar_linked?: boolean;
  dob_verified?: boolean;
  dob_check?: boolean;
  category?: string;
  father_name?: string;
}

export interface FinanalyzPanResponse {
  status_code?: number;
  success?: boolean;
  message?: string;
  message_code?: string;

  data?: {
    // V5 fields
    client_id?: string;
    pan_number?: string;
    pan_details?: FinanalyzPanV5Details;
    less_info?: boolean;

    // Legacy fields
    endUserId?: string;
    applicationId?: string;

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
      father_name?: string;
      fatherName?: string;
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