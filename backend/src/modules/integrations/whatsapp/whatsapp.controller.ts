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
import { WhatsAppAutomationService } from './whatsapp-automation.service';
import { WhatsAppService } from './whatsapp.service';
import {
  SendTemplateMessageParams,
  WhatsAppEventType,
  WhatsAppTriggerSource,
} from './whatsapp.types';

@Controller('admin/whatsapp')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WhatsAppController {
  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly whatsappAutomation: WhatsAppAutomationService,
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

      case WhatsAppEventType.LOAN_DISBURSED:
        if (!lan) {
          throw new BadRequestException('lan is required for LOAN_DISBURSED event.');
        }
        return this.whatsappAutomation.triggerLoanDisbursedWhatsApp(
          lan,
          WhatsAppTriggerSource.MANUAL_TEST,
        );

      case WhatsAppEventType.FULLY_PAID:
        if (!lan) {
          throw new BadRequestException('lan is required for FULLY_PAID event.');
        }
        return this.whatsappAutomation.triggerLoanFullyPaidWhatsApp(
          lan,
          applicationId,
          WhatsAppTriggerSource.MANUAL_TEST,
        );

      case WhatsAppEventType.EMI_DUE:
        if (!installmentId) {
          throw new BadRequestException('installmentId is required for EMI_DUE event.');
        }
        return this.whatsappAutomation.triggerEmiDueReminderWhatsApp(
          installmentId,
          WhatsAppTriggerSource.MANUAL_TEST,
        );

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
