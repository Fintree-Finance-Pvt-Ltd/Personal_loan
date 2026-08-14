import { useEffect, useState } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { PageHeader, Spinner, Alert, Button } from '../../../components/ui';
import { productsApi } from '../api/products.api';
import { apiError } from '../../../lib/api';
import { ProductStatusBadge, ProductVersionStatusBadge } from '../components/ProductStatusBadge';
import { ProductSimulationPanel } from '../components/ProductSimulationPanel';
import { PermissionGate } from '../../../components/ProtectedRoute';

export function ProductDetailsPage() {
  const { productId } = useParams();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [successMsg, setSuccessMsg] = useState(location.state?.message || '');

  const loadData = () => {
    setLoading(true);
    productsApi.getProduct(productId)
      .then(setData)
      .catch(err => setError(apiError(err, 'Failed to load product.')))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [productId]);
  useEffect(() => { if (data) document.title = `${data.name} — Admin Panel`; }, [data]);

  const handleAction = async (action, versionId, payload = null) => {
    if (!window.confirm(`Are you sure you want to ${action} this version?`)) return;
    setBusy(true); setSuccessMsg(''); setError('');
    try {
      if (action === 'submit') await productsApi.submitVersion(versionId);
      if (action === 'approve') await productsApi.approveVersion(versionId);
      if (action === 'reject') await productsApi.rejectVersion(versionId, payload);
      if (action === 'activate') await productsApi.activateVersion(versionId);
      if (action === 'create-next') {
        const next = await productsApi.createNextVersion(productId);
        setSuccessMsg(`Created draft version ${next.versionNumber}`);
      } else {
        setSuccessMsg(`Version ${action}ed successfully.`);
      }
      loadData();
    } catch (err) {
      setError(apiError(err, `Failed to ${action} version.`));
    } finally {
      setBusy(false);
    }
  };

  const handleProductStatus = async (newStatus) => {
    if (!window.confirm(`Are you sure you want to mark this product as ${newStatus}?`)) return;
    setBusy(true); setSuccessMsg(''); setError('');
    try {
      await productsApi.updateProductStatus(productId, newStatus);
      setSuccessMsg(`Product marked as ${newStatus}.`);
      loadData();
    } catch (err) {
      setError(apiError(err, `Failed to update product status.`));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><Spinner label="Loading product details" /></div>;
  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.name}
        description={`Code: ${data.code} | Lender: ${data.lender.displayName}`}
        actions={
          <div className="flex items-center gap-3">
            <PermissionGate permission="PRODUCT_UPDATE">
              {data.operationalStatus === 'INACTIVE' ? (
                <Button variant="secondary" onClick={() => handleProductStatus('ACTIVE')} disabled={busy}>
                  Activate Product
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => handleProductStatus('INACTIVE')} disabled={busy}>
                  Deactivate Product
                </Button>
              )}
            </PermissionGate>
            <PermissionGate permission="PRODUCT_VERSION_CREATE">
              <Button disabled={busy || data.versions.some(v => v.status === 'DRAFT' || v.status === 'SUBMITTED')} onClick={() => handleAction('create-next')}>
                + New Version
              </Button>
            </PermissionGate>
          </div>
        }
      />

      {successMsg && <Alert variant="success" className="mb-4">{successMsg}</Alert>}
      {error && <Alert className="mb-4">{error}</Alert>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-medium text-slate-900 mb-4">Product Details</h3>
          <dl className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-4"><dt className="text-slate-500 font-medium">Status</dt><dd className="col-span-2"><ProductStatusBadge status={data.operationalStatus} /></dd></div>
            <div className="grid grid-cols-3 gap-4"><dt className="text-slate-500 font-medium">Name</dt><dd className="col-span-2 text-slate-900">{data.name}</dd></div>
            <div className="grid grid-cols-3 gap-4"><dt className="text-slate-500 font-medium">Code</dt><dd className="col-span-2 text-slate-900 font-mono">{data.code}</dd></div>
            <div className="grid grid-cols-3 gap-4"><dt className="text-slate-500 font-medium">Description</dt><dd className="col-span-2 text-slate-900">{data.description || '-'}</dd></div>
            <div className="grid grid-cols-3 gap-4"><dt className="text-slate-500 font-medium">Created By</dt><dd className="col-span-2 text-slate-900">{data.createdBy.name}</dd></div>
            {data.platformProduct && (
              <div className="grid grid-cols-3 gap-4 mt-2 pt-2 border-t border-slate-100">
                <dt className="text-slate-500 font-medium text-xs uppercase tracking-wider">Platform Product</dt>
                <dd className="col-span-2">
                  <div className="inline-flex items-center gap-1.5 rounded bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                    <span>{data.platformProduct.name}</span>
                    <span className="text-brand-600/60 opacity-80">({data.platformProduct.code})</span>
                  </div>
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-medium text-slate-900 mb-4">Lender Identity</h3>
          <dl className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-4"><dt className="text-slate-500 font-medium">Display Name</dt><dd className="col-span-2 text-slate-900">{data.lender.displayName}</dd></div>
            <div className="grid grid-cols-3 gap-4"><dt className="text-slate-500 font-medium">Legal Name</dt><dd className="col-span-2 text-slate-900">{data.lender.legalName}</dd></div>
            <div className="grid grid-cols-3 gap-4"><dt className="text-slate-500 font-medium">Code</dt><dd className="col-span-2 text-slate-900 font-mono">{data.lender.code}</dd></div>
          </dl>
        </div>
      </div>

      <h3 className="text-lg font-medium text-slate-900 mt-8 mb-4">Versions</h3>
      
      <div className="space-y-6">
        {data.versions.map(version => (
          <div key={version.id} className={`rounded-2xl border ${version.status === 'ACTIVE' ? 'border-brand-300 ring-1 ring-brand-300' : 'border-slate-200'} bg-white p-6 shadow-sm`}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <h4 className="text-lg font-bold text-slate-900">v{version.versionNumber}</h4>
                <ProductVersionStatusBadge status={version.status} />
              </div>
              <div className="flex items-center gap-2">
                <PermissionGate permission="PRODUCT_UPDATE">
                  {(version.status === 'DRAFT' || version.status === 'REJECTED') && (
                    <Button as={Link} to={`/admin-master/products/${productId}/versions/${version.id}/edit`} variant="secondary" size="sm">Edit</Button>
                  )}
                </PermissionGate>
                <PermissionGate permission="PRODUCT_SUBMIT">
                  {version.status === 'DRAFT' && <Button size="sm" onClick={() => handleAction('submit', version.id)} disabled={busy}>Submit</Button>}
                </PermissionGate>
                <PermissionGate permission="PRODUCT_APPROVE">
                  {version.status === 'SUBMITTED' && <Button size="sm" onClick={() => handleAction('approve', version.id)} disabled={busy}>Approve</Button>}
                </PermissionGate>
                <PermissionGate permission="PRODUCT_REJECT">
                  {version.status === 'SUBMITTED' && (
                    <Button size="sm" variant="danger" onClick={() => {
                      const reason = window.prompt("Enter rejection reason:");
                      if (reason) handleAction('reject', version.id, { reason });
                    }} disabled={busy}>Reject</Button>
                  )}
                </PermissionGate>
                <PermissionGate permission="PRODUCT_ACTIVATE">
                  {version.status === 'APPROVED' && <Button size="sm" onClick={() => handleAction('activate', version.id)} disabled={busy}>Activate</Button>}
                </PermissionGate>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">Min Amount</dt><dd className="font-mono text-slate-900">{version.minimumAmount}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">First Base Amount</dt><dd className="font-mono text-slate-900">{version.firstLoanBaseAmount}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Max Cap</dt><dd className="font-mono text-slate-900">{version.maximumAmountCap}</dd></div>
              </dl>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">Tier Scope</dt><dd className="text-slate-900">{version.repeatTierScope}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Rounding</dt><dd className="text-slate-900">{version.roundingMethod} {version.roundingUnit ? `(${version.roundingUnit})` : ''}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Effective From</dt><dd className="text-slate-900">{version.effectiveFrom ? new Date(version.effectiveFrom).toLocaleString() : 'Immediate'}</dd></div>
              </dl>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">Interest Calculation</dt><dd className="text-slate-900">{version.interestMethod}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Annual ROI (%)</dt><dd className="font-mono text-slate-900">{version.annualRoiPercent}%</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">EMI Due Day</dt><dd className="text-slate-900">{version.emiDueDay}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Supported Tenures</dt><dd className="text-slate-900">{version.tenures.map(t => t.tenure).join(', ')} {version.tenureType === 'DAYS' ? 'days' : 'months'}</dd></div>
              </dl>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">Processing Fee</dt><dd className="text-slate-900">{version.processingFeePercent}% + {version.processingFeeGstPercent}% GST</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Assessment Fee</dt><dd className="text-slate-900">{version.assessmentFeeAmount} + {version.assessmentFeeGstPercent}% GST</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Penal Charge</dt><dd className="text-slate-900">{version.penalChargeAmount}/day</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Bounce Charge</dt><dd className="text-slate-900">{version.bounceChargeAmount}</dd></div>
              </dl>
            </div>

            <div className="mt-6">
              <h5 className="text-sm font-medium text-slate-700 mb-2">Offer Multipliers</h5>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border border-slate-200">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2">Min Completed Loans</th>
                      <th className="px-3 py-2">Multiplier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {version.multipliers.map(m => (
                      <tr key={m.id}>
                        <td className="px-3 py-2">{m.minimumCompletedLoans}</td>
                        <td className="px-3 py-2 font-mono">{m.multiplier}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <PermissionGate permission="PRODUCT_READ">
              <ProductSimulationPanel versionId={version.id} tenures={version.tenures} tenureType={version.tenureType} />
            </PermissionGate>

            {version.rejectionReason && (
              <div className="mt-4 p-3 bg-red-50 text-red-700 rounded border border-red-100 text-sm">
                <strong>Rejection Reason:</strong> {version.rejectionReason}
              </div>
            )}
            
            <div className="mt-4 text-xs text-slate-500 flex flex-wrap gap-4">
              <span>Created by: {version.createdBy.name}</span>
              {version.submittedBy && <span>Submitted by: {version.submittedBy.name}</span>}
              {version.approvedBy && <span>Approved by: {version.approvedBy.name}</span>}
              {version.rejectedBy && <span>Rejected by: {version.rejectedBy.name}</span>}
              {version.activatedBy && <span>Activated by: {version.activatedBy.name}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
