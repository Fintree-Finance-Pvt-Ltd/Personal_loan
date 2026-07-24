import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../types/auth-user.type';

export const CurrentSession = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const user = context.switchToHttp().getRequest<Request>().user as AuthenticatedUser | undefined;
  return user?.sessionId;
});
