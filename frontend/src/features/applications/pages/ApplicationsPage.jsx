import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { applicationsApi } from '../api/applications.api';
import { apiError } from '../../../lib/api';
import { Alert, Card, Input, PageHeader, Select, Spinner } from '../../../components/ui';
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
    <div className="p-6">
      <PageHeader
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
        <button
          type="submit"
          className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-brand-700"
        >
          Search
        </button>
      </form>

      <Card className="!p-0 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Application</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lender</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan="6" className="px-6 py-8 text-center">
                  <Spinner />
                </td>
              </tr>
            ) : applications.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                  No applications found.
                </td>
              </tr>
            ) : (
              applications.map((application) => (
                <tr key={application.applicationId} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link
                      to={`/admin-master/applications/${application.applicationId}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {application.applicationNumber}
                    </Link>
                    {application.platformLan && (
                      <div className="text-xs text-gray-500">{application.platformLan}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div>{application.customerName}</div>
                    <div className="text-xs text-gray-500">{application.customerMobile}</div>
                  </td>
                  <td className="px-6 py-4">
                    <StageStatusBadge value={application.status} />
                  </td>
                  <td className="px-6 py-4">{application.lenderCode || '-'}</td>
                  <td className="px-6 py-4">
                    {formatCurrency(
                      application.approvedAmount ?? application.selectedAmount ?? application.requestedAmount,
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(application.updatedAt).toLocaleString('en-IN')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>
            Page {page} of {totalPages} ({total} total)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
