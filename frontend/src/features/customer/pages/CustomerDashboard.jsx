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

  // The real application reference, not a fabricated "PL-APP-{id}" string built from
  // the raw numeric row ID — that display string never matched the actual
  // applicationNumber shown anywhere else (admin panels, KFS documents, support
  // records), which would have confused customers referencing it to support.
  const applicationNumber =
    backendCustomer?.latestApplicationReference ||
    (backendCustomer?.latestApplicationId
      ? `PL-APP-${backendCustomer.latestApplicationId}`
      : '');

  const applicant =
    backendCustomer || {};

  // The actual allocated lender, not a hardcoded literal — this platform allocates
  // across multiple lenders (see the MLM allocation engine), so a customer allocated
  // to a different lender would have seen the wrong name here.
  const lender =
    backendCustomer?.allocatedLenderName ||
    backendCustomer?.allocatedLenderCode ||
    'Lending Partner';

  const applicationStatus =
    backendCustomer?.eligibilityStatus ||
    'SUBMITTED_TO_LENDER';

  const submittedAt =
    backendCustomer?.updatedAt ||
    '';

  // Was hardcoded to null, so the render below always fell through to hardcoded
  // fallback figures ("₹199.00" etc.) for every customer regardless of their actual
  // assessment fee — getMe() already returns the real per-application amounts here.
  const feeDetails =
    backendCustomer?.assessmentFee
      ? {
        baseFee: backendCustomer.assessmentFee.baseAmount,
        gst: backendCustomer.assessmentFee.gstAmount,
        total: backendCustomer.assessmentFee.totalAmount,
      }
      : null;
  const assessmentFeePaid = Boolean(backendCustomer?.assessmentFeePaid);

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
    <div className="mx-auto w-full max-w-[1480px] space-y-5 px-0 pb-8">
      {/* Premium dashboard header */}
      <section className="relative overflow-hidden rounded-[30px] border border-slate-200 bg-[#f8fafc] shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -right-24 -top-32 h-96 w-96 rounded-full bg-emerald-200/40 blur-3xl" />
          <div className="absolute -bottom-40 left-1/3 h-80 w-80 rounded-full bg-cyan-200/30 blur-3xl" />
          <div className="absolute inset-y-0 right-0 w-[45%] bg-gradient-to-l from-white/90 to-transparent" />
        </div>

        <div className="relative grid min-h-[310px] lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="flex flex-col justify-center px-6 py-7 sm:px-8 lg:px-11 lg:py-9">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3.5 py-2 text-[11px] font-bold text-white shadow-sm">
                <Sparkles size={13} />
                Welcome back, {firstName}
              </span>

              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-[11px] font-bold text-emerald-700">
                <ShieldCheck size={13} />
                Secure & protected
              </span>
            </div>

            <div className="mt-6 max-w-2xl">
              {/* <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-emerald-600">
                FinLeaf Personal Finance
              </p> */}

              <h1 className="mt-2 text-3xl font-black leading-[1.08] tracking-[-0.035em] text-slate-950 sm:text-4xl">
                {isFullyPaidRepeatCustomer
                  ? 'Your previous loan is fully repaid.'
                  : applicationSubmitted
                    ? 'Your loan application is moving forward.'
                    : 'Your personal loan starts here.'}
              </h1>

              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500 sm:text-[15px]">
                {isFullyPaidRepeatCustomer
                  ? 'Congratulations on clearing your loan! Start a new application whenever you need to borrow again.'
                  : applicationSubmitted
                    ? 'Your application is safely with the lender. Continue whenever your next action is ready.'
                    : 'Complete your digital application securely and keep track of every important update.'}
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={handleApplicationButton}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-extrabold text-white shadow-[0_10px_24px_rgba(5,150,105,0.22)] transition hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-[0_14px_28px_rgba(5,150,105,0.28)]"
              >
                {buttonLabel}
                <ArrowRight size={16} />
              </button>

              <button
                type="button"
                onClick={() => navigate('/customer/support')}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50"
              >
                <Headphones size={16} />
                Get Support
              </button>
            </div>
          </div>

          <div className="relative hidden min-h-[310px] items-end justify-center overflow-hidden lg:flex">
            <div className="absolute bottom-0 right-8 h-72 w-72 rounded-full bg-emerald-100/70 blur-3xl" />
            <div className="absolute bottom-0 right-12 h-44 w-72 rounded-t-[100%] bg-gradient-to-t from-emerald-100/80 to-transparent" />

            <img
              src={
                applicationSubmitted
                  ? '/image/Img_Man.png'
                  : '/image/Img_F.png'
              }
              alt="FinLeaf personal loan assistance"
              className="relative z-10 mt-auto h-[285px] w-[330px] translate-y-4 object-contain object-bottom"
            />

          </div>
        </div>
      </section>

      {/* Compact status strip */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardMetricCard
          icon={FileText}
          label="Application"
          value={applicationSubmitted ? applicationNumber : 'Not submitted'}
          helper={applicationSubmitted ? 'Application created' : 'Start your application'}
          tone="emerald"
        />

        <DashboardMetricCard
          icon={BadgeCheck}
          label="Current Status"
          value={formatStatus(backendCustomer?.onboardingStatus || applicationStatus)}
          helper="Backend-confirmed status"
          tone="blue"
        />

        <DashboardMetricCard
          icon={Landmark}
          label="Loan Account"
          value={hasLan ? backendCustomer.latestLan : 'Not generated'}
          helper={hasLan ? 'LAN available' : 'Generated after approval'}
          tone="violet"
        />

        <DashboardMetricCard
          icon={WalletCards}
          label="Disbursal"
          value={formatStatus(backendCustomer?.latestDisbursalStatus || backendCustomer?.latestLoanStatus || 'NOT_STARTED')}
          helper="Latest disbursal stage"
          tone="amber"
        />
      </section>

      {/* Application overview */}
      {applicationSubmitted && (
        <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_12px_35px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-emerald-600">
                  Application
                </p>
              </div>

              <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">
                Your submitted details
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                A clear view of the information currently associated with your application.
              </p>
            </div>

            <button
              type="button"
              onClick={handleApplicationButton}
              className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-extrabold text-slate-800 transition hover:border-slate-300 hover:bg-slate-100"
            >
              View application
              <ArrowRight size={15} />
            </button>
          </div>

          <div className="grid gap-px bg-slate-100 md:grid-cols-2 xl:grid-cols-4">
            <ApplicationDetailCard
              icon={FileText}
              title="Application"
              subtitle="Reference and status"
            >
              <DetailRow label="Application Number" value={applicationNumber} />
              <DetailRow label="Current Status" value={formatStatus(applicationStatus)} />
              <DetailRow label="Submitted On" value={formatDateTime(submittedAt)} />
              <DetailRow label="Assigned Lender" value={lender} />
            </ApplicationDetailCard>

            <ApplicationDetailCard
              icon={CircleUserRound}
              title="Personal Details"
              subtitle="Verified identity information"
            >
              <DetailRow label="Applicant Name" value={applicant.fullName} />
              <DetailRow label="PAN Number" value={maskPan(applicant.panNumber)} />
              <DetailRow label="Date of Birth" value={formatDate(applicant.dateOfBirth)} />
              <DetailRow label="Gender" value={formatStatus(applicant.gender)} />
            </ApplicationDetailCard>

            <ApplicationDetailCard
              icon={Phone}
              title="Communication"
              subtitle="Contact information"
            >
              <DetailRow
                label="Mobile Number"
                value={mobileNumber ? `+91 ${mobileNumber}` : 'Not available'}
                icon={Phone}
              />
              <DetailRow label="Email Address" value={applicant.email} icon={Mail} />
              <DetailRow
                label="Residential PIN"
                value={applicant.pincode || applicant.residentialPincode}
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
                value={formatStatus(applicant.employmentType)}
              />
              <DetailRow
                label={applicant.employmentType === 'SELF_EMPLOYED' ? 'Business Name' : 'Company Name'}
                value={
                  applicant.employmentType === 'SELF_EMPLOYED'
                    ? applicant.businessName
                    : applicant.companyName
                }
              />
              <DetailRow
                label="Monthly Income"
                value={formatCurrency(applicant.monthlyIncome)}
                icon={IndianRupee}
              />
              <DetailRow label="Work PIN Code" value={applicant.workPincode} icon={MapPin} />
            </ApplicationDetailCard>
          </div>
        </section>
      )}

      {/* Lender + payment workspace */}
      {applicationSubmitted && (
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_350px]">
          <div className="relative overflow-hidden rounded-[26px] border border-slate-200 bg-slate-950 text-white shadow-[0_15px_40px_rgba(15,23,42,0.12)]">
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl" />
            <div className="absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />

            <div className="relative grid min-h-[315px] sm:grid-cols-[minmax(0,1fr)_230px]">
              <div className="p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-emerald-300 ring-1 ring-white/10">
                    <Landmark size={21} />
                  </div>

                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-300">
                      Lending partner
                    </p>
                    <h3 className="mt-1 text-lg font-black text-white">
                      {lender}
                    </h3>
                  </div>
                </div>

                <div className="mt-7 grid gap-3 sm:grid-cols-2">
                  <MiniInfoCard label="Application" value={applicationNumber} />
                  <MiniInfoCard
                    label="Current stage"
                    value={formatStatus(backendCustomer?.onboardingStatus || applicationStatus)}
                  />
                </div>

                <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-400/10 text-emerald-300">
                      <CheckCircle2 size={17} />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-white">Application securely shared</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        Your application is with the assigned lending partner.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative hidden overflow-hidden sm:flex sm:items-end sm:justify-center">
                <div className="absolute inset-0 bg-gradient-to-t from-emerald-950 via-transparent to-transparent" />
                <img
                  src="/image/Img_F.png"
                  alt="FinLeaf lending support"
                  className="relative z-10 max-h-[285px] w-full object-contain object-bottom"
                />
              </div>
            </div>
          </div>

          <div className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-[0_12px_35px_rgba(15,23,42,0.06)] sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-cyan-600">
                  Payment
                </p>
                <h3 className="mt-1 text-lg font-black text-slate-950">
                  Assessment fee
                </h3>
              </div>

              <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-50 text-cyan-700">
                <ReceiptText size={19} />
              </div>
            </div>

            <div className="mt-7 space-y-4">
              <DetailRow
                label="Base Fee"
                value={feeDetails ? formatCurrency(feeDetails.baseFee, true) : '—'}
              />

              <DetailRow
                label="GST"
                value={feeDetails ? formatCurrency(feeDetails.gst, true) : '—'}
              />

              <div className="border-t border-dashed border-slate-200 pt-4">
                <DetailRow
                  label={assessmentFeePaid ? 'Total Paid' : 'Total Payable'}
                  value={feeDetails ? formatCurrency(feeDetails.total, true) : '—'}
                  prominent
                />
              </div>

              {assessmentFeePaid ? (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3.5">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-700">
                    <CheckCircle2 size={16} />
                    Payment completed successfully
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-100 bg-amber-50 p-3.5">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-amber-700">
                    <LoaderCircle size={16} />
                    Payment pending
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Support */}
      <section className="grid gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => navigate('/customer/support')}
          className="group flex min-h-[105px] items-center gap-4 rounded-[22px] border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_12px_30px_rgba(15,23,42,0.08)]"
        >
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white">
            <Headphones size={21} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-slate-950">Need assistance?</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Get help from our customer support team.
            </p>
          </div>

          <ChevronRight
            size={19}
            className="shrink-0 text-slate-300 transition group-hover:translate-x-1 group-hover:text-emerald-600"
          />
        </button>

        <div className="flex min-h-[105px] items-center gap-4 rounded-[22px] border border-cyan-100 bg-cyan-50/70 px-5 py-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-cyan-700 shadow-sm">
            <CalendarDays size={21} />
          </div>

          <div>
            <p className="text-sm font-black text-cyan-950">What happens next?</p>
            <p className="mt-1 text-xs leading-5 text-cyan-900/65">
              Your next action will appear automatically when your application is updated.
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
      className={`group relative overflow-hidden rounded-[20px] border p-4 shadow-[0_6px_20px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.07)] ${selectedTone.container}`}
    >
      <div className="flex items-start justify-between gap-5 border-b border-slate-50 pb-3 last:border-0 last:pb-0">
        <div
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${selectedTone.icon}`}
        >
          <Icon size={20} />
        </div>

        <span className="inline-flex items-center gap-1 rounded-full border border-slate-100 bg-white px-2 py-1 text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
          Live
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
        </span>
      </div>

      <p className="mt-4 text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>

      <p className="mt-1.5 break-words text-sm font-black leading-5 text-slate-950">
        {value}
      </p>

      <p className="mt-1 text-[11px] leading-4 text-slate-500">
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
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
      <p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>

      <p className="mt-1.5 break-words text-xs font-extrabold text-slate-800">
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
    <article className="bg-white p-5 transition hover:bg-slate-50/60 sm:p-6">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700">
          <Icon size={19} />
        </div>

        <div>
          <h3 className="text-sm font-black text-slate-950">
            {title}
          </h3>

          {subtitle && (
            <p className="mt-0.5 text-[10px] text-slate-400">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-3.5">
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
    <div className="flex items-start justify-between gap-5 border-b border-slate-50 pb-3 last:border-0 last:pb-0">
      <span className="flex items-center gap-1.5 text-[11px] leading-5 text-slate-400">
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