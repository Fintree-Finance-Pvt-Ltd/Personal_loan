import { Module } from '@nestjs/common';
import { LoanController } from './loan.controller';
import { LoanService } from './loan.service';
import { ExternalApiModule } from '../external-api/external-api.module';
import { EasebuzzAutocollectService } from '../../integrations/easebuzz-autocollect.service';
import { ProductsModule } from '../products/products.module';
import { LenderIntegrationModule } from '../lender-integrations/lender-integration.module';

import { ApplicationTransitionService } from './services/application-transition.service';

@Module({
  imports: [ExternalApiModule, ProductsModule, LenderIntegrationModule],
  controllers: [LoanController],
  providers: [LoanService, EasebuzzAutocollectService, ApplicationTransitionService],
  exports: [LoanService, EasebuzzAutocollectService, ApplicationTransitionService],
})
export class LoanModule { }

