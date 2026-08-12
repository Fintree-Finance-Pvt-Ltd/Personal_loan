# Unaport Account Aggregator (AA) Web SDK Integration Documentation

This document describes the technical architecture, API specification, database schema, encryption design, and operation manual for the **Unaport FIU Account Aggregator Web SDK** integration in the Personal Loan Platform.

---

## 1. System Architecture & Sequence Flow

```
+------------------+         +--------------------+         +-------------------+         +-----------------+
| Customer Browser |         | NestJS Backend API |         | Prisma / MySQL DB |         | Unaport FIU API |
+------------------+         +--------------------+         +-------------------+         +-----------------+
         |                             |                              |                            |
 1. Click "Connect Bank"              |                              |                            |
-------->|                             |                              |                            |
         | 2. POST /customer/loans/:lan/account-aggregator/initiate   |                            |
         |---------------------------->|                              |                            |
         |                             | 3. Get valid access token    |                            |
         |                             |---------------------------------------------------------->|
         |                             |                              |   Returns Access & Refresh |
         |                             |<----------------------------------------------------------|
         |                             | 4. Create trackingId & config|                            |
         |                             |    Base64 encode config & URL |                            |
         |                             | 5. Save request (INITIATED)  |                            |
         |                             |----------------------------->|                            |
         | 6. Return SDK URL           |                              |                            |
         |<----------------------------|                              |                            |
         |                             |                              |                            |
 7. Open Unaport Web SDK               |                              |                            |
   Select Bank / FIP, OTP, Consent     |                              |                            |
-------------------------------------->|                              |                            |
         |                             | 8. Webhook: Consent Notif    |                            |
         |                             |<----------------------------------------------------------|
         |                             | 9. Save consent status       |                            |
         |                             |----------------------------->|                            |
         |                             | 10. Webhook: Data Ready      |                            |
         |                             |<----------------------------------------------------------|
         |                             | 11. Fetch Data by SessionId  |                            |
         |                             |---------------------------------------------------------->|
         |                             |                              |    Returns Bank Accounts   |
         |                             |<----------------------------------------------------------|
         |                             | 12. Encrypt raw payload &    |                            |
         |                             |     Save normalized DB data  |                            |
         |                             |----------------------------->|                            |
         |                             | 13. Update Status = SUCCESS  |                            |
         |                             |----------------------------->|                            |
         |                             |                              |                            |
 14. Frontend 5s Poller                |                              |                            |
     GET .../status                    |                              |                            |
-------->|---------------------------->|                              |                            |
         | Returns SUCCESS status      |                              |                            |
         |<----------------------------|                              |                            |
         |                             |                              |                            |
```

---

## 2. API Endpoints Reference

### Customer Authenticated Endpoints (Requires Customer JWT Guard)

#### `POST /api/customer/loans/:lan/account-aggregator/initiate`
- **Description**: Initiates AA workflow, validates LAN ownership, fetches provider tokens, constructs dynamic Base64-encoded SDK URL.
- **Request Body**: `{}`
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "trackingId": "PL-AA-PL-LAN-12345-1723363200000",
      "status": "INITIATED",
      "sdkUrl": "https://sdk.sandbox.unaport.com/view?config=eyJ0aGVtZSI6..."
    }
  }
  ```

#### `GET /api/customer/loans/:lan/account-aggregator/status`
- **Description**: Returns normalized internal state of the AA journey.
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "status": "CONSENT_APPROVED",
      "consentStatus": "APPROVED",
      "dataStatus": "PENDING",
      "completed": false,
      "failureReason": null
    }
  }
  ```

#### `POST /api/customer/loans/:lan/account-aggregator/refresh-status`
- **Description**: Explicit status synchronization against provider APIs.

---

### Unauthenticated Notification / Webhook Endpoints (Server-to-Server)

#### `POST /api/integrations/unaport/consent-notification`
- **Description**: Callback triggered by Unaport when user approves, rejects, or revokes consent.
- **Sample Payload**:
  ```json
  {
    "ver": "2.0.0",
    "timestamp": "2026-08-11T12:00:00.000Z",
    "txnid": "6e1a00c7-d572-469e-bec6-0a8bafd6f83c",
    "Notifier": {
      "type": "AA",
      "id": "UNACORES-AA-UAT"
    },
    "ConsentStatusNotification": {
      "consentId": "3cf43ce5-a353-424b-af81-4af560a4b100",
      "consentHandle": "8be596b4-7b8b-4f42-82ca-d6f567e255c9",
      "consentStatus": "ACTIVE"
    },
    "trackingId": "PL-AA-PL-LAN-12345-1723363200000"
  }
  ```

#### `POST /api/integrations/unaport/data-notification`
- **Description**: Callback triggered when FI data is ready for retrieval.
- **Sample Payload**:
  ```json
  {
    "ver": "2.0.0",
    "timestamp": "2026-08-11T12:00:02.000Z",
    "txnid": "bcb2ab98-f41c-483b-9f81-83b830cda4ad",
    "Notifier": {
      "type": "AA",
      "id": "UNACORES-AA-UAT"
    },
    "FIStatusNotification": {
      "sessionId": "ffdd16e8-b085-4ed1-8526-0e5b76b92792",
      "sessionStatus": "COMPLETED"
    },
    "consentId": "3cf43ce5-a353-424b-af81-4af560a4b100",
    "trackingId": "PL-AA-PL-LAN-12345-1723363200000"
  }
  ```

