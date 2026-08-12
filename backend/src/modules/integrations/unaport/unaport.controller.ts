import { Controller, Get, Param, Post } from '@nestjs/common';
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
}
