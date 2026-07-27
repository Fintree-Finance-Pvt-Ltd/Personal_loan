import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ExternalApiController } from './external-api.controller';
import { ExternalApiService } from './external-api.service';
import { PlPaymentsService } from './pl-payments.service';

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
  ],
  exports: [
    ExternalApiService,
    PlPaymentsService,
  ],
})
export class ExternalApiModule {}