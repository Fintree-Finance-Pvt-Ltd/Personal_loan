/** @type {import('tailwindcss').Config} */

// Every shade below resolves to a CSS variable defined once in src/index.css — that file is
// the single place to edit to re-theme the app. See the comment block there for the role of
// each scale (brand/neutral/info/accent/caution/danger).
function cssVarScale(name) {
  return {
    50: `var(--color-${name}-50)`,
    100: `var(--color-${name}-100)`,
    200: `var(--color-${name}-200)`,
    300: `var(--color-${name}-300)`,
    400: `var(--color-${name}-400)`,
    500: `var(--color-${name}-500)`,
    600: `var(--color-${name}-600)`,
    700: `var(--color-${name}-700)`,
    800: `var(--color-${name}-800)`,
    900: `var(--color-${name}-900)`,
    950: `var(--color-${name}-950)`,
  };
}

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#102A2E',
        brand: cssVarScale('brand'),
        neutral: cssVarScale('neutral'),
        info: cssVarScale('info'),
        accent: cssVarScale('accent'),
        caution: cssVarScale('caution'),
        danger: cssVarScale('danger'),
        // Legacy aliases kept during the token migration — components not yet migrated to
        // the semantic scales above still resolve to the same tokens, so nothing breaks.
        success: cssVarScale('brand'),
        warning: cssVarScale('caution'),
      },
      boxShadow: {
        panel: '0 20px 60px rgba(15, 52, 56, 0.10)',
      },
    },
  },
  plugins: [],
};
