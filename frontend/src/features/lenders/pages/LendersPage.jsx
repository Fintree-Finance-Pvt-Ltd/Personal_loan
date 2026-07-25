import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PermissionGate } from '../../../components/ProtectedRoute';
import {
  Alert,
  Button,
  Card,
  PageHeader,
  Spinner,
} from '../../../components/ui';
import { apiError } from '../../../lib/api';
import {
  getLenders,
  lenderMocksEnabled,
} from '../api/lenders.api';
import { LenderCard } from '../components/LenderCard';

const PAGE_SIZE = 9;

const INITIAL_RESULT = {
  items: [],
  pagination: {
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  },
};

function FilterSelect({
  label,
  value,
  onChange,
  children,
}) {
  return (
    <label className="block min-w-44 text-sm font-medium text-slate-700">
      {label}

      <select
        value={value}
        onChange={onChange}
        className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-slate-800 shadow-sm focus:border-brand-600"
      >
        {children}
      </select>
    </label>
  );
}

function LenderCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex gap-3">
        <div className="h-12 w-12 rounded-xl bg-slate-200" />

        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 rounded bg-slate-200" />
          <div className="h-3 w-full rounded bg-slate-100" />
          <div className="h-3 w-1/3 rounded bg-slate-100" />
        </div>
      </div>

      <div className="mt-5 h-20 rounded-xl bg-slate-100" />
      <div className="mt-4 h-12 rounded-xl bg-slate-100" />
    </div>
  );
}

export function LendersPage() {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [approvalStatus, setApprovalStatus] =
    useState('ALL');
  const [operationalStatus, setOperationalStatus] =
    useState('ALL');
  const [page, setPage] = useState(1);

  const [result, setResult] = useState(INITIAL_RESULT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    document.title =
      'Lender management — Personal Loan Platform';
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [approvalStatus, operationalStatus]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadLenders() {
      setLoading(true);
      setError('');

      try {
        const data = await getLenders(
          {
            search: debouncedSearch,
            approvalStatus,
            operationalStatus,
            page,
            limit: PAGE_SIZE,
          },
          controller.signal,
        );

        setResult({
          items: Array.isArray(data?.items)
            ? data.items
            : [],
          pagination: {
            page: data?.pagination?.page ?? page,
            limit:
              data?.pagination?.limit ?? PAGE_SIZE,
            total: data?.pagination?.total ?? 0,
            totalPages:
              data?.pagination?.totalPages ?? 1,
          },
        });
      } catch (requestError) {
        if (requestError.code === 'ERR_CANCELED') {
          return;
        }

        setError(
          apiError(
            requestError,
            'Unable to load lenders. Please try again.',
          ),
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadLenders();

    return () => {
      controller.abort();
    };
  }, [
    debouncedSearch,
    approvalStatus,
    operationalStatus,
    page,
    reloadKey,
  ]);

  const clearFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setApprovalStatus('ALL');
    setOperationalStatus('ALL');
    setPage(1);
  };

  const hasFilters =
    searchInput ||
    approvalStatus !== 'ALL' ||
    operationalStatus !== 'ALL';

  return (
    <>
      <PageHeader
        title="Lender management"
        description="Onboard, approve, activate and manage lending partners."
        actions={
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setReloadKey((current) => current + 1)}
              disabled={loading}
            >
              Refresh
            </Button>

            <PermissionGate permission="LENDER_CREATE">
              <Link
                to="/admin-master/lenders/new"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 font-semibold text-white transition hover:bg-brand-700"
              >
                Add lender
              </Link>
            </PermissionGate>
          </div>
        }
      />

      {lenderMocksEnabled && (
        <div className="mb-5">
          <Alert tone="info">
            Development preview data is enabled. The
            page will use the backend API after lender
            mocks are disabled.
          </Alert>
        </div>
      )}

      {error && (
        <div className="mb-5">
          <Alert>{error}</Alert>
        </div>
      )}

      <Card className="mb-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
          <label className="block flex-1 text-sm font-medium text-slate-700">
            Search lenders

            <input
              type="search"
              value={searchInput}
              onChange={(event) =>
                setSearchInput(event.target.value)
              }
              placeholder="Search by lender name, code or email"
              className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-600"
            />
          </label>

          <FilterSelect
            label="Approval status"
            value={approvalStatus}
            onChange={(event) =>
              setApprovalStatus(event.target.value)
            }
          >
            <option value="ALL">All approvals</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </FilterSelect>

          <FilterSelect
            label="Operational status"
            value={operationalStatus}
            onChange={(event) =>
              setOperationalStatus(event.target.value)
            }
          >
            <option value="ALL">
              All operational statuses
            </option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </FilterSelect>

          {hasFilters && (
            <Button
              type="button"
              variant="secondary"
              onClick={clearFilters}
            >
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {loading
            ? 'Loading lender records...'
            : `${result.pagination.total} lender${
                result.pagination.total === 1
                  ? ''
                  : 's'
              } found`}
        </p>

        {!loading && result.pagination.total > 0 && (
          <p className="text-sm text-slate-500">
            Page {result.pagination.page} of{' '}
            {result.pagination.totalPages}
          </p>
        )}
      </div>

      {loading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <LenderCardSkeleton key={index} />
          ))}
        </div>
      ) : result.items.length === 0 ? (
        <Card className="py-12 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-xl font-bold text-slate-500">
            LN
          </div>

          <h2 className="mt-4 text-lg font-bold text-ink">
            No lenders found
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            No lender matches the selected search and
            status filters.
          </p>

          {hasFilters && (
            <Button
              type="button"
              variant="secondary"
              className="mt-5"
              onClick={clearFilters}
            >
              Clear filters
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {result.items.map((lender) => (
            <LenderCard
              key={lender.id}
              lender={lender}
            />
          ))}
        </div>
      )}

      {!loading && result.pagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={result.pagination.page <= 1}
            onClick={() =>
              setPage((current) =>
                Math.max(1, current - 1),
              )
            }
          >
            Previous
          </Button>

          <span className="text-sm font-medium text-slate-600">
            {result.pagination.page} /{' '}
            {result.pagination.totalPages}
          </span>

          <Button
            type="button"
            variant="secondary"
            disabled={
              result.pagination.page >=
              result.pagination.totalPages
            }
            onClick={() =>
              setPage((current) => current + 1)
            }
          >
            Next
          </Button>
        </div>
      )}
    </>
  );
}