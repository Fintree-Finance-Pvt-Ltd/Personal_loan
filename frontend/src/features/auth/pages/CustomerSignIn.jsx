import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { authApi } from '../authApi';
import {
  getCustomerAccessToken,
  setCustomerAccessToken,
} from '../../customer/customerApi';
import { getAttributionPayload } from '../../utm/utm';

const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;
const OTP_LENGTH = 6;
const CONSENT_TEXT =
  'I consent to receive an OTP and agree to the Terms of Service and Privacy Policy.';

function extractCustomerFromOtpVerificationResult(result) {
  const payload =
    result?.data?.data ||
    result?.data ||
    result;

  return (
    payload?.customer ||
    payload?.data?.customer ||
    null
  );
}

export default function CustomerSignIn() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const hasActiveSession =
      Boolean(getCustomerAccessToken()) ||
      Boolean(
        localStorage.getItem('customerSession') ||
        sessionStorage.getItem('customerSession'),
      );

    if (hasActiveSession) {
      const currentSearch = searchParams.toString()
        ? `?${searchParams.toString()}`
        : '';
      navigate(`/customer/dashboard${currentSearch}`, {
        replace: true,
      });
    }
  }, [navigate, searchParams]);

  const otpInputRefs = useRef([]);
  const [mobileNumber, setMobileNumber] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(true);
  const [step, setStep] = useState('MOBILE');
  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [developmentOtp, setDevelopmentOtp] = useState('');

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
    const numericValue = event.target.value.replace(/\D/g, '').slice(0, 10);
    setMobileNumber(numericValue);
    setError('');
    setSuccessMessage('');
    setDevelopmentOtp('');
  };

  const validateMobileForm = () => {
    if (!mobileNumber) {
      return 'Please enter your mobile number.';
    }
    if (!INDIAN_MOBILE_REGEX.test(mobileNumber)) {
      return 'Enter a valid 10-digit Indian mobile number.';
    }
    if (!consentAccepted) {
      return 'Please agree to the Terms of Service & Privacy Policy.';
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
      const result = await authApi.sendMobileOtp({
        mobileNumber,
        consentGiven: true,
        consentText: CONSENT_TEXT,
        attribution: getAttributionPayload(),
        ...trackingData,
      });

      setOtp(Array(OTP_LENGTH).fill(''));
      setStep('OTP');
      setDevelopmentOtp(
        result?.data?.data?.developmentOtp ||
        result?.data?.developmentOtp ||
        '',
      );
      setSuccessMessage(`OTP sent successfully to +91 ${mobileNumber}.`);

      window.setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 100);
    } catch (requestError) {
      console.error('OTP request failed:', requestError);
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to send OTP. Please try again.',
      );
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
    if (event.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
    if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (event) => {
    event.preventDefault();
    const pastedOtp = event.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, OTP_LENGTH);

    if (!pastedOtp) return;

    const updatedOtp = Array(OTP_LENGTH).fill('');
    pastedOtp.split('').forEach((digit, index) => {
      updatedOtp[index] = digit;
    });

    setOtp(updatedOtp);
    setError('');
    setSuccessMessage('');

    const nextIndex = Math.min(pastedOtp.length, OTP_LENGTH - 1);
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
      const result = await authApi.verifyMobileOtp({
        mobileNumber,
        otp: enteredOtp,
        attribution: getAttributionPayload(),
      });

      const customer = extractCustomerFromOtpVerificationResult(result);
      if (!customer?.id) {
        throw new Error('Customer information was not returned after OTP verification.');
      }

      const responseData = result?.data?.data || result?.data || result;
      const accessToken = responseData?.accessToken;

      if (!accessToken) {
        throw new Error('Access token was not returned after OTP verification.');
      }

      setCustomerAccessToken(accessToken);
      localStorage.setItem(
        'customerSession',
        JSON.stringify({
          customerId: customer.id,
          customerCode: customer.customerCode,
          mobileNumber: customer.mobileNumber,
        }),
      );

      setSuccessMessage('OTP verified successfully.');
      const currentSearch = searchParams.toString() ? `?${searchParams.toString()}` : '';

      navigate(`/customer/dashboard${currentSearch}`, {
        replace: true,
        state: {
          customerId: customer.id,
          mobileNumber: customer.mobileNumber,
        },
      });
    } catch (verificationError) {
      console.error('OTP verification failed:', verificationError);
      setError(
        verificationError instanceof Error
          ? verificationError.message
          : 'Unable to verify OTP. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangeMobileNumber = () => {
    setStep('MOBILE');
    setOtp(Array(OTP_LENGTH).fill(''));
    setError('');
    setSuccessMessage('');
    setDevelopmentOtp('');
  };

  const handleResendOtp = async () => {
    setError('');
    setSuccessMessage('');
    setIsSubmitting(true);

    try {
      const result = await authApi.sendMobileOtp({
        mobileNumber,
        consentGiven: true,
        consentText: CONSENT_TEXT,
        attribution: getAttributionPayload(),
        ...trackingData,
      });

      setOtp(Array(OTP_LENGTH).fill(''));
      setDevelopmentOtp(
        result?.data?.data?.developmentOtp ||
        result?.data?.developmentOtp ||
        '',
      );
      setSuccessMessage(`OTP resent successfully to +91 ${mobileNumber}.`);

      window.setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 100);
    } catch (resendError) {
      setError(
        resendError instanceof Error
          ? resendError.message
          : 'Unable to resend OTP.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen w-full bg-white">
      <div className="grid min-h-screen w-full grid-cols-1 lg:grid-cols-2">
        {/* Left Section: Full Graphic Frame */}
        <section className="relative hidden min-h-screen items-center justify-center p-6 lg:flex lg:p-12">
          <div className="relative h-full max-h-[860px] w-full overflow-hidden rounded-tl-[160px] rounded-tr-[32px] rounded-bl-[32px] rounded-br-[32px] shadow-2xl">
            <img
              src="/image/DSC_7504-4_copy_v_n.jpg"
              alt="FinLeaf Digital Experience"
              className="h-full w-full object-cover object-center transition-transform duration-700 hover:scale-105"
            />
          </div>
        </section>

        {/* Right Section: Login Form */}
        <section className="flex flex-col justify-between px-6 py-10 sm:px-14 md:px-20 lg:py-16 xl:px-28">
          <div className="mx-auto w-full max-w-[460px]">
            {/* FinLeaf Brand Logo */}
            <div className="flex items-center justify-start">
              <img
                src="/image/IMG_0007-removebg-preview.png"
                alt="FinLeaf Logo"
                className="h-24 w-auto object-contain sm:h-30"
              />
            </div>

            {/* Page Header */}
            <div className="mt-12 sm:mt-14">
              <h1 className="text-3xl font-extrabold tracking-tight text-[#0f172a] sm:text-4xl">
                {step === 'MOBILE' ? 'Sign in to your account' : 'Verify Mobile OTP'}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                {step === 'MOBILE'
                  ? 'Enter your phone number to receive a secure login OTP.'
                  : `Enter the 6-digit code sent to +91 ${mobileNumber}`}
              </p>
            </div>

            {/* Error Notification */}
            {error && (
              <div
                role="alert"
                className="mt-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 shadow-sm"
              >
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* Success Notification */}
            {successMessage && (
              <div
                role="status"
                className="mt-6 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 shadow-sm"
              >
                <span>✓</span>
                <span>{successMessage}</span>
              </div>
            )}

            {step === 'MOBILE' ? (
              <form onSubmit={handleOtpRequest} noValidate className="mt-8">
                <div>
                  <label
                    htmlFor="mobileNumber"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                  >
                    Mobile Number
                  </label>

                  {/* Clean Unified Input Container */}
                  <div
                    className={`mt-2 flex h-14 items-center rounded-2xl border bg-white px-4 transition-all ${
                      error
                        ? 'border-red-400 ring-2 ring-red-100'
                        : 'border-slate-300 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-50'
                    }`}
                  >
                    <div className="flex shrink-0 items-center gap-2 pr-3 select-none">
                      <span className="text-xs font-bold text-slate-600">IN</span>
                      <span className="text-sm font-bold text-slate-800">+91</span>
                      <span className="ml-1 text-slate-300">|</span>
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
                      className="m-0 h-full w-full border-none bg-transparent p-0 text-base font-semibold tracking-wide text-slate-900 outline-none ring-0 placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 focus:outline-none focus:ring-0"
                    />

                    {mobileNumber.length > 0 && (
                      <span className="shrink-0 pl-2 text-xs font-semibold text-slate-400">
                        {mobileNumber.length}/10
                      </span>
                    )}
                  </div>
                </div>

                {/* Trust Badge */}
                <div className="mt-6">
                  <div className="flex w-fit items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100/70 text-lg">
                      🏛️
                    </span>
                    <div className="leading-tight">
                      <p className="text-xs font-bold text-slate-900">RBI Approved</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">Powered by RBI NBFC</p>
                    </div>
                  </div>
                </div>

                {/* Consent Checkbox */}
                <label className="mt-6 flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={consentAccepted}
                    onChange={(e) => {
                      setConsentAccepted(e.target.checked);
                      setError('');
                    }}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 accent-emerald-600 focus:ring-0"
                  />
                  <span className="text-xs leading-relaxed text-slate-600">
                    I agree to the{' '}
                    <a href="/terms" target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 hover:underline">
                      Terms of Service
                    </a>{' '}
                    and{' '}
                    <a href="/privacy-policy" target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 hover:underline">
                      Privacy Policy
                    </a>
                    .
                  </span>
                </label>

                {/* Submit / CTA Button (Increased height h-14, bolder emerald style) */}
                <button
                  type="submit"
                  disabled={isSubmitting || mobileNumber.length < 10}
                  className="mt-7 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-base font-bold text-white shadow-lg shadow-emerald-600/20 transition-all hover:from-emerald-700 hover:to-teal-700 hover:shadow-xl active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                  {isSubmitting ? (
                    <>
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      <span>Sending OTP...</span>
                    </>
                  ) : (
                    <>
                      <span>Continue with OTP</span>
          
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleOtpVerification} noValidate className="mt-8">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Enter 6-Digit OTP
                  </label>
                  <button
                    type="button"
                    onClick={handleChangeMobileNumber}
                    className="text-xs font-bold text-emerald-700 hover:underline"
                  >
                    Change Number
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-6 gap-2 sm:gap-3" onPaste={handleOtpPaste}>
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      ref={(element) => {
                        otpInputRefs.current[index] = element;
                      }}
                      type="text"
                      inputMode="numeric"
                      autoComplete={index === 0 ? 'one-time-code' : 'off'}
                      maxLength={1}
                      value={digit}
                      onChange={(event) => handleOtpChange(index, event.target.value)}
                      onKeyDown={(event) => handleOtpKeyDown(index, event)}
                      aria-label={`OTP digit ${index + 1}`}
                      className="h-14 w-full rounded-2xl border border-slate-300 text-center text-xl font-bold text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-50"
                    />
                  ))}
                </div>

                {developmentOtp && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-center text-xs text-amber-900">
                    Development OTP: <strong className="font-mono tracking-widest">{developmentOtp}</strong>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || otp.join('').length < OTP_LENGTH}
                  className="mt-7 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-base font-bold text-white shadow-lg shadow-emerald-600/20 transition-all hover:from-emerald-700 hover:to-teal-700 hover:shadow-xl active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                  {isSubmitting ? (
                    <>
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      <span>Verifying OTP...</span>
                    </>
                  ) : (
                    <>
                      <span>Verify & Proceed</span>
                      <span className="text-lg font-bold">→</span>
                    </>
                  )}
                </button>

                <div className="mt-5 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Didn&apos;t receive code?</span>
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={isSubmitting}
                    className="font-bold text-emerald-700 hover:underline disabled:opacity-50"
                  >
                    Resend Code
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="mt-10 text-center text-xs text-slate-400">
            © {new Date().getFullYear()} Fintree Finance Private Limited. All rights reserved.
          </div>
        </section>
      </div>
    </main>
  );
}