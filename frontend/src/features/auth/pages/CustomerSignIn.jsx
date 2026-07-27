import {
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { authApi } from '../authApi';

const INDIAN_MOBILE_REGEX =
  /^[6-9]\d{9}$/;

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
  const [searchParams] =
    useSearchParams();

  const otpInputRefs = useRef([]);

  const [
    mobileNumber,
    setMobileNumber,
  ] = useState('');

  const [
    consentAccepted,
    setConsentAccepted,
  ] = useState(false);

  const [step, setStep] =
    useState('MOBILE');

  const [otp, setOtp] = useState(
    Array(OTP_LENGTH).fill(''),
  );

  const [error, setError] =
    useState('');

  const [
    successMessage,
    setSuccessMessage,
  ] = useState('');

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);

  const [
    developmentOtp,
    setDevelopmentOtp,
  ] = useState('');

  const trackingData = useMemo(
    () => ({
      utmSource:
        searchParams.get(
          'utm_source',
        ) || null,

      utmMedium:
        searchParams.get(
          'utm_medium',
        ) || null,

      utmCampaign:
        searchParams.get(
          'utm_campaign',
        ) || null,

      utmTerm:
        searchParams.get(
          'utm_term',
        ) || null,

      utmContent:
        searchParams.get(
          'utm_content',
        ) || null,

      referralCode:
        searchParams.get('ref') ||
        null,
    }),
    [searchParams],
  );

  const handleMobileChange = (
    event,
  ) => {
    const numericValue =
      event.target.value
        .replace(/\D/g, '')
        .slice(0, 10);

    setMobileNumber(numericValue);
    setError('');
    setSuccessMessage('');
    setDevelopmentOtp('');
  };

  const validateMobileForm = () => {
    if (!mobileNumber) {
      return 'Mobile number is required.';
    }

    if (
      !INDIAN_MOBILE_REGEX.test(
        mobileNumber,
      )
    ) {
      return 'Enter a valid 10-digit Indian mobile number.';
    }

    if (!consentAccepted) {
      return 'Please accept the Terms of Service and Privacy Policy.';
    }

    return '';
  };

  const handleOtpRequest = async (
    event,
  ) => {
    event.preventDefault();

    const validationError =
      validateMobileForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setSuccessMessage('');
    setIsSubmitting(true);

    try {
      const result =
        await authApi.sendMobileOtp({
          mobileNumber,
          consentGiven: true,
          consentText:
            CONSENT_TEXT,
        });

      setOtp(
        Array(OTP_LENGTH).fill(''),
      );

      setStep('OTP');

      setDevelopmentOtp(
        result?.data
          ?.developmentOtp || '',
      );

      setSuccessMessage(
        `OTP sent successfully to +91 ${mobileNumber}.`,
      );

      window.setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 100);
    } catch (requestError) {
      console.error(
        'OTP request failed:',
        requestError,
      );

      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to send OTP. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpChange = (
    index,
    value,
  ) => {
    const numericValue = value
      .replace(/\D/g, '')
      .slice(-1);

    setOtp((currentOtp) => {
      const updatedOtp = [
        ...currentOtp,
      ];

      updatedOtp[index] =
        numericValue;

      return updatedOtp;
    });

    setError('');
    setSuccessMessage('');

    if (
      numericValue &&
      index < OTP_LENGTH - 1
    ) {
      otpInputRefs.current[
        index + 1
      ]?.focus();
    }
  };

  const handleOtpKeyDown = (
    index,
    event,
  ) => {
    if (
      event.key === 'Backspace' &&
      !otp[index] &&
      index > 0
    ) {
      otpInputRefs.current[
        index - 1
      ]?.focus();
    }

    if (
      event.key === 'ArrowLeft' &&
      index > 0
    ) {
      otpInputRefs.current[
        index - 1
      ]?.focus();
    }

    if (
      event.key === 'ArrowRight' &&
      index < OTP_LENGTH - 1
    ) {
      otpInputRefs.current[
        index + 1
      ]?.focus();
    }
  };

  const handleOtpPaste = (
    event,
  ) => {
    event.preventDefault();

    const pastedOtp =
      event.clipboardData
        .getData('text')
        .replace(/\D/g, '')
        .slice(0, OTP_LENGTH);

    if (!pastedOtp) {
      return;
    }

    const updatedOtp = Array(
      OTP_LENGTH,
    ).fill('');

    pastedOtp
      .split('')
      .forEach((digit, index) => {
        updatedOtp[index] = digit;
      });

    setOtp(updatedOtp);
    setError('');
    setSuccessMessage('');

    const nextIndex = Math.min(
      pastedOtp.length,
      OTP_LENGTH - 1,
    );

    otpInputRefs.current[
      nextIndex
    ]?.focus();
  };

  const handleOtpVerification =
    async (event) => {
      event.preventDefault();

      const enteredOtp =
        otp.join('');

      if (
        enteredOtp.length !==
        OTP_LENGTH
      ) {
        setError(
          'Enter the complete 6-digit OTP.',
        );

        return;
      }

      setError('');
      setSuccessMessage('');
      setIsSubmitting(true);

      try {
        const result =
          await authApi.verifyMobileOtp({
            mobileNumber,
            otp: enteredOtp,
          });

        const customer =
          extractCustomerFromOtpVerificationResult(result);

        if (!customer?.id) {
          throw new Error(
            'Customer information was not returned after OTP verification.',
          );
        }

        const customerSession = {
          customerId: customer.id,
          customerCode:
            customer.customerCode,
          mobileNumber:
            customer.mobileNumber,
          countryCode:
            customer.countryCode ||
            '+91',
          mobileVerified:
            customer.mobileVerified,
          accountStatus:
            customer.accountStatus,
          onboardingStatus:
            customer.onboardingStatus,
          eligibilityStatus:
            customer.eligibilityStatus,
          panVerified:
            customer.panVerified ||
            false,
          emailVerified:
            customer.emailVerified ||
            false,
          verifiedAt:
            new Date().toISOString(),
          trackingData,
        };

        sessionStorage.setItem(
          'customerSession',
          JSON.stringify(
            customerSession,
          ),
        );

        setSuccessMessage(
          'OTP verified successfully.',
        );

        navigate(
          '/customer/dashboard',
          {
            replace: true,

            state: {
              customerId:
                customer.id,
              mobileNumber:
                customer.mobileNumber,
            },
          },
        );
      } catch (
        verificationError
      ) {
        console.error(
          'OTP verification failed:',
          verificationError,
        );

        setError(
          verificationError instanceof
          Error
            ? verificationError.message
            : 'Unable to verify OTP. Please try again.',
        );
      } finally {
        setIsSubmitting(false);
      }
    };

  const handleChangeMobileNumber =
    () => {
      setStep('MOBILE');
      setOtp(
        Array(OTP_LENGTH).fill(''),
      );
      setError('');
      setSuccessMessage('');
      setDevelopmentOtp('');
    };

  const handleResendOtp =
    async () => {
      setError('');
      setSuccessMessage('');
      setIsSubmitting(true);

      try {
        const result =
          await authApi.sendMobileOtp({
            mobileNumber,
            consentGiven: true,
            consentText:
              CONSENT_TEXT,
          });

        setOtp(
          Array(OTP_LENGTH).fill(''),
        );

        setDevelopmentOtp(
          result?.data
            ?.developmentOtp || '',
        );

        setSuccessMessage(
          `OTP resent successfully to +91 ${mobileNumber}.`,
        );

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
    <main className="relative flex min-h-screen w-full items-center justify-center bg-slate-100 p-4 sm:p-6 lg:p-8">
      <div className="relative z-10 grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-3xl bg-white shadow-2xl lg:grid-cols-12">
        <div className="relative flex flex-col justify-between bg-emerald-900 p-8 text-white lg:col-span-6 xl:col-span-7 xl:p-12">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -left-20 -top-20 h-80 w-80 rounded-full bg-emerald-600/30 blur-3xl" />
            <div className="absolute -bottom-20 -right-20 h-80 w-80 rounded-full bg-emerald-400/20 blur-3xl" />
          </div>

          <div className="relative z-10">
            <div className="flex items-center gap-2">
              <span className="text-2xl">
                🍃
              </span>

              <span className="text-xl font-bold tracking-tight">
                FinLeaf
              </span>
            </div>

            <h2 className="mt-8 text-2xl font-bold leading-tight sm:text-3xl lg:text-4xl">
              Seamless Finance &
              Digital Verification
            </h2>

            <p className="mt-3 text-sm text-emerald-100/80 sm:text-base">
              Secure, fast, and
              transparent solutions
              powered by RBI registered
              partners.
            </p>
          </div>

          <div className="relative z-10 my-8 flex items-center justify-center">
            <div className="relative overflow-hidden rounded-2xl border border-emerald-700/50 bg-emerald-800/40 p-2 shadow-xl backdrop-blur-sm">
              <img
                src="/image/Login_img-removebg-preview.png"
                alt="FinLeaf verification"
                className="h-auto max-h-[320px] w-full rounded-xl object-contain"
              />
            </div>
          </div>

          <div className="relative z-10 text-xs text-emerald-200/70">
            Trusted digital onboarding
            platform.
          </div>
        </div>

        <div className="flex flex-col justify-between bg-white p-6 sm:p-8 lg:col-span-6 xl:col-span-5 xl:p-10">
          <div>
            <div className="mb-6">
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
                  ? 'Enter your mobile number to continue.'
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
              <form
                onSubmit={
                  handleOtpRequest
                }
                noValidate
              >
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
                      value={
                        mobileNumber
                      }
                      onChange={
                        handleMobileChange
                      }
                      placeholder="Enter mobile number"
                      className="min-w-0 flex-1 bg-transparent px-4 py-4 text-base font-medium text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400"
                    />
                  </div>

                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Enter your
                    10-digit Indian
                    mobile number.
                  </p>
                </div>

                <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-100">
                      🏛️
                    </div>

                    <div>
                      <p className="text-xs font-bold text-slate-900">
                        RBI Registered
                        NBFC
                      </p>

                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Powered by
                        Fintree Finance
                        Pvt. Ltd.
                      </p>
                    </div>
                  </div>
                </div>

                <label className="mt-6 flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={
                      consentAccepted
                    }
                    onChange={(event) => {
                      setConsentAccepted(
                        event.target
                          .checked,
                      );

                      setError('');
                    }}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-emerald-600"
                  />

                  <span className="text-xs leading-5 text-slate-600">
                    I agree to
                    FinLeaf&apos;s{' '}
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
                  disabled={
                    isSubmitting
                  }
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
              <form
                onSubmit={
                  handleOtpVerification
                }
                noValidate
              >
                <div>
                  <label className="mb-3 block text-center text-sm font-semibold text-slate-800">
                    Enter OTP
                  </label>

                  <div
                    className="flex justify-center gap-2 sm:gap-3"
                    onPaste={
                      handleOtpPaste
                    }
                  >
                    {otp.map(
                      (
                        digit,
                        index,
                      ) => (
                        <input
                          key={index}
                          ref={(
                            element,
                          ) => {
                            otpInputRefs.current[
                              index
                            ] =
                              element;
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
                          onChange={(
                            event,
                          ) =>
                            handleOtpChange(
                              index,
                              event
                                .target
                                .value,
                            )
                          }
                          onKeyDown={(
                            event,
                          ) =>
                            handleOtpKeyDown(
                              index,
                              event,
                            )
                          }
                          aria-label={`OTP digit ${index + 1}`}
                          className="h-12 w-11 rounded-xl border border-slate-300 bg-white text-center text-lg font-bold text-slate-900 outline-none transition-all focus:border-emerald-600 focus:ring-4 focus:ring-emerald-50 sm:h-14 sm:w-12"
                        />
                      ),
                    )}
                  </div>

                  {developmentOtp && (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center">
                      <p className="text-xs text-amber-800">
                        Development OTP:{' '}
                        <strong className="tracking-widest">
                          {
                            developmentOtp
                          }
                        </strong>
                      </p>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={
                    isSubmitting
                  }
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
                    onClick={
                      handleChangeMobileNumber
                    }
                    disabled={
                      isSubmitting
                    }
                    className="text-xs font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-50"
                  >
                    Change number
                  </button>

                  <button
                    type="button"
                    onClick={
                      handleResendOtp
                    }
                    disabled={
                      isSubmitting
                    }
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
                  >
                    Resend OTP
                  </button>
                </div>
              </form>
            )}
          </div>

          <footer className="mt-8 text-center text-xs text-slate-500">
            ©{' '}
            {new Date().getFullYear()}{' '}
            Fintree Finance Private
            Limited. All rights
            reserved.
          </footer>
        </div>
      </div>
    </main>
  );
}