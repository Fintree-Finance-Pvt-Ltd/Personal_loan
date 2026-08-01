import { PlApplicationStatus } from '@prisma/client';

export const ACTIVE_APPLICATION_STATUSES = [
  PlApplicationStatus.DRAFT,
  PlApplicationStatus.SUBMITTED,
  PlApplicationStatus.ALLOCATION_PENDING,
  PlApplicationStatus.LENDER_ALLOCATED,
  PlApplicationStatus.LENDER_REVIEW,
  PlApplicationStatus.LENDER_APPROVED,
];
