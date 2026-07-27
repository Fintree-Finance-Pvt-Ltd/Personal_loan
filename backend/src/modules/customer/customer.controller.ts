import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CustomerService } from './customer.service';

@Controller('customer')
export class CustomerController {
  constructor(
    private readonly customerService: CustomerService,
  ) {}

  /**
   * GET /api/customer/:id
   *
   * Returns the full customer profile (excluding sensitive fields).
   * Currently marked @Public() for the customer-facing flow;
   * protect with an auth guard when customer JWT session is implemented.
   */
  @Public()
  @Get(':id')
  async getCustomer(
    @Param(
      'id',
      new ParseIntPipe(),
    )
    id: number,
  ) {
    return this.customerService.findById(
      BigInt(id),
    );
  }

  @Public()
  @Patch(':id/pincode')
  async updatePincode(
    @Param('id', new ParseIntPipe()) id: number,
    @Body() body: { pincode: string; city?: string; state?: string },
  ) {
    return this.customerService.updatePincode(BigInt(id), body);
  }

  @Public()
  @Patch(':id/profile')
  async updateProfile(
    @Param('id', new ParseIntPipe()) id: number,
    @Body() body: any,
  ) {
    return this.customerService.updateProfile(BigInt(id), body);
  }

  @Public()
  @Patch(':id/basic-details')
  async updateBasicDetails(
    @Param('id', new ParseIntPipe()) id: number,
    @Body() body: any,
  ) {
    return this.customerService.updateBasicDetails(BigInt(id), body);
  }
}
