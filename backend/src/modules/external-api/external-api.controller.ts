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
      customerId: body?.customerId || body?.customer?.id,
      panNumber: body?.panNumber,
    });
  }

  @Public()
  @Post('face-liveness')
  @HttpCode(HttpStatus.OK)
  checkFaceLiveness(@Body() body: any) {
    return this.externalApiService.checkFaceLiveness({
      customerId: body?.customerId || body?.customer?.id,
      inputImage: body?.inputImage || body?.input_image,
      clientRefNum: body?.clientRefNum || body?.client_ref_num,
      allowDeepfake: body?.allowDeepfake || body?.allow_deepfake,
    });
  }
}