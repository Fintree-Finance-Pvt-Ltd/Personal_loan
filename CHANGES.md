# Corrected build changes

## Backend

- Replaced the broken Lender controller/service imports and class names.
- Removed `backend/src/modules/lenders/dto/` and `lender.types.ts` from the Lender module.
- Added strict Zod validation for lender bodies, query parameters, IDs, email, phone, code, and rejection reasons.
- Aligned the backend route with the frontend: `/api/admin/lenders`.
- Added exact permission guards for every lender operation.
- Added backend maker-checker enforcement for approve and reject.
- Added optimistic concurrency through `Lender.version`.
- Added audit records for create, update, submit, approve, reject, activate, and deactivate.
- Added support-email search and paginated list results.
- Removed the public manual integration-health endpoint.
- Added the lender migration and Prisma indexes/relations.
- Updated seed roles and lender permissions.

## Frontend

- Kept the route-based Admin shell and permission-protected Lender Management page.
- Configured the lender page to use the real backend by default.
- Retained optional development mocks behind `VITE_USE_LENDER_MOCKS=true`.

## Packaging

- Removed stale build output, Vite cache, Git metadata, accidental `README.mdgit`, and the real backend `.env`.
- Retained `backend/.env.example`; copy it to `backend/.env` before running Prisma or the backend.

## Lender management frontend actions
- Added Add Lender button with permission gating.
- Added Create Lender page and reusable validated lender form.
- Added Lender Details page.
- Added Edit Draft/Rejected Lender page.
- Added Submit, Approve, Reject, Activate and Deactivate actions.
- Added maker-checker UI handling and confirmation dialogs.
- Connected all frontend actions to the existing lender backend APIs.
