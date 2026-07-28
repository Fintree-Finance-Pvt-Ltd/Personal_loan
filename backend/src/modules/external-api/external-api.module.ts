import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ExternalApiController } from './external-api.controller';
import { ExternalApiService } from './external-api.service';
import { PlPaymentsService } from './pl-payments.service';
import { DigitapDigilockerService } from './digitap-digilocker.service';
import { DigioBankService } from './integrations/digio-bank.service';

@Module({
  imports: [
    HttpModule.register({
      maxRedirects: 0,
    }),
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