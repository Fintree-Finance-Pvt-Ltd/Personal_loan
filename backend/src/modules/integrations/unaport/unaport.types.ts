export interface UnaportLoginRequest {
  emailId: string;
  password: string;
}

export interface UnaportLoginResponse {
  timestamp?: string;
  txnId?: string;
  version?: string;
  access_token: string;
  expires_in: number;
  refresh_expires_in: number;
  refresh_token: string;
  token_type?: string;
}

export interface UnaportRefreshTokenRequest {
  refresh_token: string;
}

export interface UnaportRefreshTokenResponse {
  timestamp?: string;
  txnId?: string;
  version?: string;
  access_token: string;
  expires_in: number;
  refresh_expires_in: number;
  refresh_token: string;
  token_type?: string;
}

export interface UnaportSdkThemeConfig {
  background: string;
  accent: string;
  primary: string;
  primaryText: string;
  primaryButtonText: string;
  secondary: string;
  secondaryText: string;
  disabled: string;
  disabledText: string;
  border: string;
  hintText: string;
  errorText: string;
  loaderColor: string;
  fontName: string;
}

export interface UnaportSdkConfig {
  theme: UnaportSdkThemeConfig;
  productId: string;
  phoneNumber: string;
  trackingId: string;
  fiuId: string;
  FIType: string;
  templateId?: string;
  accessToken: string;
  refreshToken: string;
}

export interface UnaportConsentNotificationPayload {
  ver?: string;
  timestamp?: string;
  txnid?: string;
  Notifier?: {
    type?: string;
    id?: string;
  };
  ConsentStatusNotification?: {
    consentId?: string | null;
    consentHandle?: string | null;
    consentStatus?: string;
  };
  trackingId?: string;
}

export interface UnaportDataNotificationPayload {
  ver?: string;
  timestamp?: string;
  txnid?: string;
  Notifier?: {
    type?: string;
    id?: string;
  };
  FIStatusNotification?: {
    sessionId?: string;
    sessionStatus?: string;
    FIStatusResponse?: any;
  };
  consentId?: string;
  trackingId?: string;
}

export interface UnaportFetchDataAccountSummary {
  currentBalance?: number | string;
  availableBalance?: number | string;
  balanceDateTime?: string;
  currency?: string;
}

export interface UnaportFetchDataTransaction {
  txnId?: string;
  type?: string; // CREDIT / DEBIT
  mode?: string;
  amount?: number | string;
  currentBalance?: number | string;
  balance?: number | string;
  transactionTimestamp?: string;
  txnDate?: string;
  valueDate?: string;
  narration?: string;
  reference?: string;
}

export interface UnaportFetchDataAccount {
  fipId?: string;
  fipName?: string;
  accountType?: string;
  maskedAccNo?: string;
  accNumber?: string;
  accountHolderName?: string;
  ifscCode?: string;
  branch?: string;
  summary?: UnaportFetchDataAccountSummary;
  transactions?: {
    transaction?: UnaportFetchDataTransaction[];
  } | UnaportFetchDataTransaction[];
}

export interface UnaportFetchDataResponse {
  version?: string;
  txnId?: string;
  data?: UnaportFetchDataAccount[];
  timestamp?: string;
}
