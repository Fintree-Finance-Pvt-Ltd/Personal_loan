import { Module } from '@nestjs/common';
import { ElectronicSignController } from './electronic-sign.controller';
import { ElectronicSignService } from './electronic-sign.service';
import { AgreementDocumentService } from './services/agreement-document.service';
import { PdfStampService } from './services/pdf-stamp.service';
import { SigningStorageService } from './services/signing-storage.service';
import { OtpSignService } from './services/otp-sign.service';
import { SigningEvidenceService } from './services/signing-evidence.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { SmsService } from '../otp/sms/sms.service';

@Module({
  imports: [AuditLogsModule],
  controllers: [ElectronicSignController],
  providers: [
    ElectronicSignService,
    AgreementDocumentService,
    PdfStampService,
    SigningStorageService,
    OtpSignService,
    SigningEvidenceService,
    SmsService,
  ],
  exports: [ElectronicSignService],
})
export class ElectronicSignModule {}
