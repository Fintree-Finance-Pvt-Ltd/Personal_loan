import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  createPlEasyCollectLink,
  extractPlEasebuzzId,
  extractPlPaymentLink,
} from '../../integrations/easebuzz.integration';
import {
  initiateEasebuzzIframePayment,
  verifyEasebuzzWebhookHash,
} from '../../integrations/easebuzz-iframe.integration';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

export type PlPaymentPurpose =
  | 'PROCESSING_FEE'
  | 'ASSESSMENT_FEE'
  | 'OTHER';

export type PlPaymentStatus =
  | 'CREATED'
  | 'SENT'
  | 'SUCCESS'
  | 'FAILED'
  | 'PROCESSING';

export type SmsStatus =
  | 'NOT_SENT'
  | 'SENT'
  | 'FAILED';

@Injectable()
export class PlPaymentsService {
  private readonly logger = new Logger(
    PlPaymentsService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
  ) { }

  /**
   * Initialize Easebuzz Payment Gateway checkout.
   *
   * This method calls Easebuzz initiateLink API and returns
   * an access key used by EasebuzzCheckout on the frontend.
   */
  async initiateIframePayment(
    customerIdInput:
      | number
      | string
      | bigint,
    body: any,
    actor: any,
  ) {
    try {
      const customerId =
        this.parsePositiveBigInt(
          customerIdInput,
          'Customer ID',
        );

      const customer =
        await this.prisma.customer.findUnique({
          where: {
            id: customerId,
          },
          include: {
            applications: {
              orderBy: { id: 'desc' },
              take: 1,
            },
          }
        });

      if (!customer) {
        throw new NotFoundException(
          'Customer not found.',
        );
      }

      const latestApp = customer.applications[0];
      if (!latestApp) {
        throw new BadRequestException('No application found for customer.');
      }

      const amount = latestApp.assessmentFeeTotalAmount
        ? Number(latestApp.assessmentFeeTotalAmount)
        : 0; // Strictly from snapshot
      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        throw new BadRequestException(
          'A valid payment amount is required from the application snapshot.',
        );
      }

      const purpose =
        this.normalizePurpose(
          body?.purpose,
        );

      if (!customer) {
        throw new NotFoundException(
          'Customer not found.',
        );
      }

      if (!customer.mobileNumber) {
        throw new BadRequestException(
          'Customer mobile number is missing.',
        );
      }

      if (!customer.email) {
        throw new BadRequestException(
          'Customer email is missing.',
        );
      }

      const customerName =
        customer.fullName ||
        [
          customer.firstName,
          customer.middleName,
          customer.lastName,
        ]
          .filter(Boolean)
          .join(' ')
          .trim() ||
        'Customer';

      const successUrl =
        process.env.EASEBUZZ_SUCCESS_URL;

      const failureUrl =
        process.env.EASEBUZZ_FAILURE_URL;

      if (!successUrl || !failureUrl) {
        throw new BadRequestException(
          'Easebuzz success or failure URL is not configured.',
        );
      }

      // Deactivate any existing stale CREATED / PROCESSING payment rows for this customer & purpose
      const existingActivePayments = await (
        this.prisma as any
      ).plPaymentLink.findMany({
        where: {
          customerId,
          purpose,
          status: { in: ['CREATED', 'PROCESSING'] },
        },
      });

      if (existingActivePayments && existingActivePayments.length > 0) {
        await (this.prisma as any).plPaymentLink.updateMany({
          where: {
            id: { in: existingActivePayments.map((p: any) => p.id) },
          },
          data: {
            status: 'FAILED',
            updatedAt: new Date(),
          },
        });
      }

      const txnid = this.generateTransactionId(customerId);

      this.logger.log(
        `Initiating Easebuzz checkout for transaction ${txnid}, customer ${customerId.toString()}.`,
      );

      const initiatedPayment =
        await initiateEasebuzzIframePayment({
          txnid,
          amount,

          productinfo:
            'PROCESSING FEE',

          firstname:
            customerName,

          phone:
            customer.mobileNumber,

          email:
            customer.email,

          surl:
            successUrl,

          furl:
            failureUrl,

          udf1:
            customerId.toString(),

          udf2:
            customer.customerCode,

          udf3:
            purpose,

          udf4:
            'PL',

          udf5:
            txnid,

          udf6: '',
          udf7: '',
        });

      if (
        !initiatedPayment?.accessKey
      ) {
        throw new BadGatewayException(
          'Easebuzz did not return a valid access key.',
        );
      }

      const actorId =
        actor?.id
          ? this.parsePositiveBigInt(
            actor.id,
            'Actor ID',
          )
          : null;

      const rawRequest = {
        paymentMode: 'IFRAME_CHECKOUT',
        customerId:
          customerId.toString(),

        customerCode:
          customer.customerCode,

        txnid,
        amount,
        purpose,

        productinfo:
          'PROCESSING FEE',

        firstname:
          customerName,

        phone:
          customer.mobileNumber,

        email:
          customer.email,

        surl:
          successUrl,

        furl:
          failureUrl,

        udf1:
          customerId.toString(),

        udf2:
          customer.customerCode,

        udf3:
          purpose,

        udf4:
          'PL',

        udf5:
          txnid,
      };

      const createdPayment =
        await (
          this.prisma as any
        ).plPaymentLink.create({
          data: {
            customerId,

            applicationNumber:
              customer.customerCode,

            customerName,

            mobile:
              customer.mobileNumber,

            email:
              customer.email,

            purpose,
            amount,
            txnid,

            /*
             * Payment Gateway initiation returns an access key,
             * not a reusable hosted payment link.
             */
            paymentLink: null,

            status:
              'CREATED',

            smsStatus:
              'NOT_SENT',

            rawRequest:
              this.stringifyJson(
                rawRequest,
              ),

            rawCreateResponse:
              this.stringifyJson(
                initiatedPayment.rawResponse ||
                {},
              ),

            createdBy:
              actorId,

            updatedBy:
              actorId,
          },
        });

      this.logger.log(
        `Easebuzz checkout initialized successfully for transaction ${txnid}.`,
      );

      return {
        success: true,

        message:
          'Easebuzz checkout initialized successfully.',

        data: {
          paymentId:
            createdPayment.id.toString(),

          customerId:
            customerId.toString(),

          customerCode:
            customer.customerCode,

          transactionId:
            txnid,

          txnid,

          accessKey:
            initiatedPayment.accessKey,

          merchantKey:
            initiatedPayment.key,

          environment:
            initiatedPayment.environment,

          amount,

          purpose,

          status:
            createdPayment.status,

          paymentStatus:
            createdPayment.status,
        },
      };
    } catch (error: any) {
      this.logger.error(
        `Easebuzz iFrame initialization failed: ${error?.message ||
        'Unknown error'
        }`,
        error?.stack,
      );

      if (
        error instanceof
        BadRequestException ||
        error instanceof
        NotFoundException ||
        error instanceof
        BadGatewayException
      ) {
        throw error;
      }

      throw new BadGatewayException(
        error?.message ||
        'Unable to initialize Easebuzz checkout.',
      );
    }
  }

  /**
   * Create an EasyCollect hosted payment link.
   *
   * This is separate from Payment Gateway iframe checkout.
   * EasyCollect may also send the payment URL by SMS.
   */
  async createPaymentLink(
    customerIdInput:
      | number
      | string
      | bigint,
    body: any,
    actor: any,
  ) {
    try {
      const customerId =
        this.parsePositiveBigInt(
          customerIdInput,
          'Customer ID',
        );

      const amount = Number(
        body?.amount,
      );

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        throw new BadRequestException(
          'Valid payment amount is required.',
        );
      }

      const purpose =
        this.normalizePurpose(
          body?.purpose,
        );

      this.logger.log(
        `Create payment link started for customer ${customerId.toString()}, purpose ${purpose}, amount ${amount}.`,
      );

      const customer =
        await this.prisma.customer.findUnique({
          where: {
            id: customerId,
          },
        });

      if (!customer) {
        throw new NotFoundException(
          'Customer not found.',
        );
      }

      const customerName =
        customer.fullName ||
        [
          customer.firstName,
          customer.middleName,
          customer.lastName,
        ]
          .filter(Boolean)
          .join(' ')
          .trim() ||
        'Customer';

      const mobile =
        customer.mobileNumber;

      const email =
        customer.email || null;

      if (!mobile) {
        throw new BadRequestException(
          'Customer mobile number is missing.',
        );
      }

      const existingPayment =
        await (
          this.prisma as any
        ).plPaymentLink.findFirst({
          where: {
            customerId,
            purpose,

            status: {
              in: [
                'CREATED',
                'SENT',
                'PROCESSING',
              ],
            },
          },

          orderBy: {
            id: 'desc',
          },
        });

      if (
        existingPayment?.paymentLink
      ) {
        const updatedExistingPayment =
          await (
            this.prisma as any
          ).plPaymentLink.update({
            where: {
              id:
                existingPayment.id,
            },

            data: {
              status:
                existingPayment.status ===
                  'PROCESSING'
                  ? 'PROCESSING'
                  : 'SENT',

              updatedBy:
                actor?.id
                  ? this.parsePositiveBigInt(
                    actor.id,
                    'Actor ID',
                  )
                  : null,
            },
          });

        return {
          success: true,

          message:
            'Active payment link already exists.',

          data:
            this.serializePayment(
              updatedExistingPayment,
              customer.customerCode,
            ),
        };
      }

      const txnid =
        this.generateTransactionId(
          customerId,
        );

      const paymentObject = {
        customerId:
          customerId.toString(),

        customerCode:
          customer.customerCode,

        customerName,
        mobile,

        email:
          email ||
          'noemail@fintreefinance.com',

        amount,
        purpose,

        merchantTxn:
          txnid,

        baseAmount:
          this.toOptionalNumber(
            body?.baseAmount,
          ),

        gstAmount:
          this.toOptionalNumber(
            body?.gstAmount,
          ),

        gstRate:
          this.toOptionalNumber(
            body?.gstRate,
          ),

        description:
          typeof body?.description ===
            'string'
            ? body.description
              .trim()
              .slice(0, 255)
            : null,
      };

      let responseData: any =
        null;

      let paymentLink:
        | string
        | null = null;

      let easebuzzId:
        | string
        | null = null;

      try {
        this.logger.log(
          `Calling Easebuzz EasyCollect for transaction ${txnid}.`,
        );

        responseData =
          await createPlEasyCollectLink({
            customerId,

            customerCode:
              customer.customerCode,

            customerName,
            mobile,
            email,

            amount,
            purpose,

            merchantTxn:
              txnid,
          });

        paymentLink =
          extractPlPaymentLink(
            responseData,
          );

        easebuzzId =
          extractPlEasebuzzId(
            responseData,
          );

        this.logger.log(
          `Easebuzz EasyCollect response received for ${txnid}. Link available: ${Boolean(
            paymentLink,
          )}.`,
        );
      } catch (error: any) {
        this.logger.error(
          `Easebuzz EasyCollect link creation failed for ${txnid}: ${error?.message ||
          'Unknown error'
          }`,
          error?.stack,
        );

        responseData = {
          success: false,

          message:
            error?.message ||
            'EasyCollect payment link creation failed.',

          response:
            error?.response?.data ||
            null,
        };
      }

      const actorId =
        actor?.id
          ? this.parsePositiveBigInt(
            actor.id,
            'Actor ID',
          )
          : null;

      const createdPayment =
        await (
          this.prisma as any
        ).plPaymentLink.create({
          data: {
            customerId,

            applicationNumber:
              customer.customerCode,

            customerName,
            mobile,
            email,

            purpose,
            amount,
            txnid,

            easebuzzId:
              easebuzzId
                ? String(easebuzzId)
                : null,

            paymentLink,

            status:
              paymentLink
                ? 'SENT'
                : 'FAILED',

            smsStatus:
              paymentLink
                ? 'SENT'
                : 'NOT_SENT',

            rawRequest:
              this.stringifyJson(
                paymentObject,
              ),

            rawCreateResponse:
              this.stringifyJson(
                responseData || {},
              ),

            createdBy:
              actorId,

            updatedBy:
              actorId,
          },
        });

      if (!paymentLink) {
        return {
          success: false,

          message:
            responseData?.message ||
            'Payment link was not received from Easebuzz.',

          data:
            this.serializePayment(
              createdPayment,
              customer.customerCode,
            ),
        };
      }

      return {
        success: true,

        message:
          'Payment link created successfully.',

        data:
          this.serializePayment(
            createdPayment,
            customer.customerCode,
          ),
      };
    } catch (error: any) {
      this.logger.error(
        `Create payment link failed: ${error?.message ||
        'Unknown error'
        }`,
        error?.stack,
      );

      if (
        error instanceof
        BadRequestException ||
        error instanceof
        NotFoundException ||
        error instanceof
        BadGatewayException
      ) {
        throw error;
      }

      throw new BadGatewayException(
        error?.message ||
        'Create payment link failed.',
      );
    }
  }

  /**
   * Return current payment status stored in the database.
   */
  async getPaymentStatus(
    customerIdInput:
      | number
      | string
      | bigint,
    body: any,
  ) {
    try {
      const customerId =
        this.parsePositiveBigInt(
          customerIdInput,
          'Customer ID',
        );

      const transactionId =
        String(
          body?.transactionId ||
          body?.txnid ||
          body?.merchantTxn ||
          '',
        ).trim();

      const paymentIdInput =
        body?.paymentId ||
        body?.id ||
        null;

      const purpose =
        this.normalizePurpose(
          body?.purpose,
        );

      let paymentId:
        | bigint
        | null = null;

      if (
        paymentIdInput !== null &&
        paymentIdInput !== undefined &&
        paymentIdInput !== ''
      ) {
        paymentId =
          this.parsePositiveBigInt(
            paymentIdInput,
            'Payment ID',
          );
      }

      if (
        !transactionId &&
        !paymentId
      ) {
        throw new BadRequestException(
          'Payment ID or transaction ID is required.',
        );
      }

      const customer =
        await this.prisma.customer.findUnique({
          where: {
            id: customerId,
          },

          select: {
            id: true,
            customerCode: true,
          },
        });

      if (!customer) {
        throw new NotFoundException(
          'Customer not found.',
        );
      }

      const payment =
        await (
          this.prisma as any
        ).plPaymentLink.findFirst({
          where: {
            customerId,
            purpose,

            ...(paymentId
              ? {
                id:
                  paymentId,
              }
              : {}),

            ...(transactionId
              ? {
                txnid:
                  transactionId,
              }
              : {}),
          },

          orderBy: {
            id: 'desc',
          },
        });

      if (!payment) {
        throw new NotFoundException(
          'Payment transaction not found.',
        );
      }

      const normalizedStatus =
        this.normalizeStoredStatus(
          payment.status,
        );

      const paymentCompleted =
        normalizedStatus ===
        'SUCCESS';

      const paymentFailed =
        normalizedStatus ===
        'FAILED';

      return {
        success: true,

        message:
          paymentCompleted
            ? 'Payment completed successfully.'
            : paymentFailed
              ? 'Payment was not completed.'
              : 'Payment is awaiting confirmation.',

        data: {
          ...this.serializePayment(
            payment,
            customer.customerCode,
          ),

          paymentCompleted,
          paymentFailed,
        },
      };
    } catch (error: any) {
      this.logger.error(
        `Get payment status failed: ${error?.message ||
        'Unknown error'
        }`,
        error?.stack,
      );

      if (
        error instanceof
        BadRequestException ||
        error instanceof
        NotFoundException
      ) {
        throw error;
      }

      throw new BadGatewayException(
        error?.message ||
        'Unable to get payment status.',
      );
    }
  }

  /**
   * Process the Easebuzz callback/webhook response.
   */
  async handleEasebuzzWebhook(body: any, headers: any) {
    try {
      console.log('Easebuzz webhook received.', { body, headers });
      const data = body?.data && typeof body.data === 'object' ? body.data : body;
      const merchantTxn = data?.txnid || data?.merchant_txn || data?.merchantTxn || data?.referenceId || null;
      if (!merchantTxn) {
        throw new BadRequestException('Easebuzz transaction ID is missing.');
      }

      // 1. Hash verification
      if (!verifyEasebuzzWebhookHash(data)) {
        throw new BadRequestException('Invalid webhook signature.');
      }

      const easebuzzId = data?.easepayid || data?.easebuzzid || data?.payment_id || data?.transaction_id || data?.id || null;
      const source = String(data?.udf4 || '').trim().toUpperCase();

      if (source && source !== 'LAP' && source !== 'PL') {
        return { success: false, message: 'Webhook ignored. Not a Personal Loan payment.', source };
      }

      const rawPaymentStatus = typeof data?.status === 'string' ? data.status : data?.payment_status || data?.transaction_status || data?.unmappedstatus || data?.state || '';
      const providerStatus = String(rawPaymentStatus).trim().toLowerCase();
      const normalizedStatus = this.normalizeWebhookStatus(providerStatus);

      // Verify Currency (If provided, ensure it's INR)
      if (data?.currency && String(data.currency).toUpperCase() !== 'INR') {
         throw new BadRequestException('Invalid currency. Only INR is supported.');
      }

      // Run interactive transaction for atomic lock & update
      const result = await this.prisma.$transaction(async (tx: any) => {
         // Idempotency: Insert into WebhookInbox if table exists
         if (tx.plWebhookInbox) {
           try {
             await tx.plWebhookInbox.create({
               data: {
                 id: randomUUID(),
                 providerTransactionId: String(merchantTxn),
                 provider: 'easebuzz',
                 eventHash: data.hash || 'NO_HASH',
                 payload: data
               }
             });
           } catch (e: any) {
             // P2002 Unique constraint failed = Replay!
             if (e.code === 'P2002') {
               this.logger.warn(`Idempotent webhook replay detected for ${merchantTxn}`);
               return { success: true, message: 'Webhook already processed (idempotent replay).' };
             }
             throw e;
           }
         }

         // Lock Payment Link exactly once using raw SQL
         const lockedPayments = await tx.$queryRaw`SELECT * FROM pl_payment_links WHERE txnid = ${String(merchantTxn)} FOR UPDATE`;
         if (!lockedPayments || lockedPayments.length === 0) {
            throw new BadRequestException(`Payment record was not found for transaction ${merchantTxn}.`);
         }
         const payment = lockedPayments[0];

         const nextStatus = payment.status === 'SUCCESS' && normalizedStatus !== 'SUCCESS' ? 'SUCCESS' : normalizedStatus;

         let application = null;
         if (payment.application_number || payment.applicationNumber) {
            const appNum = payment.application_number || payment.applicationNumber;
            const lockedApps = await tx.$queryRaw`SELECT * FROM pl_applications WHERE application_number = ${appNum} FOR UPDATE`;
            if (lockedApps && lockedApps.length > 0) {
               application = lockedApps[0];
            }
         }

         // Strict Prisma.Decimal amount comparison
         const paymentAmount = new Prisma.Decimal(payment.amount);
         const webhookAmount = data?.amount ? new Prisma.Decimal(data.amount) : new Prisma.Decimal(0);
         
         if (!paymentAmount.equals(webhookAmount)) {
            throw new BadRequestException('Webhook amount does not match stored payment amount.');
         }

         if (payment.purpose === 'ASSESSMENT_FEE' && application) {
            if (application.assessment_fee_total_amount) {
               const appAssessmentFee = new Prisma.Decimal(application.assessment_fee_total_amount);
               if (!appAssessmentFee.equals(webhookAmount)) {
                  throw new BadRequestException('Webhook amount does not match canonical application assessment fee.');
               }
            }
         }

         // Update Payment
         const updatedPayment = await tx.plPaymentLink.update({
            where: { id: payment.id },
            data: {
              status: nextStatus as any,
              rawWebhookResponse: JSON.stringify(data),
              easebuzzId: easebuzzId ? String(easebuzzId) : payment.easebuzzId,
              paidAt: nextStatus === 'SUCCESS' && !payment.paidAt ? new Date() : payment.paidAt
            }
         });

         // Exactly-Once state transition to ASSESSMENT_FEE_PAID if SUCCESS
         if (nextStatus === 'SUCCESS' && payment.purpose === 'ASSESSMENT_FEE' && application && application.status !== 'ASSESSMENT_FEE_PAID') {
            await tx.plApplication.update({
               where: { id: application.id },
               data: {
                 status: 'ASSESSMENT_FEE_PAID'
               }
            });
         }

         return { 
           success: true, 
           message: 'Easebuzz webhook processed successfully.',
           data: {
             ...this.serializePayment(updatedPayment, application?.application_number),
             providerStatus,
             errorMessage: data?.error_Message || data?.error_message || data?.message || null,
           }
         };
      });

      return result;
    } catch (error: any) {
      this.logger.error(`Easebuzz webhook processing failed: ${error?.message || 'Unknown error'}`, error?.stack);
      return {
        success: false,
        message: error?.message || 'Easebuzz webhook processing failed.',
        errorCode: error?.code || 'WEBHOOK_FAILED',
      };
    }
  }

  /**
   * Convert a Prisma payment row into a JSON-safe response.
   */
  private serializePayment(
    payment: any,
    customerCode?: string | null,
  ) {
    const status =
      this.normalizeStoredStatus(
        payment?.status,
      );

    return {
      paymentId:
        payment?.id !== undefined &&
          payment?.id !== null
          ? payment.id.toString()
          : null,

      customerId:
        payment?.customerId !==
          undefined &&
          payment?.customerId !==
          null
          ? payment.customerId.toString()
          : null,

      customerCode:
        customerCode || null,

      applicationNumber:
        payment?.applicationNumber ||
        null,

      transactionId:
        payment?.txnid ||
        null,

      txnid:
        payment?.txnid ||
        null,

      easebuzzId:
        payment?.easebuzzId ||
        null,

      paymentReference:
        payment?.easebuzzId ||
        payment?.txnid ||
        null,

      purpose:
        payment?.purpose ||
        null,

      amount:
        payment?.amount !==
          undefined &&
          payment?.amount !== null
          ? Number(
            payment.amount,
          )
          : null,

      status,

      paymentStatus:
        status,

      paymentLink:
        payment?.paymentLink ||
        null,

      payment_link:
        payment?.paymentLink ||
        null,

      smsStatus:
        payment?.smsStatus ||
        null,

      paidAt:
        this.toIsoString(
          payment?.paidAt,
        ),

      createdAt:
        this.toIsoString(
          payment?.createdAt,
        ),

      updatedAt:
        this.toIsoString(
          payment?.updatedAt,
        ),
    };
  }

  private normalizePurpose(
    value: unknown,
  ): PlPaymentPurpose {
    const normalizedValue =
      String(
        value ||
        'PROCESSING_FEE',
      )
        .trim()
        .toUpperCase();

    if (
      normalizedValue ===
      'PROCESSING_FEE'
    ) {
      return 'PROCESSING_FEE';
    }

    return 'OTHER';
  }

  private normalizeStoredStatus(
    value: unknown,
  ): PlPaymentStatus {
    const normalizedValue =
      String(
        value ||
        'CREATED',
      )
        .trim()
        .toUpperCase();

    if (
      [
        'SUCCESS',
        'PAID',
        'CAPTURED',
        'COMPLETED',
      ].includes(
        normalizedValue,
      )
    ) {
      return 'SUCCESS';
    }

    if (
      [
        'FAILED',
        'FAILURE',
        'CANCELLED',
        'CANCELED',
        'DECLINED',
        'EXPIRED',
      ].includes(
        normalizedValue,
      )
    ) {
      return 'FAILED';
    }

    if (
      [
        'PROCESSING',
        'PENDING',
      ].includes(
        normalizedValue,
      )
    ) {
      return 'PROCESSING';
    }

    if (
      normalizedValue ===
      'SENT'
    ) {
      return 'SENT';
    }

    return 'CREATED';
  }

  private normalizeWebhookStatus(
    providerStatus: string,
  ): PlPaymentStatus {
    if (
      [
        'success',
        'successful',
        'captured',
        'paid',
        'completed',
      ].includes(
        providerStatus,
      )
    ) {
      return 'SUCCESS';
    }

    if (
      [
        'failure',
        'failed',
        'error',
        'bounced',
        'cancelled',
        'canceled',
        'expired',
        'declined',
      ].includes(
        providerStatus,
      )
    ) {
      return 'FAILED';
    }

    return 'PROCESSING';
  }

  private parsePositiveBigInt(
    value: unknown,
    fieldName: string,
  ): bigint {
    if (
      value === undefined ||
      value === null ||
      value === ''
    ) {
      throw new BadRequestException(
        `${fieldName} is required.`,
      );
    }

    let parsedValue: bigint;

    try {
      parsedValue =
        BigInt(value as any);
    } catch {
      throw new BadRequestException(
        `${fieldName} is invalid.`,
      );
    }

    if (parsedValue <= 0n) {
      throw new BadRequestException(
        `${fieldName} is invalid.`,
      );
    }

    return parsedValue;
  }

  private parseOptionalPositiveBigInt(
    value: unknown,
  ): bigint | null {
    if (
      value === undefined ||
      value === null ||
      value === ''
    ) {
      return null;
    }

    try {
      const parsedValue =
        BigInt(value as any);

      return parsedValue > 0n
        ? parsedValue
        : null;
    } catch {
      return null;
    }
  }

  private generateTransactionId(
    customerId: bigint,
  ): string {
    return `PL-${customerId.toString()}-${Date.now()}`;
  }

  private toOptionalNumber(
    value: unknown,
  ): number | null {
    if (
      value === undefined ||
      value === null ||
      value === ''
    ) {
      return null;
    }

    const parsedValue =
      Number(value);

    return Number.isFinite(
      parsedValue,
    )
      ? parsedValue
      : null;
  }

  private stringifyJson(
    value: unknown,
  ): string {
    try {
      return JSON.stringify(
        value,
      );
    } catch {
      return JSON.stringify({
        message: 'Unable to serialize data.',
      });
    }
  }

  async markPaymentAsPaid(txnidOrCustomerId: string | number, status: PlPaymentStatus = 'SUCCESS') {
    const searchTxn = String(txnidOrCustomerId).trim();

    const existingPayment = await (this.prisma as any).plPaymentLink.findFirst({
      where: {
        OR: [
          { txnid: searchTxn },
          ...(/^\d+$/.test(searchTxn) ? [{ customerId: BigInt(searchTxn) }] : []),
        ],
      },
      orderBy: { id: 'desc' },
    });

    if (!existingPayment) {
      throw new NotFoundException(`No payment transaction found for '${searchTxn}'.`);
    }

    const updatedPayment = await (this.prisma as any).plPaymentLink.update({
      where: { id: existingPayment.id },
      data: {
        status: status,
        paidAt: status === 'SUCCESS' ? new Date() : existingPayment.paidAt,
        updatedAt: new Date(),
      },
    });

    this.logger.log(`Payment transaction ${updatedPayment.txnid} manually updated to status ${status}.`);

    return {
      success: true,
      message: `Payment status updated to ${status} for transaction ${updatedPayment.txnid}.`,
      data: this.serializePayment(updatedPayment, updatedPayment.applicationNumber),
    };
  }

  private toIsoString(
    value: unknown,
  ): string | null {
    if (!value) {
      return null;
    }

    if (
      value instanceof Date
    ) {
      return value.toISOString();
    }

    const parsedDate =
      new Date(value as any);

    return Number.isNaN(
      parsedDate.getTime(),
    )
      ? null
      : parsedDate.toISOString();
  }
}