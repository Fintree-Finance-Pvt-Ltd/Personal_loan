import { useEffect, useState, useMemo } from 'react';
import {
  Megaphone,
  Plus,
  Search,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Shield,
  Key,
  Globe,
  Radio,
  CheckCircle2,
  XCircle,
  TrendingUp,
  BarChart3,
  QrCode,
  Link as LinkIcon,
  Layers,
  Settings,
  Share2,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  Sparkles,
  AlertCircle,
  X,
} from 'lucide-react';
import { marketingPartnersApi } from '../api/marketingPartnersApi';

export function MarketingPartnersPage() {
  const [activeTab, setActiveTab] = useState('partners'); // 'partners' | 'generator' | 'analytics'

  // Partners List State
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [credentialsModal, setCredentialsModal] = useState(null); // stores { partner, secret, isNew }

  // Form State
  const [partnerForm, setPartnerForm] = useState({
    displayName: '',
    clientCode: '',
    authenticationType: 'CAMPAIGN_LINK', // 'CAMPAIGN_LINK' | 'HMAC_SHA256'
    allowedIpAddresses: '',
    webhookUrl: '',
    status: 'ACTIVE',
  });

  // Link Generator State
  const [genPartner, setGenPartner] = useState('');
  const [genCampaign, setGenCampaign] = useState('festive_instant_loan_2026');
  const [genMedium, setGenMedium] = useState('cpc');
  const [genSource, setGenSource] = useState('google');
  const [genContent, setGenContent] = useState('banner_ad_v1');
  const [genTerm, setGenTerm] = useState('instant personal loan');
  const [genLandingPage, setGenLandingPage] = useState('/customer/login');
  const [copiedLink, setCopiedLink] = useState(false);

  // Analytics State
  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  const fetchPartners = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await marketingPartnersApi.listPartners();
      setPartners(Array.isArray(data) ? data : []);
    } catch (err) {
      const status = err?.response?.status;
      const msg =
        status === 401
          ? 'Admin session expired or unauthorized. Please re-login to the admin portal.'
          : err?.response?.data?.error?.message ||
            err?.response?.data?.message ||
            err?.message ||
            'Failed to load marketing partners';
      setError({ message: msg, status });
      setPartners([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    setLoadingAnalytics(true);
    try {
      const data = await marketingPartnersApi.getAttributionAnalytics();
      setAnalytics(data);
    } catch (err) {
      console.error('Failed to load attribution analytics', err);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  useEffect(() => {
    fetchPartners();
  }, []);

  useEffect(() => {
    if (activeTab === 'analytics') {
      fetchAnalytics();
    }
  }, [activeTab]);

  const handleCreatePartner = async (e) => {
    e.preventDefault();
    if (!partnerForm.displayName.trim() || !partnerForm.clientCode.trim()) return;

    setSubmitting(true);
    try {
      const created = await marketingPartnersApi.createPartner(partnerForm);
      setCreateModalOpen(false);
      setPartnerForm({
        displayName: '',
        clientCode: '',
        authenticationType: 'CAMPAIGN_LINK',
        allowedIpAddresses: '',
        webhookUrl: '',
        status: 'ACTIVE',
      });
      await fetchPartners();
      // Show credentials / integration details
      setCredentialsModal({ partner: created, isNew: true });
    } catch (err) {
      alert(err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || 'Failed to register partner');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (partner) => {
    const nextStatus = partner.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await marketingPartnersApi.togglePartnerStatus(partner.id, nextStatus);
      setPartners((prev) =>
        (Array.isArray(prev) ? prev : []).map((p) => (p.id === partner.id ? { ...p, status: nextStatus } : p))
      );
    } catch (err) {
      alert(err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || 'Failed to update partner status');
    }
  };

  const handleRotateSecret = async (partnerId) => {
    if (!window.confirm('Are you sure you want to rotate the HMAC secret? The previous secret will immediately stop working.')) {
      return;
    }
    try {
      const res = await marketingPartnersApi.rotatePartnerSecret(partnerId);
      setCredentialsModal({
        partner: { ...res, displayName: 'Updated Partner' },
        secret: res.newSecret,
        isNew: false,
      });
    } catch (err) {
      alert(err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || 'Failed to rotate secret');
    }
  };

  // Safe partners array
  const safePartners = useMemo(() => (Array.isArray(partners) ? partners : []), [partners]);

  // Filtered partners
  const filteredPartners = useMemo(() => {
    return safePartners.filter((p) => {
      const matchesSearch =
        (p?.displayName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p?.clientCode || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p?.clientId || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || p?.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [safePartners, searchQuery, statusFilter]);

  // Constructed Campaign URL
  const generatedCampaignUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://fintreefinance.com';
    const cleanLanding = genLandingPage.startsWith('/') ? genLandingPage : `/${genLandingPage}`;
    const params = new URLSearchParams();

    if (genSource) params.set('utm_source', genSource);
    if (genMedium) params.set('utm_medium', genMedium);
    if (genCampaign) params.set('utm_campaign', genCampaign);
    if (genPartner) params.set('partner_code', genPartner);
    if (genTerm) params.set('utm_term', genTerm);
    if (genContent) params.set('utm_content', genContent);

    return `${origin}${cleanLanding}?${params.toString()}`;
  }, [genLandingPage, genSource, genMedium, genCampaign, genPartner, genTerm, genContent]);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  const jumpToGeneratorWithPartner = (partner) => {
    setGenPartner(partner.clientCode);
    setGenSource(partner.clientCode.toLowerCase());
    setActiveTab('generator');
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/20 text-brand-400">
              <Megaphone size={20} />
            </span>
            <h1 className="font-display text-2xl font-bold text-white">
              Marketing & Partner Management
            </h1>
          </div>
          <p className="mt-1 text-sm text-neutral-400">
            Onboard marketing agencies, generate trackable UTM campaigns, configure S2S webhooks, and track ROI attribution.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (activeTab === 'analytics') fetchAnalytics();
              else fetchPartners();
            }}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-neutral-300 transition hover:bg-white/10 hover:text-white"
          >
            <RefreshCw size={14} className={loading || loadingAnalytics ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-brand-500/25 transition hover:bg-brand-600"
          >
            <Plus size={16} />
            Register Partner / Agency
          </button>
        </div>
      </div>

      {/* Error alert banner */}
      {error && (
        <div className="flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-300">
          <div className="flex items-center gap-3">
            <AlertCircle size={20} className="shrink-0 text-rose-400" />
            <div>
              <p className="text-sm font-semibold">{error.message || String(error)}</p>
              {error.status === 401 && (
                <p className="mt-0.5 text-xs text-rose-300/80">
                  Please make sure you are logged in with valid Superadmin / Admin credentials.
                </p>
              )}
            </div>
          </div>
          {error.status === 401 ? (
            <a
              href="/admin-master/login"
              className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-rose-600"
            >
              Sign In
            </a>
          ) : (
            <button
              onClick={fetchPartners}
              className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Tabs navigation */}
      <div className="flex border-b border-white/10">
        <button
          onClick={() => setActiveTab('partners')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
            activeTab === 'partners'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-neutral-400 hover:border-white/20 hover:text-white'
          }`}
        >
          <Layers size={16} />
          Marketing Partners & Agencies
          <span className="ml-1.5 rounded-full bg-white/10 px-2 py-0.5 text-xs text-neutral-300">
            {safePartners.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('generator')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
            activeTab === 'generator'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-neutral-400 hover:border-white/20 hover:text-white'
          }`}
        >
          <Share2 size={16} />
          Campaign Link & QR Generator
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
            activeTab === 'analytics'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-neutral-400 hover:border-white/20 hover:text-white'
          }`}
        >
          <BarChart3 size={16} />
          Attribution & Performance Analytics
        </button>
      </div>

      {/* TAB 1: Partners & Agencies List */}
      {activeTab === 'partners' && (
        <div className="space-y-4">
          {/* Quick Metrics */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-neutral-900/60 p-4">
              <p className="text-xs font-medium text-neutral-400">Total Marketing Partners</p>
              <p className="mt-2 text-2xl font-bold text-white">{safePartners.length}</p>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle2 size={12} />
                <span>{safePartners.filter((p) => p.status === 'ACTIVE').length} Active</span>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-neutral-900/60 p-4">
              <p className="text-xs font-medium text-neutral-400">Campaign Link (UTM) Partners</p>
              <p className="mt-2 text-2xl font-bold text-brand-400">
                {safePartners.filter((p) => p.authenticationType === 'CAMPAIGN_LINK').length}
              </p>
              <p className="mt-1 text-xs text-neutral-500">Affiliates & Ad Agencies</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-neutral-900/60 p-4">
              <p className="text-xs font-medium text-neutral-400">Direct S2S API Partners</p>
              <p className="mt-2 text-2xl font-bold text-sky-400">
                {safePartners.filter((p) => p.authenticationType === 'HMAC_SHA256').length}
              </p>
              <p className="mt-1 text-xs text-neutral-500">HMAC-SHA256 Authenticated</p>
            </div>

            <div className="rounded-xl border border-white/10 bg-neutral-900/60 p-4">
              <p className="text-xs font-medium text-neutral-400">Total Tracked Disbursals</p>
              <p className="mt-2 text-2xl font-bold text-emerald-400">
                ₹{safePartners.reduce((sum, p) => sum + (p.metrics?.totalDisbursedAmount || 0), 0).toLocaleString('en-IN')}
              </p>
              <p className="mt-1 text-xs text-neutral-500">Across all partners</p>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-neutral-900/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder="Search by partner name, code, or client ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-white placeholder-neutral-500 outline-none transition focus:border-brand-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-xs font-semibold text-white outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
          </div>

          {/* Partners Table */}
          <div className="overflow-hidden rounded-xl border border-white/10 bg-neutral-900/50">
            {loading ? (
              <div className="flex items-center justify-center p-12 text-sm text-neutral-400">
                <RefreshCw size={18} className="mr-2 animate-spin text-brand-400" />
                Loading partners...
              </div>
            ) : filteredPartners.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <Megaphone size={40} className="text-neutral-600" />
                <p className="mt-3 text-base font-semibold text-white">No marketing partners found</p>
                <p className="mt-1 max-w-sm text-xs text-neutral-400">
                  {searchQuery
                    ? 'No partners match your current search query.'
                    : 'Get started by onboarding your first marketing agency, ad partner, or affiliate.'}
                </p>
                {!searchQuery && (
                  <button
                    onClick={() => setCreateModalOpen(true)}
                    className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-600"
                  >
                    Register First Partner
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-white/10 bg-white/5 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                    <tr>
                      <th className="px-5 py-3.5">Partner / Agency</th>
                      <th className="px-5 py-3.5">Partner Code</th>
                      <th className="px-5 py-3.5">Integration Mode</th>
                      <th className="px-5 py-3.5">Client ID / Webhook</th>
                      <th className="px-5 py-3.5 text-center">Applications</th>
                      <th className="px-5 py-3.5 text-center">Disbursed Volume</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-neutral-300">
                    {filteredPartners.map((partner) => (
                      <tr key={partner.id} className="transition hover:bg-white/[0.02]">
                        <td className="px-5 py-4">
                          <p className="font-semibold text-white">{partner.displayName}</p>
                          <p className="text-[11px] text-neutral-500">
                            Created {new Date(partner.createdAt).toLocaleDateString('en-IN')}
                          </p>
                        </td>

                        <td className="px-5 py-4">
                          <span className="inline-block rounded-md bg-brand-500/10 px-2 py-0.5 font-mono text-xs font-bold text-brand-300">
                            {partner.clientCode}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          {partner.authenticationType === 'HMAC_SHA256' ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-300">
                              <Radio size={11} />
                              Direct S2S API
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/20 bg-purple-500/10 px-2.5 py-0.5 text-xs font-medium text-purple-300">
                              <LinkIcon size={11} />
                              Campaign Link (UTM)
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex flex-col gap-1">
                            <span className="font-mono text-xs text-neutral-400">
                              {partner.clientId}
                            </span>
                            {partner.webhookUrl ? (
                              <span className="truncate text-[11px] text-emerald-400" title={partner.webhookUrl}>
                                Webhook: {partner.webhookUrl}
                              </span>
                            ) : (
                              <span className="text-[11px] text-neutral-600">No Webhook</span>
                            )}
                          </div>
                        </td>

                        <td className="px-5 py-4 text-center font-semibold text-white">
                          {partner.metrics?.totalApplications || 0}
                        </td>

                        <td className="px-5 py-4 text-center">
                          <p className="font-semibold text-emerald-400">
                            ₹{(partner.metrics?.totalDisbursedAmount || 0).toLocaleString('en-IN')}
                          </p>
                          <p className="text-[11px] text-neutral-500">
                            {partner.metrics?.disbursedCount || 0} loans
                          </p>
                        </td>

                        <td className="px-5 py-4">
                          <button
                            onClick={() => handleToggleStatus(partner)}
                            className={`rounded-full px-2.5 py-0.5 text-xs font-bold transition ${
                              partner.status === 'ACTIVE'
                                ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                                : 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25'
                            }`}
                          >
                            {partner.status}
                          </button>
                        </td>

                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => jumpToGeneratorWithPartner(partner)}
                              title="Generate Campaign Link"
                              className="flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-brand-300 transition hover:bg-brand-500/20"
                            >
                              <LinkIcon size={12} />
                              Link
                            </button>

                            <button
                              onClick={() => setCredentialsModal({ partner, isNew: false })}
                              title="View API Credentials"
                              className="rounded border border-white/10 bg-white/5 p-1 text-neutral-400 transition hover:bg-white/10 hover:text-white"
                            >
                              <Key size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Campaign Link & QR Generator */}
      {activeTab === 'generator' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Builder Controls */}
          <div className="space-y-5 rounded-xl border border-white/10 bg-neutral-900/60 p-6 lg:col-span-7">
            <div className="flex items-center gap-2 border-b border-white/10 pb-4">
              <Sparkles size={18} className="text-brand-400" />
              <h2 className="font-display text-lg font-bold text-white">Campaign Link Builder</h2>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-400">
                  Select Partner / Agency
                </label>
                <select
                  value={genPartner}
                  onChange={(e) => {
                    setGenPartner(e.target.value);
                    if (e.target.value) setGenSource(e.target.value.toLowerCase());
                  }}
                  className="w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
                >
                  <option value="">-- Direct / In-House Campaign --</option>
                  {safePartners.map((p) => (
                    <option key={p.id} value={p.clientCode}>
                      {p.displayName} ({p.clientCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-400">
                  Marketing Medium
                </label>
                <select
                  value={genMedium}
                  onChange={(e) => setGenMedium(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
                >
                  <option value="cpc">Google Ads (CPC / PPC)</option>
                  <option value="paid_social">Meta / FB / Instagram Ads</option>
                  <option value="whatsapp">WhatsApp Direct Campaign</option>
                  <option value="sms">SMS Blast</option>
                  <option value="email">Email Newsletter</option>
                  <option value="affiliate">Affiliate Network</option>
                  <option value="influencer">Influencer / Creator</option>
                  <option value="banner">Display / Banner Ad</option>
                  <option value="referral">Referral Drive</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-400">
                  Campaign Name (utm_campaign)
                </label>
                <input
                  type="text"
                  placeholder="e.g. diwali_personal_loan_2026"
                  value={genCampaign}
                  onChange={(e) => setGenCampaign(e.target.value.replace(/\s+/g, '_').toLowerCase())}
                  className="w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-400">
                  Traffic Source (utm_source)
                </label>
                <input
                  type="text"
                  placeholder="e.g. google, meta, adpower"
                  value={genSource}
                  onChange={(e) => setGenSource(e.target.value.toLowerCase())}
                  className="w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-400">
                  Landing Destination
                </label>
                <select
                  value={genLandingPage}
                  onChange={(e) => setGenLandingPage(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
                >
                  <option value="/customer/login">Customer Login / Start Journey (/customer/login)</option>
                  <option value="/">Home Page (/)</option>
                  <option value="/customer/dashboard">Dashboard (/customer/dashboard)</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-400">
                  Ad Content / Creative (utm_content)
                </label>
                <input
                  type="text"
                  placeholder="e.g. ad_variant_blue_50k"
                  value={genContent}
                  onChange={(e) => setGenContent(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutral-400">
                Keyword Term (utm_term - Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. instant loan for salaried"
                value={genTerm}
                onChange={(e) => setGenTerm(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
              />
            </div>
          </div>

          {/* Generated URL & QR Preview */}
          <div className="space-y-5 rounded-xl border border-white/10 bg-neutral-900/60 p-6 lg:col-span-5">
            <h2 className="font-display text-lg font-bold text-white">Generated Campaign Link</h2>

            <div className="rounded-lg border border-white/10 bg-neutral-950 p-4">
              <p className="break-all font-mono text-xs text-brand-300">{generatedCampaignUrl}</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => copyToClipboard(generatedCampaignUrl)}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-500 py-2.5 text-xs font-bold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600"
              >
                {copiedLink ? <Check size={16} /> : <Copy size={16} />}
                {copiedLink ? 'Copied to Clipboard!' : 'Copy Campaign Link'}
              </button>

              <a
                href={generatedCampaignUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/10"
              >
                <ExternalLink size={14} />
                Test
              </a>
            </div>

            {/* Visual QR Code Display */}
            <div className="mt-4 flex flex-col items-center rounded-xl border border-white/10 bg-white/5 p-6 text-center">
              <div className="rounded-lg bg-white p-3 shadow-md">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
                    generatedCampaignUrl
                  )}`}
                  alt="Campaign QR Code"
                  className="h-36 w-36"
                />
              </div>
              <p className="mt-3 text-xs font-semibold text-white">Ready-to-Scan Campaign QR</p>
              <p className="mt-1 text-[11px] text-neutral-400">
                Ideal for print banners, pamphlets, WhatsApp status, or standees.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Attribution & Performance Analytics */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {loadingAnalytics ? (
            <div className="flex items-center justify-center p-12 text-sm text-neutral-400">
              <RefreshCw size={18} className="mr-2 animate-spin text-brand-400" />
              Loading analytics...
            </div>
          ) : !analytics ? (
            <div className="rounded-xl border border-white/10 bg-neutral-900/60 p-8 text-center text-neutral-400">
              No analytics data currently available.
            </div>
          ) : (
            <>
              {/* Summary KPIs */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-xl border border-white/10 bg-neutral-900/60 p-4">
                  <p className="text-xs font-medium text-neutral-400">Attributed Applications</p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    {analytics.summary.totalTrackedApplications}
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-neutral-900/60 p-4">
                  <p className="text-xs font-medium text-neutral-400">Approved Loans</p>
                  <p className="mt-2 text-2xl font-bold text-brand-400">
                    {analytics.summary.totalApprovedCount}
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-neutral-900/60 p-4">
                  <p className="text-xs font-medium text-neutral-400">Disbursed Loans</p>
                  <p className="mt-2 text-2xl font-bold text-emerald-400">
                    {analytics.summary.totalDisbursedCount}
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-neutral-900/60 p-4">
                  <p className="text-xs font-medium text-neutral-400">Total Disbursed Volume</p>
                  <p className="mt-2 text-2xl font-bold text-emerald-400">
                    ₹{analytics.summary.totalDisbursedVolume.toLocaleString('en-IN')}
                  </p>
                </div>

                <div className="rounded-xl border border-white/10 bg-neutral-900/60 p-4">
                  <p className="text-xs font-medium text-neutral-400">Disbursal Conversion</p>
                  <p className="mt-2 text-2xl font-bold text-amber-400">
                    {analytics.summary.conversionRate}%
                  </p>
                </div>
              </div>

              {/* By Campaign Table */}
              <div className="rounded-xl border border-white/10 bg-neutral-900/60 p-5">
                <h3 className="mb-4 font-display text-base font-bold text-white">
                  Performance by Marketing Campaign (utm_campaign)
                </h3>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-white/10 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                      <tr>
                        <th className="pb-3">Campaign Name</th>
                        <th className="pb-3">Source Channel</th>
                        <th className="pb-3 text-center">Applications</th>
                        <th className="pb-3 text-center">Approved</th>
                        <th className="pb-3 text-center">Disbursed</th>
                        <th className="pb-3 text-right">Disbursed Volume</th>
                        <th className="pb-3 text-right">Conv. %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-neutral-300">
                      {analytics.byCampaign.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-xs text-neutral-500">
                            No campaign attribution recorded yet.
                          </td>
                        </tr>
                      ) : (
                        analytics.byCampaign.map((item, idx) => {
                          const rate =
                            item.applications > 0
                              ? ((item.disbursed / item.applications) * 100).toFixed(1)
                              : '0.0';
                          return (
                            <tr key={idx} className="transition hover:bg-white/[0.02]">
                              <td className="py-3 font-semibold text-white">{item.campaign}</td>
                              <td className="py-3">
                                <span className="rounded bg-white/5 px-2 py-0.5 text-xs font-mono text-neutral-400">
                                  {item.source}
                                </span>
                              </td>
                              <td className="py-3 text-center">{item.applications}</td>
                              <td className="py-3 text-center text-brand-300">{item.approved}</td>
                              <td className="py-3 text-center font-bold text-emerald-400">
                                {item.disbursed}
                              </td>
                              <td className="py-3 text-right font-semibold text-emerald-400">
                                ₹{item.disbursedAmount.toLocaleString('en-IN')}
                              </td>
                              <td className="py-3 text-right font-bold text-amber-400">{rate}%</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* By Channel Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {analytics.bySource.map((source, idx) => (
                  <div key={idx} className="rounded-xl border border-white/10 bg-neutral-900/50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-display text-sm font-bold text-white">{source.source}</span>
                      <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-xs font-bold text-brand-400">
                        {source.count} Leads
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-neutral-400">
                      <span>Disbursals: {source.disbursed}</span>
                      <span className="font-semibold text-emerald-400">
                        ₹{source.disbursedAmount.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* MODAL 1: Register New Partner Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2">
                <Megaphone size={18} className="text-brand-400" />
                <h3 className="font-display text-lg font-bold text-white">
                  Register Marketing Partner / Agency
                </h3>
              </div>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-neutral-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreatePartner} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-300">
                  Partner / Agency Display Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. GrowthX Media, AdPower Ads, DSA Mumbai"
                  value={partnerForm.displayName}
                  onChange={(e) => setPartnerForm({ ...partnerForm, displayName: e.target.value })}
                  className="w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-neutral-300">
                  Partner Code / Identifier * (Used in URLs: ?partner_code=...)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. GROWTHX, ADPOWER, DSA_MUMBAI"
                  value={partnerForm.clientCode}
                  onChange={(e) =>
                    setPartnerForm({
                      ...partnerForm,
                      clientCode: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '_'),
                    })
                  }
                  className="w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 font-mono text-sm text-white outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-neutral-300">
                  Integration Mode
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setPartnerForm({ ...partnerForm, authenticationType: 'CAMPAIGN_LINK' })
                    }
                    className={`rounded-lg border p-3 text-left transition ${
                      partnerForm.authenticationType === 'CAMPAIGN_LINK'
                        ? 'border-brand-500 bg-brand-500/10'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <p className="text-xs font-bold text-white">Campaign Link (UTM)</p>
                    <p className="mt-0.5 text-[11px] text-neutral-400">
                      Redirects borrowers via link & tracks attribution.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setPartnerForm({ ...partnerForm, authenticationType: 'HMAC_SHA256' })
                    }
                    className={`rounded-lg border p-3 text-left transition ${
                      partnerForm.authenticationType === 'HMAC_SHA256'
                        ? 'border-brand-500 bg-brand-500/10'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <p className="text-xs font-bold text-white">Direct S2S API</p>
                    <p className="mt-0.5 text-[11px] text-neutral-400">
                      Pushes leads via REST API with HMAC SHA-256.
                    </p>
                  </button>
                </div>
              </div>

              {partnerForm.authenticationType === 'HMAC_SHA256' && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-neutral-300">
                      Webhook Callback URL (Optional)
                    </label>
                    <input
                      type="url"
                      placeholder="https://agency.com/api/webhooks/fintree-loan"
                      value={partnerForm.webhookUrl}
                      onChange={(e) =>
                        setPartnerForm({ ...partnerForm, webhookUrl: e.target.value })
                      }
                      className="w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
                    />
                    <p className="mt-1 text-[11px] text-neutral-500">
                      Your LOS will send postbacks on PRE_APPROVED, FINAL_APPROVED, and DISBURSED events.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-neutral-300">
                      Allowed IP Addresses (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="Comma-separated IPv4 (e.g. 103.21.244.0, 192.168.1.1)"
                      value={partnerForm.allowedIpAddresses}
                      onChange={(e) =>
                        setPartnerForm({ ...partnerForm, allowedIpAddresses: e.target.value })
                      }
                      className="w-full rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 text-sm text-white outline-none focus:border-brand-500"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-neutral-300 hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-brand-500/25 transition hover:bg-brand-600 disabled:opacity-50"
                >
                  {submitting && <RefreshCw size={14} className="animate-spin" />}
                  Register & Generate Keys
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Credentials & Success Modal */}
      {credentialsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2">
                <Key size={18} className="text-emerald-400" />
                <h3 className="font-display text-lg font-bold text-white">
                  {credentialsModal.isNew ? 'Partner Registered Successfully' : 'Partner Credentials'}
                </h3>
              </div>
              <button
                onClick={() => setCredentialsModal(null)}
                className="text-neutral-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-neutral-400">Partner Code</label>
                <div className="mt-1 flex items-center justify-between rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 font-mono text-xs text-white">
                  <span>{credentialsModal.partner.clientCode}</span>
                  <button
                    onClick={() => copyToClipboard(credentialsModal.partner.clientCode)}
                    className="text-brand-400 hover:text-brand-300"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-400">Client ID (x-client-id)</label>
                <div className="mt-1 flex items-center justify-between rounded-lg border border-white/10 bg-neutral-800 px-3 py-2 font-mono text-xs text-white">
                  <span>{credentialsModal.partner.clientId}</span>
                  <button
                    onClick={() => copyToClipboard(credentialsModal.partner.clientId)}
                    className="text-brand-400 hover:text-brand-300"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>

              {credentialsModal.partner.secret && (
                <div>
                  <label className="text-xs font-medium text-amber-400">
                    HMAC Secret Key (Copy now - will not be displayed again)
                  </label>
                  <div className="mt-1 flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 font-mono text-xs text-amber-300">
                    <span className="truncate pr-2">{credentialsModal.partner.secret}</span>
                    <button
                      onClick={() => copyToClipboard(credentialsModal.partner.secret)}
                      className="shrink-0 text-amber-400 hover:text-amber-300"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
              )}

              {/* Sample Quick Link */}
              <div>
                <label className="text-xs font-medium text-neutral-400">Default Campaign Link</label>
                <div className="mt-1 flex items-center justify-between rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 font-mono text-[11px] text-brand-300">
                  <span className="truncate pr-2">
                    {`${window.location.origin}/customer/login?partner_code=${credentialsModal.partner.clientCode}&utm_source=${credentialsModal.partner.clientCode.toLowerCase()}&utm_medium=cpc&utm_campaign=launch_campaign`}
                  </span>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `${window.location.origin}/customer/login?partner_code=${credentialsModal.partner.clientCode}&utm_source=${credentialsModal.partner.clientCode.toLowerCase()}&utm_medium=cpc&utm_campaign=launch_campaign`
                      )
                    }
                    className="shrink-0 text-brand-400 hover:text-brand-300"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>

              {!credentialsModal.isNew && (
                <div className="pt-2">
                  <button
                    onClick={() => handleRotateSecret(credentialsModal.partner.id)}
                    className="text-xs font-bold text-rose-400 hover:underline"
                  >
                    Rotate HMAC Secret Key
                  </button>
                </div>
              )}

              <div className="flex justify-end pt-3">
                <button
                  onClick={() => setCredentialsModal(null)}
                  className="rounded-lg bg-brand-500 px-5 py-2 text-xs font-bold text-white transition hover:bg-brand-600"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default MarketingPartnersPage;
