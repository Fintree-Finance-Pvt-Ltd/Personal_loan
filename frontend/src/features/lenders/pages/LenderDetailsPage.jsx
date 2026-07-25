import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext';
import { ConfirmationDialog } from '../../../components/ConfirmationDialog';
import { Alert, Button, Card, PageHeader, Spinner } from '../../../components/ui';
import { apiError } from '../../../lib/api';
import {
  activateLender,
  approveLender,
  deactivateLender,
  getLender,
  rejectLender,
  submitLender,
} from '../api/lenders.api';
import { RejectLenderDialog } from '../components/RejectLenderDialog';
import { LenderStatusBadge } from '../components/LenderStatusBadge';

function formatDate(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function DetailItem({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-medium text-slate-800">
        {value || 'Not configured'}
      </dd>
    </div>
  );
}

export function LenderDetailsPage() {
  const { lenderId } = useParams();
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [lender, setLender] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(location.state?.message || '');
  const [busyAction, setBusyAction] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectError, setRejectError] = useState('');

  const loadLender = useCallback(async (signal) => {
    setLoading(true);
    setError('');
    try {
      setLender(await getLender(lenderId, signal));
    } catch (requestError) {
      if (requestError.code !== 'ERR_CANCELED') {
        setError(apiError(requestError, 'Unable to load lender.'));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [lenderId]);

  useEffect(() => {
    document.title = 'Lender details — Personal Loan Platform';
    const controller = new AbortController();
    loadLender(controller.signal);
    return () => controller.abort();
  }, [loadLender]);

  useEffect(() => {
    if (location.state?.message) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  const isMaker = useMemo(() => {
    if (!lender) return false;
    const makerId = lender.submittedById || lender.createdById;
    return makerId === auth.user?.id;
  }, [auth.user?.id, lender]);

  const runAction = async (action, successMessage) => {
    setBusyAction(action);
    setError('');
    setSuccess('');

    try {
      const actionMap = {
        submit: submitLender,
        approve: approveLender,
        activate: activateLender,
        deactivate: deactivateLender,
      };

      const updated = await actionMap[action](lenderId);
      setLender(updated);
      setSuccess(successMessage);
      setConfirmAction(null);
    } catch (requestError) {
      setError(apiError(requestError, 'The lender action could not be completed.'));
      setConfirmAction(null);
    } finally {
      setBusyAction('');
    }
  };

  const handleReject = async (reason) => {
    setBusyAction('reject');
    setRejectError('');
    setError('');
    setSuccess('');

    try {
      const updated = await rejectLender(lenderId, reason);
      setLender(updated);
      setRejectOpen(false);
      setSuccess('Lender rejected. The maker can correct and resubmit it.');
    } catch (requestError) {
      setRejectError(apiError(requestError, 'Unable to reject lender.'));
    } finally {
      setBusyAction('');
    }
  };

  if (loading) {
    return (
      <Card className="grid min-h-72 place-items-center text-brand-700">
        <Spinner label="Loading lender" />
      </Card>
    );
  }

  if (!lender) {
    return (
      <>
        <PageHeader title="Lender details" description="The lender could not be loaded." />
        <Alert>{error || 'Lender not found.'}</Alert>
      </>
    );
  }

  const editable = ['DRAFT', 'REJECTED'].includes(lender.approvalStatus);

  return (
    <>
      <PageHeader
        title={lender.displayName}
        description={`${lender.legalName} · ${lender.code}`}
        actions={
          <div className="flex flex-wrap gap-3">
            <Link
              to="/admin-master/lenders"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              Back to lenders
            </Link>

            {editable && auth.hasPermission('LENDER_UPDATE') && (
              <Link
                to={`/admin-master/lenders/${lender.id}/edit`}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-800 transition hover:bg-slate-50"
              >
                Edit lender
              </Link>
            )}
          </div>
        }
      />

      {success && (
        <div className="mb-5">
          <Alert tone="info">{success}</Alert>
        </div>
      )}

      {error && (
        <div className="mb-5">
          <Alert>{error}</Alert>
        </div>
      )}

      {lender.approvalStatus === 'SUBMITTED' && isMaker &&
        (auth.hasPermission('LENDER_APPROVE') || auth.hasPermission('LENDER_REJECT')) && (
          <div className="mb-5">
            <Alert tone="info">
              Maker-checker control is active. You submitted this lender, so a
              different checker must approve or reject it.
            </Alert>
          </div>
        )}

      {lender.approvalStatus === 'REJECTED' && lender.rejectionReason && (
        <div className="mb-5">
          <Alert>
            <strong>Rejected:</strong> {lender.rejectionReason}
          </Alert>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-ink">Lender profile</h2>
              <p className="mt-1 text-sm text-slate-500">
                Core identity and support details.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <LenderStatusBadge value={lender.approvalStatus} />
              <LenderStatusBadge value={lender.operationalStatus} />
              <LenderStatusBadge value={lender.integrationHealth} />
            </div>
          </div>

          <dl className="mt-5 grid gap-5 sm:grid-cols-2">
            <DetailItem label="Legal name" value={lender.legalName} />
            <DetailItem label="Display name" value={lender.displayName} />
            <DetailItem label="Lender code" value={lender.code} />
            <DetailItem label="Version" value={String(lender.version)} />
            <DetailItem label="Support email" value={lender.supportEmail} />
            <DetailItem label="Support phone" value={lender.supportPhone} />
          </dl>
        </Card>

        <Card>
          <h2 className="text-lg font-bold text-ink">Available actions</h2>
          <p className="mt-1 text-sm text-slate-500">
            Actions are shown according to status and your permissions.
          </p>

          <div className="mt-5 flex flex-col gap-3">
            {lender.approvalStatus === 'DRAFT' && auth.hasPermission('LENDER_SUBMIT') && (
              <Button
                type="button"
                onClick={() => setConfirmAction('submit')}
                disabled={Boolean(busyAction)}
              >
                Submit for approval
              </Button>
            )}

            {lender.approvalStatus === 'SUBMITTED' &&
              !isMaker &&
              auth.hasPermission('LENDER_APPROVE') && (
                <Button
                  type="button"
                  onClick={() => setConfirmAction('approve')}
                  disabled={Boolean(busyAction)}
                >
                  Approve lender
                </Button>
              )}

            {lender.approvalStatus === 'SUBMITTED' &&
              !isMaker &&
              auth.hasPermission('LENDER_REJECT') && (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => setRejectOpen(true)}
                  disabled={Boolean(busyAction)}
                >
                  Reject lender
                </Button>
              )}

            {lender.approvalStatus === 'APPROVED' &&
              lender.operationalStatus === 'INACTIVE' &&
              auth.hasPermission('LENDER_ACTIVATE') && (
                <Button
                  type="button"
                  onClick={() => setConfirmAction('activate')}
                  disabled={Boolean(busyAction)}
                >
                  Activate lender
                </Button>
              )}

            {lender.operationalStatus === 'ACTIVE' &&
              auth.hasPermission('LENDER_DEACTIVATE') && (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => setConfirmAction('deactivate')}
                  disabled={Boolean(busyAction)}
                >
                  Deactivate lender
                </Button>
              )}

            {!editable &&
              lender.approvalStatus !== 'SUBMITTED' &&
              lender.operationalStatus !== 'ACTIVE' &&
              !(
                lender.approvalStatus === 'APPROVED' &&
                auth.hasPermission('LENDER_ACTIVATE')
              ) && (
                <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                  No action is currently available for your role.
                </p>
              )}
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <h2 className="text-lg font-bold text-ink">Approval timeline</h2>
        <dl className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <DetailItem label="Created" value={formatDate(lender.createdAt)} />
          <DetailItem label="Submitted" value={formatDate(lender.submittedAt)} />
          <DetailItem label="Approved" value={formatDate(lender.approvedAt)} />
          <DetailItem label="Rejected" value={formatDate(lender.rejectedAt)} />
          <DetailItem label="Created by ID" value={lender.createdById} />
          <DetailItem label="Submitted by ID" value={lender.submittedById} />
          <DetailItem label="Approved by ID" value={lender.approvedById} />
          <DetailItem label="Last updated" value={formatDate(lender.updatedAt)} />
        </dl>
      </Card>

      <ConfirmationDialog
        open={confirmAction === 'submit'}
        title="Submit lender for approval?"
        description="After submission, the lender cannot be edited until a checker rejects it."
        confirmLabel="Submit for approval"
        confirmVariant="primary"
        busy={busyAction === 'submit'}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => runAction('submit', 'Lender submitted for checker approval.')}
      />

      <ConfirmationDialog
        open={confirmAction === 'approve'}
        title="Approve lender?"
        description="Approval confirms that the lender master information has passed checker review."
        confirmLabel="Approve lender"
        confirmVariant="primary"
        busy={busyAction === 'approve'}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => runAction('approve', 'Lender approved successfully.')}
      />

      <ConfirmationDialog
        open={confirmAction === 'activate'}
        title="Activate lender?"
        description="The lender becomes operationally active. Product and routing prerequisites will be added in the next modules."
        confirmLabel="Activate lender"
        confirmVariant="primary"
        busy={busyAction === 'activate'}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => runAction('activate', 'Lender activated successfully.')}
      />

      <ConfirmationDialog
        open={confirmAction === 'deactivate'}
        title="Deactivate lender?"
        description="The lender remains in history but should not be used for new routing."
        confirmLabel="Deactivate lender"
        confirmVariant="danger"
        busy={busyAction === 'deactivate'}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => runAction('deactivate', 'Lender deactivated successfully.')}
      />

      <RejectLenderDialog
        open={rejectOpen}
        lenderName={lender.displayName}
        busy={busyAction === 'reject'}
        error={rejectError}
        onCancel={() => {
          setRejectOpen(false);
          setRejectError('');
        }}
        onConfirm={handleReject}
      />
    </>
  );
}
