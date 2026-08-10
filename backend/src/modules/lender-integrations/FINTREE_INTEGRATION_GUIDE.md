# Fintree Finance API Integration Guide

This guide details the steps required to configure and activate the Fintree Finance API for UAT (User Acceptance Testing) and Production. The Fintree integration supports `LENDER_CREATE_APPLICATION`, `LENDER_SUBMIT_CONSENT`, profile updates, decisions, and status polling.

## 1. Authentication Options

The Fintree integration natively supports two authentication strategies. The method to use must be configured in `LenderIntegrationConfig.authType`:

1. **`BEARER_TOKEN`**
   If `authType = 'BEARER_TOKEN'`, the `LenderHttpService` automatically retrieves the secret and injects an `Authorization: Bearer <secret>` header.
2. **`CUSTOM` (HMAC SHA-256)**
   If `authType = 'CUSTOM'`, the adapter itself generates the required `X-Client-Id`, `X-Request-Timestamp`, `X-Nonce`, and `X-Signature` headers based on Fintree's payload signing requirements.

### Storing Credentials Securely

> [!CAUTION]
> Bearer tokens and HMAC secrets must **NEVER** be stored in the MySQL database, frontend code, source control, or logs.

The MySQL database table `LenderIntegrationConfig` contains a column named `credentialSecretReference`. 
- Set this column to the **name** of the environment variable containing the secret (e.g., `FINTREE_API_BEARER_TOKEN`).
- The actual secret value is securely resolved at runtime via NestJS `ConfigService`, reading from the backend environment variables or a supported secret manager.

## 2. Configuration Setup

To activate the Fintree integration for UAT, execute a SQL update on the `LenderIntegrationConfig` row associated with `adapterKey = 'FINTREE_FINANCE_V1'`.

### Example Activation SQL (Do NOT run in Production):
```sql
UPDATE LenderIntegrationConfig
SET 
    isActive = true,
    baseUrl = 'https://uat-api.fintree.finance',
    clientId = '<UAT_CLIENT_ID>',
    authType = 'CUSTOM', /* or 'BEARER_TOKEN' */
    credentialSecretReference = 'FINTREE_API_HMAC_SECRET',
    createApplicationPath = '/api/partner/v1/applications',
    consentPath = '/api/partner/v1/applications/{partnerApplicationId}/consent',
    updateApplicationPath = '/api/partner/v1/applications/{partnerApplicationId}/profile',
    decisionPath = '/api/partner/v1/applications/{partnerApplicationId}/pre-approval',
    statusPath = '/api/partner/v1/applications/{partnerApplicationId}/status'
WHERE adapterKey = 'FINTREE_FINANCE_V1';
```

## 3. Environment Variables

Ensure the backend `.env` contains the required references if using standard local environment injection:
```env
# Required for BEARER_TOKEN
FINTREE_API_BEARER_TOKEN=your_uat_token_here

# Required for CUSTOM HMAC
FINTREE_API_HMAC_SECRET=your_uat_hmac_secret_here

# Allow outbound requests to Fintree domains
LENDER_INTEGRATION_ALLOWED_HOSTS=uat-api.fintree.finance,api.fintree.finance
```

## 4. Missing Upstream Fields

During integration mapping, the following Fintree fields were identified as potentially unavailable from the canonical `LenderCreateApplicationContext` and database schema natively, meaning they rely on snapshot maps or defaults:
- *None specific missing for basic flows.* The `assessmentFeePaid` field is enforced by the outbox to be `true` before dispatch.
- *Note:* The PRE_APPROVAL flow accepts an empty payload, which implies no additional upstream data mapping is currently blocked. If the UAT endpoints require extended application metrics in PRE_APPROVAL, a schema update will be needed.

## 5. End-to-End Testing

Before switching `isActive = true`, ensure the backend tests pass. The integration relies on the `LenderIntegrationWorker` outbox to atomically guarantee `CONSENT` insertion post-`CREATE`. 

You can monitor integration traffic via `PartnerApiAuditLog` (if enabled on the platform side) and standard service logs.
