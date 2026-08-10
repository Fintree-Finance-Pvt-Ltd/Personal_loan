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
import { OtpModule } from '../otp/otp.module';
import { CustomerAuthController } from './customer-auth.controller';
import { LenderIntegrationModule } from '../lender-integrations/lender-integration.module';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [LoanModule, PlatformPoliciesModule, MlmModule, ExternalApiModule, LenderIntegrationModule, ProductsModule, OtpModule, JwtModule.register({})],
  controllers: [CustomerController, CustomerAadhaarKycController, CustomerAuthController],
  providers: [CustomerService, CustomerAadhaarKycService],
  exports: [CustomerService, CustomerAadhaarKycService],
})
export class CustomerModule {}
