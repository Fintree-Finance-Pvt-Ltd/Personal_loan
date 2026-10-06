import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  LoaderCircle,
  ArrowRight,
  RotateCcw,
  AlertCircle,
  BadgeCheck,
  FileText,
  Building2,
  CreditCard,
  PenLine,
  Landmark,
  ChevronRight,
  ShieldCheck,
  ExternalLink,
  Eye,
  X,
} from 'lucide-react';
import {
  getPostApprovalJourney,
  acceptLoanOffer,
  verifyBankAccount,
  getPreviousBankDetails,
  acceptKfs,
  initiateMandate,
  getMandateStatus,
  refreshMandateStatus,
  requestDisbursal,
  prepareElectronicSign,
  markDocumentViewed,
  sendSigningOtp,
  verifySigningOtp,
  fetchAuthenticatedBlobUrl,
} from '../postApprovalApi';
import { loadEasebuzzCheckout } from '../utils/loadEasebuzzCheckout';
import { resolveFileUrl } from '../../../lib/files';
import { OtpInput } from '../../../components/ui/OtpInput';

/* ------------------------------------------------------------------ */
/*  Design tokens — same palette as the dashboard and application page */
/*  forest #0E3B2C · leaf #1F8A5B · sprout #9BE3B5 · mint #E7F4EC      */
/*  paper  #F7F9F6 · ink  #13211A                                      */
/* ------------------------------------------------------------------ */

const BTN_PRIMARY =
  'inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#0E3B2C] px-6 text-sm font-semibold text-white transition hover:bg-[#145239] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F8A5B] focus-visible:ring-offset-2';

const BTN_SECONDARY =
  'inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F8A5B] focus-visible:ring-offset-2';

const BTN_SOFT =
  'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#E7F4EC] px-4 text-sm font-semibold text-[#0E3B2C] transition hover:bg-[#D5EDDF] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F8A5B] focus-visible:ring-offset-2';

const CARD = 'rounded-[26px] border border-slate-200/80 bg-white';

const FACT = 'rounded-2xl bg-[#F7F9F6] p-4';

function getCustomerSession() {
  try {
    return JSON.parse(localStorage.getItem('customerSession') || 'null');
  } catch {
    return null;
  }
}

const STEPS = [
  { id: 'APPROVAL_SUMMARY', label: 'Offer', icon: BadgeCheck },
  { id: 'BANK_VERIFICATION', label: 'Bank', icon: Building2 },
  { id: 'KFS_ACCEPTANCE', label: 'KFS', icon: FileText },
  { id: 'EMANDATE', label: 'Mandate', icon: CreditCard },
  { id: 'ESIGN', label: 'eSign', icon: PenLine },
  { id: 'READY_FOR_DISBURSAL', label: 'Disbursal', icon: Landmark },
];

// Plain-language line for the header, so the customer reads what to do next rather
// than the system's own step name.
const STEP_COPY = {
  APPROVAL_SUMMARY: 'Check your offer and pick how long you want to repay.',
  BANK_VERIFICATION: 'Tell us where the money should land.',
  KFS_ACCEPTANCE: 'Read the key facts of your loan, then accept them.',
  EMANDATE: 'Set up automatic repayment from your bank account.',
  ESIGN: 'Read your agreement and sign it with an OTP.',
  READY_FOR_DISBURSAL: 'Last step — ask for your money.',
};

