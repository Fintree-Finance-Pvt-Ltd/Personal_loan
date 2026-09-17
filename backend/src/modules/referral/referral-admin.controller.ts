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
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { ReferralService, CreateCampaignDto } from './referral.service';
import { CustomerBenefitStatus, ReferralCampaignStatus } from '@prisma/client';

@Controller('referral-admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReferralAdminController {
  constructor(private readonly referralService: ReferralService) {}

  // ── CAMPAIGN CONFIGURATION ENDPOINTS ──────────────────────────────────────

  @Permissions('ADMIN_DASHBOARD_VIEW')
  @Get('campaigns')
  @HttpCode(HttpStatus.OK)
  async getCampaigns() {
    return await this.referralService.getAdminCampaigns();
  }

  @Permissions('ADMIN_DASHBOARD_VIEW')
  @Post('campaigns')
  @HttpCode(HttpStatus.CREATED)
  async createCampaign(@Body() body: CreateCampaignDto) {
    return await this.referralService.createCampaign(body);
  }

  @Permissions('ADMIN_DASHBOARD_VIEW')
  @Put('campaigns/:id')
  @HttpCode(HttpStatus.OK)
  async updateCampaign(@Param('id') id: string, @Body() body: Partial<CreateCampaignDto>) {
    return await this.referralService.updateCampaign(id, body);
  }

  @Permissions('ADMIN_DASHBOARD_VIEW')
  @Patch('campaigns/:id/status')
  @HttpCode(HttpStatus.OK)
  async toggleCampaignStatus(
    @Param('id') id: string,
    @Body() body: { status: ReferralCampaignStatus },
  ) {
    return await this.referralService.updateCampaign(id, { status: body.status });
  }

  // ── REFERRAL REPORTS ENDPOINTS ────────────────────────────────────────────

  @Permissions('ADMIN_DASHBOARD_VIEW')
  @Get('reports')
  @HttpCode(HttpStatus.OK)
  async getReports(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('status') status?: string,
    @Query('customerQuery') customerQuery?: string,
    @Query('referralCode') referralCode?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return await this.referralService.getReferralReports({
      dateFrom,
      dateTo,
      status,
      customerQuery,
      referralCode,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Permissions('ADMIN_DASHBOARD_VIEW')
  @Get('reports/export')
  async exportReportsCsv(
    @Res() res: Response,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('status') status?: string,
    @Query('customerQuery') customerQuery?: string,
    @Query('referralCode') referralCode?: string,
  ) {
    const csvContent = await this.referralService.exportReferralReportsCsv({
      dateFrom,
      dateTo,
      status,
      customerQuery,
      referralCode,
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=referral-reports-${new Date().toISOString().split('T')[0]}.csv`,
    );
    return res.status(200).send(csvContent);
  }

  // ── CUSTOMER BENEFIT MANAGEMENT ENDPOINTS ────────────────────────────────

  @Permissions('ADMIN_DASHBOARD_VIEW')
  @Get('benefits')
  @HttpCode(HttpStatus.OK)
  async getBenefits(
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return await this.referralService.getAdminBenefits({
      customerId,
      status,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Permissions('ADMIN_DASHBOARD_VIEW')
  @Patch('benefits/:id')
  @HttpCode(HttpStatus.OK)
  async adjustBenefit(
    @Param('id') id: string,
    @Body()
    body: {
      status?: CustomerBenefitStatus;
      maxDiscountLimit?: number;
      expiryDate?: string;
    },
  ) {
    return await this.referralService.adjustAdminBenefit(id, body);
  }
}
