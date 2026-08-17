# Fintree Lender Integration — Full API Contract

This document lists every API call exchanged between the Personal Loan Platform (PLP) and Fintree Finance, with the **complete request payload** (maximum field set), **exact response schema**, and the **actual configured route** for each — pulled directly from the live integration config and adapter code. Share this with Fintree's integration team to verify their endpoints match what we actually send.

Base URL and every path below are read live from `LenderIntegrationConfig` (adapterKey `FINTREE_FINANCE_V1`, adapterVersion `1`) — not illustrative placeholders.

| | |
|---|---|
| **Base URL (UAT)** | `https://uat.fintreelms.com` |
| **Auth type** | API key |
| **Timeouts** | Connect 5000ms / Request 15000ms |
| **Retry schedule** | 5 attempts at 0s, 60s, 300s (5m), 900s (15m), 3600s (1h) after a retryable failure |

---

## 1. Authentication & Common Headers

Every request below carries these headers. There is **no HMAC signing** — authentication is a single shared API key.

| Header | Value | Notes |
|---|---|---|
| `content-type` | `application/json` | Always sent |
| `x-api-key` | *(shared secret Fintree issued to PLP)* | Confirm on your side this matches the key you issued — not printed here |
| `X-Correlation-Id` | UUID v4 | Fresh per outbound attempt, for tracing |
| `Idempotency-Key` | `{applicationNumber}:{EVENT_TYPE}:V{version}` | Stable per logical operation — retried attempts of the *same* operation reuse the *same* key. Exact patterns per endpoint are listed below. |
| `X-Client-Id` | *(not currently sent — `clientId` is unset in config)* | Reserved, present in code path but inactive today |

Every response is expected in the same envelope on both success and failure:

```json
// Success
{ "success": true, "data": { ... }, "correlationId": "uuid" }

// Failure
{ "success": false, "error": { "code": "string", "message": "string", "details": {} }, "correlationId": "uuid" }
```
A non-2xx HTTP status is expected to carry the failure envelope above (`code`/`message` required, `details` optional).

---

## 2. Outbound Endpoints (PLP → Fintree)

### 2.1 Create Application
Creates the loan file at Fintree the moment a customer is allocated to Fintree and starts onboarding.

- **Method / Path:** `POST /api/partner/v1/application`
- **Idempotency-Key:** `{applicationNumber}:LENDER_CREATE_APPLICATION:V1`

**Request body (complete):**
```json
{
  "externalApplicationReference": "APP-260811-E11728EF",
  "lan": "FTPL00000006",
  "sourceSystem": "FINTREE_PLP",
  "productCode": "string",
  "requestedAmount": "50000",
  "requestedTenure": 90,
  "tenureType": "DAYS",
  "interestRate": "24.0000",
  "processingFeePercent": "2.00",
  "customer": {
    "fullName": "string",
    "firstName": "string",
    "middleName": "string | null",
    "lastName": "string",
    "fatherName": "string",
    "panNumber": "ABCDE1234F",
    "dateOfBirth": "YYYY-MM-DD",
    "gender": "string",
    "mobileNumber": "string",
    "email": "string"
  },
  "panVerification": {
    "verified": true,
    "providerReference": "string",
    "verifiedAt": "ISO-8601"
  }
}
```
`requestedAmount`/`requestedTenure`/`tenureType` are the platform's initial ask, computed from the allocated product's configured multiplier/rounding and tenure list — not yet a lender decision. `interestRate`/`processingFeePercent` come directly from the same allocated product version's admin-configured `annualRoiPercent`/`processingFeePercent` — also not a lender decision, just what the platform is offering.

**Expected success response:**
```json
{
  "success": true,
  "data": {
    "externalApplicationReference": "APP-260811-E11728EF",
    "lan": "FTPL00000006",
    "status": "CREATED",
    "partnerApplicationId": "string",
    "partnerApplicationNumber": "string",
    "createdAt": "ISO-8601"
  },
  "correlationId": "uuid"
}
```
PLP validates `externalApplicationReference` and `lan` in the response match what was sent — a mismatch is treated as a permanent, non-retryable failure. `partnerApplicationId` becomes the `{partnerApplicationId}` path variable for every subsequent call below.

---

### 2.2 Submit Consent
Records the customer's data-sharing consent, right after Create.

- **Method / Path:** `POST /api/partner/v1/applications/{partnerApplicationId}/consent`
- **Idempotency-Key:** `{applicationNumber}:LENDER_SUBMIT_CONSENT:V1`

