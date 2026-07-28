import { useState, useEffect } from 'react';
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
} from 'lucide-react';

import {
  getPostApprovalJourney,
  acceptLoanOffer,
  initiateDigilocker,
  saveAddress,
  verifyBankAccount,
  acceptKfs,
  initiateMandate,
  initiateEsign,
  requestDisbursal,
} from '../postApprovalApi';

function getCustomerSession() {
  try {
    return JSON.parse(sessionStorage.getItem('customerSession') || 'null');
  } catch {
    return null;
  }
}

const STEPS = [
  { id: 'APPROVAL_SUMMARY', label: 'Offer', icon: BadgeCheck },
  { id: 'DIGILOCKER_KYC', label: 'KYC', icon: FileCheck2 },
  { id: 'ADDRESS_CONFIRMATION', label: 'Address', icon: MapPin },
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

  const fetchJourney = async () => {
    setIsLoading(true);
    setError('');
    try {
      const result = await getPostApprovalJourney(normalizedLan);
      setData(result);
    } catch (err) {
      console.error('Failed to fetch post approval journey:', err);
      setError(err instanceof Error ? err.message : 'Unable to load your loan details.');
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
        <p className="mt-4 text-sm font-medium text-slate-600">Loading your loan journey…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-red-200 bg-white p-8 text-center shadow-lg">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-100 text-red-600">
          <AlertCircle size={28} />
        </div>
        <h3 className="mt-4 text-lg font-bold text-slate-900">Unable to load loan details</h3>
        <p className="mt-2 text-sm text-slate-600">{error || 'An unexpected error occurred.'}</p>
        <button
          onClick={fetchJourney}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow transition hover:bg-emerald-700"
        >
          <RotateCcw size={16} />
          Retry
        </button>
      </div>
    );
  }

  const currentStep = data?.workflow?.currentStep || 'APPROVAL_SUMMARY';
  const currentIdx = STEPS.findIndex(s => s.id === currentStep);
  const progress = Math.round(((currentIdx + 1) / STEPS.length) * 100);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header banner */}
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-500 p-6 text-white shadow-xl sm:p-8">
        <div className="relative z-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-200">Final Disbursal Journey</p>
          <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">Complete Your Loan Steps</h1>
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
            const isDone = idx < currentIdx;
            const isActive = idx === currentIdx;
            const Icon = step.icon;
            return (
              <div
                key={step.id}
                className={`flex min-w-[90px] flex-1 flex-col items-center gap-1.5 border-b-2 px-3 py-3 text-center transition-colors ${
                  isDone
                    ? 'border-emerald-500 bg-emerald-50'
                    : isActive
                    ? 'border-emerald-600 bg-emerald-50'
                    : 'border-transparent bg-white'
                }`}
              >
                <div
                  className={`grid h-8 w-8 place-items-center rounded-full ${
                    isDone
                      ? 'bg-emerald-500 text-white'
                      : isActive
                      ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-400'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {isDone ? <CheckCircle2 size={16} /> : <Icon size={15} />}
                </div>
                <p
                  className={`text-[11px] font-semibold leading-tight ${
                    isDone ? 'text-emerald-700' : isActive ? 'text-emerald-800' : 'text-slate-400'
                  }`}
                >
                  {step.label}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Active step content */}
      <div>
        {currentStep === 'APPROVAL_SUMMARY' && (
          <ApprovalSummaryStep data={data} onNext={fetchJourney} />
        )}
        {currentStep === 'DIGILOCKER_KYC' && (
          <DigiLockerStep lan={normalizedLan} onNext={fetchJourney} />
        )}
        {currentStep === 'ADDRESS_CONFIRMATION' && (
          <AddressConfirmationStep lan={normalizedLan} data={data} onNext={fetchJourney} />
        )}
        {currentStep === 'BANK_VERIFICATION' && (
          <BankVerificationStep lan={normalizedLan} onNext={fetchJourney} />
        )}
        {currentStep === 'KFS_ACCEPTANCE' && (
          <KfsStep lan={normalizedLan} onNext={fetchJourney} />
        )}
        {currentStep === 'EMANDATE' && (
          <MandateStep lan={normalizedLan} onNext={fetchJourney} />
        )}
        {currentStep === 'ESIGN' && (
          <EsignStep lan={normalizedLan} onNext={fetchJourney} />
        )}
        {(currentStep === 'READY_FOR_DISBURSAL' || currentStep === 'DISBURSAL_PROCESSING' || currentStep === 'DISBURSED') && (
          <DisbursalStep lan={normalizedLan} data={data} onRefresh={fetchJourney} />
        )}
      </div>
    </div>
  );
}

// ─── Step Cards ───────────────────────────────────────────────────────────────

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
      <div className="p-6">{children}</div>
    </div>
  );
}

function ActionButton({ onClick, disabled, loading, children, variant = 'primary' }) {
  const base = 'inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold shadow transition disabled:opacity-50';
  const styles = {
    primary: 'bg-emerald-600 text-white hover:bg-emerald-700',
    blue: 'bg-blue-600 text-white hover:bg-blue-700',
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled || loading} className={`${base} ${styles[variant]}`}>
      {loading ? <LoaderCircle size={16} className="animate-spin" /> : null}
      {children}
      {!loading && <ArrowRight size={16} />}
    </button>
  );
}

function ApprovalSummaryStep({ data, onNext }) {
  const tenures = Array.isArray(data?.offer?.allowedTenures) && data.offer.allowedTenures.length > 0
    ? data.offer.allowedTenures
    : [90, 180, 270, 365];

  const [selectedTenure, setSelectedTenure] = useState(tenures[0]);
  const [isAccepting, setIsAccepting] = useState(false);

  const handleAccept = async () => {
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

  const approvedAmount = data?.loan?.approvedAmount
    ? Number(data.loan.approvedAmount).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    : '—';

  return (
    <StepCard title="Congratulations! Loan Approved" subtitle="Review your offer and select a tenure to proceed." icon={BadgeCheck}>
      {/* Success hero */}
      <div className="mb-6 flex flex-col items-center rounded-2xl bg-emerald-50 py-8 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-600 ring-8 ring-emerald-50">
          <CheckCircle2 size={36} />
        </div>
        <h3 className="mt-4 text-xl font-extrabold text-slate-900">Your Loan is Approved!</h3>
        <p className="mt-1 text-sm text-slate-500">
          Approved by <strong>{data?.lender?.name || 'Fintree Finance'}</strong>
        </p>
      </div>

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
      <div className="mb-8">
        <p className="mb-3 text-sm font-bold text-slate-900">Select Repayment Tenure</p>
        <div className="flex flex-wrap gap-3">
          {tenures.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setSelectedTenure(t)}
              className={`rounded-xl border px-5 py-2.5 text-sm font-semibold transition ${
                selectedTenure === t
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm'
                  : 'border-slate-200 text-slate-600 hover:border-emerald-300 hover:bg-slate-50'
              }`}
            >
              {t} Days
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <ActionButton onClick={handleAccept} loading={isAccepting}>
          Accept Offer & Continue
        </ActionButton>
      </div>
    </StepCard>
  );
}

function DigiLockerStep({ lan, onNext }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleInitiate = async () => {
    setIsLoading(true);
    try {
      await initiateDigilocker(lan);
      alert('DigiLocker integration is pending. Simulating success for now.');
      onNext();
    } catch (err) {
      alert(err.message || 'Failed to initiate DigiLocker');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <StepCard title="Aadhaar KYC via DigiLocker" subtitle="Complete your identity verification using DigiLocker." icon={FileCheck2}>
      <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
        <p className="font-semibold">What you'll need:</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-blue-700">
          <li>Your Aadhaar-linked mobile number</li>
          <li>Active DigiLocker account (or you can create one)</li>
        </ul>
      </div>
      <ActionButton onClick={handleInitiate} loading={isLoading} variant="blue">
        Start Aadhaar KYC
      </ActionButton>
    </StepCard>
  );
}

function AddressConfirmationStep({ lan, data, onNext }) {
  const [sameAsPermanent, setSameAsPermanent] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const permAddr = data?.digilocker?.permanentAddress;

  const handleSave = async () => {
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
    </StepCard>
  );
}

function BankVerificationStep({ lan, onNext }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleVerify = async () => {
    setIsLoading(true);
    try {
      await verifyBankAccount(lan, {});
      alert('Bank verification integration is pending. Simulating success for now.');
      onNext();
    } catch (err) {
      alert(err.message || 'Failed to verify bank account');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <StepCard title="Bank Account Verification" subtitle="Verify your bank account for loan disbursal." icon={Building2}>
      <div className="mb-6 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
        Your bank account will be verified via penny drop or account validation service.
      </div>
      <ActionButton onClick={handleVerify} loading={isLoading} variant="blue">
        Verify Bank Account
      </ActionButton>
    </StepCard>
  );
}

function KfsStep({ lan, onNext }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleAccept = async () => {
    setIsLoading(true);
    try {
      await acceptKfs(lan, {});
      onNext();
    } catch (err) {
      alert(err.message || 'Failed to accept KFS');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <StepCard title="Key Fact Statement (KFS)" subtitle="Review and accept the loan terms and conditions." icon={FileText}>
      <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-sm text-slate-600 leading-relaxed">
          The Key Fact Statement outlines the important terms of your loan — including the interest rate, processing fees, EMI amount, and repayment schedule. Please review before accepting.
        </p>
      </div>
      <div className="flex justify-end">
        <ActionButton onClick={handleAccept} loading={isLoading}>
          Accept KFS & Continue
        </ActionButton>
      </div>
    </StepCard>
  );
}

function MandateStep({ lan, onNext }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleInitiate = async () => {
    setIsLoading(true);
    try {
      await initiateMandate(lan);
      alert('e-Mandate integration is pending. Simulating success for now.');
      onNext();
    } catch (err) {
      alert(err.message || 'Failed to setup mandate');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <StepCard title="e-Mandate Setup" subtitle="Set up auto-debit for your EMI repayments." icon={CreditCard}>
      <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
        Your EMIs will be auto-debited from your bank account on the due date each month.
      </div>
      <ActionButton onClick={handleInitiate} loading={isLoading} variant="blue">
        Setup e-Mandate
      </ActionButton>
    </StepCard>
  );
}

function EsignStep({ lan, onNext }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleInitiate = async () => {
    setIsLoading(true);
    try {
      await initiateEsign(lan);
      alert('e-Sign integration is pending. Simulating success for now.');
      onNext();
    } catch (err) {
      alert(err.message || 'Failed to initiate eSign');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <StepCard title="e-Sign Loan Agreement" subtitle="Digitally sign your loan agreement to complete the process." icon={PenLine}>
      <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        You'll be directed to the e-Sign provider to digitally sign your loan agreement using Aadhaar OTP.
      </div>
      <ActionButton onClick={handleInitiate} loading={isLoading} variant="blue">
        Sign Agreement
      </ActionButton>
    </StepCard>
  );
}

function DisbursalStep({ lan, data, onRefresh }) {
  const [isLoading, setIsLoading] = useState(false);
  const isDisbursed = data?.workflow?.currentStep === 'DISBURSED';

  const handleRequest = async () => {
    setIsLoading(true);
    try {
      await requestDisbursal(lan);
      onRefresh();
    } catch (err) {
      alert(err.message || 'Failed to request disbursal');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <StepCard title={isDisbursed ? 'Loan Disbursed!' : 'Ready for Disbursal'} subtitle={isDisbursed ? 'Your loan amount has been disbursed to your bank account.' : 'All steps complete. Request your loan disbursal now.'} icon={Landmark}>
      <div className="text-center py-6">
        <div className={`mx-auto grid h-20 w-20 place-items-center rounded-full ${isDisbursed ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'} ring-8 ${isDisbursed ? 'ring-emerald-50' : 'ring-blue-50'}`}>
          {isDisbursed ? <CheckCircle2 size={40} /> : <Landmark size={36} />}
        </div>
        <h3 className="mt-5 text-xl font-extrabold text-slate-900">
          {isDisbursed ? 'Disbursement Successful!' : 'All Steps Completed'}
        </h3>
        <p className="mt-2 text-sm text-slate-500 max-w-sm mx-auto">
          {isDisbursed
            ? 'The loan amount has been credited to your bank account.'
            : 'Click the button below to initiate the loan disbursal to your bank account.'}
        </p>
        {!isDisbursed && (
          <div className="mt-8 flex justify-center">
            <ActionButton onClick={handleRequest} loading={isLoading}>
              Request Disbursal
            </ActionButton>
          </div>
        )}
      </div>
    </StepCard>
  );
}
