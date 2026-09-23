import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Camera,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  Landmark,
  MapPin,
  Maximize2,
  Phone,
  RefreshCw,
  ScanFace,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { creditReviewApi } from '../api/creditReview.api';
import { apiError } from '../../../lib/api';
import { resolveFileUrl } from '../../../lib/files';
import { Badge, Button, Card, EmptyState, PageHeader, Select, StatCard, TableShell, Textarea } from '../../../components/ui';

function formatCurrency(amount) {
  if (amount === null || amount === undefined || isNaN(Number(amount))) return '-';
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

function formatDate(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
}

function formatDateOnly(value) {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(value);
  }
}

// Face-match flags are tri-state: the provider may omit them entirely, so null/undefined
// has to read as "unknown" rather than collapsing into "No".
function formatBoolFlag(value) {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return '-';
}

function formatLabel(value) {
  if (!value) return '-';
  return String(value)
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function calculateAge(dob) {
  if (!dob) return null;
  try {
    const birth = new Date(dob);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
      age--;
    }
    return age > 0 ? age : null;
  } catch {
    return null;
  }
}

// Compare two strings and return matching status
function compareNames(a, b) {
  if (!a || !b) return { status: 'MISSING', text: 'Data Missing', color: 'gray' };
  const cleanA = a.trim().toUpperCase().replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ');
  const cleanB = b.trim().toUpperCase().replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ');
  if (cleanA === cleanB) {
    return { status: 'EXACT', text: '100% Match', color: 'green' };
  }
  const wordsA = cleanA.split(' ');
  const wordsB = cleanB.split(' ');
  const matched = wordsA.filter((w) => wordsB.includes(w) || wordsB.some((x) => x.startsWith(w) || w.startsWith(x)));
  const score = Math.round((matched.length / Math.max(wordsA.length, wordsB.length)) * 100);
  if (score >= 60) {
    return { status: 'PARTIAL', text: `Partial Match (${score}%)`, color: 'amber' };
  }
  return { status: 'MISMATCH', text: `Mismatch (${score}%)`, color: 'red' };
}

