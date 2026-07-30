import { Module } from '@nestjs/common';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { LoanModule } from '../loan/loan.module';
import { PlatformPoliciesModule } from '../platform-policies/platform-policies.module';
import { MlmModule } from '../mlm/mlm.module';

@Module({
  imports: [LoanModule, PlatformPoliciesModule, MlmModule],
  controllers: [CustomerController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerModule {}
