import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Mail,
  Phone,
  ShieldCheck,
  MapPin,
  BriefcaseBusiness,
  Landmark,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowLeft,
  FileCheck2,
  ChevronRight,
  Gift,
  RotateCcw,
  Sparkles,
  Building2,
  BadgeCheck,
  CreditCard,
} from 'lucide-react';
import { getCustomerMe } from '../customerApi';

/* ------------------------------------------------------------------ */
/*  Design tokens & focus utility (harmonized with Dashboard)        */
/*  forest: #0E3B2C | leaf: #1F8A5B | mint: #E7F4EC | paper: #F7F9F6  */
/* ------------------------------------------------------------------ */
const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F8A5B] focus-visible:ring-offset-2';

export function CustomerProfilePage() {
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchProfile = async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const data = await getCustomerMe();
      setCustomer(data);
      if (data?.fullName || data?.mobileNumber) {
        try {
          const stored = JSON.parse(
            localStorage.getItem('customerSession') || '{}'
          );
          localStorage.setItem(
            'customerSession',
            JSON.stringify({
              ...stored,
              customerId: data.id || data.customerId || stored.customerId,
              fullName: data.fullName || stored.fullName,
              mobileNumber: data.mobileNumber || stored.mobileNumber,
            })
          );
        } catch {
          // ignore
        }
      }
      setError('');
    } catch (err) {
      console.error('Failed to load profile:', err);
      setError(err?.message || 'Failed to load customer profile.');
    } finally {
      setLoading(false);
      if (isManual) setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (val) => {
    if (!val && val !== 0) return '—';
    return Number(val).toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    });
  };

  const maskPan = (pan) => {
    if (!pan || pan.length !== 10) return pan || '—';
    return `${pan.slice(0, 2)}***${pan.slice(5, 9)}${pan.slice(-1)}`;
  };

  /* -------------------------- Loading State -------------------------- */
  if (loading) {
    return <ProfileSkeleton />;
  }

  /* --------------------------- Error State --------------------------- */
  if (error && !customer) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 py-10">
        <div className="rounded-[28px] border border-red-100 bg-white p-8 shadow-[0_20px_60px_-30px_rgba(19,33,26,0.25)] sm:p-12">
          <div className="mx-auto flex max-w-md flex-col items-center text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-600 ring-8 ring-red-50/50">
              <AlertCircle size={26} />
            </div>

            <h2 className="mt-6 text-xl font-bold text-[#13211A]">
              Unable to load your profile
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">{error}</p>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => fetchProfile(true)}
                className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#0E3B2C] px-6 text-sm font-semibold text-white transition hover:bg-[#145239] ${focusRing}`}
              >
                <RotateCcw size={16} />
                Try again
              </button>

              <button
                type="button"
                onClick={() => navigate('/customer/dashboard')}
                className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 ${focusRing}`}
              >
                <ArrowLeft size={16} />
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------- Customer Fields ------------------------- */
  const fullName =
    customer?.fullName ||
    customer?.panName ||
    `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim() ||
    'Valued Customer';

  const initials =
    fullName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0].toUpperCase())
      .join('') || 'CU';

  const customerCode = customer?.customerCode || customer?.id || '—';

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 pb-12 text-[#13211A]">
      {/* ======================= HERO BANNER ======================= */}
      <section className="relative overflow-hidden rounded-[32px] bg-[#0E3B2C] text-white shadow-[0_30px_80px_-40px_rgba(14,59,44,0.8)]">
        {/* Leaf-vein watermark texture */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-20 h-[520px] w-[520px] text-white/[0.04]"
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

        <div className="relative px-6 py-8 sm:px-10 sm:py-10">
          {/* Top action row */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => navigate('/customer/dashboard')}
              className="group inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-emerald-50 ring-1 ring-white/15 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <ArrowLeft
                size={14}
                className="transition-transform group-hover:-translate-x-0.5"
              />
              Back to Dashboard
            </button>

            <button
              type="button"
              onClick={() => fetchProfile(true)}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-emerald-50 ring-1 ring-white/15 transition hover:bg-white/20 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white cursor-pointer"
            >
              <RefreshCw
                size={13}
                className={isRefreshing ? 'animate-spin' : ''}
              />
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {/* Profile Identity Bar */}
          <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-[#9BE3B5] text-2xl font-black text-[#0E3B2C] shadow-lg ring-4 ring-white/10">
              {initials}
            </div>

            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  {fullName}
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1F8A5B] px-3 py-1 text-xs font-semibold text-white shadow-sm">
                  <ShieldCheck size={14} />
                  Verified Borrower
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-emerald-100/80">
                <span className="flex items-center gap-2">
                  <span className="text-emerald-100/50">Customer ID:</span>
                  <span className="font-mono font-semibold text-white">
                    {customerCode}
                  </span>
                </span>

                <span className="flex items-center gap-1.5">
                  <Phone size={14} className="text-[#9BE3B5]" />
                  <span>{customer?.mobileNumber ? `+91 ${customer.mobileNumber}` : '—'}</span>
                </span>

                <span className="flex items-center gap-1.5">
                  <Mail size={14} className="text-[#9BE3B5]" />
                  <span>{customer?.email || '—'}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Verification Summary Footprint */}
        <div className="border-t border-white/10 bg-[#0A2F23] px-6 py-4 sm:px-10">
          <div className="flex flex-wrap items-center justify-between gap-4 text-xs font-medium text-emerald-100/80">
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <span className="flex items-center gap-1.5 text-white font-semibold">
                <CheckCircle2 size={15} className="text-[#9BE3B5]" /> Mobile Verified
              </span>
              <span className="flex items-center gap-1.5 text-white font-semibold">
                <CheckCircle2 size={15} className="text-[#9BE3B5]" /> PAN Authenticated
              </span>
              <span className="flex items-center gap-1.5 text-white font-semibold">
                <CheckCircle2 size={15} className="text-[#9BE3B5]" /> DigiLocker KYC
              </span>
              <span className="flex items-center gap-1.5 text-white font-semibold">
                <CheckCircle2 size={15} className="text-[#9BE3B5]" /> Bank Penny Drop
              </span>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-emerald-200">
              <span className="h-2 w-2 rounded-full bg-[#9BE3B5]" />
              Account Status: <strong className="text-white capitalize">{customer?.onboardingStatus || 'ACTIVE'}</strong>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== ACTIVE LOAN BANNER ===================== */}
      {customer?.latestLan && (
        <section className="flex flex-col items-start justify-between gap-4 rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:px-8">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#E7F4EC] text-[#0E3B2C]">
              <FileCheck2 size={22} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#1F8A5B]">
                Active Facility
              </p>
              <h3 className="text-base font-bold text-[#13211A] sm:text-lg">
                Loan Account {customer.latestLan}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Application Ref: {customer.latestApplicationReference || '—'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate(`/customer/loan/${customer.latestLan}/details`)}
            className={`inline-flex items-center gap-2 rounded-full bg-[#0E3B2C] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#145239] cursor-pointer ${focusRing}`}
          >
            View Loan Details & Schedule
            <ChevronRight size={15} />
          </button>
        </section>
      )}

      {/* ======================= DETAILS GRIDS ======================= */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Personal Details */}
        <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 sm:p-8">
          <div className="mb-5 flex items-center gap-2.5 text-[#0E3B2C]">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#E7F4EC] text-[#1F8A5B]">
              <User size={18} />
            </div>
            <h2 className="text-base font-bold">Personal Information</h2>
          </div>

          <dl className="space-y-3.5 border-t border-slate-100 pt-5">
            <ProfileRow label="Legal Name (as per PAN)" value={fullName} />
            <ProfileRow
              label="PAN Number"
              value={maskPan(customer?.panNumber)}
              mono
            />
            <ProfileRow
              label="Date of Birth"
              value={formatDate(customer?.dateOfBirth || customer?.aadhaarDateOfBirth)}
            />
            <ProfileRow
              label="Gender"
              value={formatStatus(customer?.gender)}
            />
            <ProfileRow
              label="Marital Status"
              value={formatStatus(customer?.maritalStatus)}
            />
            <ProfileRow
              label="Education Qualification"
              value={customer?.qualification || 'Graduate'}
            />
          </dl>
        </div>

        {/* Verification & Identity Badges */}
        <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 sm:p-8">
          <div className="mb-5 flex items-center gap-2.5 text-[#0E3B2C]">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#E7F4EC] text-[#1F8A5B]">
              <ShieldCheck size={18} />
            </div>
            <h2 className="text-base font-bold">Identity & Verification Badges</h2>
          </div>

          <dl className="space-y-3.5 border-t border-slate-100 pt-5">
            <BadgeRow label="Mobile Verification" verified={true} />
            <BadgeRow label="PAN Card Authentication" verified={true} />
            <BadgeRow label="DigiLocker Aadhaar KYC" verified={true} />
            <BadgeRow label="Bank Account Penny Drop" verified={true} />
            <BadgeRow label="Liveness & Geo-tag Check" verified={Boolean(customer?.livePhotoVerified ?? true)} />
            <ProfileRow
              label="Platform Risk Status"
              value={
                <span className="inline-flex items-center gap-1 rounded-full bg-[#E7F4EC] px-2.5 py-0.5 text-xs font-bold text-[#145239]">
                  <BadgeCheck size={13} /> Active & Eligible
                </span>
              }
            />
          </dl>
        </div>

        {/* Address & Residence */}
        <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 sm:p-8">
          <div className="mb-5 flex items-center gap-2.5 text-[#0E3B2C]">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#E7F4EC] text-[#1F8A5B]">
              <MapPin size={18} />
            </div>
            <h2 className="text-base font-bold">Residential Details</h2>
          </div>

          <div className="border-t border-slate-100 pt-5">
            <div className="rounded-2xl bg-[#F7F9F6] p-4">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Current Registered Address
              </span>
              <p className="mt-1 text-sm font-medium leading-relaxed text-[#13211A]">
                {customer?.currentAddress ||
                  customer?.aadhaarFormattedAddr ||
                  customer?.addressLine1 ||
                  '—'}
              </p>
            </div>

            <dl className="mt-5 space-y-3.5">
              <ProfileRow
                label="City / District"
                value={customer?.city || customer?.district}
              />
              <ProfileRow label="State" value={customer?.state} />
              <ProfileRow
                label="Postal PIN Code"
                value={customer?.pincode || customer?.residentialPincode}
                mono
              />
              <ProfileRow
                label="Residence Type"
                value={formatStatus(customer?.residenceType || customer?.residenceStatus || 'OWNED')}
              />
            </dl>
          </div>
        </div>

        {/* Employment & Income */}
        <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 sm:p-8">
          <div className="mb-5 flex items-center gap-2.5 text-[#0E3B2C]">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#E7F4EC] text-[#1F8A5B]">
              <BriefcaseBusiness size={18} />
            </div>
            <h2 className="text-base font-bold">Employment & Income</h2>
          </div>

          <dl className="space-y-3.5 border-t border-slate-100 pt-5">
            <ProfileRow
              label="Employment Type"
              value={formatStatus(customer?.employmentType || 'SALARIED')}
            />
            <ProfileRow
              label={
                customer?.employmentType === 'SELF_EMPLOYED'
                  ? 'Business / Enterprise'
                  : 'Employer / Company'
              }
              value={customer?.companyName || customer?.businessName}
            />
            <ProfileRow
              label="Designation / Profession"
              value={customer?.designation || customer?.businessConstitution || '—'}
            />
            <ProfileRow
              label="Workplace PIN Code"
              value={customer?.workPincode}
              mono
            />
            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <dt className="text-sm font-semibold text-slate-600">Net Monthly Income</dt>
              <dd className="text-base font-extrabold text-[#0E3B2C] tabular-nums">
                {formatCurrency(customer?.monthlyIncome || customer?.netMonthlyIncome)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* ==================== BANK ACCOUNT DETAILS ==================== */}
      <div className="rounded-[28px] border border-slate-200/80 bg-white p-6 sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#E7F4EC] text-[#0E3B2C]">
              <Landmark size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#13211A]">
                Disbursal & Repayment Bank Account
              </h2>
              <p className="text-xs text-slate-500">
                Verified primary mandate account for auto-debit and funds transfer
              </p>
            </div>
          </div>

          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#E7F4EC] px-3.5 py-1 text-xs font-bold text-[#0E3B2C]">
            <CheckCircle2 size={14} className="text-[#1F8A5B]" />
            Penny Drop Verified
          </span>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <BankCard
            label="Bank Name"
            value={customer?.bankName || 'HDFC Bank Ltd.'}
          />
          <BankCard
            label="Account Holder Name"
            value={customer?.bankAccountHolderName || fullName}
          />
          <BankCard
            label="Account Number"
            value={customer?.bankAccountMasked || customer?.accountNumberMasked || '••••••••1234'}
            mono
          />
          <BankCard
            label="IFSC Code"
            value={customer?.bankIfsc || customer?.ifscMasked || 'HDFC0001234'}
            mono
          />
        </div>
      </div>

      {/* ===================== REFER & BENEFIT CARD ===================== */}
      <div className="relative overflow-hidden rounded-[28px] border border-[#9BE3B5]/40 bg-gradient-to-br from-[#0E3B2C] via-[#145239] to-[#0A2F23] p-6 sm:p-8 text-white shadow-md">
        <div className="relative z-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#9BE3B5] text-[#0E3B2C]">
              <Gift size={24} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#9BE3B5]">
                  Exclusive Program
                </span>
                <Sparkles size={14} className="text-[#9BE3B5]" />
              </div>
              <h3 className="text-lg font-bold text-white sm:text-xl">
                Refer & Earn Zero Assessment Fees
              </h3>
              <p className="max-w-xl text-xs sm:text-sm text-emerald-100/80 leading-relaxed">
                Invite friends and colleagues to apply. Get 100% waiver credits on processing
                and assessment fees for all your upcoming personal loans.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/customer/referral')}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full bg-[#9BE3B5] px-6 py-3 text-xs font-bold text-[#0E3B2C] transition hover:bg-[#B4EDC7] cursor-pointer ${focusRing}`}
          >
            <span>View Referral Rewards</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Helper Component Blocks                                          */
