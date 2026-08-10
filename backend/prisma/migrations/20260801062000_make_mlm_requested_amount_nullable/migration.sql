-- Preserve requested amount for future use while allowing the current
-- customer journey to proceed without collecting it.
ALTER TABLE `MlmAllocationDecision`
  MODIFY `requestedAmount` DECIMAL(12, 2) NULL;

ALTER TABLE `MlmAllocationAttempt`
  MODIFY `requestedAmount` DECIMAL(12, 2) NULL;
