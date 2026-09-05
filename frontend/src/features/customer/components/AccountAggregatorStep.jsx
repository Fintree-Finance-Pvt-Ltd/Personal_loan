import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Building2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Loader2,
  Upload,
  FileText,
  Lock,
  Eye,
  EyeOff,
  X,
  Sparkles,
} from 'lucide-react';
import {
  initiateAccountAggregator,
  getAccountAggregatorStatus,
  uploadBankStatement,
  getBsaBankList,
} from '../customerApi';

const DEFAULT_POPULAR_BANKS = [
  { code: 'SBI', name: 'State Bank of India' },
  { code: 'HDFC', name: 'HDFC Bank' },
  { code: 'ICICI', name: 'ICICI Bank' },
  { code: 'AXIS', name: 'Axis Bank' },
  { code: 'KOTAK', name: 'Kotak Mahindra Bank' },
  { code: 'PNB', name: 'Punjab National Bank' },
  { code: 'BANK_OF_BARODA', name: 'Bank of Baroda' },
  { code: 'INDUSIND', name: 'IndusInd Bank' },
  { code: 'YES', name: 'Yes Bank' },
  { code: 'CANARA', name: 'Canara Bank' },
  { code: 'UNION_BANK', name: 'Union Bank of India' },
  { code: 'OTHER_BANK', name: 'Other Bank' },
];

