import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Param,
  Body,
  Query,
  UsePipes,
  PipeTransform,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { MlmService } from '../../services/mlm/mlm.service';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../../../common/types/auth-user.type';
import { ZodSchema } from 'zod';
import {
  createMlmPolicySchema,
  updateMlmPolicySchema,
  createMlmPolicyVersionSchema,
  updateMlmAllocationRoutesSchema,
  rejectMlmPolicyVersionSchema,
  simulateMlmPolicyVersionSchema,
  executeMlmAllocationSchema,
  mlmDistributionQuerySchema,
} from '../../mlm.validation';
import {
  CreateMlmPolicyDto,
  UpdateMlmPolicyDto,
  CreateMlmPolicyVersionDto,
  UpdateMlmAllocationRoutesDto,
  RejectMlmPolicyVersionDto,
  SimulateMlmPolicyVersionDto,
  ExecuteMlmAllocationDto,
  MlmDistributionQueryDto,
} from '../../mlm.types';

export class ZodPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}
  transform(value: any, metadata: ArgumentMetadata) {
    if (metadata.type !== 'body') return value;
    try {
      return this.schema.parse(value);
    } catch (error: any) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: error.errors,
      });
    }
  }
}

@Controller('admin')
export class MlmController {
  constructor(private readonly mlmService: MlmService) {}

  @Get('mlm-allocation-options')
  @Permissions('MLM_READ')
  async getAllocationOptions(@Query('platformProductId') platformProductId: string) {
    if (!platformProductId) {
      throw new BadRequestException('platformProductId is required');
    }
    const eligibleLenderProducts = await this.mlmService.getEligibleLenderProducts(platformProductId);
    return {
      methods: ['WEIGHTED_FAIR_SHARE'],
      lenderProducts: eligibleLenderProducts,
    };
  }

  @Get('mlm-distribution')
  @Permissions('MLM_READ')
  @UsePipes(new ZodPipe(mlmDistributionQuerySchema))
  async getDistributionDashboard(@Query() query: MlmDistributionQueryDto) {
    return this.mlmService.getDistributionDashboard(query);
  }

  @Get('mlm-policies')
  @Permissions('MLM_READ')
  async listPolicies() {
    return this.mlmService.listPolicies();
  }

  @Get('mlm-policies/:policyId')
  @Permissions('MLM_READ')
  async getPolicyDetails(@Param('policyId') policyId: string) {
    return this.mlmService.getPolicyDetails(policyId);
  }

  @Post('mlm-policies')
  @Permissions('MLM_CREATE')
  @UsePipes(new ZodPipe(createMlmPolicySchema))
  async createPolicy(
    @Body() dto: CreateMlmPolicyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mlmService.createPolicy(dto, user.userId);
  }

  @Patch('mlm-policies/:policyId')
  @Permissions('MLM_UPDATE')
  @UsePipes(new ZodPipe(updateMlmPolicySchema))
  async updatePolicy(
    @Param('policyId') policyId: string,
    @Body() dto: UpdateMlmPolicyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mlmService.updatePolicy(policyId, dto, user.userId);
  }

  @Post('mlm-policies/:policyId/versions')
  @Permissions('MLM_VERSION_CREATE')
  @UsePipes(new ZodPipe(createMlmPolicyVersionSchema))
  async createPolicyVersion(
    @Param('policyId') policyId: string,
    @Body() dto: CreateMlmPolicyVersionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mlmService.createPolicyVersion(policyId, dto, user.userId);
  }

  @Put('mlm-policy-versions/:versionId/routes')
  @Permissions('MLM_UPDATE')
  @UsePipes(new ZodPipe(updateMlmAllocationRoutesSchema))
  async updatePolicyVersionRoutes(
    @Param('versionId') versionId: string,
    @Body() dto: UpdateMlmAllocationRoutesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mlmService.updatePolicyVersionRoutes(versionId, dto, user.userId);
  }

  @Post('mlm-policy-versions/:versionId/submit')
  @Permissions('MLM_SUBMIT')
  async submitVersion(
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mlmService.submitVersion(versionId, user.userId);
  }

  @Post('mlm-policy-versions/:versionId/approve')
  @Permissions('MLM_APPROVE')
  async approveVersion(
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mlmService.approveVersion(versionId, user.userId);
  }

  @Post('mlm-policy-versions/:versionId/reject')
  @Permissions('MLM_REJECT')
  @UsePipes(new ZodPipe(rejectMlmPolicyVersionSchema))
  async rejectVersion(
    @Param('versionId') versionId: string,
    @Body() dto: RejectMlmPolicyVersionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mlmService.rejectVersion(versionId, dto, user.userId);
  }

  @Post('mlm-policy-versions/:versionId/activate')
  @Permissions('MLM_ACTIVATE')
  async activateVersion(
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mlmService.activateVersion(versionId, user.userId);
  }

  @Post('mlm-policy-versions/:versionId/simulate')
  @Permissions('MLM_SIMULATE')
  @UsePipes(new ZodPipe(simulateMlmPolicyVersionSchema))
  async simulateVersion(
    @Param('versionId') versionId: string,
    @Body() dto: SimulateMlmPolicyVersionDto,
  ) {
    return this.mlmService.simulateVersion(versionId, dto);
  }

  @Post('mlm-allocations/execute')
  @Permissions('MLM_EXECUTE')
  @UsePipes(new ZodPipe(executeMlmAllocationSchema))
  async executeAllocation(@Body() dto: ExecuteMlmAllocationDto) {
    return this.mlmService.executeAllocation(dto);
  }

  @Get('mlm-allocations/:applicationReference')
  @Permissions('MLM_READ')
  async getAllocation(@Param('applicationReference') applicationReference: string) {
    const res = await this.mlmService['prisma'].mlmAllocationDecision.findUnique({
       where: { applicationReference },
       include: { attempts: true, route: true }
    });
    return res;
  }
}
