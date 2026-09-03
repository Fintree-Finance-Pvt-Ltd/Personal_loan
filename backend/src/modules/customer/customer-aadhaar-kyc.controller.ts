import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { CurrentCustomer } from '../../common/decorators/current-customer.decorator';
import { CustomerProtected } from '../auth/decorators/customer-protected.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CustomerAadhaarKycService } from './customer-aadhaar-kyc.service';
import { UseGuards } from '@nestjs/common';

@Controller('customer/aadhaar-kyc/digilocker')
export class CustomerAadhaarKycController {
  constructor(private readonly kycService: CustomerAadhaarKycService) {}

  @CustomerProtected()
  @Post('initiate')
  async initiate(
    @CurrentCustomer() customer: any,
    @Body() body: { consentGiven?: boolean },
    @Req() req: any,
  ) {
    return this.kycService.initiate(customer, body, {
      ipAddress: req?.ip || null,
      userAgent: req?.headers?.['user-agent'] || null,
    });
  }

  @CustomerProtected()
  @Get('status')
  async getStatus(
    @CurrentCustomer() customer: any,
  ) {
    return this.kycService.getStatus(customer);
  }

  @CustomerProtected()
  @Post('refresh')
  async refresh(
    @CurrentCustomer() customer: any,
  ) {
    return this.kycService.refreshStatus(customer);
  }

  @CustomerProtected()
  @Post('current-address/same-as-aadhaar')
  async saveCurrentAddressSameAsAadhaar(
    @CurrentCustomer() customer: any,
    @Body() body: any,
  ) {
    return this.kycService.saveCurrentAddressSameAsAadhaar(customer, body);
  }

  @Public()
  @Get('callback')
  async handleCallback(@Query() query: any) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>DigiLocker Verification</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 40px; }
          .card { max-width: 400px; margin: 0 auto; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
          h2 { color: #16a34a; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Verification Complete</h2>
          <p>Your DigiLocker verification window has completed. You may close this window and return to your application.</p>
          <button onclick="window.close()" style="background:#16a34a;color:#fff;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;">Close Window</button>
        </div>
        <script>
          if (window.opener) {
            try {
              window.opener.postMessage({ type: 'DIGILOCKER_CALLBACK_RECEIVED' }, '*');
            } catch (e) {}
            setTimeout(function() { window.close(); }, 2500);
          }
        </script>
      </body>
      </html>
    `;
  }

  /**
   * POST /api/customer/aadhaar-kyc/digilocker/webhook
   *
   * Public Digitap DigiLocker callback. No custom authentication headers are
   * required; callbacks are correlated to an initiated transaction in the DB.
   */
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleDigitapWebhook(
    @Body() payload: any,
  ) {
    return this.kycService.handleDigitapWebhook(payload);
  }
}
