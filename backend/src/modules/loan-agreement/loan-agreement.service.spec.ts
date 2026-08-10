import { numberToWords, registerHandlebarsHelpers } from './helpers/handlebars-helpers';
import * as Handlebars from 'handlebars';

describe('LoanAgreement Module Helpers & Formatting', () => {
  beforeAll(() => {
    registerHandlebarsHelpers();
  });

  describe('numberToWords', () => {
    it('should convert 500000 to Rupees Five Lakh Only', () => {
      expect(numberToWords(500000)).toBe('Rupees Five Lakh Only');
    });

    it('should convert 171691.48 to Rupees One Lakh Seventy-One Thousand Six Hundred Ninety-One and Forty-Eight Paise Only', () => {
      expect(numberToWords(171691.48)).toBe(
        'Rupees One Lakh Seventy-One Thousand Six Hundred Ninety-One and Forty-Eight Paise Only',
      );
    });

    it('should convert 0 to Zero', () => {
      expect(numberToWords(0)).toBe('Zero');
    });
  });

  describe('Handlebars Helpers', () => {
    it('should format currency with rupee symbol', () => {
      const template = Handlebars.compile('{{formatCurrency amount}}');
      expect(template({ amount: 500000 })).toBe('₹5,00,000');
    });

    it('should format percentage', () => {
      const template = Handlebars.compile('{{formatPercentage rate}}');
      expect(template({ rate: 24 })).toBe('24%');
    });

    it('should mask mobile numbers', () => {
      const template = Handlebars.compile('{{maskMobile mobile}}');
      expect(template({ mobile: '9876543210' })).toBe('98XXXX3210');
    });

    it('should mask bank account numbers', () => {
      const template = Handlebars.compile('{{maskAccount acc}}');
      expect(template({ acc: '123456783684' })).toBe('XXXXXXXX3684');
    });
  });
});
