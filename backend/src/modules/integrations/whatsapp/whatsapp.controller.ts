import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { WhatsAppAutomationService } from './whatsapp-automation.service';
import { WhatsAppService } from './whatsapp.service';
import {
  SendTemplateMessageParams,
  WhatsAppEventType,
  WhatsAppTemplateName,
  WhatsAppTriggerSource,
} from './whatsapp.types';

@Controller('admin/whatsapp')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WhatsAppController {
  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly whatsappAutomation: WhatsAppAutomationService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Directly send a customized WhatsApp template message for testing / manual operations.
   */
  @Post('send-template')
  @HttpCode(HttpStatus.OK)
  async sendTemplate(@Body() body: SendTemplateMessageParams) {
    if (!body?.to || !body?.templateName) {
      throw new BadRequestException('Recipient mobile (to) and templateName are required.');
    }

    return this.whatsappService.sendTemplateMessage({
      ...body,
      triggerSource: WhatsAppTriggerSource.MANUAL_TEST,
    });
  }

  /**
   * Test a complete lifecycle event flow (DB-driven) for a given application or loan.
   */
  @Post('test-event')
  @HttpCode(HttpStatus.OK)
  async triggerTestEvent(
    @Body()
    body: {
      eventType: WhatsAppEventType;
      applicationId?: string | number;
      lan?: string;
      installmentId?: string | number;
    },
  ) {
    const { eventType, applicationId, lan, installmentId } = body;

    switch (eventType) {
      case WhatsAppEventType.LOAN_APPROVED:
        if (!applicationId) {
          throw new BadRequestException('applicationId is required for LOAN_APPROVED event.');
        }
        return this.whatsappAutomation.triggerLoanApprovedWhatsApp(
          applicationId,
          lan,
          WhatsAppTriggerSource.MANUAL_TEST,
        );

      case WhatsAppEventType.LOAN_DISBURSED: {
        let targetLan = lan;
        let app: any = null;
        if (applicationId) {
          app = await this.prisma.plApplication.findUnique({
            where: { id: BigInt(applicationId) },
            include: { customer: true, loans: { take: 1, orderBy: { id: 'desc' } } },
          });
          if (!targetLan) {
            targetLan = app?.platformLan || app?.loans?.[0]?.lan;
          }
        }
        if (targetLan) {
          const res = await this.whatsappAutomation.triggerLoanDisbursedWhatsApp(
            targetLan,
            WhatsAppTriggerSource.MANUAL_TEST,
          );
          if (res) return res;
        }
        if (app?.customer?.mobileNumber) {
          const customerName = this.whatsappService.formatCustomerName(app.customer.fullName);
          const amount = this.whatsappService.formatAmount(app.selectedAmount || app.approvedAmount || 50000);
          return this.whatsappService.sendTemplateMessage({
            to: app.customer.mobileNumber,
            templateName: WhatsAppTemplateName.LOAN_DISBURSED,
            languageCode: 'en',
            bodyParameters: [customerName, amount, targetLan || app.platformLan || app.applicationNumber],
            customerId: app.customerId,
            applicationId: app.id,
            lan: targetLan || app.platformLan || undefined,
            eventType: WhatsAppEventType.LOAN_DISBURSED,
            triggerSource: WhatsAppTriggerSource.MANUAL_TEST,
          });
        }
        throw new BadRequestException('Cannot test LOAN_DISBURSED: Customer mobile number or application not found.');
      }

      case WhatsAppEventType.FULLY_PAID: {
        let paidLan = lan;
        let app: any = null;
        if (applicationId) {
          app = await this.prisma.plApplication.findUnique({
            where: { id: BigInt(applicationId) },
            include: { customer: true, loans: { take: 1, orderBy: { id: 'desc' } } },
          });
          if (!paidLan) {
            paidLan = app?.platformLan || app?.loans?.[0]?.lan;
          }
        }
        if (paidLan) {
          const res = await this.whatsappAutomation.triggerLoanFullyPaidWhatsApp(
            paidLan,
            applicationId,
            WhatsAppTriggerSource.MANUAL_TEST,
          );
          if (res) return res;
        }
        if (app?.customer?.mobileNumber) {
          const customerName = this.whatsappService.formatCustomerName(app.customer.fullName);
          return this.whatsappService.sendTemplateMessage({
            to: app.customer.mobileNumber,
            templateName: WhatsAppTemplateName.FULLY_PAID,
            languageCode: 'en',
            bodyParameters: [customerName, '₹1,00,000'],
            customerId: app.customerId,
            applicationId: app.id,
            lan: paidLan || app.platformLan || undefined,
            eventType: WhatsAppEventType.FULLY_PAID,
            triggerSource: WhatsAppTriggerSource.MANUAL_TEST,
          });
        }
        throw new BadRequestException('Cannot test FULLY_PAID: Customer mobile number or application not found.');
      }

      case WhatsAppEventType.EMI_DUE: {
        let targetInstallmentId = installmentId;
        let app: any = null;
        if (applicationId) {
          app = await this.prisma.plApplication.findUnique({
            where: { id: BigInt(applicationId) },
            include: { customer: true, loans: { take: 1, orderBy: { id: 'desc' } } },
          });
        }
        if (!targetInstallmentId && (lan || applicationId)) {
          const rps = await this.prisma.plRepaymentSchedule.findFirst({
            where: {
              ...(lan ? { lan } : {}),
              ...(applicationId ? { loan: { applicationId: BigInt(applicationId) } } : {}),
              paymentStatus: { not: 'PAID' },
            },
            orderBy: { installmentNumber: 'asc' },
          }) || await this.prisma.plRepaymentSchedule.findFirst({
            where: {
              ...(lan ? { lan } : {}),
              ...(applicationId ? { loan: { applicationId: BigInt(applicationId) } } : {}),
            },
            orderBy: { id: 'desc' },
          });
          if (rps) {
            targetInstallmentId = rps.id.toString();
          }
        }
        if (targetInstallmentId) {
          const res = await this.whatsappAutomation.triggerEmiDueReminderWhatsApp(
            targetInstallmentId,
            WhatsAppTriggerSource.MANUAL_TEST,
          );
          if (res) return res;
        }
        if (app?.customer?.mobileNumber) {
          const customerName = this.whatsappService.formatCustomerName(app.customer.fullName);
          const loanRef = lan || app.platformLan || app.loans?.[0]?.lan || app.applicationNumber;
          return this.whatsappService.sendTemplateMessage({
            to: app.customer.mobileNumber,
            templateName: WhatsAppTemplateName.EMI_DUE_REMINDER,
            languageCode: 'en',
            bodyParameters: [customerName, '₹4,850', loanRef, '05 Sep 2026'],
            customerId: app.customerId,
            applicationId: app.id,
            lan: loanRef,
            eventType: WhatsAppEventType.EMI_DUE,
            triggerSource: WhatsAppTriggerSource.MANUAL_TEST,
          });
        }
        throw new BadRequestException('Cannot test EMI_DUE: Customer mobile number or application not found.');
      }

      case WhatsAppEventType.APPLICATION_PENDING:
        if (!applicationId) {
          throw new BadRequestException('applicationId is required for APPLICATION_PENDING event.');
        }
        return this.whatsappAutomation.triggerPendingStepWhatsApp(
          applicationId,
          WhatsAppTriggerSource.MANUAL_TEST,
        );

      default:
        throw new BadRequestException(
          `Invalid or unsupported eventType: '${eventType}'. Supported: LOAN_APPROVED, LOAN_DISBURSED, FULLY_PAID, EMI_DUE, APPLICATION_PENDING`,
        );
    }
  }

  /**
   * Query recent WhatsApp message logs.
   */
  @Get('logs')
  async getLogs(
    @Query('applicationId') applicationId?: string,
    @Query('lan') lan?: string,
    @Query('customerId') customerId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.whatsappService.getMessageLogs({
      applicationId,
      lan,
      customerId,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
