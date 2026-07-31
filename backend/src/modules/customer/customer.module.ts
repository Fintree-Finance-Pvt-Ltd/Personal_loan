import { Module } from '@nestjs/common';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { CustomerAadhaarKycController } from './customer-aadhaar-kyc.controller';
import { CustomerAadhaarKycService } from './customer-aadhaar-kyc.service';
import { LoanModule } from '../loan/loan.module';
import { PlatformPoliciesModule } from '../platform-policies/platform-policies.module';
import { MlmModule } from '../mlm/mlm.module';
import { ExternalApiModule } from '../external-api/external-api.module';

import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [LoanModule, PlatformPoliciesModule, MlmModule, ExternalApiModule, JwtModule.register({})],
  controllers: [CustomerController, CustomerAadhaarKycController],
  providers: [CustomerService, CustomerAadhaarKycService],
  exports: [CustomerService, CustomerAadhaarKycService],
})
export class CustomerModule {}
