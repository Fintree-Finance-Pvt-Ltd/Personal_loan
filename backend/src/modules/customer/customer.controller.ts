import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CustomerAuthGuard } from '../auth/guards/customer-auth.guard';
import { CustomerService } from './customer.service';

@Controller('customer')
@Public()
@UseGuards(CustomerAuthGuard)
export class CustomerController {
  constructor(
    private readonly customerService: CustomerService,
  ) {}

  @Get('me')
  async getMe(@CurrentCustomer() customer: any) {
    return this.customerService.findById(BigInt(customer.customerId));
  }

  @Get(':id')
  async getCustomer(
    @CurrentCustomer() customer: any,
    @Param('id', new ParseIntPipe()) id: number,
  ) {
    if (customer.customerId !== id.toString()) throw new UnauthorizedException('Access denied.');
    return this.customerService.findById(BigInt(customer.customerId));
  }

  @Patch(':id/pincode')
  async updatePincode(
    @CurrentCustomer() customer: any,
    @Param('id', new ParseIntPipe()) id: number,
    @Body() body: { pincode: string; city?: string; state?: string },
  ) {
    if (customer.customerId !== id.toString()) throw new UnauthorizedException('Access denied.');
    return this.customerService.updatePincode(BigInt(customer.customerId), body);
  }

  @Patch(':id/profile')
  async updateProfile(
    @CurrentCustomer() customer: any,
    @Param('id', new ParseIntPipe()) id: number,
    @Body() body: any,
  ) {
    if (customer.customerId !== id.toString()) throw new UnauthorizedException('Access denied.');
    return this.customerService.updateProfile(BigInt(customer.customerId), body);
  }

  @Patch(':id/basic-details')
  async updateBasicDetails(
    @CurrentCustomer() customer: any,
    @Param('id', new ParseIntPipe()) id: number,
    @Body() body: any,
  ) {
    if (customer.customerId !== id.toString()) throw new UnauthorizedException('Access denied.');
    return this.customerService.updateBasicDetails(BigInt(customer.customerId), body);
  }

  @Post('resume-application')
  async resumeApplication(
    @CurrentCustomer() customer: any,
    @Body() body: { platformProductId?: string; scopeCode?: string },
  ) {
    return this.customerService.resumeApplication(BigInt(customer.customerId), body);
  }

  @Post(':id/submit-application')
  async submitApplication(
    @CurrentCustomer() customer: any,
    @Param('id', new ParseIntPipe()) id: number,
    @Body() body: any,
  ) {
    if (customer.customerId !== id.toString()) throw new UnauthorizedException('Access denied.');
    return this.customerService.submitApplication(BigInt(customer.customerId), body);
  }

  @Post(':id/run-eligibility')
  async runEligibility(
    @CurrentCustomer() customer: any,
    @Param('id', new ParseIntPipe()) id: number,
    @Body() body: any,
  ) {
    if (customer.customerId !== id.toString()) throw new UnauthorizedException('Access denied.');
    return this.customerService.runEligibility(BigInt(customer.customerId), body);
  }

  @Patch('application/address')
  async saveApplicationAddress(@CurrentCustomer() customer: any, @Body() body: any) {
    return this.customerService.saveApplicationAddress(BigInt(customer.customerId), body);
  }

  @Post('application/decision-consents')
  async acceptDecisionConsents(@CurrentCustomer() customer: any, @Body() body: any, @Req() req: any) {
    return this.customerService.acceptDecisionConsents(BigInt(customer.customerId), body, {
      ipAddress: req?.ip,
      userAgent: req?.headers?.['user-agent'],
    });
  }

  @Post(':id/simulate-lender-approval')
  async simulateLenderApproval(
    @CurrentCustomer() customer: any,
    @Param('id', new ParseIntPipe()) id: number,
    @Body() body: any,
  ) {
    if (customer.customerId !== id.toString()) throw new UnauthorizedException('Access denied.');
    return this.customerService.simulateLenderApproval(BigInt(customer.customerId), body);
  }
}
