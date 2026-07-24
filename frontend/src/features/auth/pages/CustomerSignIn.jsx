import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;
const DUMMY_OTP = '123456';
const OTP_LENGTH = 6;

export default function CustomerSignIn() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const otpInputRefs = useRef([]);

  const [mobileNumber, setMobileNumber] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);

  const [step, setStep] = useState('MOBILE');
  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));

  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trackingData = useMemo(
    () => ({
      utmSource: searchParams.get('utm_source') || null,
      utmMedium: searchParams.get('utm_medium') || null,
      utmCampaign: searchParams.get('utm_campaign') || null,
      utmTerm: searchParams.get('utm_term') || null,
      utmContent: searchParams.get('utm_content') || null,
      referralCode: searchParams.get('ref') || null,
    }),
    [searchParams],
  );

  const handleMobileChange = (event) => {
    const numericValue = event.target.value
      .replace(/\D/g, '')
      .slice(0, 10);

    setMobileNumber(numericValue);
    setError('');
    setSuccessMessage('');
  };

  const validateMobileForm = () => {
    if (!mobileNumber) {
      return 'Mobile number is required.';
    }

    if (!INDIAN_MOBILE_REGEX.test(mobileNumber)) {
      return 'Enter a valid 10-digit Indian mobile number.';
    }

    if (!consentAccepted) {
      return 'Please accept the Terms of Service and Privacy Policy.';
    }

    return '';
  };

  const handleOtpRequest = async (event) => {
    event.preventDefault();

    const validationError = validateMobileForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setSuccessMessage('');
    setIsSubmitting(true);

    try {
      const payload = {
        mobileNumber,
        countryCode: '+91',
        consentAccepted: true,
        ...trackingData,
      };

      console.log('Dummy OTP request payload:', payload);

      await new Promise((resolve) => {
        setTimeout(resolve, 700);
      });

      setOtp(Array(OTP_LENGTH).fill(''));
      setStep('OTP');
      setSuccessMessage(
        `OTP sent successfully to +91 ${mobileNumber}. Use 123456.`,
      );

      window.setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 100);
    } catch (requestError) {
      console.error('OTP request failed:', requestError);

      setError('Unable to send OTP. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpChange = (index, value) => {
    const numericValue = value.replace(/\D/g, '').slice(-1);

    setOtp((currentOtp) => {
      const updatedOtp = [...currentOtp];
      updatedOtp[index] = numericValue;
      return updatedOtp;
    });

    setError('');
    setSuccessMessage('');

    if (numericValue && index < OTP_LENGTH - 1) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, event) => {
    if (
      event.key === 'Backspace' &&
      !otp[index] &&
      index > 0
    ) {
      otpInputRefs.current[index - 1]?.focus();
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }

    if (
      event.key === 'ArrowRight' &&
      index < OTP_LENGTH - 1
    ) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (event) => {
    event.preventDefault();

    const pastedOtp = event.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, OTP_LENGTH);

    if (!pastedOtp) {
      return;
    }

    const updatedOtp = Array(OTP_LENGTH).fill('');

    pastedOtp.split('').forEach((digit, index) => {
      updatedOtp[index] = digit;
    });

    setOtp(updatedOtp);
    setError('');
    setSuccessMessage('');

    const nextIndex = Math.min(
      pastedOtp.length,
      OTP_LENGTH - 1,
    );

    otpInputRefs.current[nextIndex]?.focus();
  };

  const handleOtpVerification = async (event) => {
    event.preventDefault();

    const enteredOtp = otp.join('');

    if (enteredOtp.length !== OTP_LENGTH) {
      setError('Enter the complete 6-digit OTP.');
      return;
    }

    setError('');
    setSuccessMessage('');
    setIsSubmitting(true);

    try {
      await new Promise((resolve) => {
        setTimeout(resolve, 700);
      });

      if (enteredOtp !== DUMMY_OTP) {
        setError('Invalid OTP. For dummy login, enter 123456.');
        return;
      }

      const dummyCustomerSession = {
        mobileNumber,
        countryCode: '+91',
        verified: true,
        loginType: 'DUMMY',
        verifiedAt: new Date().toISOString(),
        trackingData,
      };

      sessionStorage.setItem(
        'customerSession',
        JSON.stringify(dummyCustomerSession),
      );

      setSuccessMessage('OTP verified successfully.');

      window.setTimeout(() => {
        navigate('/customer/dashboard', {
          replace: true,
          state: {
            mobileNumber,
            trackingData,
          },
        });
      }, 400);
    } catch (verificationError) {
      console.error(
        'OTP verification failed:',
        verificationError,
      );

      setError('Unable to verify OTP. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangeMobileNumber = () => {
    setStep('MOBILE');
    setOtp(Array(OTP_LENGTH).fill(''));
    setError('');
    setSuccessMessage('');
  };

  const handleResendOtp = async () => {
    setError('');
    setSuccessMessage('');
    setIsSubmitting(true);

    try {
      await new Promise((resolve) => {
        setTimeout(resolve, 500);
      });

      setOtp(Array(OTP_LENGTH).fill(''));
      setSuccessMessage(
        `OTP resent to +91 ${mobileNumber}. Use 123456.`,
      );

      otpInputRefs.current[0]?.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      {/* Background decorations */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 -top-20 h-[500px] w-[500px] rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="absolute -bottom-20 -right-20 h-[500px] w-[500px] rounded-full bg-emerald-300/30 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-100/30 blur-3xl" />

        <span className="absolute left-10 top-12 animate-pulse text-3xl text-emerald-400/40">
          ✦
        </span>

        <span className="absolute right-16 top-1/4 text-2xl text-emerald-500/30">
          ★
        </span>

        <span className="absolute bottom-1/3 left-16 text-4xl text-emerald-300/40">
          ✦
        </span>

        <span className="absolute bottom-12 right-12 animate-pulse text-3xl text-emerald-400/30">
          ✦
        </span>
      </div>

      <div className="relative z-10 w-full max-w-lg">
        <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-2xl shadow-slate-200/80 backdrop-blur-md sm:p-8">
          {/* Illustration */}
          <div className="mx-auto mb-5 w-full max-w-[210px]">
            <svg
              viewBox="0 0 500 400"
              className="h-auto w-full"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect
                x="180"
                y="30"
                width="280"
                height="150"
                rx="16"
                fill="#FFFFFF"
                stroke="#1E293B"
                strokeWidth="2.5"
              />

              <rect
                x="220"
                y="65"
                width="130"
                height="10"
                rx="5"
                fill="#E2E8F0"
              />

              <rect
                x="220"
                y="90"
                width="180"
                height="10"
                rx="5"
                fill="#E2E8F0"
              />

              <rect
                x="220"
                y="115"
                width="150"
                height="10"
                rx="5"
                fill="#E2E8F0"
              />

              <circle
                cx="310"
                cy="90"
                r="32"
                fill="#059669"
              />

              <path
                d="M310 72C301.163 72 294 79.163 294 88C294 96.837 301.163 104 310 104C318.837 104 326 96.837 326 88C326 79.163 318.837 72 310 72Z"
                fill="#FFFFFF"
              />

              <circle
                cx="430"
                cy="160"
                r="28"
                fill="#059669"
              />

              <path
                d="M418 160L426 168L442 152"
                stroke="#FFFFFF"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              <path
                d="M190 200 C 260 250, 350 250, 400 200"
                stroke="#0F172A"
                strokeWidth="2.5"
                strokeDasharray="6 6"
              />

              <path
                d="M392 195 L405 198 L398 210"
                stroke="#0F172A"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              <path
                d="M80 370 L140 370 L110 240 Z"
                fill="#F8FAFC"
              />

              <path
                d="M90 180 C90 180, 70 230, 70 370 L110 370 L130 250 L150 370 L185 370 L155 180 Z"
                fill="#F1F5F9"
              />

              <circle
                cx="120"
                cy="100"
                r="22"
                fill="#FDA4AF"
              />

              <path
                d="M98 100 C98 80, 142 80, 142 100 C142 125, 98 125, 98 100"
                fill="#0F172A"
              />

              <path
                d="M100 135 L140 135 L150 230 L90 230 Z"
                fill="#FFFFFF"
              />

              <path
                d="M130 180 L180 200"
                stroke="#FDA4AF"
                strokeWidth="18"
                strokeLinecap="round"
              />

              <rect
                x="155"
                y="180"
                width="35"
                height="55"
                rx="8"
                transform="rotate(-15 155 180)"
                fill="#059669"
              />
            </svg>
          </div>

          <div className="mb-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">
              Customer Login
            </p>

            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {step === 'MOBILE'
                ? 'Sign in with mobile'
                : 'Verify your OTP'}
            </h1>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              {step === 'MOBILE'
                ? 'Enter your Aadhaar-linked mobile number to continue.'
                : `Enter the 6-digit OTP sent to +91 ${mobileNumber}.`}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
            >
              {successMessage}
            </div>
          )}

          {step === 'MOBILE' ? (
            <form onSubmit={handleOtpRequest} noValidate>
              <div>
                <label
                  htmlFor="mobileNumber"
                  className="mb-2 block text-sm font-semibold text-slate-800"
                >
                  Mobile Number
                </label>

                <div
                  className={`flex min-h-14 items-center rounded-xl border bg-white transition-all ${
                    error
                      ? 'border-red-400 ring-4 ring-red-50'
                      : 'border-slate-300 focus-within:border-emerald-600 focus-within:ring-4 focus-within:ring-emerald-50'
                  }`}
                >
                  <div className="flex shrink-0 items-center gap-2 border-r border-slate-200 px-4">
                    <span
                      role="img"
                      aria-label="India"
                      className="text-lg"
                    >
                      🇮🇳
                    </span>

                    <span className="text-sm font-semibold text-slate-800">
                      +91
                    </span>
                  </div>

                  <input
                    id="mobileNumber"
                    name="mobileNumber"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    maxLength={10}
                    value={mobileNumber}
                    onChange={handleMobileChange}
                    placeholder="Enter mobile number"
                    className="min-w-0 flex-1 bg-transparent px-4 py-4 text-base font-medium text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400"
                  />
                </div>

                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Please enter your{' '}
                  <span className="font-semibold text-emerald-600">
                    Aadhaar
                  </span>{' '}
                  linked mobile number.
                </p>
              </div>

              <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-100">
                    🏛️
                  </div>

                  <div>
                    <p className="text-xs font-bold text-slate-900">
                      RBI Registered NBFC
                    </p>

                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Powered by Fintree Finance Pvt. Ltd.
                    </p>
                  </div>
                </div>
              </div>

              <label className="mt-6 flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={consentAccepted}
                  onChange={(event) => {
                    setConsentAccepted(event.target.checked);
                    setError('');
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-emerald-600"
                />

                <span className="text-xs leading-5 text-slate-600">
                  I agree to FinLeaf&apos;s{' '}
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-emerald-700 hover:underline"
                  >
                    Terms of Service
                  </a>{' '}
                  and{' '}
                  <a
                    href="/privacy-policy"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-emerald-700 hover:underline"
                  >
                    Privacy Policy
                  </a>
                  .
                </span>
              </label>

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-7 flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Sending OTP...
                  </>
                ) : (
                  'Request OTP'
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleOtpVerification} noValidate>
              <div>
                <label className="mb-3 block text-center text-sm font-semibold text-slate-800">
                  Enter OTP
                </label>

                <div
                  className="flex justify-center gap-2 sm:gap-3"
                  onPaste={handleOtpPaste}
                >
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      ref={(element) => {
                        otpInputRefs.current[index] = element;
                      }}
                      type="text"
                      inputMode="numeric"
                      autoComplete={
                        index === 0
                          ? 'one-time-code'
                          : 'off'
                      }
                      maxLength={1}
                      value={digit}
                      onChange={(event) =>
                        handleOtpChange(
                          index,
                          event.target.value,
                        )
                      }
                      onKeyDown={(event) =>
                        handleOtpKeyDown(index, event)
                      }
                      aria-label={`OTP digit ${index + 1}`}
                      className="h-12 w-11 rounded-xl border border-slate-300 bg-white text-center text-lg font-bold text-slate-900 outline-none transition-all focus:border-emerald-600 focus:ring-4 focus:ring-emerald-50 sm:h-14 sm:w-12"
                    />
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center">
                  <p className="text-xs text-amber-800">
                    Dummy OTP:{' '}
                    <strong className="tracking-widest">
                      123456
                    </strong>
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-6 flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Verifying OTP...
                  </>
                ) : (
                  'Verify and Continue'
                )}
              </button>

              <div className="mt-5 flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={handleChangeMobileNumber}
                  disabled={isSubmitting}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-50"
                >
                  Change number
                </button>

                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={isSubmitting}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
                >
                  Resend OTP
                </button>
              </div>
            </form>
          )}
        </div>

        <footer className="mt-6 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} Fintree Finance Private
          Limited. All rights reserved.
        </footer>
      </div>
    </main>
  );
}