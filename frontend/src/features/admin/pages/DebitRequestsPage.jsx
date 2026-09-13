import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CircleAlert,
  Clock,
  Database,
  RefreshCw,
  X,
  Zap,
} from 'lucide-react';
import { api } from '../../../lib/api';
import { Badge, Button, StatCard } from '../../../components/ui';

export function DebitRequestsPage() {
  const [source, setSource] = useState('live'); // 'live' | 'db'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({
    hasNext: false,
    showing: { total_records: 0, current_page: 1, records_per_page: 15 },
  });

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [mandateTypeFilter, setMandateTypeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Selected item for drawer/modal details
  const [selectedItem, setSelectedItem] = useState(null);
  const [retryingId, setRetryingId] = useState(null);
  const [retryMessage, setRetryMessage] = useState(null);

  const fetchDebitRequests = async (page = currentPage) => {
    setLoading(true);
    setError('');
    setRetryMessage(null);
    try {
      const params = {
        source,
        pageSize,
        current: page,
      };

      if (statusFilter) params.status = statusFilter;
      if (mandateTypeFilter) params.mandate_type = mandateTypeFilter;
      if (startDate) params.created_at_start = startDate;
      if (endDate) params.created_at_end = endDate;

      const trimmedQuery = searchQuery.trim();
      if (trimmedQuery) {
        if (trimmedQuery.startsWith('MR') || trimmedQuery.startsWith('PLM') || trimmedQuery.length > 20) {
          params.merchant_request_number = trimmedQuery;
        } else {
          params.merchant_request_number = trimmedQuery;
        }
      }

      const res = await api.get('/admin/loans/debit-requests', { params });
      if (res.data?.success) {
        const results = res.data.results || res.data.data?.results || [];
        setItems(results);
        setPagination(res.data.pagination || { hasNext: false, showing: {} });
      } else {
        setItems([]);
        setError(res.data?.error || 'Failed to fetch debit requests.');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || err.message || 'Error fetching debit requests');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDebitRequests(1);
    setCurrentPage(1);
  }, [source, statusFilter, mandateTypeFilter, pageSize, startDate, endDate]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchDebitRequests(1);
    setCurrentPage(1);
  };

  const handlePageChange = (newPage) => {
    if (newPage < 1) return;
    setCurrentPage(newPage);
    fetchDebitRequests(newPage);
  };

  const handleManualRetry = async (item) => {
    const rpsId = item.udf2 || item.rps_id;
    if (!rpsId) {
      alert('Repayment Schedule ID not found for this debit request.');
      return;
    }
    setRetryingId(item.id || item.merchant_request_number);
    setRetryMessage(null);
    try {
      const res = await api.post(`/admin/loans/repayment-schedule/${rpsId}/retry-debit`);
      if (res.data?.success) {
        setRetryMessage({ tone: 'success', text: `Debit retry initiated successfully! Status: ${res.data.status}` });
        fetchDebitRequests(currentPage);
      } else {
        setRetryMessage({ tone: 'danger', text: res.data?.message || 'Debit retry rejected.' });
      }
    } catch (err) {
      setRetryMessage({
        tone: 'danger',
        text: err.response?.data?.message || err.response?.data?.error || err.message || 'Retry debit request failed.',
      });
    } finally {
      setRetryingId(null);
    }
  };

  // Metrics summary
  const metrics = useMemo(() => {
    let successCount = 0;
    let failureCount = 0;
    let pendingCount = 0;
    let totalAmt = 0;

    items.forEach((it) => {
      const st = String(it.status || it.status_at_bank || '').toLowerCase();
      const amt = Number(it.amount || 0);
      if (st === 'success' || st === 'notified' || st === 'paid' || st === 'authorized') {
        successCount++;
        totalAmt += amt;
      } else if (st === 'failure' || st === 'rejected' || st === 'cancelled' || st === 'error') {
        failureCount++;
      } else {
        pendingCount++;
      }
    });

    return {
      total: pagination?.showing?.total_records || items.length,
      successCount,
      failureCount,
      pendingCount,
      totalAmt,
    };
  }, [items, pagination]);

  const getStatusTone = (status) => {
    const st = String(status || '').toLowerCase();
    if (['success', 'notified', 'paid', 'authorized'].includes(st)) return 'brand';
    if (['failure', 'failed', 'rejected', 'cancelled', 'error'].includes(st)) return 'danger';
    return 'caution';
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-extrabold text-ink">Debit Request List</h1>
            <Badge tone="brand">
              {source === 'live' ? <Zap size={11} /> : <Database size={11} />}
              {source === 'live' ? 'Easebuzz live API' : 'Local database'}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            Track and reconcile recurring mandate presentment and auto-debit collections (eNACH / UPI 2.0 / SI)
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Source Toggle */}
          <div className="inline-flex rounded-xl border border-neutral-200 bg-neutral-100 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setSource('live')}
              className={`rounded-lg px-3 py-1.5 transition ${source === 'live' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
            >
              Easebuzz Gateway
            </button>
            <button
              type="button"
              onClick={() => setSource('db')}
              className={`rounded-lg px-3 py-1.5 transition ${source === 'db' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'}`}
            >
              System DB
            </button>
          </div>

          <Button
            variant="secondary"
            onClick={() => fetchDebitRequests(currentPage)}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Banknote} label="Total requests" value={metrics.total} helper="Presentment attempts" tone="neutral" />
        <StatCard
          icon={Banknote}
          label="Successful collections"
          value={metrics.successCount}
          helper={`₹${metrics.totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })} collected`}
          tone="brand"
        />
        <StatCard icon={Clock} label="Pending / in-process" value={metrics.pendingCount} helper="Awaiting bank confirmation" tone="caution" />
        <StatCard icon={CircleAlert} label="Failed / rejected" value={metrics.failureCount} helper="Eligible for re-presentment" tone="danger" />
      </div>

      {/* Status Alert Banner */}
      {retryMessage && (
        <div
          className={`rounded-lg border-l-4 p-4 text-sm font-medium ${
            retryMessage.tone === 'success'
              ? 'border-brand-300 bg-brand-50 text-brand-800'
              : 'border-danger-300 bg-danger-50 text-danger-800'
          }`}
        >
          {retryMessage.text}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border-l-4 border-danger-300 bg-danger-50 p-4 text-sm font-medium text-danger-800">
          <AlertTriangle size={16} className="shrink-0" /> {error}
        </div>
      )}

      {/* Filters Form */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 items-end">
          <div>
            <label className="block text-xs font-medium text-neutral-600">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs shadow-sm focus:border-brand-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs shadow-sm focus:border-brand-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs shadow-sm focus:border-brand-600"
            >
              <option value="">All Statuses</option>
              <option value="success">Success</option>
              <option value="in_process">In Process</option>
              <option value="failure">Failure</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600">Mandate Type</label>
            <select
              value={mandateTypeFilter}
              onChange={(e) => setMandateTypeFilter(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs shadow-sm focus:border-brand-600"
            >
              <option value="">All Types</option>
              <option value="UPI">UPI 2.0</option>
              <option value="ENACH">eNACH</option>
              <option value="SI">SI Cards</option>
            </select>
          </div>

          <div className="sm:col-span-2 md:col-span-1 lg:col-span-2">
            <label className="block text-xs font-medium text-neutral-600">Search</label>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                placeholder="Merchant Req # / UMRN / TxID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs shadow-sm focus:border-brand-600"
              />
              <Button type="submit" className="shrink-0 px-3 py-2 text-xs">
                Search
              </Button>
            </div>
          </div>
        </form>
      </div>

      {/* Table Card */}
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-neutral-600">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-4 py-3.5">Merchant Req #</th>
                <th className="px-4 py-3.5">LAN & UDF</th>
                <th className="px-4 py-3.5">Mandate & UMRN</th>
                <th className="px-4 py-3.5">Amount</th>
                <th className="px-4 py-3.5">Presentment Date</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Bank Reference / PG ID</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-neutral-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent"></div>
                      <span>Loading debit requests from {source === 'live' ? 'Easebuzz' : 'database'}...</span>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-neutral-500">
                    <p className="font-semibold text-neutral-700">No debit requests found</p>
                    <p className="mt-1 text-xs text-neutral-400">
                      Try adjusting your date filters, status, or search query.
                    </p>
                  </td>
                </tr>
              ) : (
                items.map((it, idx) => {
                  const reqNum = it.merchant_request_number || it.id || `#${idx + 1}`;
                  const mandateType = it.mandate?.mandate_type || it.mandate_type || 'UPI';
                  const umrn = it.umrn || it.mandate?.umrn || '—';
                  const lan = it.udf1 || it.lan || '—';
                  const amount = Number(it.amount || 0);
                  const status = it.status || it.status_at_bank || 'UNKNOWN';
                  const pDate = it.presentment_date || it.created_at?.slice(0, 10) || '—';
                  const bankRef = it.bank_reference_number || it.transaction_reference_number || it.pg_transaction_id || '—';
                  const isRetrying = retryingId === it.id || retryingId === reqNum;

                  return (
                    <tr key={it.id || reqNum} className="hover:bg-neutral-50/80 transition">
                      <td className="px-4 py-3 font-semibold text-neutral-900">
                        <div className="font-mono text-xs text-brand-700">{reqNum}</div>
                        {it.id && <div className="text-[10px] text-neutral-400">ID: {it.id}</div>}
                      </td>

                      <td className="px-4 py-3">
                        <span className="font-semibold text-neutral-800">{lan}</span>
                        {it.udf3 && <div className="text-[10px] text-neutral-400">EMI #{it.udf3}</div>}
                      </td>

                      <td className="px-4 py-3">
                        <div className="inline-flex items-center gap-1.5">
                          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold text-neutral-700">
                            {mandateType}
                          </span>
                        </div>
                        <div className="mt-0.5 max-w-[140px] truncate font-mono text-[10px] text-neutral-500" title={umrn}>
                          {umrn}
                        </div>
                      </td>

                      <td className="px-4 py-3 font-bold text-neutral-900">
                        ₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      <td className="px-4 py-3 font-mono text-[11px] text-neutral-600">
                        {pDate}
                      </td>

                      <td className="px-4 py-3">
                        <Badge tone={getStatusTone(status)}>
                          {status.toUpperCase()}
                        </Badge>
                        {it.failure_reason && (
                          <div className="mt-1 max-w-[160px] truncate text-[10px] text-danger-600" title={it.failure_reason}>
                            {it.failure_reason}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="max-w-[130px] truncate font-mono text-[10px] text-neutral-600" title={bankRef}>
                          {bankRef}
                        </div>
                        {it.pg_transaction_id && it.pg_transaction_id !== bankRef && (
                          <div className="text-[9px] text-neutral-400">PG: {it.pg_transaction_id}</div>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedItem(it)}
                            className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50 hover:text-neutral-900"
                          >
                            Details
                          </button>

                          {(String(status).toLowerCase() === 'failure' || String(status).toLowerCase() === 'failed') && (
                            <button
                              type="button"
                              onClick={() => handleManualRetry(it)}
                              disabled={isRetrying}
                              className="rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50"
                            >
                              {isRetrying ? 'Retrying...' : 'Retry'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex flex-col items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-50 px-4 py-3 sm:flex-row text-xs">
          <div className="text-neutral-500">
            Showing Page <span className="font-semibold text-neutral-800">{currentPage}</span> • Total {pagination?.showing?.total_records || items.length} records
          </div>

          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-700"
            >
              <option value={15}>15 per page</option>
              <option value={30}>30 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>

            <button
              type="button"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1 || loading}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1 font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
            >
              Prev
            </button>

            <button
              type="button"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={(!pagination.hasNext && items.length < pageSize) || loading}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1 font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Details Modal / Drawer */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-neutral-900">Debit Request Details</h3>
                <p className="font-mono text-xs text-brand-700">
                  {selectedItem.merchant_request_number || selectedItem.id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
              <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-3">
                <span className="font-semibold text-neutral-500">Status</span>
                <div className="mt-1">
                  <Badge tone={getStatusTone(selectedItem.status || selectedItem.status_at_bank)}>
                    {String(selectedItem.status || selectedItem.status_at_bank || 'UNKNOWN').toUpperCase()}
                  </Badge>
                </div>
              </div>

              <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-3">
                <span className="font-semibold text-neutral-500">Presentment Amount</span>
                <p className="mt-1 text-base font-bold text-neutral-900">
                  ₹{Number(selectedItem.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
              </div>

              <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-3">
                <span className="font-semibold text-neutral-500">LAN / Loan Account</span>
                <p className="mt-1 font-bold text-neutral-800">{selectedItem.udf1 || selectedItem.lan || '—'}</p>
              </div>

              <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-3">
                <span className="font-semibold text-neutral-500">Installment Number</span>
                <p className="mt-1 font-mono text-neutral-800">
                  {selectedItem.udf3 ? `EMI #${selectedItem.udf3}` : '—'}
                </p>
              </div>

              <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-3">
                <span className="font-semibold text-neutral-500">Mandate Transaction ID</span>
                <p className="mt-1 break-all font-mono text-neutral-800">
                  {selectedItem.mandate_transaction_id || selectedItem.mandate?.transaction_id || '—'}
                </p>
              </div>

              <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-3">
                <span className="font-semibold text-neutral-500">UMRN</span>
                <p className="mt-1 break-all font-mono text-neutral-800">
                  {selectedItem.umrn || selectedItem.mandate?.umrn || '—'}
                </p>
              </div>

              <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-3">
                <span className="font-semibold text-neutral-500">Bank Reference Number</span>
                <p className="mt-1 break-all font-mono text-neutral-800">
                  {selectedItem.bank_reference_number || '—'}
                </p>
              </div>

              <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-3">
                <span className="font-semibold text-neutral-500">PG Transaction ID</span>
                <p className="mt-1 break-all font-mono text-neutral-800">
                  {selectedItem.pg_transaction_id || '—'}
                </p>
              </div>

              {selectedItem.failure_reason && (
                <div className="sm:col-span-2 rounded-xl border border-danger-100 bg-danger-50 p-3 text-danger-800">
                  <span className="font-semibold">Failure Reason</span>
                  <p className="mt-1 font-mono text-xs">{selectedItem.failure_reason}</p>
                </div>
              )}

              {selectedItem.response_meta && (
                <div className="sm:col-span-2 rounded-xl border border-neutral-100 bg-neutral-50 p-3">
                  <span className="font-semibold text-neutral-500">Response Meta</span>
                  <pre className="mt-1 max-h-36 overflow-auto font-mono text-[11px] text-neutral-700">
                    {JSON.stringify(selectedItem.response_meta, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-neutral-100 pt-4">
              <Button variant="secondary" onClick={() => setSelectedItem(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DebitRequestsPage;
