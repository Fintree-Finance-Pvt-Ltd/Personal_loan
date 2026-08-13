import React, { useState, useEffect, useRef, useCallback } from 'react';
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

export function AccountAggregatorStep({ lan, onComplete, isCompleted }) {
  const [loading, setLoading] = useState(false);
  const [sdkUrl, setSdkUrl] = useState(null);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [status, setStatus] = useState('NOT_STARTED');
  const [consentStatus, setConsentStatus] = useState(null);
  const [dataStatus, setDataStatus] = useState(null);
  const [failureReason, setFailureReason] = useState(null);
  const [bankSummary, setBankSummary] = useState(null);
  const [isPolling, setIsPolling] = useState(false);

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
      } catch (e) {
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
    setFailureReason(null);
    handleConnectBank();
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      {/* Step Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-950 sm:text-2xl">
              Connect your bank account
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Account Aggregator Verification
            </p>
          </div>
        </div>

        {status === 'SUCCESS' && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Connected
          </span>
        )}
      </div>

      <div className="mt-6 border-t border-slate-100 pt-6">
        <p className="text-sm leading-relaxed text-slate-600">
          Securely connect your bank through RBI-regulated Account Aggregator to share the bank statement information required for your loan assessment.
        </p>

        {/* Security assurance banner */}
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3.5 text-xs text-slate-600">
          <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" />
          <span>
            100% Encrypted & RBI Consent Compliant. No net-banking credentials or passwords are stored.
          </span>
        </div>

        {/* Popup blocked notice */}
        {popupBlocked && sdkUrl && (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              <span>Browser blocked the popup window. Please click below to open the bank consent portal directly.</span>
            </div>
            <a
              href={sdkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 whitespace-nowrap rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700"
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
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5 text-base font-semibold text-white shadow-md transition-all hover:bg-indigo-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
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
          <div className="mt-6 rounded-xl border border-indigo-100 bg-indigo-50/50 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
                <div>
                  <h4 className="text-sm font-semibold text-indigo-950">
                    Bank Connection In Progress
                  </h4>
                  <p className="text-xs text-indigo-700 sm:text-sm">
                    {status === 'CONSENT_PENDING'
                      ? 'Waiting for your consent authorization...'
                      : 'Complete bank selection and OTP authorization in the secure window.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenSdk}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-indigo-700"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Re-open Bank Consent Window
                </button>

                {sdkUrl && (
                  <a
                    href={sdkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    title="Open in new tab"
                  >
                    New Tab
                  </a>
                )}

                <button
                  onClick={fetchStatus}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
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
          <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50/50 p-5">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              <div>
                <h4 className="text-sm font-semibold text-blue-950">
                  Fetching Bank Statement Data
                </h4>
                <p className="text-xs text-blue-700">
                  Consent approved! Retrieving and validating your bank account information securely...
                </p>
              </div>
            </div>
          </div>
        )}

        {/* SUCCESS */}
        {status === 'SUCCESS' && (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 shadow-xs">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
              <div>
                <h4 className="text-base font-semibold text-emerald-950">
                  Bank Account Connected Successfully
                </h4>
                <p className="text-xs text-emerald-700">
                  Your bank statement details have been verified and processed for loan assessment.
                </p>
              </div>
            </div>

            {bankSummary && (
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3 border-t border-emerald-200/80 pt-4">
                <div className="rounded-xl bg-white p-3.5 border border-emerald-100 shadow-2xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Connected Bank</span>
                  <span className="text-sm font-bold text-slate-900 mt-1 block">
                    {bankSummary.fipName || 'Bank Account'} ({bankSummary.accountNumberMasked || 'XXXX'})
                  </span>
                  <span className="text-[11px] text-slate-500 block truncate">{bankSummary.accountHolderName || 'Savings Account'}</span>
                </div>

                <div className="rounded-xl bg-white p-3.5 border border-emerald-100 shadow-2xs">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Current Balance</span>
                  <span className="text-base font-bold text-slate-900 mt-1 block">
                    ₹{Number(bankSummary.currentBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="rounded-xl bg-emerald-600 p-3.5 text-white shadow-xs">
                  <span className="text-[11px] font-semibold text-emerald-100 uppercase tracking-wider block">Average Bank Balance (ABB)</span>
                  <span className="text-base font-extrabold text-white mt-1 block">
                    ₹{Number(bankSummary.averageBalance || bankSummary.abb || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* FAILED / CANCELLED / EXPIRED */}
        {['FAILED', 'CANCELLED', 'EXPIRED'].includes(status) && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-amber-950">
                  {status === 'EXPIRED'
                    ? 'Session Expired'
                    : status === 'CANCELLED'
                    ? 'Connection Cancelled'
                    : 'Bank Connection Failed'}
                </h4>
                <p className="mt-1 text-xs text-amber-800">
                  {failureReason ||
                    (status === 'EXPIRED'
                      ? 'The bank consent session expired before completion. Please start again.'
                      : status === 'CANCELLED'
                      ? 'Bank account connection was cancelled.'
                      : 'Unable to fetch bank information. Please try connecting again.')}
                </p>

                <div className="mt-4">
                  <button
                    onClick={handleRetry}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-amber-700 disabled:opacity-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {status === 'EXPIRED' ? 'Start Again' : 'Retry Bank Connection'}
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
