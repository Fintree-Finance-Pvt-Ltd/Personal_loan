// EXAMPLE: How to update your components to use global colors
// This shows the CustomerSignIn component using global colors

import { colorClasses, colorTokens } from '../../lib/colors';

// ❌ OLD WAY - Hardcoded colors everywhere:
// <div className="bg-emerald-900 p-8 text-white">
// <div className="text-emerald-600">
// <div className="border border-red-200 bg-red-50 text-red-700">

// ✅ NEW WAY - Use global colors:

export default function CustomerSignInExample() {
  return (
    <main className={`relative flex min-h-screen w-full items-center justify-center bg-slate-100 p-4 sm:p-6 lg:p-8`}>
      <div className="relative z-10 grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-3xl bg-white shadow-2xl lg:grid-cols-12">
        
        {/* LEFT PANEL: Using brand-900 instead of emerald-900 */}
        <div className="relative flex flex-col justify-between bg-brand-900 p-8 text-white lg:col-span-6 xl:col-span-7 xl:p-12">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {/* Using brand colors instead of emerald */}
            <div className="absolute -left-20 -top-20 h-80 w-80 rounded-full bg-brand-600/30 blur-3xl" />
            <div className="absolute -bottom-20 -right-20 h-80 w-80 rounded-full bg-brand-500/20 blur-3xl" />
          </div>

          <div className="relative z-10">
            <h2 className="mt-8 text-2xl font-bold leading-tight sm:text-3xl lg:text-4xl">
              Seamless Finance & Digital Verification
            </h2>
          </div>
        </div>

        {/* RIGHT PANEL: Sign-In Card */}
        <div className="flex flex-col justify-between bg-white p-6 sm:p-8 lg:col-span-6 xl:col-span-5 xl:p-10">
          <div>
            {/* Form Header - Using brand-600 instead of emerald-600 */}
            <div className="mb-6">
              <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${colorClasses.primaryText}`}>
                Customer Login
              </p>

              <h1 className={`mt-2 text-2xl font-bold tracking-tight ${colorClasses.textPrimary} sm:text-3xl`}>
                Sign in with mobile
              </h1>

              <p className={`mt-2 text-sm leading-6 ${colorClasses.textSecondary}`}>
                Enter your linked mobile number to continue.
              </p>
            </div>

            {/* Error Message - Using global error colors */}
            <div
              role="alert"
              className={`mb-5 rounded-xl border px-4 py-3 text-sm ${colorClasses.errorBorder} ${colorClasses.errorBg} ${colorClasses.errorText}`}
            >
              Sample error message
            </div>

            {/* Success Message - Using global success colors */}
            <div
              role="status"
              className={`mb-5 rounded-xl border px-4 py-3 text-sm ${colorClasses.successBorder} ${colorClasses.successBg} ${colorClasses.successText}`}
            >
              Sample success message
            </div>

            {/* Form Input with brand focus colors */}
            <div>
              <label htmlFor="mobile" className={`mb-2 block text-sm font-semibold ${colorClasses.textPrimary}`}>
                Mobile Number
              </label>

              <div className={`flex min-h-14 items-center rounded-xl border transition-all focus-within:border-brand-600 focus-within:ring-4 focus-within:ring-brand-50 border-slate-300`}>
                <div className="flex shrink-0 items-center gap-2 border-r border-slate-200 px-4">
                  <span className={`text-sm font-semibold ${colorClasses.textPrimary}`}>+91</span>
                </div>

                <input
                  id="mobile"
                  type="tel"
                  placeholder="Enter mobile number"
                  className="min-w-0 flex-1 bg-transparent px-4 py-4 text-base font-medium outline-none placeholder:font-normal placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Consent checkbox with brand accent */}
            <div className="mt-6 rounded-xl bg-slate-50 border border-slate-100 p-3">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="consent"
                  className="mt-1 accent-brand-600"
                  aria-label="Accept terms"
                />
                <label htmlFor="consent" className={`text-xs leading-5 ${colorClasses.textSecondary}`}>
                  I agree to the Terms of Service and Privacy Policy
                </label>
              </div>
            </div>

            {/* CTA Button - Using brand colors */}
            <button
              type="submit"
              className={`mt-6 w-full rounded-xl bg-brand-600 hover:bg-brand-700 py-3 font-semibold text-white transition-colors`}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

// KEY CHANGES MADE:
// ================
// 1. Replaced all "emerald" classes with "brand" classes
// 2. Used colorClasses constants for common patterns (errorBg, successBg, etc.)
// 3. For text colors, used ink for primary and slate for secondary
// 4. Preserved the structure and functionality, only changed colors

// BENEFITS:
// =========
// ✅ Change brand color once in colors.js, affects entire app
// ✅ Easier to maintain consistent colors
// ✅ Faster to implement design changes
// ✅ Team can easily understand color usage
