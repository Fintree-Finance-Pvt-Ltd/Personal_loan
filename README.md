# Personal Loan Platform — Phase 1

Production-oriented authentication and authorization foundation for a regulated personal-loan administration platform. The current build delivers Admin login, rotating sessions, backend-enforced RBAC, security events, integrity-protected audit logs, health checks, a responsive React Admin interface, and the first complete business module: Lender Management with maker-checker controls. It is a security and administration foundation, not a claim of RBI or DPDP compliance.

## Technology stack

- Frontend: React 19 (JavaScript only), Vite, React Router, Axios, React Hook Form, Zod, Tailwind CSS.
- Backend: NestJS 11, TypeScript, Prisma ORM, Argon2id, JWT access tokens, opaque refresh tokens, Helmet, class-validator, throttling.
- Data: MySQL 8, CUID string identifiers, Prisma migrations, UTC timestamps.

## Project structure

```text
personal-loan-platform/
├── backend/
│   ├── .env                  # local secrets; ignored by Git
│   ├── .env.example
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── seed.ts
│   │   └── migrations/
│   ├── src/
│   │   ├── common/
│   │   ├── config/
│   │   ├── infrastructure/
│   │   └── modules/
│   └── test/
├── frontend/
│   └── src/
├── package.json
└── README.md
```

## Prerequisites

- Node.js 20.11 or newer and npm 10 or newer.
- MySQL 8 with a dedicated local database and least-privilege application user.
- Do not point migration, seed, or tests at an unidentified/shared/production database.

Example local database setup (replace names and password):

```sql
CREATE DATABASE personal_loan_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'plp_user'@'localhost' IDENTIFIED BY 'replace-with-a-strong-password';
GRANT ALL PRIVILEGES ON personal_loan_platform.* TO 'plp_user'@'localhost';
FLUSH PRIVILEGES;
```

## Installation and configuration

All backend environment variables belong in exactly:

```text
personal-loan-platform/backend/.env
```

There is intentionally no root environment file. Backend secrets live only in `backend/.env`. The frontend includes only a non-secret `frontend/.env.local` switch for optional lender mocks; it is set to `false` in this corrected build. The browser calls `/api`; Vite proxies it to `http://localhost:3000`.

```powershell
cd personal-loan-platform
Copy-Item backend/.env.example backend/.env
npm install
```

Set the following in `backend/.env`:

- `DATABASE_URL`: dedicated MySQL 8 connection URL.
- `JWT_ACCESS_SECRET`: independent cryptographically random secret, 48+ characters for production.
- `REFRESH_TOKEN_PEPPER`: independent random key used to HMAC refresh tokens.
- `SECURITY_HMAC_KEY`: independent random key for login email fingerprints.
- `AUDIT_INTEGRITY_KEY`: independent random key for audit integrity values.
- `SEED_SUPERADMIN_NAME`, `SEED_SUPERADMIN_EMAIL`, `SEED_SUPERADMIN_PASSWORD`: initial administrator. The password must be 12–128 characters with uppercase, lowercase, number, special character, and no obvious common-password fragment.
- `FRONTEND_URL`: exact allowed Admin origin; no wildcards.
- `COOKIE_SECURE=true` in production. Production startup also requires HTTPS, strong non-placeholder secrets, and strict cookies.
- Review session duration, idle timeout, lock threshold, proxy trust, Argon2 costs, body-size limit, and log level.

Generate each key independently with a trusted password/secret generator. Never reuse database, JWT, refresh, security, or audit keys. Never commit `backend/.env`.

## Database and Superadmin

The initial migration is committed under `backend/prisma/migrations`. `prisma db push` is not used.

```powershell
npm run db:validate
npm run db:generate
npm run db:migrate
npm run db:seed
```

The seed is idempotent. It upserts the system roles and granular permissions, assigns all permissions to `SUPERADMIN`, assigns limited grants to other roles, and creates the configured Superadmin only if absent. It never prints or stores the plaintext password.

## Run and build

```powershell
# Backend and frontend together
npm run dev

# Production compilation
npm run build

# Quality checks
npm run lint
npm test
```

- Admin login: `http://localhost:5173/admin-master/login`
- Admin dashboard: `http://localhost:5173/admin-master/dashboard`
- Lender management: `http://localhost:5173/admin-master/lenders`
- Session management: `http://localhost:5173/admin-master/sessions`
- Liveness: `http://localhost:3000/api/health`
- Readiness: `http://localhost:3000/api/health/ready`


## Lender Management module

The lender module uses Zod validation directly and intentionally has no Lender DTO folder. It provides permission-protected APIs for listing, creating, editing, submitting, approving, rejecting, activating, and deactivating lenders. Lender records are never physically deleted.

Lifecycle:

