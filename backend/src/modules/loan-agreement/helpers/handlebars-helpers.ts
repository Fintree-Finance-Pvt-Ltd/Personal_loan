import * as Handlebars from 'handlebars';

/**
 * Converts a number to Indian Currency Words (Lakhs, Crores, Thousands)
 */
export function numberToWords(num: number | string | undefined | null): string {
  if (num === undefined || num === null || isNaN(Number(num))) return 'Zero';
  let val = Math.abs(Number(num));
  if (val === 0) return 'Zero';

  const integerPart = Math.floor(val);
  const decimalPart = Math.round((val - integerPart) * 100);

  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = [
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertTwoDigits = (n: number): string => {
    if (n === 0) return '';
    if (n < 10) return units[n];
    if (n < 20) return teens[n - 10];
    const unitPart = units[n % 10];
    return (tens[Math.floor(n / 10)] + (unitPart ? '-' + unitPart : '')).trim();
  };

  const convertThreeDigits = (n: number): string => {
    if (n === 0) return '';
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    let str = hundred > 0 ? units[hundred] + ' Hundred' : '';
    if (rest > 0) {
      str += (str ? ' ' : '') + convertTwoDigits(rest);
    }
    return str.trim();
  };

  let crore = Math.floor(integerPart / 10000000);
  let lakh = Math.floor((integerPart % 10000000) / 100000);
  let thousand = Math.floor((integerPart % 100000) / 1000);
  let remainder = integerPart % 1000;

  let words = '';
  if (crore > 0) words += convertThreeDigits(crore) + ' Crore ';
  if (lakh > 0) words += convertTwoDigits(lakh) + ' Lakh ';
  if (thousand > 0) words += convertTwoDigits(thousand) + ' Thousand ';
  if (remainder > 0) words += convertThreeDigits(remainder);

  words = words.trim();

  let result = `Rupees ${words} Only`;
  if (decimalPart > 0) {
    result = `Rupees ${words} and ${convertTwoDigits(decimalPart)} Paise Only`;
  }

  return result;
}

export function registerHandlebarsHelpers(): void {
  Handlebars.registerHelper('formatCurrency', (val: any) => {
    if (val === undefined || val === null || isNaN(Number(val))) return '—';
    const num = Number(val);
    return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  });

  Handlebars.registerHelper('formatCurrencyWithoutSymbol', (val: any) => {
    if (val === undefined || val === null || isNaN(Number(val))) return '—';
    const num = Number(val);
    return num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  });

  Handlebars.registerHelper('formatDate', (val: any) => {
    if (!val) return '—';
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    }).format(d);
  });

  Handlebars.registerHelper('formatDateTime', (val: any) => {
    if (!val) return '—';
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    }).format(d);
  });

  Handlebars.registerHelper('formatPercentage', (val: any) => {
    if (val === undefined || val === null || isNaN(Number(val))) return '—';
    return `${Number(val)}%`;
  });

  Handlebars.registerHelper('formatNumber', (val: any) => {
    if (val === undefined || val === null || isNaN(Number(val))) return '—';
    return Number(val).toLocaleString('en-IN');
  });

  Handlebars.registerHelper('maskMobile', (val: any) => {
    if (!val || typeof val !== 'string') return '—';
    const clean = val.replace(/\D/g, '');
    if (clean.length >= 10) {
      return `${clean.slice(0, 2)}XXXX${clean.slice(-4)}`;
    }
    return val;
  });

  Handlebars.registerHelper('maskAccount', (val: any) => {
    if (!val || typeof val !== 'string') return '—';
    if (val.length > 4) {
      return `XXXXXXXX${val.slice(-4)}`;
    }
    return val;
  });

  Handlebars.registerHelper('numberToWords', (val: any) => {
    return numberToWords(val);
  });

  Handlebars.registerHelper('uppercase', (val: any) => {
    return String(val || '').toUpperCase();
  });

  Handlebars.registerHelper('lowercase', (val: any) => {
    return String(val || '').toLowerCase();
  });

  Handlebars.registerHelper('eq', (a: any, b: any) => {
    return a === b;
  });

  Handlebars.registerHelper('not', (val: any) => {
    return !val;
  });

  Handlebars.registerHelper('and', (a: any, b: any) => {
    return Boolean(a && b);
  });

  Handlebars.registerHelper('or', (a: any, b: any) => {
    return Boolean(a || b);
  });

  Handlebars.registerHelper('defaultValue', (val: any, fallback: any) => {
    return val || fallback || '—';
  });

  Handlebars.registerHelper('increment', (val: any) => {
    return Number(val || 0) + 1;
  });
}
