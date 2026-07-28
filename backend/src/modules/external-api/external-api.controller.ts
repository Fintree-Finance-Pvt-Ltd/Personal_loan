import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { ExternalApiService } from './external-api.service';
import { PlPaymentsService } from './pl-payments.service';

@Controller('external-api')
export class ExternalApiController {
  constructor(
    private readonly externalApiService: ExternalApiService,
    private readonly plPaymentsService: PlPaymentsService,
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
    });
  }

  @Public()
  @Post('reverse-geocode')
  @HttpCode(HttpStatus.OK)
  reverseGeocode(@Body() body: any) {
    return this.externalApiService.reverseGeocode({
      latitude: body?.latitude,
      longitude: body?.longitude,
    });
  }

@Public()
@Post('initiate-payment')
@HttpCode(HttpStatus.OK)
initiatePayment(
  @Body() body: any,
) {
  const customerId =
    body?.customerId ||
    body?.customer?.id;

  return this.plPaymentsService
    .initiateIframePayment(
      customerId,
      body,
      body?.actor || null,
    );
}

@Public()
@Post('create-payment-link')
@HttpCode(HttpStatus.OK)
createPaymentLink(
  @Body() body: any,
) {
  const customerId =
    body?.customerId ||
    body?.customer?.id;

  return this.plPaymentsService
    .createPaymentLink(
      customerId,
      body,
      body?.actor || null,
    );
}

@Public()
@Post('payment-status')
@HttpCode(HttpStatus.OK)
getPaymentStatus(
  @Body() body: any,
) {
  const customerId =
    body?.customerId ||
    body?.customer?.id;

  return this.plPaymentsService
    .getPaymentStatus(
      customerId,
      body,
    );
}

@Public()
@Post('easebuzz-webhook')
@HttpCode(HttpStatus.OK)
handleEasebuzzWebhook(
  @Body() body: any,
  @Headers() headers: any,
) {
  return this.plPaymentsService
    .handleEasebuzzWebhook(
      body,
      headers,
    );
}

@Public()
@Post('easebuzz-payment-success')
@HttpCode(HttpStatus.OK)
handleEasebuzzPaymentSuccess(
  @Body() body: any,
  @Headers() headers: any,
) {
  return this.plPaymentsService
    .handleEasebuzzWebhook(
      body,
      headers,
    );
}

  @Public()
  @Post('easebuzz-payment-failure')
  @HttpCode(HttpStatus.OK)
  handleEasebuzzPaymentFailure(
    @Body() body: any,
    @Headers() headers: any,
  ) {
    return this.plPaymentsService
      .handleEasebuzzWebhook(
        body,
        headers,
      );
  }

  @Public()
  @Post('easebuzz-payment-manual-paid')
  @HttpCode(HttpStatus.OK)
  markPaymentAsPaid(@Body() body: any) {
    const identifier = body?.txnid || body?.customerId || body?.id;
    const status = body?.status || 'SUCCESS';
    return this.plPaymentsService.markPaymentAsPaid(identifier, status);
  }

  @Public()
  @Post('customer/loans/:lan/bank-accounts/verify')
  @HttpCode(HttpStatus.OK)
  verifyCustomerBankAccount(
    @Param('lan') lan: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    return this.externalApiService.verifyCustomerBankAccount(
      lan,
      body,
      req?.user,
      {
        ipAddress: req?.ip,
        userAgent: req?.headers?.['user-agent'],
      },
    );
  }
}