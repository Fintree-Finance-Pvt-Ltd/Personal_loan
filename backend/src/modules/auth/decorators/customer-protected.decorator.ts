import {
  applyDecorators,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { CustomerAuthGuard } from '../guards/customer-auth.guard';

/**
 * Bypasses the global Admin JWT guard and applies the Customer JWT guard.
 *
 * @Public() here does not make the route unauthenticated because
 * CustomerAuthGuard is still applied explicitly.
 */
export function CustomerProtected() {
  return applyDecorators(
    Public(),
    UseGuards(CustomerAuthGuard),
  );
}