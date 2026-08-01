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
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { CustomerAuthGuard } from '../auth/guards/customer-auth.guard';
import { UseGuards } from '@nestjs/common';
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

@UseGuards(CustomerAuthGuard)
@Post('initiate-payment')
@HttpCode(HttpStatus.OK)
initiatePayment(
  @Body() body: any,
  @CurrentCustomer() customer: any,
) {
  const customerId = BigInt(customer.customerId);

  return this.plPaymentsService
    .initiateIframePayment(
      customerId,
      body,
      body?.actor || null,
    );
}

@UseGuards(CustomerAuthGuard)
@Post('create-payment-link')
@HttpCode(HttpStatus.OK)
createPaymentLink(
  @Body() body: any,
  @CurrentCustomer() customer: any,
) {
  const customerId = BigInt(customer.customerId);

  return this.plPaymentsService
    .createPaymentLink(
      customerId,
      body,
      body?.actor || null,
    );
}

@UseGuards(CustomerAuthGuard)
@Post('payment-status')
@HttpCode(HttpStatus.OK)
getPaymentStatus(
  @Body() body: any,
  @CurrentCustomer() customer: any,
) {
  const customerId = BigInt(customer.customerId);

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