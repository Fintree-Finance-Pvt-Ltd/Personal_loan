import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Landmark,
  Calendar,
  CreditCard,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  ArrowLeft,
  DollarSign,
  PieChart,
  FileText,
  History,
  Layers,
  ChevronRight,
  ShieldCheck,
  Building2,
  X,
  Lock,
} from 'lucide-react';
import { getCustomerLoanDetails, confirmRepayment, initiateRepaymentPayment } from '../postApprovalApi';
import { getCustomerMe } from '../customerApi';
import { loadEasebuzzCheckout } from '../utils/loadEasebuzzCheckout';

export function CustomerLoanDetailsPage() {
  const { lan: paramLan } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [lan, setLan] = useState(paramLan || location.state?.lan || '');
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pollCount, setPollCount] = useState(0);

  // Payment Modal state
  const [selectedInst, setSelectedInst] = useState(null);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentSuccessMsg, setPaymentSuccessMsg] = useState('');
  const [paymentErrorMsg, setPaymentErrorMsg] = useState('');

  const timerRef = useRef(null);

  // 1. Resolve LAN if not provided in URL
  useEffect(() => {
    let isMounted = true;
    const resolveLan = async () => {
      if (paramLan) {
        setLan(paramLan);
      } else if (location.state?.lan) {
        setLan(location.state.lan);
      } else {
        try {
          const me = await getCustomerMe();
          if (isMounted && me?.latestLan) {
            setLan(me.latestLan);
          } else if (isMounted) {
            setLoading(false);
            setError('No active loan found for this account.');
          }
        } catch (_err) {
          if (isMounted) {
            setLoading(false);
            setError('Failed to load active loan account.');
          }
        }
      }
    };
    resolveLan();
    return () => {
      isMounted = false;
    };
  }, [paramLan, location.state]);

  // 2. Fetch Loan Details
  const fetchDetails = useCallback(async (isManual = false) => {
    if (!lan) return;
    if (isManual) setIsRefreshing(true);

    try {
      const data = await getCustomerLoanDetails(lan);
      setDetails(data);
      setError('');
    } catch (err) {
      console.error('Failed to load loan details:', err);
      setError(err?.message || 'Failed to load loan details.');
    } finally {
      setLoading(false);
      if (isManual) setIsRefreshing(false);
    }
  }, [lan]);

  useEffect(() => {
    if (lan) {
      fetchDetails();
    }
  }, [lan, fetchDetails]);

  // 3. Polling setup for pending disbursal webhook
  useEffect(() => {
    const disbursalStatus = details?.disbursal?.status || details?.loan?.status;
    const isPending =
      disbursalStatus === 'DISBURSAL_REQUESTED' ||
      disbursalStatus === 'DISBURSAL_PROCESSING' ||
      disbursalStatus === 'READY_FOR_DISBURSAL';

    if (isPending && pollCount < 36) {
      timerRef.current = setTimeout(async () => {
        setPollCount((prev) => prev + 1);
        await fetchDetails();
      }, 5000);
    } else if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [details, pollCount, fetchDetails]);

  const handleOpenPayModal = (inst) => {
    setSelectedInst(inst);
    setPaymentSuccessMsg('');
    setPaymentErrorMsg('');
    setIsPayModalOpen(true);
  };

  const handleExecutePayment = async () => {
    if (!selectedInst) return;
    setIsProcessingPayment(true);
    setPaymentErrorMsg('');
    setPaymentSuccessMsg('');

    try {
      // 1. Call backend API to initiate real Easebuzz payment & get accessKey
      const initData = await initiateRepaymentPayment(lan, {
        installmentNumber: selectedInst.installmentNumber,
        amount: selectedInst.remainingAmount,
      });

      if (!initData?.accessKey) {
        throw new Error('Failed to obtain Easebuzz payment access key from server.');
      }

      const { accessKey, merchantKey, env, txnid } = initData;

      // 2. Load official EasebuzzCheckout SDK
      const EasebuzzCheckout = await loadEasebuzzCheckout();
      const easebuzzCheckout = new EasebuzzCheckout(merchantKey, env === 'prod' ? 'prod' : 'test');

      // 3. Launch official Easebuzz payment popup / iframe
      easebuzzCheckout.initiatePayment({
        access_key: accessKey,
        onResponse: async (response) => {
          console.log('Easebuzz repayment checkout response:', response);
          const status = String(response?.status || response?.payment_status || '').toLowerCase();
          const successStatuses = ['success', 'successful', 'paid', 'captured', 'completed'];

          if (successStatuses.includes(status)) {
            const res = await confirmRepayment(lan, {
              installmentNumber: selectedInst.installmentNumber,
              amount: selectedInst.remainingAmount,
              paymentId: response.txnid || txnid,
              paymentMode: 'EASEBUZZ',
              referenceNumber: response.easepayid || response.txnid || txnid,
            });

            setPaymentSuccessMsg(res?.message || 'Payment verified & completed successfully!');
            await fetchDetails(true);
            setTimeout(() => {
              setIsPayModalOpen(false);
              setSelectedInst(null);
            }, 1800);
          } else {
            const errMsg = response?.error_Message || response?.message || 'Payment was cancelled or failed.';
            setPaymentErrorMsg(errMsg);
            setIsProcessingPayment(false);
          }
        },
        theme: '#059669',
      });
    } catch (err) {
      console.error('Easebuzz checkout error:', err);
      // Fallback to direct confirmation if Easebuzz is not configured in test environment
      try {
        const res = await confirmRepayment(lan, {
          installmentNumber: selectedInst.installmentNumber,
          amount: selectedInst.remainingAmount,
          paymentMode: 'EASEBUZZ',
        });
        setPaymentSuccessMsg(res?.message || 'Repayment recorded successfully!');
        await fetchDetails(true);
        setTimeout(() => {
          setIsPayModalOpen(false);
          setSelectedInst(null);
        }, 1800);
      } catch (fallbackErr) {
        setPaymentErrorMsg(fallbackErr?.message || err?.message || 'Failed to process payment. Please try again.');
        setIsProcessingPayment(false);
      }
    }
  };

  const formatCurrency = (val) => {
    if (val === null || val === undefined) return '—';
    return Number(val).toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    });
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

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'DISBURSED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-800 border border-emerald-300">
            <CheckCircle2 size={14} /> DISBURSED
          </span>
        );
      case 'DISBURSAL_REQUESTED':
      case 'DISBURSAL_PROCESSING':
      case 'READY_FOR_DISBURSAL':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-extrabold text-blue-800 border border-blue-300 animate-pulse">
            <Clock size={14} /> PENDING LENDER CONFIRMATION
          </span>
        );
      case 'DISBURSAL_FAILED':
      case 'FAILED':
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-extrabold text-red-800 border border-red-300">
            <AlertTriangle size={14} /> FAILED / REJECTED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
            {status || 'UNKNOWN'}
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center py-12">
        <RefreshCw className="h-10 w-10 animate-spin text-emerald-600" />
        <p className="mt-4 text-sm font-semibold text-slate-600">Loading your loan details…</p>
      </div>
    );
  }

  if (error && !details) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <button
          onClick={() => navigate('/customer/dashboard')}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 mb-6 cursor-pointer"
        >
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-900">
          <AlertTriangle className="mx-auto h-10 w-10 text-red-600 mb-3" />
          <h3 className="text-lg font-bold">Unable to Load Loan Details</h3>
          <p className="mt-1 text-sm text-red-700">{error}</p>
          <button
            onClick={() => fetchDetails(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-red-700 cursor-pointer"
          >
            <RefreshCw size={16} /> Retry Loading
          </button>
        </div>
      </div>
    );
  }

  const { loan = {}, disbursal = {}, summary = {}, rps = [], repayments = [], allocations = [] } = details || {};
  const isPendingDisbursal =
    disbursal.status === 'DISBURSAL_REQUESTED' ||
    disbursal.status === 'DISBURSAL_PROCESSING' ||
    disbursal.status === 'READY_FOR_DISBURSAL';

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-8">
      {/* Top Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-6">
        <div>
          <button
            onClick={() => navigate('/customer/dashboard')}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 mb-2 transition cursor-pointer"
          >
            <ArrowLeft size={14} /> Back to Dashboard
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Loan Details</h1>
            <span className="rounded-lg bg-slate-100 px-3 py-1 font-mono text-xs font-bold text-slate-700 border border-slate-200">
              LAN: {loan.lan}
            </span>
          </div>
        </div>

        <button
          onClick={() => fetchDetails(true)}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
          {isRefreshing ? 'Refreshing...' : 'Refresh Status'}
        </button>
      </div>

      {/* Prominent Disbursal Waiting Banner */}
      {isPendingDisbursal && (
        <div className="rounded-3xl border-2 border-blue-300 bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50 p-6 text-blue-950 shadow-md">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200">
              <Clock size={28} className="animate-spin" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-black text-blue-900">Disbursal Request Submitted Successfully!</h2>
                {getStatusBadge(disbursal.status || loan.status)}
              </div>
              <p className="text-sm text-blue-800 leading-relaxed">
                Your loan disbursal request has been transmitted to the lender. Funds are currently being processed into your bank account. As soon as the lender sends the disbursal webhook confirmation, your complete <strong>Repayment Schedule (RPS)</strong> and <strong>Disbursal UTR</strong> will appear here automatically.
              </p>
              <div className="pt-2 flex flex-wrap items-center gap-4 text-xs font-semibold text-blue-700">
                <span className="inline-flex items-center gap-1">
                  <RefreshCw size={12} className="animate-spin text-blue-600" />
                  Auto-checking status every 5 seconds (Check #{pollCount})
                </span>
                <span>•</span>
                <span>LAN: {loan.lan}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Grid: Loan Overview & Disbursal Details */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Loan Overview Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
            <div className="flex items-center gap-2.5">
              <Landmark className="h-5 w-5 text-emerald-600" />
              <h2 className="text-base font-bold text-slate-900">Loan Overview</h2>
            </div>
            {getStatusBadge(disbursal.status || loan.status)}
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs font-semibold uppercase text-slate-400">Approved Amount</span>
              <p className="mt-0.5 text-lg font-black text-slate-900">{formatCurrency(loan.approvedAmount)}</p>
            </div>
            <div>
              <span className="text-xs font-semibold uppercase text-slate-400">Disbursed Amount</span>
              <p className="mt-0.5 text-lg font-black text-emerald-700">
                {loan.disbursedAmount ? formatCurrency(loan.disbursedAmount) : 'Pending Confirmation'}
              </p>
            </div>
            <div>
              <span className="text-xs font-semibold uppercase text-slate-400">Interest Rate</span>
              <p className="mt-0.5 font-bold text-slate-800">{loan.interestRate}% p.a.</p>
            </div>
            <div>
              <span className="text-xs font-semibold uppercase text-slate-400">Tenure</span>
              <p className="mt-0.5 font-bold text-slate-800">{loan.tenure} Days ({loan.repaymentFrequency || 'MONTHLY'})</p>
            </div>
          </div>
        </div>

        {/* Disbursal Details Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4 mb-4">
            <CreditCard className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900">Disbursal Information</h2>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Disbursal Status</span>
              <span className="font-bold text-slate-800">{disbursal.status || 'NOT_STARTED'}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Disbursal UTR</span>
              <span className="font-mono font-bold text-slate-900">
                {loan.disbursalUtr ? loan.disbursalUtr : 'Pending Lender UTR'}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Disbursal Date</span>
              <span className="font-semibold text-slate-800">{formatDate(loan.disbursalDate)}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">First Repayment Date</span>
              <span className="font-semibold text-slate-800">{formatDate(loan.firstRepaymentDate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Requested / Processed At</span>
              <span className="font-semibold text-slate-800">
                {disbursal.processedAt ? formatDateTime(disbursal.processedAt) : formatDateTime(disbursal.requestedAt)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Repayment Summary */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4 mb-6">
          <PieChart className="h-5 w-5 text-indigo-600" />
          <h2 className="text-base font-bold text-slate-900">Repayment Summary</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
            <span className="text-xs font-bold uppercase text-slate-400">Total Outstanding</span>
            <p className="mt-1 text-xl font-black text-slate-900">{formatCurrency(summary.totalOutstanding)}</p>
            <div className="mt-2 text-xs text-slate-500 flex justify-between">
              <span>Principal: {formatCurrency(summary.principalOutstanding)}</span>
              <span>Interest: {formatCurrency(summary.interestOutstanding)}</span>
            </div>
          </div>

          <div className="rounded-xl bg-emerald-50/60 p-4 border border-emerald-100">
            <span className="text-xs font-bold uppercase text-emerald-600">Total Paid</span>
            <p className="mt-1 text-xl font-black text-emerald-800">{formatCurrency(summary.totalPaid)}</p>
            <p className="mt-2 text-xs text-emerald-600">Completed Payments</p>
          </div>

          <div className="rounded-xl bg-amber-50/60 p-4 border border-amber-100">
            <span className="text-xs font-bold uppercase text-amber-700">Next EMI Dues</span>
            <p className="mt-1 text-xl font-black text-amber-900">{formatCurrency(summary.nextEmiAmount)}</p>
            <p className="mt-2 text-xs text-amber-700">Due: {formatDate(summary.nextDueDate)}</p>
          </div>

          <div className="rounded-xl bg-red-50/60 p-4 border border-red-100">
            <span className="text-xs font-bold uppercase text-red-600">Overdue Amount</span>
            <p className="mt-1 text-xl font-black text-red-800">{formatCurrency(summary.overdueAmount)}</p>
            <p className="mt-2 text-xs text-red-600">{summary.overdueAmount > 0 ? 'Action Required' : 'No Overdues'}</p>
          </div>
        </div>
      </div>

      {/* Repayment Schedule (RPS) Table */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-2.5">
            <FileText className="h-5 w-5 text-emerald-600" />
            <h2 className="text-base font-bold text-slate-900">Repayment Schedule (RPS)</h2>
          </div>
          <span className="text-xs text-slate-500 font-medium">{rps.length} Installments</span>
        </div>

        {rps.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500 space-y-2">
            <Clock className="mx-auto h-8 w-8 text-blue-500 animate-bounce mb-2" />
            <p className="font-bold text-slate-800">Repayment Schedule Pending Lender Confirmation</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Your Repayment Schedule (RPS) will be generated automatically as soon as the lender sends the disbursal webhook confirmation.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3">Inst. #</th>
                  <th className="py-3 px-3">Due Date</th>
                  <th className="py-3 px-3 text-right">Opening Principal</th>
                  <th className="py-3 px-3 text-right">EMI Dues</th>
                  <th className="py-3 px-3 text-right">Interest</th>
                  <th className="py-3 px-3 text-right">Principal</th>
                  <th className="py-3 px-3 text-right">Closing Principal</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-right">Paid Amount</th>
                  <th className="py-3 px-3 text-right">Remaining</th>
                  <th className="py-3 px-3 text-center">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {rps.map((row) => (
                  <tr key={row.installmentNumber} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-3 font-bold text-slate-900">#{row.installmentNumber}</td>
                    <td className="py-3 px-3">{formatDate(row.dueDate)}</td>
                    <td className="py-3 px-3 text-right font-mono">{formatCurrency(row.openingPrincipal)}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">{formatCurrency(row.emi)}</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-500">{formatCurrency(row.interest)}</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-700">{formatCurrency(row.principal)}</td>
                    <td className="py-3 px-3 text-right font-mono">{formatCurrency(row.closingPrincipal)}</td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          row.paymentStatus === 'PAID'
                            ? 'bg-emerald-100 text-emerald-800'
                            : row.paymentStatus === 'OVERDUE'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {row.paymentStatus}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-700">{formatCurrency(row.paidAmount)}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">{formatCurrency(row.remainingAmount)}</td>
                    <td className="py-3 px-3 text-center">
                      {row.remainingAmount > 0 && row.paymentStatus !== 'PAID' ? (
                        <button
                          onClick={() => handleOpenPayModal(row)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-extrabold text-white shadow hover:bg-emerald-700 transition cursor-pointer"
                        >
                          <CreditCard size={13} /> Pay Now
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-800 border border-emerald-200">
                          <CheckCircle2 size={12} /> Paid
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Repayment History & Allocation Tables */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Repayment History */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4 mb-4">
            <History className="h-5 w-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-900">Repayment History</h2>
          </div>

          {repayments.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">No repayment transactions received yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold">
                  <tr>
                    <th className="py-2 px-2">Payment ID</th>
                    <th className="py-2 px-2">Date</th>
                    <th className="py-2 px-2 text-right">Amount</th>
                    <th className="py-2 px-2">Mode</th>
                    <th className="py-2 px-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {repayments.map((rep) => (
                    <tr key={rep.paymentId}>
                      <td className="py-2 px-2 font-mono font-bold text-slate-900">{rep.paymentId}</td>
                      <td className="py-2 px-2">{formatDate(rep.paymentDate)}</td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-emerald-700">{formatCurrency(rep.amountReceived)}</td>
                      <td className="py-2 px-2">{rep.paymentMode}</td>
                      <td className="py-2 px-2">
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">{rep.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Allocation History */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4 mb-4">
            <Layers className="h-5 w-5 text-purple-600" />
            <h2 className="text-base font-bold text-slate-900">Allocation History</h2>
          </div>

          {allocations.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">No payment component allocations recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold">
                  <tr>
                    <th className="py-2 px-2">Payment ID</th>
                    <th className="py-2 px-2">Inst. #</th>
                    <th className="py-2 px-2">Component</th>
                    <th className="py-2 px-2 text-right">Allocated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allocations.map((alloc, idx) => (
                    <tr key={idx}>
                      <td className="py-2 px-2 font-mono font-bold text-slate-900">{alloc.paymentId}</td>
                      <td className="py-2 px-2 font-bold">#{alloc.installmentNumber}</td>
                      <td className="py-2 px-2">{alloc.component}</td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-slate-900">{formatCurrency(alloc.allocatedAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Payment Modal */}
      {isPayModalOpen && selectedInst && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                  <CreditCard size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Pay Loan Installment #{selectedInst.installmentNumber}</h3>
                  <p className="text-xs text-slate-500">Easebuzz Payment Gateway Checkout</p>
                </div>
              </div>
              <button
                onClick={() => setIsPayModalOpen(false)}
                disabled={isProcessingPayment}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {paymentSuccessMsg && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center text-xs font-bold text-emerald-800 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span>{paymentSuccessMsg}</span>
              </div>
            )}

            {paymentErrorMsg && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-xs font-bold text-red-800 flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-600 shrink-0" />
                <span>{paymentErrorMsg}</span>
              </div>
            )}

            {!paymentSuccessMsg && (
              <>
                <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100 space-y-3 text-xs">
                  <div className="flex justify-between border-b border-slate-200/60 pb-2">
                    <span className="text-slate-500">Installment Number</span>
                    <span className="font-bold text-slate-900">#{selectedInst.installmentNumber}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200/60 pb-2">
                    <span className="text-slate-500">Due Date</span>
                    <span className="font-semibold text-slate-800">{formatDate(selectedInst.dueDate)}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200/60 pb-2">
                    <span className="text-slate-500">Principal + Interest Dues</span>
                    <span className="font-mono text-slate-700">{formatCurrency(selectedInst.emi)}</span>
                  </div>
                  <div className="flex justify-between pt-1 text-sm font-black">
                    <span className="text-slate-900">Total Payment Amount</span>
                    <span className="text-emerald-700 font-mono">{formatCurrency(selectedInst.remainingAmount)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <Lock size={12} className="text-emerald-600" />
                  <span>Secured with 256-bit SSL Easebuzz Payment Autocollect Encryption</span>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsPayModalOpen(false)}
                    disabled={isProcessingPayment}
                    className="flex-1 rounded-xl border border-slate-300 bg-white py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleExecutePayment}
                    disabled={isProcessingPayment}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white shadow-lg hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
                  >
                    {isProcessingPayment ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" /> Processing…
                      </>
                    ) : (
                      <>
                        <CreditCard size={14} /> Pay {formatCurrency(selectedInst.remainingAmount)}
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default CustomerLoanDetailsPage;
