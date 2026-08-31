import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SecurityEventsService } from '../../modules/security-events/security-events.service';
import type { AuthenticatedUser } from '../types/auth-user.type';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) return true;
    const required =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]) ?? [];
    if (required.length === 0) return true;
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;
   if (user?.roleCodes?.includes('SUPERADMIN')) return true;
    const granted = new Set(user?.permissionCodes ?? []);
    if (required.every((permission) => granted.has(permission) || user?.roleCodes?.includes(permission))) return true;
    await this.securityEvents.record({
      userId: user?.userId,
      sessionId: user?.sessionId,
      eventType: 'FORBIDDEN_ACCESS',
      severity: 'MEDIUM',
      requestId: request.requestId,
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
      metadata: { route: request.path, method: request.method, requiredPermissions: required },
    });
    throw new ForbiddenException({
      error: { code: 'AUTH_PERMISSION_REQUIRED', message: 'You do not have permission for this action.' },
    });
  }
}
