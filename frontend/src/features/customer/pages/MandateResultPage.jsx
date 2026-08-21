import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LoaderCircle, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { refreshMandateStatus } from '../postApprovalApi';

function getCustomerSession() {
  try {
    return JSON.parse(localStorage.getItem('customerSession') || 'null');
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
      } catch {
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
      <div className="mx-auto max-w-md w-full rounded-3xl border border-neutral-200 bg-white p-8 text-center shadow-xl">
        {statusState === 'CONFIRMING' && (
          <div>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-info-50 text-info-600 ring-8 ring-info-50/50">
              <LoaderCircle size={36} className="animate-spin text-info-600" />
            </div>
            <h3 className="mt-5 text-xl font-extrabold text-neutral-900">Verifying Mandate Status</h3>
            <p className="mt-2 text-sm text-neutral-500">{message}</p>
          </div>
        )}

        {statusState === 'SUCCESS' && (
          <div>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand-100 text-brand-600 ring-8 ring-brand-50">
              <CheckCircle2 size={36} />
            </div>
            <h3 className="mt-5 text-xl font-extrabold text-neutral-900">Mandate Authorized!</h3>
            <p className="mt-2 text-sm text-brand-700 font-medium">{message}</p>
          </div>
        )}

        {(statusState === 'FAILED' || statusState === 'PENDING') && (
          <div>
            <div className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${statusState === 'FAILED' ? 'bg-danger-100 text-danger-600 ring-8 ring-danger-50' : 'bg-caution-100 text-caution-600 ring-8 ring-caution-50'}`}>
              <AlertCircle size={36} />
            </div>
            <h3 className="mt-5 text-xl font-extrabold text-neutral-900">
              {statusState === 'FAILED' ? 'Mandate Not Authorized' : 'Verification In Progress'}
            </h3>
            <p className="mt-2 text-sm text-neutral-600">{message}</p>
            <button
              type="button"
              onClick={handleReturn}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-bold text-white shadow hover:bg-brand-700 transition cursor-pointer"
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
