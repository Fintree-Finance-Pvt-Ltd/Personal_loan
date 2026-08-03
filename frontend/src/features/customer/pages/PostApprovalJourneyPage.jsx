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
  MapPin,
  Building2,
  FileCheck2,
  CreditCard,
  PenLine,
  Landmark,
  ChevronRight,
  ShieldCheck,
  ExternalLink,
  Eye,
  X,
} from 'lucide-react';
import { getCustomerAccessToken } from '../customerApi';
import {
  getPostApprovalJourney,
  acceptLoanOffer,
  initiateDigilocker,
  getDigilockerStatus,
  saveAddress,
  verifyBankAccount,
  acceptKfs,
  initiateMandate,
  getMandateStatus,
  refreshMandateStatus,
  initiateEsign,
  requestDisbursal,
  prepareElectronicSign,
  markDocumentViewed,
  sendSigningOtp,
  verifySigningOtp,
  getElectronicSignStatus,
} from '../postApprovalApi';
import { loadEasebuzzCheckout } from '../utils/loadEasebuzzCheckout';

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
      <div className="flex min-h-[400px] flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white text-center shadow-sm">
        <LoaderCircle className="h-10 w-10 animate-spin text-emerald-600" />
        <p className="mt-4 text-sm font-medium text-slate-600">Loading your loan journey details…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50/50 p-8 text-center shadow-sm">
        <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
        <h2 className="mt-3 text-lg font-bold text-slate-900">Something went wrong</h2>
        <p className="mt-1 text-sm text-slate-600">{error}</p>
        <button
          type="button"
          onClick={fetchJourney}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-emerald-700 cursor-pointer"
        >
          <RotateCcw size={16} /> Try Again
        </button>
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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header banner */}
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-500 p-6 text-white shadow-xl sm:p-8">
        <div className="relative z-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-200">Final Disbursal Journey</p>
          <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">
            {isDisbursed ? 'Loan Disbursed Successfully!' : 'Complete Your Loan Steps'}
          </h1>
          <p className="mt-1 text-sm text-emerald-100">
            LAN: <span className="font-mono font-bold text-white">{data?.loan?.lan || normalizedLan}</span>
          </p>

          {/* Progress */}
          <div className="mt-5 w-full max-w-sm rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between text-sm">
              <span className="text-emerald-100">Progress</span>
              <strong>{progress}% Complete</strong>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Steps progress strip */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex overflow-x-auto">
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
                className={`flex min-w-[90px] flex-1 flex-col items-center gap-1.5 border-b-2 px-3 py-3 text-center transition-colors cursor-pointer disabled:cursor-not-allowed ${isActive
                  ? 'border-emerald-600 bg-emerald-50'
                  : isDone
                    ? 'border-emerald-400 bg-emerald-50/50 hover:bg-emerald-50'
                    : 'border-transparent bg-white opacity-60'
                  }`}
              >
                <div
                  className={`grid h-8 w-8 place-items-center rounded-full transition ${isDone
                    ? 'bg-emerald-500 text-white'
                    : isActive
                      ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-400'
                      : 'bg-slate-100 text-slate-400'
                    }`}
                >
                  {isDone ? <CheckCircle2 size={16} /> : <Icon size={15} />}
                </div>
                <p
                  className={`text-[11px] font-semibold leading-tight ${isActive ? 'text-emerald-900 font-bold' : isDone ? 'text-emerald-700' : 'text-slate-400'
                    }`}
                >
                  {step.label}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Active step content */}
      <div>
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
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-4 border-b border-slate-100 bg-slate-50/60 px-6 py-5">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
          <Icon size={22} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      <div className="p-6 sm:p-8">{children}</div>
    </div>
  );
}

