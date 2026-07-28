import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface GenerateDigilockerUrlInput {
  uid: string;
  firstName?: string;
  lastName?: string;
  mobile?: string;
  emailId?: string;
  redirectionUrl?: string;
}

export interface DigitapGenerateUrlResponse {
  code: string;
  msg: string;
  model?: {
    transactionId: string;
    url?: string;
    kycUrl?: string;
  };
}

@Injectable()
export class DigitapDigilockerService {
  private readonly logger = new Logger(DigitapDigilockerService.name);
  private readonly client: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    const baseURL = this.config.getOrThrow<string>('DIGITAP_BASE_URL');
    const timeout = this.config.get<number>('DIGITAP_TIMEOUT') || 30000;
    
    this.client = axios.create({
      baseURL,
      timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use((config) => {
      const clientId = this.config.get<string>('DIGITAP_CLIENT_ID') || '';
      const clientSecret = this.config.get<string>('DIGITAP_CLIENT_SECRET') || '';
      const credential = `${clientId}:${clientSecret}`;
      const encodedCredential = Buffer.from(credential).toString('base64');
      
      const authHeaderName = this.config.get<string>('DIGITAP_AUTH_HEADER') || 'Authorization';
      config.headers[authHeaderName] = encodedCredential;
      
      return config;
    });
  }

  async generateDigitapDigilockerUrl(input: GenerateDigilockerUrlInput) {
    try {
      this.logger.debug(`Generating Digitap DigiLocker URL for UID: ${input.uid}`);
      
      const payload = {
        serviceId: this.config.get<string>('DIGITAP_DIGILOCKER_SERVICE_ID') || '4',
        uid: input.uid,
        firstName: input.firstName || '',
        lastName: input.lastName || '',
        mobile: input.mobile,
        emailId: input.emailId,
        isSendOtp: this.config.get<string>('DIGITAP_DIGILOCKER_SEND_OTP') !== 'false',
        isHideExplanationScreen: this.config.get<string>('DIGITAP_DIGILOCKER_HIDE_EXPLANATION') !== 'false',
        ...(input.redirectionUrl || this.config.get<string>('DIGITAP_DIGILOCKER_REDIRECT_URL')
          ? { redirectionUrl: input.redirectionUrl || this.config.get<string>('DIGITAP_DIGILOCKER_REDIRECT_URL') }
          : {}),
      };

      const response = await this.client.post<DigitapGenerateUrlResponse>(
        '/ent/v1/kyc/generate-url',
        payload
      );

      const data = response.data;
      
      if (data.code !== '200' || !data.model || (!data.model.url && !data.model.kycUrl)) {
        this.logger.error(`Digitap generate-url failed with code: ${data.code}`);
        throw new Error(`Provider Error: ${data.msg || 'Unknown error during URL generation'}`);
      }

      const environment = this.config.get<string>('DIGITAP_ENV') === 'PRODUCTION' ? 'PRODUCTION' : 'UAT';

      return {
        success: true,
        transactionId: data.model.transactionId,
        url: data.model.url || null,
        kycUrl: data.model.kycUrl || null,
        clientId: this.config.get<string>('DIGITAP_CLIENT_ID'),
        serviceId: this.config.get<string>('DIGITAP_DIGILOCKER_SERVICE_ID') || '4',
        environment,
        rawResponse: data,
      };
    } catch (error: any) {
      this.logger.error(`Digitap generate-url error: ${error.message}`);
      throw error;
    }
  }

  async getDigitapDigilockerDetails(transactionId: string) {
    try {
      this.logger.debug(`Fetching Digitap DigiLocker details for Transaction ID: ${transactionId}`);
      
      const payload = {
        transactionId,
      };

      const response = await this.client.post(
        '/ent/v1/kyc/get-digilocker-details',
        payload
      );

      return response.data;
    } catch (error: any) {
      this.logger.error(`Digitap get-digilocker-details error: ${error.message}`);
      throw error;
    }
  }
}