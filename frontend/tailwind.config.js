/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Brand/Primary Colors
        ink: '#102A2E',
        brand: {
          50: '#ECFDF8',
          100: '#D2F7EC',
          500: '#0F8A78',
          600: '#087467',
          700: '#075E55',
          800: '#064E47',
          900: '#052F2B',
        },
        // Additional semantic color definitions for consistency
        success: {
          50: '#F0FDF4',
          100: '#DCFCE7',
          200: '#BBEF5E',
          600: '#16A34A',
          700: '#15803D',
        },
        warning: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FCD34D',
          600: '#D97706',
          700: '#B45309',
        },
      },
      boxShadow: {
        panel: '0 20px 60px rgba(15, 52, 56, 0.10)',
      },
    },
  },
  plugins: [],
};
