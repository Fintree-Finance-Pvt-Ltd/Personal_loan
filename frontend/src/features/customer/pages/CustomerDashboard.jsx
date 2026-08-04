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
  Clock3,
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
  getCustomerAccessToken,
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
    const hasAccessToken =
      Boolean(
        getCustomerAccessToken(),
      );

    const hasStoredSession =
      Boolean(
        getStoredSession() ||
        localStorage.getItem(
          'customerSession',
        ) ||
        sessionStorage.getItem(
          'customerSession',
        ),
      );

    if (
      !hasAccessToken &&
      !hasStoredSession
    ) {
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

  const handleApplicationButton =
    () => {
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
        <div className="relative min-h-[520px] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-white to-cyan-50" />

          <div className="relative flex min-h-[520px] flex-col items-center justify-center p-8 text-center">
            <div className="grid h-20 w-20 place-items-center rounded-3xl border border-emerald-100 bg-white shadow-lg shadow-emerald-900/5">
              <LoaderCircle className="h-10 w-10 animate-spin text-emerald-600" />
            </div>

            <h2 className="mt-6 text-xl font-bold text-slate-900">
              Preparing your dashboard
            </h2>

            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
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
        <div className="relative overflow-hidden rounded-[28px] border border-red-100 bg-white p-8 text-center shadow-xl shadow-slate-900/5 sm:p-12">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-red-100/60 blur-3xl" />

          <div className="relative">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-red-50 text-red-600">
              <AlertCircle size={30} />
            </div>

            <h3 className="mt-5 text-xl font-bold text-slate-900">
              Unable to load your dashboard
            </h3>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
              {customerError}
            </p>

            <button
              type="button"
              onClick={
                fetchCustomerData
              }
              className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:-translate-y-0.5 hover:bg-emerald-700"
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
    isApproved &&
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

  const completedProfileItems = [
    applicant.mobileNumber,
    applicant.panVerified,
    applicant.emailVerified,
    applicant.fullName,
  ].filter(Boolean).length;

  const profileProgress =
    Math.round(
      (
        completedProfileItems /
        4
      ) *
      100,
    );

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 pb-8">
      {/* Main hero */}
      <section className="relative overflow-hidden rounded-3xl border border-emerald-800/20 bg-gradient-to-r from-[#064e3b] via-[#047857] to-[#0f766e] text-white shadow-lg shadow-emerald-900/10">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-16 -top-20 h-56 w-56 rounded-full bg-emerald-300/15 blur-3xl" />

          <div className="absolute -bottom-20 right-8 h-64 w-64 rounded-full bg-cyan-300/15 blur-3xl" />

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
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-50 backdrop-blur">
                <Sparkles size={13} />
                Welcome back, {firstName}
              </span>

              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-emerald-950/20 px-3 py-1.5 text-[11px] font-semibold text-emerald-100">
                <ShieldCheck size={13} />
                Secure customer portal
              </span>
            </div>

            <div className="mt-4 max-w-2xl">
              <h1 className="text-xl font-bold leading-tight tracking-tight sm:text-2xl">
                {applicationSubmitted
                  ? 'Your loan application is moving forward.'
                  : 'Complete your personal loan application.'}
              </h1>

              <p className="mt-2 max-w-xl text-sm leading-6 text-emerald-50/80">
                {applicationSubmitted
                  ? 'Review your submitted details, track the lender decision and continue the next available step.'
                  : 'Finish your secure digital application and track every step from verification to disbursal.'}
              </p>
            </div>

            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={handleApplicationButton}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-emerald-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-50 hover:shadow-md"
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
            <div className="absolute bottom-0 left-1/2 h-32 w-40 -translate-x-1/2 rounded-full bg-white/10 blur-2xl" />

            <img
              src={
                applicationSubmitted
                  ? '/image/Img_Man.png'
                  : '/image/Img_F.png'
              }
              alt="FinLeaf personal loan assistance"
              className="absolute bottom-[-24px] left-1/2 z-10 max-h-[240px] w-full max-w-[280px] -translate-x-1/2 object-contain object-bottom"
            />
          </div>
        </div>
      </section>

      {/* Status overview */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-100 px-6 py-6 sm:flex-row sm:items-center sm:px-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                Submitted Application
              </p>

              <h2 className="mt-2 text-xl font-bold text-slate-950 sm:text-2xl">
                Application overview
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Review the information shared with the lender.
              </p>
            </div>

            <button
              type="button"
              onClick={
                handleApplicationButton
              }
              className="inline-flex w-fit items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800"
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
          <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <div className="grid min-h-[330px] sm:grid-cols-[1fr_220px]">
              <div className="relative z-10 p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
                    <Landmark
                      size={22}
                    />
                  </div>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
                      Assigned lender
                    </p>

                    <h3 className="mt-1 text-lg font-bold text-slate-950">
                      Lending partner
                    </h3>
                  </div>
                </div>

                <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-base font-bold text-slate-950">
                        {lender}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        Personal Loan Partner
                      </p>
                    </div>

                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-[11px] font-bold text-emerald-700">
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

                <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-emerald-700">
                  <CheckCircle2
                    size={15}
                  />

                  Your application is securely shared with the assigned lender.
                </div>
              </div>

              <div className="relative hidden items-end justify-center overflow-hidden bg-gradient-to-b from-emerald-50 to-cyan-50 px-3 sm:flex">
                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-emerald-100/70 to-transparent" />

                <img
                  src="/image/Img_F.png"
                  alt="FinLeaf lending support"
                  className="relative z-10 max-h-[300px] w-full object-contain object-bottom"
                />
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-100 text-blue-700">
                <ReceiptText
                  size={22}
                />
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">
                  Payment
                </p>

                <h3 className="mt-1 text-lg font-bold text-slate-950">
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

              <div className="border-t border-dashed border-slate-200 pt-4">
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

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3.5">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-700">
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
          className="group flex items-center gap-4 rounded-[24px] border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg"
        >
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
            <Headphones
              size={22}
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-950">
              Need assistance?
            </p>

            <p className="mt-1 text-xs leading-5 text-slate-500">
              Contact our customer support team for help with your loan journey.
            </p>
          </div>

          <ChevronRight
            size={19}
            className="shrink-0 text-slate-400 transition group-hover:translate-x-1 group-hover:text-emerald-600"
          />
        </button>

        <div className="flex items-center gap-4 rounded-[24px] border border-blue-100 bg-blue-50/70 p-5">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-blue-700 shadow-sm">
            <CalendarDays
              size={22}
            />
          </div>

          <div>
            <p className="text-sm font-bold text-blue-950">
              What happens next?
            </p>

            <p className="mt-1 text-xs leading-5 text-blue-800/75">
              Your next action will appear automatically when the lender updates your application.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}


function CompactTrustItem({
  icon: Icon,
  text,
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/8 px-3 py-2 text-xs font-semibold text-emerald-50">
      <Icon size={14} className="text-emerald-200" />
      <span>{text}</span>
    </div>
  );
}
function HeroTrustItem({
  icon: Icon,
  label,
  value,
}) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 px-3.5 py-3 backdrop-blur">
      <div className="flex items-center gap-2 text-emerald-100">
        <Icon size={14} />

        <span className="text-[10px] font-semibold uppercase tracking-wide">
          {label}
        </span>
      </div>

      <p className="mt-1.5 text-xs font-bold text-white">
        {value}
      </p>
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
        'border-emerald-100 bg-gradient-to-br from-white to-emerald-50/70',

      icon:
        'bg-emerald-100 text-emerald-700',
    },

    blue: {
      container:
        'border-blue-100 bg-gradient-to-br from-white to-blue-50/70',

      icon:
        'bg-blue-100 text-blue-700',
    },

    violet: {
      container:
        'border-violet-100 bg-gradient-to-br from-white to-violet-50/70',

      icon:
        'bg-violet-100 text-violet-700',
    },

    amber: {
      container:
        'border-amber-100 bg-gradient-to-br from-white to-amber-50/70',

      icon:
        'bg-amber-100 text-amber-700',
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

        <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold text-slate-500 shadow-sm">
          Live
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
      </div>

      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>

      <p className="mt-2 break-words text-base font-bold leading-6 text-slate-950">
        {value}
      </p>

      <p className="mt-1 text-xs text-slate-500">
        {helper}
      </p>
    </article>
  );
}

