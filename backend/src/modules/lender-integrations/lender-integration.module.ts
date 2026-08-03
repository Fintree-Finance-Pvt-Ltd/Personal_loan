import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { MockLenderAAdapter } from './adapters/mock-lender-a.adapter';
import { MockLenderBAdapter } from './adapters/mock-lender-b.adapter';
import { PartnerAV1Adapter } from './adapters/partner-a-v1.adapter';
import { LENDER_ADAPTERS, LenderAdapterRegistry } from './lender-adapter.registry';
import { LenderHttpService } from './lender-http.service';
import { LenderIntegrationOutboxService } from './lender-integration-outbox.service';
import { LenderIntegrationService } from './lender-integration.service';
import { LenderIntegrationWorker } from './lender-integration.worker';
import { LenderDecisionProcessor } from './lender-decision-processor.service';
import { LenderIntegrationAdminController } from './lender-integration-admin.controller';

@Module({
  imports: [HttpModule.register({ maxRedirects: 0 })],
  controllers: [LenderIntegrationAdminController],
  providers: [
    MockLenderAAdapter,
    MockLenderBAdapter,
    PartnerAV1Adapter,
    {
      provide: LENDER_ADAPTERS,
      inject: [MockLenderAAdapter, MockLenderBAdapter, PartnerAV1Adapter],
      useFactory: (mockA: MockLenderAAdapter, mockB: MockLenderBAdapter, partnerA: PartnerAV1Adapter) => [mockA, mockB, partnerA],
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
