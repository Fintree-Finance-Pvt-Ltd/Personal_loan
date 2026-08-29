import { Module, forwardRef } from '@nestjs/common';
import { LoanController } from './loan.controller';
import { AdminLoanServicingController } from './admin-loan-servicing.controller';
import { LoanService } from './loan.service';
import { ExternalApiModule } from '../external-api/external-api.module';
import { EasebuzzAutocollectService } from '../../integrations/easebuzz-autocollect.service';
import { ProductsModule } from '../products/products.module';
import { LenderIntegrationModule } from '../lender-integrations/lender-integration.module';
import { OtpModule } from '../otp/otp.module';
// Deliberately NOT importing ElectronicSignModule: it statically imports
// AgreementDocumentService -> loan-agreement.service.ts -> puppeteer, an ESM-only
// package Jest can't parse (see signing-storage.service.ts import below for why this
// matters) — pulling that whole chain into LoanModule broke every test that transitively
// loads loan.service.ts. SigningStorageService itself has zero dependencies, so it's
// provided directly here instead of importing the module it normally lives in.
import { SigningStorageService } from '../electronic-sign/services/signing-storage.service';

import { ApplicationTransitionService } from './services/application-transition.service';
import { EasebuzzCollectionCronService } from './services/easebuzz-collection-cron.service';
import { IvrModule } from '../integrations/ivr/ivr.module';
import { SmsModule } from '../integrations/sms/sms.module';
import { WhatsAppModule } from '../integrations/whatsapp/whatsapp.module';

@Module({
  imports: [
    forwardRef(() => ExternalApiModule),
    ProductsModule,
    LenderIntegrationModule,
    OtpModule,
    IvrModule,
    SmsModule,
    WhatsAppModule,
  ],
  controllers: [LoanController, AdminLoanServicingController],
  providers: [LoanService, EasebuzzAutocollectService, ApplicationTransitionService, EasebuzzCollectionCronService, SigningStorageService],
  exports: [LoanService, EasebuzzAutocollectService, ApplicationTransitionService, EasebuzzCollectionCronService],
})
export class LoanModule { }