**Request body (complete):**
```json
{
  "externalApplicationReference": "APP-260811-E11728EF",
  "lan": "FTPL00000006",
  "consentType": "LENDER_DATA_SHARING",
  "consentId": "string",
  "consentTemplateId": "string",
  "consentVersion": "string",
  "consentTextHash": "sha256 hex",
  "consentReference": "string | null",
  "acceptedAt": "ISO-8601",
  "ipAddress": "string | null",
  "userAgentHash": "string | null"
}
```

**Expected success response:**
```json
{
  "success": true,
  "data": {
    "status": "RECORDED",
    "consentReference": "string",
    "recordedAt": "ISO-8601"
  },
  "correlationId": "uuid"
}
```

---

### 2.3 Update Application Details
**Called up to 4 times** over the application's life, at strictly increasing `detailsVersion` (never reused, never sent out of order):

| Version | Sent after |
|---|---|
| V1 | Onboarding profile complete — before the first (pre-approval) decision call |
| V2 | Customer selects an offer within the pre-approval credit limit — before the final decision call |
| V3 | Backend bank-account verification succeeds |
| V4 | eNACH mandate authorized |

- **Method / Path:** `PUT /api/partner/v1/applications/{partnerApplicationId}/profile`
- **Idempotency-Key:** `{applicationNumber}:LENDER_UPDATE_APPLICATION:V{1|2|3|4}`

**Request body (complete — maximum shape, V4):**
```json
{
  "externalApplicationReference": "APP-260811-E11728EF",
  "lan": "FTPL00000006",
  "detailsVersion": 4,
  "customer": {
    "fullName": "string", "firstName": "string", "middleName": "string | null",
    "lastName": "string", "fatherName": "string", "panNumber": "string",
    "dateOfBirth": "YYYY-MM-DD", "gender": "string", "mobileNumber": "string", "email": "string"
  },
  "employment": {
    "employmentType": "SALARIED | SELF_EMPLOYED",
    "companyType": "string | null", "companyName": "string | null", "designation": "string | null",
    "businessName": "string | null", "businessConstitution": "string | null",
    "monthlyIncome": "string | null", "annualTurnover": "string | null",
    "employmentVintage": "number | null", "businessVintage": "number | null",
    "salaryMode": "string | null", "completedAt": "ISO-8601"
  },
  "aadhaarKyc": {
    "status": "VERIFIED", "maskedAadhaar": "XXXX-XXXX-1234", "verifiedName": "string",
    "dateOfBirth": "YYYY-MM-DD", "gender": "string", "provider": "DIGITAP_DIGILOCKER",
    "providerReference": "string", "verifiedAt": "ISO-8601"
  },
  "permanentAddress": {
    "addressLine1": "string", "addressLine2": "string | null", "landmark": "string | null",
    "locality": "string | null", "district": "string | null", "city": "string", "state": "string",
    "country": "India", "pincode": "string", "source": "DIGILOCKER | CUSTOMER"
  },
  "currentAddress": {
    "sameAsPermanent": true, "addressLine1": "string", "addressLine2": "string | null",
    "landmark": "string | null", "locality": "string | null", "district": "string | null",
    "city": "string", "state": "string", "country": "India", "pincode": "string",
    "source": "DIGILOCKER | CUSTOMER"
  },
  "currentAddressEvidence": {
    "livePhotoDocumentReference": "string", "livenessProvider": "string",
    "livenessReference": "string", "livenessStatus": "string", "livenessScore": "number",
    "evidenceReference": "string", "latitude": "number", "longitude": "number",
    "capturedAt": "ISO-8601", "verifiedAt": "ISO-8601"
  },
  "selectedOffer": {
    "amount": "string", "tenure": 90, "selectedAt": "ISO-8601"
  },
  "bankDetails": {
    "accountHolderName": "string", "accountNumber": "string", "ifscCode": "string",
    "bankName": "string", "accountType": "SAVINGS | CURRENT", "verifiedAt": "ISO-8601"
  },
  "mandate": {
    "umrn": "string", "provider": "EASEBUZZ", "mandateType": "ENACH | UPI", "authorizedAt": "ISO-8601"
  }
}
```
`selectedOffer` is `null` until V2, `bankDetails` is `null` until V3, `mandate` is `null` until V4 — each is populated once and never removed on later versions.

