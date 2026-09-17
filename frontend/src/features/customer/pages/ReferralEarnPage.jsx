import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Copy,
  Check,
  Share2,
  Gift,
  Users,
  CheckCircle2,
  Clock,
  Sparkles,
  Percent,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { getReferralDashboard } from '../referralApi';

export default function ReferralEarnPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchDashboard = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const res = await getReferralDashboard();
      setData(res);
      setError('');
    } catch (err) {
      console.error('Failed to load referral dashboard:', err);
      setError(err?.message || 'Unable to retrieve your referral dashboard.');
    } finally {
      setLoading(false);
      if (isManual) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const copyToClipboard = async (text, setSuccess) => {
    if (!text) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2200);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const handleShareLink = async () => {
    if (!data?.shareLink) return;
    const sharePayload = {
      title: 'Join Fintree Finance',
      text: `Use my referral code ${data.referralCode || ''} for your loan registration!`,
      url: data.shareLink,
    };

    if (navigator?.share) {
      try {
        await navigator.share(sharePayload);
      } catch (err) {
        if (err.name !== 'AbortError') {
          copyToClipboard(data.shareLink, setCopiedLink);
        }
      }
    } else {
      copyToClipboard(data.shareLink, setCopiedLink);
    }
  };

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

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
        <div className="relative flex items-center justify-center">
          <div className="absolute h-14 w-14 rounded-full border-4 border-indigo-100 animate-pulse" />
          <RefreshCw className="h-7 w-7 animate-spin text-indigo-600" />
        </div>
        <p className="mt-4 text-sm font-semibold tracking-wide text-slate-600">
          Fetching referral benefits...
        </p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <button
          onClick={() => navigate('/customer/dashboard')}
          className="group inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800 transition mb-6"
        >
          <ArrowLeft size={16} className="transition group-hover:-translate-x-1" />
          Back to Dashboard
        </button>
        <div className="rounded-2xl border border-rose-200/80 bg-rose-50/50 p-8 text-center shadow-xs">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-rose-100 text-rose-600 mb-4">
            <AlertCircle size={22} />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Dashboard Unavailable</h3>
          <p className="mt-1 text-sm text-slate-600 max-w-md mx-auto">{error}</p>
          <button
            onClick={() => fetchDashboard(true)}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition cursor-pointer"
          >
            <RefreshCw size={14} /> Try Reloading
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="group grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-xs transition hover:border-slate-300 hover:text-slate-900 active:scale-95"
            aria-label="Go back"
          >
            <ArrowLeft size={18} className="transition group-hover:-translate-x-0.5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Refer & Earn
            </h1>
            <p className="text-xs font-medium text-slate-500 sm:text-sm">
              Reward your network and lower your own loan processing costs
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => fetchDashboard(true)}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 active:scale-95 disabled:opacity-50"
        >
          <RefreshCw size={13} className={isRefreshing ? 'animate-spin text-indigo-600' : ''} />
          {isRefreshing ? 'Syncing...' : 'Sync Data'}
        </button>
      </div>

      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-slate-950 p-6 sm:p-8 text-white shadow-xl border border-slate-800">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 -bottom-16 h-60 w-60 rounded-full bg-violet-600/20 blur-3xl" />

        <div className="relative z-10 grid gap-8 lg:grid-cols-12 lg:items-center">
          <div className="space-y-4 lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300 backdrop-blur-md">
              <Sparkles size={14} className="text-amber-300" />
              <span>Assessment & Processing Fee Benefit</span>
            </div>

            <h2 className="text-2xl font-black tracking-tight sm:text-3xl text-white">
              Invite Peers, Slash Assessment & Processing Fees!
            </h2>
            <p className="text-sm leading-relaxed text-slate-300 max-w-lg">
              Introduce your peers to Fintree loans. When their loan is successfully disbursed, earn direct waiver benefits on your assessment and processing fees for your next loan application!
            </p>

            {data?.expiryDate && (
              <div className="inline-flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3.5 py-1.5 text-xs font-medium text-amber-200">
                <Clock size={14} />
                <span>Next reward cycle expires: {formatDate(data.expiryDate)}</span>
              </div>
            )}
          </div>

          {/* Referral Interactive Box */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl shadow-inner space-y-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                <span>YOUR UNIQUE CODE</span>
                <span className="text-[11px] text-emerald-400 font-mono">ACTIVE</span>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/80 p-3.5">
                <span className="font-mono text-xl sm:text-2xl font-black tracking-widest text-indigo-200">
                  {data?.referralCode || 'FINXXXXX'}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(data?.referralCode, setCopiedCode)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition active:scale-95 cursor-pointer ${
                    copiedCode
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-white/10 text-white hover:bg-white/20 border border-transparent'
                  }`}
                >
                  {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                  {copiedCode ? 'Copied' : 'Copy'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleShareLink}
                  className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-500 active:scale-95 cursor-pointer"
                >
                  <Share2 size={14} /> Share
                </button>
                <button
                  type="button"
                  onClick={() => copyToClipboard(data?.shareLink, setCopiedLink)}
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/10 active:scale-95 cursor-pointer"
                >
                  {copiedLink ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  {copiedLink ? 'Link Copied' : 'Copy Link'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {[
          {
            label: 'Total Invited',
            value: data?.totalReferrals ?? 0,
            sub: 'Friends shared',
            icon: Users,
            color: 'text-slate-700 bg-slate-100',
          },
          {
            label: 'Successful',
            value: data?.successfulReferrals ?? 0,
            sub: 'Disbursed loans',
            icon: CheckCircle2,
            color: 'text-emerald-600 bg-emerald-50',
          },
          {
            label: 'Active Fee Waiver',
            value: data?.hasAvailableBenefit
              ? `₹${(data?.availableDiscount ?? 0).toLocaleString('en-IN')}`
              : 'No Active Waiver',
            sub: 'Assessment & Processing Fee',
            icon: Gift,
            color: 'text-indigo-600 bg-indigo-50',
          },
          {
            label: 'Total Saved',
            value: `₹${(data?.usedDiscount ?? 0).toLocaleString('en-IN')}`,
            sub: 'On loan processing',
            icon: Percent,
            color: 'text-violet-600 bg-violet-50',
          },
        ].map((metric, i) => {
          const Icon = metric.icon;
          return (
            <div
              key={i}
              className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs transition hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">{metric.label}</span>
                <div className={`grid h-7 w-7 place-items-center rounded-lg ${metric.color}`}>
                  <Icon size={15} />
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{metric.value}</p>
              <p className="text-[11px] font-medium text-slate-400">{metric.sub}</p>
            </div>
          );
        })}
      </div>

      {/* How it Works Workflow */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-800">
          <Zap size={16} className="text-indigo-600" /> Referral Roadmap
        </h3>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              step: '01',
              title: 'Send Invite',
              desc: `Share your referral link or code (${data?.referralCode || 'FIN...'}) via WhatsApp, SMS, or Socials.`,
            },
            {
              step: '02',
              title: 'Friend Gets Loan',
              desc: 'Your friend registers, completes loan verification, and receives their loan disbursement.',
            },
            {
              step: '03',
              title: 'Slash Fees',
              desc: 'Upon successful disbursement, earn instant discounts on assessment & processing fees for your next loan application!',
            },
          ].map((item, idx) => (
            <div
              key={idx}
              className="relative flex flex-col justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-4"
            >
              <div>
                <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                  STEP {item.step}
                </span>
                <h4 className="mt-2 text-sm font-bold text-slate-900">{item.title}</h4>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Activity Table */}
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Referral Activity</h3>
            <p className="text-xs text-slate-500">Track friends who signed up using your link</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
            {data?.referralHistory?.length || 0} Total
          </span>
        </div>

        {data?.referralHistory && data.referralHistory.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Applicant Name</th>
                  <th className="px-5 py-3">Loan Stage</th>
                  <th className="px-5 py-3">Reward Status</th>
                  <th className="px-5 py-3 text-right">Invited On</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {data.referralHistory.map((item) => (
                  <tr key={item.id} className="transition hover:bg-slate-50/80">
                    <td className="px-5 py-3.5 font-semibold text-slate-900">{item.customerName}</td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          item.loanStatus === 'DISBURSED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                            : 'bg-amber-50 text-amber-700 border border-amber-200/60'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${item.loanStatus === 'DISBURSED' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        {item.loanStatus}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          item.referralStatus === 'QUALIFIED'
                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/60'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {item.referralStatus === 'QUALIFIED' ? 'Benefit Credited' : 'Pending Milestone'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-medium text-slate-500">
                      {formatDate(item.referredAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400 mb-3">
              <Users size={20} />
            </div>
            <h4 className="text-sm font-semibold text-slate-800">No Invites Sent Yet</h4>
            <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
              Share your link above to begin generating waivers on your future borrowing.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}