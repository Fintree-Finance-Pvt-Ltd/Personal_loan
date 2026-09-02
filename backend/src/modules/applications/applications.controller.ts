import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { ApplicationsService } from './applications.service';
import { FaceMatchService } from '../external-api/face-match.service';

@Controller('admin/applications')
export class ApplicationsController {
  constructor(
    private readonly applicationsService: ApplicationsService,
    private readonly faceMatchService: FaceMatchService,
  ) {}

  @Get()
  @Permissions('APPLICATION_VIEW_MASKED')
  async list(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.applicationsService.list({
      search,
      status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':applicationId')
  @Permissions('APPLICATION_VIEW_MASKED')
  async getDetails(@Param('applicationId') applicationId: string) {
    return this.applicationsService.getDetails(BigInt(applicationId));
  }

  /**
   * Re-runs the Digitap face match for this application. Used when the automatic run at
   * Aadhaar-KYC time recorded SKIPPED/ERROR (provider outage, Aadhaar PDF not yet
   * downloaded) or when the customer has since retaken their live photo. Awaited rather
   * than backgrounded so the reviewer sees the outcome of the button they pressed.
   */
  @Post(':applicationId/face-match')
  @HttpCode(HttpStatus.OK)
  @Permissions('APPLICATION_VIEW_MASKED')
  async runFaceMatch(@Param('applicationId') applicationId: string) {
    await this.faceMatchService.runForApplication(BigInt(applicationId), { force: true });
    return {
      success: true,
      data: await this.faceMatchService.getForApplication(BigInt(applicationId)),
    };
  }
}
