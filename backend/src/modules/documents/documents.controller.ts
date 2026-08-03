import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { CustomerAuthGuard } from '../auth/guards/customer-auth.guard';
import { DocumentsService } from './documents.service';

import { Public } from '../../common/decorators/public.decorator';

@Controller('documents')
@Public()
@UseGuards(CustomerAuthGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('customer-live-photo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  uploadCustomerLivePhoto(
    @UploadedFile() file: any,
    @Body() body: any,
    @CurrentCustomer() customer: any,
  ) {
    return this.documentsService.saveCustomerLivePhoto(BigInt(customer.customerId), file, body);
  }

  @Get('customer/live-photo')
  getCustomerLivePhoto(@CurrentCustomer() customer: any) {
    return this.documentsService.getCustomerLivePhoto(BigInt(customer.customerId));
  }
}
