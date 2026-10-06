export type ReminderTier = 'FIRST' | 'SECOND' | 'WEEKLY' | 'FINAL';

export interface StageReminderJobPayload {
  applicationId: string;
  stage: string;
  reminderNumber: number; // 1, 2, 3, 4, 5
  scheduledAt: string;
}

export const STAGE_REMINDER_CONSTANTS = {
  QUEUE_NAME: 'application-stage-reminders',
  MAX_WEEKLY_REMINDERS: 3,
  MAX_TOTAL_REMINDERS: 5,
  // Default delays in milliseconds
  ONE_DAY_MS: 24 * 60 * 60 * 1000,
  SEVEN_DAYS_MS: 7 * 24 * 60 * 60 * 1000,
};

export function getReminderTier(reminderNumber: number): ReminderTier {
  if (reminderNumber <= 1) return 'FIRST';
  if (reminderNumber === 2) return 'SECOND';
  if (reminderNumber >= 5) return 'FINAL';
  return 'WEEKLY';
}

export function buildReminderJobId(
  applicationId: string | bigint | number,
  stage: string,
  reminderNumber: number,
): string {
  return `stage-reminder:${applicationId}:${stage}:${reminderNumber}`;
}

export interface ApplicationStageResolution {
  stage: string;
  stageDisplayName: string;
  isTerminal: boolean;
  terminalReason?: string;
  customerMobile?: string;
  customerName?: string;
  reference?: string;
  lan?: string;
}

export interface StageReminderMessageContent {
  templateName: string;
  headerTitle: string;
  stepDescription: string;
  bodyParameters: string[];
}
