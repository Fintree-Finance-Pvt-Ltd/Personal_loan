import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/auth-user.type';
import { CreditReviewService } from './credit-review.service';

@Controller('admin/credit-review')
export class CreditReviewController {
  constructor(private readonly creditReviewService: CreditReviewService) {}

  @Get()
  @Permissions('APPLICATION_VIEW_MASKED')
  async listPending() {
    return this.creditReviewService.listPending();
  }

  @Post(':applicationId/approve')
  @Permissions('CREDIT_APPROVE')
  async approve(
    @Param('applicationId') applicationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.creditReviewService.approve(BigInt(applicationId), user.userId);
  }

  @Post(':applicationId/reject')
  @Permissions('CREDIT_REJECT')
  async reject(
    @Param('applicationId') applicationId: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.creditReviewService.reject(BigInt(applicationId), user.userId, body?.reason);
  }
}
