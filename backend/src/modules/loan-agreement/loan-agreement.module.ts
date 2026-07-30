import { Module } from '@nestjs/common';
import { LoanAgreementController } from './loan-agreement.controller';
import { LoanAgreementService } from './services/loan-agreement.service';
import { LoanAgreementDataBuilder } from './builders/loan-agreement-data.builder';

@Module({
  controllers: [LoanAgreementController],
  providers: [LoanAgreementService, LoanAgreementDataBuilder],
  exports: [LoanAgreementService, LoanAgreementDataBuilder],
})
export class LoanAgreementModule {}
