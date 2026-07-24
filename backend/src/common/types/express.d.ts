import type { AuthenticatedUser } from './auth-user.type';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: AuthenticatedUser;
    }
  }
}

export {};
