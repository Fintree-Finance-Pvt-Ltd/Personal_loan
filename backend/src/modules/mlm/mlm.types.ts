import { z } from 'zod';
import {
  createMlmPolicySchema,
  updateMlmPolicySchema,
  createMlmPolicyVersionSchema,
  updateMlmAllocationRoutesSchema,
  rejectMlmPolicyVersionSchema,
  simulateMlmPolicyVersionSchema,
  executeMlmAllocationSchema,
  mlmDistributionQuerySchema,
} from './mlm.validation';

export type CreateMlmPolicyDto = z.infer<typeof createMlmPolicySchema>;
export type UpdateMlmPolicyDto = z.infer<typeof updateMlmPolicySchema>;
export type CreateMlmPolicyVersionDto = z.infer<typeof createMlmPolicyVersionSchema>;
export type UpdateMlmAllocationRoutesDto = z.infer<typeof updateMlmAllocationRoutesSchema>;
export type RejectMlmPolicyVersionDto = z.infer<typeof rejectMlmPolicyVersionSchema>;
export type SimulateMlmPolicyVersionDto = z.infer<typeof simulateMlmPolicyVersionSchema>;
export type ExecuteMlmAllocationDto = z.infer<typeof executeMlmAllocationSchema>;
export type MlmDistributionQueryDto = z.infer<typeof mlmDistributionQuerySchema>;

export interface CandidateResult {
  routeId?: string;
  lenderId: string;
  productId: string;
  isEligible: boolean;
  rejectionReason?: string;
  allocationPercentage?: string;
  currentWeight?: string;
}

export interface SimulationResult {
  candidateResults: CandidateResult[];
  selectedRouteId: string | null;
  allocationMethod: string;
  decisionReasonCode?: string;
}
