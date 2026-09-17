import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { ReferralService } from './referral.service';
import { ReferralCustomerController } from './referral-customer.controller';
import { ReferralAdminController } from './referral-admin.controller';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [ReferralCustomerController, ReferralAdminController],
  providers: [ReferralService],
  exports: [ReferralService],
})
export class ReferralModule {}
