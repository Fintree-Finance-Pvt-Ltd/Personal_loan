import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { LenderIntegrationModule } from '../lender-integrations/lender-integration.module';

@Module({
  // For LenderIntegrationOutboxService, to record the live-photo capture consent.
  imports: [LenderIntegrationModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
