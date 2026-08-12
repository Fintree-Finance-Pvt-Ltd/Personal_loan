import { Controller, Get, Param, Query } from '@nestjs/common';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { ApplicationsService } from './applications.service';

@Controller('admin/applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

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
}
