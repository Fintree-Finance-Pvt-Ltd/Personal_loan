import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../infrastructure/prisma/prisma.module';
import { SmsAutomationService } from './sms-automation.service';
import { SmsController } from './sms.controller';
import { SmsService } from './sms.service';

@Module({
  imports: [PrismaModule],
  controllers: [SmsController],
  providers: [SmsService, SmsAutomationService],
  exports: [SmsService, SmsAutomationService],
})
export class SmsModule {}
