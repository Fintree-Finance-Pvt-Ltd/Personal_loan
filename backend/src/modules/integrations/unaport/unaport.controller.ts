import { Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CustomerProtected } from '../../auth/decorators/customer-protected.decorator';
import { CurrentCustomer } from '../../../common/decorators/current-customer.decorator';
import { UnaportService } from './unaport.service';

@Controller('customer/loans/:lan/account-aggregator')
@CustomerProtected()
export class UnaportController {
  constructor(private readonly unaportService: UnaportService) {}

  @Post('initiate')
  async initiate(
    @CurrentCustomer() customer: any,
    @Param('lan') lan: string,
  ) {
    const customerId = BigInt(customer.customerId || customer.id);
    console.log(`[AA CONTROLLER] [CALL] POST /initiate - customerId: ${customerId}, lan: ${lan}`);
    const result = await this.unaportService.initiateAccountAggregator(
      customerId,
      lan,
    );
    console.log(`[AA CONTROLLER] [RESPONSE] POST /initiate - result:`, JSON.stringify(result, null, 2));
    return {
      success: true,
      data: result,
    };
  }

  @Get('status')
  async getStatus(
    @CurrentCustomer() customer: any,
    @Param('lan') lan: string,
  ) {
    const customerId = BigInt(customer.customerId || customer.id);
    console.log(`[AA CONTROLLER] [CALL] GET /status - customerId: ${customerId}, lan: ${lan}`);
    const result = await this.unaportService.getStatus(customerId, lan);
    console.log(`[AA CONTROLLER] [RESPONSE] GET /status - result:`, JSON.stringify(result, null, 2));
    return {
      success: true,
      data: result,
    };
  }

  @Post('refresh-status')
  async refreshStatus(
    @CurrentCustomer() customer: any,
    @Param('lan') lan: string,
  ) {
    const customerId = BigInt(customer.customerId || customer.id);
    console.log(`[AA CONTROLLER] [CALL] POST /refresh-status - customerId: ${customerId}, lan: ${lan}`);
    const result = await this.unaportService.refreshStatus(
      customerId,
      lan,
    );
    console.log(`[AA CONTROLLER] [RESPONSE] POST /refresh-status - result:`, JSON.stringify(result, null, 2));
    return {
      success: true,
      data: result,
    };
  }

  @Post('trigger-bsa-fallback')
  async triggerBsaFallback(
    @CurrentCustomer() customer: any,
    @Param('lan') lan: string,
  ) {
    const customerId = BigInt(customer.customerId || customer.id);
    console.log(`[AA CONTROLLER] [CALL] POST /trigger-bsa-fallback - customerId: ${customerId}, lan: ${lan}`);
    const result = await this.unaportService.triggerBsaFallback(
      customerId,
      lan,
    );
    console.log(`[AA CONTROLLER] [RESPONSE] POST /trigger-bsa-fallback - result:`, JSON.stringify(result, null, 2));
    return {
      success: result.success,
      data: result,
    };
  }

  @Post('upload-statement')
  @UseInterceptors(FileInterceptor('file'))
  async uploadBankStatement(
    @UploadedFile() file: any,
    @Body() body: any,
    @CurrentCustomer() customer: any,
    @Param('lan') lan: string,
  ) {
    const customerId = BigInt(customer.customerId || customer.id);
    console.log(`[AA CONTROLLER] [CALL] POST /upload-statement - customerId: ${customerId}, lan: ${lan}, filename: ${file?.originalname}`);
    const result = await this.unaportService.uploadBankStatementAndAnalyze(
      customerId,
      lan,
      file,
      body,
    );
    console.log(`[AA CONTROLLER] [RESPONSE] POST /upload-statement - result:`, JSON.stringify(result, null, 2));
    return {
      success: result.success,
      data: result,
    };
  }

  @Get('bank-list')
  async getBankList(
    @CurrentCustomer() customer: any,
    @Param('lan') lan: string,
  ) {
    console.log(`[AA CONTROLLER] [CALL] GET /bank-list - lan: ${lan}`);
    const result = await this.unaportService.getBankList();
    return {
      success: result.success,
      data: result,
    };
  }

  @Post('summary')
  async getAccountSummary(
    @Body('accountUid') accountUid: string,
    @CurrentCustomer() customer: any,
    @Param('lan') lan: string,
  ) {
    console.log(`[AA CONTROLLER] [CALL] POST /summary - lan: ${lan}, accountUid: ${accountUid}`);
    const result = await this.unaportService.getAccountSummary(accountUid);
    return {
      success: result.success,
      data: result,
    };
  }
}
