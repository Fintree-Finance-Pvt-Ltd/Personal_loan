import { Controller, Get } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/auth-user.type';
import { AdminDashboardService } from './admin-dashboard.service';

@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

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

  // Business/portfolio metrics for the management-facing dashboard: application
  // funnel, disbursal totals, collections, portfolio outstanding (POS), and DPD
  // buckets. Kept as its own endpoint rather than folded into the one above so the
  // (cheap) security-foundation view isn't slowed down by these aggregate queries.
  @Permissions('ADMIN_DASHBOARD_VIEW')
  @Get('metrics')
  getMetrics() {
    return this.dashboardService.getMetrics();
  }
}
