import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { applicationsApi } from '../api/applications.api';
import { apiError } from '../../../lib/api';
import { Alert, Button, Input, PageHeader, Select, Spinner, TableShell } from '../../../components/ui';
import { StageStatusBadge } from '../components/StageStatusBadge';

// PlApplicationStatus — where LENDER_APPROVED is as far as the application record
// itself ever goes before a loan exists (or the loan is fully repaid).
const APPLICATION_STATUS_OPTIONS = [
  'DRAFT',
  'SUBMITTED',
  'PLATFORM_REJECTED',
  'ALLOCATION_PENDING',
  'LENDER_ALLOCATED',
  'LENDER_REVIEW',
  'ASSESSMENT_FEE_PAID',
  'LENDER_PRE_APPROVED',
  'PENDING_CREDIT_REVIEW',
  'LENDER_APPROVED',
  'LENDER_REJECTED',
  'LOAN_CLOSED',
];

// PlLoanStatus, once a loan exists — everything past LENDER_APPROVED (mandate,
// e-sign, disbursal, repayment) only ever lives here, never on the application
// itself. LENDER_APPROVED is intentionally omitted here since it's already covered
// above and the backend filter matches it against either source.
const LOAN_STATUS_OPTIONS = [
  'OFFER_ACCEPTED',
  'KYC_IN_PROGRESS',
  'ADDRESS_CONFIRMED',
  'BANK_VERIFIED',
  'KFS_ACCEPTED',
  'MANDATE_COMPLETED',
  'ESIGN_COMPLETED',
  'READY_FOR_DISBURSAL',
  'DISBURSAL_PROCESSING',
  'DISBURSED',
  'FULLY_PAID',
  'FAILED',
  'CANCELLED',
];

function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '-';
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

export default function ApplicationsPage() {
  const [applications, setApplications] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const pageSize = 20;

  const load = () => {
    setLoading(true);
    setError('');
    applicationsApi
      .list({ search: search || undefined, status: status || undefined, page, pageSize })
      .then((res) => {
        setApplications(res.applications);
        setTotal(res.total);
      })
      .catch((err) => setError(apiError(err, 'Unable to load applications.')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Applications"
        description="Every loan application on the platform — click through to see lender integration stages and retry failed calls."
      />

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <form onSubmit={handleSearchSubmit} className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <Input
            label="Search"
            placeholder="Application number, LAN, customer name, mobile, code"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="min-w-[200px]">
          <Select
            label="Status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <optgroup label="Application stage">
              {APPLICATION_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </optgroup>
            <optgroup label="Loan stage (post-approval)">
              {LOAN_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </optgroup>
          </Select>
        </div>
        <Button type="submit">
          <Search size={15} /> Search
        </Button>
      </form>

      <TableShell>
        <thead className="border-b border-neutral-200 bg-neutral-50">
          <tr>
            <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Application</th>
            <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Customer</th>
            <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Status</th>
            <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Lender</th>
            <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Amount</th>
            <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-neutral-500">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {loading ? (
            <tr>
              <td colSpan="6" className="px-5 py-10 text-center">
                <Spinner />
              </td>
            </tr>
          ) : applications.length === 0 ? (
            <tr>
              <td colSpan="6" className="px-5 py-10 text-center text-neutral-500">
                No applications found.
              </td>
            </tr>
          ) : (
            applications.map((application) => (
              <tr key={application.applicationId} className="hover:bg-neutral-50/70">
                <td className="px-5 py-3.5">
                  <Link
                    to={`/admin-master/applications/${application.applicationId}`}
                    className="font-semibold text-brand-700 hover:underline"
                  >
                    {application.applicationNumber}
                  </Link>
                  {application.platformLan && (
                    <div className="text-xs text-neutral-500">{application.platformLan}</div>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <div className="font-medium text-ink">{application.customerName}</div>
                  <div className="font-numeric text-xs text-neutral-500">{application.customerMobile}</div>
                </td>
                <td className="px-5 py-3.5">
                  <StageStatusBadge value={application.status} />
                </td>
                <td className="px-5 py-3.5">{application.lenderCode || '-'}</td>
                <td className="font-numeric px-5 py-3.5 font-semibold text-ink">
                  {formatCurrency(
                    application.approvedAmount ?? application.selectedAmount ?? application.requestedAmount,
                  )}
                </td>
                <td className="px-5 py-3.5 text-sm text-neutral-500">
                  {new Date(application.updatedAt).toLocaleString('en-IN')}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableShell>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-neutral-600">
          <span>
            Page {page} of {totalPages} ({total} total)
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="!min-h-9 !px-3 text-sm"
            >
              <ChevronLeft size={15} /> Previous
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="!min-h-9 !px-3 text-sm"
            >
              Next <ChevronRight size={15} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