```text
DRAFT -> SUBMITTED -> APPROVED -> ACTIVE
                   \-> REJECTED -> edit -> DRAFT
```

Maker-checker is enforced on the backend: the user who submitted the lender cannot approve or reject the same record. Optimistic concurrency uses the `version` field to prevent stale updates. Every mutation writes an audit record.

API routes:

```text
GET    /api/admin/lenders
GET    /api/admin/lenders/:id
POST   /api/admin/lenders
PATCH  /api/admin/lenders/:id
POST   /api/admin/lenders/:id/submit
POST   /api/admin/lenders/:id/approve
POST   /api/admin/lenders/:id/reject
POST   /api/admin/lenders/:id/activate
POST   /api/admin/lenders/:id/deactivate
```

The committed `20260724130000_add_lender_management` migration creates the lender table, indexes, foreign keys, lifecycle enums, and optimistic-lock version column. The frontend uses the backend by default (`VITE_USE_LENDER_MOCKS=false`).

## Authentication and session behavior

Login verifies Argon2id credentials, applies strict throttling, records a safe login attempt, increments failure state transactionally, and temporarily locks an account after the configured threshold. Unknown users and incorrect passwords receive the same generic response. Disabled users cannot authenticate.

A successful login creates a server-side session, issues a short-lived JWT containing only identity/session/version claims, and places a cryptographically random refresh token in an `HttpOnly`, `SameSite=Strict` cookie. Only the token HMAC is stored. The access token is held in JavaScript memory only—never localStorage or sessionStorage.

Refresh validates the request origin, server-side session, absolute and idle expiries, and token HMAC. It atomically marks the old token used and creates a replacement. A reused or concurrently claimed token revokes the entire session and records a critical event. The frontend single-flights refresh calls, retries a protected request once, prevents loops, and clears auth state on failure.

Logout and self-service revocation revoke session records and refresh tokens without deleting history. Session endpoints enforce ownership. After logout, revocation, expiry, user disablement, or `authVersion` change, protected requests fail immediately.

## RBAC, logs, and audit foundation

`JwtAuthGuard` validates access claims and current database state. `PermissionsGuard` compares complete permission codes exactly; client gates only improve UX and are never authoritative. The demonstration endpoint `GET /api/admin/dashboard` requires `ADMIN_DASHBOARD_VIEW`.

Every request receives a UUID request ID and a consistent response envelope. Structured JSON request logs contain method, route, status, duration, and request ID—not bodies. Sensitive names including passwords, tokens, cookies, OTPs, PAN, Aadhaar, bank accounts, secrets, and API keys are recursively redacted.

Security events store allowlisted/sanitized metadata. Audit writes have no update/delete endpoint and are append-only at the application layer. Each audit record includes actor, roles, permission, entity/action/outcome, request/device context, sanitized changes, and an HMAC integrity value.

## Tests

```powershell
npm test
npm run lint
npm run build
```

The database-independent Jest suite covers DTO rejection, generic credentials errors, failed-login increments and lockout, disabled users, successful login reset, refresh hashing/rotation/reuse, cookie flags, missing/revoked access, exact permissions, session ownership, logout clearing, structured-log/audit sanitation, and safe exception output. Add database integration tests only against a named, dedicated test database.

## Troubleshooting

- **Environment validation fails:** compare `backend/.env` with `.env.example`; errors name invalid fields but never echo their values.
- **Database readiness is unavailable:** verify MySQL 8 is running, the database exists, and `DATABASE_URL` uses the dedicated local account.
- **Seed refuses to run:** populate all three `SEED_SUPERADMIN_*` values and use a strong password.
- **Refresh/logout says untrusted origin:** `FRONTEND_URL` must exactly match the browser origin, including scheme and port.
- **Cookies are absent locally:** keep `COOKIE_SECURE=false` only for HTTP local development; use HTTPS and `true` in production.
- **Windows PowerShell blocks `npm.ps1`:** run the same commands as `npm.cmd ...`.

## Security limitations and production-readiness checklist

Before production, use managed secrets, separate keys per environment, HTTPS-only origins/cookies, least-privilege database credentials, a reviewed proxy allowlist, centralized protected logs, monitored alerts, retention policies, tested migrations/backups, and independent security review. Rotate any secret suspected of exposure. Tune Argon2 and throttling under representative load.

The following remain future work:

- Mandatory Admin MFA.
- Forgot/reset-password flow.
- Reusable maker-checker/versioning framework for product, pricing, policy, and MLM configuration.
- Redis-backed distributed rate limiting.
- Cloud KMS/HSM.
- Secret manager integration.
- Field encryption for borrower PII.
- SIEM integration.
- WAF and TLS termination.
- India-region infrastructure verification.
- Backup and disaster recovery.
- Penetration testing.
- RBI/DPDP legal and compliance review.
