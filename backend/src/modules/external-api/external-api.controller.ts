import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { ExternalApiService } from './external-api.service';

@Controller('external-api')
export class ExternalApiController {
  constructor(
    private readonly externalApiService: ExternalApiService,
  ) {}

  @Public()
  @Post('verify-pan')
  @HttpCode(HttpStatus.OK)
  verifyPan(@Body() body: any) {
    return this.externalApiService.verifyPan({
      customerId:
        body?.customerId ||
        body?.customer?.id,
      panNumber: body?.panNumber,
    });
  }
}