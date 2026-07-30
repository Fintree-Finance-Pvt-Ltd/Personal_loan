import { Module } from '@nestjs/common';
import { LoanController } from './loan.controller';
import { LoanService } from './loan.service';
import { ExternalApiModule } from '../external-api/external-api.module';
import { EasebuzzAutocollectService } from '../../integrations/easebuzz-autocollect.service';

@Module({
  imports: [ExternalApiModule],
  controllers: [LoanController],
  providers: [LoanService, EasebuzzAutocollectService],
  exports: [LoanService, EasebuzzAutocollectService],
})
export class LoanModule { }

