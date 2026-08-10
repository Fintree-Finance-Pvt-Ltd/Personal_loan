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

const INDIAN_MOBILE_REGEX =
  /^[6-9]\d{9}$/;

const OTP_LENGTH = 6;

const CONSENT_TEXT =
  'I consent to receive an OTP and agree to the Terms of Service and Privacy Policy.';

function extractCustomerFromOtpVerificationResult(
  result,
) {
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

  useEffect(() => {
    const hasActiveSession =
      Boolean(
        getCustomerAccessToken(),
      ) ||
      Boolean(
        localStorage.getItem(
          'customerSession',
        ) ||
        sessionStorage.getItem(
          'customerSession',
        ),
      );

    if (hasActiveSession) {
      navigate(
        '/customer/dashboard',
        {
          replace: true,
        },
      );
    }
  }, [navigate]);

  const otpInputRefs =
    useRef([]);

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

  const [otp, setOtp] =
    useState(
      Array(
        OTP_LENGTH,
      ).fill(''),
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

  const trackingData =
    useMemo(
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
          searchParams.get(
            'ref',
          ) || null,
      }),
      [searchParams],
    );

  const handleMobileChange = (
    event,
  ) => {
    const numericValue =
      event.target.value
        .replace(
          /\D/g,
          '',
        )
        .slice(0, 10);

    setMobileNumber(
      numericValue,
    );

    setError('');
    setSuccessMessage('');
    setDevelopmentOtp('');
  };

  const validateMobileForm =
    () => {
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

  const handleOtpRequest =
    async (event) => {
      event.preventDefault();

      const validationError =
        validateMobileForm();

      if (validationError) {
        setError(
          validationError,
        );

        return;
      }

      setError('');
      setSuccessMessage('');
      setIsSubmitting(true);

      try {
        const result =
          await authApi.sendMobileOtp(
            {
              mobileNumber,

              consentGiven:
                true,

              consentText:
                CONSENT_TEXT,

              ...trackingData,
            },
          );

        setOtp(
          Array(
            OTP_LENGTH,
          ).fill(''),
        );

        setStep('OTP');

        setDevelopmentOtp(
          result?.data?.data
            ?.developmentOtp ||
          result?.data
            ?.developmentOtp ||
          '',
        );

        setSuccessMessage(
          `OTP sent successfully to +91 ${mobileNumber}.`,
        );

        window.setTimeout(
          () => {
            otpInputRefs.current[
              0
            ]?.focus();
          },
          100,
        );
      } catch (
      requestError
      ) {
        console.error(
          'OTP request failed:',
          requestError,
        );

        setError(
          requestError instanceof
            Error
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
    const numericValue =
      value
        .replace(
          /\D/g,
          '',
        )
        .slice(-1);

    setOtp(
      (
        currentOtp,
      ) => {
        const updatedOtp = [
          ...currentOtp,
        ];

        updatedOtp[index] =
          numericValue;

        return updatedOtp;
      },
    );

    setError('');
    setSuccessMessage('');

    if (
      numericValue &&
      index <
      OTP_LENGTH - 1
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
      event.key ===
      'Backspace' &&
      !otp[index] &&
      index > 0
    ) {
      otpInputRefs.current[
        index - 1
      ]?.focus();
    }

    if (
      event.key ===
      'ArrowLeft' &&
      index > 0
    ) {
      otpInputRefs.current[
        index - 1
      ]?.focus();
    }

    if (
      event.key ===
      'ArrowRight' &&
      index <
      OTP_LENGTH - 1
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
        .replace(
          /\D/g,
          '',
        )
        .slice(
          0,
          OTP_LENGTH,
        );

    if (!pastedOtp) {
      return;
    }

    const updatedOtp =
      Array(
        OTP_LENGTH,
      ).fill('');

    pastedOtp
      .split('')
      .forEach(
        (
          digit,
          index,
        ) => {
          updatedOtp[index] =
            digit;
        },
      );

    setOtp(updatedOtp);
    setError('');
    setSuccessMessage('');

    const nextIndex =
      Math.min(
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
          await authApi.verifyMobileOtp(
            {
              mobileNumber,
              otp: enteredOtp,
            },
          );

        const customer =
          extractCustomerFromOtpVerificationResult(
            result,
          );

        if (!customer?.id) {
          throw new Error(
            'Customer information was not returned after OTP verification.',
          );
        }

        const responseData =
          result?.data?.data ||
          result?.data ||
          result;

        const accessToken =
          responseData?.accessToken;

        if (!accessToken) {
          throw new Error(
            'Access token was not returned after OTP verification.',
          );
        }

        setCustomerAccessToken(
          accessToken,
        );

        localStorage.setItem(
          'customerSession',
          JSON.stringify({
            customerId:
              customer.id,

            customerCode:
              customer.customerCode,

            mobileNumber:
              customer.mobileNumber,
          }),
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
        Array(
          OTP_LENGTH,
        ).fill(''),
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
          await authApi.sendMobileOtp(
            {
              mobileNumber,

              consentGiven:
                true,

              consentText:
                CONSENT_TEXT,

              ...trackingData,
            },
          );

        setOtp(
          Array(
            OTP_LENGTH,
          ).fill(''),
        );

        setDevelopmentOtp(
          result?.data?.data
            ?.developmentOtp ||
          result?.data
            ?.developmentOtp ||
          '',
        );

        setSuccessMessage(
          `OTP resent successfully to +91 ${mobileNumber}.`,
        );

        window.setTimeout(
          () => {
            otpInputRefs.current[
              0
            ]?.focus();
          },
          100,
        );
      } catch (
      resendError
      ) {
        setError(
          resendError instanceof
            Error
            ? resendError.message
            : 'Unable to resend OTP.',
        );
      } finally {
        setIsSubmitting(false);
      }
    };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f4f8f6]">
      {/* Page background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-44 h-[520px] w-[520px] rounded-full bg-emerald-200/30 blur-3xl" />

        <div className="absolute -bottom-48 -right-40 h-[560px] w-[560px] rounded-full bg-cyan-200/25 blur-3xl" />

        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              'linear-gradient(#065f46 1px, transparent 1px), linear-gradient(90deg, #065f46 1px, transparent 1px)',

            backgroundSize:
              '40px 40px',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1500px] items-center justify-center px-4 py-5 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
        <div className="grid w-full max-w-[1180px] overflow-hidden rounded-[28px] border border-white/80 bg-white shadow-[0_32px_90px_rgba(15,23,42,0.14)] sm:rounded-[34px] lg:grid-cols-[1.08fr_0.92fr]">
          {/* Left hero */}
          <section className="relative hidden min-h-[720px] overflow-hidden bg-gradient-to-br from-[#064e3b] via-[#047857] to-[#0f766e] text-white lg:flex lg:flex-col">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -left-20 -top-20 h-80 w-80 rounded-full bg-emerald-300/20 blur-3xl" />

              <div className="absolute -bottom-24 -right-20 h-96 w-96 rounded-full bg-cyan-300/20 blur-3xl" />

              <div
                className="absolute inset-0 opacity-[0.06]"
                style={{
                  backgroundImage:
                    'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',

                  backgroundSize:
                    '46px 46px',
                }}
              />
            </div>

            <div className="relative z-10 px-10 pt-9 xl:px-12 xl:pt-11">


              <div className="mt-8 max-w-[520px]">
                {/* <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-50 backdrop-blur">
                  Secure personal loan journey
                </span> */}

                <h1 className="mt-5 text-3xl font-bold leading-[1.12] tracking-tight xl:text-[46px]">
                  Quick finance for
                  <span className="block text-emerald-100">
                    the moments that matter.
                  </span>
                </h1>

                <p className="mt-4 max-w-[490px] text-sm leading-7 text-emerald-50/80 xl:text-base">
                  Apply, verify and track your personal loan through one secure and transparent digital platform.
                </p>
              </div>
            </div>

            <div className="relative z-10 flex min-h-0 flex-1 items-end justify-center px-8">
              <div className="relative w-full">
                <div className="absolute bottom-2 left-1/2 h-56 w-72 -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />

                <img
                  src="/image/Img_@1.png"
                  alt="FinLeaf digital loan assistance"
                  className="relative z-10 mx-auto mb-1 h-auto max-h-[445px] w-full object-contain object-bottom xl:max-h-[370px]"
                />
              </div>
            </div>

            <div className="relative z-10 grid grid-cols-3 gap-3 px-10 pb-10 xl:px-12">
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3.5 backdrop-blur">
                <p className="text-sm font-bold text-white">
                  100% Digital
                </p>

                <p className="mt-1 text-[11px] leading-4 text-emerald-100/70">
                  Paperless onboarding
                </p>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3.5 backdrop-blur">
                <p className="text-sm font-bold text-white">
                  Secure OTP
                </p>

                <p className="mt-1 text-[11px] leading-4 text-emerald-100/70">
                  Protected verification
                </p>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3.5 backdrop-blur">
                <p className="text-sm font-bold text-white">
                  Simple Flow
                </p>

                <p className="mt-1 text-[11px] leading-4 text-emerald-100/70">
                  Easy application
                </p>
              </div>
            </div>
          </section>

          {/* Right form */}
          <section className="flex min-h-[650px] flex-col bg-white px-5 py-6 sm:px-8 sm:py-8 lg:min-h-[720px] lg:px-10 lg:py-9 xl:px-14 xl:py-10">
            {/* Mobile logo */}
            <div className="mb-8 flex items-center justify-between lg:hidden">
              <img
                src="/image/IMG_0007-removebg-preview.png"
                alt="FinLeaf"
                className="h-51 w-auto max-w-[550px] object-contain"
              />

              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Secure login
              </span>
            </div>

            <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col justify-center">
              <header className="mb-7 sm:mb-8">
                <div className="flex items-center gap-2">


                  <img
                    src="/image/IMG_0007-removebg-preview.png"
                    alt="FinLeaf"
                    className="h-30 w-auto max-w-[270px] object-contain"
                  />
                </div>

                <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-slate-950 sm:text-[36px]">
                  {step === 'MOBILE'
                    ? 'Welcome back'
                    : 'Verify your OTP'}
                </h2>

              </header>

              {error && (
                <div
                  role="alert"
                  className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-700"
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-red-100 text-xs font-bold">
                    !
                  </span>

                  <span className="pt-0.5">
                    {error}
                  </span>
                </div>
              )}

              {successMessage && (
                <div
                  role="status"
                  className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-sm text-emerald-700"
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-bold">
                    ✓
                  </span>

                  <span className="pt-0.5">
                    {successMessage}
                  </span>
                </div>
              )}

              {step === 'MOBILE' ? (
                <form
                  onSubmit={handleOtpRequest}
                  noValidate
                >
                  <div>
                    <label
                      htmlFor="mobileNumber"
                      className="mb-2.5 block text-sm font-semibold text-slate-800"
                    >
                      Mobile number
                    </label>

                    <div
                      className={`flex min-h-14 items-center overflow-hidden rounded-2xl border bg-white shadow-sm transition-all ${error
                        ? 'border-red-400 ring-4 ring-red-50'
                        : 'border-slate-200 focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-50'
                        }`}
                    >
                      <div className="flex h-14 shrink-0 items-center gap-2 border-r border-slate-200 bg-slate-50 px-3.5 sm:px-4">
                        <span
                          role="img"
                          aria-label="India"
                          className="text-base"
                        >
                          🇮🇳
                        </span>

                        <span className="text-sm font-bold text-slate-800">
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
                        placeholder="Enter 10-digit mobile number"
                        className="min-w-0 flex-1 bg-transparent px-3.5 py-4 text-base font-semibold tracking-wide text-slate-950 outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 sm:px-4"
                      />
                    </div>

                    <div className="mt-2.5 flex items-center justify-between gap-3">
                      <p className="text-xs text-slate-500">
                        We will send a secure OTP.
                      </p>

                      <span className="text-xs font-semibold text-slate-400">
                        {mobileNumber.length}/10
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                    <div className="flex items-center gap-3">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-lg shadow-sm">
                        🏛️
                      </div>

                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          RBI Registered NBFC
                        </p>

                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          Powered by Fintree Finance Private Limited.
                        </p>
                      </div>
                    </div>
                  </div>

                  <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-emerald-200 hover:bg-emerald-50/30">
                    <input
                      type="checkbox"
                      checked={consentAccepted}
                      onChange={(event) => {
                        setConsentAccepted(
                          event.target.checked,
                        );

                        setError('');
                      }}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-emerald-600"
                    />

                    <span className="text-xs leading-5 text-slate-600">
                      I agree to FinLeaf&apos;s{' '}
                      <a
                        href="/terms"
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold text-emerald-700 hover:underline"
                      >
                        Terms of Service
                      </a>{' '}
                      and{' '}
                      <a
                        href="/privacy-policy"
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold text-emerald-700 hover:underline"
                      >
                        Privacy Policy
                      </a>
                      .
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-4 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition-all hover:-translate-y-0.5 hover:from-emerald-700 hover:to-teal-700 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                  >
                    {isSubmitting ? (
                      <>
                        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        Sending OTP...
                      </>
                    ) : (
                      <>
                        Request secure OTP

                      </>
                    )}
                  </button>


                </form>
              ) : (
                <form
                  onSubmit={handleOtpVerification}
                  noValidate
                >


                  <div className="mt-6">
                    <label className="mb-4 block text-center text-sm font-semibold text-slate-800">
                      Enter the 6-digit OTP
                    </label>

                    <div
                      className="grid grid-cols-6 gap-2 sm:gap-3"
                      onPaste={handleOtpPaste}
                    >
                      {otp.map(
                        (
                          digit,
                          index,
                        ) => (
                          <input
                            key={index}
                            ref={(element) => {
                              otpInputRefs.current[
                                index
                              ] = element;
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
                              handleOtpKeyDown(
                                index,
                                event,
                              )
                            }
                            aria-label={`OTP digit ${index + 1}`}
                            className="h-12 min-w-0 rounded-xl border border-slate-200 bg-white text-center text-lg font-bold text-slate-950 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50 sm:h-14"
                          />
                        ),
                      )}
                    </div>

                    {developmentOtp && (
                      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center">
                        <p className="text-xs text-amber-800">
                          Development OTP:{' '}
                          <strong className="tracking-[0.3em]">
                            {developmentOtp}
                          </strong>
                        </p>
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-4 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition-all hover:-translate-y-0.5 hover:from-emerald-700 hover:to-teal-700 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                  >
                    {isSubmitting ? (
                      <>
                        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        Verifying OTP...
                      </>
                    ) : (
                      <>
                        Verify and continue
                        <span aria-hidden="true">
                          →
                        </span>
                      </>
                    )}
                  </button>

                  <div className="mt-5 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 min-[380px]:flex-row min-[380px]:items-center min-[380px]:justify-between">
                    <button
                      type="button"
                      onClick={handleChangeMobileNumber}
                      disabled={isSubmitting}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 disabled:opacity-50"
                    >
                      Change mobile number
                    </button>

                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={isSubmitting}
                      className="rounded-lg px-2 py-1 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50 hover:text-emerald-800 disabled:opacity-50"
                    >
                      Resend OTP
                    </button>
                  </div>
                </form>
              )}
            </div>

            <footer className="mt-8 border-t border-slate-100 pt-5 text-center">
              <p className="text-xs leading-5 text-slate-400">
                © {new Date().getFullYear()} Fintree Finance Private Limited.
              </p>

              <p className="text-[11px] text-slate-400">
                All rights reserved.
              </p>
            </footer>
          </section>
        </div>
      </div>
    </main>
  );
}