**Expected success response:**
```json
{
  "success": true,
  "data": {
    "detailsVersion": 4,
    "status": "DETAILS_ACCEPTED",
    "updatedAt": "ISO-8601"
  },
  "correlationId": "uuid"
}
```
PLP validates the returned `detailsVersion` matches what was sent — a mismatch is a permanent failure.

---

### 2.4 Upload Document
Sent once per verified Aadhaar document (XML and/or PDF from DigiLocker).

- **Method / Path:** `POST /api/partner/v1/applications/{partnerApplicationId}/docs`
- **Idempotency-Key:** per-document, tied to the document transfer record
- **Request size limit:** 5,767,168 bytes (~5.5 MiB) enforced client-side before sending
- **Only sent for:** verified, borrower-owned documents of source type `AADHAAR_CARD`, MIME `application/xml`, `text/xml`, or `application/pdf`

**Request body (complete):**
```json
{
  "externalApplicationReference": "APP-260811-E11728EF",
  "lan": "FTPL00000006",
  "documentType": "AADHAAR_XML | AADHAAR_PDF",
  "sourceDocumentId": "string",
  "fileName": "string",
  "mimeType": "application/xml | text/xml | application/pdf",
  "fileSize": 123456,
  "fileSha256": "64-char hex",
  "contentBase64": "base64-encoded file content",
  "source": "string",
  "capturedAt": "ISO-8601"
}
```

**Expected success response:**
```json
{
  "success": true,
  "data": {
    "documentType": "AADHAAR_XML | AADHAAR_PDF",
    "fileSha256": "64-char hex",
    "status": "RECEIVED",
    "partnerDocumentId": "string",
    "receivedAt": "ISO-8601"
  },
  "correlationId": "uuid"
}
```
PLP validates the returned `documentType` and `fileSha256` match the upload — either mismatch is a permanent failure.

---

### 2.5 Request Decision — called TWICE per application
Same endpoint, same request shape, called at two distinct points in the journey — distinguished only by the `Idempotency-Key` version:

| Call | Idempotency-Key | Fired after | Meaning of "approved" |
|---|---|---|---|
| **#1 — Pre-approval** | `…:LENDER_REQUEST_DECISION:V1` | Update V1 (onboarding profile) | Returns a credit limit; customer picks an offer within it. No loan created yet. |
| **#2 — Final approval** | `…:LENDER_REQUEST_DECISION:V2` | Update V2 (offer selected) | Finalizes the loan at the customer's selected amount/tenure. |

- **Method / Path:** `POST /api/partner/v1/applications/{partnerApplicationId}/approve`

**Request body (complete — identical shape for both calls):**
```json
{
  "externalApplicationReference": "APP-260811-E11728EF",
  "productCode": "string",
  "bureauConsent": {
    "reference": "string",
    "hash": "sha256 hex"
  },
  "decisionConsent": {
    "reference": "string",
    "hash": "sha256 hex"
  }
}
```
No amount/tenure is sent in this call — Fintree is expected to use the profile/offer data already pushed via Update Details.

**Expected success response:**
```json
{
  "success": true,
  "data": {
    "status": "approved | rejected | pending | processing | under_review | in_review | queued",
    "CREDIT_LIMIT_CHECK_RPM": {
      "derived_values": {
        "LIMIT_ASSIGNMENT_IS_NEW_CUSTOMER_RPM": 8000,
        "LIMIT_ASSIGNMENT_IS_REPEAT_CUSTOMER_RPM": 0
      }
    }
  },
  "correlationId": "uuid"
}
```
- `CREDIT_LIMIT_CHECK_RPM` is present **only** when `status` is `approved`; exactly one of the two `derived_values` fields is populated (whichever is nonzero is used as the approved amount) — if both are zero/missing on an "approved" status, PLP treats it as a permanent validation failure.
- `rejected` is terminal at either call.
- Any of `pending`/`processing`/`under_review`/`in_review`/`queued` is treated as awaiting an async final outcome — expected as the normal initial response to call **#2**.
- Response body is a **passthrough** schema on PLP's side (extra fields are tolerated and ignored) since Fintree's full response shape beyond these fields isn't fully pinned down yet — flag if there's anything else PLP should be reading.

---

### 2.6 Trigger Disbursal
Sent once, after mandate + e-sign are both complete and the customer has requested disbursal. **This call only asks Fintree to start disbursal — it is not a disbursal confirmation.** The actual outcome (UTR, status, date) must come back via the webhook in §3.

- **Method / Path:** `POST /api/partner/v1/applications/{partnerApplicationId}/disburse`
- **Idempotency-Key:** `{applicationNumber}:LENDER_REQUEST_DISBURSAL:V1`

