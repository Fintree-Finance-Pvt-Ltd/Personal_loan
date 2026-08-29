import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
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
});
