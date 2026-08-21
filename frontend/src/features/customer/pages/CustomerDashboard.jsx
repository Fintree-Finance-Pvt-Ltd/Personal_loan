import {
  useEffect,
  useState,
} from 'react';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  FileText,
  Headphones,
  IndianRupee,
  Landmark,
  LoaderCircle,
  Mail,
  MapPin,
  Phone,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from 'lucide-react';
import {
  useNavigate,
} from 'react-router-dom';
import {
  customerApi,
  doCustomerRefresh,
  getCustomerAccessToken,
  resumeApplication,
} from '../customerApi';

export default function CustomerDashboard() {
  const navigate =
    useNavigate();

  const [
    backendCustomer,
    setBackendCustomer,
  ] = useState(null);

  const [
    isLoadingCustomer,
    setIsLoadingCustomer,
  ] = useState(true);

  const [
    customerError,
    setCustomerError,
  ] = useState('');

  const storedSession =
    getStoredSession();

  const customerId =
    storedSession?.customerId ||
    null;

  const fetchCustomerData =
    async () => {
      if (!customerId) {
        return;
      }

      setIsLoadingCustomer(
        true,
      );

      setCustomerError('');

      try {
        const customerData =
          await customerApi.getCustomerById(
            customerId,
          );

        setBackendCustomer(
          customerData,
        );
      } catch (error) {
        console.error(
          'Failed to fetch customer data:',
          error,
        );

        setCustomerError(
          error instanceof Error
            ? error.message
            : 'Unable to load customer details.',
        );
      } finally {
        setIsLoadingCustomer(
          false,
        );
      }
    };

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      let hasAccessToken =
        Boolean(
          getCustomerAccessToken(),
        );

      // A hard page refresh always wipes the in-memory access token.
      // Before treating that as "logged out", try a silent refresh
      // against the httpOnly cookie -- the session may still be valid
      // even if no local marker survived the reload.
      if (!hasAccessToken) {
        try {
          await doCustomerRefresh();
          hasAccessToken =
            Boolean(
              getCustomerAccessToken(),
            );
        } catch {
          hasAccessToken = false;
        }
      }

      if (cancelled) return;

      if (!hasAccessToken) {
        localStorage.removeItem(
          'customerSession',
        );

        sessionStorage.removeItem(
          'customerSession',
        );

        navigate(
          '/customer/login',
          {
            replace: true,
          },
        );

        return;
      }

      if (
        !customerId &&
        hasAccessToken
      ) {
      setIsLoadingCustomer(
        true,
      );

      setCustomerError('');

      customerApi
        .getCustomerMe()
        .then(
          (
            customerData,
          ) => {
            setBackendCustomer(
              customerData,
            );
          },
        )
        .catch(
          (error) => {
            console.error(
              'Failed to fetch customer data:',
              error,
            );

            setCustomerError(
              error instanceof
                Error
                ? error.message
                : 'Unable to load customer details.',
            );
          },
        )
        .finally(() => {
          setIsLoadingCustomer(
            false,
          );
        });

      return;
      }

      fetchCustomerData();
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [
    customerId,
    navigate,
  ]);

  const hasBackendProgress =
    Boolean(
      backendCustomer?.panVerified ||
      backendCustomer?.emailVerified ||
      backendCustomer?.fullName ||
      (
        backendCustomer?.onboardingStatus &&
        backendCustomer.onboardingStatus !==
        'MOBILE_VERIFIED'
      ),
    );

  const mobileNumber =
    backendCustomer?.mobileNumber ||
    storedSession?.mobileNumber ||
    '';

  const applicationSubmitted =
    Boolean(
      backendCustomer?.latestApplicationId,
    );

  const applicationNumber =
    backendCustomer?.latestApplicationId
      ? `PL-APP-${backendCustomer.latestApplicationId}`
      : '';

  const applicant =
    backendCustomer || {};

  const lender =
    'Fintree Finance Private Limited';

  const applicationStatus =
    backendCustomer?.eligibilityStatus ||
    'SUBMITTED_TO_LENDER';

  const submittedAt =
    backendCustomer?.updatedAt ||
    '';

  const feeDetails = null;

  const hasLan =
    Boolean(
      backendCustomer?.latestLan,
    );

  const isApproved =
    backendCustomer?.onboardingStatus ===
    'LENDER_APPROVED';

  const isDisbursalRequestedOrDisbursed =
    backendCustomer?.latestDisbursalStatus ===
    'DISBURSAL_REQUESTED' ||
    backendCustomer?.latestDisbursalStatus ===
    'DISBURSAL_PROCESSING' ||
    backendCustomer?.latestDisbursalStatus ===
    'DISBURSED' ||
    backendCustomer?.latestLoanStatus ===
    'DISBURSED';

  // onboardingStatus never advances past 'LENDER_APPROVED' in production (nothing sets
  // it to 'DISBURSED'), so isApproved stays true forever even after the loan is fully
  // repaid — this flag catches that case explicitly before the stale isApproved branch
  // would otherwise send a repeat customer back into their old, closed loan's
  // post-approval journey.
  const isFullyPaidRepeatCustomer =
    backendCustomer?.latestLoanStatus ===
    'FULLY_PAID';

  const handleApplicationButton =
    async () => {
      if (
        isFullyPaidRepeatCustomer
      ) {
        await resumeApplication(
          customerId,
        );
        navigate(
          '/customer/application',
        );
        return;
      }
      if (
        isApproved &&
        hasLan
      ) {
        if (
          isDisbursalRequestedOrDisbursed
        ) {
          navigate(
            `/customer/loan/${backendCustomer.latestLan}/details`,
          );
        } else {
          navigate(
            `/customer/loan/${backendCustomer.latestLan}/post-approval`,
          );
        }
      } else {
        navigate(
          '/customer/application',
        );
      }
    };

  if (isLoadingCustomer) {
    return (
      <div className="mx-auto w-full max-w-7xl px-1">
        <div className="relative min-h-[520px] overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-br from-brand-50 via-white to-info-50" />

          <div className="relative flex min-h-[520px] flex-col items-center justify-center p-8 text-center">
            <div className="grid h-20 w-20 place-items-center rounded-3xl border border-brand-100 bg-white shadow-lg shadow-brand-900/5">
              <LoaderCircle className="h-10 w-10 animate-spin text-brand-600" />
            </div>

            <h2 className="mt-6 text-xl font-bold text-neutral-900">
              Preparing your dashboard
            </h2>

            <p className="mt-2 max-w-sm text-sm leading-6 text-neutral-500">
              We are securely loading your application and loan details.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (customerError) {
    return (
      <div className="mx-auto w-full max-w-7xl px-1">
        <div className="relative overflow-hidden rounded-[28px] border border-danger-100 bg-white p-8 text-center shadow-xl shadow-neutral-900/5 sm:p-12">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-danger-100/60 blur-3xl" />

          <div className="relative">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-danger-50 text-danger-600">
              <AlertCircle size={30} />
            </div>

            <h3 className="mt-5 text-xl font-bold text-neutral-900">
              Unable to load your dashboard
            </h3>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-600">
              {customerError}
            </p>

            <button
              type="button"
              onClick={
                fetchCustomerData
              }
              className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition hover:-tranneutral-y-0.5 hover:bg-brand-700"
            >
              <RotateCcw
                size={17}
              />
              Retry loading
            </button>
          </div>
        </div>
      </div>
    );
  }

  const buttonLabel =
    isFullyPaidRepeatCustomer
      ? 'Apply for a New Loan'
      : isApproved &&
        hasLan
        ? isDisbursalRequestedOrDisbursed
          ? 'View Loan Details'
          : 'Continue Approved Loan Journey'
        : applicationSubmitted
          ? 'View Application'
          : hasBackendProgress
            ? 'Continue Application'
            : 'Start Application';

  const firstName =
    applicant.fullName
      ?.trim()
      ?.split(/\s+/)?.[0] ||
    'Customer';

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 pb-8">
      {/* Main hero */}
      <section className="relative overflow-hidden rounded-3xl border border-brand-800/20 bg-gradient-to-r from-[#064e3b] via-[#047857] to-[#0f766e] text-white shadow-lg shadow-brand-900/10">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-16 -top-20 h-56 w-56 rounded-full bg-brand-300/15 blur-3xl" />

          <div className="absolute -bottom-20 right-8 h-64 w-64 rounded-full bg-info-300/15 blur-3xl" />

          <div
            className="absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.65) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.65) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
        </div>

        <div className="relative grid items-center gap-5 px-5 py-5 sm:px-6 sm:py-6 lg:grid-cols-[1fr_240px] lg:px-7 lg:py-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-brand-50 backdrop-blur">
                <Sparkles size={13} />
                Welcome back, {firstName}
              </span>

              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-brand-950/20 px-3 py-1.5 text-[11px] font-semibold text-brand-100">
                <ShieldCheck size={13} />
                Secure customer portal
              </span>
            </div>

            <div className="mt-4 max-w-2xl">
              <h1 className="text-xl font-bold leading-tight tracking-tight sm:text-2xl">
                {isFullyPaidRepeatCustomer
                  ? 'Your previous loan is fully repaid.'
                  : applicationSubmitted
                    ? 'Your loan application is moving forward.'
                    : 'Complete your personal loan application.'}
              </h1>

              <p className="mt-2 max-w-xl text-sm leading-6 text-brand-50/80">
                {isFullyPaidRepeatCustomer
                  ? 'Congratulations on clearing your loan! Start a new application whenever you need to borrow again.'
                  : applicationSubmitted
                    ? 'Review your submitted details, track the lender decision and continue the next available step.'
                    : 'Finish your secure digital application and track every step from verification to disbursal.'}
              </p>
            </div>

            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={handleApplicationButton}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-brand-800 shadow-sm transition hover:-tranneutral-y-0.5 hover:bg-brand-50 hover:shadow-md"
              >
                {buttonLabel}
                <ArrowRight size={16} />
              </button>

              <button
                type="button"
                onClick={() =>
                  navigate('/customer/support')
                }
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15"
              >
                <Headphones size={16} />
                Get Support
              </button>
            </div>


          </div>

          <div className="relative hidden h-full min-h-[190px] lg:block">
            <div className="absolute bottom-0 left-1/2 h-32 w-40 -tranneutral-x-1/2 rounded-full bg-white/10 blur-2xl" />

            <img
              src={
                applicationSubmitted
                  ? '/image/Img_Man.png'
                  : '/image/Img_F.png'
              }
              alt="FinLeaf personal loan assistance"
              className="absolute bottom-[-24px] left-1/2 z-10 max-h-[240px] w-full max-w-[280px] -tranneutral-x-1/2 object-contain object-bottom"
            />
          </div>
        </div>
      </section>

      {/* Status overview */}
      <section className="stagger-children grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardMetricCard
          icon={FileText}
          label="Application"
          value={
            applicationSubmitted
              ? applicationNumber
              : 'Not submitted'
          }
          helper={
            applicationSubmitted
              ? 'Application created'
              : 'Start your application'
          }
          tone="emerald"
        />

        <DashboardMetricCard
          icon={BadgeCheck}
          label="Current Status"
          value={formatStatus(
            backendCustomer?.onboardingStatus ||
            applicationStatus,
          )}
          helper="Backend-confirmed status"
          tone="blue"
        />

        <DashboardMetricCard
          icon={Landmark}
          label="Loan Account"
          value={
            hasLan
              ? backendCustomer.latestLan
              : 'Not generated'
          }
          helper={
            hasLan
              ? 'LAN available'
              : 'Generated after approval'
          }
          tone="violet"
        />

        <DashboardMetricCard
          icon={WalletCards}
          label="Disbursal"
          value={
            formatStatus(
              backendCustomer?.latestDisbursalStatus ||
              backendCustomer?.latestLoanStatus ||
              'NOT_STARTED',
            )
          }
          helper="Latest disbursal stage"
          tone="amber"
        />
      </section>

      {/* Application details */}
      {applicationSubmitted && (
        <section className="overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-4 border-b border-neutral-100 px-6 py-6 sm:flex-row sm:items-center sm:px-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">
                Submitted Application
              </p>

              <h2 className="mt-2 text-xl font-bold text-neutral-950 sm:text-2xl">
                Application overview
              </h2>

              <p className="mt-1 text-sm text-neutral-500">
                Review the information shared with the lender.
              </p>
            </div>

            <button
              type="button"
              onClick={
                handleApplicationButton
              }
              className="inline-flex w-fit items-center gap-2 rounded-xl bg-neutral-950 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-neutral-800"
            >
              View full journey

              <ArrowRight
                size={15}
              />
            </button>
          </div>

          <div className="grid gap-5 p-6 sm:p-8 lg:grid-cols-2 xl:grid-cols-4">
            <ApplicationDetailCard
              icon={FileText}
              title="Application"
              subtitle="Reference and status"
            >
              <DetailRow
                label="Application Number"
                value={
                  applicationNumber
                }
              />

              <DetailRow
                label="Current Status"
                value={formatStatus(
                  applicationStatus,
                )}
              />

              <DetailRow
                label="Submitted On"
                value={formatDateTime(
                  submittedAt,
                )}
              />

              <DetailRow
                label="Assigned Lender"
                value={lender}
              />
            </ApplicationDetailCard>

            <ApplicationDetailCard
              icon={CircleUserRound}
              title="Personal Details"
              subtitle="Verified identity information"
            >
              <DetailRow
                label="Applicant Name"
                value={
                  applicant.fullName
                }
              />

              <DetailRow
                label="PAN Number"
                value={maskPan(
                  applicant.panNumber,
                )}
              />

              <DetailRow
                label="Date of Birth"
                value={formatDate(
                  applicant.dateOfBirth,
                )}
              />

              <DetailRow
                label="Gender"
                value={formatStatus(
                  applicant.gender,
                )}
              />
            </ApplicationDetailCard>

            <ApplicationDetailCard
              icon={Phone}
              title="Communication"
              subtitle="Contact information"
            >
              <DetailRow
                label="Mobile Number"
                value={
                  mobileNumber
                    ? `+91 ${mobileNumber}`
                    : 'Not available'
                }
                icon={Phone}
              />

              <DetailRow
                label="Email Address"
                value={
                  applicant.email
                }
                icon={Mail}
              />

              <DetailRow
                label="Residential PIN"
                value={
                  applicant.pincode ||
                  applicant.residentialPincode
                }
                icon={MapPin}
              />
            </ApplicationDetailCard>

            <ApplicationDetailCard
              icon={BriefcaseBusiness}
              title="Professional"
              subtitle="Income and employment"
            >
              <DetailRow
                label="Employment Type"
                value={formatStatus(
                  applicant.employmentType,
                )}
              />

              <DetailRow
                label={
                  applicant.employmentType ===
                    'SELF_EMPLOYED'
                    ? 'Business Name'
                    : 'Company Name'
                }
                value={
                  applicant.employmentType ===
                    'SELF_EMPLOYED'
                    ? applicant.businessName
                    : applicant.companyName
                }
              />

              <DetailRow
                label="Monthly Income"
                value={formatCurrency(
                  applicant.monthlyIncome,
                )}
                icon={IndianRupee}
              />

              <DetailRow
                label="Work PIN Code"
                value={
                  applicant.workPincode
                }
                icon={MapPin}
              />
            </ApplicationDetailCard>
          </div>
        </section>
      )}

      {/* Lender and fee */}
      {applicationSubmitted && (
        <section className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="relative overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-sm">
            <div className="grid min-h-[330px] sm:grid-cols-[1fr_220px]">
              <div className="relative z-10 p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-100 text-brand-700">
                    <Landmark
                      size={22}
                    />
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-700">
                      Assigned lender
                    </p>

                    <h3 className="mt-1 text-lg font-bold text-neutral-950">
                      Lending partner
                    </h3>
                  </div>
                </div>

                <div className="mt-7 rounded-2xl border border-neutral-200 bg-neutral-50/70 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-base font-bold text-neutral-950">
                        {lender}
                      </p>

                      <p className="mt-1 text-xs text-neutral-500">
                        Personal Loan Partner
                      </p>
                    </div>

                    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1.5 text-[11px] font-bold text-brand-700">
                      <BadgeCheck
                        size={14}
                      />
                      Assigned
                    </span>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <MiniInfoCard
                      label="Application"
                      value={
                        applicationNumber
                      }
                    />

                    <MiniInfoCard
                      label="Current stage"
                      value={formatStatus(
                        backendCustomer?.onboardingStatus ||
                        applicationStatus,
                      )}
                    />
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-brand-700">
                  <CheckCircle2
                    size={15}
                  />

                  Your application is securely shared with the assigned lender.
                </div>
              </div>

              <div className="relative hidden items-end justify-center overflow-hidden bg-gradient-to-b from-brand-50 to-info-50 px-3 sm:flex">
                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-brand-100/70 to-transparent" />

                <img
                  src="/image/Img_F.png"
                  alt="FinLeaf lending support"
                  className="relative z-10 max-h-[300px] w-full object-contain object-bottom"
                />
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-neutral-200 bg-white p-6 shadow-sm sm:p-7">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-info-100 text-info-700">
                <ReceiptText
                  size={22}
                />
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-info-700">
                  Payment
                </p>

                <h3 className="mt-1 text-lg font-bold text-neutral-950">
                  Assessment fee
                </h3>
              </div>
            </div>

            <div className="mt-7 space-y-4">
              <DetailRow
                label="Base Fee"
                value={
                  feeDetails
                    ? formatCurrency(
                      feeDetails.baseFee,
                      true,
                    )
                    : '₹199.00'
                }
              />

              <DetailRow
                label="GST"
                value={
                  feeDetails
                    ? formatCurrency(
                      feeDetails.gst,
                      true,
                    )
                    : '₹35.82'
                }
              />

              <div className="border-t border-dashed border-neutral-200 pt-4">
                <DetailRow
                  label="Total Paid"
                  value={
                    feeDetails
                      ? formatCurrency(
                        feeDetails.total,
                        true,
                      )
                      : '₹234.82'
                  }
                  prominent
                />
              </div>

              <div className="rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3.5">
                <div className="flex items-center gap-2 text-xs font-bold text-brand-700">
                  <CheckCircle2
                    size={16}
                  />

                  Payment completed successfully
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Help cards */}
      <section className="grid gap-5 md:grid-cols-2">
        <button
          type="button"
          onClick={() =>
            navigate(
              '/customer/support',
            )
          }
          className="group flex items-center gap-4 rounded-[24px] border border-neutral-200 bg-white p-5 text-left shadow-sm transition hover:-tranneutral-y-0.5 hover:border-brand-200 hover:shadow-lg"
        >
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-100 text-brand-700">
            <Headphones
              size={22}
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-neutral-950">
              Need assistance?
            </p>

            <p className="mt-1 text-xs leading-5 text-neutral-500">
              Contact our customer support team for help with your loan journey.
            </p>
          </div>

          <ChevronRight
            size={19}
            className="shrink-0 text-neutral-400 transition group-hover:tranneutral-x-1 group-hover:text-brand-600"
          />
        </button>

        <div className="flex items-center gap-4 rounded-[24px] border border-info-100 bg-info-50/70 p-5">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-info-700 shadow-sm">
            <CalendarDays
              size={22}
            />
          </div>

          <div>
            <p className="text-sm font-bold text-info-950">
              What happens next?
            </p>

            <p className="mt-1 text-xs leading-5 text-info-800/75">
              Your next action will appear automatically when the lender updates your application.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}


function DashboardMetricCard({
  icon: Icon,
  label,
  value,
  helper,
  tone,
}) {
  const tones = {
    emerald: {
      container:
        'border-brand-100 bg-gradient-to-br from-white to-brand-50/70',

      icon:
        'bg-brand-100 text-brand-700',
    },

    blue: {
      container:
        'border-info-100 bg-gradient-to-br from-white to-info-50/70',

      icon:
        'bg-info-100 text-info-700',
    },

    violet: {
      container:
        'border-accent-100 bg-gradient-to-br from-white to-accent-50/70',

      icon:
        'bg-accent-100 text-accent-700',
    },

    amber: {
      container:
        'border-caution-100 bg-gradient-to-br from-white to-caution-50/70',

      icon:
        'bg-caution-100 text-caution-700',
    },
  };

  const selectedTone =
    tones[tone] ||
    tones.emerald;

  return (
    <article
      className={`rounded-[24px] border p-5 shadow-sm ${selectedTone.container}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${selectedTone.icon}`}
        >
          <Icon size={20} />
        </div>

        <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold text-neutral-500 shadow-sm">
          Live
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
        </span>
      </div>

      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
        {label}
      </p>

      <p className="mt-2 break-words text-base font-bold leading-6 text-neutral-950">
        {value}
      </p>

      <p className="mt-1 text-xs text-neutral-500">
        {helper}
      </p>
    </article>
  );
}

function MiniInfoCard({
  label,
  value,
}) {
  return (
    <div className="rounded-xl bg-white p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </p>

      <p className="mt-1.5 break-words text-xs font-bold text-neutral-900">
        {value ||
          'Not available'}
      </p>
    </div>
  );
}

function getStoredSession() {
  try {
    return JSON.parse(
      localStorage.getItem(
        'customerSession',
      ) || 'null',
    );
  } catch {
    return null;
  }
}

function ApplicationDetailCard({
  icon: Icon,
  title,
  subtitle,
  children,
}) {
  return (
    <article className="rounded-2xl border border-neutral-200 bg-neutral-50/50 p-5 transition hover:border-brand-200 hover:bg-white hover:shadow-lg hover:shadow-neutral-900/5">
      <div className="flex items-center gap-3 border-b border-neutral-200 pb-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-brand-700 shadow-sm">
          <Icon size={19} />
        </div>

        <div>
          <h3 className="text-sm font-bold text-neutral-950">
            {title}
          </h3>

          {subtitle && (
            <p className="mt-0.5 text-[11px] text-neutral-500">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {children}
      </div>
    </article>
  );
}

function DetailRow({
  label,
  value,
  icon: Icon,
  prominent = false,
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="flex items-center gap-1.5 text-xs leading-5 text-neutral-500">
        {Icon && (
          <Icon
            size={13}
            className="shrink-0"
          />
        )}

        {label}
      </span>

      <span
        className={`max-w-[62%] break-words text-right leading-5 text-neutral-950 ${prominent
          ? 'text-base font-bold'
          : 'text-xs font-bold sm:text-sm'
          }`}
      >
        {value ||
          'Not provided'}
      </span>
    </div>
  );
}

function maskPan(panNumber) {
  if (
    !panNumber ||
    panNumber.length !==
    10
  ) {
    return (
      panNumber ||
      'Not provided'
    );
  }

  return `${panNumber.slice(
    0,
    2,
  )}***${panNumber.slice(
    5,
    9,
  )}${panNumber.slice(
    -1,
  )}`;
}

function formatStatus(value) {
  if (!value) {
    return 'Not available';
  }

  return String(value)
    .toLowerCase()
    .split('_')
    .map(
      (word) =>
        word
          .charAt(0)
          .toUpperCase() +
        word.slice(1),
    )
    .join(' ');
}

function formatDate(dateValue) {
  if (!dateValue) {
    return 'Not provided';
  }

  const date =
    new Date(dateValue);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return dateValue;
  }

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    },
  ).format(date);
}

function formatDateTime(
  dateValue,
) {
  if (!dateValue) {
    return 'Not available';
  }

  const date =
    new Date(dateValue);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return dateValue;
  }

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
  ).format(date);
}

function formatCurrency(
  value,
  showDecimal = false,
) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return 'Not provided';
  }

  return new Intl.NumberFormat(
    'en-IN',
    {
      style: 'currency',
      currency: 'INR',

      minimumFractionDigits:
        showDecimal
          ? 2
          : 0,

      maximumFractionDigits:
        showDecimal
          ? 2
          : 0,
    },
  ).format(
    Number(value),
  );
}