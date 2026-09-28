import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import {
  PartnerAdminService,
  CreateMarketingPartnerDto,
  UpdateMarketingPartnerDto,
} from './partner-admin.service';
import { PartnerApiClientStatus } from '@prisma/client';

@Controller('admin/marketing-partners')
export class PartnerAdminController {
  constructor(private readonly partnerAdminService: PartnerAdminService) {}

  @Permissions('ADMIN_DASHBOARD_VIEW')
  @Get()
  @HttpCode(HttpStatus.OK)
  async listPartners() {
    return await this.partnerAdminService.listPartners();
  }

  @Permissions('ADMIN_DASHBOARD_VIEW')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createPartner(@Body() body: CreateMarketingPartnerDto) {
    return await this.partnerAdminService.createPartner(body);
  }

  @Permissions('ADMIN_DASHBOARD_VIEW')
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async updatePartner(
    @Param('id') id: string,
    @Body() body: UpdateMarketingPartnerDto,
  ) {
    return await this.partnerAdminService.updatePartner(id, body);
  }

  @Permissions('ADMIN_DASHBOARD_VIEW')
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  async toggleStatus(
    @Param('id') id: string,
    @Body() body: { status: PartnerApiClientStatus },
  ) {
    return await this.partnerAdminService.toggleStatus(id, body.status);
  }

  @Permissions('ADMIN_DASHBOARD_VIEW')
  @Post(':id/rotate-secret')
  @HttpCode(HttpStatus.OK)
  async rotateSecret(@Param('id') id: string) {
    return await this.partnerAdminService.rotateSecret(id);
  }

  @Permissions('ADMIN_DASHBOARD_VIEW')
  @Get('analytics')
  @HttpCode(HttpStatus.OK)
  async getAnalytics() {
    return await this.partnerAdminService.getAttributionAnalytics();
  }
}