**Request body (complete):**
```json
{
  "externalApplicationReference": "APP-260811-E11728EF",
  "lan": "FTPL00000006",
  "amount": "5000",
  "trigger_fund": true
}
```
`amount` is the **final accepted loan amount** — never the pre-approval credit limit.

**Expected success response:**
```json
{
  "success": true,
  "data": {
    "status": "string",
    "disbursalReference": "string (optional)"
  },
  "correlationId": "uuid"
}
```
Response body is passthrough (extra fields tolerated) — PLP only reads `status` and `disbursalReference`, and does **not** mark the loan disbursed from this response alone. It waits for the webhook.

---

## 3. Inbound Webhook (Fintree → PLP)

### 3.1 Disbursal Confirmation Webhook
Fintree calls this once disbursal is actually complete (or has failed/is pending) — this is the only way PLP marks a loan `DISBURSED`.

- **Full URL:** `POST https://pl-fintree-uat.fintreelms.com/api/webhooks/lenders/FFPL2026/disbursal`
- **Required header:** `x-pl-webhook-secret: kjhfdkjhdsfijfiueri9uew98982389udewui3e989823ui2387de3huie`
  (accepted alternates, any one is sufficient: `x-lender-webhook-secret`, `x-disbursal-webhook-secret`, `x-webhook-secret`)
- **Content-Type:** `application/json`

**Request body (send this exact shape):**
```json
{
  "lan": "FTPL00000006",
  "status": "SUCCESS",
  "DisbursalUTR": "UTR1234567890",
  "DisbursalDate": "2026-08-11",
  "DisbursedAmount": 5000,
  "RepaymentDate": "2026-09-10"
}
```

| Field | Accepted alternate names | Required | Notes |
|---|---|---|---|
| LAN | `lan`, `LAN`, `loanId` | Yes | Must match an existing platform loan |
| Status | `status`, `Status` | Yes | Case-insensitive. `SUCCESS`/`DISBURSED`/`COMPLETED` → marks loan `DISBURSED`. `PENDING`, `PROCESSING`, `FAILED`/`REJECTED` are also accepted and mapped accordingly. |
| UTR | `DisbursalUTR`, `disbursalUtr`, `utr` | Yes | Must be globally unique across all loans — a UTR already registered to a different LAN is rejected |
| Disbursal date | `DisbursalDate`, `disbursalDate`, `disbursement_date` | Yes | Must be a valid, parseable date |
| Amount | `DisbursedAmount`, `disbursedAmount`, `amount` | Yes | Positive number. Rejected if it exceeds the loan's approved amount |
| First repayment date | `RepaymentDate`, `firstRepaymentDate`, `repaymentDate` | Yes | Must be strictly later than the disbursal date |
| Event ID | `eventId` | No | Stored for traceability only, not validated |

**Expected response:**
```json
// Success
{ "success": true, "status": "DISBURSED", "message": "...", "lan": "FTPL00000006", "disbursalUtr": "UTR1234567890" }

// Validation failure (4xx)
{ "success": false, "error": { "code": "string", "message": "string" } }
```

**Idempotency:** deduplicated by content hash of the normalized payload (`lan` + `disbursalUtr` + `disbursalDate` + `disbursedAmount` + `firstRepaymentDate` + `status`). Fintree can safely retry an identical payload — it will be recognized as already processed and re-acknowledged without side effects. A **different** payload for a LAN already marked `DISBURSED` (different UTR or amount) is rejected as a conflict rather than silently overwritten.

**Preconditions enforced before a webhook can mark a loan `DISBURSED`:** offer accepted, DigiLocker KYC verified, address confirmed, bank account verified, KFS accepted, mandate completed, e-sign completed — a webhook arriving before all of these are true is rejected (this mirrors the same precondition set checked before the Trigger Disbursal call is ever sent, so a webhook can never mark something disbursed that shouldn't have been eligible in the first place).

---

## 4. Error Handling & Retries

- Any 4xx/5xx response must carry the failure envelope from §1.
- PLP classifies failures as **retryable** (network errors, timeouts, 5xx, ambiguous responses) vs **permanent** (validation mismatches, 4xx business-rule rejections) — only retryable failures are automatically retried on the schedule in the table at the top of this document (5 attempts: immediate, then 1m / 5m / 15m / 1h).
- A response that fails PLP's schema validation (missing required fields, wrong types) is logged and treated as a permanent failure — it will **not** be retried automatically.
