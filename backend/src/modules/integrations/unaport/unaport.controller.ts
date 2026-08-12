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
    const result = await this.unaportService.initiateAccountAggregator(
      customerId,
      lan,
    );
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
    const result = await this.unaportService.getStatus(customerId, lan);
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
    const result = await this.unaportService.refreshStatus(
      customerId,
      lan,
    );
    return {
      success: true,
      data: result,
    };
  }
}
