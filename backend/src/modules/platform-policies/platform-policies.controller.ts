import { Controller, Get, Post, Patch, Put, Param, Body, UseGuards, Query, Req } from '@nestjs/common';
import { PlatformPoliciesService } from './platform-policies.service';
import { PolicyEvaluationService } from './policy-evaluation.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Request } from 'express';
import {
  createPlatformPolicySchema,
  updatePlatformPolicySchema,
  updatePolicyRulesSchema,
  rejectPolicyVersionSchema,
  lifecycleActionSchema,
  activatePolicyVersionSchema,
  simulatePolicySchema
} from './platform-policies.validation';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PlatformPoliciesController {
  constructor(
    private policiesService: PlatformPoliciesService,
    private evalService: PolicyEvaluationService,
    private prisma: PrismaService
  ) {}

  @Get('platform-policies/rule-catalog')
  @Permissions('POLICY_READ')
  async getRuleCatalog() {
    return await this.policiesService.getRuleCatalog();
  }

  @Get('platform-policies')
  @Permissions('POLICY_READ')
  async findAll(@Query('skip') skip?: string, @Query('take') take?: string) {
    const skipNum = skip ? parseInt(skip, 10) : undefined;
    const takeNum = take ? parseInt(take, 10) : undefined;
    return await this.policiesService.findAll(skipNum, takeNum);
  }

  @Get('platform-policies/:policyId')
  @Permissions('POLICY_READ')
  async findOne(@Param('policyId') policyId: string) {
    return await this.policiesService.findOne(policyId);
  }

  @Post('platform-policies')
  @Permissions('POLICY_CREATE')
  async createPolicy(@Req() req: Request, @Body() body: any) {
    const data = createPlatformPolicySchema.parse(body);
    return await this.policiesService.createPolicy((req.user as any).userId, data);
  }

  @Patch('platform-policies/:policyId')
  @Permissions('POLICY_UPDATE')
  async updatePolicy(@Req() req: Request, @Param('policyId') policyId: string, @Body() body: any) {
    const data = updatePlatformPolicySchema.parse(body);
    return await this.policiesService.updatePolicy((req.user as any).userId, policyId, data);
  }

  @Post('platform-policies/:policyId/versions')
  @Permissions('POLICY_VERSION_CREATE')
  async createNewVersion(@Req() req: Request, @Param('policyId') policyId: string) {
    return await this.policiesService.createNewVersion((req.user as any).userId, policyId);
  }

  @Put('platform-policy-versions/:versionId/rules')
  @Permissions('POLICY_UPDATE')
  async updateVersionRules(@Req() req: Request, @Param('versionId') versionId: string, @Body() body: any) {
    const data = updatePolicyRulesSchema.parse(body);
    return await this.policiesService.updateVersionRules((req.user as any).userId, versionId, data.expectedVersion, data.rules);
  }

  @Post('platform-policy-versions/:versionId/submit')
  @Permissions('POLICY_SUBMIT')
  async submitVersion(@Req() req: Request, @Param('versionId') versionId: string, @Body() body: any) {
    const data = lifecycleActionSchema.parse(body);
    return await this.policiesService.submitVersion((req.user as any).userId, versionId, data.expectedVersion);
  }

  @Post('platform-policy-versions/:versionId/approve')
  @Permissions('POLICY_APPROVE')
  async approveVersion(@Req() req: Request, @Param('versionId') versionId: string, @Body() body: any) {
    const data = lifecycleActionSchema.parse(body);
    return await this.policiesService.approveVersion((req.user as any).userId, versionId, data.expectedVersion);
  }

  @Post('platform-policy-versions/:versionId/reject')
  @Permissions('POLICY_REJECT')
  async rejectVersion(@Req() req: Request, @Param('versionId') versionId: string, @Body() body: any) {
    const data = rejectPolicyVersionSchema.parse(body);
    return await this.policiesService.rejectVersion((req.user as any).userId, versionId, data.expectedVersion, data.rejectionReason);
  }

  @Post('platform-policy-versions/:versionId/activate')
  @Permissions('POLICY_ACTIVATE')
  async activateVersion(@Req() req: Request, @Param('versionId') versionId: string, @Body() body: any) {
    const data = activatePolicyVersionSchema.parse(body);
    return await this.policiesService.activateVersion((req.user as any).userId, versionId, data.expectedVersion, data.effectiveFrom ?? undefined);
  }

  @Post('platform-policy-versions/:versionId/simulate')
  @Permissions('POLICY_SIMULATE')
  async simulatePolicy(@Param('versionId') versionId: string, @Body() body: any) {
    const data = simulatePolicySchema.parse(body);
    
    // Fetch rules for the version
    const version = await this.prisma.platformPolicyVersion.findUnique({
      where: { id: versionId },
      include: { rules: true }
    });

    if (!version) {
      throw new Error('Version not found');
    }

    const result = this.evalService.evaluate(version.rules, data.inputs, data.evaluationDate);
    return result;
  }
}
