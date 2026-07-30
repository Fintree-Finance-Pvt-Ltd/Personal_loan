import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LoaderCircle, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { refreshMandateStatus, getMandateStatus } from '../postApprovalApi';

function getCustomerSession() {
  try {
    return JSON.parse(sessionStorage.getItem('customerSession') || 'null');
  } catch {
    return null;
  }
}

export default function MandateResultPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [statusState, setStatusState] = useState('CONFIRMING');
  const [message, setMessage] = useState('Confirming your e-Mandate authorization status with bank...');
  const [lan, setLan] = useState('');

  useEffect(() => {
    const session = getCustomerSession();
    const activeLan = searchParams.get('lan') || searchParams.get('udf1') || session?.activeLan;

    if (!activeLan) {
      // Try resolving LAN from session
      if (!session?.customerId) {
        navigate('/customer/login', { replace: true });
        return;
      }
    }

    setLan(activeLan || '');

    let pollCount = 0;
    const maxPolls = 10;

    const checkStatus = async () => {
      if (!activeLan) return;
      pollCount++;
      try {
        const res = await refreshMandateStatus(activeLan);
        const st = String(res?.status || res?.data?.status || '').toUpperCase();

        if (st === 'AUTHORIZED' || st === 'COMPLETED' || res?.completed) {
          setStatusState('SUCCESS');
          setMessage('e-Mandate Authorization Confirmed! Redirecting to loan agreement...');
          setTimeout(() => {
            navigate(`/customer/loan/${encodeURIComponent(activeLan)}/post-approval`, { replace: true });
          }, 2000);
        } else if (['FAILED', 'REJECTED', 'CANCELLED', 'USER_CANCELLED', 'EXPIRED'].includes(st)) {
          setStatusState('FAILED');
          setMessage(res?.failureReason || 'Mandate authorization was not completed. Please try again.');
        } else {
          if (pollCount < maxPolls) {
            setTimeout(checkStatus, 3000);
          } else {
            setStatusState('PENDING');
            setMessage('Mandate status verification in progress. Return to your journey to check status.');
          }
        }
      } catch (err) {
        if (pollCount < maxPolls) {
          setTimeout(checkStatus, 3000);
        } else {
          setStatusState('PENDING');
          setMessage('Checking mandate status with bank...');
        }
      }
    };

    checkStatus();
  }, [searchParams, navigate]);

  const handleReturn = () => {
    if (lan) {
      navigate(`/customer/loan/${encodeURIComponent(lan)}/post-approval`, { replace: true });
    } else {
      navigate('/customer/dashboard', { replace: true });
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4">
      <div className="mx-auto max-w-md w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">
        {statusState === 'CONFIRMING' && (
          <div>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-blue-50 text-blue-600 ring-8 ring-blue-50/50">
              <LoaderCircle size={36} className="animate-spin text-blue-600" />
            </div>
            <h3 className="mt-5 text-xl font-extrabold text-slate-900">Verifying Mandate Status</h3>
            <p className="mt-2 text-sm text-slate-500">{message}</p>
          </div>
        )}

        {statusState === 'SUCCESS' && (
          <div>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-600 ring-8 ring-emerald-50">
              <CheckCircle2 size={36} />
            </div>
            <h3 className="mt-5 text-xl font-extrabold text-slate-900">Mandate Authorized!</h3>
            <p className="mt-2 text-sm text-emerald-700 font-medium">{message}</p>
          </div>
        )}

        {(statusState === 'FAILED' || statusState === 'PENDING') && (
          <div>
            <div className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${statusState === 'FAILED' ? 'bg-red-100 text-red-600 ring-8 ring-red-50' : 'bg-amber-100 text-amber-600 ring-8 ring-amber-50'}`}>
              <AlertCircle size={36} />
            </div>
            <h3 className="mt-5 text-xl font-extrabold text-slate-900">
              {statusState === 'FAILED' ? 'Mandate Not Authorized' : 'Verification In Progress'}
            </h3>
            <p className="mt-2 text-sm text-slate-600">{message}</p>
            <button
              type="button"
              onClick={handleReturn}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow hover:bg-emerald-700 transition cursor-pointer"
            >
              <span>Return to Loan Journey</span>
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
