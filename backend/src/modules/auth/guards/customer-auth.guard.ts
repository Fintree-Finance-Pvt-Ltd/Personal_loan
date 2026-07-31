import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class CustomerAuthGuard extends AuthGuard('customer-jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any) {
    if (err || !user || user.audience !== 'personal-loan-customer') {
      throw err || new UnauthorizedException({
        error: { code: 'CUSTOMER_AUTH_REQUIRED', message: 'Customer authentication is required.' }
      });
    }
    return user;
  }
}
