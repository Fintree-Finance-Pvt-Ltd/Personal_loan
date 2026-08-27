import { Module } from '@nestjs/common';
import { IvrModule } from '../integrations/ivr/ivr.module';
import { SmsModule } from '../integrations/sms/sms.module';
import { CreditReviewController } from './credit-review.controller';
import { CreditReviewService } from './credit-review.service';

@Module({
  imports: [IvrModule, SmsModule],
  providers: [CreditReviewService],
  controllers: [CreditReviewController],
})
export class CreditReviewModule {}

