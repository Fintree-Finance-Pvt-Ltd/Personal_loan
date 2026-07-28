import { Module } from '@nestjs/common';
import { EmailService } from './email/email.service';
import { OtpController } from './otp.controller';
import { OtpService } from './otp.service';
import { SmsService } from './sms/sms.service';

@Module({
  controllers: [OtpController],
  providers: [
    OtpService,
    SmsService,
    EmailService,
  ],
  exports: [
    OtpService,
    SmsService,
    EmailService,
  ],
})
export class OtpModule {}