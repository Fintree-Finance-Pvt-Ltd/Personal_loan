import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import axios from 'axios';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(
    SmsService.name,
  );

  async sendOtp(
    mobile: string,
    otp: string,
  ) {
    const apiUrl =
      process.env.ALOT_API_URL?.trim();

    const user =
      process.env.ALOT_USER?.trim();

    const password =
      process.env.ALOT_PASSWORD?.trim();

    const senderId =
      process.env.SENDER_ID?.trim();

    const templateId =
      process.env.MOBILE_OTP_TEMPLATE_ID?.trim();

    const peId =
      process.env.DLT_PEID?.trim();

    const allowDevelopmentOtp =
      process.env.NODE_ENV !== 'production' &&
      String(
        process.env.EXPOSE_OTP_IN_RESPONSE,
      ).toLowerCase() === 'true';

    const missingConfiguration = [
      !apiUrl && 'ALOT_API_URL',
      !user && 'ALOT_USER',
      !password && 'ALOT_PASSWORD',
      !senderId && 'SENDER_ID',
      !templateId &&
        'MOBILE_OTP_TEMPLATE_ID',
      !peId && 'DLT_PEID',
    ].filter(Boolean);

    if (missingConfiguration.length) {
      if (allowDevelopmentOtp) {
        this.logger.warn(
          `SMS not sent because configuration is missing: ${missingConfiguration.join(
            ', ',
          )}. Development OTP mode is active.`,
        );

        this.logger.warn(
          `Development OTP for mobile ending ${mobile.slice(
            -4,
          )}: ${otp}`,
        );

        return {
          success: true,
          simulated: true,
        };
      }

      throw new ServiceUnavailableException(
        `${missingConfiguration[0]} is not configured.`,
      );
    }

    const smsParams = {
      user,
      password,
      senderid: senderId,
      channel: 'TRANS',
      DCS: '0',
      flashsms: '0',
      number: mobile,

      text:
        `OTP for mobile number verification is ${otp}. ` +
        `Do not share this OTP with anyone. ` +
        `Thanks & Regards Fintree Finance Private Limited.`,

      route: '5',
      DLTTemplateId: templateId,
      PEID: peId,
    };

    try {
      const response = await axios.get(
        apiUrl!,
        {
          params: smsParams,
          timeout: 15_000,
        },
      );

      this.logger.log(
        `OTP SMS sent to mobile ending ${mobile.slice(
          -4,
        )}`,
      );

      return {
        success: true,
        simulated: false,
        providerResponse: response.data,
      };
    } catch (error) {
      const providerMessage =
        axios.isAxiosError(error)
          ? error.response?.data ||
            error.message
          : error instanceof Error
            ? error.message
            : String(error);

      this.logger.error(
        `OTP SMS provider failed: ${JSON.stringify(
          providerMessage,
        )}`,
      );

      throw new ServiceUnavailableException(
        'Unable to send OTP SMS. Please try again.',
      );
    }
  }


  async sendPaymentLink(input: {
  mobile: string;
  customerName: string;
  amount: number;
  applicationNumber: string;
  paymentLink: string;
}) {
  const apiUrl = process.env.ALOT_API_URL?.trim();
  const user = process.env.ALOT_USER?.trim();
  const password = process.env.ALOT_PASSWORD?.trim();
  const senderId = process.env.SENDER_ID?.trim();
  const templateId = process.env.PAYMENT_LINK_TEMPLATE_ID?.trim();
  const peId = process.env.DLT_PEID?.trim();

  const missingConfiguration = [
    !apiUrl && 'ALOT_API_URL',
    !user && 'ALOT_USER',
    !password && 'ALOT_PASSWORD',
    !senderId && 'SENDER_ID',
    !peId && 'DLT_PEID',
  ].filter(Boolean);

  if (missingConfiguration.length || !templateId) {
    this.logger.warn(
      `Payment link SMS skipped. Missing: ${[
        ...missingConfiguration,
        !templateId && 'PAYMENT_LINK_TEMPLATE_ID',
      ]
        .filter(Boolean)
        .join(', ')}`,
    );

    this.logger.warn(
      `Manual payment link for mobile ending ${input.mobile.slice(-4)}: ${input.paymentLink}`,
    );

    return {
      success: false,
      skipped: true,
      reason: 'Payment link SMS template is not configured.',
      paymentLink: input.paymentLink,
    };
  }

  const message =
    `Dear ${input.customerName || 'Customer'}, ` +
    `please pay Rs. ${input.amount} for your Fintree Finance application ${input.applicationNumber} using this secure link: ${input.paymentLink}. ` +
    `Thanks & Regards Fintree Finance Private Limited.`;

  const smsParams = {
    user,
    password,
    senderid: senderId,
    channel: 'TRANS',
    DCS: '0',
    flashsms: '0',
    number: input.mobile,
    text: message,
    route: '5',
    DLTTemplateId: templateId,
    PEID: peId,
  };

  try {
    const response = await axios.get(apiUrl!, {
      params: smsParams,
      timeout: 15_000,
    });

    this.logger.log(
      `Payment link SMS sent to mobile ending ${input.mobile.slice(-4)}`,
    );

    return {
      success: true,
      skipped: false,
      providerResponse: response.data,
    };
  } catch (error) {
    const providerMessage =
      axios.isAxiosError(error)
        ? error.response?.data || error.message
        : error instanceof Error
          ? error.message
          : String(error);

    this.logger.error(
      `Payment link SMS provider failed: ${JSON.stringify(providerMessage)}`,
    );

    return {
      success: false,
      skipped: false,
      providerResponse: providerMessage,
    };
  }
}



async sendPaymentSuccess(input: {
  mobile: string;
  amount: number;
  applicationNumber: string;
  paymentDate?: string | null;
}) {
  const templateId = process.env.PAYMENT_SUCCESS_TEMPLATE_ID?.trim();

  if (!templateId) {
    this.logger.warn(
      `Payment success SMS skipped. Missing PAYMENT_SUCCESS_TEMPLATE_ID`,
    );

    return {
      success: false,
      skipped: true,
      reason: 'Payment success SMS template is not configured.',
    };
  }

  // later, after template approval, keep full SMS sending logic here
  return {
    success: false,
    skipped: true,
  };
}



}