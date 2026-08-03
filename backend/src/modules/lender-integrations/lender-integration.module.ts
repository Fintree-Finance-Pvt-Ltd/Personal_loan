import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { FintreeFinanceV1Adapter } from './adapters/fintree-finance-v1.adapter';
import { LENDER_ADAPTERS, LenderAdapterRegistry } from './lender-adapter.registry';
import { LenderHttpService } from './lender-http.service';
import { LenderIntegrationOutboxService } from './lender-integration-outbox.service';
import { LenderIntegrationService } from './lender-integration.service';
import { LenderIntegrationWorker } from './lender-integration.worker';
import { LenderDecisionProcessor } from './lender-decision-processor.service';
import { LenderIntegrationAdminController } from './lender-integration-admin.controller';

import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [HttpModule.register({ maxRedirects: 0 }), ConfigModule],
  controllers: [LenderIntegrationAdminController],
  providers: [
    FintreeFinanceV1Adapter,
    {
      provide: LENDER_ADAPTERS,
      inject: [FintreeFinanceV1Adapter],
      useFactory: (fintree: FintreeFinanceV1Adapter) => [fintree],
    },
    LenderAdapterRegistry,
    LenderHttpService,
    LenderIntegrationOutboxService,
    LenderIntegrationService,
    LenderIntegrationWorker,
    LenderDecisionProcessor,
  ],
  exports: [LenderAdapterRegistry, LenderHttpService, LenderIntegrationOutboxService, LenderIntegrationService, LenderIntegrationWorker],
})
export class LenderIntegrationModule {}
