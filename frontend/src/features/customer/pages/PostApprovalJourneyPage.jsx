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
  X,
} from 'lucide-react';

import {
  getPostApprovalJourney,
  acceptLoanOffer,
  initiateDigilocker,
  getDigilockerStatus,
  fetchDigilockerDetails,
  saveAddress,
  verifyBankAccount,
  acceptKfs,
  initiateMandate,
  initiateEsign,
  requestDisbursal,
} from '../postApprovalApi';
import { loadDigitapSdk } from '../utils/loadDigitapSdk';

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
                className={`flex min-w-[90px] flex-1 flex-col items-center gap-1.5 border-b-2 px-3 py-3 text-center transition-colors ${isDone
                    ? 'border-emerald-500 bg-emerald-50'
                    : isActive
                      ? 'border-emerald-600 bg-emerald-50'
                      : 'border-transparent bg-white'
                  }`}
              >
                <div
                  className={`grid h-8 w-8 place-items-center rounded-full ${isDone
                      ? 'bg-emerald-500 text-white'
                      : isActive
                        ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-400'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                >
                  {isDone ? <CheckCircle2 size={16} /> : <Icon size={15} />}
                </div>
                <p
                  className={`text-[11px] font-semibold leading-tight ${isDone ? 'text-emerald-700' : isActive ? 'text-emerald-800' : 'text-slate-400'
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
          <DigiLockerStep lan={normalizedLan} customer={data?.customer} onNext={fetchJourney} />
        )}
        {currentStep === 'ADDRESS_CONFIRMATION' && (
          <AddressConfirmationStep lan={normalizedLan} data={data} onNext={fetchJourney} />
        )}
        {currentStep === 'BANK_VERIFICATION' && (
          <BankVerificationStep lan={normalizedLan} onNext={fetchJourney} />
        )}
        {currentStep === 'KFS_ACCEPTANCE' && (
          <KfsStep
            lan={normalizedLan}
            data={data}
            onNext={fetchJourney}
          />
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
  const [consent, setConsent] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeKycUrl, setActiveKycUrl] = useState(null);
  const [isVerifyingInPopup, setIsVerifyingInPopup] = useState(false);

  const startPolling = (transactionId) => {
    const startTime = Date.now();
    const interval = setInterval(async () => {
      try {
        if (Date.now() - startTime > 300000) { // 5 minutes max
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
          onNext(); // Proceed to next step
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

    return () => clearInterval(interval);
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

    if (popup) {
      popup.focus();
    }
  };

  const handleInitiate = async () => {
    if (!consent) {
      setErrorMsg('Please check the consent box to proceed.');
      return;
    }

    setErrorMsg('');
    setIsLoading(true);
    try {
      // 1. Call backend to generate URL
      const responseData = await initiateDigilocker(lan);

      if (responseData.status === 'VERIFIED') {
        onNext();
        return;
      }

      const targetUrl = responseData?.kycUrl || responseData?.url;

      if (!targetUrl) {
        throw new Error('DigiLocker verification URL was not generated.');
      }

      // 2. Open popup window (bypasses government X-Frame-Options restriction)
      setActiveKycUrl(targetUrl);
      setIsVerifyingInPopup(true);
      openPopupUrl(targetUrl);

      // 3. Start backend polling
      startPolling(responseData.transactionId);

    } catch (err) {
      setErrorMsg(err.message || 'Failed to initiate DigiLocker');
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
          <AlertCircle className="h-4 w-4" />
          {errorMsg}
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
  const [formData, setFormData] = useState({
    accountHolderName: '',
    accountNumber: '',
    confirmAccountNumber: '',
    ifscCode: '',
    bankName: '',
    branchName: '',
    accountType: 'SAVINGS',
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

      // Auto-populate bank name based on IFSC prefix if empty
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
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/90 p-4 text-xs font-medium text-red-800 animate-in fade-in duration-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div className="flex-1 leading-relaxed">{errorMsg}</div>
        </div>
      )}

      <form onSubmit={handleVerify} className="space-y-5">
        {/* Account Holder Name */}
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

        {/* Account Number & Confirm Account Number */}
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="accountNumber" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Bank Account Number <span className="text-red-500">*</span>
            </label>
            <input
              id="accountNumber"
              name="accountNumber"
              type="password"
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

        {/* IFSC Code & Account Type */}
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

        {/* Bank Name & Branch Name */}
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

        {/* Security Assurance Notice */}
        <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-100 p-3.5 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <BadgeCheck className="h-4 w-4 text-emerald-600" />
            <span>256-bit AES Encrypted Storage</span>
          </div>
          <span className="font-semibold text-slate-700">PCI-DSS Compliant</span>
        </div>

        <div className="mt-8 flex justify-end pt-2">
          <ActionButton type="submit" onClick={handleVerify} loading={isLoading} variant="blue">
            Verify Bank Account
          </ActionButton>
        </div>
      </form>
    </StepCard>
  );
}

function KfsStep({ lan, data, onNext }) {
  const [isLoading, setIsLoading] = useState(false);
  const [isAccepted, setIsAccepted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const kfs = data?.kfs || {};
  const loan = data?.loan || {};
  const offer = data?.offer || {};
  const lender = data?.lender || {};

  const formatCurrency = (value) => {
    if (
      value === null ||
      value === undefined ||
      value === ''
    ) {
      return '—';
    }

    return Number(value).toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    });
  };

  const formatDate = (value) => {
    if (!value) {
      return '—';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '—';
    }

    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const loanAmount =
    kfs?.loanAmount ??
    offer?.approvedAmount ??
    loan?.approvedAmount;

  const tenureDays =
    kfs?.tenureDays ??
    offer?.acceptedTenureDays ??
    loan?.acceptedTenureDays;

  const netDisbursalAmount =
    kfs?.netDisbursalAmount ??
    offer?.netDisbursalAmount ??
    loan?.netDisbursalAmount;

  const totalRepaymentAmount =
    kfs?.totalRepaymentAmount ??
    offer?.totalRepaymentAmount ??
    loan?.acceptedTotalRepayment;

  const dueDate =
    kfs?.dueDate ??
    offer?.dueDate ??
    loan?.dueDate;

  const kfsDocumentUrl =
    kfs?.documentUrl ||
    kfs?.fileUrl ||
    kfs?.previewUrl ||
    null;

  const handleViewKfs = () => {
    setErrorMsg('');

    if (!kfsDocumentUrl) {
      setErrorMsg(
        'The Key Fact Statement document is not available yet.',
      );
      return;
    }

    window.open(
      kfsDocumentUrl,
      '_blank',
      'noopener,noreferrer',
    );
  };

  const handleAccept = async () => {
    if (!isAccepted) {
      setErrorMsg(
        'Please read and accept the Key Fact Statement before continuing.',
      );
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      await acceptKfs(lan, {
        accepted: true,
        consentText:
          'I have read and accept the KFS, charges, repayment obligation and penal charge terms.',
      });

      await onNext();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Failed to accept KFS.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const detailItems = [
    {
      label: 'Loan amount',
      value: formatCurrency(loanAmount),
    },
    {
      label: 'Tenure',
      value: tenureDays
        ? `${tenureDays} days`
        : '—',
    },
    {
      label: 'Net disbursal',
      value: formatCurrency(
        netDisbursalAmount,
      ),
    },
    {
      label: 'Total repayment',
      value: formatCurrency(
        totalRepaymentAmount,
      ),
    },
    {
      label: 'Due date',
      value: formatDate(dueDate),
    },
  ];

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
              <FileText size={26} />
            </div>

            <div>
              <h2 className="text-2xl font-extrabold text-slate-950">
                Key Fact Statement
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Personal Loan
                {' · '}
                {lender?.name ||
                  lender?.displayName ||
                  'Fintree Finance Private Limited'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleViewKfs}
            className="inline-flex items-center justify-center rounded-xl border border-blue-600 px-5 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-50"
          >
            View KFS
          </button>
        </div>

        <div className="mt-7 overflow-hidden rounded-2xl border border-slate-200">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3">
            {detailItems.map((item, index) => (
              <div
                key={item.label}
                className={`min-h-[108px] p-5 ${index !== detailItems.length - 1
                    ? 'border-b border-slate-200'
                    : ''
                  } sm:border-b ${index % 2 !== 1
                    ? 'sm:border-r'
                    : ''
                  } lg:border-b lg:border-r ${index === 2 ||
                    index === 4
                    ? 'lg:border-r-0'
                    : ''
                  } ${index >= 3
                    ? 'lg:border-b-0'
                    : ''
                  }`}
              >
                <p className="text-sm font-medium text-slate-500">
                  {item.label}
                </p>

                <p className="mt-2 text-xl font-extrabold text-slate-950">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <label className="mt-7 flex cursor-pointer items-start gap-4 rounded-2xl border border-slate-200 p-5 transition hover:bg-slate-50">
          <input
            type="checkbox"
            checked={isAccepted}
            onChange={(event) => {
              setIsAccepted(
                event.target.checked,
              );
              setErrorMsg('');
            }}
            disabled={isLoading}
            className="mt-0.5 h-6 w-6 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />

          <span className="text-sm font-semibold leading-6 text-slate-800">
            I have read and accept the KFS, charges, repayment
            obligation and penal charge terms.
          </span>
        </label>

        {errorMsg && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="mt-7 flex justify-end">
          <ActionButton
            onClick={handleAccept}
            loading={isLoading}
            disabled={!isAccepted}
          >
            Accept KFS & Continue
          </ActionButton>
        </div>
      </div>
    </div>
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
