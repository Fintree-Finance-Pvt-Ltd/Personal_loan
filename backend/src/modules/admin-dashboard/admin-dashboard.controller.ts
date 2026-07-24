import { Controller, Get } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/auth-user.type';

@Controller('admin/dashboard')
export class AdminDashboardController {
  @Permissions('ADMIN_DASHBOARD_VIEW')
  @Get()
  view(@CurrentUser() user: AuthenticatedUser) {
    return {
      administrator: { name: user.name, email: user.email },
      securityFoundation: {
        accessToken: 'short-lived',
        refreshRotation: 'enabled',
        rbac: 'backend-enforced',
        auditIntegrity: 'HMAC-protected',
      },
    };
  }
}
