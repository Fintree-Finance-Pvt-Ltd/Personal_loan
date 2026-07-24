export interface AuthenticatedUser {
  userId: string;
  sessionId: string;
  authVersion: number;
  name: string;
  email: string;
  roleCodes: string[];
  permissionCodes: string[];
}
