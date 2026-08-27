import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../../../common/types/auth-user.type';
import { IvrService } from './ivr.service';
import { IvrCallType, IvrTriggerSource } from './ivr.types';

@Controller('admin')
export class IvrController {
  constructor(private readonly ivrService: IvrService) {}

  /**
   * Trigger outbound AI call for a loan application.
   * Route: POST /api/admin/applications/:applicationId/ivr/call
   */
  @Post('applications/:applicationId/ivr/call')
  @Permissions('APPLICATION_VIEW_MASKED')
  @HttpCode(HttpStatus.OK)
  async callApplicationCustomer(
    @Param('applicationId') applicationId: string,
    @Body('callType') callType?: IvrCallType,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const triggerSource = user?.roleCodes?.includes('SUPER_ADMIN')
      ? IvrTriggerSource.ADMIN
      : user?.roleCodes?.includes('CREDIT_ANALYST')
      ? IvrTriggerSource.CREDIT
      : user?.roleCodes?.includes('OPERATIONS_OFFICER')
      ? IvrTriggerSource.OPERATIONS
      : IvrTriggerSource.ADMIN;

    return this.ivrService.makeCall({
      applicationId: BigInt(applicationId),
      callType: callType || IvrCallType.APPLICATION_FOLLOW_UP,
      triggerSource,
      triggeredById: user?.userId,
    });
  }

  /**
   * Trigger outbound AI call for a loan by LAN.
   * Route: POST /api/admin/loans/:lan/ivr/call
   */
  @Post('loans/:lan/ivr/call')
  @Permissions('APPLICATION_VIEW_MASKED')
  @HttpCode(HttpStatus.OK)
  async callLoanCustomer(
    @Param('lan') lan: string,
    @Body('callType') callType?: IvrCallType,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const triggerSource = user?.roleCodes?.includes('SUPER_ADMIN')
      ? IvrTriggerSource.ADMIN
      : IvrTriggerSource.ADMIN;

    return this.ivrService.makeCall({
      lan,
      callType: callType || IvrCallType.APPLICATION_FOLLOW_UP,
      triggerSource,
      triggeredById: user?.userId,
    });
  }

  /**
   * Fetch and sync latest call status from Pipecat provider.
   * Route: GET /api/admin/ivr/calls/:callId
   */
  @Get('ivr/calls/:callId')
  @Permissions('APPLICATION_VIEW_MASKED')
  async getCallStatus(@Param('callId') callId: string) {
    return this.ivrService.getCallStatus(callId);
  }

  /**
   * Fetch IVR call history for a loan application.
   * Route: GET /api/admin/applications/:applicationId/ivr/history
   */
  @Get('applications/:applicationId/ivr/history')
  @Permissions('APPLICATION_VIEW_MASKED')
  async getApplicationCallHistory(
    @Param('applicationId') applicationId: string,
  ) {
    return this.ivrService.getCallHistory({
      applicationId: BigInt(applicationId),
    });
  }

  /**
   * Fetch IVR call history for a loan by LAN.
   * Route: GET /api/admin/loans/:lan/ivr/history
   */
  @Get('loans/:lan/ivr/history')
  @Permissions('APPLICATION_VIEW_MASKED')
  async getLoanCallHistory(@Param('lan') lan: string) {
    return this.ivrService.getCallHistory({
      lan,
    });
  }
}
