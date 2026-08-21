import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ExternalApiController } from './external-api.controller';
import { ExternalApiService } from './external-api.service';
import { PlPaymentsService } from './pl-payments.service';
import { DigitapDigilockerService } from './digitap-digilocker.service';
import { DigioBankService } from './integrations/digio-bank.service';
import { LenderIntegrationModule } from '../lender-integrations/lender-integration.module';
import { LoanModule } from '../loan/loan.module';

@Module({
  imports: [
    HttpModule.register({
      maxRedirects: 0,
    }),
    LenderIntegrationModule,
    // Circular: LoanModule already imports ExternalApiModule for ExternalApiService.
    // PlPaymentsService needs LoanService the other way, to credit an EMI repayment
    // once its webhook signature/idempotency/amount checks all pass (VAPT C1/C2 fix).
    forwardRef(() => LoanModule),
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
