-- Widen the consent catalogue to cover every point in the journey where an explicit
-- consent is taken, not just the four that were already modelled.
--
-- Existing rows are unaffected: the four original values keep their spelling, and the
-- three new ones are appended. Enum order is not semantic anywhere in the codebase.
ALTER TABLE `application_stage_consents`
    MODIFY COLUMN `consentType` ENUM(
        'LIVE_PHOTO_CAPTURE',
        'AADHAAR_KYC',
        'DATA_SHARING',
        'ACCOUNT_AGGREGATOR',
        'BUREAU_ENQUIRY',
        'LENDER_CREDIT_ASSESSMENT',
        'LENDER_DECISION_REQUEST'
    ) NOT NULL;

-- The lender's /consents endpoint accepts one consent per POST, so each consent type now
-- gets its own outbox row (and therefore its own Idempotency-Key) instead of a single
-- CONSENT event standing in for the data-sharing consent alone.
--
-- NULL means "an event queued before this column existed", which the processor treats as
-- DATA_SHARING — the only consent that was ever submitted previously.
ALTER TABLE `LenderIntegrationOutbox`
    ADD COLUMN `consentType` ENUM(
        'LIVE_PHOTO_CAPTURE',
        'AADHAAR_KYC',
        'DATA_SHARING',
        'ACCOUNT_AGGREGATOR',
        'BUREAU_ENQUIRY',
        'LENDER_CREDIT_ASSESSMENT',
        'LENDER_DECISION_REQUEST'
    ) NULL AFTER `idempotencyKey`;
