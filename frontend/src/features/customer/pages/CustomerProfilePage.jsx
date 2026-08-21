import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Mail,
  Phone,
  ShieldCheck,
  MapPin,
  Briefcase,
  Landmark,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowLeft,
  FileCheck2,
  ChevronRight,
} from 'lucide-react';
import { getCustomerMe } from '../customerApi';

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
    if (!val) return '—';
    return Number(val).toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center py-12">
        <RefreshCw className="h-10 w-10 animate-spin text-brand-600" />
        <p className="mt-4 text-sm font-semibold text-neutral-600">Loading your profile details…</p>
      </div>
    );
  }

  if (error && !customer) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <button
          onClick={() => navigate('/customer/dashboard')}
          className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-600 hover:text-neutral-900 mb-6 cursor-pointer"
        >
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
        <div className="rounded-2xl border border-danger-200 bg-danger-50 p-6 text-center text-danger-900">
          <AlertCircle className="mx-auto h-10 w-10 text-danger-600 mb-3" />
          <h3 className="text-lg font-bold">Unable to Load Profile</h3>
          <p className="mt-1 text-sm text-danger-700">{error}</p>
          <button
            onClick={() => fetchProfile(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-danger-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-danger-700 cursor-pointer"
          >
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      </div>
    );
  }

  const fullName = customer?.fullName || customer?.panName || `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim() || 'Valued Customer';
  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('') || 'CU';

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 pb-6">
        <div>
          <button
            onClick={() => navigate('/customer/dashboard')}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-500 hover:text-neutral-900 mb-2 transition cursor-pointer"
          >
            <ArrowLeft size={14} /> Back to Dashboard
          </button>
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">My Profile</h1>
        </div>

        <button
          onClick={() => fetchProfile(true)}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2 text-xs font-bold text-neutral-700 shadow-sm hover:bg-neutral-50 disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          {isRefreshing ? 'Refreshing...' : 'Refresh Profile'}
        </button>
      </div>

      {/* Hero Profile Banner */}
      <div className="rounded-3xl border border-brand-200 bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 p-6 sm:p-8 text-white shadow-xl shadow-brand-700/10 flex flex-col sm:flex-row items-center gap-6">
        <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-white/20 text-2xl font-black text-white shadow-inner backdrop-blur-sm border border-white/30">
          {initials}
        </div>
        <div className="flex-1 text-center sm:text-left space-y-1">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
            <h2 className="text-2xl font-black">{fullName}</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-400/20 px-3 py-0.5 text-xs font-bold text-brand-100 border border-brand-400/30">
              <ShieldCheck size={14} /> Verified Account
            </span>
          </div>
          <p className="text-sm text-brand-100 font-medium">Customer ID: {customer?.id || '—'}</p>
          <div className="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-brand-100/90 font-medium">
            <span className="flex items-center gap-1.5"><Phone size={13} /> {customer?.mobileNumber || '—'}</span>
            <span>•</span>
            <span className="flex items-center gap-1.5"><Mail size={13} /> {customer?.email || '—'}</span>
          </div>
        </div>
      </div>

      {/* Grid: Details Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Personal Details */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2.5 border-b border-neutral-100 pb-4 mb-4">
            <User className="h-5 w-5 text-brand-600" />
            <h3 className="text-base font-bold text-neutral-900">Personal Details</h3>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-neutral-100 pb-2">
              <span className="text-neutral-500">Full Name (as per PAN)</span>
              <span className="font-bold text-neutral-900">{fullName}</span>
            </div>
            <div className="flex justify-between border-b border-neutral-100 pb-2">
              <span className="text-neutral-500">PAN Number</span>
              <span className="font-mono font-bold text-neutral-900">{customer?.panNumber || '—'}</span>
            </div>
            <div className="flex justify-between border-b border-neutral-100 pb-2">
              <span className="text-neutral-500">Date of Birth</span>
              <span className="font-semibold text-neutral-800">{formatDate(customer?.dateOfBirth || customer?.aadhaarDateOfBirth)}</span>
            </div>
            <div className="flex justify-between border-b border-neutral-100 pb-2">
              <span className="text-neutral-500">Gender</span>
              <span className="font-semibold text-neutral-800 capitalize">{customer?.gender || '—'}</span>
            </div>
            <div className="flex justify-between border-b border-neutral-100 pb-2">
              <span className="text-neutral-500">Marital Status</span>
              <span className="font-semibold text-neutral-800 capitalize">{customer?.maritalStatus || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Educational Qualification</span>
              <span className="font-semibold text-neutral-800">{customer?.qualification || 'Graduate'}</span>
            </div>
          </div>
        </div>

        {/* Verification Status */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2.5 border-b border-neutral-100 pb-4 mb-4">
            <ShieldCheck className="h-5 w-5 text-info-600" />
            <h3 className="text-base font-bold text-neutral-900">Identity & Verification Badges</h3>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
              <span className="text-neutral-500">Mobile Verification</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-800">
                <CheckCircle2 size={12} /> Verified
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
              <span className="text-neutral-500">PAN Verification</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-800">
                <CheckCircle2 size={12} /> Verified
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
              <span className="text-neutral-500">Aadhaar DigiLocker KYC</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-800">
                <CheckCircle2 size={12} /> Verified
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
              <span className="text-neutral-500">Bank Account Verification</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-800">
                <CheckCircle2 size={12} /> Verified
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">Account Status</span>
              <span className="font-bold text-brand-700 capitalize">{customer?.onboardingStatus || 'ACTIVE'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Address & Employment */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Residence & Address */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2.5 border-b border-neutral-100 pb-4 mb-4">
            <MapPin className="h-5 w-5 text-accent-600" />
            <h3 className="text-base font-bold text-neutral-900">Residence & Address Details</h3>
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <span className="text-xs font-semibold uppercase text-neutral-400">Current Residence Address</span>
              <p className="mt-1 font-medium text-neutral-800 leading-relaxed">
                {customer?.currentAddress || customer?.aadhaarFormattedAddr || '—'}
              </p>
            </div>
            <div className="flex justify-between border-t border-neutral-100 pt-3">
              <span className="text-neutral-500">City / District</span>
              <span className="font-semibold text-neutral-800">{customer?.city || customer?.district || '—'}</span>
            </div>
            <div className="flex justify-between border-t border-neutral-100 pt-2">
              <span className="text-neutral-500">State</span>
              <span className="font-semibold text-neutral-800">{customer?.state || '—'}</span>
            </div>
            <div className="flex justify-between border-t border-neutral-100 pt-2">
              <span className="text-neutral-500">PIN Code</span>
              <span className="font-mono font-bold text-neutral-900">{customer?.pincode || '—'}</span>
            </div>
            <div className="flex justify-between border-t border-neutral-100 pt-2">
              <span className="text-neutral-500">Residence Type</span>
              <span className="font-semibold text-neutral-800 capitalize">{customer?.residenceType || 'Owned'}</span>
            </div>
          </div>
        </div>

        {/* Employment & Income */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2.5 border-b border-neutral-100 pb-4 mb-4">
            <Briefcase className="h-5 w-5 text-accent-600" />
            <h3 className="text-base font-bold text-neutral-900">Employment & Income</h3>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-neutral-100 pb-2">
              <span className="text-neutral-500">Employment Type</span>
              <span className="font-bold text-neutral-900 capitalize">{customer?.employmentType || 'Salaried'}</span>
            </div>
            <div className="flex justify-between border-b border-neutral-100 pb-2">
              <span className="text-neutral-500">Company Name</span>
              <span className="font-semibold text-neutral-800">{customer?.companyName || '—'}</span>
            </div>
            <div className="flex justify-between border-b border-neutral-100 pb-2">
              <span className="text-neutral-500">Designation</span>
              <span className="font-semibold text-neutral-800">{customer?.designation || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Net Monthly Income</span>
              <span className="font-black text-brand-700">{formatCurrency(customer?.monthlyIncome || customer?.netMonthlyIncome)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bank Account Details */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-4 mb-4">
          <div className="flex items-center gap-2.5">
            <Landmark className="h-5 w-5 text-brand-600" />
            <h3 className="text-base font-bold text-neutral-900">Disbursal & Mandate Bank Account</h3>
          </div>
          <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-800 border border-brand-200">
            Penny Drop Verified
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div className="rounded-xl bg-neutral-50 p-4 border border-neutral-100">
            <span className="text-xs font-bold uppercase text-neutral-400">Bank Name</span>
            <p className="mt-1 font-bold text-neutral-900">{customer?.bankName || '—'}</p>
          </div>

          <div className="rounded-xl bg-neutral-50 p-4 border border-neutral-100">
            <span className="text-xs font-bold uppercase text-neutral-400">Account Holder Name</span>
            <p className="mt-1 font-bold text-neutral-900">{customer?.bankAccountHolderName || fullName}</p>
          </div>

          <div className="rounded-xl bg-neutral-50 p-4 border border-neutral-100">
            <span className="text-xs font-bold uppercase text-neutral-400">Account Number</span>
            <p className="mt-1 font-mono font-bold text-neutral-900">{customer?.bankAccountMasked || customer?.accountNumberMasked || '—'}</p>
          </div>

          <div className="rounded-xl bg-neutral-50 p-4 border border-neutral-100">
            <span className="text-xs font-bold uppercase text-neutral-400">IFSC Code</span>
            <p className="mt-1 font-mono font-bold text-neutral-900">{customer?.bankIfsc || customer?.ifscMasked || '—'}</p>
          </div>
        </div>
      </div>

      {/* Active Loan Account Summary */}
      {customer?.latestLan && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-brand-100 text-brand-700">
              <FileCheck2 size={24} />
            </div>
            <div>
              <h4 className="font-bold text-neutral-900 text-base">Active Loan Account ({customer.latestLan})</h4>
              <p className="text-xs text-neutral-500">Application Number: {customer.latestApplicationReference || '—'}</p>
            </div>
          </div>

          <button
            onClick={() => navigate(`/customer/loan/${customer.latestLan}/details`)}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-brand-700 cursor-pointer"
          >
            View Loan Details & Schedule
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

export default CustomerProfilePage;
