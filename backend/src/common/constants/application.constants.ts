import { PlApplicationStatus } from '@prisma/client';

export const ACTIVE_APPLICATION_STATUSES = [
  PlApplicationStatus.DRAFT,
  PlApplicationStatus.SUBMITTED,
  PlApplicationStatus.ALLOCATION_PENDING,
  PlApplicationStatus.LENDER_ALLOCATED,
  PlApplicationStatus.ASSESSMENT_FEE_PAID,
  PlApplicationStatus.LENDER_REVIEW,
  PlApplicationStatus.LENDER_PRE_APPROVED,
  PlApplicationStatus.PENDING_CREDIT_REVIEW,
  PlApplicationStatus.LENDER_APPROVED,
];
