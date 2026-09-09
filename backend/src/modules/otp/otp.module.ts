import { Module } from '@nestjs/common';
import { EmailService } from './email/email.service';
import { OtpController } from './otp.controller';
import { OtpService } from './otp.service';
import { SmsService } from './sms/sms.service';

import { AttributionService } from '../customer/attribution.service';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [JwtModule.register({})],
  controllers: [OtpController],
  providers: [
    OtpService,
    SmsService,
    EmailService,
    AttributionService,
  ],
  exports: [
    OtpService,
    SmsService,
    EmailService,
    AttributionService,
  ],
})

export class OtpModule {}