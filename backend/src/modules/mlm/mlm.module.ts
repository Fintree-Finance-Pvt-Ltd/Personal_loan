import { Module } from '@nestjs/common';
import { MlmAllocationEngineService } from './services/mlm-allocation-engine/mlm-allocation-engine.service';
import { SmoothWeightedRoundRobinService } from './services/smooth-weighted-round-robin.service';
import { MlmService } from './services/mlm/mlm.service';
import { MlmController } from './controllers/mlm/mlm.controller';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [AuditLogsModule],
  providers: [SmoothWeightedRoundRobinService, MlmAllocationEngineService, MlmService],
  controllers: [MlmController]
})
export class MlmModule {}
