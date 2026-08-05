import { Module } from '@nestjs/common';
import { CreditReviewService } from './credit-review.service';
import { CreditReviewController } from './credit-review.controller';

@Module({
  providers: [CreditReviewService],
  controllers: [CreditReviewController],
})
export class CreditReviewModule {}
