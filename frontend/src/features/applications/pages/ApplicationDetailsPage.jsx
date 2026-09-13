import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  ExternalLink,
  MessageCircle,
  Phone,
  RefreshCw,
  X,
} from 'lucide-react';
import { applicationsApi } from '../api/applications.api';
import { apiError } from '../../../lib/api';
import { resolveFileUrl } from '../../../lib/files';
import { useAuth } from '../../../auth/AuthContext';
import { Alert, Badge, Button, Card, Panel, PageHeader, Spinner, TableShell } from '../../../components/ui';
import { StageStatusBadge } from '../components/StageStatusBadge';
import { LoanChargesCard } from '../components/LoanChargesCard';
import { RepaymentScheduleCard } from '../components/RepaymentScheduleCard';

function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '-';
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('en-IN') : '-';
}

function formatLabel(value) {
  if (!value) return '-';
  return String(value)
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// How long until the worker would pick a RETRY_PENDING stage up on its own. The backoff
// schedule ends at 3600s, so this is worth showing — it tells the operator whether waiting
// is even an option, or whether they should force it now.
function formatRetryCountdown(availableAt) {
  if (!availableAt) return null;
  const seconds = Math.ceil((new Date(availableAt).getTime() - Date.now()) / 1000);
  if (seconds <= 0) return 'due now';
  if (seconds < 60) return `auto-retry in ${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  return minutes < 60 ? `auto-retry in ${minutes}m` : `auto-retry in ${Math.ceil(minutes / 60)}h`;
}

const IVR_STATUS_TONES = {
  COMPLETED: 'brand',
  FAILED: 'danger',
  ERROR: 'danger',
  IN_PROGRESS: 'caution',
  INITIATED: 'caution',
};

const SummaryRow = ({ label, children }) => (
  <div className="flex items-start justify-between gap-4 border-b border-neutral-100 py-2 text-sm last:border-0">
    <dt className="text-neutral-500">{label}</dt>
    <dd className="font-numeric text-right font-semibold text-ink">{children}</dd>
  </div>
);

export default function ApplicationDetailsPage() {
  const { applicationId } = useParams();
  const auth = useAuth();
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryingEventId, setRetryingEventId] = useState(null);
  const [sendingWelcomeLetter, setSendingWelcomeLetter] = useState(false);
  const [welcomeLetterMessage, setWelcomeLetterMessage] = useState(null);

  const customer = details?.customer;
  const application = details?.application;
  const loan = details?.loan;
  const stages = details?.stages || [];
  const link = details?.link;
  const documents = details?.documents || [];

  // IVR AI Calling State
  const [ivrCalls, setIvrCalls] = useState([]);
  const [loadingIvr, setLoadingIvr] = useState(false);
  const [callingCustomer, setCallingCustomer] = useState(false);
  const [callType, setCallType] = useState('APPLICATION_FOLLOW_UP');
  const [callMessage, setCallMessage] = useState(null);
  const [syncingCallId, setSyncingCallId] = useState(null);
  const [expandedTranscriptId, setExpandedTranscriptId] = useState(null);

  // WhatsApp Messaging State
  const [whatsappLogs, setWhatsappLogs] = useState([]);
  const [loadingWhatsapp, setLoadingWhatsapp] = useState(false);
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
  const [whatsappEventType, setWhatsappEventType] = useState('LOAN_APPROVED');
  const [whatsappMessage, setWhatsappMessage] = useState(null);

  const loadIvrHistory = () => {
    if (!applicationId) return;
    setLoadingIvr(true);
    applicationsApi
      .getIvrCallHistory(applicationId)
      .then((data) => setIvrCalls(Array.isArray(data) ? data : []))
      .catch((err) => console.error('Failed to load IVR history:', err))
      .finally(() => setLoadingIvr(false));
  };

  const loadWhatsappHistory = (appDetails = details) => {
    if (!applicationId) return;
    setLoadingWhatsapp(true);
    applicationsApi
      .getWhatsAppLogs({
        applicationId,
        lan: appDetails?.application?.platformLan || appDetails?.loan?.lan || undefined,
        customerId: appDetails?.customer?.id || undefined,
      })
      .then((res) => {
        const rawList = res?.data ?? res?.logs ?? res ?? [];
        setWhatsappLogs(Array.isArray(rawList) ? rawList : []);
      })
      .catch((err) => console.error('Failed to load WhatsApp history:', err))
      .finally(() => setLoadingWhatsapp(false));
  };

  const load = () => {
    setLoading(true);
    setError('');
    applicationsApi
      .getDetails(applicationId)
      .then((res) => {
        setDetails(res);
        loadWhatsappHistory(res);
      })
      .catch((err) => setError(apiError(err, 'Unable to load application details.')))
      .finally(() => setLoading(false));
    loadIvrHistory();
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  const handleInitiateCall = async () => {
    if (!customer?.mobileNumber) {
      setCallMessage({ type: 'error', text: 'Customer has no valid mobile number.' });
      return;
    }
    const confirmed = window.confirm(
      `Initiate AI Outbound Call to customer ${customer.fullName || ''} (${customer.mobileNumber}) for "${formatLabel(callType)}"?`
    );
    if (!confirmed) return;

    setCallingCustomer(true);
    setCallMessage(null);
    try {
      const res = await applicationsApi.initiateIvrCall(applicationId, callType);
      setCallMessage({
        type: 'success',
        text: `AI Call initiated successfully! (Call ID: ${res?.callId || 'Dispatched'})`,
      });
      loadIvrHistory();
    } catch (err) {
      setCallMessage({
        type: 'error',
        text: apiError(err, 'Failed to trigger AI IVR call. Please check service configuration.'),
      });
    } finally {
      setCallingCustomer(false);
    }
  };

  const handleSyncCallStatus = async (providerCallId) => {
    if (!providerCallId) return;
    setSyncingCallId(providerCallId);
    try {
      await applicationsApi.getIvrCallStatus(providerCallId);
      loadIvrHistory();
    } catch (err) {
      console.error('Failed to sync call status:', err);
    } finally {
      setSyncingCallId(null);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!customer?.mobileNumber) {
      setWhatsappMessage({ type: 'error', text: 'Customer has no valid mobile number.' });
      return;
    }
    const confirmed = window.confirm(
      `Send official WhatsApp message to customer ${customer.fullName || ''} (${customer.mobileNumber}) for "${formatLabel(whatsappEventType)}"?`
    );
    if (!confirmed) return;

    setSendingWhatsapp(true);
    setWhatsappMessage(null);
    try {
      const res = await applicationsApi.triggerWhatsAppEvent({
        eventType: whatsappEventType,
        applicationId,
        lan: application?.platformLan || loan?.lan || undefined,
      });

      if (res?.data?.success || res?.success) {
        setWhatsappMessage({
          type: 'success',
          text: `WhatsApp message dispatched successfully! (Status: ${res?.data?.status || 'ACCEPTED'})`,
        });
      } else {
        setWhatsappMessage({
          type: 'error',
          text: res?.data?.errorMessage || res?.message || 'WhatsApp message dispatch failed.',
        });
      }
      loadWhatsappHistory();
    } catch (err) {
      setWhatsappMessage({
        type: 'error',
        text: apiError(err, 'Failed to trigger WhatsApp message.'),
      });
    } finally {
      setSendingWhatsapp(false);
    }
  };

  const handleRetry = async (eventId) => {
    setRetryingEventId(eventId);
    setError('');
    try {
      await applicationsApi.retryStage(eventId);
      load();
    } catch (err) {
      setError(apiError(err, 'Unable to retry this stage.'));
    } finally {
      setRetryingEventId(null);
    }
  };

  const handleSendWelcomeLetter = async (lan) => {
    setSendingWelcomeLetter(true);
    setWelcomeLetterMessage(null);
    try {
      const result = await applicationsApi.resendWelcomeLetter(lan);
      setWelcomeLetterMessage({ type: 'success', text: result?.message || 'Welcome letter sent.' });
    } catch (err) {
      setWelcomeLetterMessage({ type: 'error', text: apiError(err, 'Unable to send the welcome letter.') });
    } finally {
      setSendingWelcomeLetter(false);
    }
  };

  if (loading && !details) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Loading application…" />
      </div>
    );
  }

  if (error && !details) {
    return <Alert>{error}</Alert>;
  }

  if (!details) return null;

  const canRetry = auth.hasPermission('LENDER_UPDATE');

  return (
    <div>
      <Link
        to="/admin-master/applications"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"
      >
        <ArrowLeft size={15} /> Back to Applications
      </Link>

      <PageHeader
        eyebrow="Application"
        title={application.applicationNumber}
        description={`${customer.fullName} (${customer.customerCode}) · ${customer.mobileNumber}`}
        actions={<StageStatusBadge value={application.status} />}
      />

      {error && <div className="mb-5"><Alert>{error}</Alert></div>}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-xs font-bold uppercase tracking-wide text-neutral-400">Customer</p>
          <dl className="mt-2">
            <SummaryRow label="Name">{customer.fullName || '-'}</SummaryRow>
            <SummaryRow label="Code">{customer.customerCode || '-'}</SummaryRow>
            <SummaryRow label="Mobile">{customer.mobileNumber || '-'}</SummaryRow>
            <SummaryRow label="Email"><span className="truncate">{customer.email || '-'}</span></SummaryRow>
            <SummaryRow label="PAN">{customer.panNumber || '-'}</SummaryRow>
          </dl>
        </Card>

        <Card>
          <p className="text-xs font-bold uppercase tracking-wide text-neutral-400">Application</p>
          <dl className="mt-2">
            <SummaryRow label="LAN">{application.platformLan || '-'}</SummaryRow>
            <SummaryRow label="Lender">{application.lenderCode || '-'}</SummaryRow>
            <SummaryRow label="Requested">{formatCurrency(application.requestedAmount)}</SummaryRow>
            <SummaryRow label="Selected">{formatCurrency(application.selectedAmount)} / {application.selectedTenure ?? '-'}d</SummaryRow>
            <SummaryRow label="Approved">{formatCurrency(application.approvedAmount)}</SummaryRow>
            <SummaryRow label="Submitted">{formatDate(application.submittedAt)}</SummaryRow>
          </dl>
        </Card>

        <Card>
          <p className="text-xs font-bold uppercase tracking-wide text-neutral-400">Lender decision</p>
          <dl className="mt-2">
            <SummaryRow label="Normalized">{link ? <StageStatusBadge value={link.normalizedDecision} /> : '-'}</SummaryRow>
            <SummaryRow label="Lender approved">{formatCurrency(application.lenderApprovedAmount)}</SummaryRow>
            <SummaryRow label="Lender tenure">{application.lenderApprovedTenure ?? '-'}</SummaryRow>
            <SummaryRow label="Lender ROI">{application.lenderApprovedRoi ?? '-'}%</SummaryRow>
            <SummaryRow label="Decision at">{formatDate(application.lenderDecisionAt)}</SummaryRow>
          </dl>
          {application.lenderDecisionReason && (
            <p className="mt-2 text-xs text-neutral-500">{application.lenderDecisionReason}</p>
          )}
        </Card>

        <Card>
          <p className="text-xs font-bold uppercase tracking-wide text-neutral-400">Loan</p>
          {loan ? (
            <>
              <dl className="mt-2">
                <SummaryRow label="LAN">{loan.lan}</SummaryRow>
                <SummaryRow label="Status"><StageStatusBadge value={loan.status} /></SummaryRow>
                <SummaryRow label="Disbursal"><StageStatusBadge value={loan.disbursalStatus} /></SummaryRow>
                <SummaryRow label="Approved amount">{formatCurrency(loan.approvedAmount)}</SummaryRow>
              </dl>
              {(loan.status === 'DISBURSED' || loan.status === 'FULLY_PAID') && auth.hasPermission('LOAN_MANAGE') && (
                <div className="mt-4 border-t border-neutral-100 pt-4">
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    disabled={sendingWelcomeLetter}
                    onClick={() => handleSendWelcomeLetter(loan.lan)}
                  >
                    {sendingWelcomeLetter ? 'Sending…' : 'Send welcome letter'}
                  </Button>
                  {welcomeLetterMessage && (
                    <p className={`mt-2 text-xs font-semibold ${welcomeLetterMessage.type === 'success' ? 'text-brand-700' : 'text-danger-600'}`}>
                      {welcomeLetterMessage.text}
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-neutral-500">No loan created yet.</p>
          )}
        </Card>
      </div>

      {link && (
        <Panel title="Current stage status" className="mb-6">
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-neutral-500">Create</p>
              <StageStatusBadge value={link.createStatus} />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-neutral-500">Consent</p>
              <StageStatusBadge value={link.consentStatus} />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-neutral-500">Update</p>
              <StageStatusBadge value={link.updateStatus} />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-neutral-500">Decision</p>
              <StageStatusBadge value={link.decisionStatus} />
            </div>
          </div>
          {link.lastErrorMessage && (
            <div className="mt-4 rounded-lg border-l-4 border-danger-300 bg-danger-50 px-4 py-3 text-sm text-danger-800">
              <span className="font-bold">{link.lastErrorCode}:</span> {link.lastErrorMessage}
            </div>
          )}
          {link.partnerApplicationId && (
            <p className="mt-3 text-xs text-neutral-500">Partner application ID: {link.partnerApplicationId}</p>
          )}
        </Panel>
      )}

      {loan && (
        <RepaymentScheduleCard
          lan={loan.lan}
          mandates={loan.mandates || []}
          schedules={loan.repaymentSchedules || []}
          canManage={auth.hasPermission('LOAN_MANAGE')}
          onChanged={load}
        />
      )}

      {loan && (
        <LoanChargesCard
          lan={loan.lan}
          charges={loan.charges || []}
          canManage={auth.hasPermission('LOAN_CHARGE_MANAGE')}
          onChanged={load}
        />
      )}

      <Panel
        title="Documents"
        description="All documents uploaded by the customer for this application."
        className="mb-6"
      >
        <TableShell>
          <thead className="border-b border-neutral-200 bg-neutral-50">
            <tr>
              <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Type</th>
              <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Applicant</th>
              <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Status</th>
              <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Source</th>
              <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Uploaded</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {!documents || documents.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-5 py-8 text-center text-neutral-500">
                  No documents uploaded yet for this application.
                </td>
              </tr>
            ) : (
              documents.map((document) => (
                <tr key={document.documentId} className="align-top hover:bg-neutral-50/70">
                  <td className="px-5 py-3.5">
                    <div className="font-semibold text-ink">{formatLabel(document.documentType)}</div>
                    <div className="text-xs text-neutral-500">{document.fileName}</div>
                  </td>
                  <td className="px-5 py-3.5">{formatLabel(document.applicantType)}</td>
                  <td className="px-5 py-3.5"><StageStatusBadge value={document.status} /></td>
                  <td className="px-5 py-3.5 text-sm text-neutral-500">{formatLabel(document.source)}</td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-sm text-neutral-500">{formatDate(document.uploadedAt)}</td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-right">
                    {document.fileUrl && (
                      <a
                        href={resolveFileUrl(document.fileUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700"
                      >
                        View <ExternalLink size={12} />
                      </a>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
      </Panel>

      {/* AI IVR Outbound Calling Card */}
      <Panel className="mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-display flex items-center gap-2 text-base font-bold text-ink">
              <Phone size={17} className="text-brand-600" /> AI outbound calling (IVR)
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              Initiate automated AI voice calls to the customer ({customer.fullName || 'Customer'} — {customer.mobileNumber || 'No mobile'}) with real-time context.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={callType}
              onChange={(e) => setCallType(e.target.value)}
              disabled={callingCustomer}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 shadow-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
            >
              <option value="APPLICATION_FOLLOW_UP">Application Follow-up</option>
              <option value="DOCUMENT_PENDING">Document Pending</option>
              <option value="KYC_PENDING">KYC Pending</option>
              <option value="MANDATE_PENDING">Mandate Pending</option>
              <option value="ESIGN_PENDING">eSign Pending</option>
              <option value="LOAN_APPROVAL">Loan Approval</option>
              <option value="DISBURSEMENT_CONFIRMATION">Disbursement Confirmation</option>
              <option value="EMI_REMINDER">EMI Reminder</option>
              <option value="PAYMENT_FOLLOW_UP">Payment Follow-up</option>
              <option value="REPEAT_LOAN_OFFER">Repeat Loan Offer (TP-06)</option>
              <option value="CUSTOMER_SUPPORT">Customer Support</option>
            </select>

            <Button
              type="button"
              disabled={callingCustomer || !customer?.mobileNumber}
              onClick={handleInitiateCall}
              className="!min-h-9 !px-3.5 text-xs"
            >
              <Phone size={13} /> {callingCustomer ? 'Initiating call…' : 'Call customer'}
            </Button>

            <Button
              type="button"
              variant="secondary"
              disabled={loadingIvr}
              onClick={loadIvrHistory}
              className="!min-h-9 !px-3.5 text-xs"
              title="Refresh IVR Call History"
            >
              <RefreshCw size={13} className={loadingIvr ? 'animate-spin' : ''} /> Refresh
            </Button>
          </div>
        </div>

        {callMessage && (
          <div className="mt-4">
            <Alert tone={callMessage.type}>{callMessage.text}</Alert>
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Call log history</p>
          <TableShell>
            <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wide">Date &amp; time</th>
                <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wide">Purpose / type</th>
                <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wide">Mobile</th>
                <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wide">Status</th>
                <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wide">Duration</th>
                <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wide">Summary &amp; notes</th>
                <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wide">Recording</th>
                <th className="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-xs">
              {ivrCalls.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-4 py-6 text-center text-neutral-400">
                    {loadingIvr ? 'Loading call history…' : 'No IVR calls recorded yet for this application.'}
                  </td>
                </tr>
              ) : (
                ivrCalls.map((call) => (
                  <tr key={call.id || call.providerCallId} className="align-top hover:bg-neutral-50/70">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-neutral-600">
                      {formatDate(call.createdAt || call.startTime)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-ink">
                      {formatLabel(call.callType)}
                    </td>
                    <td className="font-numeric px-4 py-3 text-neutral-600">
                      {call.customerMobile || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={IVR_STATUS_TONES[call.status] || 'neutral'}>{call.status}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                      {call.duration != null ? `${call.duration}s` : '-'}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-neutral-700">
                      {call.callSummary ? (
                        <p className="line-clamp-2">{call.callSummary}</p>
                      ) : (
                        <span className="text-neutral-400">-</span>
                      )}
                      {call.transcript && (
                        <div className="mt-1">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedTranscriptId(
                                expandedTranscriptId === call.providerCallId ? null : call.providerCallId
                              )
                            }
                            className="font-semibold text-brand-600 hover:underline"
                          >
                            {expandedTranscriptId === call.providerCallId ? 'Hide transcript' : 'View transcript'}
                          </button>
                          {expandedTranscriptId === call.providerCallId && (
                            <div className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-neutral-200 bg-neutral-50 p-2 text-neutral-800">
                              {call.transcript}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {call.recordingLink ? (
                        <a
                          href={call.recordingLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline"
                        >
                          Play audio
                        </a>
                      ) : (
                        <span className="text-neutral-400">-</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={syncingCallId === call.providerCallId}
                        onClick={() => handleSyncCallStatus(call.providerCallId)}
                        className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                        title="Fetch latest status from provider"
                      >
                        {syncingCallId === call.providerCallId ? 'Syncing…' : 'Sync status'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </TableShell>
        </div>
      </Panel>

      {/* WhatsApp Automated Messaging Card */}
      <Panel className="mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-display flex items-center gap-2 text-base font-bold text-ink">
              <MessageCircle size={17} className="text-brand-600" /> WhatsApp automated messaging
              <span className="font-normal text-neutral-400">(Alots.io)</span>
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              Dispatch official WhatsApp template notifications to customer ({customer?.fullName || 'Customer'} — {customer?.mobileNumber || 'No mobile'}) with real-time status tracking.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={whatsappEventType}
              onChange={(e) => setWhatsappEventType(e.target.value)}
              disabled={sendingWhatsapp}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 shadow-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
            >
              <option value="LOAN_APPROVED">Loan Approved (loan_approved)</option>
              <option value="LOAN_DISBURSED">Loan Disbursed (loan_disbursed)</option>
              <option value="APPLICATION_PENDING">Application Incomplete Reminder (application_pending)</option>
              <option value="EMI_DUE">EMI Due Reminder (emi_due_reminder)</option>
              <option value="FULLY_PAID">Loan Fully Paid / Closed (fully_paid)</option>
            </select>

            <Button
              type="button"
              disabled={sendingWhatsapp || !customer?.mobileNumber}
              onClick={handleSendWhatsApp}
              className="!min-h-9 !px-3.5 text-xs"
            >
              <MessageCircle size={13} /> {sendingWhatsapp ? 'Sending…' : 'Send WhatsApp'}
            </Button>

            <Button
              type="button"
              variant="secondary"
              disabled={loadingWhatsapp}
              onClick={loadWhatsappHistory}
              className="!min-h-9 !px-3.5 text-xs"
              title="Refresh WhatsApp Message History"
            >
              <RefreshCw size={13} className={loadingWhatsapp ? 'animate-spin' : ''} /> Refresh
            </Button>
          </div>
        </div>

        {whatsappMessage && (
          <div className="mt-4">
            <Alert tone={whatsappMessage.type}>{whatsappMessage.text}</Alert>
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">
              Message log history ({whatsappLogs.length})
            </p>
            {loadingWhatsapp && (
              <span className="animate-pulse text-xs font-semibold text-brand-600">
                Fetching latest delivery statuses…
              </span>
            )}
          </div>
          <TableShell>
            <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide">Date &amp; time</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide">Template / event</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide">Recipient</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide">Delivery status</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide">Content / parameters</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide">Provider message ID</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide">Trigger source</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide">Error / details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-xs">
              {whatsappLogs.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-4 py-8 text-center text-neutral-400">
                    {loadingWhatsapp ? 'Loading WhatsApp logs…' : 'No WhatsApp messages sent yet for this application.'}
                  </td>
                </tr>
              ) : (
                whatsappLogs.map((log) => {
                  const paramsArray = Array.isArray(log.templateParameters)
                    ? log.templateParameters
                    : typeof log.templateParameters === 'string'
                    ? (() => {
                        try {
                          const parsed = JSON.parse(log.templateParameters);
                          return Array.isArray(parsed) ? parsed : [log.templateParameters];
                        } catch {
                          return [log.templateParameters];
                        }
                      })()
                    : [];

                  return (
                    <tr key={log.id} className="align-top transition-colors hover:bg-neutral-50/70">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-neutral-600">
                        <div>{formatDate(log.createdAt || log.sentAt)}</div>
                        {log.deliveredAt && (
                          <div className="font-medium text-brand-600">
                            Delivered: {formatDate(log.deliveredAt)}
                          </div>
                        )}
                        {log.readAt && (
                          <div className="font-medium text-info-600">
                            Read: {formatDate(log.readAt)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold text-ink">
                        <div>{formatLabel(log.eventType || log.templateName)}</div>
                        <div className="mt-0.5 font-mono text-neutral-500">{log.templateName}</div>
                      </td>
                      <td className="font-numeric px-4 py-3 font-medium text-neutral-700">
                        {log.recipientMobile || log.to || '-'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {log.status === 'READ' ? (
                          <Badge tone="info"><CheckCheck size={11} /> Read</Badge>
                        ) : log.status === 'DELIVERED' ? (
                          <Badge tone="brand"><CheckCheck size={11} /> Delivered</Badge>
                        ) : log.status === 'SENT' || log.status === 'ACCEPTED' ? (
                          <Badge tone="accent"><Check size={11} /> Sent / accepted</Badge>
                        ) : log.status === 'FAILED' || log.status === 'ERROR' ? (
                          <Badge tone="danger"><X size={11} /> Failed</Badge>
                        ) : (
                          <Badge tone="caution"><Clock size={11} /> {log.status || 'PENDING'}</Badge>
                        )}
                      </td>
                      <td className="max-w-[220px] px-4 py-3">
                        {paramsArray.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {paramsArray.map((p, idx) => (
                              <span
                                key={idx}
                                className="inline-block max-w-[190px] truncate rounded-md border border-neutral-200 bg-neutral-100 px-1.5 py-0.5 font-medium text-neutral-700"
                                title={String(p)}
                              >
                                {String(p)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-neutral-400">-</span>
                        )}
                      </td>
                      <td className="max-w-[160px] truncate px-4 py-3 font-mono text-neutral-600" title={log.providerMessageId}>
                        {log.providerMessageId ? (
                          <span className="rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-mono">
                            {log.providerMessageId}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Badge tone="neutral">{formatLabel(log.triggerSource || 'ADMIN')}</Badge>
                      </td>
                      <td className="max-w-xs px-4 py-3 text-neutral-600">
                        {log.errorMessage ? (
                          <span className="block font-medium text-danger-600">{log.errorMessage}</span>
                        ) : log.errorCode ? (
                          <span className="block font-mono text-caution-600">Error: {log.errorCode}</span>
                        ) : (
                          <span className="text-neutral-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </TableShell>
        </div>
      </Panel>

      <Panel
        title="Stages — lender API call history"
        description="Every call made to the partner's API for this application, in order, most recent first."
      >
        <TableShell>
          <thead className="border-b border-neutral-200 bg-neutral-50">
            <tr>
              <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Stage</th>
              <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Version</th>
              <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Status</th>
              <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Attempts</th>
              <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Error</th>
              <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Updated</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {stages.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-5 py-8 text-center text-neutral-500">
                  No lender API calls recorded yet for this application.
                </td>
              </tr>
            ) : (
              stages.map((stage) => (
                <tr key={stage.eventId} className="align-top hover:bg-neutral-50/70">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2 font-semibold text-ink">
                      {formatLabel(stage.integrationStage)}
                      {/* Consent is submitted once per consent type, so the stage name alone
                          would repeat across several otherwise identical rows. */}
                      {stage.consentType && (
                        <Badge tone="neutral">{formatLabel(stage.consentType)}</Badge>
                      )}
                    </div>
                    <div className="text-xs text-neutral-500">{formatLabel(stage.eventType)}</div>
                  </td>
                  <td className="font-numeric px-5 py-3.5">V{stage.payloadVersion}</td>
                  <td className="px-5 py-3.5">
                    <StageStatusBadge value={stage.status} />
                  </td>
                  <td className="font-numeric px-5 py-3.5">{stage.attemptCount}</td>
                  <td className="max-w-xs px-5 py-3.5">
                    {stage.lastErrorMessage ? (
                      <>
                        <div className="text-xs font-bold text-danger-700">{stage.lastErrorCode}</div>
                        <div className="text-xs text-danger-600">{stage.lastErrorMessage}</div>
                      </>
                    ) : (
                      <span className="text-neutral-400">-</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-sm text-neutral-500">{formatDate(stage.updatedAt)}</td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-right">
                    {/* RETRY_PENDING is retryable too — the call already failed and is just
                        sitting on its backoff, which runs up to an hour on the last attempt.
                        PROCESSING is excluded: a worker still holds the lease on it. */}
                    {['FAILED', 'RETRY_PENDING'].includes(stage.status) && canRetry && (
                      <div className="inline-flex flex-col items-end gap-1">
                        {stage.status === 'RETRY_PENDING' && (
                          <span className="text-xs text-neutral-500">
                            {formatRetryCountdown(stage.availableAt)}
                          </span>
                        )}
                        <Button
                          type="button"
                          disabled={retryingEventId === stage.eventId}
                          onClick={() => handleRetry(stage.eventId)}
                          className="!min-h-8 !px-3 text-xs"
                        >
                          {retryingEventId === stage.eventId
                            ? 'Retrying…'
                            : stage.status === 'RETRY_PENDING'
                              ? 'Retry now'
                              : 'Retry'}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
      </Panel>
    </div>
  );
}
