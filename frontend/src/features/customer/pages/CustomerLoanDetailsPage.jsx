import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  History,
  Landmark,
  Layers,
  Lock,
  PieChart,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import {
  confirmRepayment,
  getCustomerLoanDetails,
  initiateRepaymentPayment,
} from '../postApprovalApi';
import { getCustomerMe } from '../customerApi';
import { loadEasebuzzCheckout } from '../utils/loadEasebuzzCheckout';

export function CustomerLoanDetailsPage() {
  const { lan: paramLan } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [lan, setLan] = useState(
    paramLan ||
    location.state?.lan ||
    '',
  );

  const [details, setDetails] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [
    isRefreshing,
    setIsRefreshing,
  ] = useState(false);

  const [
    pollCount,
    setPollCount,
  ] = useState(0);

  const [
    selectedInst,
    setSelectedInst,
  ] = useState(null);

  const [
    isPayModalOpen,
    setIsPayModalOpen,
  ] = useState(false);

  const [
    isProcessingPayment,
    setIsProcessingPayment,
  ] = useState(false);

  const [
    paymentSuccessMsg,
    setPaymentSuccessMsg,
  ] = useState('');

  const [
    paymentErrorMsg,
    setPaymentErrorMsg,
  ] = useState('');

  const timerRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    const resolveLan = async () => {
      if (paramLan) {
        setLan(paramLan);
      } else if (
        location.state?.lan
      ) {
        setLan(
          location.state.lan,
        );
      } else {
        try {
          const me =
            await getCustomerMe();

          if (
            isMounted &&
            me?.latestLan
          ) {
            setLan(me.latestLan);
          } else if (
            isMounted
          ) {
            setLoading(false);

            setError(
              'No active loan found for this account.',
            );
          }
        } catch (_err) {
          if (isMounted) {
            setLoading(false);

            setError(
              'Failed to load active loan account.',
            );
          }
        }
      }
    };

    resolveLan();

    return () => {
      isMounted = false;
    };
  }, [
    paramLan,
    location.state,
  ]);

  const fetchDetails =
    useCallback(
      async (
        isManual = false,
      ) => {
        if (!lan) {
          return;
        }

        if (isManual) {
          setIsRefreshing(true);
        }

        try {
          const data =
            await getCustomerLoanDetails(
              lan,
            );

          setDetails(data);
          setError('');
        } catch (err) {
          console.error(
            'Failed to load loan details:',
            err,
          );

          setError(
            err?.message ||
            'Failed to load loan details.',
          );
        } finally {
          setLoading(false);

          if (isManual) {
            setIsRefreshing(
              false,
            );
          }
        }
      },
      [lan],
    );

  useEffect(() => {
    if (lan) {
      fetchDetails();
    }
  }, [lan, fetchDetails]);

  useEffect(() => {
    const disbursalStatus =
      details?.disbursal
        ?.status ||
      details?.loan?.status;

    const isPending =
      disbursalStatus ===
      'DISBURSAL_REQUESTED' ||
      disbursalStatus ===
      'DISBURSAL_PROCESSING' ||
      disbursalStatus ===
      'READY_FOR_DISBURSAL';

    if (
      isPending &&
      pollCount < 36
    ) {
      timerRef.current =
        setTimeout(async () => {
          setPollCount(
            (prev) =>
              prev + 1,
          );

          await fetchDetails();
        }, 5000);
    } else if (
      timerRef.current
    ) {
      clearTimeout(
        timerRef.current,
      );
    }

    return () => {
      if (
        timerRef.current
      ) {
        clearTimeout(
          timerRef.current,
        );
      }
    };
  }, [
    details,
    pollCount,
    fetchDetails,
  ]);

  const handleOpenPayModal = (
    inst,
  ) => {
    setSelectedInst(inst);
    setPaymentSuccessMsg('');
    setPaymentErrorMsg('');
    setIsPayModalOpen(true);
  };

  const handleExecutePayment =
    async () => {
      if (!selectedInst) {
        return;
      }

      setIsProcessingPayment(
        true,
      );

      setPaymentErrorMsg('');
      setPaymentSuccessMsg('');

      try {
        const initData =
          await initiateRepaymentPayment(
            lan,
            {
              installmentNumber:
                selectedInst.installmentNumber,

              amount:
                selectedInst.remainingAmount,
            },
          );

        if (
          !initData?.accessKey
        ) {
          throw new Error(
            'Failed to obtain Easebuzz payment access key from server.',
          );
        }

        const {
          accessKey,
          merchantKey,
          env,
          txnid,
        } = initData;

        const EasebuzzCheckout =
          await loadEasebuzzCheckout();

        const easebuzzCheckout =
          new EasebuzzCheckout(
            merchantKey,
            env === 'prod'
              ? 'prod'
              : 'test',
          );

        easebuzzCheckout.initiatePayment(
          {
            access_key:
              accessKey,

            onResponse:
              async (
                response,
              ) => {
                console.log(
                  'Easebuzz repayment checkout response:',
                  response,
                );

                const status =
                  String(
                    response?.status ||
                    response?.payment_status ||
                    '',
                  ).toLowerCase();

                const successStatuses =
                  [
                    'success',
                    'successful',
                    'paid',
                    'captured',
                    'completed',
                  ];

                if (
                  successStatuses.includes(
                    status,
                  )
                ) {
                  const res =
                    await confirmRepayment(
                      lan,
                      {
                        installmentNumber:
                          selectedInst.installmentNumber,

                        amount:
                          selectedInst.remainingAmount,

                        paymentId:
                          response.txnid ||
                          txnid,

                        paymentMode:
                          'EASEBUZZ',

                        referenceNumber:
                          response.easepayid ||
                          response.txnid ||
                          txnid,
                      },
                    );

                  setPaymentSuccessMsg(
                    res?.message ||
                    'Payment verified & completed successfully!',
                  );

                  await fetchDetails(
                    true,
                  );

                  setTimeout(() => {
                    setIsPayModalOpen(
                      false,
                    );

                    setSelectedInst(
                      null,
                    );
                  }, 1800);
                } else {
                  const errMsg =
                    response?.error_Message ||
                    response?.message ||
                    'Payment was cancelled or failed.';

                  setPaymentErrorMsg(
                    errMsg,
                  );

                  setIsProcessingPayment(
                    false,
                  );
                }
              },

            theme: '#059669',
          },
        );
      } catch (err) {
        console.error(
          'Easebuzz checkout error:',
          err,
        );

        try {
          const res =
            await confirmRepayment(
              lan,
              {
                installmentNumber:
                  selectedInst.installmentNumber,

                amount:
                  selectedInst.remainingAmount,

                paymentMode:
                  'EASEBUZZ',
              },
            );

          setPaymentSuccessMsg(
            res?.message ||
            'Repayment recorded successfully!',
          );

          await fetchDetails(
            true,
          );

          setTimeout(() => {
            setIsPayModalOpen(
              false,
            );

            setSelectedInst(
              null,
            );
          }, 1800);
        } catch (
        fallbackErr
        ) {
          setPaymentErrorMsg(
            fallbackErr?.message ||
            err?.message ||
            'Failed to process payment. Please try again.',
          );

          setIsProcessingPayment(
            false,
          );
        }
      }
    };

  const formatCurrency = (
    val,
  ) => {
    if (
      val === null ||
      val === undefined
    ) {
      return '—';
    }

    return Number(
      val,
    ).toLocaleString(
      'en-IN',
      {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2,
      },
    );
  };

  const formatDate = (
    dateStr,
  ) => {
    if (!dateStr) {
      return '—';
    }

    try {
      return new Date(
        dateStr,
      ).toLocaleDateString(
        'en-IN',
        {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        },
      );
    } catch {
      return dateStr;
    }
  };

  const formatDateTime = (
    dateStr,
  ) => {
    if (!dateStr) {
      return '—';
    }

    try {
      return new Date(
        dateStr,
      ).toLocaleString(
        'en-IN',
        {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        },
      );
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (
    status,
  ) => {
    switch (status) {
      case 'DISBURSED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-extrabold text-emerald-700">
            <CheckCircle2
              size={14}
            />
            DISBURSED
          </span>
        );

      case 'DISBURSAL_REQUESTED':
      case 'DISBURSAL_PROCESSING':
      case 'READY_FOR_DISBURSAL':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-extrabold text-blue-700">
            <Clock
              size={14}
              className="animate-pulse"
            />
            PENDING LENDER CONFIRMATION
          </span>
        );

      case 'DISBURSAL_FAILED':
      case 'FAILED':
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-extrabold text-red-700">
            <AlertTriangle
              size={14}
            />
            FAILED / REJECTED
          </span>
        );

      default:
        return (
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-600">
            {status ||
              'UNKNOWN'}
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <div className="flex min-h-[520px] flex-col items-center justify-center rounded-[28px] border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50">
            <RefreshCw className="h-8 w-8 animate-spin text-emerald-600" />
          </div>

          <h2 className="mt-5 text-lg font-bold text-slate-900">
            Loading loan details
          </h2>

          <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
            Please wait while we securely fetch your loan account, repayment schedule and payment history.
          </p>
        </div>
      </div>
    );
  }

  if (
    error &&
    !details
  ) {
    return (
      <div className="mx-auto w-full max-w-4xl px-1 py-6">
        <button
          type="button"
          onClick={() =>
            navigate(
              '/customer/dashboard',
            )
          }
          className="mb-5 inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <ArrowLeft
            size={16}
          />
          Back to Dashboard
        </button>

        <div className="relative overflow-hidden rounded-[28px] border border-red-100 bg-white p-8 text-center shadow-xl shadow-slate-900/5 sm:p-12">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-red-100/60 blur-3xl" />

          <div className="relative">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-red-50 text-red-600">
              <AlertTriangle
                size={30}
              />
            </div>

            <h3 className="mt-5 text-xl font-bold text-slate-950">
              Unable to load loan details
            </h3>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
              {error}
            </p>

            <button
              type="button"
              onClick={() =>
                fetchDetails(
                  true,
                )
              }
              className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-red-600/15 transition hover:-translate-y-0.5 hover:bg-red-700"
            >
              <RefreshCw
                size={16}
              />
              Retry Loading
            </button>
          </div>
        </div>
      </div>
    );
  }

  const {
    loan = {},
    disbursal = {},
    summary = {},
    rps = [],
    repayments = [],
    allocations = [],
  } = details || {};

  const isPendingDisbursal =
    disbursal.status ===
    'DISBURSAL_REQUESTED' ||
    disbursal.status ===
    'DISBURSAL_PROCESSING' ||
    disbursal.status ===
    'READY_FOR_DISBURSAL';

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 pb-10">
      {/* Header */}
      <section className="rounded-[24px] border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() =>
                navigate(
                  '/customer/dashboard',
                )
              }
              className="inline-flex items-center gap-2 rounded-lg px-1 py-1 text-xs font-bold text-slate-500 transition hover:text-emerald-700"
            >
              <ArrowLeft
                size={15}
              />
              Back to Dashboard
            </button>

            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                  Loan account
                </p>

                <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                  Loan Details
                </h1>
              </div>

              <span className="w-fit break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs font-bold text-slate-700">
                LAN: {loan.lan}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {getStatusBadge(
              disbursal.status ||
              loan.status,
            )}

            <button
              type="button"
              onClick={() =>
                fetchDetails(
                  true,
                )
              }
              disabled={
                isRefreshing
              }
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                size={15}
                className={
                  isRefreshing
                    ? 'animate-spin'
                    : ''
                }
              />

              {isRefreshing
                ? 'Refreshing...'
                : 'Refresh Status'}
            </button>
          </div>
        </div>
      </section>

      {/* Pending banner */}
      {isPendingDisbursal && (
        <section className="relative overflow-hidden rounded-[24px] border border-blue-200 bg-gradient-to-r from-blue-50 via-indigo-50 to-sky-50 p-5 shadow-sm sm:p-6">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-200/50 blur-3xl" />

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
              <Clock
                size={23}
                className="animate-pulse"
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-base font-bold text-blue-950 sm:text-lg">
                  Disbursal request submitted
                </h2>

                {getStatusBadge(
                  disbursal.status ||
                  loan.status,
                )}
              </div>

              <p className="mt-2 max-w-5xl text-sm leading-6 text-blue-900/75">
                Your request has been sent to the lender. Once the lender confirms disbursal, the repayment schedule and UTR will appear automatically.
              </p>

              <div className="mt-4 flex flex-col gap-2 text-xs font-semibold text-blue-700 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                <span className="inline-flex items-center gap-2">
                  <RefreshCw
                    size={13}
                    className="animate-spin"
                  />
                  Auto-checking every 5 seconds
                </span>

                <span>
                  Check #{pollCount}
                </span>

                <span className="break-all">
                  LAN: {loan.lan}
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Main overview */}
      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <article className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
                <Landmark
                  size={21}
                />
              </div>

              <div>
                <h2 className="text-base font-bold text-slate-950">
                  Loan Overview
                </h2>

                <p className="mt-0.5 text-xs text-slate-500">
                  Approved loan terms
                </p>
              </div>
            </div>

            {getStatusBadge(
              disbursal.status ||
              loan.status,
            )}
          </div>

          <div className="grid gap-px bg-slate-100 sm:grid-cols-2">
            <OverviewMetric
              label="Approved Amount"
              value={formatCurrency(
                loan.approvedAmount,
              )}
              valueClass="text-slate-950"
            />

            <OverviewMetric
              label="Disbursed Amount"
              value={
                loan.disbursedAmount
                  ? formatCurrency(
                    loan.disbursedAmount,
                  )
                  : 'Pending Confirmation'
              }
              valueClass="text-emerald-700"
            />

            <OverviewMetric
              label="Interest Rate"
              value={`${loan.interestRate}% p.a.`}
              icon={PieChart}
            />

            <OverviewMetric
              label="Tenure"
              value={`${loan.tenure} Days (${loan.repaymentFrequency || 'MONTHLY'})`}
              icon={Calendar}
            />
          </div>
        </article>

        <article className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5 sm:px-6">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-100 text-blue-700">
              <CreditCard
                size={21}
              />
            </div>

            <div>
              <h2 className="text-base font-bold text-slate-950">
                Disbursal Information
              </h2>

              <p className="mt-0.5 text-xs text-slate-500">
                Bank transfer and lender confirmation
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100 px-5 sm:px-6">
            <InfoRow
              label="Disbursal Status"
              value={
                disbursal.status ||
                'NOT_STARTED'
              }
            />

            <InfoRow
              label="Disbursal UTR"
              value={
                loan.disbursalUtr ||
                'Pending Lender UTR'
              }
              mono
            />

            <InfoRow
              label="Disbursal Date"
              value={formatDate(
                loan.disbursalDate,
              )}
            />

            <InfoRow
              label="First Repayment Date"
              value={formatDate(
                loan.firstRepaymentDate,
              )}
            />

            <InfoRow
              label="Requested / Processed At"
              value={
                disbursal.processedAt
                  ? formatDateTime(
                    disbursal.processedAt,
                  )
                  : formatDateTime(
                    disbursal.requestedAt,
                  )
              }
            />
          </div>
        </article>
      </section>

      {/* Summary */}
      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5 sm:px-6">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-indigo-100 text-indigo-700">
            <PieChart
              size={21}
            />
          </div>

          <div>
            <h2 className="text-base font-bold text-slate-950">
              Repayment Summary
            </h2>

            <p className="mt-0.5 text-xs text-slate-500">
              Current loan repayment position
            </p>
          </div>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">
          <SummaryCard
            label="Total Outstanding"
            value={formatCurrency(
              summary.totalOutstanding,
            )}
            tone="slate"
          >
            <div className="mt-3 space-y-1.5 text-[11px] text-slate-500">
              <div className="flex justify-between gap-3">
                <span>
                  Principal
                </span>

                <span className="font-bold text-slate-700">
                  {formatCurrency(
                    summary.principalOutstanding,
                  )}
                </span>
              </div>

              <div className="flex justify-between gap-3">
                <span>
                  Interest
                </span>

                <span className="font-bold text-slate-700">
                  {formatCurrency(
                    summary.interestOutstanding,
                  )}
                </span>
              </div>
            </div>
          </SummaryCard>

          <SummaryCard
            label="Total Paid"
            value={formatCurrency(
              summary.totalPaid,
            )}
            helper="Completed payments"
            tone="emerald"
          />

          <SummaryCard
            label="Bullet Repayment Due"
            value={formatCurrency(
              summary.nextEmiAmount,
            )}
            helper={`Due: ${formatDate(
              summary.nextDueDate,
            )}`}
            tone="amber"
          />

          <SummaryCard
            label="Overdue Amount"
            value={formatCurrency(
              summary.overdueAmount,
            )}
            helper={
              summary.overdueAmount >
                0
                ? 'Action required'
                : 'No overdues'
            }
            tone="red"
          />
        </div>
      </section>

      {/* RPS */}
      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
              <FileText
                size={21}
              />
            </div>

            <div>
              <h2 className="text-base font-bold text-slate-950">
                Repayment Schedule
              </h2>

              <p className="mt-0.5 text-xs text-slate-500">
                Bullet repayment schedule and payment status
              </p>
            </div>
          </div>

          <span className="w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-600">
            {rps.length}{' '}
            Installment
          </span>
        </div>

        {rps.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600">
              <Clock
                size={27}
                className="animate-pulse"
              />
            </div>

            <h3 className="mt-4 text-sm font-bold text-slate-900">
              Repayment schedule pending
            </h3>

            <p className="mx-auto mt-2 max-w-lg text-xs leading-5 text-slate-500">
              Your repayment schedule will be generated automatically after the lender confirms the loan disbursal.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile schedule */}
            <div className="space-y-4 p-4 sm:p-5 lg:hidden">
              {rps.map(
                (row) => (
                  <article
                    key={
                      row.installmentNumber
                    }
                    className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4"
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                      <div>
                        <p className="text-xs font-bold text-slate-950">
                          Installment #{row.installmentNumber}
                        </p>

                        <p className="mt-1 text-[11px] text-slate-500">
                          Due {formatDate(
                            row.dueDate,
                          )}
                        </p>
                      </div>

                      <PaymentStatusBadge
                        status={
                          row.paymentStatus
                        }
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <MobileValue
                        label="Principal"
                        value={formatCurrency(
                          row.principal,
                        )}
                      />

                      <MobileValue
                        label="Interest"
                        value={formatCurrency(
                          row.interest,
                        )}
                      />

                      <MobileValue
                        label="Total EMI"
                        value={formatCurrency(
                          row.emi,
                        )}
                        prominent
                      />

                      <MobileValue
                        label="Remaining"
                        value={formatCurrency(
                          row.remainingAmount,
                        )}
                        prominent
                      />
                    </div>

                    <div className="mt-4">
                      {row.remainingAmount >
                        0 &&
                        row.paymentStatus !==
                        'PAID' ? (
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenPayModal(
                              row,
                            )
                          }
                          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-600/15 transition hover:bg-emerald-700"
                        >
                          <CreditCard
                            size={15}
                          />
                          Pay{' '}
                          {formatCurrency(
                            row.remainingAmount,
                          )}
                        </button>
                      ) : (
                        <span className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-700">
                          <CheckCircle2
                            size={15}
                          />
                          Payment completed
                        </span>
                      )}
                    </div>
                  </article>
                ),
              )}
            </div>

            {/* Desktop schedule */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-[1250px] w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    <th className="whitespace-nowrap px-4 py-4">
                      Inst. #
                    </th>

                    <th className="whitespace-nowrap px-4 py-4">
                      Due Date
                    </th>

                    <th className="whitespace-nowrap px-4 py-4 text-right">
                      Principal
                    </th>

                    <th className="whitespace-nowrap px-4 py-4 text-right">
                      Interest
                    </th>

                    <th className="whitespace-nowrap px-4 py-4 text-right text-slate-700">
                      Bullet EMI
                    </th>

                    <th className="whitespace-nowrap px-4 py-4 text-right">
                      Opening
                    </th>

                    <th className="whitespace-nowrap px-4 py-4 text-right">
                      Closing
                    </th>

                    <th className="whitespace-nowrap px-4 py-4 text-center">
                      Status
                    </th>

                    <th className="whitespace-nowrap px-4 py-4 text-right">
                      Paid
                    </th>

                    <th className="whitespace-nowrap px-4 py-4 text-right">
                      Remaining
                    </th>

                    <th className="whitespace-nowrap px-4 py-4 text-center">
                      Payment
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {rps.map(
                    (row) => (
                      <tr
                        key={
                          row.installmentNumber
                        }
                        className="transition hover:bg-emerald-50/30"
                      >
                        <td className="whitespace-nowrap px-4 py-4 font-bold text-slate-950">
                          #{row.installmentNumber}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 font-semibold text-slate-700">
                          {formatDate(
                            row.dueDate,
                          )}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-right font-mono text-slate-700">
                          {formatCurrency(
                            row.principal,
                          )}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-right font-mono text-slate-500">
                          {formatCurrency(
                            row.interest,
                          )}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-right font-mono font-bold text-slate-950">
                          {formatCurrency(
                            row.emi,
                          )}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-right font-mono text-slate-600">
                          {formatCurrency(
                            row.openingPrincipal,
                          )}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-right font-mono text-slate-600">
                          {formatCurrency(
                            row.closingPrincipal,
                          )}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-center">
                          <PaymentStatusBadge
                            status={
                              row.paymentStatus
                            }
                          />
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-right font-mono font-bold text-emerald-700">
                          {formatCurrency(
                            row.paidAmount,
                          )}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-right font-mono font-bold text-slate-950">
                          {formatCurrency(
                            row.remainingAmount,
                          )}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-center">
                          {row.remainingAmount >
                            0 &&
                            row.paymentStatus !==
                            'PAID' ? (
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenPayModal(
                                  row,
                                )
                              }
                              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white shadow-sm transition hover:bg-emerald-700"
                            >
                              <CreditCard
                                size={13}
                              />
                              Pay Now
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                              <CheckCircle2
                                size={12}
                              />
                              Paid
                            </span>
                          )}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* History */}
      <section className="grid gap-5 xl:grid-cols-2">
        <HistoryTableCard
          icon={History}
          iconStyle="bg-indigo-100 text-indigo-700"
          title="Repayment History"
          subtitle="Payment transactions received"
          empty={
            repayments.length ===
            0
          }
          emptyText="No repayment transactions received yet."
        >
          <table className="min-w-[650px] w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">
                  Payment ID
                </th>

                <th className="px-4 py-3">
                  Date
                </th>

                <th className="px-4 py-3 text-right">
                  Amount
                </th>

                <th className="px-4 py-3">
                  Mode
                </th>

                <th className="px-4 py-3">
                  Status
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {repayments.map(
                (rep) => (
                  <tr
                    key={
                      rep.paymentId
                    }
                    className="hover:bg-slate-50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono font-bold text-slate-950">
                      {rep.paymentId}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatDate(
                        rep.paymentDate,
                      )}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-bold text-emerald-700">
                      {formatCurrency(
                        rep.amountReceived,
                      )}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">
                      {rep.paymentMode}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                        {rep.status}
                      </span>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </HistoryTableCard>

        <HistoryTableCard
          icon={Layers}
          iconStyle="bg-violet-100 text-violet-700"
          title="Allocation History"
          subtitle="Payment component allocations"
          empty={
            allocations.length ===
            0
          }
          emptyText="No payment component allocations recorded yet."
        >
          <table className="min-w-[560px] w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">
                  Payment ID
                </th>

                <th className="px-4 py-3">
                  Inst. #
                </th>

                <th className="px-4 py-3">
                  Component
                </th>

                <th className="px-4 py-3 text-right">
                  Allocated
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {allocations.map(
                (
                  alloc,
                  idx,
                ) => (
                  <tr
                    key={idx}
                    className="hover:bg-slate-50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono font-bold text-slate-950">
                      {alloc.paymentId}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">
                      #{alloc.installmentNumber}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {alloc.component}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-bold text-slate-950">
                      {formatCurrency(
                        alloc.allocatedAmount,
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </HistoryTableCard>
      </section>

      {/* Modal */}
      {isPayModalOpen &&
        selectedInst && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
            <div className="max-h-[calc(100vh-32px)] w-full max-w-md overflow-y-auto rounded-[28px] border border-white/20 bg-white shadow-2xl">
              <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-100 bg-white px-5 py-5 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
                    <CreditCard
                      size={21}
                    />
                  </div>

                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-slate-950 sm:text-base">
                      Pay Installment #{selectedInst.installmentNumber}
                    </h3>

                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Easebuzz secure checkout
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setIsPayModalOpen(
                      false,
                    )
                  }
                  disabled={
                    isProcessingPayment
                  }
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                  aria-label="Close payment modal"
                >
                  <X
                    size={19}
                  />
                </button>
              </div>

              <div className="space-y-5 p-5 sm:p-6">
                {paymentSuccessMsg && (
                  <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold text-emerald-700">
                    <CheckCircle2
                      size={17}
                      className="mt-0.5 shrink-0"
                    />

                    <span>
                      {
                        paymentSuccessMsg
                      }
                    </span>
                  </div>
                )}

                {paymentErrorMsg && (
                  <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-700">
                    <AlertTriangle
                      size={17}
                      className="mt-0.5 shrink-0"
                    />

                    <span>
                      {
                        paymentErrorMsg
                      }
                    </span>
                  </div>
                )}

                {!paymentSuccessMsg && (
                  <>
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                      <ModalInfoRow
                        label="Installment Number"
                        value={`#${selectedInst.installmentNumber}`}
                      />

                      <ModalInfoRow
                        label="Due Date"
                        value={formatDate(
                          selectedInst.dueDate,
                        )}
                      />

                      <ModalInfoRow
                        label="Principal + Interest"
                        value={formatCurrency(
                          selectedInst.emi,
                        )}
                      />

                      <div className="flex items-center justify-between gap-4 border-t border-slate-200 bg-white px-4 py-4">
                        <span className="text-sm font-bold text-slate-950">
                          Total Amount
                        </span>

                        <span className="text-lg font-black text-emerald-700">
                          {formatCurrency(
                            selectedInst.remainingAmount,
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3.5 py-3 text-[11px] leading-5 text-emerald-800">
                      <Lock
                        size={14}
                        className="mt-0.5 shrink-0"
                      />

                      <span>
                        Secured using Easebuzz encrypted payment checkout.
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() =>
                          setIsPayModalOpen(
                            false,
                          )
                        }
                        disabled={
                          isProcessingPayment
                        }
                        className="min-h-12 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>

                      <button
                        type="button"
                        onClick={
                          handleExecutePayment
                        }
                        disabled={
                          isProcessingPayment
                        }
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isProcessingPayment ? (
                          <>
                            <RefreshCw
                              size={15}
                              className="animate-spin"
                            />
                            Processing…
                          </>
                        ) : (
                          <>
                            <CreditCard
                              size={15}
                            />
                            Pay{' '}
                            {formatCurrency(
                              selectedInst.remainingAmount,
                            )}
                          </>
                        )}
                      </button>
                    </div>

                    <div className="flex items-center justify-center gap-2 text-[10px] font-semibold text-slate-400">
                      <ShieldCheck
                        size={13}
                      />
                      Secure payment processing
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

function OverviewMetric({
  label,
  value,
  icon: Icon,
  valueClass = 'text-slate-900',
}) {
  return (
    <div className="bg-white px-5 py-5 sm:px-6">
      <div className="flex items-center gap-2">
        {Icon && (
          <Icon
            size={14}
            className="text-slate-400"
          />
        )}

        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
          {label}
        </span>
      </div>

      <p
        className={`mt-2 break-words text-base font-black leading-6 sm:text-lg ${valueClass}`}
      >
        {value}
      </p>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
}) {
  return (
    <div className="flex flex-col gap-1.5 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
      <span className="text-xs text-slate-500">
        {label}
      </span>

      <span
        className={`break-all text-xs font-bold text-slate-900 sm:max-w-[60%] sm:text-right sm:text-sm ${mono
            ? 'font-mono'
            : ''
          }`}
      >
        {value || '—'}
      </span>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  helper,
  tone,
  children,
}) {
  const tones = {
    slate:
      'border-slate-200 bg-gradient-to-br from-slate-50 to-white',

    emerald:
      'border-emerald-100 bg-gradient-to-br from-emerald-50 to-white',

    amber:
      'border-amber-100 bg-gradient-to-br from-amber-50 to-white',

    red:
      'border-red-100 bg-gradient-to-br from-red-50 to-white',
  };

  const valueTones = {
    slate:
      'text-slate-950',

    emerald:
      'text-emerald-700',

    amber:
      'text-amber-800',

    red:
      'text-red-700',
  };

  return (
    <article
      className={`rounded-2xl border p-5 ${tones[tone] ||
        tones.slate
        }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">
        {label}
      </p>

      <p
        className={`mt-2 break-words text-xl font-black leading-7 ${valueTones[tone] ||
          valueTones.slate
          }`}
      >
        {value}
      </p>

      {helper && (
        <p className="mt-2 text-xs text-slate-500">
          {helper}
        </p>
      )}

      {children}
    </article>
  );
}

function PaymentStatusBadge({
  status,
}) {
  const value =
    String(
      status || '',
    ).toUpperCase();

  let style =
    'border-amber-200 bg-amber-50 text-amber-700';

  if (value === 'PAID') {
    style =
      'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  if (
    value === 'OVERDUE'
  ) {
    style =
      'border-red-200 bg-red-50 text-red-700';
  }

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${style}`}
    >
      {status ||
        'PENDING'}
    </span>
  );
}

function MobileValue({
  label,
  value,
  prominent = false,
}) {
  return (
    <div className="rounded-xl bg-white p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p
        className={`mt-1.5 break-words ${prominent
            ? 'text-sm font-black text-slate-950'
            : 'text-xs font-bold text-slate-700'
          }`}
      >
        {value}
      </p>
    </div>
  );
}

function HistoryTableCard({
  icon: Icon,
  iconStyle,
  title,
  subtitle,
  empty,
  emptyText,
  children,
}) {
  return (
    <article className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5 sm:px-6">
        <div
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${iconStyle}`}
        >
          <Icon
            size={21}
          />
        </div>

        <div>
          <h2 className="text-base font-bold text-slate-950">
            {title}
          </h2>

          <p className="mt-0.5 text-xs text-slate-500">
            {subtitle}
          </p>
        </div>
      </div>

      {empty ? (
        <div className="px-6 py-12 text-center">
          <p className="text-xs text-slate-500">
            {emptyText}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          {children}
        </div>
      )}
    </article>
  );
}

function ModalInfoRow({
  label,
  value,
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3.5 last:border-b-0">
      <span className="text-xs text-slate-500">
        {label}
      </span>

      <span className="break-words text-right text-xs font-bold text-slate-900">
        {value}
      </span>
    </div>
  );
}

export default CustomerLoanDetailsPage;