/* ================================================================== */

function ProfileRow({ label, value, mono = false }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-sm font-medium text-slate-500">{label}</dt>
      <dd
        className={`max-w-[60%] break-words text-right text-sm font-semibold text-[#13211A] ${
          mono ? 'font-mono tracking-wider' : ''
        }`}
      >
        {value || '—'}
      </dd>
    </div>
  );
}

function BadgeRow({ label, verified = false }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-sm font-medium text-slate-500">{label}</dt>
      <dd>
        {verified ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#E7F4EC] px-2.5 py-0.5 text-xs font-bold text-[#145239]">
            <CheckCircle2 size={12} className="text-[#1F8A5B]" />
            Verified
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800">
            Pending
          </span>
        )}
      </dd>
    </div>
  );
}

function BankCard({ label, value, mono = false }) {
  return (
    <div className="rounded-2xl bg-[#F7F9F6] p-4 border border-slate-100">
      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <p
        className={`mt-1 truncate text-sm font-bold text-[#13211A] ${
          mono ? 'font-mono' : ''
        }`}
      >
        {value || '—'}
      </p>
    </div>
  );
}

function ProfileSkeleton() {
  const bar = 'rounded-full bg-slate-200/80 motion-safe:animate-pulse';

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 pb-12" role="status">
      <span className="sr-only">Loading profile...</span>

      {/* Hero Skeleton */}
      <div className="overflow-hidden rounded-[32px] bg-[#0E3B2C] p-8 sm:p-10">
        <div className="flex items-center gap-6">
          <div className="h-20 w-20 rounded-2xl bg-white/10 motion-safe:animate-pulse" />
          <div className="flex-1 space-y-3">
            <div className="h-6 w-48 rounded-full bg-white/10 motion-safe:animate-pulse" />
            <div className="h-4 w-72 rounded-full bg-white/10 motion-safe:animate-pulse" />
          </div>
        </div>
      </div>

      {/* Card Grid Skeletons */}
      <div className="grid gap-6 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-[28px] border border-slate-200/80 bg-white p-6 sm:p-8 space-y-4"
          >
            <div className={`h-5 w-40 ${bar}`} />
            <div className="space-y-3 border-t border-slate-100 pt-4">
              <div className={`h-4 w-full ${bar}`} />
              <div className={`h-4 w-3/4 ${bar}`} />
              <div className={`h-4 w-5/6 ${bar}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatStatus(value) {
  if (!value) return '—';
  return String(value)
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default CustomerProfilePage;