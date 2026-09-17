import { useEffect, useState } from 'react';
import {
  Gift,
  Plus,
  Search,
  Filter,
  Download,
  Edit2,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Percent,
  Layers,
  LayoutGrid,
  List,
  X,
  Sparkles,
} from 'lucide-react';
import {
  getAdminCampaigns,
  createAdminCampaign,
  updateAdminCampaign,
  toggleAdminCampaignStatus,
  getReferralReports,
  exportReferralReportsCsv,
  getAdminBenefits,
  adjustAdminBenefit,
} from '../../customer/referralApi';

export function ReferralManagementPage() {
  const [activeTab, setActiveTab] = useState('campaigns'); // 'campaigns' | 'reports' | 'benefits'

  // Campaign State
  const [campaigns, setCampaigns] = useState([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [campaignViewMode, setCampaignViewMode] = useState('grid'); // 'grid' | 'table'
  const [campaignQuery, setCampaignQuery] = useState('');
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [campaignForm, setCampaignForm] = useState({
    campaignName: '',
    rewardType: 'PROCESSING_FEE_DISCOUNT',
    discountType: 'PERCENTAGE',
    discountValue: 50,
    maxDiscountLimit: 1000,
    minReferralRequirement: 1,
    applicableLoanNumber: 2,
    validityDays: 90,
    status: 'ACTIVE',
  });

  // Reports State
  const [reports, setReports] = useState({ data: [], total: 0, page: 1, totalPages: 1 });
  const [loadingReports, setLoadingReports] = useState(false);
  const [reportFilters, setReportFilters] = useState({
    customerQuery: '',
    referralCode: '',
    status: '',
    dateFrom: '',
    dateTo: '',
    page: 1,
  });

  // Benefits State
  const [benefits, setBenefits] = useState({ data: [], total: 0, page: 1, totalPages: 1 });
  const [loadingBenefits, setLoadingBenefits] = useState(false);
  const [benefitFilters, setBenefitFilters] = useState({
    customerId: '',
    status: '',
    page: 1,
  });
  const [benefitModalOpen, setBenefitModalOpen] = useState(false);
  const [selectedBenefit, setSelectedBenefit] = useState(null);
  const [benefitForm, setBenefitForm] = useState({
    status: 'AVAILABLE',
    maxDiscountLimit: 1000,
    expiryDate: '',
  });

  // Global Toast Notification
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000);
  };

  // Fetch Campaigns
  const fetchCampaigns = async () => {
    setLoadingCampaigns(true);
    try {
      const res = await getAdminCampaigns();
      setCampaigns(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error('Failed to load campaigns:', err);
      setCampaigns([]);
      showToast('Failed to load campaigns', 'error');
    } finally {
      setLoadingCampaigns(false);
    }
  };

  // Fetch Reports
  const fetchReports = async (page = 1) => {
    setLoadingReports(true);
    try {
      const res = await getReferralReports({ ...reportFilters, page });
      setReports(
        res && typeof res === 'object' && Array.isArray(res.data)
          ? res
          : { data: [], total: 0, page: 1, totalPages: 1 },
      );
    } catch (err) {
      console.error('Failed to load reports:', err);
      setReports({ data: [], total: 0, page: 1, totalPages: 1 });
      showToast('Failed to load referral reports', 'error');
    } finally {
      setLoadingReports(false);
    }
  };

  // Fetch Benefits
  const fetchBenefits = async (page = 1) => {
    setLoadingBenefits(true);
    try {
      const res = await getAdminBenefits({ ...benefitFilters, page });
      setBenefits(
        res && typeof res === 'object' && Array.isArray(res.data)
          ? res
          : { data: [], total: 0, page: 1, totalPages: 1 },
      );
    } catch (err) {
      console.error('Failed to load benefits:', err);
      setBenefits({ data: [], total: 0, page: 1, totalPages: 1 });
      showToast('Failed to load customer benefits', 'error');
    } finally {
      setLoadingBenefits(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'campaigns') fetchCampaigns();
    if (activeTab === 'reports') fetchReports(reportFilters.page);
    if (activeTab === 'benefits') fetchBenefits(benefitFilters.page);
  }, [activeTab]);

  // Campaign Form Submission
  const handleCampaignSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCampaign) {
        await updateAdminCampaign(editingCampaign.id, campaignForm);
        showToast('Campaign updated successfully');
      } else {
        await createAdminCampaign(campaignForm);
        showToast('Campaign created successfully');
      }
      setCampaignModalOpen(false);
      setEditingCampaign(null);
      fetchCampaigns();
    } catch (err) {
      showToast(err?.message || 'Failed to save campaign', 'error');
    }
  };

  const handleToggleStatus = async (campaign) => {
    const newStatus = campaign.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await toggleAdminCampaignStatus(campaign.id, newStatus);
      showToast(`Campaign status updated to ${newStatus}`);
      fetchCampaigns();
    } catch (err) {
      showToast('Failed to update status', 'error');
    }
  };

  const openEditCampaign = (campaign) => {
    setEditingCampaign(campaign);
    setCampaignForm({
      campaignName: campaign.campaignName,
      rewardType: campaign.rewardType,
      discountType: campaign.discountType,
      discountValue: campaign.discountValue,
      maxDiscountLimit: campaign.maxDiscountLimit,
      minReferralRequirement: campaign.minReferralRequirement,
      applicableLoanNumber: campaign.applicableLoanNumber,
      validityDays: campaign.validityDays,
      status: campaign.status,
    });
    setCampaignModalOpen(true);
  };

  // Export CSV
  const handleExportCsv = async () => {
    try {
      const blob = await exportReferralReportsCsv(reportFilters);
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `referral-reports-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      showToast('CSV export generated');
    } catch (err) {
      console.error('Export error:', err);
      showToast('Failed to export CSV', 'error');
    }
  };

  // Benefit Adjustment Submission
  const handleBenefitSubmit = async (e) => {
    e.preventDefault();
    if (!selectedBenefit) return;
    try {
      await adjustAdminBenefit(selectedBenefit.id, benefitForm);
      showToast('Customer benefit adjusted successfully');
      setBenefitModalOpen(false);
      setSelectedBenefit(null);
      fetchBenefits(benefitFilters.page);
    } catch (err) {
      showToast(err?.message || 'Failed to adjust benefit', 'error');
    }
  };

  const openAdjustBenefit = (benefit) => {
    setSelectedBenefit(benefit);
    setBenefitForm({
      status: benefit.status,
      maxDiscountLimit: benefit.maxDiscountLimit,
      expiryDate: benefit.expiryDate ? new Date(benefit.expiryDate).toISOString().split('T')[0] : '',
    });
    setBenefitModalOpen(true);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Toast Notification */}
      {toast.show && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all ${
            toast.type === 'error' ? 'bg-rose-600' : 'bg-emerald-600'
          }`}
        >
          {toast.type === 'error' ? <XCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500/10 text-brand-600">
              <Gift size={20} />
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
              Referral Management
            </h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Configure Refer & Earn campaigns, monitor customer referral reports, and adjust benefits
          </p>
        </div>

        {activeTab === 'campaigns' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchCampaigns}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 cursor-pointer"
              title="Refresh Campaigns"
            >
              <RefreshCw size={15} className={loadingCampaigns ? 'animate-spin text-brand-600' : 'text-slate-500'} /> Refresh
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingCampaign(null);
                setCampaignForm({
                  campaignName: 'Refer & Earn Standard',
                  rewardType: 'PROCESSING_FEE_DISCOUNT',
                  discountType: 'PERCENTAGE',
                  discountValue: 50,
                  maxDiscountLimit: 1000,
                  minReferralRequirement: 1,
                  applicableLoanNumber: 2,
                  validityDays: 90,
                  status: 'ACTIVE',
                });
                setCampaignModalOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-brand-700 cursor-pointer"
            >
              <Plus size={16} /> Create Campaign
            </button>
          </div>
        )}

        {activeTab === 'reports' && (
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 cursor-pointer"
          >
            <Download size={16} /> Export CSV Report
          </button>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('campaigns')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition cursor-pointer ${
            activeTab === 'campaigns'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers size={16} /> Campaign Configuration
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition cursor-pointer ${
            activeTab === 'reports'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <TrendingUp size={16} /> Referral Reports
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('benefits')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition cursor-pointer ${
            activeTab === 'benefits'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Gift size={16} /> Customer Benefits
        </button>
      </div>

      {/* TAB 1: CAMPAIGN CONFIGURATION */}
      {activeTab === 'campaigns' && (
        <div className="space-y-4">
          {/* Campaign Toolbar */}
          {(() => {
            const campaignList = Array.isArray(campaigns) ? campaigns : [];
            const activeCount = campaignList.filter((c) => c?.status === 'ACTIVE').length;

            return (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search size={14} className="absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search campaign name..."
                    value={campaignQuery}
                    onChange={(e) => setCampaignQuery(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 pl-8 pr-3 py-2 text-xs focus:border-brand-500 focus:outline-hidden"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500 mr-1">
                    {activeCount} Active / {campaignList.length} Total
                  </span>

                  <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                    <button
                      type="button"
                      onClick={() => setCampaignViewMode('grid')}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                        campaignViewMode === 'grid' ? 'bg-white text-brand-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                      }`}
                      title="Grid View"
                    >
                      <LayoutGrid size={14} /> Cards
                    </button>
                    <button
                      type="button"
                      onClick={() => setCampaignViewMode('table')}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                        campaignViewMode === 'table' ? 'bg-white text-brand-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                      }`}
                      title="Table View"
                    >
                      <List size={14} /> Table
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {loadingCampaigns ? (
            <div className="flex min-h-[40vh] items-center justify-center">
              <RefreshCw className="h-8 w-8 animate-spin text-brand-600" />
            </div>
          ) : (() => {
            const campaignList = Array.isArray(campaigns) ? campaigns : [];
            const filtered = campaignList.filter((c) =>
              c?.campaignName?.toLowerCase().includes(campaignQuery.toLowerCase()),
            );

            if (filtered.length === 0) {
              return (
                <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center text-slate-500">
                  <Gift className="mx-auto h-12 w-12 text-slate-300 mb-3" />
                  <h3 className="text-base font-bold text-slate-800">No Referral Campaigns Found</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {campaignList.length === 0
                      ? 'Click "Create Campaign" to set up rules for your Refer & Earn program.'
                      : 'No campaigns match your search query.'}
                  </p>
                  <button
                    type="button"
                    onClick={fetchCampaigns}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-brand-600 hover:bg-slate-50 cursor-pointer shadow-2xs"
                  >
                    <RefreshCw size={14} /> Reload Campaigns
                  </button>
                </div>
              );
            }

            if (campaignViewMode === 'table') {
              return (
                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-600">
                      <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-4 py-3.5">Campaign Name</th>
                          <th className="px-4 py-3.5">Discount Rate</th>
                          <th className="px-4 py-3.5">Max Discount Cap</th>
                          <th className="px-4 py-3.5">Applicable Loan</th>
                          <th className="px-4 py-3.5">Validity</th>
                          <th className="px-4 py-3.5">Status</th>
                          <th className="px-4 py-3.5">Created Date</th>
                          <th className="px-4 py-3.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filtered.map((c) => (
                          <tr key={c.id} className="hover:bg-slate-50/80 transition">
                            <td className="px-4 py-3.5 font-bold text-slate-900">{c.campaignName}</td>
                            <td className="px-4 py-3.5 font-bold text-brand-600">
                              {c.discountType === 'PERCENTAGE' ? `${c.discountValue}%` : `₹${c.discountValue}`}
                            </td>
                            <td className="px-4 py-3.5 font-semibold text-slate-800">₹{c.maxDiscountLimit.toLocaleString('en-IN')}</td>
                            <td className="px-4 py-3.5 text-slate-700">{c.applicableLoanNumber}nd Loan Onwards</td>
                            <td className="px-4 py-3.5 text-slate-700">{c.validityDays} Days</td>
                            <td className="px-4 py-3.5">
                              <span
                                className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                  c.status === 'ACTIVE'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                                }`}
                              >
                                {c.status}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-slate-500">{formatDate(c.createdAt)}</td>
                            <td className="px-4 py-3.5 text-right space-x-2">
                              <button
                                type="button"
                                onClick={() => openEditCampaign(c)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                              >
                                <Edit2 size={13} /> Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleStatus(c)}
                                className={`text-xs font-bold underline cursor-pointer ${
                                  c.status === 'ACTIVE' ? 'text-amber-600 hover:text-amber-700' : 'text-emerald-600 hover:text-emerald-700'
                                }`}
                              >
                                {c.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filtered.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:shadow-md flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span
                            className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              c.status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                          >
                            {c.status}
                          </span>
                          <h3 className="mt-1.5 font-bold text-slate-900 text-base">{c.campaignName}</h3>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditCampaign(c)}
                            className="p-1.5 text-slate-400 hover:text-brand-600 rounded-lg hover:bg-slate-50 transition cursor-pointer"
                            title="Edit Campaign"
                          >
                            <Edit2 size={16} />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2 rounded-xl bg-slate-50 p-3.5 text-xs text-slate-600 border border-slate-100">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Reward Type:</span>
                          <span className="font-semibold text-slate-900">Assessment & Processing Fee Waiver</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Discount Rate:</span>
                          <span className="font-bold text-brand-600">
                            {c.discountType === 'PERCENTAGE' ? `${c.discountValue}%` : `₹${c.discountValue}`}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Max Discount Limit:</span>
                          <span className="font-bold text-slate-900">₹{c.maxDiscountLimit.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Applicable Loan:</span>
                          <span className="font-medium text-slate-800">{c.applicableLoanNumber}nd Loan Onwards</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Benefit Validity:</span>
                          <span className="font-medium text-slate-800">{c.validityDays} Days</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">Created: {formatDate(c.createdAt)}</span>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(c)}
                        className={`text-xs font-bold underline cursor-pointer ${
                          c.status === 'ACTIVE' ? 'text-amber-600 hover:text-amber-700' : 'text-emerald-600 hover:text-emerald-700'
                        }`}
                      >
                        {c.status === 'ACTIVE' ? 'Deactivate' : 'Activate Campaign'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* TAB 2: REFERRAL REPORTS */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Search Customer
              </label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Name or Mobile..."
                  value={reportFilters.customerQuery}
                  onChange={(e) => setReportFilters({ ...reportFilters, customerQuery: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 pl-8 pr-3 py-2 text-xs focus:border-brand-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Referral Code
              </label>
              <input
                type="text"
                placeholder="FIN10025..."
                value={reportFilters.referralCode}
                onChange={(e) => setReportFilters({ ...reportFilters, referralCode: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-hidden font-mono uppercase"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Referral Status
              </label>
              <select
                value={reportFilters.status}
                onChange={(e) => setReportFilters({ ...reportFilters, status: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-brand-500 focus:outline-hidden bg-white"
              >
                <option value="">All Statuses</option>
                <option value="PENDING">PENDING</option>
                <option value="QUALIFIED">QUALIFIED</option>
                <option value="EXPIRED">EXPIRED</option>
              </select>
            </div>

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => fetchReports(1)}
                className="w-full rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800 cursor-pointer"
              >
                Apply Filters
              </button>
            </div>
          </div>

          {/* Reports Table */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            {loadingReports ? (
              <div className="flex min-h-[30vh] items-center justify-center">
                <RefreshCw className="h-8 w-8 animate-spin text-brand-600" />
              </div>
            ) : reports.data && reports.data.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3.5">Referrer Customer</th>
                      <th className="px-4 py-3.5">Referral Code</th>
                      <th className="px-4 py-3.5">Referred Customer</th>
                      <th className="px-4 py-3.5">Loan Status</th>
                      <th className="px-4 py-3.5">Benefit Generated</th>
                      <th className="px-4 py-3.5">Benefit Used</th>
                      <th className="px-4 py-3.5">Registered Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reports.data.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/80 transition">
                        <td className="px-4 py-3.5">
                          <p className="font-bold text-slate-900">{r.referrerName}</p>
                          <p className="text-[11px] text-slate-400">{r.referrerMobile}</p>
                        </td>
                        <td className="px-4 py-3.5 font-mono font-bold text-brand-600">{r.referralCode}</td>
                        <td className="px-4 py-3.5">
                          <p className="font-bold text-slate-900">{r.referredName}</p>
                          <p className="text-[11px] text-slate-400">{r.referredMobile}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-[11px] font-bold ${
                              r.loanStatus === 'DISBURSED'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {r.loanStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-slate-800">{r.benefitGenerated}</td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${
                              r.benefitUsed !== 'No'
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {r.benefitUsed}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-500">{formatDate(r.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center text-slate-500">
                <Filter className="mx-auto h-10 w-10 text-slate-300 mb-2" />
                <p className="text-sm font-semibold text-slate-700">No Referral Records Found</p>
              </div>
            )}

            {/* Pagination Controls */}
            {reports.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 bg-slate-50">
                <span className="text-xs text-slate-500">
                  Page {reports.page} of {reports.totalPages} ({reports.total} total)
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={reports.page <= 1}
                    onClick={() => fetchReports(reports.page - 1)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft size={14} /> Previous
                  </button>
                  <button
                    type="button"
                    disabled={reports.page >= reports.totalPages}
                    onClick={() => fetchReports(reports.page + 1)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40 cursor-pointer"
                  >
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: CUSTOMER BENEFITS MANAGEMENT */}
      {activeTab === 'benefits' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <select
                value={benefitFilters.status}
                onChange={(e) => {
                  setBenefitFilters({ ...benefitFilters, status: e.target.value });
                  fetchBenefits(1);
                }}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium focus:border-brand-500 bg-white"
              >
                <option value="">All Benefit Statuses</option>
                <option value="AVAILABLE">AVAILABLE</option>
                <option value="APPLIED">APPLIED</option>
                <option value="USED">USED</option>
                <option value="EXPIRED">EXPIRED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            {loadingBenefits ? (
              <div className="flex min-h-[30vh] items-center justify-center">
                <RefreshCw className="h-8 w-8 animate-spin text-brand-600" />
              </div>
            ) : benefits.data && benefits.data.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3.5">Customer</th>
                      <th className="px-4 py-3.5">Reward Type</th>
                      <th className="px-4 py-3.5">Max Discount Cap</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5">Expiry Date</th>
                      <th className="px-4 py-3.5">Usage History</th>
                      <th className="px-4 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {benefits.data.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/80 transition">
                        <td className="px-4 py-3.5">
                          <p className="font-bold text-slate-900">{b.customerName}</p>
                          <p className="text-[11px] text-slate-400">{b.customerMobile}</p>
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-slate-800">
                          Processing Fee ({b.discountType === 'PERCENTAGE' ? `${b.discountValue}%` : `₹${b.discountValue}`})
                        </td>
                        <td className="px-4 py-3.5 font-bold text-brand-600">₹{b.maxDiscountLimit.toLocaleString('en-IN')}</td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-[11px] font-bold ${
                              b.status === 'AVAILABLE'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : b.status === 'USED'
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600">{formatDate(b.expiryDate)}</td>
                        <td className="px-4 py-3.5">
                          {b.usage ? (
                            <div className="text-[11px] text-slate-500">
                              <span>Saved ₹{b.usage.discountApplied} on LAN</span>
                              <p className="text-[10px] text-slate-400">{formatDate(b.usage.usedAt)}</p>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => openAdjustBenefit(b)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                          >
                            <Edit2 size={13} /> Adjust
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center text-slate-500">
                <Gift className="mx-auto h-10 w-10 text-slate-300 mb-2" />
                <p className="text-sm font-semibold text-slate-700">No Customer Benefits Found</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATE/EDIT CAMPAIGN MODAL */}
      {campaignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">
                {editingCampaign ? 'Edit Referral Campaign' : 'Create Referral Campaign'}
              </h3>
              <button
                type="button"
                onClick={() => setCampaignModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCampaignSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Campaign Name</label>
                <input
                  type="text"
                  required
                  value={campaignForm.campaignName}
                  onChange={(e) => setCampaignForm({ ...campaignForm, campaignName: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-500 focus:outline-hidden"
                  placeholder="Refer & Earn Standard"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Discount Type</label>
                  <select
                    value={campaignForm.discountType}
                    onChange={(e) => setCampaignForm({ ...campaignForm, discountType: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                  >
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FIXED_AMOUNT">Fixed Amount (₹)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Discount Value ({campaignForm.discountType === 'PERCENTAGE' ? '%' : '₹'})
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={campaignForm.discountValue}
                    onChange={(e) => setCampaignForm({ ...campaignForm, discountValue: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Max Discount Limit (₹)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={campaignForm.maxDiscountLimit}
                    onChange={(e) => setCampaignForm({ ...campaignForm, maxDiscountLimit: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Applicable Loan Number</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={campaignForm.applicableLoanNumber}
                    onChange={(e) => setCampaignForm({ ...campaignForm, applicableLoanNumber: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Benefit Validity (Days)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={campaignForm.validityDays}
                    onChange={(e) => setCampaignForm({ ...campaignForm, validityDays: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Status</label>
                  <select
                    value={campaignForm.status}
                    onChange={(e) => setCampaignForm({ ...campaignForm, status: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCampaignModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-brand-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-brand-700 cursor-pointer"
                >
                  Save Campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADJUST BENEFIT MODAL */}
      {benefitModalOpen && selectedBenefit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">Adjust Customer Benefit</h3>
              <button
                type="button"
                onClick={() => setBenefitModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-1 border border-slate-100">
              <p className="font-bold text-slate-900">{selectedBenefit.customerName}</p>
              <p className="text-slate-500">Mobile: {selectedBenefit.customerMobile}</p>
            </div>

            <form onSubmit={handleBenefitSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Status</label>
                <select
                  value={benefitForm.status}
                  onChange={(e) => setBenefitForm({ ...benefitForm, status: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                >
                  <option value="AVAILABLE">AVAILABLE</option>
                  <option value="APPLIED">APPLIED</option>
                  <option value="USED">USED</option>
                  <option value="EXPIRED">EXPIRED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Max Discount Cap (₹)</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={benefitForm.maxDiscountLimit}
                  onChange={(e) => setBenefitForm({ ...benefitForm, maxDiscountLimit: Number(e.target.value) })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Expiry Date</label>
                <input
                  type="date"
                  required
                  value={benefitForm.expiryDate}
                  onChange={(e) => setBenefitForm({ ...benefitForm, expiryDate: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-brand-500 focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setBenefitModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-brand-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-brand-700 cursor-pointer"
                >
                  Save Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReferralManagementPage;
