// Global Color Palette - Update colors here to change them everywhere
export const colors = {
  // Primary Brand Colors
  primary: {
    50: '#ECFDF8',
    100: '#D2F7EC',
    500: '#0F8A78',
    600: '#087467',
    700: '#075E55',
    800: '#064E47',
    900: '#052F2B',
  },

  // Text & Base
  text: {
    primary: '#102A2E', // ink color
    secondary: '#475569',
    tertiary: '#94A3B8',
    light: '#CBD5E1',
  },

  // Backgrounds
  bg: {
    primary: '#FFFFFF',
    secondary: '#F8FAFC',
    tertiary: '#F1F5F9',
  },

  // Semantic Colors
  success: {
    50: '#F0FDF4',
    100: '#DCFCE7',
    200: '#BBEF5E',
    600: '#16A34A',
    700: '#15803D',
  },

  error: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    600: '#DC2626',
    700: '#B91C1C',
  },

  warning: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FCD34D',
    600: '#D97706',
    700: '#B45309',
  },

  info: {
    50: '#F0F9FF',
    100: '#E0F2FE',
    200: '#BAE6FD',
    600: '#0284C7',
    700: '#0369A1',
  },

  // Neutral
  neutral: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },

  // Border & Divider
  border: '#E2E8F0',
  divider: '#F1F5F9',
};

// Tailwind class mappings for easy reference
export const colorClasses = {
  // Primary brand
  primaryBg: 'bg-brand-500',
  primaryBgLight: 'bg-brand-50',
  primaryBgDark: 'bg-brand-900',
  primaryText: 'text-brand-600',
  primaryBorder: 'border-brand-200',

  // Text
  textPrimary: 'text-ink',
  textSecondary: 'text-slate-600',
  textTertiary: 'text-slate-500',
  textLight: 'text-slate-400',

  // Backgrounds
  bgPrimary: 'bg-white',
  bgSecondary: 'bg-slate-50',
  bgTertiary: 'bg-slate-100',

  // Success
  successBg: 'bg-emerald-50',
  successText: 'text-emerald-700',
  successBorder: 'border-emerald-200',

  // Error
  errorBg: 'bg-red-50',
  errorText: 'text-red-700',
  errorBorder: 'border-red-200',

  // Warning
  warningBg: 'bg-yellow-50',
  warningText: 'text-yellow-700',
  warningBorder: 'border-yellow-200',

  // Info
  infoBg: 'bg-blue-50',
  infoText: 'text-blue-700',
  infoBorder: 'border-blue-200',
};

// Color tokens for direct CSS/inline styles
export const colorTokens = {
  primary: '#0F8A78',
  primaryLight: '#ECFDF8',
  primaryDark: '#052F2B',
  text: '#102A2E',
  textSecondary: '#475569',
  bgPrimary: '#FFFFFF',
  bgSecondary: '#F8FAFC',
  success: '#16A34A',
  error: '#DC2626',
  warning: '#D97706',
  border: '#E2E8F0',
};
