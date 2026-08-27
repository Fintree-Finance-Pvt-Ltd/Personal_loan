import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { applicationsApi } from '../api/applications.api';
import { apiError } from '../../../lib/api';
import { resolveFileUrl } from '../../../lib/files';
import { useAuth } from '../../../auth/AuthContext';
import { Alert, Card, PageHeader, Spinner } from '../../../components/ui';
import { StageStatusBadge } from '../components/StageStatusBadge';
import { LoanChargesCard } from '../components/LoanChargesCard';

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

export default function ApplicationDetailsPage() {
  const { applicationId } = useParams();
  const auth = useAuth();
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryingEventId, setRetryingEventId] = useState(null);
  const [sendingWelcomeLetter, setSendingWelcomeLetter] = useState(false);
  const [welcomeLetterMessage, setWelcomeLetterMessage] = useState(null);

  // IVR AI Calling State
  const [ivrCalls, setIvrCalls] = useState([]);
  const [loadingIvr, setLoadingIvr] = useState(false);
  const [callingCustomer, setCallingCustomer] = useState(false);
  const [callType, setCallType] = useState('APPLICATION_FOLLOW_UP');
  const [callMessage, setCallMessage] = useState(null);
  const [syncingCallId, setSyncingCallId] = useState(null);
  const [expandedTranscriptId, setExpandedTranscriptId] = useState(null);

  const loadIvrHistory = () => {
    if (!applicationId) return;
    setLoadingIvr(true);
    applicationsApi
      .getIvrCallHistory(applicationId)
      .then((data) => setIvrCalls(Array.isArray(data) ? data : []))
      .catch((err) => console.error('Failed to load IVR history:', err))
      .finally(() => setLoadingIvr(false));
  };

  const load = () => {
    setLoading(true);
    setError('');
    applicationsApi
      .getDetails(applicationId)
      .then(setDetails)
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
      <div className="p-6">
        <Spinner />
      </div>
    );
  }

  if (error && !details) {
    return (
      <div className="p-6">
        <Alert>{error}</Alert>
      </div>
    );
  }

  if (!details) return null;

  const { application, customer, link, loan, stages, documents } = details;
  const canRetry = auth.hasPermission('LENDER_UPDATE');

  return (
    <div className="p-6">
      <Link to="/admin-master/applications" className="mb-4 inline-block text-sm text-brand-700 hover:underline">
        &larr; Back to Applications
      </Link>

      <PageHeader
        title={application.applicationNumber}
        description={`Customer ${customer.fullName} (${customer.customerCode}) — ${customer.mobileNumber}`}
        actions={<StageStatusBadge value={application.status} />}
      />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <div className="text-xs font-semibold uppercase text-gray-500">Customer</div>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">Name</dt><dd>{customer.fullName || '-'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Code</dt><dd>{customer.customerCode || '-'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Mobile</dt><dd>{customer.mobileNumber || '-'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Email</dt><dd className="truncate">{customer.email || '-'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">PAN</dt><dd>{customer.panNumber || '-'}</dd></div>
          </dl>
        </Card>

        <Card>
          <div className="text-xs font-semibold uppercase text-gray-500">Application</div>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">LAN</dt><dd>{application.platformLan || '-'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Lender</dt><dd>{application.lenderCode || '-'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Requested</dt><dd>{formatCurrency(application.requestedAmount)}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Selected</dt><dd>{formatCurrency(application.selectedAmount)} / {application.selectedTenure ?? '-'}d</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Approved</dt><dd>{formatCurrency(application.approvedAmount)}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Submitted</dt><dd>{formatDate(application.submittedAt)}</dd></div>
          </dl>
        </Card>

        <Card>
          <div className="text-xs font-semibold uppercase text-gray-500">Lender Decision</div>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">Normalized</dt><dd>{link ? <StageStatusBadge value={link.normalizedDecision} /> : '-'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Lender approved</dt><dd>{formatCurrency(application.lenderApprovedAmount)}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Lender tenure</dt><dd>{application.lenderApprovedTenure ?? '-'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Lender ROI</dt><dd>{application.lenderApprovedRoi ?? '-'}%</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Decision at</dt><dd>{formatDate(application.lenderDecisionAt)}</dd></div>
            {application.lenderDecisionReason && (
              <div className="text-xs text-gray-500">{application.lenderDecisionReason}</div>
            )}
          </dl>
        </Card>

        <Card>
          <div className="text-xs font-semibold uppercase text-gray-500">Loan</div>
          {loan ? (
            <>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-gray-500">LAN</dt><dd>{loan.lan}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Status</dt><dd><StageStatusBadge value={loan.status} /></dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Disbursal</dt><dd><StageStatusBadge value={loan.disbursalStatus} /></dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Approved amount</dt><dd>{formatCurrency(loan.approvedAmount)}</dd></div>
              </dl>
              {(loan.status === 'DISBURSED' || loan.status === 'FULLY_PAID') && auth.hasPermission('LOAN_MANAGE') && (
                <div className="mt-4 border-t pt-4">
                  <button
                    type="button"
                    disabled={sendingWelcomeLetter}
                    onClick={() => handleSendWelcomeLetter(loan.lan)}
                    className="w-full rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {sendingWelcomeLetter ? 'Sending…' : 'Send Welcome Letter'}
                  </button>
                  {welcomeLetterMessage && (
                    <p className={`mt-2 text-xs ${welcomeLetterMessage.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                      {welcomeLetterMessage.text}
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-gray-500">No loan created yet.</p>
          )}
        </Card>
      </div>

      {link && (
        <Card className="mb-6">
          <div className="text-xs font-semibold uppercase text-gray-500">Current Stage Status</div>
          <div className="mt-3 flex flex-wrap gap-6 text-sm">
            <div>
              <div className="text-gray-500">Create</div>
              <StageStatusBadge value={link.createStatus} />
            </div>
            <div>
              <div className="text-gray-500">Consent</div>
              <StageStatusBadge value={link.consentStatus} />
            </div>
            <div>
              <div className="text-gray-500">Update</div>
              <StageStatusBadge value={link.updateStatus} />
            </div>
            <div>
              <div className="text-gray-500">Decision</div>
              <StageStatusBadge value={link.decisionStatus} />
            </div>
          </div>
          {link.lastErrorMessage && (
            <div className="mt-4 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
              <span className="font-semibold">{link.lastErrorCode}:</span> {link.lastErrorMessage}
            </div>
          )}
          {link.partnerApplicationId && (
            <p className="mt-3 text-xs text-gray-500">Partner application ID: {link.partnerApplicationId}</p>
          )}
        </Card>
      )}

      {loan && (
        <LoanChargesCard
          lan={loan.lan}
          charges={loan.charges || []}
          canManage={auth.hasPermission('LOAN_CHARGE_MANAGE')}
          onChanged={load}
        />
      )}

      <Card className="mb-6 !p-0 overflow-hidden">
        <div className="border-b bg-gray-50 px-6 py-4">
          <div className="font-bold text-gray-700">Documents</div>
          <p className="mt-1 text-sm text-gray-500">All documents uploaded by the customer for this application.</p>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Applicant</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uploaded</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {!documents || documents.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                  No documents uploaded yet for this application.
                </td>
              </tr>
            ) : (
              documents.map((document) => (
                <tr key={document.documentId} className="align-top hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium">{formatLabel(document.documentType)}</div>
                    <div className="text-xs text-gray-500">{document.fileName}</div>
                  </td>
                  <td className="px-6 py-4">{formatLabel(document.applicantType)}</td>
                  <td className="px-6 py-4"><StageStatusBadge value={document.status} /></td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatLabel(document.source)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">{formatDate(document.uploadedAt)}</td>
                  <td className="px-6 py-4 text-right whitespace-nowrap">
                    {document.fileUrl && (
                      <a
                        href={resolveFileUrl(document.fileUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                      >
                        View
                      </a>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {/* AI IVR Outbound Calling Card */}
      <Card className="mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
          <div>
            <div className="text-base font-bold text-gray-900 flex items-center gap-2">
              <span>📞</span> AI Outbound Calling (IVR)
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Initiate automated AI voice calls to the customer ({customer.fullName || 'Customer'} — {customer.mobileNumber || 'No mobile'}) with real-time context.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={callType}
              onChange={(e) => setCallType(e.target.value)}
              disabled={callingCustomer}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-xs focus:border-brand-500 focus:outline-hidden"
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

            <button
              type="button"
              disabled={callingCustomer || !customer?.mobileNumber}
              onClick={handleInitiateCall}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {callingCustomer ? 'Initiating Call…' : '📞 Call Customer'}
            </button>

            <button
              type="button"
              disabled={loadingIvr}
              onClick={loadIvrHistory}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              title="Refresh IVR Call History"
            >
              🔄 Refresh History
            </button>
          </div>
        </div>

        {callMessage && (
          <div className="mt-4">
            <Alert variant={callMessage.type === 'success' ? 'success' : 'error'}>
              {callMessage.text}
            </Alert>
          </div>
        )}

        {/* IVR History Table */}
        <div className="mt-4 overflow-x-auto">
          <div className="text-xs font-semibold uppercase text-gray-500 mb-2">IVR Call Log History</div>
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-500 border-b">
              <tr>
                <th className="px-4 py-2.5">Date & Time</th>
                <th className="px-4 py-2.5">Purpose / Type</th>
                <th className="px-4 py-2.5">Mobile</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Duration</th>
                <th className="px-4 py-2.5">Call Summary & Notes</th>
                <th className="px-4 py-2.5">Recording</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ivrCalls.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-4 py-6 text-center text-gray-400">
                    {loadingIvr ? 'Loading call history…' : 'No IVR calls recorded yet for this application.'}
                  </td>
                </tr>
              ) : (
                ivrCalls.map((call) => (
                  <tr key={call.id || call.providerCallId} className="hover:bg-gray-50/80 align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600 font-medium">
                      {formatDate(call.createdAt || call.startTime)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-800">
                      {formatLabel(call.callType)}
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-mono">
                      {call.customerMobile || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          call.status === 'COMPLETED'
                            ? 'bg-green-100 text-green-800'
                            : call.status === 'FAILED' || call.status === 'ERROR'
                            ? 'bg-red-100 text-red-800'
                            : call.status === 'IN_PROGRESS' || call.status === 'INITIATED'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {call.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {call.duration != null ? `${call.duration}s` : '-'}
                    </td>
                    <td className="px-4 py-3 max-w-xs text-gray-700">
                      {call.callSummary ? (
                        <p className="line-clamp-2 text-[11px]">{call.callSummary}</p>
                      ) : (
                        <span className="text-gray-400">-</span>
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
                            className="text-[10px] text-brand-600 hover:underline font-semibold"
                          >
                            {expandedTranscriptId === call.providerCallId ? 'Hide Transcript' : 'View Transcript'}
                          </button>
                          {expandedTranscriptId === call.providerCallId && (
                            <div className="mt-2 p-2 bg-gray-50 border rounded-sm text-[10px] whitespace-pre-wrap text-gray-800 max-h-40 overflow-y-auto">
                              {call.transcript}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {call.recordingLink ? (
                        <a
                          href={call.recordingLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:underline"
                        >
                          ▶ Play Audio
                        </a>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        disabled={syncingCallId === call.providerCallId}
                        onClick={() => handleSyncCallStatus(call.providerCallId)}
                        className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        title="Fetch latest status from provider"
                      >
                        {syncingCallId === call.providerCallId ? 'Syncing…' : 'Sync Status'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="!p-0 overflow-hidden">
        <div className="border-b bg-gray-50 px-6 py-4">
          <div className="font-bold text-gray-700">Stages — Lender API Call History</div>
          <p className="mt-1 text-sm text-gray-500">
            Every call made to the partner's API for this application, in order, most recent first.
          </p>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stage</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Version</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Attempts</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Error</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Updated</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {stages.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                  No lender API calls recorded yet for this application.
                </td>
              </tr>
            ) : (
              stages.map((stage) => (
                <tr key={stage.eventId} className="hover:bg-gray-50 align-top">
                  <td className="px-6 py-4">
                    <div className="font-medium">{formatLabel(stage.integrationStage)}</div>
                    <div className="text-xs text-gray-500">{formatLabel(stage.eventType)}</div>
                  </td>
                  <td className="px-6 py-4">V{stage.payloadVersion}</td>
                  <td className="px-6 py-4">
                    <StageStatusBadge value={stage.status} />
                  </td>
                  <td className="px-6 py-4">{stage.attemptCount}</td>
                  <td className="px-6 py-4 max-w-xs">
                    {stage.lastErrorMessage ? (
                      <>
                        <div className="text-xs font-semibold text-red-700">{stage.lastErrorCode}</div>
                        <div className="text-xs text-red-600">{stage.lastErrorMessage}</div>
                      </>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">{formatDate(stage.updatedAt)}</td>
                  <td className="px-6 py-4 text-right whitespace-nowrap">
                    {stage.status === 'FAILED' && canRetry && (
                      <button
                        type="button"
                        disabled={retryingEventId === stage.eventId}
                        onClick={() => handleRetry(stage.eventId)}
                        className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                      >
                        {retryingEventId === stage.eventId ? 'Retrying…' : 'Retry'}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

