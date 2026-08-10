import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ExternalApiController } from './external-api.controller';
import { ExternalApiService } from './external-api.service';
import { PlPaymentsService } from './pl-payments.service';
import { DigitapDigilockerService } from './digitap-digilocker.service';
import { DigioBankService } from './integrations/digio-bank.service';
import { LenderIntegrationModule } from '../lender-integrations/lender-integration.module';

@Module({
  imports: [
    HttpModule.register({
      maxRedirects: 0,
    }),
    LenderIntegrationModule,
  ],
  controllers: [ExternalApiController],
  providers: [
    ExternalApiService,
    PlPaymentsService,
    DigitapDigilockerService,
    DigioBankService,
  ],
  exports: [
    ExternalApiService,
    PlPaymentsService,
    DigitapDigilockerService,
    DigioBankService,
  ],
})
export class ExternalApiModule {}
