import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) {
      return true;
    }
    return super.canActivate(context);
  }

  handleRequest<TUser>(error: unknown, user: TUser): TUser {
    if (error || !user) {
      throw new UnauthorizedException({
        error: { code: 'AUTH_REQUIRED', message: 'Authentication is required.' },
      });
    }
    return user;
  }
}
