import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CustomerAadhaarKycService } from './customer-aadhaar-kyc.service';

@Controller('customer/aadhaar-kyc/digilocker')
export class CustomerAadhaarKycController {
  constructor(private readonly kycService: CustomerAadhaarKycService) {}

  @Public()
  @Post('initiate')
  async initiate(
    @CurrentUser() user: any,
    @Body() body: { customerId?: number | string; customerCode?: string; consentGiven?: boolean },
  ) {
    return this.kycService.initiate(user, body);
  }

  @Public()
  @Get('status')
  async getStatus(
    @CurrentUser() user: any,
    @Query('customerId') queryCustomerId?: string,
    @Query('customerCode') queryCustomerCode?: string,
  ) {
    return this.kycService.getStatus(user, queryCustomerId, queryCustomerCode);
  }

  @Public()
  @Post('refresh')
  async refresh(
    @CurrentUser() user: any,
    @Body() body: { customerId?: number | string; customerCode?: string },
  ) {
    return this.kycService.refreshStatus(user, body);
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
