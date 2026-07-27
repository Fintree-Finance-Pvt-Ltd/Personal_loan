import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public } from '../../common/decorators/public.decorator';
import { DocumentsService } from './documents.service';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Public()
  @Post('customer-live-photo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  uploadCustomerLivePhoto(
    @UploadedFile() file: any,
    @Body() body: any,
  ) {
    return this.documentsService.saveCustomerLivePhoto(file, body);
  }

  @Public()
  @Get('customer/:customerId/live-photo')
  getCustomerLivePhoto(
    @Param('customerId', new ParseIntPipe()) customerId: number,
  ) {
    return this.documentsService.getCustomerLivePhoto(customerId);
  }
}