function ApplicationJourney({
  customer,
  applicationSubmitted,
  isApproved,
  isDisbursalRequestedOrDisbursed,
}) {
  const profileCompleted =
    Boolean(
      customer?.fullName &&
      customer?.panVerified &&
      customer?.emailVerified,
    );

  const feePaid =
    Boolean(
      customer?.assessmentFeePaid ||
      customer?.latestPaymentStatus ===
      'SUCCESS' ||
      customer?.latestPayment?.status ===
      'SUCCESS',
    );

  const aadhaarCompleted =
    Boolean(
      customer?.aadhaarVerified ||
      customer?.digilockerVerified ||
      [
        'VERIFIED',
        'COMPLETED',
        'SUCCESS',
      ].includes(
        String(
          customer?.aadhaarKycStatus ||
          customer?.digilockerStatus ||
          '',
        ).toUpperCase(),
      ),
    );

  const steps = [
    {
      label:
        'Profile verification',

      description:
        'Mobile, PAN and personal details',

      completed:
        profileCompleted,
    },
    {
      label:
        'Assessment fee',

      description:
        'Fee payment and lender allocation',

      completed:
        feePaid,
    },
    {
      label:
        'Aadhaar KYC',

      description:
        'Secure DigiLocker verification',

      completed:
        aadhaarCompleted,
    },
    {
      label:
        'Application submission',

      description:
        'Application shared for a lender decision',

      completed:
        applicationSubmitted,
    },
    {
      label:
        'Lender approval',

      description:
        'Final lender decision',

      completed:
        isApproved,
    },
    {
      label:
        'Disbursal',

      description:
        'Loan amount transfer',

      completed:
        isDisbursalRequestedOrDisbursed,
    },
  ];

  const firstIncomplete =
    steps.findIndex(
      (step) =>
        !step.completed,
    );

  return (
    <div className="space-y-1">
      {steps.map(
        (
          step,
          index,
        ) => {
          const isActive =
            index ===
            firstIncomplete;

          return (
            <div
              key={step.label}
              className={`relative flex gap-4 rounded-2xl px-3 py-3 transition ${isActive
                ? 'bg-blue-50/70'
                : ''
                }`}
            >
              <div className="relative flex flex-col items-center">
                <div
                  className={`relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full border-4 border-white text-xs font-bold shadow-sm ${step.completed
                    ? 'bg-emerald-600 text-white'
                    : isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-400'
                    }`}
                >
                  {step.completed ? (
                    <CheckCircle2
                      size={17}
                    />
                  ) : (
                    index + 1
                  )}
                </div>

                {index <
                  steps.length -
                  1 && (
                    <div
                      className={`mt-1 h-8 w-0.5 ${step.completed
                        ? 'bg-emerald-300'
                        : 'bg-slate-200'
                        }`}
                    />
                  )}
              </div>

              <div className="min-w-0 flex-1 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className={`text-sm font-bold ${step.completed
                      ? 'text-slate-900'
                      : isActive
                        ? 'text-blue-900'
                        : 'text-slate-500'
                      }`}
                  >
                    {step.label}
                  </p>

                  {isActive && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">
                      Current
                    </span>
                  )}
                </div>

                <p className="mt-1 text-xs text-slate-500">
                  {step.description}
                </p>
              </div>
            </div>
          );
        },
      )}
    </div>
  );
}

function ProfileStatusRow({
  label,
  completed,
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-3">
      <span className="text-xs font-semibold text-slate-600">
        {label}
      </span>

      <span
        className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${completed
          ? 'text-emerald-700'
          : 'text-slate-400'
          }`}
      >
        {completed && (
          <CheckCircle2
            size={14}
          />
        )}

        {completed
          ? 'Completed'
          : 'Pending'}
      </span>
    </div>
  );
}

function MiniInfoCard({
  label,
  value,
}) {
  return (
    <div className="rounded-xl bg-white p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-1.5 break-words text-xs font-bold text-slate-900">
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
    <article className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 transition hover:border-emerald-200 hover:bg-white hover:shadow-lg hover:shadow-slate-900/5">
      <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-emerald-700 shadow-sm">
          <Icon size={19} />
        </div>

        <div>
          <h3 className="text-sm font-bold text-slate-950">
            {title}
          </h3>

          {subtitle && (
            <p className="mt-0.5 text-[11px] text-slate-500">
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
      <span className="flex items-center gap-1.5 text-xs leading-5 text-slate-500">
        {Icon && (
          <Icon
            size={13}
            className="shrink-0"
          />
        )}

        {label}
      </span>

      <span
        className={`max-w-[62%] break-words text-right leading-5 text-slate-950 ${prominent
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

function ApplicationStatusBadge({
  status,
}) {
  const formattedStatus =
    formatStatus(status);

  const normalized =
    String(
      status || '',
    ).toUpperCase();

  let style =
    'bg-amber-50 text-amber-700 border-amber-100';

  if (
    [
      'LENDER_APPROVED',
      'APPROVED',
      'ELIGIBLE',
      'DISBURSED',
    ].includes(normalized)
  ) {
    style =
      'bg-emerald-50 text-emerald-700 border-emerald-100';
  }

  if (
    [
      'LENDER_REJECTED',
      'REJECTED',
      'FAILED',
    ].includes(normalized)
  ) {
    style =
      'bg-red-50 text-red-700 border-red-100';
  }

  if (
    [
      'PROCESSING',
      'APPLICATION_SUBMITTED',
      'SUBMITTED_TO_LENDER',
      'DISBURSAL_PROCESSING',
    ].includes(normalized)
  ) {
    style =
      'bg-blue-50 text-blue-700 border-blue-100';
  }

  return (
    <span
      className={`inline-flex w-fit items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold ${style}`}
    >
      <span className="h-2 w-2 rounded-full bg-current opacity-70" />

      {formattedStatus}
    </span>
  );
}

function getInitials(name) {
  if (!name) {
    return 'FL';
  }

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(
      (part) =>
        part.charAt(0),
    )
    .join('')
    .toUpperCase();
}

function maskMobile(value) {
  const mobile =
    String(value || '');

  if (
    mobile.length <
    6
  ) {
    return mobile;
  }

  return `${mobile.slice(
    0,
    2,
  )}XXXX${mobile.slice(
    -4,
  )}`;
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