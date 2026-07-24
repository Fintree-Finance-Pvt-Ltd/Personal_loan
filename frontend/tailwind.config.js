/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#102A2E',
        brand: { 50: '#ECFDF8', 100: '#D2F7EC', 500: '#0F8A78', 600: '#087467', 700: '#075E55' },
      },
      boxShadow: { panel: '0 20px 60px rgba(15, 52, 56, 0.10)' },
    },
  },
  plugins: [],
};