export function AccountAggregatorStep({ lan, consentText, onComplete, isCompleted: _isCompleted }) {
  const [loading, setLoading] = useState(false);
  const [sdkUrl, setSdkUrl] = useState(null);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [status, setStatus] = useState('NOT_STARTED');
  const [consentStatus, setConsentStatus] = useState(null);
  const [dataStatus, setDataStatus] = useState(null);
  const [failureReason, setFailureReason] = useState(null);
  const [bankSummary, setBankSummary] = useState(null);
  const [, setIsPolling] = useState(false);

  // Dynamic Bank List from BSA
  const [availableBanks, setAvailableBanks] = useState(DEFAULT_POPULAR_BANKS);
  const [loadingBanks, setLoadingBanks] = useState(false);

  // Bank Statement Upload fallback states
  const [statementFile, setStatementFile] = useState(null);
  const [statementPassword, setStatementPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedBankCode, setSelectedBankCode] = useState('BANK_OF_BARODA');
  const [accountType, setAccountType] = useState('SAVINGS');
  const [customBankName, setCustomBankName] = useState('');
  const [uploadingStatement, setUploadingStatement] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const pollTimerRef = useRef(null);
  const startTimeRef = useRef(null);
  const popupRef = useRef(null);

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
        // Auto-close the Unaport SDK popup window if open
        if (popupRef.current && !popupRef.current.closed) {
          try {
            popupRef.current.close();
          } catch (e) {
            console.warn('Could not auto-close Unaport popup:', e);
          }
        }
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

  // Load BSA Bank List on mount
  useEffect(() => {
    if (!lan) return;
    let isMounted = true;
    setLoadingBanks(true);
    getBsaBankList(lan)
      .then((res) => {
        if (!isMounted) return;
        const bankData = res?.data?.data || res?.data || res;
        if (Array.isArray(bankData) && bankData.length > 0) {
          const formatted = bankData.map((b) => ({
            code: b.bankCode || b.code,
            name: b.bankName || b.name,
          }));
          formatted.push({ code: 'OTHER_BANK', name: 'Other Bank' });
          setAvailableBanks(formatted);
        }
      })
      .catch((err) => {
        console.warn('Could not fetch BSA dynamic bank list, using defaults:', err);
      })
      .finally(() => {
        if (isMounted) setLoadingBanks(false);
      });

    return () => {
      isMounted = false;
    };
  }, [lan]);

  // Window message listener for Unaport SDK exit / completion postMessages
  useEffect(() => {
    const handleSdkMessage = (event) => {
      const origin = event.origin || '';
      const data = event.data;
      const isUnaportOrigin = origin.includes('unaport.com') || origin.includes('premium.unaport.com');

      const eventType = typeof data === 'string' ? data : (data?.type || data?.event || data?.status || data?.action || data?.message || '');
      const isExitEvent = /exit|close|complete|success|finish|done|submitted/i.test(String(eventType));

      if (isUnaportOrigin || isExitEvent) {
        if (popupRef.current && !popupRef.current.closed) {
          try {
            popupRef.current.close();
          } catch (e) {
            console.warn('Could not close SDK popup window upon exit event:', e);
          }
        }
        fetchStatus();
      }
    };

    window.addEventListener('message', handleSdkMessage);
    return () => {
      window.removeEventListener('message', handleSdkMessage);
    };
  }, [fetchStatus]);

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

    popupRef.current = popup;

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

  const detectBankAndAccountType = (fileName) => {
    if (!fileName) return;
    const lower = fileName.toLowerCase();

    // Auto-detect Bank
    if (lower.includes('baroda') || lower.includes('bob')) {
      setSelectedBankCode('BANK_OF_BARODA');
    } else if (lower.includes('sbi') || lower.includes('state bank')) {
      setSelectedBankCode('SBI');
    } else if (lower.includes('hdfc')) {
      setSelectedBankCode('HDFC');
    } else if (lower.includes('icici')) {
      setSelectedBankCode('ICICI');
    } else if (lower.includes('axis')) {
      setSelectedBankCode('AXIS');
    } else if (lower.includes('kotak')) {
      setSelectedBankCode('KOTAK');
    } else if (lower.includes('pnb') || lower.includes('punjab')) {
      setSelectedBankCode('PNB');
    } else if (lower.includes('canara')) {
      setSelectedBankCode('CANARA');
    } else if (lower.includes('indusind')) {
      setSelectedBankCode('INDUSIND');
    } else if (lower.includes('yes')) {
      setSelectedBankCode('YES');
    }

    // Auto-detect Account Type
    if (lower.includes('current') || lower.includes('caa') || lower.includes('ca_') || lower.includes('ca-')) {
      setAccountType('CURRENT');
    } else if (lower.includes('saving') || lower.includes('savings') || lower.includes('sb_') || lower.includes('sb-')) {
      setAccountType('SAVINGS');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        setUploadError('Please select a valid PDF bank statement file.');
        return;
      }
      setUploadError(null);
      setStatementFile(file);
      detectBankAndAccountType(file.name);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        setUploadError('Please select a valid PDF bank statement file.');
        return;
      }
      setUploadError(null);
      setStatementFile(file);
      detectBankAndAccountType(file.name);
    }
  };

  const handleRemoveFile = () => {
    setStatementFile(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUploadBankStatement = async () => {
    if (!statementFile) {
      setUploadError('Please choose a bank statement PDF file to upload.');
      return;
    }

    setUploadingStatement(true);
    setUploadError(null);
    try {
      const bankObj = availableBanks.find((b) => b.code === selectedBankCode);
      const bankName =
        selectedBankCode === 'OTHER_BANK'
          ? customBankName || 'Bank Account'
          : bankObj?.name || 'Bank of Baroda';

      const res = await uploadBankStatement(lan, {
        file: statementFile,
        password: statementPassword,
        bankCode: selectedBankCode,
        bankName,
        accountType,
      });

      const responseData = res?.data || res;
      if (responseData?.status === 'SUCCESS' || responseData?.bankSummary) {
        setUploadSuccess(true);
        setStatus('SUCCESS');
        if (responseData.bankSummary) {
          setBankSummary(responseData.bankSummary);
        }
        stopPolling();
        if (onComplete) {
          setTimeout(() => {
            onComplete();
          }, 1200);
        }
      } else {
        throw new Error(responseData?.message || 'Bank statement analysis could not be completed.');
      }
    } catch (err) {
      console.error('Bank statement upload error:', err);
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Failed to upload and analyze bank statement. Please check the PDF password and try again.';
      setUploadError(msg);
    } finally {
      setUploadingStatement(false);
    }
  };

  const handleRetry = () => {
    setStatus('NOT_STARTED');
    setConsentStatus(null);
    setFailureReason(null);
    setUploadError(null);
    setUploadSuccess(false);
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

        {/* Consent text evidence banner */}
        {consentText && status !== 'SUCCESS' && (
          <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-3.5 text-xs leading-relaxed text-neutral-700">
            {consentText}
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
                  {uploadSuccess
                    ? 'Your bank statement PDF was analyzed and verified with Boost Money BSA.'
                    : 'Your bank statement details have been verified and processed for loan assessment.'}
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
          <div className="mt-6 space-y-6">
            {/* AA Failure Alert Banner */}
            <div className="rounded-xl border border-danger-200 bg-danger-50 p-5">
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
                        ? 'You have rejected consent for this bank account. Please select another bank account or upload your bank statement PDF below.'
                        : dataStatus === 'DENIED'
                          ? 'The bank server timed out or denied sharing the statement. You can retry with another bank or upload your statement PDF below.'
                          : status === 'EXPIRED'
                            ? 'The bank consent session expired before completion. Please start again or upload your statement PDF.'
                            : status === 'CANCELLED'
                              ? 'Bank account connection was cancelled.'
                              : 'Unable to fetch bank information. Please retry or upload your statement PDF.')}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      onClick={handleRetry}
                      disabled={loading || uploadingStatement}
                      className="inline-flex items-center gap-2 rounded-lg bg-danger-600 px-4 py-2.5 text-xs font-bold text-white shadow hover:bg-danger-700 disabled:opacity-50 cursor-pointer"
                    >
                      <Building2 className="h-4 w-4" />
                      {consentStatus === 'REJECTED' || dataStatus === 'DENIED' ? 'Retry / Select Another Bank' : status === 'EXPIRED' ? 'Start Again' : 'Retry Bank Connection'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* OR Divider */}
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-neutral-200" />
              </div>
              <div className="relative bg-white px-4 text-xs font-bold uppercase tracking-wider text-neutral-500">
                OR UPLOAD BANK STATEMENT
              </div>
            </div>

            {/* Bank Statement PDF Upload Section (Boost Money BSA API Fallback) */}
            <div className="rounded-2xl border-2 border-dashed border-accent-300 bg-accent-50/30 p-6 sm:p-7">
              <div className="flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-600 text-white shadow-sm">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-950">
                    Upload Bank Statement (PDF)
                  </h3>
                  <p className="mt-0.5 text-xs text-neutral-600">
                    Instant income verification powered by Boost Money Bank Statement Analysis (BSA) API.
                  </p>
                </div>
              </div>

              {/* Form Controls */}
              <div className="mt-5 space-y-4">
                {/* Bank Selector */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-neutral-700">
                      Select Your Bank
                    </label>
                    {loadingBanks && (
                      <span className="flex items-center gap-1 text-[11px] text-neutral-500">
                        <Loader2 className="h-3 w-3 animate-spin" /> Loading banks...
                      </span>
                    )}
                  </div>
                  <select
                    value={selectedBankCode}
                    onChange={(e) => setSelectedBankCode(e.target.value)}
                    disabled={uploadingStatement}
                    className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-xs font-medium text-neutral-900 shadow-2xs focus:border-accent-600 focus:outline-none focus:ring-1 focus:ring-accent-600"
                  >
                    {availableBanks.map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  {selectedBankCode === 'OTHER_BANK' && (
                    <input
                      type="text"
                      placeholder="Enter bank name"
                      value={customBankName}
                      onChange={(e) => setCustomBankName(e.target.value)}
                      disabled={uploadingStatement}
                      className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-xs font-medium text-neutral-900 shadow-2xs focus:border-accent-600 focus:outline-none focus:ring-1 focus:ring-accent-600"
                    />
                  )}
                </div>

                {/* Account Type Selector */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                    Account Type
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setAccountType('SAVINGS')}
                      disabled={uploadingStatement}
                      className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-semibold border transition-all cursor-pointer ${
                        accountType === 'SAVINGS'
                          ? 'border-accent-600 bg-accent-50 text-accent-700 shadow-2xs'
                          : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300'
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${accountType === 'SAVINGS' ? 'bg-accent-600' : 'bg-neutral-300'}`} />
                      Savings Account
                    </button>
                    <button
                      type="button"
                      onClick={() => setAccountType('CURRENT')}
                      disabled={uploadingStatement}
                      className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-semibold border transition-all cursor-pointer ${
                        accountType === 'CURRENT'
                          ? 'border-accent-600 bg-accent-50 text-accent-700 shadow-2xs'
                          : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300'
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${accountType === 'CURRENT' ? 'bg-accent-600' : 'bg-neutral-300'}`} />
                      Current Account
                    </button>
                  </div>
                </div>

                {/* PDF File Drag and Drop / Selector */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                    Bank Statement PDF (Last 3 to 6 Months)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={uploadingStatement}
                  />

                  {!statementFile ? (
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${isDragging
                          ? 'border-accent-600 bg-accent-100/60'
                          : 'border-neutral-300 bg-white hover:border-accent-400 hover:bg-neutral-50/80'
                        }`}
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-100 text-accent-700 mb-2">
                        <Upload className="h-5 w-5" />
                      </div>
                      <p className="text-xs font-semibold text-neutral-900">
                        Click to browse or drag and drop statement PDF here
                      </p>
                      <p className="mt-1 text-[11px] text-neutral-500">
                        Supports PDF files up to 25 MB
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-3.5 shadow-2xs">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger-50 text-danger-600">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-neutral-900">
                            {statementFile.name}
                          </p>
                          <p className="text-[11px] text-neutral-500">
                            {(statementFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to analyze
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveFile}
                        disabled={uploadingStatement}
                        className="ml-2 flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                        title="Remove file"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* PDF Password Field */}
                <div>
                  <label className="flex items-center justify-between text-xs font-semibold text-neutral-700 mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 text-neutral-500" />
                      PDF Password (If Protected)
                    </span>
                    <span className="text-[11px] font-normal text-neutral-500">Optional</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="e.g. DDMMYYYY, PAN, or account password"
                      value={statementPassword}
                      onChange={(e) => setStatementPassword(e.target.value)}
                      disabled={uploadingStatement}
                      className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 pr-10 text-xs font-medium text-neutral-900 shadow-2xs focus:border-accent-600 focus:outline-none focus:ring-1 focus:ring-accent-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Upload Error Alert */}
                {uploadError && (
                  <div className="flex items-start gap-2 rounded-xl border border-danger-200 bg-danger-50 p-3 text-xs text-danger-900">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-danger-600 mt-0.5" />
                    <span>{uploadError}</span>
                  </div>
                )}

                {/* Upload Action Button */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleUploadBankStatement}
                    disabled={!statementFile || uploadingStatement}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent-600 px-5 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-accent-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {uploadingStatement ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Analyzing with Boost Money BSA...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        Upload & Analyze Bank Statement
                      </>
                    )}
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
