
import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  CircleUserRound,
  FileText,
  IndianRupee,
  Landmark,
  LoaderCircle,
  Mail,
  MapPin,
  Phone,
  ReceiptText,
  RotateCcw,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { customerApi } from '../customerApi';

export default function CustomerDashboard() {
  const navigate = useNavigate();

  const [backendCustomer, setBackendCustomer] = useState(null);
  const [isLoadingCustomer, setIsLoadingCustomer] = useState(true);
  const [customerError, setCustomerError] = useState('');

  const storedSession = getStoredSession();
  const customerId = storedSession?.customerId || null;

  const fetchCustomerData = async () => {
    if (!customerId) return;
    setIsLoadingCustomer(true);
    setCustomerError('');

    try {
      const customerData = await customerApi.getCustomerById(customerId);
      setBackendCustomer(customerData);
    } catch (error) {
      console.error('Failed to fetch customer data:', error);
      setCustomerError(
        error instanceof Error
          ? error.message
          : 'Unable to load customer details.',
      );
    } finally {
      setIsLoadingCustomer(false);
    }
  };

  // Fetch backend customer data on mount or redirect if missing session
  useEffect(() => {
    if (!customerId) {
      sessionStorage.removeItem('customerSession');
      navigate('/customer/login', { replace: true });
      return;
    }

    fetchCustomerData();
  }, [customerId, navigate]);

  // Determine application progress and status directly from backend customer
  const hasBackendProgress =
    Boolean(
      backendCustomer?.panVerified ||
        backendCustomer?.emailVerified ||
        backendCustomer?.fullName ||
        (backendCustomer?.onboardingStatus &&
          backendCustomer.onboardingStatus !== 'MOBILE_VERIFIED'),
    );

  const mobileNumber =
    backendCustomer?.mobileNumber ||
    storedSession?.mobileNumber ||
    '';

  const applicationSubmitted = Boolean(
    backendCustomer?.latestApplicationId,
  );

  const applicationNumber =
    backendCustomer?.latestApplicationId
      ? `PL-APP-${backendCustomer.latestApplicationId}`
      : '';

  const applicant = backendCustomer || {};

  const lender = 'Fintree Finance Private Limited';

  const applicationStatus =
    backendCustomer?.eligibilityStatus ||
    'SUBMITTED_TO_LENDER';

  const submittedAt = backendCustomer?.updatedAt || '';

  const feeDetails = null;

  const handleApplicationButton = () => {
    navigate('/customer/application');
  };

  if (isLoadingCustomer) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <LoaderCircle className="h-10 w-10 animate-spin text-emerald-600" />
          <p className="mt-4 text-sm font-medium text-slate-600">
            Loading your application details...
          </p>
        </div>
      </div>
    );
  }

  if (customerError) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-xl rounded-3xl border border-red-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-100 text-red-600">
            <AlertCircle size={28} />
          </div>

          <h3 className="mt-4 text-lg font-bold text-slate-900">
            Unable to load customer profile
          </h3>

          <p className="mt-2 text-sm text-slate-600">
            {customerError}
          </p>

          <button
            type="button"
            onClick={fetchCustomerData}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow transition hover:bg-emerald-700"
          >
            <RotateCcw size={16} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const buttonLabel = applicationSubmitted
    ? 'View Application'
    : hasBackendProgress
      ? 'Continue Application'
      : 'Start Application';

  return (
    <div className="mx-auto max-w-7xl">
      {/* Dashboard header */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-500 p-6 text-white shadow-xl shadow-emerald-700/15 sm:p-8">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10" />
        <div className="absolute -bottom-24 right-20 h-52 w-52 rounded-full bg-white/5" />

        <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-emerald-100">
              Welcome to FinLeaf
            </p>

            <h2 className="mt-2 text-2xl font-bold sm:text-3xl">
              {applicationSubmitted
                ? 'Your loan application has been submitted.'
                : 'Your personal loan journey starts here.'}
            </h2>

            <p className="mt-3 max-w-xl text-sm leading-6 text-emerald-50 sm:text-base">
              {applicationSubmitted
                ? 'Review the application details submitted to the lender and track the current status.'
                : 'Start your personal loan application and complete the guided onboarding process.'}
            </p>

            <button
              type="button"
              onClick={handleApplicationButton}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-emerald-700 shadow-lg transition hover:bg-emerald-50"
            >
              {buttonLabel}
              <ArrowRight size={17} />
            </button>
          </div>

          {applicationSubmitted && (
            <div className="w-full max-w-sm rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100">
                Application Number
              </p>

              <p className="mt-2 break-all text-xl font-bold">
                {applicationNumber}
              </p>

              <div className="mt-4 flex items-center gap-2">
                <CheckCircle2 size={17} />

                <span className="text-sm font-semibold">
                  Submitted successfully
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Show application details only after submission */}
      {applicationSubmitted && (
        <div className="mt-6 space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-emerald-700">
                  Submitted Application
                </p>

                <h3 className="mt-2 text-2xl font-bold text-slate-900">
                  Application details
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  Details provided during your personal loan
                  application.
                </p>
              </div>

              <ApplicationStatusBadge
                status={applicationStatus}
              />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <ApplicationDetailCard
                icon={FileText}
                title="Application Information"
              >
                <DetailRow
                  label="Application Number"
                  value={applicationNumber}
                />

                <DetailRow
                  label="Current Status"
                  value={formatStatus(
                    applicationStatus,
                  )}
                />

                <DetailRow
                  label="Submitted On"
                  value={formatDateTime(submittedAt)}
                />

                <DetailRow
                  label="Assigned Lender"
                  value={lender}
                />
              </ApplicationDetailCard>

              <ApplicationDetailCard
                icon={CircleUserRound}
                title="Personal Information"
              >
                <DetailRow
                  label="Applicant Name"
                  value={applicant.fullName}
                />

                <DetailRow
                  label="PAN Number"
                  value={maskPan(
                    applicant.panNumber,
                  )}
                />

                <DetailRow
                  label="Date of Birth"
                  value={formatDate(
                    applicant.dateOfBirth,
                  )}
                />

                <DetailRow
                  label="Gender"
                  value={formatStatus(
                    applicant.gender,
                  )}
                />
              </ApplicationDetailCard>

              <ApplicationDetailCard
                icon={Phone}
                title="Communication Details"
              >
                <DetailRow
                  label="Mobile Number"
                  value={
                    mobileNumber
                      ? `+91 ${mobileNumber}`
                      : 'Not available'
                  }
                  icon={Phone}
                />

                <DetailRow
                  label="Email Address"
                  value={applicant.email}
                  icon={Mail}
                />

                <DetailRow
                  label="Residential PIN Code"
                  value={applicant.pincode}
                  icon={MapPin}
                />
              </ApplicationDetailCard>

              <ApplicationDetailCard
                icon={BriefcaseBusiness}
                title="Professional Details"
              >
                <DetailRow
                  label="Employment Type"
                  value={formatStatus(
                    applicant.employmentType,
                  )}
                />

                <DetailRow
                  label={
                    applicant.employmentType ===
                    'SELF_EMPLOYED'
                      ? 'Business Name'
                      : 'Company Name'
                  }
                  value={
                    applicant.employmentType ===
                    'SELF_EMPLOYED'
                      ? applicant.businessName
                      : applicant.companyName
                  }
                />

                <DetailRow
                  label="Monthly Income"
                  value={formatCurrency(
                    applicant.monthlyIncome,
                  )}
                  icon={IndianRupee}
                />

                <DetailRow
                  label="Work PIN Code"
                  value={applicant.workPincode}
                  icon={MapPin}
                />
              </ApplicationDetailCard>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <Landmark size={22} />
                </div>

                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Lender Details
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    Assigned lending partner for this
                    application.
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm font-bold text-slate-900">
                  {lender}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  Personal Loan
                </p>

                <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 size={15} />
                  Application shared with lender
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-100 text-blue-700">
                  <ReceiptText size={22} />
                </div>

                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Assessment Fee
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    Payment information
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <DetailRow
                  label="Base Fee"
                  value={
                    feeDetails
                      ? formatCurrency(
                          feeDetails.baseFee,
                          true,
                        )
                      : '₹199.00'
                  }
                />

                <DetailRow
                  label="GST"
                  value={
                    feeDetails
                      ? formatCurrency(
                          feeDetails.gst,
                          true,
                        )
                      : '₹35.82'
                  }
                />

                <div className="border-t border-slate-200 pt-4">
                  <DetailRow
                    label="Total Paid"
                    value={
                      feeDetails
                        ? formatCurrency(
                            feeDetails.total,
                            true,
                          )
                        : '₹234.82'
                    }
                  />
                </div>

                <div className="rounded-xl bg-emerald-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-700">
                    <CheckCircle2 size={15} />
                    Payment Successful
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-blue-100 bg-blue-50 p-6">
            <div className="flex items-start gap-4">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-blue-700">
                <CalendarDays size={21} />
              </div>

              <div>
                <h3 className="text-sm font-bold text-blue-900">
                  What happens next?
                </h3>

                <p className="mt-2 text-sm leading-6 text-blue-800">
                  Fintree Finance will review the submitted
                  application. Further steps such as lender
                  decision, loan offer, KYC, bank verification
                  and agreement signing will be shown here as the
                  application progresses.
                </p>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function getStoredSession() {
  try {
    return JSON.parse(
      sessionStorage.getItem('customerSession') ||
        'null',
    );
  } catch {
    return null;
  }
}

function ApplicationDetailCard({
  icon: Icon,
  title,
  children,
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5">
      <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-emerald-700 shadow-sm">
          <Icon size={20} />
        </div>

        <h4 className="text-sm font-bold text-slate-900">
          {title}
        </h4>
      </div>

      <div className="mt-5 space-y-4">
        {children}
      </div>
    </article>
  );
}

function DetailRow({
  label,
  value,
  icon: Icon,
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="flex items-center gap-1.5 text-xs text-slate-500">
        {Icon && <Icon size={13} />}
        {label}
      </span>

      <span className="max-w-[60%] break-words text-right text-xs font-bold text-slate-900 sm:text-sm">
        {value || 'Not provided'}
      </span>
    </div>
  );
}

function ApplicationStatusBadge({ status }) {
  const formattedStatus = formatStatus(status);

  return (
    <span className="flex w-fit items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700">
      <CheckCircle2 size={15} />
      {formattedStatus}
    </span>
  );
}

function maskPan(panNumber) {
  if (!panNumber || panNumber.length !== 10) {
    return panNumber || 'Not provided';
  }

  return `${panNumber.slice(0, 2)}***${panNumber.slice(
    5,
    9,
  )}${panNumber.slice(-1)}`;
}

function formatStatus(value) {
  if (!value) {
    return 'Not available';
  }

  return value
    .toLowerCase()
    .split('_')
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1),
    )
    .join(' ');
}

function formatDate(dateValue) {
  if (!dateValue) {
    return 'Not provided';
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatDateTime(dateValue) {
  if (!dateValue) {
    return 'Not available';
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatCurrency(
  value,
  showDecimal = false,
) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return 'Not provided';
  }

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: showDecimal ? 2 : 0,
    maximumFractionDigits: showDecimal ? 2 : 0,
  }).format(Number(value));
}

