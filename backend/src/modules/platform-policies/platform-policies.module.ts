import { Module } from '@nestjs/common';
import { PlatformPoliciesService } from './platform-policies.service';
import { PolicyEvaluationService } from './policy-evaluation.service';
import { PlatformPoliciesController } from './platform-policies.controller';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [PlatformPoliciesController],
  providers: [PlatformPoliciesService, PolicyEvaluationService],
  exports: [PlatformPoliciesService, PolicyEvaluationService],
})
export class PlatformPoliciesModule {}
