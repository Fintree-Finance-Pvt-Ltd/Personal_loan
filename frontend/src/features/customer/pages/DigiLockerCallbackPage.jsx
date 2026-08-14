import { useEffect } from 'react';

export default function DigiLockerCallbackPage() {
  useEffect(() => {
    // Automatically close popup window after verification
    const timer = setTimeout(() => {
      if (window.opener) {
        window.close();
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center font-sans">
      <div className="w-full max-w-sm rounded-3xl border border-slate-100 bg-white p-8 shadow-xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-slate-800">Verification Complete</h2>
        <p className="mt-2 text-xs text-slate-500">
          Your DigiLocker session has finished. This window will close automatically.
        </p>
        <button
          type="button"
          onClick={() => window.close()}
          className="mt-6 w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white shadow-md hover:bg-emerald-700 transition"
        >
          Close Window
        </button>
      </div>
    </div>
  );
}