export default function PostApprovalJourneyPage() {
  const { lan } = useParams();
  const navigate = useNavigate();
  const normalizedLan = String(lan || '').trim().toUpperCase();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [selectedStepId, setSelectedStepId] = useState(null);

  const fetchJourney = async () => {
    setIsLoading(true);
    setError('');
    try {
      const result = await getPostApprovalJourney(normalizedLan);
      setData(result);
    } catch (err) {
      setError(err?.message || 'Failed to load journey details.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const session = getCustomerSession();
    if (!session?.customerId) {
      navigate('/customer/login', { replace: true });
      return;
    }
    if (!normalizedLan) {
      navigate('/customer/dashboard', { replace: true });
      return;
    }
    fetchJourney();
  }, [normalizedLan]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="overflow-hidden rounded-[28px] bg-[#0E3B2C] p-7 sm:p-9">
          <div className="h-3 w-28 rounded-full bg-white/10 motion-safe:animate-pulse" />
          <div className="mt-4 h-8 w-64 max-w-full rounded-2xl bg-white/10 motion-safe:animate-pulse" />
          <div className="mt-4 h-3 w-48 rounded-full bg-white/10 motion-safe:animate-pulse" />
          <div className="mt-8 h-1.5 w-full rounded-full bg-white/10 motion-safe:animate-pulse" />
        </div>
        <div className={`${CARD} p-7 sm:p-9`}>
          <div className="h-5 w-52 rounded-full bg-slate-200/80 motion-safe:animate-pulse" />
          <div className="mt-3 h-3 w-80 max-w-full rounded-full bg-slate-200/60 motion-safe:animate-pulse" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-2xl bg-slate-100 motion-safe:animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className={`mx-auto max-w-lg ${CARD} p-8 text-center sm:p-10`}>
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-600 ring-8 ring-rose-50/50">
            <AlertCircle size={26} />
          </div>
          <h2 className="mt-6 text-xl font-bold text-[#13211A]">This page didn't load</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{error}</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Nothing you have completed is lost. Check your connection and try again.
          </p>
          <button type="button" onClick={fetchJourney} className={`mt-7 ${BTN_PRIMARY}`}>
            <RotateCcw size={16} /> Try again
          </button>
        </div>
      </div>
    );
  }

  const currentStep = data?.workflow?.currentStep || 'APPROVAL_SUMMARY';

  let currentIdx = STEPS.findIndex(s => s.id === currentStep);
  if (currentStep === 'DISBURSED' || currentStep === 'DISBURSAL_PROCESSING') {
    currentIdx = STEPS.length - 1;
  } else if (currentIdx === -1) {
    currentIdx = 0;
  }

  const activeStepId = selectedStepId || (
    currentStep === 'DISBURSED' || currentStep === 'DISBURSAL_PROCESSING'
      ? 'READY_FOR_DISBURSAL'
      : currentStep
  );

  const isDisbursed = currentStep === 'DISBURSED' || data?.loan?.status === 'DISBURSED';
  const progress = isDisbursed ? 100 : Math.round(((currentIdx + 1) / STEPS.length) * 100);

  const handleNextStep = async () => {
    setSelectedStepId(null);
    await fetchJourney();
  };

  const stepsLeft = isDisbursed ? 0 : STEPS.length - (currentIdx + 1);

  return (
    <div className="mx-auto max-w-4xl space-y-6 text-[#13211A]">
      {/* Header banner */}
      <section className="relative overflow-hidden rounded-[28px] bg-[#0E3B2C] text-white">
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-28 h-[420px] w-[420px] text-white/[0.06]"
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

        <div className="relative px-6 py-7 sm:px-9 sm:py-8">
          <p className="text-sm text-emerald-100/70">Your approved loan</p>

          <h1 className="mt-1.5 max-w-xl text-2xl font-bold leading-[1.15] tracking-[-0.02em] sm:text-[28px]">
            {isDisbursed ? 'Your money is on its way' : 'A few steps and the money is yours'}
          </h1>

          <p className="mt-2.5 max-w-lg text-sm leading-6 text-emerald-50/70">
            {isDisbursed
              ? 'Your loan has been disbursed to your bank account.'
              : STEP_COPY[activeStepId] || 'Finish the remaining steps to receive your funds.'}
          </p>

          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs text-emerald-50 ring-1 ring-white/15">
            <ShieldCheck size={13} />
            Loan account {data?.loan?.lan || normalizedLan}
          </p>

          <div className="mt-7">
            <div className="flex items-center justify-between text-xs text-emerald-100/70">
              <span>{progress}% complete</span>
              <span>
                {stepsLeft === 0 ? 'All done' : stepsLeft === 1 ? '1 step to go' : `${stepsLeft} steps to go`}
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-[#9BE3B5] transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Steps strip — tappable, so a customer can look back at a finished step */}
      <section className="overflow-x-auto">
        <div className="flex min-w-max gap-2">
          {STEPS.map((step, idx) => {
            const isDone = idx < currentIdx || (idx === currentIdx && isDisbursed);
            const isActive = step.id === activeStepId;
            const isClickable = idx <= currentIdx;
            const Icon = step.icon;

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => {
                  if (isClickable) setSelectedStepId(step.id);
                }}
                disabled={!isClickable}
                aria-current={isActive ? 'step' : undefined}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed ${isActive
                  ? 'border-[#0E3B2C] bg-[#0E3B2C] text-white'
                  : isDone
                    ? 'cursor-pointer border-[#C9E6D5] bg-[#E7F4EC] text-[#0E3B2C] hover:bg-[#D5EDDF]'
                    : 'border-slate-200 bg-white text-slate-400'
                  }`}
              >
                {isDone && !isActive ? <CheckCircle2 size={15} /> : <Icon size={15} />}
                {step.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Active step content — key={activeStepId} remounts this wrapper on every step
          change, replaying the CSS entrance animation for a smooth step-to-step transition. */}
      <div key={activeStepId} className="animate-step-enter">
        {activeStepId === 'APPROVAL_SUMMARY' && (
          <ApprovalSummaryStep data={data} onNext={handleNextStep} />
        )}
        {activeStepId === 'BANK_VERIFICATION' && (
          <BankVerificationStep lan={normalizedLan} data={data} onNext={handleNextStep} />
        )}
        {activeStepId === 'KFS_ACCEPTANCE' && (
          <KfsStep lan={normalizedLan} data={data} onNext={handleNextStep} />
        )}
        {activeStepId === 'EMANDATE' && (
          <MandateStep lan={normalizedLan} data={data} onNext={handleNextStep} />
        )}
        {activeStepId === 'ESIGN' && (
          <EsignStep lan={normalizedLan} data={data} onNext={handleNextStep} />
        )}
        {(activeStepId === 'READY_FOR_DISBURSAL' || activeStepId === 'DISBURSAL_PROCESSING' || activeStepId === 'DISBURSED') && (
          <DisbursalStep
            lan={normalizedLan}
            data={data}
            onRefresh={fetchJourney}
            onGoToStep={(stepId) => setSelectedStepId(stepId)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Step Cards & UI Components ───────────────────────────────────────────────

function StepCard({ title, subtitle, icon: Icon, children }) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white">
      <div className="flex items-start gap-4 border-b border-slate-100 px-6 py-6 sm:px-9">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#E7F4EC] text-[#1F8A5B]">
          <Icon size={22} />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#13211A]">{title}</h2>
          {subtitle && <p className="mt-1.5 max-w-xl text-sm leading-6 text-slate-500">{subtitle}</p>}
        </div>
      </div>
      <div className="p-6 sm:p-9">{children}</div>
    </div>
  );
}

function ActionButton({ onClick, disabled, loading, children, variant = 'primary', type = 'button' }) {
  const base =
    'inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold transition disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F8A5B] focus-visible:ring-offset-2';
  const styles = {
    primary: 'bg-[#0E3B2C] text-white hover:bg-[#145239] disabled:bg-slate-200 disabled:text-slate-400',
    blue: 'bg-[#1F8A5B] text-white hover:bg-[#157049] disabled:bg-slate-200 disabled:text-slate-400',
    slate: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} className={`${base} ${styles[variant] || styles.primary}`}>
      {loading ? <LoaderCircle size={16} className="animate-spin" /> : null}
      {children}
      {!loading && <ArrowRight size={16} />}
    </button>
  );
}

function CompletedBadge({ title, description }) {
  return (
    <div className="mb-7 flex items-start gap-3.5 rounded-2xl bg-[#E7F4EC] p-5">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#0E3B2C] text-[#9BE3B5]">
        <CheckCircle2 size={20} />
      </div>
      <div>
        <h4 className="text-sm font-bold text-[#0E3B2C]">{title || 'Step completed'}</h4>
        {description && <p className="mt-0.5 text-sm leading-6 text-[#0E3B2C]/75">{description}</p>}
      </div>
    </div>
  );
}

function Fact({ label, value, mono = false, strong = false }) {
  return (
    <div className={FACT}>
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={`mt-1 break-words tabular-nums ${mono ? 'tracking-wide' : ''} ${
          strong ? 'text-lg font-bold text-[#0E3B2C]' : 'text-base font-semibold text-[#13211A]'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function InlineError({ message }) {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-800">
      <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-600" />
      <span className="leading-6">{message}</span>
    </div>
  );
}

function InlineNote({ message }) {
  return (
    <div className="rounded-2xl bg-[#E7F4EC] p-4 text-sm leading-6 text-[#0E3B2C]">
      {message}
    </div>
  );
}

// ─── Individual Step Components ────────────────────────────────────────────────

function ApprovalSummaryStep({ data, onNext }) {
  const isAccepted = Boolean(data?.workflow?.offerAccepted || data?.offer?.acceptedTenureDays);
  const tenures = Array.isArray(data?.offer?.allowedTenures) && data.offer.allowedTenures.length > 0
    ? data.offer.allowedTenures
    : [90, 180, 270, 365];

  const [selectedTenure, setSelectedTenure] = useState(data?.offer?.acceptedTenureDays || tenures[0]);
  const [isAccepting, setIsAccepting] = useState(false);

  const handleAccept = async () => {
    if (isAccepted) {
      onNext();
      return;
    }
    setIsAccepting(true);
    try {
      await acceptLoanOffer(data.loan.lan, { tenureDays: selectedTenure });
      onNext();
    } catch (err) {
      alert(err.message || 'Failed to accept offer');
    } finally {
      setIsAccepting(false);
    }
  };

  const formatCurrency = (val) => val ? Number(val).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }) : '—';
  const approvedAmount = formatCurrency(data?.loan?.approvedAmount || data?.offer?.approvedAmount);

  return (
    <StepCard
      title="Your loan offer"
      subtitle="Here is what your lender approved. Choose how long you want to repay."
      icon={BadgeCheck}
    >
      {isAccepted ? (
        <CompletedBadge
          title="Offer accepted"
          description={`You chose a ${data?.offer?.acceptedTenureDays}-day tenure.`}
        />
      ) : (
        <div className="mb-7 overflow-hidden rounded-[24px] bg-[#0E3B2C] p-8 text-center text-white sm:p-10">
          <p className="text-sm text-emerald-100/70">Approved amount</p>
          <p className="mt-2 text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">
            {approvedAmount}
          </p>
          <p className="mt-3 text-xs text-emerald-100/60">
            Approved by {data?.lender?.name || 'your lending partner'}
          </p>
        </div>
      )}

      {/* Details grid */}
      <div className="mb-7 grid gap-4 sm:grid-cols-2">
        <Fact label="Loan account number" value={data?.loan?.lan} mono />
        <Fact label="Approved amount" value={approvedAmount} strong />
      </div>

      {/* Tenure selection */}
      {!isAccepted ? (
        <div className="mb-8">
          <p className="text-base font-bold text-[#13211A]">How long do you need to repay?</p>
          <p className="mt-1 text-sm text-slate-500">You can always repay earlier.</p>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tenures.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedTenure(t)}
                aria-pressed={selectedTenure === t}
                className={`relative cursor-pointer rounded-2xl border p-4 text-left transition ${selectedTenure === t
                  ? 'border-[#1F8A5B] bg-[#E7F4EC]'
                  : 'border-slate-200 hover:border-[#9BE3B5] hover:bg-slate-50'
                  }`}
              >
                {selectedTenure === t && (
                  <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-[#0E3B2C] text-white">
                    <CheckCircle2 size={12} />
                  </span>
                )}
                <p className={`text-xl font-bold tabular-nums ${selectedTenure === t ? 'text-[#0E3B2C]' : 'text-[#13211A]'}`}>{t}</p>
                <p className={`text-xs ${selectedTenure === t ? 'text-[#0E3B2C]/70' : 'text-slate-500'}`}>days</p>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <Fact label="Tenure" value={`${data?.offer?.acceptedTenureDays} days`} />
          <Fact label="Amount due at the end" value={formatCurrency(data?.offer?.acceptedEmiAmount)} />
          <Fact label="Total repayment" value={formatCurrency(data?.offer?.acceptedTotalRepayment)} />
        </div>
      )}

      <div className="flex justify-end">
        <ActionButton onClick={handleAccept} loading={isAccepting}>
          {isAccepted ? 'Continue' : 'Accept and continue'}
        </ActionButton>
      </div>
    </StepCard>
  );
}

function BankVerificationStep({ lan, data, onNext }) {
  const isVerified = Boolean(data?.workflow?.bankVerified || data?.bank?.verified);
  const bankData = data?.bank || {};

  const [formData, setFormData] = useState({
    accountHolderName: bankData.accountHolderName || data?.customer?.fullName || '',
    accountNumber: '',
    confirmAccountNumber: '',
    ifscCode: bankData.ifsc || '',
    bankName: bankData.bankName || '',
    branchName: '',
    accountType: bankData.accountType || 'SAVINGS',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const [previousBank, setPreviousBank] = useState(null);
  const [loadingPrevious, setLoadingPrevious] = useState(true);
  const [useSameAccount, setUseSameAccount] = useState(true);

  useEffect(() => {
    if (isVerified) {
      setLoadingPrevious(false);
      return;
    }
    let isMounted = true;
    (async () => {
      try {
        const previous = await getPreviousBankDetails(lan);
        if (isMounted) {
          setPreviousBank(previous);
          setUseSameAccount(Boolean(previous?.available));
        }
      } catch {
        if (isMounted) setPreviousBank(null);
      } finally {
        if (isMounted) setLoadingPrevious(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [lan, isVerified]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    let val = value;

    if (name === 'accountNumber' || name === 'confirmAccountNumber') {
      val = value.replace(/\D/g, '').slice(0, 20);
    } else if (name === 'ifscCode') {
      val = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 11);
    }

    setFormData((prev) => {
      const updated = { ...prev, [name]: val };
      if (name === 'ifscCode' && val.length >= 4) {
        const prefix = val.slice(0, 4);
        if (!prev.bankName) {
          const knownBanks = {
            HDFC: 'HDFC Bank',
            SBIN: 'State Bank of India',
            ICIC: 'ICICI Bank',
            UTIB: 'Axis Bank',
            KKBK: 'Kotak Mahindra Bank',
            PUNB: 'Punjab National Bank',
            BARB: 'Bank of Baroda',
            INDB: 'IndusInd Bank',
            YESB: 'Yes Bank',
            IDFB: 'IDFC FIRST Bank',
          };
          if (knownBanks[prefix]) {
            updated.bankName = knownBanks[prefix];
          }
        }
      }
      return updated;
    });

    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: '' }));
    }
    setErrorMsg('');
  };

  const validate = () => {
    const errors = {};
    const holder = formData.accountHolderName.trim();
    const acc = formData.accountNumber.trim();
    const confirm = formData.confirmAccountNumber.trim();
    const ifsc = formData.ifscCode.trim().toUpperCase();
    const bank = formData.bankName.trim();
    const branch = formData.branchName.trim();

    if (!holder) {
      errors.accountHolderName = 'Account holder name is required.';
    } else if (!/^[a-zA-Z][a-zA-Z .'-]{1,149}$/.test(holder)) {
      errors.accountHolderName = 'Enter a valid name (letters and spaces only).';
    }

    if (!acc) {
      errors.accountNumber = 'Account number is required.';
    } else if (!/^\d{9,20}$/.test(acc)) {
      errors.accountNumber = 'Account number must contain 9 to 20 digits.';
    }

    if (!confirm) {
      errors.confirmAccountNumber = 'Please confirm your account number.';
    } else if (acc !== confirm) {
      errors.confirmAccountNumber = 'Account numbers do not match.';
    }

    if (!ifsc) {
      errors.ifscCode = 'IFSC code is required.';
    } else if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
      errors.ifscCode = 'Enter a valid 11-character IFSC code (e.g. HDFC0001234).';
    }

    if (!bank) {
      errors.bankName = 'Bank name is required.';
    }

    if (!branch) {
      errors.branchName = 'Branch name is required.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleVerify = async (e) => {
    if (e) e.preventDefault();
    if (isVerified) {
      onNext();
      return;
    }

    const reusingPreviousAccount = useSameAccount && previousBank?.available;

    if (!reusingPreviousAccount && !validate()) return;

    setIsLoading(true);
    setErrorMsg('');

    try {
      const payload = reusingPreviousAccount
        ? { reuseFromPreviousLoan: true }
        : {
          accountHolderName: formData.accountHolderName.trim(),
          accountNumber: formData.accountNumber.trim(),
          confirmAccountNumber: formData.confirmAccountNumber.trim(),
          ifscCode: formData.ifscCode.trim().toUpperCase(),
          bankName: formData.bankName.trim(),
          branchName: formData.branchName.trim(),
          accountType: formData.accountType,
        };

      const res = await verifyBankAccount(lan, payload);
      const status = String(res?.status || res?.data?.status || '').toUpperCase();

      if (status && !['VERIFIED', 'SUCCESS'].includes(status)) {
        throw new Error(res?.message || 'Bank verification could not be completed.');
      }

      await onNext();
    } catch (err) {
      setErrorMsg(err?.message || 'Bank account verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = (fieldName) =>
    `min-h-12 w-full rounded-2xl border bg-white px-4 py-3 text-[15px] text-[#13211A] outline-none transition placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 ${fieldErrors[fieldName]
      ? 'border-rose-300 ring-4 ring-rose-50'
      : 'border-slate-200 focus:border-[#1F8A5B] focus:ring-4 focus:ring-[#E7F4EC]'
    }`;

  const labelClass = 'mb-2 block text-sm font-semibold text-slate-700';

  return (
    <StepCard
      title="Where should the money go?"
      subtitle="We pay directly into your own bank account."
      icon={Landmark}
    >
      {isVerified ? (
        <div>
          <CompletedBadge
            title="Bank account verified"
            description="We sent ₹1 to this account and the name matched."
          />

          <div className="mb-7 grid gap-4 sm:grid-cols-2">
            <Fact label="Account holder" value={bankData.accountHolderName || '—'} />
            <Fact label="Bank" value={bankData.bankName || '—'} />
            <Fact label="Account number" value={bankData.accountMasked || '—'} mono />
            <Fact label="IFSC code" value={bankData.ifsc || '—'} mono />
          </div>

          <div className="flex justify-end">
            <ActionButton onClick={onNext}>
              Continue
            </ActionButton>
          </div>
        </div>
      ) : (
        <div>
          {/* Penny Drop Info Card */}
          <div className="mb-7 flex items-start gap-3.5 rounded-2xl bg-[#F7F9F6] p-5">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#0E3B2C] text-[#9BE3B5]">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-[#13211A]">
                We will send ₹1 to check the account
              </h4>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                It confirms the account is real and in your name. The ₹1 is yours to keep. The
                account must belong to you.
              </p>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-7">
              <InlineError message={errorMsg} />
            </div>
          )}

          {loadingPrevious ? (
            <div className="mb-6 flex items-center gap-2 text-sm text-slate-500">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Looking for an account you have used before…
            </div>
          ) : previousBank?.available && useSameAccount ? (
            <div className="space-y-6">
              <div className="rounded-2xl bg-[#F7F9F6] p-5 sm:p-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <h4 className="text-base font-bold text-[#13211A]">
                    Use the account from your last loan
                  </h4>
                  <button
                    type="button"
                    onClick={() => setUseSameAccount(false)}
                    disabled={isLoading}
                    className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-[#1F8A5B] transition hover:text-[#0E3B2C] disabled:opacity-50"
                  >
                    <PenLine className="h-4 w-4" />
                    Use a different one
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Fact label="Account holder" value={previousBank.accountHolderName || '—'} />
                  <Fact label="Bank" value={previousBank.bankName || '—'} />
                  <Fact label="Account number" value={previousBank.accountNumberMasked || '—'} mono />
                  <Fact label="IFSC code" value={previousBank.ifscCode || '—'} mono />
                </div>
              </div>

              <div className="flex justify-end">
                <ActionButton onClick={handleVerify} loading={isLoading}>
                  Send ₹1 and verify
                </ActionButton>
              </div>
            </div>
          ) : (
            <form onSubmit={handleVerify} className="space-y-5">
              {previousBank?.available && (
                <button
                  type="button"
                  onClick={() => setUseSameAccount(true)}
                  disabled={isLoading}
                  className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-[#1F8A5B] transition hover:text-[#0E3B2C] disabled:opacity-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  Use my previous account instead
                </button>
              )}

              <div>
                <label htmlFor="accountHolderName" className={labelClass}>
                  Account holder name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="accountHolderName"
                  name="accountHolderName"
                  type="text"
                  placeholder="Exactly as it appears in your bank records"
                  value={formData.accountHolderName}
                  onChange={handleChange}
                  disabled={isLoading}
                  className={inputClass('accountHolderName')}
                />
                {fieldErrors.accountHolderName && (
                  <p className="animate-fade-in mt-2 text-sm text-rose-600">{fieldErrors.accountHolderName}</p>
                )}
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="accountNumber" className={labelClass}>
                    Account number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="accountNumber"
                    name="accountNumber"
                    type="text"
                    inputMode="numeric"
                    placeholder="9 to 20 digits"
                    value={formData.accountNumber}
                    onChange={handleChange}
                    disabled={isLoading}
                    className={inputClass('accountNumber')}
                  />
                  {fieldErrors.accountNumber && (
                    <p className="animate-fade-in mt-2 text-sm text-rose-600">{fieldErrors.accountNumber}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="confirmAccountNumber" className={labelClass}>
                    Confirm account number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="confirmAccountNumber"
                    name="confirmAccountNumber"
                    type="text"
                    inputMode="numeric"
                    placeholder="Type it again"
                    value={formData.confirmAccountNumber}
                    onChange={handleChange}
                    onPaste={(e) => e.preventDefault()}
                    disabled={isLoading}
                    className={inputClass('confirmAccountNumber')}
                  />
                  {fieldErrors.confirmAccountNumber && (
                    <p className="animate-fade-in mt-2 text-sm text-rose-600">{fieldErrors.confirmAccountNumber}</p>
                  )}
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="ifscCode" className={labelClass}>
                    IFSC code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="ifscCode"
                    name="ifscCode"
                    type="text"
                    placeholder="HDFC0001234"
                    value={formData.ifscCode}
                    onChange={handleChange}
                    disabled={isLoading}
                    className={`${inputClass('ifscCode')} uppercase tracking-wider`}
                  />
                  {fieldErrors.ifscCode && (
                    <p className="animate-fade-in mt-2 text-sm text-rose-600">{fieldErrors.ifscCode}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="accountType" className={labelClass}>
                    Account type <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="accountType"
                    name="accountType"
                    value={formData.accountType}
                    onChange={handleChange}
                    disabled={isLoading}
                    className={inputClass('accountType')}
                  >
                    <option value="SAVINGS">Savings account</option>
                    <option value="CURRENT">Current account</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="bankName" className={labelClass}>
                    Bank name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="bankName"
                    name="bankName"
                    type="text"
                    placeholder="HDFC Bank"
                    value={formData.bankName}
                    onChange={handleChange}
                    disabled={isLoading}
                    className={inputClass('bankName')}
                  />
                  {fieldErrors.bankName && (
                    <p className="animate-fade-in mt-2 text-sm text-rose-600">{fieldErrors.bankName}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="branchName" className={labelClass}>
                    Branch <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="branchName"
                    name="branchName"
                    type="text"
                    placeholder="Andheri West"
                    value={formData.branchName}
                    onChange={handleChange}
                    disabled={isLoading}
                    className={inputClass('branchName')}
                  />
                  {fieldErrors.branchName && (
                    <p className="animate-fade-in mt-2 text-sm text-rose-600">{fieldErrors.branchName}</p>
                  )}
                </div>
              </div>

              <p className="flex items-center gap-2 rounded-2xl bg-[#F7F9F6] p-4 text-sm text-slate-500">
                <ShieldCheck className="h-4 w-4 shrink-0 text-[#1F8A5B]" />
                Your bank details are encrypted and used only for this loan.
              </p>

              <div className="flex justify-end pt-2">
                <ActionButton type="submit" onClick={handleVerify} loading={isLoading}>
                  Send ₹1 and verify
                </ActionButton>
              </div>
            </form>
          )}
        </div>
      )}
    </StepCard>
  );
}

function KfsStep({ lan, data, onNext }) {
  const isAccepted = Boolean(data?.workflow?.kfsAccepted || data?.kfs?.kfsAccepted);
  const [isLoading, setIsLoading] = useState(false);
  const [isConsentChecked, setIsConsentChecked] = useState(isAccepted);
  const [errorMsg, setErrorMsg] = useState('');
  const [showModal, setShowModal] = useState(false);

  const kfs = data?.kfs || {};
  const loan = data?.loan || {};
  const offer = data?.offer || {};
  const lender = data?.lender || {};
  const customer = data?.customer || {};
  const bank = data?.bank || {};

  const formatCurrency = (value) => {
    if (value === null || value === undefined || value === '') return '₹0';
    return Number(value).toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    });
  };

  const formatDate = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const loanAmount = Number(kfs?.loanAmount ?? offer?.approvedAmount ?? loan?.approvedAmount ?? 0);
  const tenureDays = Number(kfs?.tenureDays ?? offer?.acceptedTenureDays ?? loan?.acceptedTenureDays ?? 30);
  const interestRate = Number(kfs?.interestRate ?? offer?.acceptedInterestRate ?? 18);
  const processingFee = Number(kfs?.processingFee ?? offer?.acceptedProcessingFee ?? Math.round(loanAmount * 0.02));
  const processingFeeGst = Number(kfs?.processingFeeGst ?? Math.round(processingFee * 0.18));
  const totalCharges = processingFee + processingFeeGst;
  const netDisbursalAmount = Number(kfs?.netDisbursalAmount ?? (loanAmount - totalCharges));

  const totalInterest = Number(
    kfs?.totalInterest ??
    (kfs?.totalRepaymentAmount ? kfs.totalRepaymentAmount - loanAmount : Math.round((loanAmount * interestRate * tenureDays) / 36500))
  );

  const totalRepaymentAmount = Number(kfs?.totalRepaymentAmount ?? offer?.acceptedTotalRepayment ?? (loanAmount + totalInterest));
  const apr = kfs?.apr ?? (loanAmount > 0 ? Number((((totalInterest + totalCharges) / loanAmount) * (365 / tenureDays) * 100).toFixed(2)) : interestRate);

  const dueDate = kfs?.dueDate ?? offer?.dueDate;
  const kfsDocumentUrl = resolveFileUrl(kfs?.documentUrl || kfs?.fileUrl || kfs?.previewUrl || null);

  const handleViewKfs = () => {
    setErrorMsg('');
    setShowModal(true);
  };

  const handleAccept = async () => {
    if (isAccepted) {
      onNext();
      return;
    }
    if (!isConsentChecked) {
      setErrorMsg('Please read and accept the Key Fact Statement before continuing.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      await acceptKfs(lan, {
        accepted: true,
        consentText: 'I have read and accept the KFS, charges, repayment obligation and penal charge terms.',
      });
      await onNext();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to accept KFS.');
    } finally {
      setIsLoading(false);
    }
  };

  const summaryCards = [
    { label: 'Loan amount', value: formatCurrency(loanAmount), tag: 'Sanctioned' },
    { label: 'You will receive', value: formatCurrency(netDisbursalAmount), tag: 'Into your bank', highlight: true },
    { label: 'You will repay', value: formatCurrency(totalRepaymentAmount), tag: 'Principal + interest' },
    { label: 'Interest rate', value: `${interestRate}% p.a.`, tag: 'Fixed' },
    { label: 'Annual percentage rate', value: `${apr}%`, tag: 'All-in cost' },
    { label: 'Repay by', value: `${formatDate(dueDate)}`, tag: `${tenureDays} days, one payment` },
  ];

  return (
    <StepCard
      title="The key facts of your loan"
      subtitle="Everything that matters, in one place. Read it, then accept to continue."
      icon={FileText}
    >
      {isAccepted && (
        <CompletedBadge
          title="Key facts accepted"
          description="You accepted the charges, repayment date and penal terms."
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleViewKfs}
          className={BTN_SOFT}
        >
          <Eye size={16} />
          Read the full statement
        </button>

        {kfsDocumentUrl && (
          <a
            href={kfsDocumentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={BTN_SECONDARY}
          >
            <ExternalLink size={15} /> Open the PDF
          </a>
        )}
      </div>

      {/* Financial Summary Grid */}
      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {summaryCards.map((item) => (
          <div
            key={item.label}
            className={`rounded-2xl p-5 ${item.highlight ? 'bg-[#0E3B2C] text-white' : 'bg-[#F7F9F6]'}`}
          >
            <p className={`text-xs ${item.highlight ? 'text-emerald-100/70' : 'text-slate-500'}`}>
              {item.label}
            </p>
            <p className={`mt-1.5 text-2xl font-bold tabular-nums ${item.highlight ? 'text-white' : 'text-[#13211A]'}`}>
              {item.value}
            </p>
            <p className={`mt-1 text-xs ${item.highlight ? 'text-emerald-100/60' : 'text-slate-400'}`}>
              {item.tag}
            </p>
          </div>
        ))}
      </div>

      {!isAccepted && (
        <label className="mt-7 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-5 transition hover:bg-slate-50">
          <input
            type="checkbox"
            checked={isConsentChecked}
            onChange={(event) => {
              setIsConsentChecked(event.target.checked);
              setErrorMsg('');
            }}
            disabled={isLoading}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#1F8A5B]"
          />
          <span className="text-sm leading-6 text-[#13211A]">
            I have read and accept the Key Fact Statement, the charges, my repayment obligation and
            the penal charge terms.
          </span>
        </label>
      )}

      {errorMsg && (
        <div className="mt-5">
          <InlineError message={errorMsg} />
        </div>
      )}

      <div className="mt-7 flex justify-end">
        <ActionButton onClick={handleAccept} loading={isLoading} disabled={!isAccepted && !isConsentChecked}>
          {isAccepted ? 'Continue' : 'Accept and continue'}
        </ActionButton>
      </div>

      {/* KFS Mini Statement Modal */}
      {showModal && (
        <KfsMiniStatementModal
          lan={lan}
          kfs={kfs}
          loan={loan}
          offer={offer}
          lender={lender}
          customer={customer}
          bank={bank}
          onClose={() => setShowModal(false)}
        />
      )}
    </StepCard>
  );
}

function KfsMiniStatementModal({ lan, kfs, loan, offer, lender, customer, bank, onClose }) {
  const formatCurrency = (val) => {
    if (val === null || val === undefined || val === '') return '₹0';
    return Number(val).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  };

  const formatDate = (val) => {
    if (!val) return '—';
    const date = new Date(val);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const loanAmount = Number(kfs?.loanAmount ?? offer?.approvedAmount ?? loan?.approvedAmount ?? 0);
  const tenureDays = Number(kfs?.tenureDays ?? offer?.acceptedTenureDays ?? loan?.acceptedTenureDays ?? 30);
  const interestRate = Number(kfs?.interestRate ?? offer?.acceptedInterestRate ?? 18);
  const processingFee = Number(kfs?.processingFee ?? offer?.acceptedProcessingFee ?? Math.round(loanAmount * 0.02));
  const processingFeeGst = Number(kfs?.processingFeeGst ?? Math.round(processingFee * 0.18));
  const totalCharges = processingFee + processingFeeGst;
  const netDisbursalAmount = Number(kfs?.netDisbursalAmount ?? (loanAmount - totalCharges));

  const totalInterest = Number(
    kfs?.totalInterest ??
    (kfs?.totalRepaymentAmount ? kfs.totalRepaymentAmount - loanAmount : Math.round((loanAmount * interestRate * tenureDays) / 36500))
  );

  const totalRepaymentAmount = Number(kfs?.totalRepaymentAmount ?? offer?.acceptedTotalRepayment ?? (loanAmount + totalInterest));
  const apr = kfs?.apr ?? (loanAmount > 0 ? Number((((totalInterest + totalCharges) / loanAmount) * (365 / tenureDays) * 100).toFixed(2)) : interestRate);
  const dueDate = kfs?.dueDate ?? offer?.dueDate;

  // Derived from the actual amounts above (not a hardcoded guess) so this label always
  // matches whatever percentage the backend actually charged, on this product or any other.
  const processingFeePercentLabel = loanAmount > 0 ? Number(((processingFee / loanAmount) * 100).toFixed(2)) : 0;
  const processingFeeGstPercentLabel = processingFee > 0 ? Number(((processingFeeGst / processingFee) * 100).toFixed(2)) : 0;

  const handlePrint = () => {
    window.print();
  };

  const th = 'px-4 py-3 text-xs font-semibold text-slate-500';
  const td = 'px-4 py-3.5 text-sm text-[#13211A]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#0A2318]/70 p-4 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl sm:p-9 print:max-h-none print:max-w-none print:p-0 print:shadow-none">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-6">
          <div>
            <h3 className="text-xl font-bold tracking-tight text-[#13211A] sm:text-2xl">
              Key Fact Statement
            </h3>
            <p className="mt-1.5 text-sm text-slate-500">
              Issued by {lender?.name || 'your lending partner'} · Loan account {lan}
            </p>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button onClick={handlePrint} className={BTN_SECONDARY}>
              Print or save
            </button>
            <button
              onClick={onClose}
              className="grid h-10 w-10 cursor-pointer place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Borrower & Loan Metadata */}
        <div className="mt-6 grid gap-5 rounded-2xl bg-[#F7F9F6] p-5 sm:grid-cols-2">
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-500">Borrower</p>
              <p className="mt-0.5 text-sm font-semibold text-[#13211A]">{kfs?.borrowerName || customer?.fullName || 'Borrower'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">PAN</p>
              <p className="mt-0.5 text-sm font-semibold tracking-wide text-[#13211A]">{kfs?.borrowerPan || customer?.panNumber || '—'}</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-500">Loan account number</p>
              <p className="mt-0.5 text-sm font-semibold tracking-wide text-[#0E3B2C]">{lan}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Money goes to</p>
              <p className="mt-0.5 text-sm font-semibold text-[#13211A]">
                {bank?.bankName || kfs?.bankName || 'Verified bank'} ({bank?.accountMasked || kfs?.accountMasked || 'XXXX'})
              </p>
            </div>
          </div>
        </div>

        {/* Summary Table */}
        <div className="mt-8">
          <h4 className="text-base font-bold text-[#13211A]">What this loan costs</h4>
          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full text-left">
              <thead className="bg-[#F7F9F6]">
                <tr>
                  <th className={th}>Item</th>
                  <th className={`${th} text-right`}>How it is worked out</th>
                  <th className={`${th} text-right`}>Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className={td}>Loan amount</td>
                  <td className={`${td} text-right text-slate-500`}>Principal</td>
                  <td className={`${td} text-right font-semibold tabular-nums`}>{formatCurrency(loanAmount)}</td>
                </tr>
                <tr>
                  <td className={td}>Processing fee</td>
                  <td className={`${td} text-right text-slate-500`}>{processingFeePercentLabel}% of the loan</td>
                  <td className={`${td} text-right font-semibold tabular-nums text-rose-600`}>− {formatCurrency(processingFee)}</td>
                </tr>
                <tr>
                  <td className={td}>GST</td>
                  <td className={`${td} text-right text-slate-500`}>{processingFeeGstPercentLabel}% on the fee</td>
                  <td className={`${td} text-right font-semibold tabular-nums text-rose-600`}>− {formatCurrency(processingFeeGst)}</td>
                </tr>
                <tr className="bg-[#E7F4EC]">
                  <td className={`${td} font-bold text-[#0E3B2C]`}>You receive</td>
                  <td className={`${td} text-right text-[#0E3B2C]/70`}>Into your bank account</td>
                  <td className={`${td} text-right text-base font-bold tabular-nums text-[#0E3B2C]`}>{formatCurrency(netDisbursalAmount)}</td>
                </tr>
                <tr>
                  <td className={td}>Interest</td>
                  <td className={`${td} text-right text-slate-500`}>{interestRate}% a year over {tenureDays} days</td>
                  <td className={`${td} text-right font-semibold tabular-nums`}>+ {formatCurrency(totalInterest)}</td>
                </tr>
                <tr className="bg-[#F7F9F6]">
                  <td className={`${td} font-bold`}>You repay</td>
                  <td className={`${td} text-right text-slate-500`}>By {formatDate(dueDate)}</td>
                  <td className={`${td} text-right text-base font-bold tabular-nums`}>{formatCurrency(totalRepaymentAmount)}</td>
                </tr>
                <tr>
                  <td className={td}>Annual percentage rate</td>
                  <td className={`${td} text-right text-slate-500`}>Total cost of credit per year</td>
                  <td className={`${td} text-right font-bold tabular-nums`}>{apr}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Repayment Schedule Mini Statement */}
        <div className="mt-8">
          <h4 className="text-base font-bold text-[#13211A]">Your repayment</h4>
          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full text-left">
              <thead className="bg-[#F7F9F6]">
                <tr>
                  <th className={th}>Payment</th>
                  <th className={th}>Due</th>
                  <th className={`${th} text-right`}>Principal</th>
                  <th className={`${th} text-right`}>Interest</th>
                  <th className={`${th} text-right`}>Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={`${td} font-semibold`}>One single payment</td>
                  <td className={td}>{formatDate(dueDate)}</td>
                  <td className={`${td} text-right tabular-nums`}>{formatCurrency(loanAmount)}</td>
                  <td className={`${td} text-right tabular-nums`}>{formatCurrency(totalInterest)}</td>
                  <td className={`${td} text-right font-bold tabular-nums text-[#0E3B2C]`}>{formatCurrency(totalRepaymentAmount)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Regulatory Notices */}
        <div className="mt-8 rounded-2xl bg-[#F7F9F6] p-5 text-sm leading-6 text-slate-600">
          <p className="font-bold text-[#13211A]">If you pay late</p>
          <p className="mt-1.5">
            Penal charges of 0.1% per day apply on the overdue principal after the due date. A
            bounced payment costs ₹500 plus GST each time. You also have a 3-day cooling-off
            period, during which you can exit by repaying the principal plus the proportionate APR.
          </p>
        </div>

        <div className="mt-7 flex justify-end print:hidden">
          <button onClick={onClose} className={BTN_PRIMARY}>
            Close
          </button>
        </div>

      </div>
    </div>
  );
}

function isAllowedEasebuzzUrl(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    const pathParts = url.pathname.split('/').filter(Boolean);
    // Path must contain access_key segment e.g. /pay/autocollect...
    const hasAccessKeyInPath = pathParts.length >= 2 && pathParts[pathParts.length - 1].length >= 10;
    return (
      hasAccessKeyInPath &&
      url.protocol === 'https:' &&
      (url.hostname === 'pay.easebuzz.in' || url.hostname.endsWith('.easebuzz.in'))
    );
  } catch {
    return false;
  }
}

function MandateStep({ lan, data, onNext }) {
  const isCompleted = Boolean(data?.workflow?.mandateCompleted || data?.mandate?.completed);
  const mandateData = data?.mandate || {};
  const bankData = data?.bank || {};

  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [portalUrl, setPortalUrl] = useState(mandateData.portalUrl || '');
  const [transactionId, setTransactionId] = useState(mandateData.transactionId || '');
  const [mandateStatus, setMandateStatus] = useState(mandateData.status || (isCompleted ? 'AUTHORIZED' : 'NOT_STARTED'));
  // Tracks whichever type (UPI/ENACH) the customer actually selected or is already mid-way
  // through, so "Start New Authorization Session" (used to recover a session that died —
  // SDK closed mid-flow, expired access key, etc.) resumes the SAME type instead of
  // silently defaulting back to ENACH regardless of what was in progress.
  const [selectedMandateType, setSelectedMandateType] = useState(mandateData.mandateType || 'UPI');
  // Deliberately never auto-opens from a stored portalUrl on mount: a portalUrl left over
  // from a prior session may already have been opened once (its Easebuzz access key is
  // then single-use and spent), and there's no reliable way to tell "never opened yet"
  // from "opened and closed" at this point — auto-reopening the stale one would risk the
  // same "Invalid access key" failure as the removed "Resume e-Mandate" button. The modal
  // is instead only opened fresh, from a just-succeeded initiate call (see handleInitiate).
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [consent, setConsent] = useState(isCompleted);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const pollingRef = useRef(null);

  const formatCurrency = (val) => {
    if (!val) return '—';
    return Number(val).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  };

  const mandateAmount = formatCurrency(mandateData.amount || data?.kfs?.totalRepaymentAmount || data?.offer?.acceptedTotalRepayment || data?.loan?.approvedAmount);

  const getMandateFrequencyDisplay = (freq) => {
    const f = (freq || mandateData.frequency || data?.loan?.repaymentFrequency || data?.kfs?.repaymentFrequency || data?.offer?.repaymentFrequency || 'as_presented').toString().trim().toLowerCase();
    if (f === 'as_presented' || f === 'as presented' || f === 'adhoc') return 'As & When Presented';
    if (f === 'monthly') return 'Monthly';
    if (f === 'one_time' || f === 'bullet' || f === 'single') return 'Single / As Presented';
    return f.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };
  const mandateFrequencyDisplay = getMandateFrequencyDisplay(mandateData.frequency);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setIsCheckingStatus(false);
  };

  const startPolling = (pollIntervalSeconds = 5) => {
    stopPolling();
    setIsCheckingStatus(true);

    const safeIntervalMs = Math.min(Math.max(pollIntervalSeconds || 5, 3), 15) * 1000;
    const startTime = Date.now();
    const MAX_POLL_TIME = 600000; // 10 minutes max polling time

    pollingRef.current = setInterval(async () => {
      if (Date.now() - startTime > MAX_POLL_TIME) {
        stopPolling();
        setStatusMsg('Mandate confirmation is taking longer than expected. Please refresh the status.');
        return;
      }

      try {
        const res = await getMandateStatus(lan);
        const st = String(res?.status || res?.data?.status || '').toUpperCase();
        setMandateStatus(st);

        const TERMINAL_SUCCESS = ['ACTIVE', 'SUCCESS', 'COMPLETED', 'AUTHORIZED', 'REGISTERED', 'VERIFIED'];
        const TERMINAL_FAILURE = ['FAILED', 'REJECTED', 'CANCELLED', 'CANCELED', 'EXPIRED'];

        if (TERMINAL_SUCCESS.includes(st) || res?.completed || res?.data?.completed) {
          stopPolling();
          setIsModalOpen(false);
          setStatusMsg('Mandate Authorized Successfully!');
          await onNext();
        } else if (TERMINAL_FAILURE.includes(st)) {
          stopPolling();
          setIsModalOpen(false);
          setErrorMsg('Mandate authorization failed or was rejected. Please initiate mandate authorization again.');
        }
      } catch {
        // Allow transient network errors, keep polling until max timeout
      }
    }, safeIntervalMs);
  };

  useEffect(() => {
    if (isModalOpen && !isCompleted && portalUrl && isAllowedEasebuzzUrl(portalUrl)) {
      startPolling(mandateData.pollAfterSeconds || 5);
    }
    return () => {
      stopPolling();
    };
  }, [isModalOpen, isCompleted, portalUrl, lan]);

  const handleInitiate = async (forceNew = false, mandateType = 'ENACH') => {
    if (isLoading || isCheckingStatus) return;
    if (isCompleted) {
      onNext();
      return;
    }
    if (!consent) {
      setErrorMsg('Please review and check the consent box to proceed with mandate authorization.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    setStatusMsg('');

    try {
      const res = await initiateMandate(lan, forceNew, mandateType);
      const st = String(res?.status || res?.data?.status || '').toUpperCase();
      const accessKey = res?.accessKey || res?.data?.accessKey;
      const targetUrl = res?.portalUrl || res?.data?.portalUrl;
      const txId = res?.transactionId || res?.data?.transactionId || '';
      const pollSec = res?.pollAfterSeconds || res?.data?.pollAfterSeconds || 5;
      const returnedType = res?.mandateType || res?.data?.mandateType || mandateType;
      setSelectedMandateType(returnedType);

      const TERMINAL_SUCCESS = ['ACTIVE', 'SUCCESS', 'COMPLETED', 'AUTHORIZED', 'REGISTERED', 'VERIFIED'];
      if (TERMINAL_SUCCESS.includes(st)) {
        await onNext();
        return;
      }

      setTransactionId(txId);
      setMandateStatus(st || 'INITIATED');

      // Try EaseCheckout SDK if accessKey is present
      if (accessKey) {
        try {
          const EasebuzzCheckout = await loadEasebuzzCheckout();
          const checkout = new EasebuzzCheckout('301Q6CT32Y', 'prod');
          checkout.initiatePayment({
            access_key: accessKey,
            onResponse: async () => {
              await handleManualCheckStatus();
            },
            theme: '#0E3B2C',
          });
          startPolling(pollSec);
          return;
        } catch {
          // Fall through to hosted portal window
        }
      }

      if (!targetUrl || !isAllowedEasebuzzUrl(targetUrl)) {
        throw new Error('Mandate authorization portal URL could not be verified or is not a secure Easebuzz URL.');
      }

      setPortalUrl(targetUrl);
      setIsModalOpen(true);
      const screenWidth = window.screen.availWidth || window.innerWidth;
      const screenHeight = window.screen.availHeight || window.innerHeight;
      window.open(targetUrl, 'EasebuzzMandatePortal', `width=${screenWidth},height=${screenHeight},top=0,left=0,scrollbars=yes,resizable=yes`);
      setStatusMsg('The authorization window is open. Finish there and come back to this tab.');
      startPolling(pollSec);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to initiate e-Mandate authorization');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualCheckStatus = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await refreshMandateStatus(lan);
      const st = String(res?.status || res?.data?.status || '').toUpperCase();
      setMandateStatus(st);

      const TERMINAL_SUCCESS = ['ACTIVE', 'SUCCESS', 'COMPLETED', 'AUTHORIZED', 'REGISTERED', 'VERIFIED'];
      const TERMINAL_FAILURE = ['FAILED', 'REJECTED', 'CANCELLED', 'CANCELED', 'EXPIRED'];

      if (TERMINAL_SUCCESS.includes(st) || res?.completed || res?.data?.completed) {
        stopPolling();
        setIsModalOpen(false);
        await onNext();
      } else if (TERMINAL_FAILURE.includes(st)) {
        stopPolling();
        setIsModalOpen(false);
        setErrorMsg('Mandate status check failed or was rejected. Please initiate mandate authorization again.');
      } else {
        setStatusMsg('Your bank has not confirmed the mandate yet.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Unable to refresh mandate status.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseModal = async () => {
    stopPolling();
    setIsLoading(true);
    try {
      const res = await refreshMandateStatus(lan);
      const st = String(res?.status || res?.data?.status || '').toUpperCase();
      setMandateStatus(st);

      const TERMINAL_SUCCESS = ['ACTIVE', 'SUCCESS', 'COMPLETED', 'AUTHORIZED', 'REGISTERED', 'VERIFIED'];
      if (TERMINAL_SUCCESS.includes(st) || res?.completed || res?.data?.completed) {
        setIsModalOpen(false);
        await onNext();
      } else {
        setIsModalOpen(false);
        setStatusMsg('Your mandate is not authorized yet.');
      }
    } catch {
      setIsModalOpen(false);
      setStatusMsg('Authorization window closed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <StepCard
      title="Set up automatic repayment"
      subtitle="You approve this once with your bank. We only collect what your schedule says."
      icon={CreditCard}
    >
      {isCompleted ? (
        <div>
          <CompletedBadge
            title="Automatic repayment is set up"
            description="Your bank has approved the mandate."
          />

          <div className="mb-7 grid gap-4 sm:grid-cols-2">
            <Fact label="Bank" value={mandateData.bankName || bankData.bankName || '—'} />
            <Fact label="Account number" value={mandateData.maskedAccountNumber || bankData.accountMasked || '—'} mono />
            <Fact label="Most we can ever collect" value={mandateAmount} />
            <Fact label="How often" value={mandateFrequencyDisplay} />
          </div>

          <div className="flex justify-end">
            <ActionButton onClick={onNext}>
              Continue
            </ActionButton>
          </div>
        </div>
      ) : (
        <div>
          {/* Summary Box */}
          <div className="mb-6 rounded-2xl bg-[#F7F9F6] p-5 sm:p-6">
            <h4 className="text-base font-bold text-[#13211A]">What you are approving</h4>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <p className="text-xs text-slate-500">Bank account</p>
                <p className="mt-1 text-sm font-semibold text-[#13211A]">
                  {bankData.bankName || 'Your verified account'} ({bankData.accountMasked || '—'})
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Most we can ever collect</p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-[#0E3B2C]">{mandateAmount}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Method</p>
                <p className="mt-1 text-sm font-semibold text-[#13211A]">UPI Autopay or netbanking</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">How often</p>
                <p className="mt-1 text-sm font-semibold text-[#13211A]">{mandateFrequencyDisplay}</p>
              </div>
            </div>
          </div>

          {/* Informational Note */}
          <p className="mb-6 flex items-start gap-2.5 text-sm leading-6 text-slate-500">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#1F8A5B]" />
            Nothing is debited while you set this up. Money is only collected on your repayment
            date, up to the limit shown above.
          </p>

          <label
            htmlFor="mandateConsent"
            className={`mb-6 flex cursor-pointer items-start gap-3 rounded-2xl border p-5 transition ${
              consent ? 'border-[#1F8A5B] bg-[#E7F4EC]' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <input
              type="checkbox"
              id="mandateConsent"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                setErrorMsg('');
              }}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#1F8A5B]"
            />
            <span className="text-sm leading-6 text-[#13211A]">
              I authorise my lender to set up an electronic mandate on my verified bank account for
              repayments under this loan.
            </span>
          </label>

          {errorMsg && (
            <div className="mb-5">
              <InlineError message={errorMsg} />
            </div>
          )}

          {statusMsg && !errorMsg && (
            <div className="mb-5">
              <InlineNote message={statusMsg} />
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
            {portalUrl ? (
              <button
                type="button"
                onClick={() => handleInitiate(true, selectedMandateType)}
                disabled={isLoading || isCheckingStatus || !consent}
                className={BTN_SECONDARY}
              >
                <RotateCcw size={15} />
                Start again
              </button>
            ) : <div />}

            <div className="flex flex-wrap items-center gap-3">
              {/* "Resume e-Mandate" (reopening the stored portalUrl in an iframe) was
                  removed: Easebuzz checkout access keys are single-use — the moment the
                  SDK popup opens once (see the accessKey branch above), that specific key
                  is consumed with Easebuzz, so reloading the same portalUrl a second time
                  always returns "Invalid access key" once the customer has actually seen
                  the popup and closed it. "Start New Authorization Session" is the only
                  reliable recovery path since it always requests a genuinely fresh key. */}

              {!portalUrl ? (
                <>
                  <ActionButton
                    onClick={() => handleInitiate(false, 'ENACH')}
                    loading={isLoading || isCheckingStatus}
                    disabled={!consent}
                    variant="slate"
                  >
                    Use netbanking or debit card
                  </ActionButton>
                  <ActionButton
                    onClick={() => handleInitiate(false, 'UPI')}
                    loading={isLoading || isCheckingStatus}
                    disabled={!consent}
                  >
                    Use UPI Autopay
                  </ActionButton>
                </>
              ) : (
                <ActionButton
                  onClick={() => handleInitiate(false)}
                  loading={isLoading || isCheckingStatus}
                  disabled={!consent}
                >
                  {isCheckingStatus ? 'Checking' : 'Open the authorization window'}
                </ActionButton>
              )}
            </div>
          </div>

          {!consent && !isLoading && (
            <p className="mt-3 flex items-center justify-end gap-1.5 text-sm text-slate-500">
              Tick the box above to continue
            </p>
          )}

          {/* Secure Same-Page Modal Overlay - Full Screen */}
          {isModalOpen && portalUrl && isAllowedEasebuzzUrl(portalUrl) && (
            <div className="fixed inset-0 z-50 flex flex-col bg-white animate-in fade-in duration-200">
              <div className="relative flex h-full w-full flex-col overflow-hidden bg-white">
                {/* Modal Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3.5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <h3 className="text-base font-bold text-[#13211A]">Authorizing with your bank</h3>
                    {mandateStatus && (
                      <span className="w-fit rounded-full bg-[#E7F4EC] px-3 py-1 text-xs font-semibold text-[#0E3B2C]">
                        {mandateStatus.toLowerCase().replace(/_/g, ' ')}
                      </span>
                    )}
                    {transactionId && (
                      <span className="w-fit text-xs text-slate-400">{transactionId}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => window.open(portalUrl, '_blank', 'noopener,noreferrer')}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[#E7F4EC] px-4 py-2 text-sm font-semibold text-[#0E3B2C] transition hover:bg-[#D5EDDF]"
                      title="Open in a new window if this frame is blocked"
                    >
                      <ExternalLink size={14} />
                      Open in a new tab
                    </button>
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      disabled={isLoading}
                      className="cursor-pointer rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      title="Close"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>

                {/* Modal Body / Iframe */}
                <div className="relative w-full flex-1 overflow-hidden bg-white">
                  <iframe
                    src={portalUrl}
                    title="Easebuzz e-Mandate Authorization"
                    className="h-full w-full border-0 bg-white"
                    allow="payment"
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                </div>

                {/* Modal Footer */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5">
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <LoaderCircle className="h-4 w-4 animate-spin text-[#1F8A5B]" />
                    <span>Waiting for your bank to confirm…</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleManualCheckStatus}
                      disabled={isLoading}
                      className={BTN_SECONDARY}
                    >
                      {isLoading ? <LoaderCircle size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                      Refresh
                    </button>
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className={BTN_SECONDARY}
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </StepCard>
  );
}

function EsignStep({ lan, data, onNext }) {
  const isCompleted = Boolean(data?.workflow?.esignCompleted || data?.esign?.completed);

  const [isLoading, setIsLoading] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewBlobUrl, setPreviewBlobUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [documentViewed, setDocumentViewed] = useState(false);
  const [consent, setConsent] = useState(isCompleted);
  const [otpSessionId, setOtpSessionId] = useState('');
  const [maskedMobile, setMaskedMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [downloadingDoc, setDownloadingDoc] = useState('');

  useEffect(() => {
    return () => {
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    };
  }, [previewBlobUrl]);

  // Countdown Timers
  const [expiresTimer, setExpiresTimer] = useState(0);
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    let interval = null;
    if (expiresTimer > 0 || resendTimer > 0) {
      interval = setInterval(() => {
        setExpiresTimer((prev) => Math.max(0, prev - 1));
        setResendTimer((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [expiresTimer, resendTimer]);

  const handleOpenPreview = async () => {
    setIsPreviewOpen(true);
    setErrorMsg('');
    setPreviewLoading(true);
    try {
      const blobUrl = await fetchAuthenticatedBlobUrl(`/customer/loans/${lan}/electronic-sign/document`);
      setPreviewBlobUrl(blobUrl);
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to load the agreement preview.');
    } finally {
      setPreviewLoading(false);
    }
    try {
      await markDocumentViewed(lan);
      setDocumentViewed(true);
    } catch {
      setDocumentViewed(true);
    }
  };

  const handleDownloadDocument = async (kind) => {
    setDownloadingDoc(kind);
    setErrorMsg('');
    try {
      const endpoint = kind === 'accepted'
        ? `/customer/loans/${lan}/electronic-sign/accepted-document`
        : `/customer/loans/${lan}/electronic-sign/audit-certificate`;
      const blobUrl = await fetchAuthenticatedBlobUrl(endpoint);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = kind === 'accepted' ? `${lan}-accepted-agreement.pdf` : `${lan}-audit-certificate.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to download the document.');
    } finally {
      setDownloadingDoc('');
    }
  };

  const handleSendOtp = async () => {
    if (!documentViewed) {
      setErrorMsg('Please view the loan agreement document before requesting OTP.');
      return;
    }
    if (!consent) {
      setErrorMsg('Please check the consent box to proceed.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    setStatusMsg('');
    try {
      await prepareElectronicSign(lan);
      const res = await sendSigningOtp(lan, true);
      setOtpSessionId(res.otpSessionId);
      setMaskedMobile(res.maskedMobile);
      setOtpSent(true);
      setExpiresTimer(res.expiresInSeconds || 300);
      setResendTimer(res.resendAfterSeconds || 60);
      setStatusMsg(`We sent a code to ${res.maskedMobile}.`);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to send OTP.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.trim().length !== 6) {
      setErrorMsg('Please enter a valid 6-digit OTP.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    setStatusMsg('');
    try {
      await verifySigningOtp(lan, otpSessionId, otp.trim());
      setStatusMsg('Agreement Electronically Accepted Successfully!');
      await onNext();
    } catch (err) {
      setErrorMsg(err.message || 'OTP verification failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <StepCard
      title="Read and sign your agreement"
      subtitle="Open the agreement, then sign it with a code sent to your mobile."
      icon={PenLine}
    >
      {isCompleted ? (
        <div>
          <CompletedBadge
            title="Agreement signed"
            description="Signed with an OTP from your registered mobile number."
          />

          {errorMsg && (
            <div className="mb-6">
              <InlineError message={errorMsg} />
            </div>
          )}

          <div className="mb-7 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => handleDownloadDocument('accepted')}
              disabled={downloadingDoc === 'accepted'}
              className={BTN_SOFT}
            >
              {downloadingDoc === 'accepted' ? <LoaderCircle size={15} className="animate-spin" /> : <ExternalLink size={15} />}
              Download your agreement
            </button>

            <button
              type="button"
              onClick={() => handleDownloadDocument('audit')}
              disabled={downloadingDoc === 'audit'}
              className={BTN_SECONDARY}
            >
              {downloadingDoc === 'audit' ? <LoaderCircle size={15} className="animate-spin" /> : <ExternalLink size={15} />}
              Download the signing certificate
            </button>
          </div>

          <div className="flex justify-end">
            <ActionButton onClick={onNext}>
              Continue
            </ActionButton>
          </div>
        </div>
      ) : (
        <div>
          {/* Information & Preview Action */}
          <div className="mb-7 rounded-2xl bg-[#F7F9F6] p-5 sm:p-6">
            <h4 className="text-base font-bold text-[#13211A]">Read it before you sign</h4>
            <p className="mt-1.5 text-sm leading-6 text-slate-500">
              Open your loan agreement and read it through. Then tick the box and enter the code we
              send to your registered mobile number.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleOpenPreview}
                className={BTN_SOFT}
              >
                <Eye size={16} />
                Open the agreement
              </button>
              {documentViewed && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-sm font-semibold text-[#0E3B2C]">
                  <CheckCircle2 size={15} className="text-[#1F8A5B]" />
                  Opened
                </span>
              )}
            </div>
          </div>

          {/* Consent Checkbox */}
          <label
            htmlFor="esignConsent"
            className={`mb-6 flex items-start gap-3 rounded-2xl border p-5 transition ${
              !documentViewed
                ? 'cursor-not-allowed border-slate-200 opacity-60'
                : consent
                  ? 'cursor-pointer border-[#1F8A5B] bg-[#E7F4EC]'
                  : 'cursor-pointer border-slate-200 hover:bg-slate-50'
            }`}
          >
            <input
              type="checkbox"
              id="esignConsent"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              disabled={!documentViewed}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#1F8A5B] disabled:opacity-50"
            />
            <span className="text-sm leading-6 text-[#13211A]">
              I have read and understood the loan agreement, and I agree to sign it electronically
              using the code sent to my verified mobile number. I understand that my session,
              document hash, timestamp, IP address and device details are recorded as proof of this
              signature.
            </span>
          </label>

          {errorMsg && (
            <div className="mb-5">
              <InlineError message={errorMsg} />
            </div>
          )}

          {statusMsg && !errorMsg && (
            <div className="mb-5">
              <InlineNote message={statusMsg} />
            </div>
          )}

          {/* OTP Generation & Entry Form */}
          {!otpSent ? (
            <div>
              <div className="flex justify-end">
                <ActionButton
                  onClick={handleSendOtp}
                  loading={isLoading}
                  disabled={!documentViewed || !consent}
                >
                  Send me the code
                </ActionButton>
              </div>
              {(!documentViewed || !consent) && !isLoading && (
                <p className="mt-3 text-right text-sm text-slate-500">
                  {!documentViewed ? 'Open the agreement first' : 'Tick the box above to continue'}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-2xl bg-[#F7F9F6] p-5 sm:p-6">
              <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <p className="text-base font-bold text-[#13211A]">
                  Enter the 6-digit code
                </p>
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <span>Sent to {maskedMobile}</span>
                  {expiresTimer > 0 && (
                    <span className="tabular-nums text-[#1F8A5B]">
                      Expires in {Math.floor(expiresTimer / 60)}:{(expiresTimer % 60).toString().padStart(2, '0')}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <OtpInput length={6} value={otp} onChange={setOtp} autoFocus />

                <div className="flex flex-wrap items-center gap-2">
                  <ActionButton
                    onClick={handleVerifyOtp}
                    loading={isLoading}
                    disabled={otp.length !== 6}
                  >
                    Sign the agreement
                  </ActionButton>

                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={isLoading || resendTimer > 0}
                    className={BTN_SECONDARY}
                  >
                    {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend the code'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Document Preview Modal */}
          {isPreviewOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A2318]/70 p-3 backdrop-blur-sm animate-in fade-in duration-200 sm:p-6">
              <div className="relative flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl sm:h-[85vh]">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <h3 className="text-base font-bold text-[#13211A]">Your loan agreement</h3>
                  <button
                    type="button"
                    onClick={() => setIsPreviewOpen(false)}
                    className="cursor-pointer rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="relative w-full flex-1 overflow-hidden bg-slate-100">
                  {previewLoading ? (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-slate-500">
                      <LoaderCircle className="h-6 w-6 animate-spin text-[#1F8A5B]" />
                      <span className="text-sm">Loading your agreement…</span>
                    </div>
                  ) : previewBlobUrl ? (
                    <iframe
                      src={previewBlobUrl}
                      title="Personal Loan Agreement Preview"
                      className="h-full w-full border-0"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center text-slate-500">
                      <AlertCircle className="h-6 w-6 text-rose-500" />
                      <span className="text-sm">{errorMsg || 'We could not load the agreement.'}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-4 border-t border-slate-100 px-5 py-4">
                  <span className="text-sm text-slate-500">Read every page before you sign.</span>
                  <button
                    type="button"
                    onClick={() => setIsPreviewOpen(false)}
                    className={BTN_PRIMARY}
                  >
                    Done reading
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </StepCard>
  );
}

function DisbursalStep({ lan, data, onRefresh: _onRefresh, onGoToStep }) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const isDisbursed = data?.workflow?.currentStep === 'DISBURSED' || data?.loan?.status === 'DISBURSED';
  const workflow = data?.workflow || {};

  const missingSteps = [];
  if (!workflow.offerAccepted) missingSteps.push({ id: 'APPROVAL_SUMMARY', name: 'Accept your offer' });
  if (!workflow.digilockerVerified) missingSteps.push({ id: 'DIGILOCKER_KYC', name: 'Aadhaar check' });
  if (!workflow.addressConfirmed) missingSteps.push({ id: 'ADDRESS_CONFIRMATION', name: 'Confirm your address' });
  if (!workflow.bankVerified) missingSteps.push({ id: 'BANK_VERIFICATION', name: 'Verify your bank account' });
  if (!workflow.kfsAccepted) missingSteps.push({ id: 'KFS_ACCEPTANCE', name: 'Accept the key facts' });
  if (!workflow.mandateCompleted) missingSteps.push({ id: 'EMANDATE', name: 'Set up automatic repayment' });
  if (!workflow.esignCompleted) missingSteps.push({ id: 'ESIGN', name: 'Sign your agreement' });

  const allCompleted = missingSteps.length === 0;

  const handleRequest = async () => {
    if (!allCompleted) {
      setErrorMsg('Please complete all preceding steps before requesting disbursal.');
      return;
    }
    setIsLoading(true);
    setErrorMsg('');
    try {
      await requestDisbursal(lan);
      navigate(`/customer/loan/${encodeURIComponent(lan)}/details`, {
        replace: true,
        state: { disbursalRequested: true },
      });
    } catch (err) {
      setErrorMsg(err.message || 'Failed to request disbursal');
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (val) => val ? Number(val).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }) : '—';
  const disbursalAmount = formatCurrency(data?.kfs?.netDisbursalAmount || data?.loan?.approvedAmount);

  return (
    <StepCard
      title={isDisbursed ? 'Your money is on its way' : 'Ready for your money'}
      subtitle={
        isDisbursed
          ? 'The loan has been sent to your bank account.'
          : allCompleted
            ? 'Everything is done. Ask for your money below.'
            : 'A couple of things are still pending.'
      }
      icon={Landmark}
    >
      {/* Case A: Already Disbursed */}
      {isDisbursed ? (
        <div className="text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[#E7F4EC] text-[#1F8A5B] ring-8 ring-[#E7F4EC]/50">
            <CheckCircle2 size={38} />
          </div>
          <h3 className="mt-6 text-2xl font-bold tracking-tight text-[#13211A]">
            Sent to your bank
          </h3>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
            <strong className="font-semibold tabular-nums text-[#0E3B2C]">{disbursalAmount}</strong> has
            been credited to your account.
          </p>

          <div className="mx-auto mt-7 grid max-w-lg gap-4 text-left sm:grid-cols-2">
            <Fact label="Loan account number" value={data?.loan?.lan} mono />
            <Fact label="Bank" value={data?.bank?.bankName || '—'} />
            <Fact label="Account number" value={data?.bank?.accountMasked || '—'} mono />
            <Fact label="Account holder" value={data?.bank?.accountHolderName || data?.customer?.fullName || '—'} />
          </div>
        </div>
      ) : !allCompleted ? (
        /* Case B: Incomplete Steps */
        <div>
          <div className="flex items-start gap-3.5 rounded-2xl bg-amber-50 p-5">
            <AlertCircle size={20} className="mt-0.5 shrink-0 text-amber-700" />
            <div>
              <h3 className="text-base font-bold text-[#13211A]">Still to do</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                We can only send your money once these are finished.
              </p>
            </div>
          </div>

          <ul className="mt-5 space-y-3">
            {missingSteps.map((step) => (
              <li
                key={step.id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4"
              >
                <span className="text-sm font-semibold text-[#13211A]">{step.name}</span>
                <button
                  type="button"
                  onClick={() => onGoToStep(step.id)}
                  className="inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-[#1F8A5B] transition hover:text-[#0E3B2C]"
                >
                  Finish this <ChevronRight size={15} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        /* Case C: All Completed & Ready for Disbursal */
        <div className="text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[#E7F4EC] text-[#1F8A5B] ring-8 ring-[#E7F4EC]/50">
            <Landmark size={34} />
          </div>
          <h3 className="mt-6 text-2xl font-bold tracking-tight text-[#13211A]">
            Everything is done
          </h3>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
            Your bank account, key facts, mandate and agreement are all confirmed.
          </p>

          <div className="mx-auto mt-7 max-w-lg rounded-2xl bg-[#0E3B2C] p-6 text-white">
            <p className="text-sm text-emerald-100/70">You will receive</p>
            <p className="mt-2 text-4xl font-bold tracking-tight tabular-nums">{disbursalAmount}</p>
            <p className="mt-3 text-xs text-emerald-100/60">
              {data?.bank?.bankName || 'Your bank'} · {data?.bank?.accountMasked || '—'}
            </p>
          </div>

          {errorMsg && (
            <div className="mx-auto mt-5 max-w-lg text-left">
              <InlineError message={errorMsg} />
            </div>
          )}

          <div className="mt-8 flex justify-center">
            <ActionButton onClick={handleRequest} loading={isLoading}>
              Send me my money
            </ActionButton>
          </div>

          <p className="mt-4 text-xs text-slate-400">
            Most transfers reach the account within a few hours.
          </p>
        </div>
      )}
    </StepCard>
  );
}
