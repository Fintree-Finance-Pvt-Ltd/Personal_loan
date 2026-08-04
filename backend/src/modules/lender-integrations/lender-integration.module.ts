import {
  HttpModule,
} from '@nestjs/axios';
import {
  Module,
} from '@nestjs/common';
import {
  ConfigModule,
} from '@nestjs/config';

import {
  FintreeFinanceV1Adapter,
} from './adapters/fintree-finance-v1.adapter';

import {
  LENDER_ADAPTERS,
  LenderAdapterRegistry,
} from './lender-adapter.registry';

import {
  LenderDecisionProcessor,
} from './lender-decision-processor.service';

import {
  LenderDocumentFileService,
} from './lender-document-file.service';

import {
  LenderHttpService,
} from './lender-http.service';

import {
  LenderIntegrationAdminController,
} from './lender-integration-admin.controller';

import {
  LenderIntegrationOutboxService,
} from './lender-integration-outbox.service';

import {
  LenderIntegrationService,
} from './lender-integration.service';

import {
  LenderIntegrationWorker,
} from './lender-integration.worker';

@Module({
  imports: [
    HttpModule.register({
      maxRedirects: 0,
    }),

    ConfigModule,
  ],

  controllers: [
    LenderIntegrationAdminController,
  ],

  providers: [
    FintreeFinanceV1Adapter,

    {
      provide:
        LENDER_ADAPTERS,

      inject: [
        FintreeFinanceV1Adapter,
      ],

      useFactory: (
        fintree:
          FintreeFinanceV1Adapter,
      ) => [
        fintree,
      ],
    },

    LenderAdapterRegistry,
    LenderHttpService,
    LenderDocumentFileService,
    LenderIntegrationOutboxService,
    LenderIntegrationService,
    LenderIntegrationWorker,
    LenderDecisionProcessor,
  ],

  exports: [
    LenderAdapterRegistry,
    LenderHttpService,
    LenderIntegrationOutboxService,
    LenderIntegrationService,
    LenderIntegrationWorker,
  ],
})
export class LenderIntegrationModule {}