---

## 3. Environment Variables Configuration

Configure the following variables in `backend/.env`:

```env
UNAPORT_ENVIRONMENT=sandbox
UNAPORT_BASE_URL=https://common.sandbox.unaport.com/api/v1
UNAPORT_SDK_URL=https://sdk.sandbox.unaport.com/view
UNAPORT_EMAIL=developer@unacores.com
UNAPORT_PASSWORD=your_unaport_password
UNAPORT_PRODUCT_ID=529684db-7241-44d7-95a3-fdc4ee9f8c11
UNAPORT_FIU_ID=UNACORES-FIU-UAT
UNAPORT_FI_TYPE=Deposits
UNAPORT_HTTP_TIMEOUT_MS=15000
```

---

## 4. Token Handling & Single-Flight Lock

`UnaportTokenService` provides automated server-side token management:
1. Performs `POST /public/user/login` using configured `UNAPORT_EMAIL` and `UNAPORT_PASSWORD`.
2. Caches `access_token` and `refresh_token` in memory with expiration tracking.
3. Automatically reuses active access tokens until 60 seconds prior to expiration.
4. Auto-refreshes using `POST /public/user/refreshToken` when nearing expiry.
5. Performs auto-login if the refresh token expires or is rejected.
6. Implements a single-flight promise lock (`tokenRefreshPromise`) so concurrent requests join the same in-flight network call without duplicate authentication calls.
7. Strictly avoids logging credentials or tokens in console or application logs.

---

## 5. Webhook Security & Payload Validation

- Notification endpoints parse reference identifiers (`trackingId`, `consentId`, `consentHandle`, `sessionId`) strictly matching internal request records.
- All webhook invocations update request states idempotently without duplicating database rows.
- Full raw webhook notification payloads are encrypted at rest using AES-256-GCM.

---

## 6. Database Models & Schema

### `CustomerAccountAggregatorRequest`
Tracks session state, provider references, and payload metadata:
- `trackingId`: Unique transaction ID (`PL-AA-<LAN>-<timestamp>`).
- `status`: Lifecycle state (`INITIATED`, `SDK_OPENED`, `CONSENT_APPROVED`, `DATA_PENDING`, `SUCCESS`, `FAILED`, `EXPIRED`, `CANCELLED`).
- `providerResponseEncrypted`: AES-256-GCM encrypted raw provider response.

### `CustomerBankAccountData`
Normalized bank account metadata:
- `accountHolderName`, `accountType`, `accountNumberMasked`, `ifscCode`, `branchName`, `currentBalance`, `availableBalance`, `summaryDate`.

### `CustomerBankTransaction`
Normalized transaction entries:
- `txnId`, `txnDate`, `txnType` (`CREDIT`/`DEBIT`), `amount`, `balance`, `narration`, `mode`, `referenceNumber`, `transactionHash`.
- Unique index `@@unique([bankDataId, transactionHash])` guarantees zero transaction duplicates upon re-fetching or repeated webhooks.

---

## 7. Encryption-at-Rest (AES-256-GCM)

All raw financial payloads from Unaport are encrypted before saving to the database using `aes-256-gcm`:
- 96-bit random IV generated per payload.
- 128-bit authentication tag appended.
- Output format: `${ivHex}:${authTagHex}:${ciphertextHex}`.
- Decrypted strictly backend-side when required.

---

## 8. Local / UAT Testing Steps

1. Configure sandbox credentials in `backend/.env`:
   - `UNAPORT_ENVIRONMENT=sandbox`
   - `UNAPORT_BASE_URL=https://common.sandbox.unaport.com/api/v1`
   - `UNAPORT_SDK_URL=https://sdk.sandbox.unaport.com/view`
2. Start backend server (`npm run start:dev` inside `backend`).
3. Log in as a customer in the frontend (`http://localhost:5173`).
4. Navigate customer loan application journey to the **Bank Account** step.
5. Click **Connect Bank Account**.
6. Verify that `POST /api/customer/loans/:lan/account-aggregator/initiate` responds with `sdkUrl` and opens the Unaport Web SDK overlay.
7. Select sandbox FIP Bank, complete AA OTP, complete account linking, approve consent.
8. Verify server receives consent notification and data notification webhooks.
9. Verify data status updates to `SUCCESS` and bank statement transactions are populated in `customer_bank_transactions`.

*Note for local webhook testing*: Use an ngrok tunnel or webhook relay (e.g. `ngrok http 3005`) to route server-to-server notifications from Unaport sandbox to `http://<ngrok-domain>/api/integrations/unaport/consent-notification`.

---

## 9. Production Switch Checklist

- [ ] Update `UNAPORT_ENVIRONMENT=production`.
- [ ] Update `UNAPORT_SDK_URL=https://sdk.premium.unaport.com/view`.
- [ ] Update production base API URL provided by Unaport.
- [ ] Set production `UNAPORT_EMAIL`, `UNAPORT_PASSWORD`, `UNAPORT_PRODUCT_ID`, and `UNAPORT_FIU_ID`.
- [ ] Ensure HTTPS is enforced on all public webhook routes.
- [ ] Verify `BANK_ACCOUNT_ENCRYPTION_KEY` contains a strong 32-character secret in production environment.