export default function CreditReviewPage() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Active Review Detail Modal State
  const [selectedApplicationId, setSelectedApplicationId] = useState(null);
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');

  // Action State
  const [actioningId, setActioningId] = useState(null);

  // Image Zoom Modal
  const [zoomedImage, setZoomedImage] = useState(null);

  // Digitap FaceMatch re-run (live selfie vs DigiLocker Aadhaar photo)
  const [faceMatchRunning, setFaceMatchRunning] = useState(false);
  const [faceMatchError, setFaceMatchError] = useState('');

  const loadPendingApplications = () => {
    setLoading(true);
    setError('');
    creditReviewApi
      .getPending()
      .then((data) => setApplications(Array.isArray(data) ? data : []))
      .catch((err) => setError(apiError(err, 'Unable to load pending credit review applications.')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPendingApplications();
  }, []);

  const openApplicationReview = (applicationId) => {
    setSelectedApplicationId(applicationId);
    setDetails(null);
    setDetailsLoading(true);
    setDetailsError('');
    creditReviewApi
      .getApplicationDetails(applicationId)
      .then((res) => {
        setDetails(res);
      })
      .catch((err) => {
        setDetailsError(apiError(err, 'Unable to load full application details for credit review.'));
      })
      .finally(() => {
        setDetailsLoading(false);
      });
  };

  const closeApplicationReview = () => {
    setSelectedApplicationId(null);
    setDetails(null);
    setDetailsError('');
    setFaceMatchError('');
  };

  const handleRunFaceMatch = async () => {
    if (!selectedApplicationId) return;
    setFaceMatchRunning(true);
    setFaceMatchError('');
    try {
      const faceMatch = await creditReviewApi.runFaceMatch(selectedApplicationId);
      setDetails((prev) => (prev ? { ...prev, faceMatch } : prev));
    } catch (err) {
      setFaceMatchError(apiError(err, 'Unable to run the face match right now.'));
    } finally {
      setFaceMatchRunning(false);
    }
  };

  const handleApprove = async (appId) => {
    if (!appId) return;
    setActioningId(appId);
    setError('');
    try {
      await creditReviewApi.approve(appId);
      if (selectedApplicationId === appId) {
        closeApplicationReview();
      }
      loadPendingApplications();
    } catch (err) {
      setError(apiError(err, 'Failed to approve application.'));
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (appId, reason = 'Rejected during credit underwriting review') => {
    if (!appId) return;
    setActioningId(appId);
    setError('');
    try {
      await creditReviewApi.reject(appId, reason);
      if (selectedApplicationId === appId) {
        closeApplicationReview();
      }
      loadPendingApplications();
    } catch (err) {
      setError(apiError(err, 'Failed to reject application.'));
    } finally {
      setActioningId(null);
    }
  };

  // Filtered applications
  const filteredApplications = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return applications;
    return applications.filter((app) => {
      const name = (app.customerName || '').toLowerCase();
      const mobile = (app.customerMobile || '').toLowerCase();
      const ref = (app.applicationReference || '').toLowerCase();
      const lan = (app.platformLan || '').toLowerCase();
      const lender = (app.lenderCode || app.lenderId || '').toLowerCase();
      return name.includes(q) || mobile.includes(q) || ref.includes(q) || lan.includes(q) || lender.includes(q);
    });
  }, [applications, searchQuery]);

  // Underwriting Pipeline Metrics
  const stats = useMemo(() => {
    const totalCount = applications.length;
    const totalAmount = applications.reduce((sum, a) => sum + (Number(a.selectedAmount) || 0), 0);
    const avgAmount = totalCount > 0 ? Math.round(totalAmount / totalCount) : 0;
    return { totalCount, totalAmount, avgAmount };
  }, [applications]);

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Credit team review & underwriting"
        description={<>Verify customer identity, cross-check <strong>Name in PAN vs Aadhaar vs Bank</strong>, inspect <strong>live selfie photo &amp; geolocation</strong>, and execute final credit approval.</>}
        actions={
          <Button type="button" variant="secondary" onClick={loadPendingApplications} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh queue
          </Button>
        }
      />

      {/* Stats Summary Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Clock} label="Pending review" value={stats.totalCount} helper="Awaiting credit underwriter sign-off" tone="caution" />
        <StatCard icon={Landmark} label="Pipeline selected value" value={formatCurrency(stats.totalAmount)} helper="Total customer-selected loan volume" tone="brand" />
        <StatCard icon={CreditCard} label="Average ticket size" value={formatCurrency(stats.avgAmount)} helper="Average requested disbursal" tone="info" />
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="mb-6 flex items-center justify-between rounded-lg border-l-4 border-danger-300 bg-danger-50 p-4 text-sm text-danger-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-danger-600" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError('')} className="text-danger-600 hover:text-danger-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search by customer name, mobile, reference, LAN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm outline-none placeholder:text-neutral-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
          />
        </div>
        <div className="text-xs font-medium text-neutral-500">
          Showing <span className="font-bold text-neutral-700">{filteredApplications.length}</span> of {applications.length} applications
        </div>
      </div>

      {/* Applications Table */}
      {!loading && filteredApplications.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="All applications clear!"
          description="No applications currently pending final credit review."
        />
      ) : (
        <TableShell>
            <thead className="border-b border-neutral-200 bg-neutral-50">
              <tr>
                <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wide text-neutral-500">Customer</th>
                <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wide text-neutral-500">Application &amp; LAN</th>
                <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wide text-neutral-500">Selected offer</th>
                <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wide text-neutral-500">Lender</th>
                <th className="px-5 py-3.5 text-xs font-bold uppercase tracking-wide text-neutral-500">Selected at</th>
                <th className="px-5 py-3.5 text-right text-xs font-bold uppercase tracking-wide text-neutral-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-neutral-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="h-6 w-6 animate-spin text-brand-600" />
                      <span className="text-sm font-medium">Loading applications pending credit review...</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredApplications.map((app) => {
                  const isSelected = selectedApplicationId === app.applicationId;
                  return (
                    <tr
                      key={app.applicationId}
                      onClick={() => openApplicationReview(app.applicationId)}
                      className={`cursor-pointer transition hover:bg-neutral-50/80 ${
                        isSelected ? 'bg-brand-50/50' : ''
                      }`}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700 font-bold">
                            {(app.customerName || 'U').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-neutral-900 hover:text-brand-600">
                              {app.customerName || 'Unnamed Customer'}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-neutral-500">
                              <Phone className="h-3 w-3" />
                              <span>{app.customerMobile || '-'}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="font-medium text-neutral-800">{app.applicationReference}</div>
                        {app.platformLan && (
                          <div className="mt-0.5 inline-flex items-center rounded-md bg-neutral-100 px-1.5 py-0.5 text-xs font-mono font-medium text-neutral-700">
                            LAN: {app.platformLan}
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <div className="text-base font-bold text-neutral-900">{formatCurrency(app.selectedAmount)}</div>
                        <div className="text-xs text-neutral-500">{app.selectedTenure ? `${app.selectedTenure} days` : 'Tenure TBD'}</div>
                      </td>

                      <td className="px-5 py-4">
                        <Badge tone="info">{app.lenderCode || app.lenderId || 'LENDER'}</Badge>
                      </td>

                      <td className="px-5 py-4 text-xs text-neutral-500">
                        {formatDate(app.selectedAt)}
                      </td>

                      <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <Button type="button" variant="secondary" size="sm" onClick={() => openApplicationReview(app.applicationId)}>
                            <Eye className="h-3.5 w-3.5" />
                            Review profile
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={actioningId === app.applicationId}
                            onClick={() => handleApprove(app.applicationId)}
                          >
                            {actioningId === app.applicationId ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ThumbsUp className="h-3.5 w-3.5" />
                            )}
                            Approve
                          </Button>
                          <Button
                            type="button"
                            variant="dangerGhost"
                            size="sm"
                            disabled={actioningId === app.applicationId}
                            onClick={() => handleReject(app.applicationId)}
                          >
                            {actioningId === app.applicationId ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ThumbsDown className="h-3.5 w-3.5" />
                            )}
                            Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
        </TableShell>
      )}

      {/* Comprehensive Underwriting Drawer / Modal */}
      {selectedApplicationId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/60 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto">
          <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-neutral-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white font-bold shadow-sm">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-lg font-bold text-ink">
                      {details?.customer?.fullName || 'Application Review'}
                    </h2>
                    <Badge tone="caution">Pending credit approval</Badge>
                  </div>
                  <p className="font-numeric text-xs text-neutral-500">
                    Ref: {details?.application?.applicationNumber || selectedApplicationId} · LAN: {details?.application?.platformLan || 'Not Allocated'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {details && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      disabled={actioningId === selectedApplicationId}
                      onClick={() => handleApprove(selectedApplicationId)}
                    >
                      {actioningId === selectedApplicationId ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <ThumbsUp className="h-4 w-4" />
                      )}
                      Approve loan
                    </Button>
                    <Button
                      type="button"
                      variant="dangerGhost"
                      size="sm"
                      disabled={actioningId === selectedApplicationId}
                      onClick={() => handleReject(selectedApplicationId)}
                    >
                      {actioningId === selectedApplicationId ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <ThumbsDown className="h-4 w-4" />
                      )}
                      Reject loan
                    </Button>
                  </>
                )}
                <button
                  type="button"
                  onClick={closeApplicationReview}
                  aria-label="Close"
                  className="rounded-xl p-2 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {detailsLoading ? (
                <div className="flex flex-col items-center justify-center py-24 text-neutral-500 gap-3">
                  <RefreshCw className="h-8 w-8 animate-spin text-brand-600" />
                  <p className="text-sm font-medium">Fetching complete customer underwriting profile...</p>
                </div>
              ) : detailsError ? (
                <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-800">
                  {detailsError}
                </div>
              ) : details ? (
                <>
                  {/* CRITICAL SECTION 1: 4-WAY NAME VERIFICATION CROSS-CHECK */}
                  <div className="rounded-2xl border-2 border-brand-200 bg-gradient-to-br from-brand-50/40 via-white to-neutral-50 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4 border-b border-brand-100 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white">
                          <Sparkles className="h-4 w-4" />
                        </span>
                        <h3 className="text-base font-bold text-neutral-900">
                          Identity & Name Verification Cross-Check
                        </h3>
                      </div>
                      <div>
                        {(() => {
                          const profileName = details.customer?.fullName || '';
                          const panName = details.kyc?.panRegisteredName || '';
                          const aadhaarName = details.kyc?.aadhaarName || '';

                          const panCheck = compareNames(profileName, panName);
                          const aadhaarCheck = compareNames(profileName, aadhaarName);
                          const panVsAadhaar = compareNames(panName, aadhaarName);

                          const allMatch = panCheck.status === 'EXACT' && aadhaarCheck.status === 'EXACT';

                          if (allMatch) {
                            return (
                              <Badge tone="brand">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                100% name match (PAN + Aadhaar)
                              </Badge>
                            );
                          }
                          if (panVsAadhaar.status === 'MISMATCH') {
                            return (
                              <Badge tone="danger">
                                <ShieldAlert className="h-3.5 w-3.5" />
                                Name discrepancy detected
                              </Badge>
                            );
                          }
                          return (
                            <Badge tone="caution">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Minor name variation ({panVsAadhaar.text})
                            </Badge>
                          );
                        })()}
                      </div>
                    </div>

                    {/* 4-way comparison cards */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {/* Card 1: Profile Name */}
                      <div className="rounded-xl border border-neutral-200 bg-white p-3.5 shadow-xs">
                        <div className="flex items-center justify-between text-xs text-neutral-500 font-semibold uppercase">
                          <span>1. Profile / Customer</span>
                          <User className="h-3.5 w-3.5 text-neutral-400" />
                        </div>
                        <div className="mt-2 text-sm font-bold text-neutral-900 break-words">
                          {details.customer?.fullName || '-'}
                        </div>
                        <div className="mt-1 text-xs text-neutral-500">
                          Code: {details.customer?.customerCode || '-'}
                        </div>
                      </div>

                      {/* Card 2: PAN Card Name */}
                      <div className="rounded-xl border border-neutral-200 bg-white p-3.5 shadow-xs">
                        <div className="flex items-center justify-between text-xs text-neutral-500 font-semibold uppercase">
                          <span>2. Name in PAN Card</span>
                          <CreditCard className="h-3.5 w-3.5 text-neutral-400" />
                        </div>
                        <div className="mt-2 text-sm font-bold text-neutral-900 break-words">
                          {details.kyc?.panRegisteredName || details.customer?.fullName || '-'}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-xs">
                          <span className="font-mono font-semibold text-neutral-700">{details.customer?.panNumber || '-'}</span>
                          {details.customer?.panVerified ? (
                            <span className="inline-flex items-center text-brand-600 font-semibold">
                              <CheckCircle2 className="h-3 w-3 mr-0.5" /> Verified
                            </span>
                          ) : (
                            <span className="text-caution-600 font-semibold">Pending</span>
                          )}
                        </div>
                      </div>

                      {/* Card 3: Aadhaar DigiLocker Name */}
                      <div className="rounded-xl border border-neutral-200 bg-white p-3.5 shadow-xs">
                        <div className="flex items-center justify-between text-xs text-neutral-500 font-semibold uppercase">
                          <span>3. Name in Aadhaar</span>
                          <Building2 className="h-3.5 w-3.5 text-neutral-400" />
                        </div>
                        <div className="mt-2 text-sm font-bold text-neutral-900 break-words">
                          {details.kyc?.aadhaarName || '-'}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-xs">
                          <span className="font-mono font-semibold text-neutral-700">
                            {details.kyc?.aadhaarMaskedNumber || details.customer?.maskedAadhaar || '-'}
                          </span>
                          {details.customer?.aadhaarVerified || details.kyc?.aadhaarStatus === 'VERIFIED' ? (
                            <span className="inline-flex items-center text-brand-600 font-semibold">
                              <CheckCircle2 className="h-3 w-3 mr-0.5" /> DigiLocker
                            </span>
                          ) : (
                            <span className="text-caution-600 font-semibold">Unverified</span>
                          )}
                        </div>
                      </div>

                      {/* Card 4: Bank Account Name */}
                      <div className="rounded-xl border border-neutral-200 bg-white p-3.5 shadow-xs">
                        <div className="flex items-center justify-between text-xs text-neutral-500 font-semibold uppercase">
                          <span>4. Name in Bank Account</span>
                          <Landmark className="h-3.5 w-3.5 text-neutral-400" />
                        </div>
                        <div className="mt-2 text-sm font-bold text-neutral-900 break-words">
                          {details.bankVerification?.providerBeneficiaryName || details.bankVerification?.accountHolderName || '-'}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-xs">
                          <span className="font-mono text-neutral-600">
                            {details.bankVerification?.accountNumberMasked || '-'}
                          </span>
                          {details.bankVerification?.nameMatched ? (
                            <span className="inline-flex items-center text-brand-600 font-semibold">
                              <CheckCircle2 className="h-3 w-3 mr-0.5" /> Match
                            </span>
                          ) : details.bankVerification ? (
                            <span className="text-caution-600 font-semibold">
                              {details.bankVerification.status || 'Pending'}
                            </span>
                          ) : (
                            <span className="text-neutral-400">Not Done</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* CRITICAL SECTION 2: CUSTOMER LIVE PHOTO & GEOLOCATION */}
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    {/* Live Selfie Card */}
                    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5">
                          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-100 text-brand-700">
                            <Camera className="h-3.5 w-3.5" />
                          </span>
                          <h4 className="text-sm font-bold text-neutral-900">Customer Live Selfie Photo</h4>
                        </div>
                        {details.livePhoto && (
                          <span className="inline-flex items-center rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 border border-brand-100">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {details.livePhoto.faceLivenessStatus || 'Captured'}
                          </span>
                        )}
                      </div>

                      {details.livePhoto?.fileUrl ? (
                        <div className="space-y-3">
                          <div className="group relative overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100">
                            <img
                              src={resolveFileUrl(details.livePhoto.fileUrl)}
                              alt="Customer Live Selfie"
                              className="h-56 w-full object-cover object-top transition duration-200 group-hover:scale-105"
                            />
                            <button
                              type="button"
                              onClick={() => setZoomedImage(resolveFileUrl(details.livePhoto.fileUrl))}
                              className="absolute bottom-2 right-2 rounded-lg bg-neutral-900/80 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm hover:bg-neutral-900"
                            >
                              <Maximize2 className="inline h-3 w-3 mr-1" /> View Full
                            </button>
                          </div>

                          {/* Liveness Score Gauge */}
                          {details.livePhoto.faceLivenessScore !== null && (
                            <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-2.5">
                              <div className="flex justify-between text-xs font-medium text-neutral-600">
                                <span>Liveness Confidence</span>
                                <span className="font-bold text-brand-600">
                                  {(details.livePhoto.faceLivenessScore * 100).toFixed(1)}%
                                </span>
                              </div>
                              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-neutral-200">
                                <div
                                  className="h-full bg-brand-500 rounded-full"
                                  style={{
                                    width: `${Math.min(100, Math.max(0, details.livePhoto.faceLivenessScore * 100))}%`,
                                  }}
                                />
                              </div>
                            </div>
                          )}

                          <div className="text-xs text-neutral-500">
                            Captured on {formatDate(details.livePhoto.capturedAt)}
                          </div>
                        </div>
                      ) : (
                        <div className="flex h-56 flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-neutral-50 text-neutral-400 p-4 text-center">
                          <Camera className="h-10 w-10 text-neutral-300 mb-2" />
                          <p className="text-sm font-medium text-neutral-600">No Live Photo Available</p>
                          <p className="text-xs text-neutral-400 mt-1">
                            Customer has not completed live photo verification yet.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Geolocation & Capture Audit */}
                    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm lg:col-span-2">
                      <div className="flex items-center gap-1.5 mb-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-info-100 text-info-700">
                          <MapPin className="h-3.5 w-3.5" />
                        </span>
                        <h4 className="text-sm font-bold text-neutral-900">Live Photo Geolocation & Security Telemetry</h4>
                      </div>

                      {details.livePhoto?.formattedAddress || details.livePhoto?.latitude ? (
                        <div className="space-y-3 text-sm">
                          <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-3.5">
                            <div className="text-xs font-semibold uppercase text-neutral-500">Captured Location Address</div>
                            <div className="mt-1 font-medium text-neutral-900">
                              {details.livePhoto.formattedAddress || `${details.livePhoto.city || ''}, ${details.livePhoto.state || ''} ${details.livePhoto.postalCode || ''}`}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-4 text-xs text-neutral-600">
                              <div>
                                <span className="text-neutral-400">City:</span>{' '}
                                <span className="font-semibold text-neutral-700">{details.livePhoto.city || '-'}</span>
                              </div>
                              <div>
                                <span className="text-neutral-400">State:</span>{' '}
                                <span className="font-semibold text-neutral-700">{details.livePhoto.state || '-'}</span>
                              </div>
                              <div>
                                <span className="text-neutral-400">Postal Code:</span>{' '}
                                <span className="font-semibold text-neutral-700">{details.livePhoto.postalCode || '-'}</span>
                              </div>
                              <div>
                                <span className="text-neutral-400">Country:</span>{' '}
                                <span className="font-semibold text-neutral-700">{details.livePhoto.country || 'India'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-3">
                              <span className="text-xs text-neutral-400">GPS Coordinates</span>
                              <div className="mt-0.5 font-mono text-xs font-bold text-neutral-800">
                                {details.livePhoto.latitude && details.livePhoto.longitude
                                  ? `${details.livePhoto.latitude.toFixed(6)}, ${details.livePhoto.longitude.toFixed(6)}`
                                  : '-'}
                              </div>
                              {details.livePhoto.latitude && details.livePhoto.longitude && (
                                <a
                                  href={`https://www.google.com/maps?q=${details.livePhoto.latitude},${details.livePhoto.longitude}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-1 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
                                >
                                  View on Google Maps <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                            <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-3">
                              <span className="text-xs text-neutral-400">Capture Timestamp</span>
                              <div className="mt-0.5 text-xs font-bold text-neutral-800">
                                {formatDate(details.livePhoto.capturedAt)}
                              </div>
                              <span className="text-xs text-neutral-400">Face Verification Passed</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="py-8 text-center text-xs text-neutral-400">
                          No GPS location telemetry captured with this document.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* SECTION 2b: FACE MATCH — LIVE SELFIE vs AADHAAR PHOTO (advisory) */}
                  <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-3 border-b border-neutral-100 pb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-100 text-accent-700">
                          <ScanFace className="h-3.5 w-3.5" />
                        </span>
                        <h4 className="text-sm font-bold text-neutral-900">
                          Face Match — Live Selfie vs Aadhaar Photo
                        </h4>
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                          Advisory
                        </span>
                      </div>
                      <Button type="button" variant="secondary" size="sm" onClick={handleRunFaceMatch} disabled={faceMatchRunning}>
                        <RefreshCw className={`h-3.5 w-3.5 ${faceMatchRunning ? 'animate-spin' : ''}`} />
                        {faceMatchRunning ? 'Running…' : details.faceMatch ? 'Re-run' : 'Run face match'}
                      </Button>
                    </div>

                    {faceMatchError && (
                      <div className="mb-3 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">
                        {faceMatchError}
                      </div>
                    )}

                    {details.faceMatch ? (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div
                          className={`rounded-xl border p-3.5 ${
                            details.faceMatch.status === 'MATCHED'
                              ? 'border-brand-200 bg-brand-50'
                              : details.faceMatch.status === 'NOT_MATCHED'
                                ? 'border-danger-200 bg-danger-50'
                                : 'border-caution-200 bg-caution-50'
                          }`}
                        >
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                            Result
                          </span>
                          <div className="mt-1 flex items-center gap-1.5">
                            {details.faceMatch.status === 'MATCHED' ? (
                              <CheckCircle2 className="h-4 w-4 text-brand-600" />
                            ) : details.faceMatch.status === 'NOT_MATCHED' ? (
                              <XCircle className="h-4 w-4 text-danger-600" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-caution-600" />
                            )}
                            <span className="text-sm font-bold text-neutral-900">
                              {formatLabel(details.faceMatch.status)}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-neutral-500">
                            {details.faceMatch.matchedAt
                              ? `Checked ${formatDate(details.faceMatch.matchedAt)}`
                              : formatDate(details.faceMatch.updatedAt)}
                          </p>
                        </div>

                        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                            Match Confidence
                          </span>
                          {details.faceMatch.sameFaceConfidence !== null &&
                          details.faceMatch.sameFaceConfidence !== undefined ? (
                            <>
                              <div className="mt-1 text-lg font-extrabold text-neutral-900">
                                {(details.faceMatch.sameFaceConfidence * 100).toFixed(1)}%
                              </div>
                              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-neutral-200">
                                <div
                                  className={`h-full rounded-full ${
                                    details.faceMatch.sameFaceConfidence >= 0.5
                                      ? 'bg-brand-500'
                                      : 'bg-danger-500'
                                  }`}
                                  style={{
                                    width: `${Math.min(100, Math.max(0, details.faceMatch.sameFaceConfidence * 100))}%`,
                                  }}
                                />
                              </div>
                            </>
                          ) : (
                            <p className="mt-1 text-sm font-semibold text-neutral-400">Not available</p>
                          )}
                        </div>

                        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                            Image Quality
                          </span>
                          <ul className="mt-1.5 space-y-1 text-xs text-neutral-600">
                            <li className="flex items-center justify-between gap-2">
                              <span>Face found in selfie</span>
                              <span className="font-semibold text-neutral-800">
                                {formatBoolFlag(details.faceMatch.personImageFaceDetected)}
                              </span>
                            </li>
                            <li className="flex items-center justify-between gap-2">
                              <span>Face found in Aadhaar</span>
                              <span className="font-semibold text-neutral-800">
                                {formatBoolFlag(details.faceMatch.cardImageFaceDetected)}
                              </span>
                            </li>
                            <li className="flex items-center justify-between gap-2">
                              <span>Selfie blurry</span>
                              <span className="font-semibold text-neutral-800">
                                {formatBoolFlag(details.faceMatch.personImageBlurry)}
                              </span>
                            </li>
                            <li className="flex items-center justify-between gap-2">
                              <span>Aadhaar image blurry</span>
                              <span className="font-semibold text-neutral-800">
                                {formatBoolFlag(details.faceMatch.cardImageBlurry)}
                              </span>
                            </li>
                          </ul>
                        </div>

                        {details.faceMatch.failureReason && (
                          <div className="sm:col-span-3 rounded-xl border border-caution-200 bg-caution-50 px-3 py-2 text-xs text-caution-800">
                            {details.faceMatch.failureReason}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="py-6 text-center text-xs text-neutral-400">
                        No face match has been recorded for this application yet. It runs automatically
                        once Aadhaar KYC is verified and a live selfie is on file.
                      </div>
                    )}
                  </div>

                  {/* SECTION 3: PERSONAL DEMOGRAPHICS & CONTACTS */}
                  <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-3 border-b border-neutral-100 pb-2">
                      <User className="h-4 w-4 text-brand-600" />
                      <h4 className="text-sm font-bold text-neutral-900">Personal & Demographic Details</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
                      <div>
                        <span className="text-xs text-neutral-500">Full Name</span>
                        <p className="font-semibold text-neutral-900">{details.customer?.fullName || '-'}</p>
                      </div>
                      <div>
                        <span className="text-xs text-neutral-500">Father's Name</span>
                        <p className="font-semibold text-neutral-900">{details.customer?.fatherName || '-'}</p>
                      </div>
                      <div>
                        <span className="text-xs text-neutral-500">Date of Birth</span>
                        <p className="font-semibold text-neutral-900">
                          {formatDateOnly(details.customer?.dateOfBirth || details.kyc?.aadhaarDob)}{' '}
                          {calculateAge(details.customer?.dateOfBirth || details.kyc?.aadhaarDob) ? (
                            <span className="text-xs text-neutral-500">
                              ({calculateAge(details.customer?.dateOfBirth || details.kyc?.aadhaarDob)} yrs)
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-neutral-500">Gender</span>
                        <p className="font-semibold text-neutral-900">{formatLabel(details.customer?.gender)}</p>
                      </div>
                      <div>
                        <span className="text-xs text-neutral-500">Mobile Number</span>
                        <p className="font-semibold text-neutral-900">
                          {details.customer?.mobileNumber || '-'}{' '}
                          {details.customer?.mobileVerified && (
                            <span className="inline-flex items-center text-xs text-brand-600 font-bold">
                              <CheckCircle2 className="h-3 w-3 inline ml-0.5" />
                            </span>
                          )}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-neutral-500">Email Address</span>
                        <p className="font-semibold text-neutral-900 truncate">
                          {details.customer?.email || '-'}{' '}
                          {details.customer?.emailVerified && (
                            <span className="inline-flex items-center text-xs text-brand-600 font-bold">
                              <CheckCircle2 className="h-3 w-3 inline ml-0.5" />
                            </span>
                          )}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-neutral-500">Residence Status</span>
                        <p className="font-semibold text-neutral-900">{formatLabel(details.customer?.residenceStatus)}</p>
                      </div>
                      <div>
                        <span className="text-xs text-neutral-500">Customer Code</span>
                        <p className="font-mono font-semibold text-neutral-900">{details.customer?.customerCode || '-'}</p>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 4: ADDRESS VERIFICATION (PERMANENT VS CURRENT) */}
                  <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-3 border-b border-neutral-100 pb-2">
                      <MapPin className="h-4 w-4 text-brand-600" />
                      <h4 className="text-sm font-bold text-neutral-900">Address Verification</h4>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {/* Permanent Address (UIDAI Aadhaar / DigiLocker) */}
                      <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold uppercase text-neutral-500">
                            Permanent Address (Aadhaar UIDAI)
                          </span>
                          <span className="rounded bg-brand-100 px-2 py-0.5 text-2xs font-semibold text-brand-800">
                            DIGILOCKER
                          </span>
                        </div>
                        {(() => {
                          const perm = (details.addresses || []).find((a) => a.addressType === 'PERMANENT');
                          if (perm) {
                            return (
                              <p className="text-sm text-neutral-800">
                                {[perm.addressLine1, perm.addressLine2, perm.landmark, perm.locality, perm.city, perm.state, perm.pincode]
                                  .filter(Boolean)
                                  .join(', ')}
                              </p>
                            );
                          }
                          if (details.kyc?.aadhaarAddress) {
                            return <p className="text-sm text-neutral-800">{details.kyc.aadhaarAddress}</p>;
                          }
                          return <p className="text-sm text-neutral-400 italic">No Aadhaar address record found.</p>;
                        })()}
                      </div>

                      {/* Current Residence Address */}
                      <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold uppercase text-neutral-500">Current Residence Address</span>
                          <span className="rounded bg-info-100 px-2 py-0.5 text-2xs font-semibold text-info-800">
                            CONFIRMED
                          </span>
                        </div>
                        {(() => {
                          const curr = (details.addresses || []).find((a) => a.addressType === 'CURRENT');
                          if (curr) {
                            return (
                              <p className="text-sm text-neutral-800">
                                {[curr.addressLine1, curr.addressLine2, curr.landmark, curr.locality, curr.city, curr.state, curr.pincode]
                                  .filter(Boolean)
                                  .join(', ')}
                              </p>
                            );
                          }
                          if (details.customer?.residentialCity || details.customer?.residentialPincode) {
                            return (
                              <p className="text-sm text-neutral-800">
                                {[details.customer.residentialCity, details.customer.residentialState, details.customer.residentialPincode]
                                  .filter(Boolean)
                                  .join(', ')}
                              </p>
                            );
                          }
                          return <p className="text-sm text-neutral-400 italic">No separate current address specified.</p>;
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* SECTION 5: EMPLOYMENT & BANK VERIFICATION */}
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    {/* Employment Details */}
                    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center gap-2 mb-3 border-b border-neutral-100 pb-2">
                        <Building2 className="h-4 w-4 text-brand-600" />
                        <h4 className="text-sm font-bold text-neutral-900">Employment & Income Profile</h4>
                      </div>
                      <dl className="space-y-2.5 text-sm">
                        <div className="flex justify-between">
                          <dt className="text-neutral-500">Employment Type</dt>
                          <dd className="font-semibold text-neutral-900">
                            {formatLabel(details.employment?.employmentType || details.customer?.employmentType)}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-neutral-500">Employer / Business</dt>
                          <dd className="font-semibold text-neutral-900">
                            {details.employment?.companyName || details.customer?.companyName || details.employment?.businessName || details.customer?.businessName || '-'}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-neutral-500">Designation</dt>
                          <dd className="font-semibold text-neutral-900">
                            {details.employment?.designation || details.customer?.designation || '-'}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-neutral-500">Monthly Net Income</dt>
                          <dd className="text-base font-bold text-brand-600">
                            {formatCurrency(details.employment?.monthlyIncome ?? details.customer?.monthlyIncome)}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-neutral-500">Salary Mode</dt>
                          <dd className="font-semibold text-neutral-900">
                            {formatLabel(details.employment?.salaryMode || details.customer?.salaryMode)}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-neutral-500">Experience / Vintage</dt>
                          <dd className="font-semibold text-neutral-900">
                            {details.employment?.employmentVintage || details.customer?.employmentVintage || details.customer?.totalExperience || '-'}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    {/* Bank Account Verification */}
                    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center gap-2 mb-3 border-b border-neutral-100 pb-2">
                        <Landmark className="h-4 w-4 text-brand-600" />
                        <h4 className="text-sm font-bold text-neutral-900">Bank Account & Disbursal</h4>
                      </div>
                      {details.bankVerification ? (
                        <dl className="space-y-2.5 text-sm">
                          <div className="flex justify-between">
                            <dt className="text-neutral-500">Bank Name</dt>
                            <dd className="font-semibold text-neutral-900">{details.bankVerification.bankName || '-'}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-neutral-500">Account Number</dt>
                            <dd className="font-mono font-bold text-neutral-900">
                              {details.bankVerification.accountNumberMasked || '-'}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-neutral-500">IFSC Code</dt>
                            <dd className="font-mono font-semibold text-neutral-900">{details.bankVerification.ifscCode || '-'}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-neutral-500">Beneficiary Name</dt>
                            <dd className="font-semibold text-neutral-900">
                              {details.bankVerification.providerBeneficiaryName || details.bankVerification.accountHolderName || '-'}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-neutral-500">Penny-Drop Match</dt>
                            <dd>
                              {details.bankVerification.nameMatched ? (
                                <span className="inline-flex items-center rounded bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-800">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Matched ({details.bankVerification.fuzzyMatchScore ?? 100}%)
                                </span>
                              ) : (
                                <span className="rounded bg-caution-100 px-2 py-0.5 text-xs font-bold text-caution-800">
                                  {details.bankVerification.status || 'Verified'}
                                </span>
                              )}
                            </dd>
                          </div>
                        </dl>
                      ) : (
                        <p className="py-8 text-center text-xs text-neutral-400">
                          Bank verification record not available yet.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* SECTION 6: SELECTED LOAN OFFER & COMMERCIALS */}
                  <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-3 border-b border-neutral-100 pb-2">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-brand-600" />
                        <h4 className="text-sm font-bold text-neutral-900">Loan Commercials & Selected Offer</h4>
                      </div>
                      <span className="rounded bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">
                        LAN: {details.application?.platformLan || 'TBD'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
                      <div>
                        <span className="text-xs text-neutral-500">Customer Selected</span>
                        <div className="text-lg font-bold text-neutral-900">
                          {formatCurrency(details.application?.selectedAmount)}
                        </div>
                        <span className="text-xs text-neutral-500">
                          Tenure: {details.application?.selectedTenure ? `${details.application.selectedTenure} days` : '-'}
                        </span>
                      </div>

                      <div>
                        <span className="text-xs text-neutral-500">Lender Approved Limit</span>
                        <div className="text-lg font-bold text-neutral-900">
                          {formatCurrency(details.application?.lenderApprovedAmount)}
                        </div>
                        <span className="text-xs text-neutral-500">
                          Max Tenure: {details.application?.lenderApprovedTenure ? `${details.application.lenderApprovedTenure}d` : '-'}
                        </span>
                      </div>

                      <div>
                        <span className="text-xs text-neutral-500">Approved Interest (ROI)</span>
                        <div className="text-lg font-bold text-brand-600">
                          {details.application?.lenderApprovedRoi ? `${details.application.lenderApprovedRoi}% p.a.` : '-'}
                        </div>
                        <span className="text-xs text-neutral-500">Bullet Repayment</span>
                      </div>

                      <div>
                        <span className="text-xs text-neutral-500">Lender Code</span>
                        <div className="text-lg font-bold text-info-700">
                          {details.application?.lenderCode || details.application?.lenderId || 'LENDER'}
                        </div>
                        <span className="text-xs text-neutral-500">
                          Selected on {formatDateOnly(details.application?.selectedAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 7: UPLOADED DOCUMENTS GALLERY */}
                  <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4 border-b border-neutral-100 pb-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-brand-600" />
                        <h4 className="text-sm font-bold text-neutral-900">All Customer Documents ({details.documents?.length || 0})</h4>
                      </div>
                    </div>

                    {(!details.documents || details.documents.length === 0) ? (
                      <p className="text-sm text-neutral-500 italic py-4 text-center">No documents uploaded for this application.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {details.documents.map((doc) => {
                          const isPhoto = doc.mimeType?.startsWith('image/') || doc.documentType === 'CUSTOMER_LIVE_PHOTO';
                          return (
                            <div
                              key={doc.documentId}
                              className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50/60 p-3 hover:bg-neutral-100 transition"
                            >
                              <div className="flex items-center gap-3 overflow-hidden">
                                {isPhoto && doc.fileUrl ? (
                                  <img
                                    src={resolveFileUrl(doc.fileUrl)}
                                    alt={doc.fileName}
                                    className="h-12 w-12 shrink-0 rounded-lg object-cover border border-neutral-200"
                                  />
                                ) : (
                                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-neutral-200 text-neutral-600">
                                    <FileCheck className="h-6 w-6" />
                                  </div>
                                )}
                                <div className="overflow-hidden">
                                  <div className="font-semibold text-xs text-neutral-900 truncate">
                                    {formatLabel(doc.documentType)}
                                  </div>
                                  <div className="text-2xs text-neutral-500 truncate">{doc.fileName}</div>
                                  <div className="text-2xs text-neutral-400">{formatDateOnly(doc.uploadedAt)}</div>
                                </div>
                              </div>
                              <div className="shrink-0 flex items-center gap-1.5">
                                {isPhoto && doc.fileUrl && (
                                  <button
                                    type="button"
                                    onClick={() => setZoomedImage(resolveFileUrl(doc.fileUrl))}
                                    className="rounded-lg p-1.5 text-neutral-600 hover:bg-neutral-200"
                                    title="Zoom"
                                  >
                                    <Maximize2 className="h-4 w-4" />
                                  </button>
                                )}
                                <a
                                  href={resolveFileUrl(doc.fileUrl)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700 shadow-xs"
                                >
                                  Open <ArrowUpRight className="h-3 w-3" />
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-neutral-200 bg-neutral-50 px-6 py-4">
              <div className="text-xs text-neutral-500">
                Please verify all documents thoroughly before granting final credit approval.
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={closeApplicationReview}>
                  Close review
                </Button>
                {details && (
                  <>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={actioningId === selectedApplicationId}
                      onClick={() => handleReject(selectedApplicationId)}
                    >
                      {actioningId === selectedApplicationId ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ThumbsDown className="h-3.5 w-3.5" />
                      )}
                      Reject application
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={actioningId === selectedApplicationId}
                      onClick={() => handleApprove(selectedApplicationId)}
                    >
                      {actioningId === selectedApplicationId ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ThumbsUp className="h-3.5 w-3.5" />
                      )}
                      Approve application
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}



      {/* Image Zoom Modal */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={() => setZoomedImage(null)}
        >
          <div className="relative max-h-[90vh] max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setZoomedImage(null)}
              className="absolute -top-10 right-0 rounded-full bg-white/20 p-2 text-white hover:bg-white/40"
            >
              <X className="h-6 w-6" />
            </button>
            <img
              src={zoomedImage}
              alt="Enlarged Document"
              className="max-h-[85vh] w-auto rounded-2xl object-contain shadow-2xl border border-white/20"
            />
          </div>
        </div>
      )}
    </div>
  );
}
