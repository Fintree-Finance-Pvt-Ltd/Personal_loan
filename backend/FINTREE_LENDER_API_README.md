# Fintree Lender Integration API V1

This documentation outlines the complete set of APIs and contracts required to build a compliant Lender Integration adapter for the Personal Loan Platform (PLP), specifically detailing the Fintree Finance V1 implementation.

## 1. Authentication & Security

Fintree integrations enforce a zero-trust model utilizing **HMAC Authentication**.

### Security Model
- **Strict Allowlisting:** Lenders must be pre-configured in `LENDER_INTEGRATION_ALLOWED_HOSTS`. Loopback, private, and internal networks are explicitly blocked in production/UAT.
- **HTTPS Only:** TLS (HTTPS) is unconditionally required.
- **Payload Size Limits:** Max Request: 1MB. Max Response: 1MB.

### Request Headers
Every request to the lender API will include the following headers:

| Header | Description |
|---|---|
| `Content-Type` | Always `application/json` |
| `X-Client-Id` | Pre-shared client identifier (e.g. `fintree-client-123`) |
| `X-Correlation-Id` | Distributed tracing ID for the specific lifecycle operation |
| `X-Request-Timestamp` | ISO-8601 timestamp of request origination |
| `X-Nonce` | Secure UUIDv4 unique to this exact request |
| `X-Signature` | Hex-encoded HMAC SHA-256 signature |
| `Idempotency-Key` | (Where applicable) Ensures safe retries. E.g. `APP-123:LENDER_CREATE_APPLICATION:V1` |

### Signature Generation (HMAC)
The `X-Signature` is generated using your configured secret against a canonical string representation of the request.

**Canonical String Formula (newline delimited):**
```
HTTP_METHOD
/normalized/path?query=string
X-Request-Timestamp
X-Nonce
Idempotency-Key
SHA256_HEX(RequestBody)
```

## 2. API Endpoints

### 2.1 Create Application
Creates the initial loan file at the lender side.

- **Method:** `POST`
- **Path:** (Configurable in PLP Admin)

**Payload:**
```json
{
  "externalApplicationReference": "string",
  "lan": "string",
  "sourceSystem": "FINTREE_PLP",
  "productCode": "string",
  "customer": {
    "fullName": "string",
    "firstName": "string",
    "lastName": "string",
    "fatherName": "string",
    "panNumber": "string",
    "dateOfBirth": "YYYY-MM-DD"
  },
  "panVerification": {
    "verified": true,
    "providerReference": "string",
    "verifiedAt": "ISO-8601"
  }
}
```

**Expected Success Response (2xx):**
```json
{
  "success": true,
  "data": {
    "externalApplicationReference": "string",
    "lan": "string",
    "status": "ACKNOWLEDGED",
    "partnerApplicationId": "string",
    "partnerApplicationNumber": "string",
    "correlationId": "string",
    "createdAt": "ISO-8601"
  }
}
```

### 2.2 Submit Consent
Records the applicant's explicit consent for data sharing.

- **Method:** `POST`
- **Path:** (Configurable)

**Expected Success Response (2xx):**
```json
{
  "success": true,
  "data": {
    "status": "RECORDED",
    "consentReference": "string",
    "correlationId": "string",
    "recordedAt": "ISO-8601"
  }
}
```

### 2.3 Update Details
Pushes KYC, Liveness, and Employment snapshots after completion.

- **Method:** `PUT`
- **Path:** Contains `{partnerApplicationId}`

**Expected Success Response (2xx):**
```json
{
  "success": true,
  "data": {
    "detailsVersion": 1,
    "status": "DETAILS_ACCEPTED",
    "correlationId": "string",
    "updatedAt": "ISO-8601"
  }
}
```

### 2.4 Upload Document
Transfers individual verified documents (e.g., Aadhaar XML/PDF).

- **Method:** `POST`
- **Path:** Contains `{partnerApplicationId}`

**Expected Success Response (2xx):**
```json
{
  "success": true,
  "data": {
    "documentType": "string",
    "fileSha256": "string",
    "status": "RECEIVED",
    "partnerDocumentId": "string",
    "correlationId": "string",
    "receivedAt": "ISO-8601"
  }
}
```

## 3. Error Handling

In the event of an error, the lender API MUST return a standard error schema alongside a 4xx or 5xx status code.

**Error Response Schema:**
```json
{
  "success": false,
  "error": {
    "code": "string",
    "message": "string"
  }
}
```
