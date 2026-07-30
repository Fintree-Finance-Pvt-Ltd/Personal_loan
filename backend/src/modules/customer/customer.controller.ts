import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
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

  @Public()
  @Post(':id/submit-application')
  async submitApplication(
    @Param('id', new ParseIntPipe()) id: number,
    @Body() body: any,
  ) {
    return this.customerService.submitApplication(BigInt(id), body);
  }

  @Public() // Temporarily bypass global JWT guard since Customer JWT isn't implemented yet
  @Post(':id/run-eligibility')
  async runEligibility(
    @CurrentUser() user: any,
    @Param('id', new ParseIntPipe()) id: number,
    @Body() body: any,
  ) {
    // Attempt to derive from session as requested, but fallback to URL id if no session exists 
    // to prevent breaking the frontend flow before Customer Auth is fully implemented.
    const customerId = user?.customerId || user?.userId || id;
    
    return this.customerService.runEligibility(BigInt(customerId), body);
  }

  @Public()
  @Post(':id/simulate-lender-approval')
  async simulateLenderApproval(
    @Param('id', new ParseIntPipe()) id: number,
    @Body() body: any,
  ) {
    return this.customerService.simulateLenderApproval(BigInt(id), body);
  }
}
