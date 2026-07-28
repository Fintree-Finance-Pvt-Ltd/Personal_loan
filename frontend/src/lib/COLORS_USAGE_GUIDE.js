// COLOR USAGE GUIDE
// ================

// 1. USING TAILWIND CLASSES (Recommended - Most of the app)
// ---------------------------------------------------------
// No imports needed! Just use the color names directly:

// Examples:
// <div className="bg-brand-500">           {/* Primary brand color */}
// <div className="bg-brand-50">            {/* Light brand background */}
// <div className="text-ink">              {/* Primary text color */}
// <div className="text-emerald-600">      {/* Semantic success green */}
// <div className="bg-red-50">             {/* Error background */}
// <div className="border-brand-200">      {/* Brand border */}

// 2. USING COLOR CONSTANTS (For inline styles or dynamic values)
// ---------------------------------------------------------------

// Import the colors object:
import { colors, colorTokens } from './colors';

// Use in inline styles:
// <div style={{ color: colors.text.primary }}>...</div>
// <div style={{ backgroundColor: colorTokens.primary }}>...</div>

// Use in conditional styling:
// const textColor = isError ? colors.error[700] : colors.text.primary;

// Use in component props that accept color values:
// <SomeComponent color={colorTokens.primary} />

// 3. COMMON PATTERNS IN YOUR APP
// --------------------------------

// Error Message Box (Currently hardcoded):
// BEFORE:
// <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
// 
// AFTER (Using globals):
// <div className="mb-5 rounded-xl border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">
// Or even simpler, create a reusable Alert component using these colors!

// Success Message Box (Currently hardcoded):
// BEFORE:
// <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
//
// AFTER:
// <div className="mb-5 rounded-xl border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">

// Brand Panel (Currently hardcoded with emerald):
// BEFORE:
// <div className="bg-emerald-900 p-8 text-white lg:col-span-6">
//
// AFTER:
// <div className="bg-brand-900 p-8 text-white lg:col-span-6">

// 4. TO CHANGE COLORS GLOBALLY
// ----------------------------------
// Simply edit the values in:
// frontend/src/lib/colors.js
//
// For example, to change the primary brand color:
// 1. Open frontend/src/lib/colors.js
// 2. Find: primary: { ... }
// 3. Change the hex values
// 4. All components using bg-brand-500, text-brand-600, etc. will automatically update!
//
// OR edit frontend/tailwind.config.js if you only want to change Tailwind classes

// 5. QUICK REFERENCE - Common Tailwind Classes
// -----------------------------------------------

const COMMON_CLASSES = {
  // Buttons
  primaryButton: 'bg-brand-600 hover:bg-brand-700 text-white',
  secondaryButton: 'bg-brand-50 hover:bg-brand-100 text-brand-600',
  dangerButton: 'bg-red-600 hover:bg-red-700 text-white',

  // Input Fields
  inputBorder: 'border-slate-300 focus-within:border-brand-600 focus-within:ring-4 focus-within:ring-brand-50',
  inputBorderError: 'border-red-400 ring-4 ring-red-50',

  // Alert/Messages
  successAlert: 'rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700',
  errorAlert: 'rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700',
  infoAlert: 'rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700',

  // Text
  primaryText: 'text-ink',
  secondaryText: 'text-slate-600',
  mutedText: 'text-slate-500',
  errorText: 'text-red-700',
  successText: 'text-emerald-700',

  // Backgrounds
  pageBackground: 'bg-slate-100',
  panelBackground: 'bg-white',
  subtleBackground: 'bg-slate-50',
};

export default COMMON_CLASSES;
