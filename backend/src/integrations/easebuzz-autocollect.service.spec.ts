import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import axios from 'axios';
import { EasebuzzAutocollectService } from './easebuzz-autocollect.service';

describe('EasebuzzAutocollectService - Webhook Hash Verification', () => {
  let service: EasebuzzAutocollectService;
  const mockKey = 'TEST_MERCHANT_KEY_123';
  const mockSalt = 'TEST_MERCHANT_SALT_456';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EasebuzzAutocollectService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'EASEBUZZ_AUTOCOLLECT_KEY' || key === 'EASEBUZZ_KEY') return mockKey;
              if (key === 'EASEBUZZ_AUTOCOLLECT_SALT' || key === 'EASEBUZZ_SALT') return mockSalt;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<EasebuzzAutocollectService>(EasebuzzAutocollectService);
  });

  describe('UPI Mandate Webhook Hash', () => {
    it('should verify valid UPI mandate webhook authorization hash', () => {
      const transactionId = 'DR_87XX8145';
      const amount = '10.0';
      const upiHandle = 'customer@ybl';

      // Sequence: merchant_key|transaction_id|amount|customer_account_number|customer_ifsc|customer_upi_handle|merchant_salt
      const sequence = `${mockKey}|${transactionId}|${amount}|||${upiHandle}|${mockSalt}`;
      const authHash = createHash('sha512').update(sequence, 'utf8').digest('hex');

      const payload = {
        event: 'MANDATE_STATUS_UPDATE',
        data: {
          id: 'MRXXXXXE53',
          transaction_id: transactionId,
          amount: 10.0,
          mandate_type: 'UPI',
          customer_upi_handle: upiHandle,
          status: 'success',
          authorization: authHash,
        },
      };

      const isValid = service.verifyEasebuzzMandateWebhookHash(payload, mockSalt);
      expect(isValid).toBe(true);
    });
  });

  describe('eNACH Mandate Webhook Hash', () => {
    it('should verify valid eNACH mandate webhook authorization hash', () => {
      const transactionId = 'DR_87XX8145';
      const amount = '10.0';
      const accNumber = '5673XXX16357';
      const ifsc = 'UBXXXX734';

      // Sequence: merchant_key|transaction_id|amount|customer_account_number|customer_ifsc|customer_upi_handle|merchant_salt
      const sequence = `${mockKey}|${transactionId}|${amount}|${accNumber}|${ifsc}||${mockSalt}`;
      const authHash = createHash('sha512').update(sequence, 'utf8').digest('hex');

      const payload = {
        event: 'MANDATE_STATUS_UPDATE',
        data: {
          id: 'MRXXXXXE53',
          transaction_id: transactionId,
          amount: 10.0,
          mandate_type: 'ENACH',
          customer_account_number: accNumber,
          customer_ifsc: ifsc,
          status: 'success',
          authorization: authHash,
        },
      };

      const isValid = service.verifyEasebuzzMandateWebhookHash(payload, mockSalt);
      expect(isValid).toBe(true);
    });
  });

  describe('Presentment Webhook Hash', () => {
    it('should verify valid presentment webhook authorization hash', () => {
      const transactionId = 'DR_3XXXX065';
      const merchantRequestNumber = 'PLM_FTPL001_123';
      const status = 'success';

      // Sequence: merchant_key|transaction_id|merchant_request_number|status|merchant_salt
      const sequence = `${mockKey}|${transactionId}|${merchantRequestNumber}|${status}|${mockSalt}`;
      const authHash = createHash('sha512').update(sequence, 'utf8').digest('hex');

      const payload = {
        event: 'PRESENTMENT_STATUS_UPDATE',
        data: {
          id: 'PR2XXXX7135',
          merchant_request_number: merchantRequestNumber,
          status: status,
          mandate: {
            mandate_id: 'MR2XXXXDA7',
            mandate_type: 'ENACH',
            transaction_id: transactionId,
          },
          authorization: authHash,
        },
      };

      const isValid = service.verifyEasebuzzMandateWebhookHash(payload, mockSalt);
      expect(isValid).toBe(true);
    });
  });

  describe('getMandateStatus - Transaction ID Resolution', () => {
    it('resolves autocollectTxnId from real production response where autocollect_details is absent', async () => {
      const prodResponse = {
        success: true,
        data: {
          id: 'MR260820E94EAA',
          submerchant_id: '',
          transaction_id: 'PLM_000011_635473_308EFA',
          status: 'authorized',
          sub_status: 'SUCCESS',
          mandate_type: 'UPI',
          umrn: 'ca4a339e80e840758d671c082246b97f@okicici',
        },
      };

      jest.spyOn(service, 'retrieveMandate').mockResolvedValue(prodResponse as any);

      const result = await service.getMandateStatus('PLM_000011_635473_308EFA');

      expect(result.isActive).toBe(true);
      expect(result.status).toBe('AUTHORIZED');
      expect(result.autocollectTxnId).toBe('PLM_000011_635473_308EFA');
    });

    it('resolves autocollectTxnId from autocollect_details array when present', async () => {
      const arrayResponse = {
        success: true,
        data: {
          status: 'authorized',
          autocollect_details: [
            {
              txn_id: '5bffd7cf6a8a459fa7f031aa51318c1e',
            },
          ],
        },
      };

      jest.spyOn(service, 'retrieveMandate').mockResolvedValue(arrayResponse as any);

      const result = await service.getMandateStatus('PLM_000011_635473_308EFA');

      expect(result.isActive).toBe(true);
      expect(result.status).toBe('AUTHORIZED');
      expect(result.autocollectTxnId).toBe('5bffd7cf6a8a459fa7f031aa51318c1e');
    });
  });

  describe('generateAccessKey - Mandate Creation Payload', () => {
    it('should include upfront_presentment_amount: 1 and set start_date to today for UPI mandate', async () => {
      let capturedPayload: any = null;
      jest.spyOn(axios, 'post').mockImplementation((_url: string, payload: any) => {
        capturedPayload = payload;
        return Promise.resolve({
          data: {
            status: true,
            access_key: 'test_upi_access_key_123',
          },
        }) as any;
      });

      const todayStr = new Date().toISOString().split('T')[0];
      const res = await service.generateAccessKey({
        transactionId: 'PLM_TEST_UPI_001',
        amount: 5000,
        successUrl: 'https://example.com/success',
        failureUrl: 'https://example.com/failure',
        email: 'customer@example.com',
        phone: '9876543210',
        startDate: '2099-01-01',
        endDate: '2099-12-31',
        mandateType: 'UPI',
        paymentModes: ['UPIAD'],
      });

      expect(res.success).toBe(true);
      expect(res.accessKey).toBe('test_upi_access_key_123');
      expect(capturedPayload).toBeDefined();
      expect(capturedPayload.upfront_presentment_amount).toBe(1);
      expect(capturedPayload.payment_modes).toEqual(['UPIAD']);
      expect(capturedPayload.auto_debit_type).toBe('UPI');
      expect(capturedPayload.start_date).toBe(todayStr);
    });

    it('should not include upfront_presentment_amount for eNACH mandate and preserve future start_date', async () => {
      let capturedPayload: any = null;
      jest.spyOn(axios, 'post').mockImplementation((_url: string, payload: any) => {
        capturedPayload = payload;
        return Promise.resolve({
          data: {
            status: true,
            access_key: 'test_enach_access_key_456',
          },
        }) as any;
      });

      const res = await service.generateAccessKey({
        transactionId: 'PLM_TEST_ENACH_002',
        amount: 5000,
        successUrl: 'https://example.com/success',
        failureUrl: 'https://example.com/failure',
        email: 'customer@example.com',
        phone: '9876543210',
        startDate: '2099-01-01',
        endDate: '2099-12-31',
        mandateType: 'ENACH',
        paymentModes: ['EN'],
      });

      expect(res.success).toBe(true);
      expect(res.accessKey).toBe('test_enach_access_key_456');
      expect(capturedPayload).toBeDefined();
      expect(capturedPayload.upfront_presentment_amount).toBeUndefined();
      expect(capturedPayload.auto_debit_type).toBeUndefined();
      expect(capturedPayload.payment_modes).toEqual(['EN']);
      expect(capturedPayload.start_date).toBe('2099-01-01');
    });
  });
});