function ActionButton({ onClick, disabled, loading, children, variant = 'primary', type = 'button' }) {
  const base = 'inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold shadow transition disabled:opacity-50 cursor-pointer';
  const styles = {
    primary: 'bg-emerald-600 text-white hover:bg-emerald-700',
    blue: 'bg-blue-600 text-white hover:bg-blue-700',
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
    <div className="mb-6 flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-emerald-900">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white">
          <ShieldCheck size={20} />
        </div>
        <div>
          <h4 className="text-sm font-bold">{title || 'Step Completed'}</h4>
          {description && <p className="text-xs text-emerald-700 mt-0.5">{description}</p>}
        </div>
      </div>
      <span className="rounded-lg bg-emerald-200/60 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-emerald-800">
        Saved in DB
      </span>
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
    <StepCard title="Loan Offer Details" subtitle="Review your approved loan offer and selected tenure." icon={BadgeCheck}>
      {isAccepted ? (
        <CompletedBadge
          title="Loan Offer Accepted"
          description={`Selected tenure: ${data?.offer?.acceptedTenureDays} Days`}
        />
      ) : (
        <div className="mb-6 flex flex-col items-center rounded-2xl bg-emerald-50 py-8 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-600 ring-8 ring-emerald-50">
            <CheckCircle2 size={36} />
          </div>
          <h3 className="mt-4 text-xl font-extrabold text-slate-900">Your Loan is Approved!</h3>
          <p className="mt-1 text-sm text-slate-500">
            Approved by <strong>{data?.lender?.name || 'Fintree Finance'}</strong>
          </p>
        </div>
      )}

      {/* Details grid */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-semibold text-slate-500">Loan Account Number (LAN)</p>
          <p className="mt-1 font-mono text-lg font-bold text-slate-900">{data?.loan?.lan}</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-xs font-semibold text-slate-500">Approved Amount</p>
          <p className="mt-1 text-lg font-bold text-emerald-700">{approvedAmount}</p>
        </div>
      </div>

      {/* Tenure selection */}
      {!isAccepted ? (
        <div className="mb-8">
          <p className="mb-3 text-sm font-bold text-slate-900">Select Repayment Tenure</p>
          <div className="flex flex-wrap gap-3">
            {tenures.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedTenure(t)}
                className={`rounded-xl border px-5 py-2.5 text-sm font-semibold transition ${selectedTenure === t
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm'
                  : 'border-slate-200 text-slate-600 hover:border-emerald-300 hover:bg-slate-50'
                  }`}
              >
                {t} Days
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500">Tenure</p>
            <p className="mt-1 text-base font-bold text-slate-900">{data?.offer?.acceptedTenureDays} Days</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500">Monthly EMI</p>
            <p className="mt-1 text-base font-bold text-slate-900">{formatCurrency(data?.offer?.acceptedEmiAmount)}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500">Total Repayment</p>
            <p className="mt-1 text-base font-bold text-slate-900">{formatCurrency(data?.offer?.acceptedTotalRepayment)}</p>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <ActionButton onClick={handleAccept} loading={isAccepting}>
          {isAccepted ? 'Proceed to KYC' : 'Accept Offer & Continue'}
        </ActionButton>
      </div>
    </StepCard>
  );
}

function DigiLockerStep({ lan, data, onNext }) {
  const isVerified = Boolean(data?.workflow?.digilockerVerified || data?.digilocker?.status === 'VERIFIED');

  const [isLoading, setIsLoading] = useState(false);
  const [consent, setConsent] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeKycUrl, setActiveKycUrl] = useState(null);
  const [isVerifyingInPopup, setIsVerifyingInPopup] = useState(false);

  const startPolling = () => {
    const startTime = Date.now();
    const interval = setInterval(async () => {
      try {
        if (Date.now() - startTime > 300000) {
          clearInterval(interval);
          setIsVerifyingInPopup(false);
          setActiveKycUrl(null);
          setErrorMsg('Verification timed out. Please try again.');
          return;
        }

        const res = await getDigilockerStatus(lan);
        if (res?.status === 'VERIFIED') {
          clearInterval(interval);
          setIsVerifyingInPopup(false);
          setActiveKycUrl(null);
          onNext();
        } else if (res?.status === 'FAILED') {
          clearInterval(interval);
          setIsVerifyingInPopup(false);
          setActiveKycUrl(null);
          setErrorMsg('Aadhaar verification failed. Please try again.');
        }
      } catch (e) {
        // Ignore polling errors
      }
    }, 3000);
  };

  const openPopupUrl = (url) => {
    const width = 650;
    const height = 750;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const popup = window.open(
      url,
      'DigitapDigiLocker',
      `width=${width},height=${height},top=${top},left=${left},toolbar=no,menubar=no,location=no,status=no,scrollbars=yes,resizable=yes`
    );

    if (popup) popup.focus();
  };

  const handleInitiate = async () => {
    if (isVerified) {
      onNext();
      return;
    }
    if (!consent) {
      setErrorMsg('Please check the consent box to proceed.');
      return;
    }

    setErrorMsg('');
    setIsLoading(true);
    try {
      const responseData = await initiateDigilocker(lan);

      if (responseData.status === 'VERIFIED') {
        onNext();
        return;
      }

      const targetUrl = responseData?.kycUrl || responseData?.url;
      if (!targetUrl) {
        throw new Error('DigiLocker verification URL was not generated.');
      }

      setActiveKycUrl(targetUrl);
      setIsVerifyingInPopup(true);
      openPopupUrl(targetUrl);
      startPolling();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to initiate DigiLocker');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <StepCard title="Aadhaar KYC via DigiLocker" subtitle="Complete your identity verification using DigiLocker." icon={FileCheck2}>
      {isVerified ? (
        <div>
          <CompletedBadge
            title="Aadhaar KYC Verified"
            description={`Masked Aadhaar: ${data?.digilocker?.maskedAadhaar || 'XXXX-XXXX-XXXX'}`}
          />
          <div className="mb-6 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500">Applicant Verified Name</p>
            <p className="mt-1 text-base font-bold text-slate-900">{data?.customer?.fullName || '—'}</p>
          </div>
          <div className="flex justify-end">
            <ActionButton onClick={onNext}>
              Proceed to Address Confirmation
            </ActionButton>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
            <p className="font-semibold">What you'll need:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-blue-700">
              <li>Your Aadhaar-linked mobile number</li>
              <li>Active DigiLocker account (or you can create one)</li>
            </ul>
          </div>

          <div className="mb-6 flex items-start gap-3">
            <input
              type="checkbox"
              id="consent"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                setErrorMsg('');
              }}
              className="mt-1 h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
            />
            <label htmlFor="consent" className="text-sm text-slate-700 cursor-pointer">
              I consent to securely fetch and process my Aadhaar information through DigiLocker for identity verification and loan processing.
            </label>
          </div>

          {errorMsg && (
            <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {isVerifyingInPopup ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900 mb-4">
              <div className="flex items-center gap-3">
                <LoaderCircle className="h-6 w-6 animate-spin text-amber-600" />
                <div>
                  <p className="font-bold text-base">DigiLocker Verification in Progress</p>
                  <p className="text-xs text-amber-700 mt-0.5">Please complete your DigiLocker login in the window that opened.</p>
                </div>
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => activeKycUrl && openPopupUrl(activeKycUrl)}
                  className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 transition"
                >
                  Re-open Verification Window
                </button>
              </div>
            </div>
          ) : (
            <ActionButton onClick={handleInitiate} loading={isLoading} disabled={!consent} variant="blue">
              Verify Aadhaar
            </ActionButton>
          )}
        </div>
      )}
    </StepCard>
  );
}

function AddressConfirmationStep({ lan, data, onNext }) {
  const isConfirmed = Boolean(data?.workflow?.addressConfirmed);
  const [sameAsPermanent, setSameAsPermanent] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const permAddr = data?.digilocker?.permanentAddress;
  const currentAddr = data?.address;

  const handleSave = async () => {
    if (isConfirmed) {
      onNext();
      return;
    }
    setIsSaving(true);
    try {
      await saveAddress(lan, { sameAsPermanent });
      onNext();
    } catch (err) {
      alert(err.message || 'Failed to save address');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <StepCard title="Address Confirmation" subtitle="Confirm your current residential address." icon={MapPin}>
      {isConfirmed ? (
        <div>
          <CompletedBadge
            title="Address Confirmed"
            description={currentAddr?.formattedAddress || (permAddr?.formattedAddress ? 'Same as Aadhaar Permanent Address' : 'Residential address confirmed')}
          />
          {currentAddr && (
            <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Current Residential Address</p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {[currentAddr.addressLine1, currentAddr.addressLine2, currentAddr.city, currentAddr.state, currentAddr.pincode].filter(Boolean).join(', ')}
              </p>
            </div>
          )}
          <div className="flex justify-end">
            <ActionButton onClick={onNext}>
              Proceed to Bank Verification
            </ActionButton>
          </div>
        </div>
      ) : (
        <div>
          {permAddr && (
            <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Aadhaar Address</p>
              <p className="mt-2 text-sm font-medium text-slate-900">{permAddr.formattedAddress || 'Address details missing'}</p>
            </div>
          )}
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={sameAsPermanent}
              onChange={e => setSameAsPermanent(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded border-slate-300 text-emerald-600"
            />
            <span className="text-sm font-semibold text-slate-900">
              My current address is the same as my Aadhaar address
            </span>
          </label>
          <div className="mt-8 flex justify-end">
            <ActionButton onClick={handleSave} loading={isSaving}>
              Confirm Address
            </ActionButton>
          </div>
        </div>
      )}
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
    if (!validate()) return;

    setIsLoading(true);
    setErrorMsg('');

    try {
      const payload = {
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
    `w-full rounded-xl border bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:ring-4 disabled:bg-slate-100 disabled:cursor-not-allowed ${fieldErrors[fieldName]
      ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
      : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100'
    }`;

  return (
    <StepCard
      title="Bank Account Verification"
      subtitle="Enter the bank account details where your loan will be disbursed."
      icon={Landmark}
    >
      {isVerified ? (
        <div>
          <CompletedBadge
            title="Bank Account Verified (Penny Drop Success)"
            description="Verified by ₹1.00 instant deposit into account"
          />

          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">Account Holder Name</p>
              <p className="mt-1 text-base font-bold text-slate-900">{bankData.accountHolderName || '—'}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">Bank Name</p>
              <p className="mt-1 text-base font-bold text-slate-900">{bankData.bankName || '—'}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">Account Number</p>
              <p className="mt-1 font-mono text-base font-bold text-slate-900">{bankData.accountMasked || '—'}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">IFSC Code</p>
              <p className="mt-1 font-mono text-base font-bold text-slate-900">{bankData.ifsc || '—'}</p>
            </div>
          </div>

          <div className="flex justify-end">
            <ActionButton onClick={onNext}>
              Proceed to KFS Acceptance
            </ActionButton>
          </div>
        </div>
      ) : (
        <div>
          {/* Penny Drop Info Card */}
          <div className="mb-6 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50/80 to-indigo-50/50 p-4 sm:p-5">
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-blue-900">
                  Instant ₹1.00 Penny Drop Verification
                </h4>
                <p className="mt-1 text-xs text-blue-700 leading-relaxed">
                  We will deposit ₹1.00 into your account to verify your name and ownership. Please ensure the account belongs to the applicant.
                </p>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/90 p-4 text-xs font-medium text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <div className="flex-1 leading-relaxed">{errorMsg}</div>
            </div>
          )}

          <form onSubmit={handleVerify} className="space-y-5">
            <div>
              <label htmlFor="accountHolderName" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                Account Holder Name <span className="text-red-500">*</span>
              </label>
              <input
                id="accountHolderName"
                name="accountHolderName"
                type="text"
                placeholder="e.g. VISHAL YADAV (as per bank records)"
                value={formData.accountHolderName}
                onChange={handleChange}
                disabled={isLoading}
                className={inputClass('accountHolderName')}
              />
              {fieldErrors.accountHolderName && (
                <p className="mt-1.5 text-xs text-red-600 font-medium">{fieldErrors.accountHolderName}</p>
              )}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="accountNumber" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Bank Account Number <span className="text-red-500">*</span>
                </label>
                <input
                  id="accountNumber"
                  name="accountNumber"
                  type="text"
                  inputMode="numeric"
                  placeholder="Enter 9–20 digit account number"
                  value={formData.accountNumber}
                  onChange={handleChange}
                  disabled={isLoading}
                  className={inputClass('accountNumber')}
                />
                {fieldErrors.accountNumber && (
                  <p className="mt-1.5 text-xs text-red-600 font-medium">{fieldErrors.accountNumber}</p>
                )}
              </div>

              <div>
                <label htmlFor="confirmAccountNumber" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Confirm Account Number <span className="text-red-500">*</span>
                </label>
                <input
                  id="confirmAccountNumber"
                  name="confirmAccountNumber"
                  type="text"
                  inputMode="numeric"
                  placeholder="Re-enter account number"
                  value={formData.confirmAccountNumber}
                  onChange={handleChange}
                  onPaste={(e) => e.preventDefault()}
                  disabled={isLoading}
                  className={inputClass('confirmAccountNumber')}
                />
                {fieldErrors.confirmAccountNumber && (
                  <p className="mt-1.5 text-xs text-red-600 font-medium">{fieldErrors.confirmAccountNumber}</p>
                )}
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="ifscCode" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  IFSC Code <span className="text-red-500">*</span>
                </label>
                <input
                  id="ifscCode"
                  name="ifscCode"
                  type="text"
                  placeholder="e.g. HDFC0001234"
                  value={formData.ifscCode}
                  onChange={handleChange}
                  disabled={isLoading}
                  className={`${inputClass('ifscCode')} uppercase tracking-wider font-mono`}
                />
                {fieldErrors.ifscCode && (
                  <p className="mt-1.5 text-xs text-red-600 font-medium">{fieldErrors.ifscCode}</p>
                )}
              </div>

              <div>
                <label htmlFor="accountType" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Account Type <span className="text-red-500">*</span>
                </label>
                <select
                  id="accountType"
                  name="accountType"
                  value={formData.accountType}
                  onChange={handleChange}
                  disabled={isLoading}
                  className={inputClass('accountType')}
                >
                  <option value="SAVINGS">Savings Account</option>
                  <option value="CURRENT">Current Account</option>
                </select>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="bankName" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Bank Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="bankName"
                  name="bankName"
                  type="text"
                  placeholder="e.g. HDFC Bank Ltd"
                  value={formData.bankName}
                  onChange={handleChange}
                  disabled={isLoading}
                  className={inputClass('bankName')}
                />
                {fieldErrors.bankName && (
                  <p className="mt-1.5 text-xs text-red-600 font-medium">{fieldErrors.bankName}</p>
                )}
              </div>

              <div>
                <label htmlFor="branchName" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Branch Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="branchName"
                  name="branchName"
                  type="text"
                  placeholder="e.g. Andheri West"
                  value={formData.branchName}
                  onChange={handleChange}
                  disabled={isLoading}
                  className={inputClass('branchName')}
                />
                {fieldErrors.branchName && (
                  <p className="mt-1.5 text-xs text-red-600 font-medium">{fieldErrors.branchName}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-100 p-3.5 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-emerald-600" />
                <span>256-bit AES Encrypted Storage</span>
              </div>
              <span className="font-semibold text-slate-700">PCI-DSS Compliant</span>
            </div>

            <div className="mt-8 flex justify-end pt-2">
              <ActionButton type="submit" onClick={handleVerify} loading={isLoading} variant="blue">
                Send ₹1.00 & Verify Bank
              </ActionButton>
            </div>
          </form>
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

  const kfs = data?.kfs || {};
  const loan = data?.loan || {};
  const offer = data?.offer || {};
  const lender = data?.lender || {};

  const formatCurrency = (value) => {
    if (value === null || value === undefined || value === '') return '—';
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

  const loanAmount = kfs?.loanAmount ?? offer?.approvedAmount ?? loan?.approvedAmount;
  const tenureDays = kfs?.tenureDays ?? offer?.acceptedTenureDays ?? loan?.acceptedTenureDays;
  const netDisbursalAmount = kfs?.netDisbursalAmount ?? offer?.netDisbursalAmount;
  const totalRepaymentAmount = kfs?.totalRepaymentAmount ?? offer?.acceptedTotalRepayment;
  const dueDate = kfs?.dueDate ?? offer?.dueDate;
  const kfsDocumentUrl = kfs?.documentUrl || kfs?.fileUrl || kfs?.previewUrl || null;

  const handleViewKfs = () => {
    setErrorMsg('');
    if (kfsDocumentUrl) {
      window.open(kfsDocumentUrl, '_blank', 'noopener,noreferrer');
    } else {
      setErrorMsg('Key Fact Statement document preview is generated upon acceptance.');
    }
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

  const detailItems = [
    { label: 'Loan amount', value: formatCurrency(loanAmount) },
    { label: 'Tenure', value: tenureDays ? `${tenureDays} days` : '—' },
    { label: 'Net disbursal', value: formatCurrency(netDisbursalAmount) },
    { label: 'Total repayment', value: formatCurrency(totalRepaymentAmount) },
    { label: 'Estimated Due date', value: formatDate(dueDate) },
  ];

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="p-6 sm:p-8">
        {isAccepted && (
          <CompletedBadge
            title="Key Fact Statement Accepted"
            description="Stored securely in DB with full regulatory compliance details"
          />
        )}

        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
              <FileText size={26} />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-slate-950">Key Fact Statement (KFS)</h2>
              <p className="mt-1 text-sm text-slate-500">
                Personal Loan · {lender?.name || 'Fintree Finance Private Limited'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleViewKfs}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-600 px-5 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-50"
          >
            <ExternalLink size={16} />
            View KFS
          </button>
        </div>

        <div className="mt-7 overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3">
            {detailItems.map((item, index) => (
              <div
                key={item.label}
                className={`min-h-[108px] p-5 ${index !== detailItems.length - 1 ? 'border-b border-slate-200' : ''
                  } sm:border-b ${index % 2 !== 1 ? 'sm:border-r' : ''} lg:border-b lg:border-r ${index === 2 || index === 4 ? 'lg:border-r-0' : ''
                  } ${index >= 3 ? 'lg:border-b-0' : ''}`}
              >
                <p className="text-sm font-medium text-slate-500">{item.label}</p>
                <p className="mt-2 text-xl font-extrabold text-slate-950">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {!isAccepted && (
          <label className="mt-7 flex cursor-pointer items-start gap-4 rounded-2xl border border-slate-200 p-5 transition hover:bg-slate-50">
            <input
              type="checkbox"
              checked={isConsentChecked}
              onChange={(event) => {
                setIsConsentChecked(event.target.checked);
                setErrorMsg('');
              }}
              disabled={isLoading}
              className="mt-0.5 h-6 w-6 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-semibold leading-6 text-slate-800">
              I have read and accept the KFS, charges, repayment obligation and penal charge terms.
            </span>
          </label>
        )}

        {errorMsg && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="mt-7 flex justify-end">
          <ActionButton onClick={handleAccept} loading={isLoading} disabled={!isAccepted && !isConsentChecked}>
            {isAccepted ? 'Proceed to e-Mandate' : 'Accept KFS & Continue'}
          </ActionButton>
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
  const [isModalOpen, setIsModalOpen] = useState(Boolean(mandateData.portalUrl && !isCompleted && isAllowedEasebuzzUrl(mandateData.portalUrl)));
  const [consent, setConsent] = useState(isCompleted);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const pollingRef = useRef(null);

  const formatCurrency = (val) => {
    if (!val) return '—';
    return Number(val).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  };

  const mandateAmount = formatCurrency(mandateData.amount || data?.kfs?.totalRepaymentAmount || data?.offer?.acceptedTotalRepayment || data?.loan?.approvedAmount);

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
            theme: '#0284c7',
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
      window.open(targetUrl, 'EasebuzzMandatePortal', 'width=750,height=800,scrollbars=yes,resizable=yes');
      setStatusMsg('Easebuzz e-Mandate portal opened in window. Complete authorization to finish setup.');
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
        setStatusMsg('Mandate status is still pending authorization with your bank.');
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
        setStatusMsg('Mandate authorization is still pending.');
      }
    } catch {
      setIsModalOpen(false);
      setStatusMsg('Mandate modal closed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <StepCard title="e-Mandate Setup" subtitle="Set up auto-debit for your EMI repayments via Easebuzz Autocollect." icon={CreditCard}>
      {isCompleted ? (
        <div>
          <CompletedBadge
            title="e-Mandate Authorized"
            description="Auto-debit mandate registered and authorized with your bank via Easebuzz Autocollect"
          />

          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">Bank Name</p>
              <p className="mt-1 text-base font-bold text-slate-900">{mandateData.bankName || bankData.bankName || '—'}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">Account Number</p>
              <p className="mt-1 font-mono text-base font-bold text-slate-900">{mandateData.maskedAccountNumber || bankData.accountMasked || '—'}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">Maximum Debit Amount</p>
              <p className="mt-1 text-base font-bold text-slate-900">{mandateAmount}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">Frequency</p>
              <p className="mt-1 text-base font-bold text-slate-900 uppercase">{mandateData.frequency || 'Monthly'}</p>
            </div>
          </div>

          <div className="flex justify-end">
            <ActionButton onClick={onNext}>
              Proceed to e-Sign
            </ActionButton>
          </div>
        </div>
      ) : (
        <div>
          {/* Summary Box */}
          <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50/80 p-5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-blue-900 mb-3">
              e-Mandate Authorization Summary
            </h4>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <span className="text-xs text-slate-500 block">Bank Account</span>
                <strong className="text-slate-900">{bankData.bankName || 'Verified Bank Account'} ({bankData.accountMasked || '—'})</strong>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Maximum Mandate Ceiling</span>
                <strong className="text-emerald-700">{mandateAmount}</strong>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Mandate Type</span>
                <strong className="text-slate-900">UPI Autopay / eNACH</strong>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Debit Frequency</span>
                <strong className="text-slate-900">Monthly</strong>
              </div>
            </div>
          </div>

          {/* Informational Note */}
          <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
            <p className="font-semibold text-slate-800">Important Information:</p>
            <p className="mt-1">
              Your mandate authorizes automatic EMI debit according to the repayment schedule. No amount will be debited during setup unless specifically disclosed by the provider.
            </p>
          </div>

          <div className="mb-6 flex items-start gap-3">
            <input
              type="checkbox"
              id="mandateConsent"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                setErrorMsg('');
              }}
              className="mt-1 h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer"
            />
            <label htmlFor="mandateConsent" className="text-sm text-slate-700 cursor-pointer leading-relaxed">
              I authorize Fintree Finance Private Limited to register an electronic mandate on my verified bank account for repayment obligations under this loan.
            </label>
          </div>

          {errorMsg && (
            <div className="mb-4 rounded-xl bg-red-50 p-3.5 text-sm text-red-700 flex items-start gap-2.5 border border-red-200">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
              <div className="flex-1">{errorMsg}</div>
            </div>
          )}

          {statusMsg && !errorMsg && (
            <div className="mb-4 rounded-xl bg-blue-50 p-3 text-xs text-blue-800 font-medium border border-blue-200">
              {statusMsg}
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-8 flex flex-wrap justify-between items-center gap-4 pt-2">
            {portalUrl ? (
              <button
                type="button"
                onClick={() => handleInitiate(true)}
                disabled={isLoading || isCheckingStatus || !consent}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer disabled:opacity-50"
              >
                <RotateCcw size={14} />
                <span>Start New Authorization Session</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-3">
              {portalUrl && isAllowedEasebuzzUrl(portalUrl) && (
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition cursor-pointer"
                >
                  Resume e-Mandate
                </button>
              )}

              {!portalUrl ? (
                <>
                  <ActionButton
                    onClick={() => handleInitiate(false, 'ENACH')}
                    loading={isLoading || isCheckingStatus}
                    disabled={!consent}
                    variant="slate"
                    className="!bg-slate-800 hover:!bg-slate-900 text-white"
                  >
                    Set Up via Netbanking / Debit Card
                  </ActionButton>
                  <ActionButton
                    onClick={() => handleInitiate(false, 'UPI')}
                    loading={isLoading || isCheckingStatus}
                    disabled={!consent}
                    variant="blue"
                  >
                    Set Up via UPI Autopay
                  </ActionButton>
                </>
              ) : (
                <ActionButton
                  onClick={() => handleInitiate(false)}
                  loading={isLoading || isCheckingStatus}
                  disabled={!consent}
                  variant="blue"
                >
                  {isCheckingStatus ? 'Checking Status…' : 'Re-open Mandate Portal'}
                </ActionButton>
              )}
            </div>
          </div>

          {/* Secure Same-Page Modal Overlay */}
          {isModalOpen && portalUrl && isAllowedEasebuzzUrl(portalUrl) && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="relative w-full max-w-4xl h-[90vh] sm:h-[85vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 bg-slate-50">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
                      <h3 className="text-base font-bold text-slate-900">e-Mandate Authorization</h3>
                    </div>
                    {transactionId && (
                      <span className="rounded-lg bg-slate-200/80 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
                        TxID: {transactionId}
                      </span>
                    )}
                    {mandateStatus && (
                      <span className="rounded-lg bg-blue-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-800">
                        {mandateStatus}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => window.open(portalUrl, '_blank', 'noopener,noreferrer')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-600 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition cursor-pointer"
                      title="Open in new window if provider frame is restricted"
                    >
                      <ExternalLink size={14} />
                      <span>Open Full Page</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      disabled={isLoading}
                      className="rounded-full p-2 text-slate-400 hover:bg-slate-200/80 hover:text-slate-700 transition cursor-pointer"
                      title="Close Window"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>

                {/* Modal Body / Iframe */}
                <div className="flex-1 w-full bg-white relative overflow-hidden">
                  <iframe
                    src={portalUrl}
                    title="Easebuzz e-Mandate Authorization"
                    className="h-full w-full border-0 bg-white"
                    allow="payment"
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                </div>

                {/* Modal Footer */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5 bg-slate-50 text-xs">
                  <div className="flex items-center gap-2 text-slate-600">
                    <LoaderCircle className="h-4 w-4 animate-spin text-blue-600" />
                    <span>Checking mandate status with your bank…</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleManualCheckStatus}
                      disabled={isLoading}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                    >
                      {isLoading ? <LoaderCircle size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                      <span>Refresh Status</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="rounded-lg border border-slate-300 bg-slate-200/60 px-3 py-1.5 font-semibold text-slate-800 hover:bg-slate-300 transition cursor-pointer"
                    >
                      Cancel / Close
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
  const [documentViewed, setDocumentViewed] = useState(false);
  const [consent, setConsent] = useState(isCompleted);
  const [otpSessionId, setOtpSessionId] = useState('');
  const [maskedMobile, setMaskedMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

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
    try {
      await markDocumentViewed(lan);
      setDocumentViewed(true);
    } catch {
      setDocumentViewed(true);
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
      setStatusMsg(`OTP sent to your verified mobile number (${res.maskedMobile}).`);
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

  // const previewUrl = `/api/customer/loans/${lan}/electronic-sign/document`;
  // const acceptedDocUrl = `/api/customer/loans/${lan}/electronic-sign/accepted-document`;
  // const auditCertUrl = `/api/customer/loans/${lan}/electronic-sign/audit-certificate`;

  const customerToken = getCustomerAccessToken() || '';
  const tokenQuery = customerToken ? `?token=${encodeURIComponent(customerToken)}` : '';
  const previewUrl = `/api/customer/loans/${lan}/electronic-sign/document${tokenQuery}`;
  const acceptedDocUrl = `/api/customer/loans/${lan}/electronic-sign/accepted-document${tokenQuery}`;
  const auditCertUrl = `/api/customer/loans/${lan}/electronic-sign/audit-certificate${tokenQuery}`;

  return (
    <StepCard title="e-Sign Loan Agreement" subtitle="Electronically accept your loan agreement using mobile OTP authentication." icon={PenLine}>
      {isCompleted ? (
        <div>
          <CompletedBadge
            title="Loan Agreement Electronically Accepted"
            description="Agreement electronically accepted via OTP authentication and stamped with legal evidence"
          />

          <div className="mb-6 flex flex-wrap gap-3">
            <a
              href={acceptedDocUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition cursor-pointer"
            >
              <ExternalLink size={14} />
              <span>Download Accepted Agreement</span>
            </a>

            <a
              href={auditCertUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200 transition cursor-pointer"
            >
              <ExternalLink size={14} />
              <span>Download Audit Certificate</span>
            </a>
          </div>

          <div className="flex justify-end">
            <ActionButton onClick={onNext} variant="blue">
              Proceed to Disbursal
            </ActionButton>
          </div>
        </div>
      ) : (
        <div>
          {/* Information & Preview Action */}
          <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h4 className="text-sm font-bold text-slate-900 mb-1">Electronic Agreement Acceptance</h4>
            <p className="text-xs text-slate-600 mb-4">
              Please preview your complete loan agreement. Once viewed, check the consent box and enter the OTP sent to your registered mobile number to execute acceptance.
            </p>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleOpenPreview}
                className="inline-flex items-center gap-2 rounded-xl border border-blue-600 bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition cursor-pointer"
              >
                <Eye size={15} />
                <span>View Agreement Document</span>
              </button>
              {documentViewed && (
                <span className="inline-flex items-center gap-1 font-semibold text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                  <CheckCircle2 size={13} />
                  <span>Document Viewed</span>
                </span>
              )}
            </div>
          </div>

          {/* Consent Checkbox */}
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-slate-200 p-4 bg-white shadow-xs">
            <input
              type="checkbox"
              id="esignConsent"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              disabled={!documentViewed}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-50"
            />
            <label htmlFor="esignConsent" className="text-xs leading-relaxed text-slate-700 cursor-pointer">
              I confirm that I have read and understood the Personal Loan Agreement. I consent to execute and accept this agreement electronically using the OTP sent to my verified mobile number. I acknowledge that my authenticated session, document hash, timestamp, IP address and device information will be recorded as evidence of this acceptance.
            </label>
          </div>

          {errorMsg && (
            <div className="mb-4 rounded-xl bg-red-50 p-3.5 text-xs text-red-700 flex items-start gap-2 border border-red-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {statusMsg && !errorMsg && (
            <div className="mb-4 rounded-xl bg-blue-50 p-3 text-xs text-blue-800 font-medium border border-blue-200">
              {statusMsg}
            </div>
          )}

          {/* OTP Generation & Entry Form */}
          {!otpSent ? (
            <div className="flex justify-end">
              <ActionButton
                onClick={handleSendOtp}
                loading={isLoading}
                disabled={!documentViewed || !consent}
                variant="blue"
              >
                Send Signing OTP
              </ActionButton>
            </div>
          ) : (
            <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5 mb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <label className="text-xs font-bold text-slate-900">
                  Enter 6-Digit Signing OTP
                </label>
                <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-500">
                  <span>Sent to {maskedMobile}</span>
                  {expiresTimer > 0 && (
                    <span className="text-blue-700 font-mono">
                      Expires in {Math.floor(expiresTimer / 60)}:{(expiresTimer % 60).toString().padStart(2, '0')}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full sm:w-48 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-center font-mono text-lg font-bold tracking-widest text-slate-900 focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-100"
                />

                <div className="flex items-center gap-2">
                  <ActionButton
                    onClick={handleVerifyOtp}
                    loading={isLoading}
                    disabled={otp.length !== 6}
                    variant="blue"
                  >
                    Verify & Accept Agreement
                  </ActionButton>

                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={isLoading || resendTimer > 0}
                    className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition cursor-pointer"
                  >
                    {resendTimer > 0 ? `Resend (${resendTimer}s)` : 'Resend OTP'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Document Preview Modal */}
          {isPreviewOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="relative w-full max-w-4xl h-[90vh] sm:h-[85vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 bg-slate-50">
                  <div className="flex items-center gap-2">
                    <PenLine className="h-5 w-5 text-blue-600" />
                    <h3 className="text-base font-bold text-slate-900">Personal Loan Agreement Preview</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPreviewOpen(false)}
                    className="rounded-full p-2 text-slate-400 hover:bg-slate-200/80 hover:text-slate-700 transition cursor-pointer"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="flex-1 w-full bg-slate-100 relative overflow-hidden">
                  <iframe
                    src={previewUrl}
                    title="Personal Loan Agreement Preview"
                    className="h-full w-full border-0"
                  />
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3.5 bg-slate-50 text-xs">
                  <span className="text-slate-600 font-medium">Please review all pages of your agreement before accepting.</span>
                  <button
                    type="button"
                    onClick={() => setIsPreviewOpen(false)}
                    className="rounded-xl border border-blue-600 bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 transition cursor-pointer"
                  >
                    Close Preview
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

function DisbursalStep({ lan, data, onRefresh, onGoToStep }) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const isDisbursed = data?.workflow?.currentStep === 'DISBURSED' || data?.loan?.status === 'DISBURSED';
  const workflow = data?.workflow || {};

  const missingSteps = [];
  if (!workflow.offerAccepted) missingSteps.push({ id: 'APPROVAL_SUMMARY', name: 'Offer Acceptance' });
  if (!workflow.digilockerVerified) missingSteps.push({ id: 'DIGILOCKER_KYC', name: 'Aadhaar KYC' });
  if (!workflow.addressConfirmed) missingSteps.push({ id: 'ADDRESS_CONFIRMATION', name: 'Address Confirmation' });
  if (!workflow.bankVerified) missingSteps.push({ id: 'BANK_VERIFICATION', name: 'Bank Account Verification' });
  if (!workflow.kfsAccepted) missingSteps.push({ id: 'KFS_ACCEPTANCE', name: 'Key Fact Statement (KFS)' });
  if (!workflow.mandateCompleted) missingSteps.push({ id: 'EMANDATE', name: 'e-Mandate Setup' });
  if (!workflow.esignCompleted) missingSteps.push({ id: 'ESIGN', name: 'e-Sign Loan Agreement' });

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
      await onRefresh();
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
      title={isDisbursed ? 'Loan Disbursed!' : 'Ready for Disbursal'}
      subtitle={
        isDisbursed
          ? 'Your loan amount has been credited to your bank account.'
          : allCompleted
            ? 'All steps completed! Request your loan disbursal below.'
            : 'Complete remaining steps to request disbursal.'
      }
      icon={Landmark}
    >
      <div className="py-4">
        {/* Case A: Already Disbursed */}
        {isDisbursed ? (
          <div className="text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-100 text-emerald-600 ring-8 ring-emerald-50">
              <CheckCircle2 size={40} />
            </div>
            <h3 className="mt-5 text-2xl font-extrabold text-slate-900">
              Disbursement Successful!
            </h3>
            <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto">
              The loan amount of <strong className="text-emerald-700">{disbursalAmount}</strong> has been credited to your bank account.
            </p>

            <div className="mt-6 max-w-lg mx-auto rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 text-left text-sm space-y-3">
              <div className="flex justify-between border-b border-emerald-100 pb-2">
                <span className="text-slate-500 font-medium">Loan Account Number (LAN)</span>
                <span className="font-mono font-bold text-slate-900">{data?.loan?.lan}</span>
              </div>
              <div className="flex justify-between border-b border-emerald-100 pb-2">
                <span className="text-slate-500 font-medium">Bank Name</span>
                <span className="font-bold text-slate-900">{data?.bank?.bankName || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-emerald-100 pb-2">
                <span className="text-slate-500 font-medium">Account Number</span>
                <span className="font-mono font-bold text-slate-900">{data?.bank?.accountMasked || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Account Holder</span>
                <span className="font-bold text-slate-900">{data?.bank?.accountHolderName || data?.customer?.fullName || '—'}</span>
              </div>
            </div>
          </div>
        ) : !allCompleted ? (
          /* Case B: Incomplete Steps */
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-6 text-amber-950">
            <div className="flex items-center gap-3 text-amber-800 font-bold text-lg">
              <AlertCircle size={22} />
              <span>Complete Pending Steps</span>
            </div>
            <p className="mt-2 text-sm text-amber-900 leading-relaxed">
              Disbursal cannot be requested until all post-approval steps are stored in the database. Please complete the following pending steps:
            </p>
            <ul className="mt-4 space-y-2">
              {missingSteps.map((step) => (
                <li key={step.id} className="flex items-center justify-between rounded-xl bg-white/80 p-3 border border-amber-200 text-sm">
                  <span className="font-semibold text-slate-800">{step.name}</span>
                  <button
                    type="button"
                    onClick={() => onGoToStep(step.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                  >
                    Complete step <ChevronRight size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          /* Case C: All Completed & Ready for Disbursal */
          <div className="text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-blue-100 text-blue-600 ring-8 ring-blue-50">
              <Landmark size={36} />
            </div>
            <h3 className="mt-5 text-xl font-extrabold text-slate-900">
              All Steps Completed Successfully!
            </h3>
            <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
              All your verification documents, bank details, KFS agreement, and mandate are verified and stored in the DB.
            </p>

            <div className="mt-6 max-w-lg mx-auto rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left text-sm space-y-3">
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500 font-medium">Net Disbursal Amount</span>
                <span className="font-extrabold text-emerald-700 text-base">{disbursalAmount}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500 font-medium">Destination Bank</span>
                <span className="font-bold text-slate-900">{data?.bank?.bankName || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Destination Account</span>
                <span className="font-mono font-bold text-slate-900">{data?.bank?.accountMasked || '—'}</span>
              </div>
            </div>

            {errorMsg && (
              <div className="mt-4 max-w-lg mx-auto rounded-xl bg-red-50 p-3 text-sm text-red-700 flex items-center gap-2 text-left">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="mt-8 flex justify-center">
              <ActionButton onClick={handleRequest} loading={isLoading}>
                Request Disbursal
              </ActionButton>
            </div>
          </div>
        )}
      </div>
    </StepCard>
  );
}
