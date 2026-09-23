import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Clock3,
  FileText,
  Headphones,
  IndianRupee,
  Landmark,
  Mail,
  MapPin,
  Phone,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  customerApi,
  doCustomerRefresh,
  getCustomerAccessToken,
  resumeApplication,
} from '../customerApi';

/* ------------------------------------------------------------------ */
/*  Design tokens (kept as literal Tailwind classes for JIT)          */
/*  forest  #0E3B2C  – primary surface                                */
/*  leaf    #1F8A5B  – actions, completed states                      */
/*  mint    #E7F4EC  – soft fills                                     */
/*  paper   #F7F9F6  – page background accents                        */
/*  ink     #13211A  – text                                           */
/*  honey   #B7791F  – pending / attention                            */
/* ------------------------------------------------------------------ */

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F8A5B] focus-visible:ring-offset-2';

export default function CustomerDashboard() {
  const navigate = useNavigate();
  const outletCtx = useOutletContext();
  const setOutletCustomer = outletCtx?.setCustomer;

  const [backendCustomer, setBackendCustomer] = useState(null);
  const [isLoadingCustomer, setIsLoadingCustomer] = useState(true);
  const [customerError, setCustomerError] = useState('');

  const storedSession = getStoredSession();
  const customerId = storedSession?.customerId || null;

  const loadCustomer = async (loader) => {
    setIsLoadingCustomer(true);
    setCustomerError('');

    try {
      const customerData = await loader();
      setBackendCustomer(customerData);
      if (setOutletCustomer && customerData) {
        setOutletCustomer((prev) => ({ ...prev, ...customerData }));
      }
      if (customerData?.fullName || customerData?.mobileNumber) {
        try {
          const stored = JSON.parse(
            localStorage.getItem('customerSession') || '{}'
          );
          localStorage.setItem(
            'customerSession',
            JSON.stringify({
              ...stored,
              customerId: customerData.id || customerData.customerId || stored.customerId,
              fullName: customerData.fullName || stored.fullName,
              mobileNumber: customerData.mobileNumber || stored.mobileNumber,
            })
          );
        } catch {
          // ignore
        }
      }
    } catch (error) {
      console.error('Failed to fetch customer data:', error);
      setCustomerError(
        error instanceof Error
          ? error.message
          : 'Unable to load customer details.'
      );
    } finally {
      setIsLoadingCustomer(false);
    }
  };

  const fetchCustomerData = () => {
    if (!customerId) return;
    return loadCustomer(() => customerApi.getCustomerById(customerId));
  };

  // Retry works for both entry paths (stored customerId or /me)
  const retryLoad = () =>
    customerId
      ? fetchCustomerData()
      : loadCustomer(() => customerApi.getCustomerMe());

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      let hasAccessToken = Boolean(getCustomerAccessToken());

      // A hard page refresh always wipes the in-memory access token.
      // Before treating that as "logged out", try a silent refresh
      // against the httpOnly cookie -- the session may still be valid
      // even if no local marker survived the reload.
      if (!hasAccessToken) {
        try {
          await doCustomerRefresh();
          hasAccessToken = Boolean(getCustomerAccessToken());
        } catch {
          hasAccessToken = false;
        }
      }

      if (cancelled) return;

      if (!hasAccessToken) {
        localStorage.removeItem('customerSession');
        sessionStorage.removeItem('customerSession');
        navigate('/customer/login', { replace: true });
        return;
      }

      if (!customerId && hasAccessToken) {
        loadCustomer(() => customerApi.getCustomerMe());
        return;
      }

      fetchCustomerData();
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, navigate]);

  /* ---------------------------- derived data ---------------------------- */

  const hasBackendProgress = Boolean(
    backendCustomer?.panVerified ||
      backendCustomer?.emailVerified ||
      backendCustomer?.fullName ||
      (backendCustomer?.onboardingStatus &&
        backendCustomer.onboardingStatus !== 'MOBILE_VERIFIED')
  );

  const mobileNumber =
    backendCustomer?.mobileNumber || storedSession?.mobileNumber || '';

  const applicationSubmitted = Boolean(
    ['APPLICATION_SUBMITTED', 'LENDER_APPROVED', 'LENDER_REJECTED', 'DISBURSED'].includes(backendCustomer?.onboardingStatus) ||
    ['SUBMITTED', 'LENDER_REVIEW', 'LENDER_APPROVED', 'LENDER_REJECTED', 'DISBURSED'].includes(backendCustomer?.latestApplicationStatus)
  );

  const applicationNumber =
    backendCustomer?.latestApplicationReference ||
    (backendCustomer?.latestApplicationId
      ? `PL-APP-${backendCustomer.latestApplicationId}`
      : '');

  const applicant = backendCustomer || {};

  const lender =
    backendCustomer?.allocatedLenderName ||
    backendCustomer?.allocatedLenderCode ||
    'Lending Partner';

  const applicationStatus =
    backendCustomer?.eligibilityStatus || 'SUBMITTED_TO_LENDER';

  const submittedAt = backendCustomer?.updatedAt || '';

  const feeDetails = backendCustomer?.assessmentFee
    ? {
        baseFee: backendCustomer.assessmentFee.baseAmount,
        gst: backendCustomer.assessmentFee.gstAmount,
        total: backendCustomer.assessmentFee.totalAmount,
      }
    : null;
  const assessmentFeePaid = Boolean(backendCustomer?.assessmentFeePaid);

  const hasLan = Boolean(backendCustomer?.latestLan);

  const isApproved =
    backendCustomer?.onboardingStatus === 'LENDER_APPROVED' ||
    backendCustomer?.latestApplicationStatus === 'LENDER_APPROVED' ||
    Boolean(backendCustomer?.latestLan);

  const isDisbursalRequestedOrDisbursed =
    backendCustomer?.latestDisbursalStatus === 'DISBURSAL_REQUESTED' ||
    backendCustomer?.latestDisbursalStatus === 'DISBURSAL_PROCESSING' ||
    backendCustomer?.latestDisbursalStatus === 'DISBURSED' ||
    backendCustomer?.latestLoanStatus === 'DISBURSED';

  const isDisbursed =
    backendCustomer?.latestDisbursalStatus === 'DISBURSED' ||
    backendCustomer?.latestLoanStatus === 'DISBURSED';

  const isFullyPaidRepeatCustomer =
    backendCustomer?.latestLoanStatus === 'FULLY_PAID';

  const handleApplicationButton = async () => {
    if (isFullyPaidRepeatCustomer) {
      await resumeApplication(customerId);
      navigate('/customer/application');
      return;
    }
    if (hasLan) {
      if (isDisbursalRequestedOrDisbursed) {
        navigate(`/customer/loan/${backendCustomer.latestLan}/details`);
      } else {
        navigate(`/customer/loan/${backendCustomer.latestLan}/post-approval`);
      }
      return;
    }
    navigate('/customer/application');
  };

  /* ------------------------------ states ------------------------------ */

  if (isLoadingCustomer) {
    return <DashboardSkeleton />;
  }

  if (customerError) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-1">
        <div className="rounded-[28px] border border-red-100 bg-white p-8 shadow-[0_20px_60px_-30px_rgba(19,33,26,0.35)] sm:p-12">
          <div className="mx-auto flex max-w-md flex-col items-center text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-600 ring-8 ring-red-50/50">
              <AlertCircle size={26} />
            </div>

            <h2 className="mt-6 text-xl font-bold text-[#13211A]">
              Your dashboard didn't load
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              {customerError}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Check your connection and try again. Your application data is safe.
            </p>

            <button
              type="button"
              onClick={retryLoad}
              className={`mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#0E3B2C] px-6 text-sm font-semibold text-white transition hover:bg-[#145239] ${focusRing}`}
            >
              <RotateCcw size={16} />
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------ content ------------------------------ */

  const buttonLabel = isFullyPaidRepeatCustomer
    ? 'Apply for a New Loan'
    : hasLan
    ? isDisbursalRequestedOrDisbursed
      ? 'View Loan Details'
      : 'Continue Approved Loan Journey'
    : applicationSubmitted
    ? 'View Application'
    : hasBackendProgress
    ? 'Resume Application'
    : 'Start Application';

  const firstName =
    applicant.fullName?.trim()?.split(/\s+/)?.[0] || 'there';

  const headline = isFullyPaidRepeatCustomer
    ? 'Your loan is fully repaid.'
    : isDisbursed
    ? 'Your loan has been disbursed.'
    : hasLan
    ? 'Your loan is approved.'
    : applicationSubmitted
    ? 'Your application is with the lender.'
    : hasBackendProgress
    ? 'Pick up where you left off.'
    : 'Your personal loan starts here.';

  const subline = isFullyPaidRepeatCustomer
    ? 'Well done on clearing your loan. You can start a new application whenever you need to borrow again.'
    : isDisbursed
    ? 'The funds are on their way to your account. View your loan details for repayment dates and EMI.'
    : hasLan
    ? 'Complete the remaining steps to receive your funds.'
    : applicationSubmitted
    ? "We'll show your next step here as soon as the lender updates your application."
    : hasBackendProgress
    ? 'Resume your application from where you left off.'
    : 'Apply online in a few steps and track every update from this page.';

  const journey = buildJourney({
    applicationSubmitted,
    assessmentFeePaid,
    approved: isApproved || hasLan,
    disbursalStatus: backendCustomer?.latestDisbursalStatus,
    loanStatus: backendCustomer?.latestLoanStatus,
    isFullyPaid: isFullyPaidRepeatCustomer,
  });

  const currentStatusLabel = formatStatus(
    backendCustomer?.onboardingStatus || applicationStatus
  );

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-0 pb-10 text-[#13211A]">
      {/* ============================ HERO ============================ */}
      <section className="relative overflow-hidden rounded-[32px] bg-[#0E3B2C] text-white shadow-[0_30px_80px_-40px_rgba(14,59,44,0.8)]">
        {/* leaf-vein texture */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -top-24 h-[520px] w-[520px] text-white/[0.05]"
          viewBox="0 0 200 200"
          fill="none"
        >
          <path
            d="M100 10C150 40 180 90 160 150C140 190 60 190 40 150C20 90 50 40 100 10Z"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path d="M100 10V190" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M100 60L140 40M100 90L155 70M100 120L160 105M100 60L60 40M100 90L45 70M100 120L40 105M100 150L140 140M100 150L60 140"
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>

        <div className="relative grid lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="px-6 pb-8 pt-8 sm:px-10 sm:pt-10 lg:pb-10">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-emerald-100/80">Hello, {firstName}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-emerald-50 ring-1 ring-white/15">
                <ShieldCheck size={13} />
                Secure session
              </span>
            </div>

            <h1 className="mt-5 max-w-xl text-[2rem] font-bold leading-[1.1] tracking-[-0.03em] sm:text-[2.6rem]">
              {headline}
            </h1>

            <p className="mt-4 max-w-lg text-[15px] leading-7 text-emerald-50/75">
              {subline}
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={handleApplicationButton}
                className={`group inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#9BE3B5] px-6 text-sm font-bold text-[#0E3B2C] transition hover:bg-[#B4EDC7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E3B2C]`}
              >
                {buttonLabel}
                <ArrowRight
                  size={17}
                  className="transition-transform motion-safe:group-hover:translate-x-0.5"
                />
              </button>

              <button
                type="button"
                onClick={() => navigate('/customer/support')}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-emerald-50 ring-1 ring-white/25 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <Headphones size={16} />
                Talk to support
              </button>
            </div>
          </div>

          <div className="relative hidden items-end justify-center lg:flex">
            <div className="absolute bottom-0 h-56 w-56 rounded-full bg-[#1F8A5B]/40 blur-3xl" />
            <img
              src={applicationSubmitted ? '/image/Img_Man.png' : '/image/Img_F.png'}
              alt=""
              className="relative z-10 h-[290px] w-[320px] object-contain object-bottom"
            />
          </div>
        </div>

        {/* Loan journey — the one signature element */}
        <div className="relative border-t border-white/10 bg-[#0A2F23] px-6 py-6 sm:px-10">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-sm font-semibold text-emerald-50">
              Your loan journey
            </h2>
            <span className="text-xs text-emerald-100/60">
              {journey.completed} of {journey.steps.length} complete
            </span>
          </div>

          <ol className="mt-5 grid gap-4 md:grid-cols-4 md:gap-0">
            {journey.steps.map((step, index) => (
              <JourneyStep
                key={step.key}
                step={step}
                index={index}
                isLast={index === journey.steps.length - 1}
              />
            ))}
          </ol>
        </div>
      </section>

      {/* ========================= KEY FACTS ========================= */}
      

      {/* ======================= MAIN WORKSPACE ======================= */}
      {applicationSubmitted ? (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_370px]">
          {/* Application details */}
          <div className="rounded-[28px] border border-slate-200/80 bg-white">
            <div className="flex flex-col gap-4 px-6 pb-5 pt-6 sm:flex-row sm:items-end sm:justify-between sm:px-8 sm:pt-7">
              <div>
                <h2 className="text-lg font-bold tracking-tight">
                  Application details
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  The information your lender is reviewing.
                </p>
              </div>

              <button
                type="button"
                onClick={handleApplicationButton}
                className={`inline-flex w-fit items-center gap-1.5 rounded-full bg-[#E7F4EC] px-4 py-2 text-sm font-semibold text-[#0E3B2C] transition hover:bg-[#D5EDDF] ${focusRing}`}
              >
                Open application
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="grid border-t border-slate-100 md:grid-cols-2">
              <DetailGroup icon={FileText} title="Application">
                <DetailRow label="Application number" value={applicationNumber} />
                <DetailRow label="Status" value={formatStatus(applicationStatus)} />
                <DetailRow label="Last updated" value={formatDateTime(submittedAt)} />
                <DetailRow label="Lender" value={lender} />
              </DetailGroup>

              <DetailGroup icon={CircleUserRound} title="Personal">
                <DetailRow label="Name" value={applicant.fullName} />
                <DetailRow label="PAN" value={maskPan(applicant.panNumber)} mono />
                <DetailRow label="Date of birth" value={formatDate(applicant.dateOfBirth)} />
                <DetailRow label="Gender" value={formatStatus(applicant.gender)} />
              </DetailGroup>

              <DetailGroup icon={Phone} title="Contact">
                <DetailRow
                  label="Mobile"
                  value={mobileNumber ? `+91 ${mobileNumber}` : 'Not available'}
                  icon={Phone}
                />
                <DetailRow label="Email" value={applicant.email} icon={Mail} />
                <DetailRow
                  label="Home PIN code"
                  value={applicant.pincode || applicant.residentialPincode}
                  icon={MapPin}
                />
              </DetailGroup>

              <DetailGroup icon={BriefcaseBusiness} title="Work & income">
                <DetailRow
                  label="Employment"
                  value={formatStatus(applicant.employmentType)}
                />
                <DetailRow
                  label={
                    applicant.employmentType === 'SELF_EMPLOYED'
                      ? 'Business'
                      : 'Company'
                  }
                  value={
                    applicant.employmentType === 'SELF_EMPLOYED'
                      ? applicant.businessName
                      : applicant.companyName
                  }
                />
                <DetailRow
                  label="Monthly income"
                  value={formatCurrency(applicant.monthlyIncome)}
                  icon={IndianRupee}
                />
                <DetailRow
                  label="Work PIN code"
                  value={applicant.workPincode}
                  icon={MapPin}
                />
              </DetailGroup>
            </div>
          </div>

          {/* Side column */}
          <aside className="space-y-6">
            <FeeReceipt feeDetails={feeDetails} paid={assessmentFeePaid} />

            <div className="rounded-[24px] bg-[#E7F4EC] p-6">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#0E3B2C] text-[#9BE3B5]">
                  <Landmark size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-[#0E3B2C]/60">Lending partner</p>
                  <p className="truncate text-base font-bold text-[#0E3B2C]">
                    {lender}
                  </p>
                </div>
              </div>
              <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-[#0E3B2C]/75">
                <CheckCircle2 size={16} className="mt-1 shrink-0 text-[#1F8A5B]" />
                Your application has been shared securely with this lender.
              </p>
            </div>
          </aside>
        </section>
      ) : (
        <GettingStarted
          onStart={handleApplicationButton}
          label={buttonLabel}
        />
      )}

      {/* ========================== SUPPORT ========================== */}
      <section className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <button
          type="button"
          onClick={() => navigate('/customer/support')}
          className={`group flex items-center gap-4 rounded-[24px] border border-slate-200/80 bg-white p-5 text-left transition hover:border-[#1F8A5B]/40 ${focusRing}`}
        >
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#0E3B2C] text-white">
            <Headphones size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Questions about your loan?</p>
            <p className="mt-0.5 text-sm text-slate-500">
              Contact our support team for help at any step.
            </p>
          </div>
          <ChevronRight
            size={20}
            className="shrink-0 text-slate-300 transition group-hover:text-[#1F8A5B]"
          />
        </button>

        <div className="flex items-center gap-4 rounded-[24px] border border-dashed border-slate-300 bg-[#F7F9F6] p-5">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-[#1F8A5B] ring-1 ring-slate-200">
            <Clock3 size={20} />
          </div>
          <div>
            <p className="font-semibold">What happens next</p>
            <p className="mt-0.5 text-sm leading-6 text-slate-500">
              {journey.nextHint}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ================================================================== */
/*  Journey                                                           */
/* ================================================================== */

function buildJourney({
  applicationSubmitted,
  assessmentFeePaid,
  approved,
  disbursalStatus,
  loanStatus,
  isFullyPaid,
}) {
  const disbursed =
    disbursalStatus === 'DISBURSED' || loanStatus === 'DISBURSED' || isFullyPaid;
  const disbursing =
    disbursalStatus === 'DISBURSAL_REQUESTED' ||
    disbursalStatus === 'DISBURSAL_PROCESSING';

  const base = [
    {
      key: 'apply',
      title: 'Application',
      done: applicationSubmitted,
      doneText: 'Submitted',
      currentText: 'Complete and submit',
      hint: 'Finish your application to send it to a lending partner.',
    },
    {
      key: 'fee',
      title: 'Assessment fee',
      done: assessmentFeePaid,
      doneText: 'Paid',
      currentText: 'Payment pending',
      hint: 'Pay the assessment fee so the lender can review your application.',
    },
    {
      key: 'approval',
      title: 'Lender approval',
      done: approved,
      doneText: 'Approved',
      currentText: 'Under review',
      hint: 'The lender is reviewing your application. Your next step will appear here once they decide.',
    },
    {
      key: 'disbursal',
      title: 'Disbursal',
      done: disbursed,
      doneText: 'Funds sent',
      currentText: disbursing ? 'Transfer in progress' : 'Awaiting your action',
      hint: disbursing
        ? 'Your disbursal is being processed. Funds usually reach your bank account shortly after.'
        : 'Complete the post-approval steps to receive your funds.',
    },
  ];

  // Steps are cumulative: a later completed step implies earlier ones are done.
  let lastDone = -1;
  base.forEach((s, i) => {
    if (s.done) lastDone = i;
  });

  const steps = base.map((s, i) => {
    const state =
      i <= lastDone ? 'done' : i === lastDone + 1 ? 'current' : 'upcoming';
    return {
      ...s,
      state,
      caption:
        state === 'done' ? s.doneText : state === 'current' ? s.currentText : 'Upcoming',
    };
  });

  const current = steps.find((s) => s.state === 'current');

  return {
    steps,
    completed: lastDone + 1,
    nextHint: isFullyPaid
      ? 'Start a new application whenever you need funds again.'
      : current
      ? current.hint
      : 'Your loan is active. View loan details for repayment dates and EMI.',
  };
}

function JourneyStep({ step, index, isLast }) {
  const isDone = step.state === 'done';
  const isCurrent = step.state === 'current';

  return (
    <li
      className="relative flex gap-3 md:flex-col md:gap-3 md:pr-4"
      aria-current={isCurrent ? 'step' : undefined}
    >
      {/* connector */}
      {!isLast && (
        <span
          aria-hidden="true"
          className={`absolute left-[15px] top-9 h-[calc(100%-12px)] w-px md:left-10 md:right-0 md:top-[15px] md:h-px md:w-auto ${
            isDone ? 'bg-[#9BE3B5]' : 'bg-white/15'
          }`}
        />
      )}

      <span
        className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${
          isDone
            ? 'bg-[#9BE3B5] text-[#0E3B2C]'
            : isCurrent
            ? 'bg-white text-[#0E3B2C] ring-4 ring-[#9BE3B5]/30'
            : 'bg-transparent text-emerald-100/50 ring-1 ring-white/20'
        }`}
      >
        {isDone ? <Check size={16} strokeWidth={3} /> : index + 1}
      </span>

      <div className="pb-1">
        <p
          className={`text-sm font-semibold ${
            isDone || isCurrent ? 'text-white' : 'text-emerald-100/50'
          }`}
        >
          {step.title}
        </p>
        <p
          className={`mt-0.5 text-xs ${
            isCurrent
              ? 'text-[#9BE3B5]'
              : isDone
              ? 'text-emerald-100/70'
              : 'text-emerald-100/40'
          }`}
        >
          {step.caption}
        </p>
      </div>
    </li>
  );
}

/* ================================================================== */
/*  Building blocks                                                   */
/* ================================================================== */

function FactCell({ icon: Icon, label, value, muted = false }) {
  return (
    <div className="flex items-start gap-3.5 border-b border-slate-100 p-5 last:border-b-0 sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:last:border-r-0">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#F1F6F2] text-[#1F8A5B]">
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p
          className={`mt-1 break-words text-[15px] font-semibold leading-5 tabular-nums ${
            muted ? 'text-slate-400' : 'text-[#13211A]'
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function DetailGroup({ icon: Icon, title, children }) {
  return (
    <div className="border-b border-slate-100 px-6 py-6 sm:px-8 md:[&:nth-child(odd)]:border-r md:[&:nth-last-child(-n+2)]:border-b-0">
      <div className="mb-4 flex items-center gap-2 text-[#0E3B2C]">
        <Icon size={16} className="text-[#1F8A5B]" />
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      <dl className="space-y-3">{children}</dl>
    </div>
  );
}

function DetailRow({ label, value, icon: Icon, prominent = false, mono = false }) {
  return (
    <div className="flex items-start justify-between gap-5">
      <dt className="flex items-center gap-1.5 text-sm leading-6 text-slate-500">
        {Icon && <Icon size={13} className="shrink-0 text-slate-400" />}
        {label}
      </dt>
      <dd
        className={`max-w-[60%] break-words text-right leading-6 text-[#13211A] ${
          prominent ? 'text-lg font-bold' : 'text-sm font-semibold'
        } ${mono ? 'tracking-wider' : ''} tabular-nums`}
      >
        {value || 'Not provided'}
      </dd>
    </div>
  );
}

function FeeReceipt({ feeDetails, paid }) {
  return (
    <div className="relative rounded-[24px] border border-slate-200/80 bg-white">
      <div className="p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Assessment fee</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              One-time, including GST
            </p>
          </div>
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#F1F6F2] text-[#1F8A5B]">
            <ReceiptText size={18} />
          </div>
        </div>

        <dl className="mt-6 space-y-2.5">
          <DetailRow
            label="Base fee"
            value={feeDetails ? formatCurrency(feeDetails.baseFee, true) : '—'}
          />
          <DetailRow
            label="GST"
            value={feeDetails ? formatCurrency(feeDetails.gst, true) : '—'}
          />
        </dl>
      </div>

      {/* perforation */}
      <div aria-hidden="true" className="relative h-5">
        <span className="absolute -left-2.5 top-0 h-5 w-5 rounded-full border border-slate-200/80 bg-[#F7F9F6] [clip-path:inset(0_0_0_50%)]" />
        <span className="absolute -right-2.5 top-0 h-5 w-5 rounded-full border border-slate-200/80 bg-[#F7F9F6] [clip-path:inset(0_50%_0_0)]" />
        <span className="absolute inset-x-5 top-1/2 border-t-2 border-dotted border-slate-200" />
      </div>

      <div className="p-6 pt-3">
        <dl>
          <DetailRow
            label={paid ? 'Total paid' : 'Total payable'}
            value={feeDetails ? formatCurrency(feeDetails.total, true) : '—'}
            prominent
          />
        </dl>

        <div
          className={`mt-4 flex items-center gap-2 rounded-xl px-3.5 py-3 text-sm font-semibold ${
            paid
              ? 'bg-[#E7F4EC] text-[#145239]'
              : 'bg-amber-50 text-[#8A5A12]'
          }`}
          role="status"
        >
          {paid ? <CheckCircle2 size={16} /> : <Clock3 size={16} />}
          {paid ? 'Payment received' : 'Payment pending'}
        </div>
      </div>
    </div>
  );
}

function GettingStarted({ onStart, label }) {
  const items = [
    { icon: CircleUserRound, title: 'PAN card', text: 'To verify your identity.' },
    {
      icon: BriefcaseBusiness,
      title: 'Work and income details',
      text: 'Employer or business name and monthly income.',
    },
    { icon: MapPin, title: 'Address PIN codes', text: 'For your home and workplace.' },
  ];

  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white p-6 sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight">
            Keep these ready before you apply
          </h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
            Having these at hand makes the application quicker. You can save
            and come back at any time.
          </p>
          <button
            type="button"
            onClick={onStart}
            className={`mt-6 inline-flex min-h-12 items-center gap-2 rounded-full bg-[#0E3B2C] px-6 text-sm font-semibold text-white transition hover:bg-[#145239] ${focusRing}`}
          >
            {label}
            <ArrowRight size={16} />
          </button>
        </div>

        <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          {items.map(({ icon: Icon, title, text }) => (
            <li
              key={title}
              className="flex items-start gap-3 rounded-2xl bg-[#F7F9F6] p-4"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[#1F8A5B] ring-1 ring-slate-200">
                <Icon size={17} />
              </div>
              <div>
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-0.5 text-sm text-slate-500">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function DashboardSkeleton() {
  const bar = 'rounded-full bg-slate-200/80 motion-safe:animate-pulse';

  return (
    <div
      className="mx-auto w-full max-w-[1400px] space-y-6 px-0"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading your dashboard</span>

      <div className="overflow-hidden rounded-[32px] bg-[#0E3B2C]">
        <div className="space-y-4 p-8 sm:p-10">
          <div className="h-4 w-32 rounded-full bg-white/10 motion-safe:animate-pulse" />
          <div className="h-10 w-3/4 max-w-lg rounded-2xl bg-white/10 motion-safe:animate-pulse" />
          <div className="h-4 w-1/2 max-w-sm rounded-full bg-white/10 motion-safe:animate-pulse" />
          <div className="h-12 w-48 rounded-full bg-white/15 motion-safe:animate-pulse" />
        </div>
        <div className="grid gap-4 border-t border-white/10 bg-[#0A2F23] p-8 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-white/10" />
              <div className="h-3 w-24 rounded-full bg-white/10 motion-safe:animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 rounded-[24px] border border-slate-200/80 bg-white p-5 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-100" />
            <div className="flex-1 space-y-2">
              <div className={`h-3 w-20 ${bar}`} />
              <div className={`h-4 w-32 ${bar}`} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_370px]">
        <div className="h-80 rounded-[28px] border border-slate-200/80 bg-white" />
        <div className="h-80 rounded-[24px] border border-slate-200/80 bg-white" />
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Helpers (unchanged behaviour)                                     */
/* ================================================================== */

function getStoredSession() {
  try {
    return JSON.parse(localStorage.getItem('customerSession') || 'null');
  } catch {
    return null;
  }
}

function maskPan(panNumber) {
  if (!panNumber || panNumber.length !== 10) {
    return panNumber || 'Not provided';
  }

  return `${panNumber.slice(0, 2)}***${panNumber.slice(5, 9)}${panNumber.slice(-1)}`;
}

function formatStatus(value) {
  if (!value) {
    return 'Not available';
  }

  return String(value)
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatDate(dateValue) {
  if (!dateValue) {
    return 'Not provided';
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatDateTime(dateValue) {
  if (!dateValue) {
    return 'Not available';
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatCurrency(value, showDecimal = false) {
  if (value === undefined || value === null || value === '') {
    return 'Not provided';
  }

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: showDecimal ? 2 : 0,
    maximumFractionDigits: showDecimal ? 2 : 0,
  }).format(Number(value));
}