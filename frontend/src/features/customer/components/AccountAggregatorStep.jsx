import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Building2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import {
  initiateAccountAggregator,
  getAccountAggregatorStatus,
} from '../customerApi';

export function AccountAggregatorStep({ lan, onComplete, isCompleted: _isCompleted }) {
  const [loading, setLoading] = useState(false);
  const [sdkUrl, setSdkUrl] = useState(null);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [status, setStatus] = useState('NOT_STARTED');
  const [consentStatus, setConsentStatus] = useState(null);
  const [dataStatus, setDataStatus] = useState(null);
  const [failureReason, setFailureReason] = useState(null);
  const [bankSummary, setBankSummary] = useState(null);
  const [, setIsPolling] = useState(false);

  const pollTimerRef = useRef(null);
  const startTimeRef = useRef(null);

  // Poll status from backend API
  const fetchStatus = useCallback(async () => {
    if (!lan) return;
    try {
      const res = await getAccountAggregatorStatus(lan);
      const statusData = res?.data || res;
      const currentStatus = statusData?.status || 'NOT_STARTED';
      setStatus(currentStatus);
      setConsentStatus(statusData?.consentStatus || null);
      setDataStatus(statusData?.dataStatus || null);
      setFailureReason(statusData?.failureReason || null);
      setBankSummary(statusData?.bankSummary || null);

      if (statusData?.completed || currentStatus === 'SUCCESS') {
        stopPolling();
        if (onComplete) onComplete();
      } else if (['FAILED', 'EXPIRED', 'CANCELLED'].includes(currentStatus)) {
        stopPolling();
      }
    } catch (err) {
      console.error('Failed to fetch Account Aggregator status:', err);
    }
  }, [lan, onComplete]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return;
    setIsPolling(true);
    startTimeRef.current = Date.now();

    fetchStatus();

    // Poll local DB status while bank authorization is in progress
    pollTimerRef.current = setInterval(() => {
      if (startTimeRef.current && Date.now() - startTimeRef.current > 10 * 60 * 1000) {
        stopPolling();
        return;
      }
      fetchStatus();
    }, 4000);
  }, [fetchStatus, stopPolling]);

  useEffect(() => {
    fetchStatus();
    return () => {
      stopPolling();
    };
  }, [fetchStatus, stopPolling]);

  // Window focus listener to re-check status when user returns from consent popup tab
  useEffect(() => {
    const handleFocus = () => {
      if (['INITIATED', 'SDK_OPENED', 'CONSENT_PENDING', 'CONSENT_APPROVED', 'DATA_PENDING'].includes(status)) {
        fetchStatus();
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [status, fetchStatus]);

  const openSdkPopup = (url) => {
    setPopupBlocked(false);
    const width = 520;
    const height = 760;
    const left = Math.max(0, Math.floor((window.innerWidth - width) / 2 + window.screenX));
    const top = Math.max(0, Math.floor((window.innerHeight - height) / 2 + window.screenY));

    const popup = window.open(
      url,
      'UnaportAccountAggregator',
      `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes,status=yes`
    );

    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      setPopupBlocked(true);
    } else {
      try {
        popup.focus();
      } catch {
        // ignore focus error if cross-origin
      }

      // Check for popup closure to instantly fetch updated webhook status
      const popupClosedCheck = setInterval(() => {
        if (popup.closed) {
          clearInterval(popupClosedCheck);
          fetchStatus();
        }
      }, 1000);
    }
  };

  const handleConnectBank = async () => {
    if (!lan) return;
    setLoading(true);
    setFailureReason(null);
    try {
      const res = await initiateAccountAggregator(lan);
      const url = res?.sdkUrl || res?.data?.sdkUrl || res?.data?.data?.sdkUrl;

      if (!url) {
        throw new Error('Failed to generate Unaport Web SDK URL.');
      }

      setSdkUrl(url);
      setStatus('SDK_OPENED');
      openSdkPopup(url);
      startPolling();
    } catch (err) {
      console.error('Account Aggregator initiation error:', err);
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'Unable to launch bank aggregator. Please try again.';
      setFailureReason(message);
      setStatus('FAILED');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSdk = () => {
    if (sdkUrl) {
      openSdkPopup(sdkUrl);
    } else {
      handleConnectBank();
    }
  };

  const handleRetry = () => {
    setStatus('NOT_STARTED');
    setConsentStatus(null);
    setFailureReason(null);
    handleConnectBank();
  };

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
      {/* Step Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-950 sm:text-2xl">
              Share your bank statement
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Lets us verify your income without you uploading a single document
            </p>
          </div>
        </div>

        {status === 'SUCCESS' && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            <CheckCircle2 className="h-4 w-4" /> Connected
          </span>
        )}
      </div>

      <div className="mt-6 border-t border-neutral-100 pt-6">
        <p className="text-sm leading-relaxed text-neutral-600">
          We use <strong>Account Aggregator</strong> — an RBI-regulated system banks use to share statements securely — instead of asking you to find and upload PDF statements yourself.
        </p>

        {status === 'NOT_STARTED' && (
          <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50/80 p-5">
            <h4 className="flex items-center gap-2 text-sm font-bold text-neutral-900">
              <ShieldCheck size={17} className="text-brand-600" />
              What happens next
            </h4>
            <ol className="mt-3 space-y-2.5 text-xs leading-5 text-neutral-600">
              <li className="flex gap-2.5">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-100 text-[10px] font-bold text-accent-700">1</span>
                A secure window opens where you pick your bank from a list.
              </li>
              <li className="flex gap-2.5">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-100 text-[10px] font-bold text-accent-700">2</span>
                Log in the way you normally do for that bank, and approve sharing your statement — you're never asked for your net-banking password here.
              </li>
              <li className="flex gap-2.5">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-100 text-[10px] font-bold text-accent-700">3</span>
                Come back to this tab — we'll detect it automatically once it's done.
              </li>
            </ol>
          </div>
        )}

        {/* Security assurance banner */}
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-neutral-50 p-3.5 text-xs text-neutral-600">
          <ShieldCheck className="h-5 w-5 shrink-0 text-brand-600" />
          <span>
            100% Encrypted & RBI Consent Compliant. No net-banking credentials or passwords are stored.
          </span>
        </div>

        {/* Popup blocked notice */}
        {popupBlocked && sdkUrl && (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-caution-200 bg-caution-50 p-4 text-xs text-caution-900">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-caution-600" />
              <span>Browser blocked the popup window. Please click below to open the bank consent portal directly.</span>
            </div>
            <a
              href={sdkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 whitespace-nowrap rounded-lg bg-caution-600 px-3 py-1.5 font-semibold text-white hover:bg-caution-700"
            >
              Launch Portal
            </a>
          </div>
        )}

        {/* Dynamic UI Status Views */}

        {/* NOT_STARTED */}
        {status === 'NOT_STARTED' && (
          <div className="mt-6">
            <button
              onClick={handleConnectBank}
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent-600 px-6 py-3.5 text-base font-semibold text-white shadow-md transition-all hover:bg-accent-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Generating Secure Link...
                </>
              ) : (
                <>
                  <Building2 className="h-5 w-5" />
                  Connect Bank Account
                </>
              )}
            </button>
          </div>
        )}

        {/* INITIATED / SDK_OPENED / CONSENT_PENDING */}
        {['INITIATED', 'SDK_OPENED', 'CONSENT_PENDING'].includes(status) && (
          <div className="mt-6 rounded-xl border border-accent-100 bg-accent-50/50 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-accent-600" />
                <div>
                  <h4 className="text-sm font-semibold text-accent-950">
                    Bank Connection In Progress
                  </h4>
                  <p className="text-xs text-accent-700 sm:text-sm">
                    {status === 'CONSENT_PENDING'
                      ? 'Waiting for your consent authorization...'
                      : 'Complete bank selection and OTP authorization in the secure window.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenSdk}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-accent-700"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Re-open Bank Consent Window
                </button>

                {sdkUrl && (
                  <a
                    href={sdkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                    title="Open in new tab"
                  >
                    New Tab
                  </a>
                )}

                <button
                  onClick={fetchStatus}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-accent-200 bg-accent-50 px-3 py-2 text-xs font-semibold text-accent-700 hover:bg-accent-100"
                  title="Check current bank connection status"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Check Status
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CONSENT_APPROVED / DATA_PENDING */}
        {['CONSENT_APPROVED', 'DATA_PENDING'].includes(status) && (
          <div className="mt-6 rounded-xl border border-info-100 bg-info-50/50 p-5">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-info-600" />
              <div>
                <h4 className="text-sm font-semibold text-info-950">
                  Fetching Bank Statement Data
                </h4>
                <p className="text-xs text-info-700">
                  Consent approved! Retrieving and validating your bank account information securely...
                </p>
              </div>
            </div>
          </div>
        )}

        {/* SUCCESS */}
        {status === 'SUCCESS' && (
          <div className="mt-6 rounded-2xl border border-brand-200 bg-brand-50/80 p-5 shadow-xs">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-brand-600 shrink-0" />
              <div>
                <h4 className="text-base font-semibold text-brand-950">
                  Bank Account Connected Successfully
                </h4>
                <p className="text-xs text-brand-700">
                  Your bank statement details have been verified and processed for loan assessment.
                </p>
              </div>
            </div>

            {bankSummary && (
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3 border-t border-brand-200/80 pt-4">
                <div className="rounded-xl bg-white p-3.5 border border-brand-100 shadow-2xs">
                  <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider block">Connected Bank</span>
                  <span className="text-sm font-bold text-neutral-900 mt-1 block">
                    {bankSummary.fipName || 'Bank Account'} ({bankSummary.accountNumberMasked || 'XXXX'})
                  </span>
                  <span className="text-[11px] text-neutral-500 block truncate">{bankSummary.accountHolderName || 'Savings Account'}</span>
                </div>

                <div className="rounded-xl bg-white p-3.5 border border-brand-100 shadow-2xs">
                  <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider block">Current Balance</span>
                  <span className="text-base font-bold text-neutral-900 mt-1 block">
                    ₹{Number(bankSummary.currentBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="rounded-xl bg-brand-600 p-3.5 text-white shadow-xs">
                  <span className="text-[11px] font-semibold text-brand-100 uppercase tracking-wider block">Average Bank Balance (ABB)</span>
                  <span className="text-base font-extrabold text-white mt-1 block">
                    ₹{Number(bankSummary.averageBalance || bankSummary.abb || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* FAILED / CANCELLED / EXPIRED / REJECTED / DENIED */}
        {(['FAILED', 'CANCELLED', 'EXPIRED'].includes(status) || consentStatus === 'REJECTED' || dataStatus === 'DENIED' || dataStatus === 'FAILED') && (
          <div className="mt-6 rounded-xl border border-danger-200 bg-danger-50 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-danger-600" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-danger-950">
                  {consentStatus === 'REJECTED'
                    ? 'Consent Rejected — Please Select Another Bank'
                    : dataStatus === 'DENIED' || status === 'FAILED'
                    ? 'Bank Fetch Denied / Timed Out'
                    : status === 'EXPIRED'
                    ? 'Session Expired'
                    : status === 'CANCELLED'
                    ? 'Connection Cancelled'
                    : 'Bank Connection Failed'}
                </h4>
                <p className="mt-1 text-xs text-danger-800 leading-relaxed">
                  {failureReason ||
                    (consentStatus === 'REJECTED'
                      ? 'You have rejected consent for this bank account. Please select another bank account to continue your loan verification.'
                      : dataStatus === 'DENIED'
                      ? 'The bank server timed out or denied sharing the statement. Please retry bank connection or choose another bank.'
                      : status === 'EXPIRED'
                      ? 'The bank consent session expired before completion. Please start again.'
                      : status === 'CANCELLED'
                      ? 'Bank account connection was cancelled.'
                      : 'Unable to fetch bank information. Please try connecting again.')}
                </p>

                <div className="mt-4 flex items-center gap-3">
                  <button
                    onClick={handleRetry}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-lg bg-danger-600 px-4 py-2.5 text-xs font-bold text-white shadow hover:bg-danger-700 disabled:opacity-50 cursor-pointer"
                  >
                    <Building2 className="h-4 w-4" />
                    {consentStatus === 'REJECTED' || dataStatus === 'DENIED' ? 'Retry / Select Another Bank' : status === 'EXPIRED' ? 'Start Again' : 'Retry Bank Connection'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
