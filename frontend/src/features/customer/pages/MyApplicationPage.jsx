import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  Check,
  CheckCircle2,
  CircleUserRound,
  ExternalLink,
  FileCheck2,
  Camera,
  Info,
  LoaderCircle,
  Lock,
  MailCheck,
  MapPin,
  Phone,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Upload,
  ScanLine,
  Sparkles,
  UserCheck,
  X,
  Clock,
  CalendarDays,
  Lightbulb,
} from 'lucide-react';
import { usePincodeLookup } from '../hooks/usePincodeLookup';
import { startAdaptivePolling } from '../../../lib/adaptivePoller';
import { loadEasebuzzCheckout } from '../utils/loadEasebuzzCheckout';
import { OtpInput } from '../../../components/ui/OtpInput';
import {
  customerApi,
  getCustomerMe,
  resumeApplication,
  updateBasicDetails,
  updateCustomerProfile,
  submitCustomerApplication,
  reverseGeocode,
  verifyCustomerPan,
  processPanOcr,
  verifyFaceLiveness,
  initiateAssessmentPayment,
  getAssessmentPaymentStatus,
  saveApplicationAddress,
  acceptLenderDecisionConsents,
  uploadLivePhotoDocument,
  getCustomerLivePhoto,
  initiateCustomerAadhaarKyc,
  getCustomerAadhaarKycStatus,
  refreshCustomerAadhaarKycStatus,
  runEligibility,
  allocateLender,
  updatePincode,
  sendEmailOtp,
  verifyEmailOtp,
} from '../customerApi';
import { getPreApprovalOffer, selectPreApprovalOffer } from '../postApprovalApi';
import { resolveFileUrl } from '../../../lib/files';
import { AccountAggregatorStep } from '../components/AccountAggregatorStep';

/* ------------------------------------------------------------------ */
/*  Design tokens — same palette as the customer dashboard             */
/*  forest #0E3B2C · leaf #1F8A5B · sprout #9BE3B5 · mint #E7F4EC      */
/*  paper  #F7F9F6 · ink  #13211A                                      */
/*  Written as complete literal class strings so Tailwind detects them */
/* ------------------------------------------------------------------ */

const BTN_PRIMARY =
  'inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#0E3B2C] px-6 text-sm font-semibold text-white transition hover:bg-[#145239] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F8A5B] focus-visible:ring-offset-2';

const BTN_SECONDARY =
  'inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F8A5B] focus-visible:ring-offset-2';

const BTN_SOFT =
  'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#E7F4EC] px-4 text-sm font-semibold text-[#0E3B2C] transition hover:bg-[#D5EDDF] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F8A5B] focus-visible:ring-offset-2';

const CARD = 'rounded-[26px] border border-slate-200/80 bg-white';

const FLOW_STEPS = [
  {
    id: 'basic_details',
    label: 'Basic Details',
  },
  {
    id: 'assessment_fee',
    label: 'Lender & Fee',
  },
  {
    id: 'profile_details',
    label: 'Profile Details',
  },
  {
    id: 'aadhaar_kyc',
    label: 'Aadhaar KYC',
  },
  {
    id: 'account_aggregator',
    label: 'Bank Account',
  },
  {
    id: 'submit_application',
    label: 'Submit Application',
  },
];

// Customer-facing wording for the page header. The internal step list is no longer
// printed on screen — one clear "you are here" line reads better and keeps the
// system's own vocabulary out of the customer's way.
const STEP_COPY = {
  basic_details: {
    title: 'Let us start with your PAN',
    hint: 'We fetch your name and date of birth automatically, so there is almost nothing to type.',
  },
  assessment_fee: {
    title: 'Your lending partner is ready',
    hint: 'Review the one-time assessment fee and pay securely to continue.',
  },
  profile_details: {
    title: 'Tell us where you live and work',
    hint: 'This helps your lender match you with the right offer.',
  },
  aadhaar_kyc: {
    title: 'Confirm it is really you',
    hint: 'A quick Aadhaar check through DigiLocker. It takes about a minute.',
  },
  account_aggregator: {
    title: 'Share your bank statement',
    hint: 'Securely, through RBI-licensed Account Aggregators. Your passwords are never shared.',
  },
  submit_application: {
    title: 'One last look',
    hint: 'Check your details, then send the application to your lender.',
  },
};

const INITIAL_FORM = {
  fullName: '',
  panNumber: '',
  fatherName: '',
  dateOfBirth: '',
  gender: '',
  pincode: '',
  email: '',

  residenceStatus: '',
  employmentType: '',
  companyType: '',
  companyName: '',
  designation: '',
  monthlyIncome: '',
  employmentVintage: '',
  totalExperience: '',
  salaryMode: '',
  workPincode: '',
  kfsLanguage: 'English',

  businessName: '',
  businessConstitution: '',
  businessVintage: '',
  annualTurnover: '',
};

const delay = (milliseconds) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });

/**
 * The wording for a journey consent, served by the backend consent catalogue via
 * customer.journey.consentTexts.
 *
 * Screens must render this rather than holding their own copy: the backend hashes the same
 * string and stores it as the consent evidence, so a local paraphrase would mean recording
 * a consent whose text differs from the one the customer actually agreed to. The fallback
 * only covers the window before the journey payload has loaded.
 */
function resolveConsentText(customer, type, fallback = '') {
  return customer?.journey?.consentTexts?.[type]?.text || fallback;
}

function normalizePersonName(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function getComparableName(value) {
  return normalizePersonName(value).replace(
    /[^A-Z]/g,
    '',
  );
}

function doNamesMatch(
  enteredName,
  providerName,
) {
  return (
    getComparableName(enteredName) ===
    getComparableName(providerName)
  );
}

function normalizeGender(value) {
  const normalizedValue = String(value || '')
    .trim()
    .toUpperCase();

  if (
    normalizedValue === 'M' ||
    normalizedValue === 'MALE'
  ) {
    return 'MALE';
  }

  if (
    normalizedValue === 'F' ||
    normalizedValue === 'FEMALE'
  ) {
    return 'FEMALE';
  }

  if (normalizedValue) {
    return 'OTHER';
  }

  return '';
}

function normalizeDateForInput(value) {
  if (!value) {
    return '';
  }

  const normalizedValue = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return normalizedValue;
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(normalizedValue)) {
    return normalizedValue.slice(0, 10);
  }

  const dateMatch = normalizedValue.match(
    /^(\d{2})\/(\d{2})\/(\d{4})$/,
  );

  if (dateMatch) {
    const [, day, month, year] = dateMatch;
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(normalizedValue);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return '';
}

function extractPanVerificationPayload(result) {
  const responsePayload =
    result?.data?.data ||
    result?.data ||
    result ||
    null;

  if (!responsePayload) {
    return null;
  }

  if (responsePayload.verification) {
    return responsePayload.verification;
  }

  if (responsePayload.data?.verification) {
    return responsePayload.data.verification;
  }

  if (responsePayload.data) {
    return responsePayload.data;
  }

  return responsePayload;
}

function isValidPincode(value) {
  return (
    typeof value === 'string' &&
    /^[1-9][0-9]{5}$/.test(value.trim())
  );
}

function deriveCustomerWorkflow(customer) {
  if (!customer) {
    return {
      mobileVerified: false,
      panVerified: false,
      emailVerified: false,
      basicDetailsCompleted: false,
      profileDetailsCompleted: false,
      eligibilityCompleted: false,
      eligibilityPassed: false,
      assessmentFeePaid: false,
      applicationSubmitted: false,
      currentStep: 'basic_details',
    };
  }

  const mobileVerified = customer.mobileVerified === true;
  const panVerified = customer.panVerified === true;
  const emailVerified = customer.emailVerified === true;

  const hasFullName = Boolean(customer.fullName && customer.fullName.trim());
  const hasPanNumber = Boolean(customer.panNumber && customer.panNumber.trim());
  const hasDob = Boolean(customer.dateOfBirth);
  const hasGender = Boolean(customer.gender);

  let assessmentFeePaid = Boolean(
    customer.assessmentFeePaid ||
    customer.latestPayment?.status === 'SUCCESS' ||
    customer.latestPaymentStatus === 'SUCCESS' ||
    (Array.isArray(customer.plPaymentLinks) && customer.plPaymentLinks.some((p) => p.status === 'SUCCESS')),
  );

  const hasCompletedBasicDetails =
  mobileVerified &&
  panVerified &&
  hasFullName &&
  hasPanNumber &&
  hasDob &&
  hasGender;

let basicDetailsCompleted =
  assessmentFeePaid &&
  hasCompletedBasicDetails;

  const empType = customer.employmentType;
  let profileDetailsCompleted = false;

  if (empType === 'SALARIED') {
    profileDetailsCompleted = Boolean(
      customer.residenceStatus &&
      customer.companyType &&
      customer.companyName &&
      customer.designation &&
      customer.monthlyIncome !== null &&
      customer.monthlyIncome !== undefined &&
      customer.workPincode,
    );
  } else if (empType === 'SELF_EMPLOYED') {
    profileDetailsCompleted = Boolean(
      customer.residenceStatus &&
      customer.businessName &&
      customer.businessConstitution &&
      customer.monthlyIncome !== null &&
      customer.monthlyIncome !== undefined &&
      customer.annualTurnover !== null &&
      customer.annualTurnover !== undefined &&
      customer.workPincode,
    );
  }

  // The authoritative "did BRE pass" signal is per-application (journey.platformBreResult,
  // sourced from pl_applications.platform_decision_outcome) — it's what actually gates lender
  // allocation and step routing everywhere else. customer.eligibilityStatus is an older,
  // customer-level field that is meant to track the same result but isn't always written by
  // every code path that sets platform_decision_outcome (e.g. a lender-allocation retry that
  // assumes eligibility already passed and only re-stamps the application). Trusting only the
  // stale field here let a customer reach the final Submit step and then get bounced back to
  // basic_details for an "incomplete eligibility check" that had, in fact, already passed
  // (FTPL00000047) — so the per-application result takes priority, with the legacy field kept
  // as a fallback for any older data that never got a platformBreResult at all.
  const platformBreResult = customer.journey?.platformBreResult || null;
  const normalizedStatus = String(
    customer.eligibilityStatus || '',
  ).toUpperCase();
  const legacyEligibilityPassed = normalizedStatus === 'ELIGIBLE';
  const legacyEligibilityCompleted = normalizedStatus !== '' && normalizedStatus !== 'NOT_CHECKED';

  const eligibilityPassed = platformBreResult === 'PASS' || (!platformBreResult && legacyEligibilityPassed);
  const eligibilityCompleted =
    platformBreResult === 'PASS' || platformBreResult === 'FAIL' || legacyEligibilityCompleted;

  const applicationSubmitted = Boolean(
    ['APPLICATION_SUBMITTED', 'LENDER_APPROVED', 'LENDER_REJECTED', 'DISBURSED'].includes(customer.onboardingStatus)
  );

  const aadhaarKycStatus = String(
    customer.aadhaarKycStatus ||
    customer.digilockerStatus ||
    ''
  ).toUpperCase();

  let aadhaarKycCompleted = Boolean(
    customer.aadhaarVerified === true ||
    customer.digilockerVerified === true ||
    ['VERIFIED', 'COMPLETED', 'SUCCESS'].includes(aadhaarKycStatus)
  );

  let aaCompleted = Boolean(customer.journey?.aaCompleted || customer.journey?.aaStatus === 'SUCCESS');

  let currentStep = 'basic_details';
  if (!basicDetailsCompleted) {
    currentStep = 'basic_details';
  } else if (!assessmentFeePaid) {
    currentStep = 'assessment_fee';
  } else if (eligibilityCompleted && !eligibilityPassed) {
    currentStep = 'rejection_screen';
  } else if (!profileDetailsCompleted) {
    currentStep = 'profile_details';
  } else if (!aadhaarKycCompleted) {
    currentStep = 'aadhaar_kyc';
  } else if (!aaCompleted) {
    currentStep = 'account_aggregator';
  } else {
    currentStep = 'submit_application';
  }

  if (applicationSubmitted) {
    currentStep = 'submit_application';
  }

  const backendStep = customer.journey?.nextPermittedStep;
  const backendStepMap = {
    BASIC_DETAILS: 'basic_details',
    // No lender could be allocated yet (allocateLender() didn't run, or failed — see
    // handleBasicDetailsContinue). Land back on basic_details rather than the
    // assessment-fee screen: its Continue button re-triggers allocateLender(), giving
    // the customer a real retry instead of a placeholder lender name and a ₹0.00 fee.
    ALLOCATION_PENDING: 'basic_details',
    PLATFORM_REJECTED: 'rejection_screen',
    ASSESSMENT_FEE: 'assessment_fee',
    PROFILE_DETAILS: 'profile_details',
    AADHAAR_KYC: 'aadhaar_kyc',
    ADDRESS_DETAILS: 'aadhaar_kyc',
    ACCOUNT_AGGREGATOR: 'account_aggregator',
    BANK_STATEMENT: 'account_aggregator',
    SUBMIT_APPLICATION: 'submit_application',
    LENDER_CREATE_PROCESSING: 'integration_processing',
    LENDER_UPDATE_PROCESSING: 'integration_processing',
    LENDER_DECISION_PROCESSING: 'integration_processing',
    APPROVAL_PROCESSING: 'integration_processing',
    PRE_APPROVAL_OFFER_SELECTION: 'pre_approval_offer_selection',
    INTEGRATION_SUPPORT: 'integration_support',
    LENDER_REJECTED: 'submit_application',
    BANK_DETAILS: 'submit_application',
  };
  if (backendStepMap[backendStep]) currentStep = backendStepMap[backendStep];

  const stepOrder = ['basic_details', 'assessment_fee', 'profile_details', 'aadhaar_kyc', 'account_aggregator', 'submit_application'];
  const stepIdx = stepOrder.indexOf(currentStep);
  if (stepIdx >= 1) basicDetailsCompleted = true;
  if (stepIdx >= 2) assessmentFeePaid = true;
  if (stepIdx >= 3) profileDetailsCompleted = true;
  if (stepIdx >= 4) aadhaarKycCompleted = true;
  if (stepIdx >= 5) aaCompleted = true;

  return {
    mobileVerified,
    panVerified,
    emailVerified,
    basicDetailsCompleted,
    profileDetailsCompleted,
    aadhaarKycCompleted,
    aadhaarKycStatus,
    aaCompleted,
    eligibilityCompleted,
    eligibilityPassed,
    assessmentFeePaid,
    applicationSubmitted,
    currentStep,
  };
}

function mapCustomerToForm(customer) {
  if (!customer) return INITIAL_FORM;

  return {
    fullName: customer.fullName || '',
    panNumber: customer.panNumber || '',
    fatherName: customer.fatherName || '',
    dateOfBirth: normalizeDateForInput(customer.dateOfBirth),
    gender: customer.gender || '',
    pincode: customer.residentialPincode || '',
    email: customer.email || '',

    residenceStatus: customer.residenceStatus || '',
    employmentType: customer.employmentType || '',
    companyType: customer.companyType || '',
    companyName: customer.companyName || '',
    designation: customer.designation || '',
    monthlyIncome:
      customer.monthlyIncome !== null &&
        customer.monthlyIncome !== undefined
        ? String(customer.monthlyIncome)
        : '',
    workPincode: customer.workPincode || '',

    businessName: customer.businessName || '',
    businessConstitution:
      customer.businessConstitution || '',
    annualTurnover:
      customer.annualTurnover !== null &&
        customer.annualTurnover !== undefined
        ? String(customer.annualTurnover)
        : '',

    employmentVintage: customer.employmentVintage || '',
    totalExperience: customer.totalExperience || '',
    salaryMode: customer.salaryMode || '',
    businessVintage: customer.businessVintage || '',
    kfsLanguage: customer.kfsLanguage || 'English',
  };
}

export default function MyApplicationPage() {
  const navigate = useNavigate();

  const storedSession = useMemo(() => {
    try {
      return JSON.parse(
        localStorage.getItem(
          'customerSession',
        ) || 'null',
      );
    } catch {
      return null;
    }
  }, []);

  const customerId = storedSession?.customerId || null;

  const [customer, setCustomer] = useState(null);
  const [isCustomerLoading, setIsCustomerLoading] = useState(true);
  const [customerLoadError, setCustomerLoadError] = useState('');

  const [platformProducts] = useState([]);
  const [isLoadingPlatformProducts, setIsLoadingPlatformProducts] = useState(true);

  const [form, setForm] = useState(INITIAL_FORM);
  const [currentStep, setCurrentStep] = useState('basic_details');

  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');

  const [emailVerified, setEmailVerified] = useState(false);
  const [isEmailVerifying, setIsEmailVerifying] = useState(false);

  const [emailOtp, setEmailOtp] = useState('');
  const [isEmailOtpSent, setIsEmailOtpSent] = useState(false);
  const [developmentEmailOtp, setDevelopmentEmailOtp] = useState('');

  const [isBreRunning, setIsBreRunning] = useState(false);
  const [brePassed, setBrePassed] = useState(false);

  const [lenderConsent, setLenderConsent] = useState(false);
  const [feePaid, setFeePaid] = useState(false);
  const [isFeeProcessing, setIsFeeProcessing] = useState(false);
  const [eligibilityModalState, setEligibilityModalState] = useState({
    isOpen: false,
    status: 'CHECKING',
    message: '',
    allocatedLender: '',
  });
  // Shown if the Easebuzz widget never calls back at all — e.g. it silently fails to
  // open, the customer's connection drops, or they close a tab it opened in. Without
  // this, isFeeProcessing (set the instant Pay is clicked, before the widget opens)
  // has no recovery path other than the customer figuring out to refresh the page: the
  // 3-minute polling timeout in startPaymentPolling only ever starts if Easebuzz's
  // onResponse callback actually fires, so a widget that never opens bypasses it
  // entirely. This is a customer-triggered fallback, not an automatic timer, so it
  // can never interrupt a payment that's genuinely still in progress.
  const [showPaymentRetryHint, setShowPaymentRetryHint] = useState(false);
  const paymentRetryHintTimerRef = useRef(null);

  const [isSaving, setIsSaving] = useState(false);

  const [, setPaymentId] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);
  const pollingTimerRef = useRef(null);

  const [isPanVerifying, setIsPanVerifying] = useState(false);
  const [panVerified, setPanVerified] = useState(false);
  const [panVerification, setPanVerification] = useState(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [applicationSubmitted, setApplicationSubmitted] = useState(false);
  const [applicationNumber, setApplicationNumber] = useState('');
  const [savedPhotoDocument, setSavedPhotoDocument] = useState(null);
  const [, setShowSubmissionModal] = useState(false);
  const [, setSubmissionData] = useState(null);
  const [isRetryingLenderSubmission, setIsRetryingLenderSubmission] = useState(false);
  const [retryLenderSubmissionError, setRetryLenderSubmissionError] = useState('');

  const mobileNumber =
    customer?.mobileNumber ||
    storedSession?.mobileNumber ||
    '';

  // `silent` is for background polling: it refreshes the data without swapping the whole
  // page for the full-screen loader (which made the screen flash every few seconds) and
  // without turning a momentary network blip into an error screen.
  const fetchCustomer = async ({ silent = false } = {}) => {
    if (!silent) {
      setIsCustomerLoading(true);
      setCustomerLoadError('');
    }

    try {
      let customerData = await getCustomerMe();

      // A repeat customer whose previous loan is fully repaid still has their old,
      // now-closed application as their "latest" one until a fresh application is
      // created — deriveCustomerWorkflow() would otherwise compute a stale
      // "processing" step for that closed application with no way forward. Self-heal
      // here regardless of entry path (direct URL, back button, bookmark) rather than
      // relying solely on the Dashboard's "Apply for a New Loan" button to trigger this.
      if (customerData.latestApplicationStatus === 'LOAN_CLOSED') {
        await resumeApplication(customerId);
        customerData = await getCustomerMe();
      }

      // If customer already has an active loan account with LAN, route to post-approval or details
      if (customerData.latestLan && customerData.latestLoanStatus !== 'FULLY_PAID') {
        const isDisbursalRequestedOrDisbursed =
          customerData.latestDisbursalStatus === 'DISBURSAL_REQUESTED' ||
          customerData.latestDisbursalStatus === 'DISBURSAL_PROCESSING' ||
          customerData.latestDisbursalStatus === 'DISBURSED' ||
          customerData.latestLoanStatus === 'DISBURSED';
        navigate(
          isDisbursalRequestedOrDisbursed
            ? `/customer/loan/${customerData.latestLan}/details`
            : `/customer/loan/${customerData.latestLan}/post-approval`,
          { replace: true }
        );
        return;
      }

      setCustomer(customerData);

      const mappedForm = mapCustomerToForm(customerData);
      setForm(mappedForm);

      const wf = deriveCustomerWorkflow(customerData);
      setCurrentStep(wf.currentStep);
      setEmailVerified(wf.emailVerified);
      setPanVerified(wf.panVerified);
      setBrePassed(wf.eligibilityPassed);
      setFeePaid(wf.assessmentFeePaid);
      if (wf.assessmentFeePaid) {
        setPaymentId('ALREADY_PAID');
        setTransactionId('ALREADY_PAID');
        setLenderConsent(true);
      }
      setApplicationSubmitted(wf.applicationSubmitted);

      if (customerData.latestApplicationReference) {
        setApplicationNumber(customerData.latestApplicationReference);
      }

      if (customerData.panVerified) {
        setPanVerification({
          providerApplicationId:
            customerData.panProviderApplicationId || null,
          panNumber: customerData.panNumber || null,
          fullName: customerData.fullName || null,
          firstName: customerData.firstName || null,
          middleName: customerData.middleName || null,
          lastName: customerData.lastName || null,
          gender: customerData.gender || null,
          dateOfBirth: normalizeDateForInput(customerData.dateOfBirth),
          typeOfHolder: customerData.panHolderType || null,
          verifiedAt: customerData.panVerifiedAt || null,
          kycStatus: 'VERIFIED',
        });
      } else {
        setPanVerification(null);
      }
      if (!silent) {
        try {
          const livePhotoDoc = await getCustomerLivePhoto(customerData?.id);
          if (livePhotoDoc && livePhotoDoc.status === 'VERIFIED') {
            setSavedPhotoDocument(livePhotoDoc);
          }
        } catch (photoErr) {
          console.error('Failed to load saved live photo document:', photoErr);
        }
      }
    } catch (err) {
      if (!silent) {
        setCustomerLoadError(
          err?.message || 'Unable to load your details.',
        );
      }
      if (err?.message?.includes('Customer authentication is required') || err?.message?.includes('Access denied') || err?.message?.includes('Customer details were not found')) {
        navigate('/customer/login', {
          replace: true,
        });
      }
    } finally {
      setIsCustomerLoading(false);
    }
  };

  useEffect(() => {
    if (!customerId) {
      localStorage.removeItem('customerSession');
      navigate('/customer/login', { replace: true });
      return;
    }

    fetchCustomer();

    // Fetch products
    setIsLoadingPlatformProducts(false);
  }, [customerId, navigate]);

  useEffect(() => {
    // Also polls on integration_support: a FAILED lender event can resolve on its own
    // (the worker's own retry schedule, or someone retrying it from the admin panel)
    // without the customer ever clicking anything here — without this, they'd be stuck
    // looking at a stale "retry" screen for an error that's already been fixed.
    if (currentStep !== 'integration_processing' && currentStep !== 'integration_support') return undefined;
    // Quick at first (lender stages usually finish in seconds), gentler once it is clearly
    // waiting on something slow, silent while the tab is hidden, and never overlapping
    // requests - see lib/adaptivePoller.js. A fixed 5s timer used to hit the server forever,
    // even from a forgotten background tab, and could stack requests on a slow network.
    return startAdaptivePolling(() => fetchCustomer({ silent: true }));
  }, [currentStep]);

  const [isApplyingAgain, setIsApplyingAgain] = useState(false);
  const [applyAgainError, setApplyAgainError] = useState('');

  // Starts a fresh application after a rejection. The server enforces the cooling-off
  // period, so this can only succeed once it has passed.
  const handleApplyAgain = async () => {
    setIsApplyingAgain(true);
    setApplyAgainError('');
    try {
      await resumeApplication(customerId);
      await fetchCustomer();
    } catch (error) {
      setApplyAgainError(
        error instanceof Error && error.message
          ? error.message
          : 'You cannot apply again just yet. Please try after the date shown.',
      );
      await fetchCustomer({ silent: true });
    } finally {
      setIsApplyingAgain(false);
    }
  };

  const handleRetryLenderSubmission = async () => {
    setIsRetryingLenderSubmission(true);
    setRetryLenderSubmissionError('');

    try {
      await customerApi.retryLenderSubmission(customer?.latestApplicationId);
      await fetchCustomer();
    } catch (error) {
      setRetryLenderSubmissionError(
        error instanceof Error
          ? error.message
          : 'Unable to retry right now. Please try again in a moment.',
      );
    } finally {
      setIsRetryingLenderSubmission(false);
    }
  };

  const showMessage = (
    text,
    type = 'success',
  ) => {
    setMessage(text);
    setMessageType(type);
  };

  const clearMessage = () => {
    setMessage('');
  };

  const goToStep = (step) => {
    setCurrentStep(step);
    setErrors({});
    clearMessage();

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  const handleChange = (event) => {
    const { name, value } = event.target;

    let normalizedValue = value;

    if (name === 'panNumber') {
      normalizedValue = value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 10);
    }

    if (
      name === 'pincode' ||
      name === 'workPincode'
    ) {
      normalizedValue = value
        .replace(/\D/g, '')
        .slice(0, 6);
    }

    if (
      [
        'monthlyIncome',
        'annualTurnover',
      ].includes(name)
    ) {
      normalizedValue =
        value.replace(/\D/g, '');
    }

    setForm((currentForm) => {
      const updatedForm = {
        ...currentForm,
        [name]: normalizedValue,
      };

      if (
        name === 'panNumber' &&
        normalizedValue !==
        currentForm.panNumber
      ) {
        updatedForm.dateOfBirth = '';
        updatedForm.gender = '';
      }

      return updatedForm;
    });

    setErrors((currentErrors) => ({
      ...currentErrors,
      [name]: '',
    }));

    if (
      name === 'panNumber' ||
      name === 'fullName'
    ) {
      setPanVerified(false);
      setPanVerification(null);
      setBrePassed(false);
    }

    if (name === 'email') {
      setEmailVerified(false);
    }

    clearMessage();
  };

  const validateBasicDetails = () => {
    const validationErrors = {};

    if (!form.fullName.trim()) {
      validationErrors.fullName =
        'Name as per PAN is required.';
    }

    if (!form.panNumber.trim()) {
      validationErrors.panNumber =
        'PAN number is required.';
    } else if (
      !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(
        form.panNumber,
      )
    ) {
      validationErrors.panNumber =
        'Enter a valid PAN number.';
    } else if (!panVerified) {
      validationErrors.panNumber =
        'Please verify your PAN.';
    }

    if (!form.fatherName.trim()) {
      validationErrors.fatherName =
        "Father's name is required.";
    }

    if (!form.dateOfBirth) {
      validationErrors.dateOfBirth =
        'Date of birth is required.';
    }
    // Age-range gating intentionally removed from here — the platform BRE's
    // MINIMUM_AGE/MAXIMUM_AGE rules are the single source of truth for the actual
    // threshold now, evaluated when eligibility runs. Duplicating a hardcoded 21-60
    // range here meant the two could silently drift out of sync with the configured
    // policy (which already lives in the DB, not in this file).

    if (!form.gender) {
      validationErrors.gender =
        'Gender is required.';
    }

    if (
      !/^[1-9][0-9]{5}$/.test(
        form.pincode,
      )
    ) {
      validationErrors.pincode =
        'Enter a valid 6-digit PIN code.';
    }

    if (!form.email.trim()) {
      validationErrors.email =
        'Email address is required.';
    } else if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        form.email,
      )
    ) {
      validationErrors.email =
        'Enter a valid email address.';
    } else if (!emailVerified) {
      validationErrors.email =
        'Please verify your email address.';
    }

    setErrors(validationErrors);

    return validationErrors;
  };

  // Human labels for validateBasicDetails()'s field keys, used to tell the customer
  // exactly what's missing instead of a generic "incomplete" message.
  const BASIC_DETAILS_FIELD_LABELS = {
    fullName: 'Full name',
    panNumber: 'PAN verification',
    fatherName: "Father's name",
    dateOfBirth: 'Date of birth',
    gender: 'Gender',
    pincode: 'PIN code',
    email: 'Email',
  };

  const validateProfileDetails = () => {
    const validationErrors = {};

    if (!form.residenceStatus) {
      validationErrors.residenceStatus =
        'Select your residence status.';
    }

    if (!form.employmentType) {
      validationErrors.employmentType =
        'Select employment type.';
    }

    if (!form.monthlyIncome) {
      validationErrors.monthlyIncome =
        'Monthly income is required.';
    } else if (
      Number(form.monthlyIncome) < 10000
    ) {
      validationErrors.monthlyIncome =
        'Monthly income must be at least ₹10,000.';
    }

    if (
      !/^[1-9][0-9]{5}$/.test(
        form.workPincode,
      )
    ) {
      validationErrors.workPincode =
        'Enter a valid work PIN code.';
    }

    if (
      form.employmentType === 'SALARIED'
    ) {
      if (!form.companyType) {
        validationErrors.companyType =
          'Select company type.';
      }

      if (!form.companyName.trim()) {
        validationErrors.companyName =
          'Company name is required.';
      }

      if (!form.designation.trim()) {
        validationErrors.designation =
          'Designation is required.';
      }

      if (!form.employmentVintage) {
        validationErrors.employmentVintage =
          'Select employment vintage.';
      }

      if (!form.totalExperience) {
        validationErrors.totalExperience =
          'Select total experience.';
      }

      if (!form.salaryMode) {
        validationErrors.salaryMode =
          'Select salary mode.';
      }
    }

    if (
      form.employmentType ===
      'SELF_EMPLOYED'
    ) {
      if (!form.businessName.trim()) {
        validationErrors.businessName =
          'Business name is required.';
      }

      if (!form.businessConstitution) {
        validationErrors.businessConstitution =
          'Select business constitution.';
      }

      if (!form.businessVintage) {
        validationErrors.businessVintage =
          'Select business vintage.';
      }

      if (!form.annualTurnover) {
        validationErrors.annualTurnover =
          'Annual turnover is required.';
      }
    }

    setErrors(validationErrors);

    return (
      Object.keys(validationErrors)
        .length === 0
    );
  };

  const handleSendEmailOtp = async () => {
    if (
      !form.email.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        form.email,
      )
    ) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        email:
          'Enter a valid email before verification.',
      }));

      return;
    }

    if (!storedSession?.customerId) {
      showMessage(
        'Please complete mobile verification before verifying email.',
        'error',
      );
      return;
    }

    setIsEmailVerifying(true);
    setEmailOtp('');
    setDevelopmentEmailOtp('');
    clearMessage();

    try {
      const result = await sendEmailOtp(form.email.trim());

      const alreadyVerified = result?.data?.alreadyVerified === true;

      if (alreadyVerified) {
        setEmailVerified(true);
        setErrors((currentErrors) => ({
          ...currentErrors,
          email: '',
        }));
        showMessage('Email already verified.');
        return;
      }

      const devOtp = result?.data?.developmentOtp;

      if (devOtp) {
        setDevelopmentEmailOtp(devOtp);
      }

      setIsEmailOtpSent(true);

      showMessage(
        'OTP sent to your email.',
      );

      setErrors((currentErrors) => ({
        ...currentErrors,
        email: '',
      }));
    } catch (error) {
      console.error(
        'Send email OTP failed:',
        error,
      );

      showMessage(
        error instanceof Error
          ? error.message
          : 'Unable to send email OTP. Please try again.',
        'error',
      );
    } finally {
      setIsEmailVerifying(false);
    }
  };

  const handleVerifyEmailOtp = async () => {
    const otpValue = emailOtp.trim();

    if (!/^[0-9]{6}$/.test(otpValue)) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        email: 'Enter a valid 6-digit OTP.',
      }));
      return;
    }

    setIsEmailVerifying(true);
    clearMessage();

    try {
      await verifyEmailOtp(form.email.trim(), otpValue);

      setEmailVerified(true);
      setIsEmailOtpSent(false);
      setEmailOtp('');

      setErrors((currentErrors) => ({
        ...currentErrors,
        email: '',
      }));

      showMessage(
        'Email verified successfully.',
      );
    } catch (error) {
      console.error(
        'Email OTP verification failed:',
        error,
      );

      showMessage(
        error instanceof Error
          ? error.message
          : 'Email verification failed.',
        'error',
      );
    } finally {
      setIsEmailVerifying(false);
    }
  };

  const handleVerifyEmail = handleVerifyEmailOtp;

  const handleVerifyPan = async () => {
    const normalizedPan =
      form.panNumber
        .trim()
        .toUpperCase();

    const validationErrors = {};

    if (
      !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(
        normalizedPan,
      )
    ) {
      validationErrors.panNumber =
        'Enter a valid PAN number.';
    }

    if (
      Object.keys(validationErrors)
        .length > 0
    ) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        ...validationErrors,
      }));

      setPanVerified(false);
      return;
    }

    if (!storedSession?.customerId) {
      setPanVerified(false);
      setPanVerification(null);
      setErrors((currentErrors) => ({
        ...currentErrors,
        panNumber:
          'Please complete mobile verification before verifying PAN.',
      }));
      showMessage(
        'Please complete mobile verification before verifying PAN.',
        'error',
      );
      return;
    }

    setIsPanVerifying(true);
    setPanVerified(false);
    setPanVerification(null);
    setBrePassed(false);
    clearMessage();

    try {
      const result = await verifyCustomerPan(normalizedPan, form.fullName);

      const responsePayload =
        result?.data?.data ||
        result?.data ||
        result ||
        null;

      const panData =
        extractPanVerificationPayload(result);

      if (!panData) {
        throw new Error(
          'PAN details were not found in the response.',
        );
      }

      const isValidPan =
        panData.isValid === true ||
        responsePayload?.verification?.isValid === true ||
        responsePayload?.isValid === true ||
        responsePayload?.data?.isValid === true;

      if (!isValidPan) {
        throw new Error(
          'The entered PAN number is invalid.',
        );
      }

      const verifiedPan = String(
        panData.panNumber ||
        responsePayload?.panNumber ||
        '',
      )
        .trim()
        .toUpperCase();

      if (
        verifiedPan &&
        verifiedPan !== normalizedPan
      ) {
        throw new Error(
          'Verified PAN does not match the entered PAN.',
        );
      }

      const providerName =
        normalizePersonName(
          panData.fullName ||
          responsePayload?.fullName ||
          responsePayload?.verification?.fullName ||
          responsePayload?.name ||
          '',
        );

      if (!providerName) {
        throw new Error(
          'The PAN provider did not return the holder name.',
        );
      }

      const providerFatherName = normalizePersonName(
        panData.fatherName ||
        panData.father_name ||
        responsePayload?.fatherName ||
        responsePayload?.father_name ||
        responsePayload?.verification?.fatherName ||
        responsePayload?.verification?.father_name ||
        responsePayload?.data?.father_name ||
        responsePayload?.data?.fatherName ||
        responsePayload?.data?.response?.father_name ||
        responsePayload?.data?.response?.fatherName ||
        '',
      );

      const normalizedDateOfBirth =
        normalizeDateForInput(
          panData.dateOfBirth ||
          responsePayload?.dateOfBirth ||
          '',
        );

      const normalizedGender =
        normalizeGender(
          panData.gender ||
          responsePayload?.gender ||
          '',
        );

      // Date of birth and gender will be populated if returned by provider; otherwise customer enters them

      const updatedForm = {
        ...form,

        panNumber:
          verifiedPan || normalizedPan,

        fullName: providerName,

        ...(providerFatherName ? { fatherName: providerFatherName } : {}),

        dateOfBirth:
          normalizedDateOfBirth || form.dateOfBirth,

        gender: normalizedGender || form.gender,

        pincode: isValidPincode(
          panData.pincode ||
          responsePayload?.pincode ||
          '',
        )
          ? panData.pincode ||
          responsePayload?.pincode ||
          ''
          : form.pincode,
      };

      const verificationData = {
        providerApplicationId:
          panData.providerApplicationId ||
          responsePayload?.providerApplicationId ||
          null,

        panNumber:
          verifiedPan || normalizedPan,

        fullName: providerName,

        fatherName: providerFatherName || null,

        firstName:
          panData.firstName ||
          responsePayload?.firstName ||
          null,

        middleName:
          panData.middleName ||
          responsePayload?.middleName ||
          null,

        lastName:
          panData.lastName ||
          responsePayload?.lastName ||
          null,

        gender: normalizedGender,

        dateOfBirth:
          normalizedDateOfBirth,

        maskedAadhaar:
          panData.maskedAadhaar ||
          responsePayload?.maskedAadhaar ||
          null,

        aadhaarLastFourDigits:
          panData.aadhaarLastFourDigits ||
          responsePayload?.aadhaarLastFourDigits ||
          null,

        aadhaarSeedingStatus:
          panData.aadhaarSeedingStatus ??
          responsePayload?.aadhaarSeedingStatus ??
          null,

        typeOfHolder:
          panData.typeOfHolder ||
          responsePayload?.typeOfHolder ||
          null,

        providerStatusCode:
          panData.providerStatusCode ??
          responsePayload?.providerStatusCode ??
          null,

        providerStatusMessage:
          panData.providerStatusMessage ||
          responsePayload?.providerStatusMessage ||
          null,

        providerTimestamp:
          panData.providerTimestamp ||
          responsePayload?.providerTimestamp ||
          null,

        verifiedAt:
          new Date().toISOString(),
        kycStatus:
          responsePayload?.kycStatus ||
          responsePayload?.data?.kycStatus ||
          null,
      };
      setForm(updatedForm);
      setPanVerified(true);
      setPanVerification(verificationData);

      setErrors((currentErrors) => ({
        ...currentErrors,
        fullName: '',
        fatherName: '',
        panNumber: '',
        dateOfBirth: '',
        gender: '',
      }));

      showMessage(
        'PAN verified successfully. Full name, date of birth and gender have been populated.',
      );
    } catch (error) {
      console.error(
        'PAN verification failed:',
        error,
      );

      setPanVerified(false);
      setPanVerification(null);

      const errorMessage =
        error instanceof Error
          ? error.message
          : 'PAN verification failed.';

      setErrors((currentErrors) => ({
        ...currentErrors,
        panNumber: errorMessage,
      }));

      showMessage(
        errorMessage,
        'error',
      );
    } finally {
      setIsPanVerifying(false);
    }
  };

  const handleBasicDetailsContinue = async () => {
    if (Object.keys(validateBasicDetails()).length > 0) {
      showMessage(
        'Please complete and verify all required details.',
        'error',
      );
      return;
    }

    setIsBreRunning(true);
    clearMessage();

    try {
      if (customerId && form.fatherName) {
        await updateBasicDetails(customerId, {
          fatherName: form.fatherName.trim(),
          dateOfBirth: form.dateOfBirth || undefined,
          gender: form.gender || undefined,
          residentialPincode: form.pincode ? form.pincode.trim() : undefined,
          email: form.email ? form.email.trim() : undefined,
          emailVerified: emailVerified,
        });

        const appRes = await resumeApplication(customerId);

        if (appRes?.applicationNumber) {
          setApplicationNumber(appRes.applicationNumber);
        }
      }

      // Allocate eligible lender and compute assessment fee. Must NOT be swallowed:
      // if no lender can be assigned right now, the customer must not be pushed onto
      // the assessment-fee screen with a fake "Lending Partner" name and a ₹0.00 fee
      // as if allocation had succeeded — let it throw into the outer catch below,
      // which keeps them on this step and shows a real, retryable error instead.
      await allocateLender(customerId);

      // Refresh customer profile to load allocated lender and fee snapshot
      await fetchCustomer();

      setCurrentStep('assessment_fee');
      setErrors({});

      showMessage(
        'Basic details saved. Please review and pay the assessment fee.',
      );

      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    } catch (error) {
      console.error('Save basic details or lender allocation failed:', error);
      const isAllocationFailure = error?.message?.includes('No lender route available');
      showMessage(
        isAllocationFailure
          ? 'We could not assign a lending partner right now. Please try again in a moment.'
          : 'Unable to proceed. Please check your details and try again.',
        'error',
      );
    } finally {
      setIsBreRunning(false);
    }
  };

  const handlePayClick = async () => {
    if (!customerId) {
      showMessage('Customer session missing. Please sign in again.', 'error');
      return;
    }

    if (!lenderConsent) {
      showMessage('Please provide lender data-sharing consent.', 'error');
      return;
    }

    setIsFeeProcessing(true);
    setShowPaymentRetryHint(false);
    clearMessage();

    if (paymentRetryHintTimerRef.current) {
      clearTimeout(paymentRetryHintTimerRef.current);
    }
    paymentRetryHintTimerRef.current = setTimeout(() => {
      setShowPaymentRetryHint(true);
    }, 8000);

    try {
      const EasebuzzCheckoutConstructor = await loadEasebuzzCheckout();

      const result = await initiateAssessmentPayment({
        purpose: 'ASSESSMENT_FEE',
        consentTemplateId: 'LENDER_DATA_SHARING_V1',
        consentVersion: '1.0',
        consentText: `I consent to share my application data with ${customer?.allocatedLenderName || customer?.allocatedLenderCode || 'Lending Partner'} for eligibility assessment and final decision.`,
      });

      const paymentData =
        result?.data?.data || result?.data || result || null;

      const accessKey = paymentData?.accessKey || null;
      const merchantKey = paymentData?.merchantKey || null;
      const env = paymentData?.environment || 'test';
      const pId = paymentData?.paymentId || '';
      const txId = paymentData?.transactionId || paymentData?.txnid || '';

      const invalidKeys = [
        'parameter validation failed',
        'invalid hash',
        'invalid key',
        'authentication failed',
      ];

      if (
        !accessKey ||
        invalidKeys.some((k) => String(accessKey).toLowerCase().includes(k))
      ) {
        throw new Error(
          typeof accessKey === 'string' && accessKey.length > 5
            ? accessKey
            : 'Easebuzz rejected payment initiation. Please try again.',
        );
      }

      setPaymentId(pId);
      setTransactionId(txId);

      const easebuzzCheckout = new EasebuzzCheckoutConstructor(
        merchantKey,
        env === 'prod' ? 'prod' : 'test',
      );

      const handleEasebuzzResponse = (paymentResponse) => {
        console.log('Easebuzz checkout callback response:', paymentResponse);

        // The widget called back at all, so it did open — the retry-hint fallback
        // (for when it never opens) is no longer relevant; the polling below (for
        // success/ambiguous outcomes) or the immediate reset (for failure) takes over.
        if (paymentRetryHintTimerRef.current) {
          clearTimeout(paymentRetryHintTimerRef.current);
        }
        setShowPaymentRetryHint(false);

        const status = String(
          paymentResponse?.status || paymentResponse?.payment_status || '',
        ).toLowerCase();

        const successStatuses = ['success', 'successful', 'paid', 'captured', 'completed'];
        const failureStatuses = ['failure', 'failed', 'cancelled', 'canceled', 'declined', 'expired', 'bounced'];

        if (successStatuses.includes(status)) {
          showMessage('Payment submitted. Confirming status with server...', 'info');
          startPaymentPolling(txId, pId);
        } else if (failureStatuses.includes(status)) {
          const errMsg =
            paymentResponse?.error_Message ||
            paymentResponse?.message ||
            'Payment was cancelled or failed.';
          showMessage(errMsg, 'error');
          setIsFeeProcessing(false);
        } else {
          showMessage('Payment popup closed. Verifying payment status...', 'info');
          startPaymentPolling(txId, pId);
        }
      };

      easebuzzCheckout.initiatePayment({
        access_key: accessKey,
        onResponse: handleEasebuzzResponse,
        theme: '#0E3B2C',
      });
    } catch (error) {
      console.error('Failed to initiate Easebuzz payment:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Payment initiation failed.';
      showMessage(errorMessage, 'error');
      setIsFeeProcessing(false);
      if (paymentRetryHintTimerRef.current) {
        clearTimeout(paymentRetryHintTimerRef.current);
      }
      setShowPaymentRetryHint(false);
    }
  };

  const handleRetryPayment = () => {
    if (paymentRetryHintTimerRef.current) {
      clearTimeout(paymentRetryHintTimerRef.current);
    }
    setShowPaymentRetryHint(false);
    setIsFeeProcessing(false);
    showMessage('You can try the payment again.', 'info');
  };

  const startPaymentPolling = (txId, pId) => {
    setIsCheckingPayment(true);
    let attempts = 0;
    const maxAttempts = 60; // 3 minutes at 3s interval

    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
    }

    const checkStatus = async () => {
      attempts += 1;

      try {
        const result = await getAssessmentPaymentStatus(pId, txId);

        const statusPayload =
          result?.data?.data || result?.data || result || null;

        const currentStatus = String(
          statusPayload?.status || statusPayload?.paymentStatus || '',
        ).toUpperCase();

        const successStatuses = ['SUCCESS', 'PAID', 'CAPTURED', 'COMPLETED'];
        const failureStatuses = ['FAILED', 'CANCELLED', 'CANCELED', 'DECLINED', 'EXPIRED'];

        if (successStatuses.includes(currentStatus)) {
          if (pollingTimerRef.current) {
            clearInterval(pollingTimerRef.current);
          }
          setIsFeeProcessing(false);
          setIsCheckingPayment(false);
          setFeePaid(true);

          const lenderDisplayName = customer?.allocatedLenderName || customer?.allocatedLenderCode || 'Lending Partner';

          // Open Eligibility Evaluation Modal in CHECKING state
          setEligibilityModalState({
            isOpen: true,
            status: 'CHECKING',
            message: 'Evaluating your application against platform policy and underwriting guidelines...',
            allocatedLender: lenderDisplayName,
          });

          // Automatically trigger Check Eligibility (Platform Policy / BRE)
          try {
            const rawResult = await runEligibility(customerId);
            const result = rawResult?.data || rawResult;

            if (result?.outcome === 'FAIL') {
              setBrePassed(false);
              setEligibilityModalState({
                isOpen: true,
                status: 'REJECTED',
                message: 'Based on the information provided, we are unable to proceed with your application at this time as it does not meet our current platform policies.',
                allocatedLender: lenderDisplayName,
              });
              await fetchCustomer();
              return;
            }

            setBrePassed(true);
            setEligibilityModalState({
              isOpen: true,
              status: 'APPROVED',
              message: `Congratulations! Your application has passed eligibility criteria with ${lenderDisplayName}. You can now complete your profile details.`,
              allocatedLender: lenderDisplayName,
            });
            await fetchCustomer();
          } catch (breErr) {
            console.error('Automatic eligibility check error:', breErr);
            setEligibilityModalState({
              isOpen: true,
              status: 'REJECTED',
              message: 'Based on the information provided, we are unable to proceed with your application at this time as it does not meet our current platform policies.',
              allocatedLender: lenderDisplayName,
            });
            await fetchCustomer();
          }
          return;
        }

        if (failureStatuses.includes(currentStatus)) {
          if (pollingTimerRef.current) {
            clearInterval(pollingTimerRef.current);
          }
          setIsFeeProcessing(false);
          setIsCheckingPayment(false);
          setFeePaid(false);
          showMessage('Payment verification failed or was cancelled.', 'error');
          return;
        }
      } catch (err) {
        console.error('Payment polling error:', err);
      }

      if (attempts >= maxAttempts) {
        if (pollingTimerRef.current) {
          clearInterval(pollingTimerRef.current);
        }
        setIsFeeProcessing(false);
        setIsCheckingPayment(false);
        showMessage(
          'Payment confirmation timed out. If debited, your application status will update automatically.',
          'error',
        );
      }
    };

    checkStatus();
    pollingTimerRef.current = setInterval(checkStatus, 3000);
  };

  useEffect(() => {
    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
      }
      if (paymentRetryHintTimerRef.current) {
        clearTimeout(paymentRetryHintTimerRef.current);
      }
    };
  }, []);

  const handleProceedFromEligibilityModal = () => {
    setEligibilityModalState((prev) => ({ ...prev, isOpen: false }));
    goToStep('profile_details');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleViewRejectionFromEligibilityModal = () => {
    setEligibilityModalState((prev) => ({ ...prev, isOpen: false }));
    goToStep('rejection_screen');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleProceedToProfile = () => {
    goToStep('profile_details');
  };

  const handleProfileContinue = async () => {
    if (!validateProfileDetails()) {
      showMessage(
        'Please complete all required profile details.',
        'error',
      );
      return;
    }

    if (!savedPhotoDocument) {
      showMessage(
        'Live photograph and location verification is required before completing profile.',
        'error',
      );
      return;
    }

    setIsSaving(true);
    clearMessage();

    try {
      await updateCustomerProfile(customerId, form);
      showMessage('Profile details and live photograph saved successfully.');
      await fetchCustomer();
      goToStep('aadhaar_kyc');
    } catch (err) {
      console.error('Failed to save profile details:', err);
      showMessage(
        err.message || 'Failed to save profile details. Please try again.',
        'error',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    clearMessage();

    try {
      await delay(500);
      // TODO: Integrate with backend Application Draft Save endpoint when available
      showMessage('Application draft saved successfully.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitApplication = async ({ sameAsPermanent, decisionConsentAccepted } = {}) => {
    const basicDetailsErrors = validateBasicDetails();
    if (Object.keys(basicDetailsErrors).length > 0) {
      // goToStep() clears the error map as part of resetting the screen — re-apply it
      // right after so the customer actually sees which field sent them back here,
      // instead of landing on a blank basic-details page with no explanation.
      goToStep('basic_details');
      setErrors(basicDetailsErrors);
      const missing = Object.keys(basicDetailsErrors)
        .map((key) => BASIC_DETAILS_FIELD_LABELS[key] || key)
        .join(', ');
      showMessage('Please complete: ' + missing + '.', 'error');
      return;
    }

    if (!brePassed) {
      showMessage(
        'Platform eligibility check is incomplete.',
        'error',
      );
      goToStep('basic_details');
      return;
    }

    if (!feePaid || !lenderConsent) {
      showMessage(
        'Assessment fee or lender consent is incomplete.',
        'error',
      );
      goToStep('assessment_fee');
      return;
    }

    if (!validateProfileDetails()) {
      showMessage('Profile details are incomplete.', 'error');
      goToStep('profile_details');
      return;
    }

    if (!workflow.aadhaarKycCompleted) {
      showMessage('Please complete Aadhaar KYC through DigiLocker before submitting your application.', 'error');
      goToStep('aadhaar_kyc');
      return;
    }

    if (!decisionConsentAccepted) {
      showMessage('Please provide the required lender decision consents.', 'error');
      return;
    }

    if (!sameAsPermanent && (!savedPhotoDocument?.formattedAddress || !savedPhotoDocument?.city || !savedPhotoDocument?.state || !savedPhotoDocument?.postalCode)) {
      showMessage('Current structured address is incomplete. Please recapture the live photo with location enabled.', 'error');
      goToStep('profile_details');
      return;
    }

    setIsSubmitting(true);
    clearMessage();

    try {
      await saveApplicationAddress(sameAsPermanent ? {
        addressType: 'CURRENT',
        sameAsPermanent: true,
      } : {
        addressType: 'CURRENT',
        sameAsPermanent: false,
        source: 'CUSTOMER',
        addressLine1: savedPhotoDocument.formattedAddress,
        city: savedPhotoDocument.city,
        state: savedPhotoDocument.state,
        country: savedPhotoDocument.country || 'India',
        pincode: savedPhotoDocument.postalCode,
      });
      await acceptLenderDecisionConsents();
      const res = await submitCustomerApplication(customerId);
      const appNum = res?.applicationNumber || '';

      setApplicationNumber(appNum);
      setSubmissionData(res);
      setApplicationSubmitted(true);
      setShowSubmissionModal(true);

      fetchCustomer();
      showMessage('Application submitted successfully for final approval.');
    } catch (submissionError) {
      console.error('Application submission failed:', submissionError);
      const msg = typeof submissionError === 'string'
        ? submissionError
        : submissionError?.message || 'Unable to submit the application. Please try again.';
      showMessage(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };



  if (!customerId) {
    return null;
  }

  if (isCustomerLoading) {
    return (
    <div className="mx-auto w-full max-w-[1280px] px-3 sm:px-4 md:px-6 lg:px-8">
        <div className="overflow-hidden rounded-[28px] bg-[#0E3B2C] p-7 sm:p-9">
          <div className="h-3 w-32 rounded-full bg-white/10 motion-safe:animate-pulse" />
          <div className="mt-4 h-8 w-72 max-w-full rounded-2xl bg-white/10 motion-safe:animate-pulse" />
          <div className="mt-4 h-3 w-96 max-w-full rounded-full bg-white/10 motion-safe:animate-pulse" />
          <div className="mt-8 h-1.5 w-full rounded-full bg-white/10 motion-safe:animate-pulse" />
        </div>

        <div className={`mt-6 ${CARD} p-7 sm:p-9`}>
          <div className="h-5 w-56 rounded-full bg-slate-200/80 motion-safe:animate-pulse" />
          <div className="mt-3 h-3 w-80 max-w-full rounded-full bg-slate-200/60 motion-safe:animate-pulse" />
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="space-y-2">
                <div className="h-3 w-24 rounded-full bg-slate-200/70 motion-safe:animate-pulse" />
                <div className="h-12 rounded-2xl bg-slate-100 motion-safe:animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (customerLoadError) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className={`mx-auto max-w-lg ${CARD} p-8 text-center sm:p-10`}>
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-600 ring-8 ring-rose-50/50">
            <AlertCircle size={26} />
          </div>

          <h2 className="mt-6 text-xl font-bold text-[#13211A]">
            Your application didn't load
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            {customerLoadError}
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Nothing you have filled in is lost. Check your connection and try again.
          </p>

          <button
            type="button"
            onClick={fetchCustomer}
            className={`mt-7 ${BTN_PRIMARY}`}
          >
            <RotateCcw size={16} />
            Try again
          </button>
        </div>
      </div>
    );
  }

  const workflow = deriveCustomerWorkflow(customer);

  return (
   <div className="mx-auto w-full max-w-[1280px] px-3 pb-10 sm:px-4 md:px-6 lg:px-8 text-[#13211A]">
      <ApplicationProgress
        currentStep={currentStep}
        workflow={workflow}
      />

      {message && (
        <MessageBanner
          message={message}
          type={messageType}
        />
      )}

      {/* key={currentStep} forces React to remount this wrapper whenever the active step
          changes, which re-triggers the CSS animation below — a lightweight "attractive
          transition to the next step" without touching any of the step logic itself. */}
      <div key={currentStep} className="animate-step-enter">
      {currentStep ===
        'basic_details' && (
          <BasicDetailsStep
            customerId={customerId}
            form={form}
            errors={errors}
            mobileNumber={mobileNumber}
            emailVerified={
              emailVerified
            }
            isEmailVerifying={
              isEmailVerifying
            }
            isEmailOtpSent={
              isEmailOtpSent
            }
            emailOtp={emailOtp}
            developmentEmailOtp={
              developmentEmailOtp
            }
            panVerified={panVerified}
            panVerification={panVerification}
            isPanVerifying={
              isPanVerifying
            }
            isBreRunning={isBreRunning}
            isSaving={isSaving}
            onChange={handleChange}
            onVerifyEmail={
              handleVerifyEmail
            }
            onSendEmailOtp={
              handleSendEmailOtp
            }
            onVerifyEmailOtp={
              handleVerifyEmailOtp
            }
            onEmailOtpChange={
              setEmailOtp
            }
            onVerifyPan={
              handleVerifyPan
            }
            onSaveDraft={
              handleSaveDraft
            }
            onContinue={
              handleBasicDetailsContinue
            }
            platformProducts={platformProducts}
            isLoadingPlatformProducts={isLoadingPlatformProducts}
            applicationNumber={applicationNumber}
          />
        )}

      {currentStep === 'assessment_fee' && (
        <AssessmentFeeStep
          customer={customer}
          lenderConsent={lenderConsent}
          feePaid={feePaid}
          isFeeProcessing={isFeeProcessing}
          isCheckingPayment={isCheckingPayment}
          showPaymentRetryHint={showPaymentRetryHint}
          transactionId={transactionId}
          onConsentChange={setLenderConsent}
          onBack={() => goToStep('basic_details')}
          onPay={handlePayClick}
          onRetryPayment={handleRetryPayment}
          onContinue={handleProceedToProfile}
        />
      )}

      {currentStep === 'rejection_screen' && (
        <RejectionPanel
          reapply={customer?.journey?.reapply}
          isApplyingAgain={isApplyingAgain}
          applyAgainError={applyAgainError}
          onApplyAgain={handleApplyAgain}
          onHome={() => navigate('/')}
        />
      )}

      {currentStep === 'profile_details' && (
        <ProfileDetailsStep
          customerId={customerId}
          applicationId={customer?.latestApplicationId}
          customerCode={customer?.customerCode}
          customer={customer}
          savedPhotoDocument={savedPhotoDocument}
          onPhotoSaved={setSavedPhotoDocument}
          form={form}
          errors={errors}
          isSaving={isSaving}
          onChange={handleChange}
          onBack={() => goToStep('assessment_fee')}
          onSaveDraft={handleSaveDraft}
          onContinue={handleProfileContinue}
        />
      )}

      {currentStep === 'aadhaar_kyc' && (
        <AadhaarKycStep
          customerId={customerId}
          customerCode={customer?.customerCode}
          customer={customer}
          workflow={workflow}
          onCompleted={() => {
            fetchCustomer();
          }}
          onBack={() => goToStep('profile_details')}
        />
      )}

      {currentStep === 'account_aggregator' && (
        <AccountAggregatorStep
          lan={customer?.journey?.platformLan || customer?.journey?.applicationReference || customer?.latestApplicationReference || customer?.lan || applicationNumber}
          consentText={resolveConsentText(customer, 'ACCOUNT_AGGREGATOR')}
          customer={customer}
          onCustomerUpdate={fetchCustomer}
          onComplete={() => {
            fetchCustomer();
          }}
          isCompleted={Boolean(workflow?.aaCompleted)}
        />
      )}

      {currentStep === 'submit_application' && (
        <SubmitApplicationStep
          form={form}
          customer={customer}
          savedPhotoDocument={savedPhotoDocument}
          mobileNumber={mobileNumber}
          applicationSubmitted={applicationSubmitted}
          applicationNumber={applicationNumber}
          isSubmitting={isSubmitting}
          isApplyingAgain={isApplyingAgain}
          applyAgainError={applyAgainError}
          onApplyAgain={handleApplyAgain}
          onBack={() => goToStep('aadhaar_kyc')}
          onSubmit={handleSubmitApplication}
        />
      )}
      {currentStep === 'pre_approval_offer_selection' && (
        <PreApprovalOfferStep
          lan={customer?.journey?.platformLan}
          onSelected={() => fetchCustomer()}
        />
      )}
      {currentStep === 'integration_processing' && <ProcessingPanel />}
      {currentStep === 'integration_support' && (
        <IntegrationSupportCard
          customer={customer}
          isRetrying={isRetryingLenderSubmission}
          retryError={retryLenderSubmissionError}
          onRetry={handleRetryLenderSubmission}
          onClearError={() => setRetryLenderSubmissionError('')}
        />
      )}

      {/* Auto Eligibility Check Result Modal */}
      <EligibilityCheckModal
        isOpen={eligibilityModalState.isOpen}
        status={eligibilityModalState.status}
        message={eligibilityModalState.message}
        allocatedLender={eligibilityModalState.allocatedLender}
        onProceed={handleProceedFromEligibilityModal}
        onViewRejection={handleViewRejectionFromEligibilityModal}
      />
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Shared journey header                                             */
/* ================================================================== */

function ApplicationProgress({ currentStep, workflow }) {
  const stepIndices = {
    basic_details: 0,
    assessment_fee: 1,
    profile_details: 2,
    aadhaar_kyc: 3,
    account_aggregator: 4,
    submit_application: 5,
  };

  const isFlowStep = Object.prototype.hasOwnProperty.call(stepIndices, currentStep);
  const currentStepIndex = stepIndices[currentStep] ?? 0;
  const copy = STEP_COPY[currentStep];
  const stepsLeft = FLOW_STEPS.length - (currentStepIndex + 1);

  const isStepComplete = (stepId) => {
    if (stepId === 'basic_details') return Boolean(workflow?.basicDetailsCompleted);
    if (stepId === 'assessment_fee') return Boolean(workflow?.assessmentFeePaid);
    if (stepId === 'profile_details') return Boolean(workflow?.profileDetailsCompleted);
    if (stepId === 'aadhaar_kyc') return Boolean(workflow?.aadhaarKycCompleted);
    if (stepId === 'account_aggregator') return Boolean(workflow?.aaCompleted);
    if (stepId === 'submit_application') return Boolean(workflow?.applicationSubmitted);
    return false;
  };

  return (
    <section className="relative mb-6 overflow-hidden rounded-[28px] bg-[#0E3B2C] text-white">
      {/* leaf-vein texture, the one decorative moment on the page */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-28 h-[420px] w-[420px] text-white/[0.06]"
        viewBox="0 0 200 200"
        fill="none"
      >
        <path
          d="M100 10C150 40 180 90 160 150C140 190 60 190 40 150C20 90 50 40 100 10Z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path d="M100 10V190" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M100 60L140 40M100 90L155 70M100 120L160 105M100 60L60 40M100 90L45 70M100 120L40 105M100 150L140 140M100 150L60 140"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      </svg>

      <div className="relative px-6 py-7 sm:px-9 sm:py-8">
        <p className="text-sm text-emerald-100/70">Personal loan application</p>

        <h1 className="mt-1.5 max-w-xl text-2xl font-bold leading-[1.15] tracking-[-0.02em] sm:text-[28px]">
          {copy ? copy.title : 'Your application'}
        </h1>

        <p className="mt-2.5 max-w-lg text-sm leading-6 text-emerald-50/70">
          {copy ? copy.hint : 'We will keep you posted here at every stage.'}
        </p>

        {isFlowStep && (
          <div className="mt-7">
            <div className="flex items-center justify-between text-xs text-emerald-100/70">
              <span>
                Step {currentStepIndex + 1} of {FLOW_STEPS.length}
              </span>
              <span>
                {stepsLeft === 0
                  ? 'Final step'
                  : stepsLeft === 1
                    ? '1 step to go'
                    : `${stepsLeft} steps to go`}
              </span>
            </div>

            {/* A slim rail instead of the old labelled stepper: the customer sees how far
                along they are without reading the system's internal step names. */}
            <div className="mt-3 flex gap-1.5" aria-hidden="true">
              {FLOW_STEPS.map((step, index) => {
                const done = isStepComplete(step.id);
                const current = index === currentStepIndex;
                return (
                  <span
                    key={step.id}
                    className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${
                      done ? 'bg-[#9BE3B5]' : current ? 'bg-white' : 'bg-white/15'
                    }`}
                  />
                );
              })}
            </div>
          </div>
        )}

        <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs text-emerald-50 ring-1 ring-white/15">
          <ShieldCheck size={13} />
          Encrypted, and shared only with your lender
        </p>
      </div>
    </section>
  );
}

function MessageBanner({
  message,
  type,
}) {
  const isError = type === 'error';

  return (
    <div
      role="status"
      className={`mb-6 flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-sm ${
        isError
          ? 'border-rose-100 bg-rose-50 text-rose-800'
          : 'border-[#C9E6D5] bg-[#E7F4EC] text-[#0E3B2C]'
      }`}
    >
      {isError ? (
        <AlertCircle size={17} className="mt-0.5 shrink-0" />
      ) : (
        <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
      )}
      <span className="leading-6">{message}</span>
    </div>
  );
}

/* ================================================================== */
/*  Eligibility result modal                                          */
/* ================================================================== */

function EligibilityCheckModal({
  isOpen,
  status,
  message,
  allocatedLender,
  onProceed,
  onViewRejection,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A2318]/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md overflow-hidden rounded-[28px] bg-white shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="p-8 text-center sm:p-9">
          {status === 'CHECKING' && (
            <div className="flex flex-col items-center">
              <div className="relative grid h-20 w-20 place-items-center rounded-full bg-[#E7F4EC] text-[#1F8A5B]">
                <span className="absolute inset-0 rounded-full bg-[#9BE3B5]/40 motion-safe:animate-ping" />
                <LoaderCircle size={34} className="relative animate-spin" />
              </div>

              <h3 className="mt-6 text-xl font-bold tracking-tight text-[#13211A]">
                Checking your eligibility
              </h3>

              <p className="mt-2.5 max-w-xs text-sm leading-6 text-slate-600">
                {message || 'This takes a few seconds. Please keep this window open.'}
              </p>

              <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-xs text-slate-600">
                <ShieldCheck size={14} className="text-[#1F8A5B]" />
                Bank-grade security
              </p>
            </div>
          )}

          {status === 'APPROVED' && (
            <div className="flex flex-col items-center animate-in zoom-in-95 duration-300">
              <div className="grid h-20 w-20 place-items-center rounded-full bg-[#E7F4EC] text-[#1F8A5B] ring-8 ring-[#E7F4EC]/60">
                <CheckCircle2 size={40} />
              </div>

              <h3 className="mt-6 text-2xl font-bold tracking-tight text-[#13211A]">
                Good news — you qualify
              </h3>

              <p className="mt-2.5 max-w-sm text-sm leading-6 text-slate-600">
                {message || `Your application has passed our checks with ${allocatedLender || 'our lending partner'}.`}
              </p>

              <button
                type="button"
                onClick={onProceed}
                className={`mt-8 w-full ${BTN_PRIMARY}`}
              >
                Continue
                <ArrowRight size={17} />
              </button>
            </div>
          )}

          {status === 'REJECTED' && (
            <div className="flex flex-col items-center animate-in zoom-in-95 duration-300">
              <div className="grid h-20 w-20 place-items-center rounded-full bg-rose-50 text-rose-600 ring-8 ring-rose-50/60">
                <AlertCircle size={38} />
              </div>

              <h3 className="mt-6 text-2xl font-bold tracking-tight text-[#13211A]">
                We can't take this further
              </h3>

              <p className="mt-2.5 max-w-sm text-sm leading-6 text-slate-600">
                Based on the information provided, your application does not meet our current
                lending policy. You can see what this means and when you may apply again.
              </p>

              <button
                type="button"
                onClick={onViewRejection}
                className={`mt-8 w-full ${BTN_PRIMARY}`}
              >
                See what happens next
                <ArrowRight size={17} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Aadhaar KYC                                                       */
/* ================================================================== */

function AadhaarKycStep({
  customerId: _customerId,
  customerCode,
  customer,
  workflow: _workflow,
  onCompleted,
  onBack,
}) {
  // Fallback matters: an unresolved consent would otherwise render an empty label next to a
  // checkbox the customer still has to tick.
  const consentText = (type) =>
    resolveConsentText(
      customer,
      type,
      'I consent to DigiLocker-based Aadhaar KYC being initiated using my verified account information, and authorize the retrieval and processing of permitted identity information for loan onboarding, verification and lender submission.',
    );
  const [consentGiven, setConsentGiven] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [kycStatus, setKycStatus] = useState(null);
  const [polling, setPolling] = useState(false);
  const pollTimerRef = useRef(null);

  // Popup Blocked / SDK Launch handling
  const [showPopupBlockedModal, setShowPopupBlockedModal] = useState(false);
  const [pendingDigilockerUrl, setPendingDigilockerUrl] = useState('');

  const [sameAsPermanent, setSameAsPermanent] = useState(true);
  const [addressForm, setAddressForm] = useState({
    addressLine1: '',
    addressLine2: '',
    locality: '',
    landmark: '',
    pincode: '',
    city: '',
    state: '',
  });
  const [addressErrors, setAddressErrors] = useState({});
  const [isSavingAddress, setIsSavingAddress] = useState(false);

  // Aadhaar's parsed address doesn't always have every field populated (many real
  // Aadhaar records have an empty "house"/street line) — rather than silently guessing
  // or blocking the customer, prefill whatever DigiLocker gave us and let them complete
  // or correct it themselves before it's saved as their permanent address on record.
  const [permanentAddressForm, setPermanentAddressForm] = useState({
    addressLine1: '',
    addressLine2: '',
    locality: '',
    landmark: '',
    pincode: '',
    city: '',
    state: '',
  });
  const [permanentAddressErrors, setPermanentAddressErrors] = useState({});
  const hasPrefilledPermanentAddress = useRef(false);

  const fetchStatus = async () => {
    try {
      const res = await getCustomerAadhaarKycStatus();
      setKycStatus(res);
      if (res?.aadhaarVerified || res?.status === 'VERIFIED') {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        setPolling(false);
      }
      return res;
    } catch (err) {
      console.error('Failed to fetch Aadhaar KYC status:', err);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await refreshCustomerAadhaarKycStatus();
      setKycStatus(res);
      if (res?.aadhaarVerified || res?.status === 'VERIFIED') {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        setPolling(false);
      }
    } catch (err) {
      setError(err?.message || 'Failed to refresh status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    const handleMessage = (event) => {
      if (event.data?.type === 'DIGILOCKER_CALLBACK_RECEIVED') {
        handleRefresh();
      }
    };
    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const handleStartDigilocker = async () => {
    if (!consentGiven) return;
    setLoading(true);
    setError('');
    setShowPopupBlockedModal(false);
    try {
      const res = await initiateCustomerAadhaarKyc(customerCode);
      if (res?.verificationUrl) {
        setPendingDigilockerUrl(res.verificationUrl);

        const screenWidth = window.screen.availWidth || window.innerWidth;
        const screenHeight = window.screen.availHeight || window.innerHeight;

        let popup = null;
        try {
          popup = window.open(
            res.verificationUrl,
            'DigitapDigiLocker',
            `width=${screenWidth},height=${screenHeight},top=0,left=0,resizable=yes,scrollbars=yes,status=yes,location=yes`
          );
        } catch (e) {
          console.warn('Popup launch blocked by browser exception:', e);
          popup = null;
        }

        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
          try {
            popup = window.open(res.verificationUrl, '_blank');
          } catch {
            popup = null;
          }
        }

        // Detect if browser blocked popup (null, closed immediately, or no access)
        const isBlocked = !popup || popup.closed || typeof popup.closed === 'undefined';
        if (isBlocked) {
          setShowPopupBlockedModal(true);
          setLoading(false);
          return;
        }
      }

      setPolling(true);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(async () => {
        const statusRes = await fetchStatus();
        if (statusRes?.aadhaarVerified || statusRes?.status === 'VERIFIED') {
          clearInterval(pollTimerRef.current);
          setPolling(false);
        }
      }, 5000);
    } catch (err) {
      setError(err?.message || 'Failed to initiate DigiLocker verification.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDigilockerWindow = () => {
    if (!pendingDigilockerUrl) {
      handleStartDigilocker();
      return;
    }
    setShowPopupBlockedModal(false);
    const screenWidth = window.screen.availWidth || window.innerWidth;
    const screenHeight = window.screen.availHeight || window.innerHeight;
    try {
      window.open(
        pendingDigilockerUrl,
        'DigitapDigiLocker',
        `width=${screenWidth},height=${screenHeight},top=0,left=0,resizable=yes,scrollbars=yes,status=yes,location=yes`
      );
    } catch {
      window.open(pendingDigilockerUrl, '_blank');
    }
    setPolling(true);
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(async () => {
      const statusRes = await fetchStatus();
      if (statusRes?.aadhaarVerified || statusRes?.status === 'VERIFIED') {
        clearInterval(pollTimerRef.current);
        setPolling(false);
      }
    }, 5000);
  };

  const isVerified = Boolean(
    kycStatus?.aadhaarVerified ||
    kycStatus?.status === 'VERIFIED' ||
    customer?.aadhaarVerified ||
    customer?.digilockerStatus === 'VERIFIED'
  );

  useEffect(() => {
    if (hasPrefilledPermanentAddress.current) return;
    const aadhaarAddress = kycStatus?.permanentAddress;
    if (!aadhaarAddress) return;
    hasPrefilledPermanentAddress.current = true;
    setPermanentAddressForm({
      addressLine1: aadhaarAddress.addressLine1 || '',
      addressLine2: aadhaarAddress.addressLine2 || '',
      locality: aadhaarAddress.locality || '',
      landmark: aadhaarAddress.landmark || '',
      pincode: aadhaarAddress.pincode || '',
      city: aadhaarAddress.city || '',
      state: aadhaarAddress.state || '',
    });
  }, [kycStatus]);

  const validatePermanentAddress = () => {
    const errors = {};
    if (!permanentAddressForm.addressLine1?.trim()) errors.addressLine1 = 'Address Line 1 is required';
    if (!permanentAddressForm.city?.trim()) errors.city = 'City is required';
    if (!permanentAddressForm.state?.trim()) errors.state = 'State is required';
    if (!/^[1-9][0-9]{5}$/.test(permanentAddressForm.pincode)) errors.pincode = 'Valid 6-digit Pincode is required';
    setPermanentAddressErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateAddress = () => {
    const errors = {};
    if (!sameAsPermanent) {
      if (!addressForm.addressLine1?.trim()) errors.addressLine1 = 'Address Line 1 is required';
      if (!addressForm.city?.trim()) errors.city = 'City is required';
      if (!addressForm.state?.trim()) errors.state = 'State is required';
      if (!/^[1-9][0-9]{5}$/.test(addressForm.pincode)) errors.pincode = 'Valid 6-digit Pincode is required';
    }
    setAddressErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveAddress = async () => {
    if (!validatePermanentAddress()) return;
    if (!validateAddress()) return;
    setIsSavingAddress(true);
    setError('');
    try {
      // Always saved explicitly by the customer now, never assumed from the DigiLocker
      // webhook alone — see the earlier bug where an incomplete Aadhaar address left
      // this application with no PERMANENT row and no way for the customer to fix it.
      await saveApplicationAddress({ addressType: 'PERMANENT', ...permanentAddressForm });

      if (sameAsPermanent) {
        await saveApplicationAddress({ addressType: 'CURRENT', sameAsPermanent: true });
      } else {
        await saveApplicationAddress({
          addressType: 'CURRENT',
          sameAsPermanent: false,
          ...addressForm,
        });
      }
      onCompleted?.();
    } catch (err) {
      setError(err?.message || 'Failed to save address details.');
    } finally {
      setIsSavingAddress(false);
    }
  };

  return (
    <StepCard>
      <StepHeading
        icon={FileCheck2}
        eyebrow="AADHAAR VERIFICATION"
        title="Confirm your identity"
        description="A quick Aadhaar check through DigiLocker, the Government of India's own service."
      />

      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-x-10 gap-y-4 rounded-2xl bg-[#F7F9F6] px-5 py-4">
          <div>
            <p className="text-xs text-slate-500">Applicant</p>
            <p className="mt-0.5 text-sm font-semibold text-[#13211A]">{customer?.fullName || 'Not available'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Registered mobile</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-[#13211A]">
              {customer?.mobileNumber ? `+91 ${customer.mobileNumber.slice(0, 2)}****${customer.mobileNumber.slice(-4)}` : 'Not available'}
            </p>
          </div>
        </div>

        {isVerified ? (
          <div className="space-y-6">
            <div className="rounded-2xl bg-[#E7F4EC] p-6 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#0E3B2C] text-[#9BE3B5]">
                <CheckCircle2 size={24} />
              </div>
              <h3 className="mt-4 text-lg font-bold text-[#0E3B2C]">Identity verified</h3>
              <p className="mt-1 text-sm text-[#0E3B2C]/75">
                Your Aadhaar has been verified through DigiLocker.
                {kycStatus?.maskedAadhaar ? ` (${kycStatus.maskedAadhaar})` : ''}
              </p>
              {(kycStatus?.aadhaarVerifiedName || customer?.aadhaarVerifiedName) && (
                <p className="mt-2 text-sm font-semibold text-[#0E3B2C]">
                  {kycStatus?.aadhaarVerifiedName || customer?.aadhaarVerifiedName}
                </p>
              )}
            </div>

            <div className="space-y-7">
              <div>
                <h3 className="text-base font-bold text-[#13211A]">Permanent address</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Taken from your Aadhaar. Please check it and fill in anything missing — Aadhaar
                  records do not always carry a complete address.
                </p>
                <div className="mt-4">
                  <AddressFieldset
                    value={permanentAddressForm}
                    errors={permanentAddressErrors}
                    onChange={setPermanentAddressForm}
                    idPrefix="permanent"
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-6">
                <h3 className="text-base font-bold text-[#13211A]">Do you live at this address right now?</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 text-sm font-semibold transition ${
                      sameAsPermanent
                        ? 'border-[#1F8A5B] bg-[#E7F4EC] text-[#0E3B2C]'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="sameAsPermanent"
                      checked={sameAsPermanent}
                      onChange={() => setSameAsPermanent(true)}
                      className="h-4 w-4 accent-[#1F8A5B]"
                    />
                    Yes, same address
                  </label>
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 text-sm font-semibold transition ${
                      !sameAsPermanent
                        ? 'border-[#1F8A5B] bg-[#E7F4EC] text-[#0E3B2C]'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="sameAsPermanent"
                      checked={!sameAsPermanent}
                      onChange={() => setSameAsPermanent(false)}
                      className="h-4 w-4 accent-[#1F8A5B]"
                    />
                    No, I live elsewhere
                  </label>
                </div>
              </div>

              {!sameAsPermanent && (
                <div className="border-t border-slate-100 pt-6">
                  <h3 className="text-base font-bold text-[#13211A]">Current address</h3>
                  <div className="mt-4">
                    <AddressFieldset
                      value={addressForm}
                      errors={addressErrors}
                      onChange={setAddressForm}
                      idPrefix="current"
                    />
                  </div>
                </div>
              )}
            </div>

            {error && <InlineError message={error} />}
          </div>
        ) : (
          <>
            {/* Plain-language walkthrough before the legal consent text — a first-time
                applicant has likely never heard of DigiLocker and needs to know exactly
                what's about to happen before a new window pops up asking for Aadhaar. */}
            <div className="rounded-2xl bg-[#F7F9F6] p-5 sm:p-6">
              <h3 className="flex items-center gap-2 text-sm font-bold text-[#13211A]">
                <ShieldCheck size={17} className="text-[#1F8A5B]" />
                What happens next
              </h3>
              <ol className="mt-4 space-y-3.5 text-sm leading-6 text-slate-600">
                <li className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#D5EDDF] text-xs font-bold text-[#0E3B2C]">1</span>
                  A new window opens to <strong className="font-semibold text-[#13211A]">DigiLocker</strong>, a Government of India service that confirms your identity instantly.
                </li>
                <li className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#D5EDDF] text-xs font-bold text-[#0E3B2C]">2</span>
                  Enter your Aadhaar number and the OTP sent to your Aadhaar-linked mobile.
                </li>
                <li className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#D5EDDF] text-xs font-bold text-[#0E3B2C]">3</span>
                  Come back to this tab. We pick up automatically once you are verified.
                </li>
              </ol>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-5 transition hover:bg-slate-50">
              <input
                type="checkbox"
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[#1F8A5B]"
              />
              {/* Text comes from the backend consent catalogue, which is also what gets
                  hashed and stored as evidence — a local copy here would mean recording a
                  consent whose wording differs from what was actually shown. */}
              <span className="text-sm leading-6 text-slate-600">
                {consentText('AADHAAR_KYC')}
              </span>
            </label>

            {error && <InlineError message={error} />}

            <div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleStartDigilocker}
                  disabled={!consentGiven || loading}
                  className={BTN_PRIMARY}
                >
                  {loading ? <LoaderCircle size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                  Verify with DigiLocker
                </button>

                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={loading}
                  className={BTN_SECONDARY}
                  title="Already finished in the DigiLocker window? Refresh your status here."
                >
                  <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                  Check status
                </button>
              </div>

              {!consentGiven && !loading && (
                <p className="animate-fade-in mt-3 flex items-center gap-1.5 text-sm text-slate-500">
                  <Info size={14} className="shrink-0" />
                  Tick the consent box above to continue
                </p>
              )}
            </div>

            {polling && (
              <div className="flex items-center gap-3 rounded-2xl bg-[#E7F4EC] p-4 text-sm text-[#0E3B2C]">
                <LoaderCircle size={16} className="animate-spin text-[#1F8A5B]" />
                <span>Waiting for DigiLocker. Finish in the other window and come back here.</span>
              </div>
            )}
          </>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 pt-6">
          <button type="button" onClick={onBack} className={BTN_SECONDARY}>
            <ArrowLeft size={16} /> Back
          </button>

          {isVerified && (
            <button
              type="button"
              onClick={handleSaveAddress}
              disabled={isSavingAddress}
              className={BTN_PRIMARY}
            >
              {isSavingAddress ? <LoaderCircle size={16} className="animate-spin" /> : null}
              {isSavingAddress ? 'Saving' : 'Save and continue'}
              {!isSavingAddress && <ArrowRight size={16} />}
            </button>
          )}
        </div>
      </div>

      {/* Enable Popup Permission Modal */}
      {showPopupBlockedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A2318]/70 p-4 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md overflow-hidden rounded-[28px] bg-white shadow-2xl animate-scale-up">
            <div className="p-6 sm:p-7">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-700">
                  <ExternalLink size={24} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold leading-snug text-[#13211A]">
                    Your browser blocked the window
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Allow pop-ups for this site, then open DigiLocker again.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPopupBlockedModal(false)}
                  className="cursor-pointer rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                >
                  <X size={18} />
                </button>
              </div>

              <ol className="mt-5 space-y-3 rounded-2xl bg-[#F7F9F6] p-4 text-sm leading-6 text-slate-600">
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-800">1</span>
                  <span>Find the blocked pop-up icon in your browser's address bar.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-800">2</span>
                  <span>Choose <strong className="font-semibold text-[#13211A]">Always allow pop-ups</strong> for this site.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-800">3</span>
                  <span>Come back and open the DigiLocker window below.</span>
                </li>
              </ol>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleOpenDigilockerWindow}
                  className={`flex-1 ${BTN_PRIMARY}`}
                >
                  <ExternalLink size={16} />
                  Open DigiLocker
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPopupBlockedModal(false);
                    handleRefresh();
                  }}
                  className={BTN_SECONDARY}
                >
                  Check status
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </StepCard>
  );
}

/**
 * Address inputs, shared by the permanent and current address blocks. Purely
 * presentational: it writes back the same object shape the state setters already hold.
 */
function AddressFieldset({ value, errors, onChange, idPrefix }) {
  const update = (key) => (event) => {
    const raw = event.target.value;
    onChange({ ...value, [key]: key === 'pincode' ? raw.replace(/\D/g, '') : raw });
  };

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FormInput
          label="Address line 1"
          name={`${idPrefix}AddressLine1`}
          value={value.addressLine1}
          error={errors.addressLine1}
          onChange={update('addressLine1')}
          placeholder="Flat, house number, building"
          required
        />
      </div>
      <div className="sm:col-span-2">
        <FormInput
          label="Address line 2"
          name={`${idPrefix}AddressLine2`}
          value={value.addressLine2}
          onChange={update('addressLine2')}
          placeholder="Area, street, sector, village"
          helperText="Optional"
        />
      </div>
      <FormInput
        label="Locality"
        name={`${idPrefix}Locality`}
        value={value.locality}
        onChange={update('locality')}
        helperText="Optional"
      />
      <FormInput
        label="Landmark"
        name={`${idPrefix}Landmark`}
        value={value.landmark}
        onChange={update('landmark')}
        helperText="Optional"
      />
      <FormInput
        label="PIN code"
        name={`${idPrefix}Pincode`}
        value={value.pincode}
        error={errors.pincode}
        onChange={update('pincode')}
        maxLength={6}
        inputMode="numeric"
        required
      />
      <FormInput
        label="City"
        name={`${idPrefix}City`}
        value={value.city}
        error={errors.city}
        onChange={update('city')}
        required
      />
      <div className="sm:col-span-2">
        <FormInput
          label="State"
          name={`${idPrefix}State`}
          value={value.state}
          error={errors.state}
          onChange={update('state')}
          required
        />
      </div>
    </div>
  );
}

function InlineError({ message }) {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-800">
      <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-600" />
      <span className="leading-6">{message}</span>
    </div>
  );
}

/* ================================================================== */
/*  Step 1 — Basic details                                            */
/* ================================================================== */

function BasicDetailsStep({
  customerId,
  form,
  errors,
  mobileNumber,
  emailVerified,
  isEmailVerifying,
  isEmailOtpSent,
  emailOtp,
  developmentEmailOtp,
  panVerified,
  panVerification,
  isPanVerifying,
  isBreRunning,
  isSaving,
  onChange,
  onVerifyEmail: _onVerifyEmail,
  onSendEmailOtp,
  onVerifyEmailOtp,
  onEmailOtpChange,
  onVerifyPan,
  onSaveDraft,
  onContinue,
  platformProducts: _platformProducts,
  isLoadingPlatformProducts: _isLoadingPlatformProducts,
  applicationNumber: _applicationNumber,
}) {
  const {
    city: pincodeCity,
    state: pincodeState,
    isLoading: isPincodeLoading,
    error: pincodeError,
  } = usePincodeLookup(panVerified ? form.pincode : '');

  useEffect(() => {
    if (
      customerId &&
      form.pincode &&
      /^[1-9][0-9]{5}$/.test(form.pincode.trim()) &&
      pincodeCity &&
      pincodeState
    ) {
      const savePincodeToBackend = async () => {
        try {
          await updatePincode(customerId, {
            pincode: form.pincode.trim(),
            city: pincodeCity,
            state: pincodeState,
          });
          console.log(
            `Auto-saved residential PIN code ${form.pincode} (${pincodeCity}, ${pincodeState}) to customer table.`,
          );
        } catch (err) {
          console.error('Failed to auto-save residential PIN code to backend:', err);
        }
      };

      savePincodeToBackend();
    }
  }, [customerId, form.pincode, pincodeCity, pincodeState]);

  const [isOcrScanning, setIsOcrScanning] = useState(false);
  const [ocrSuccessMsg, setOcrSuccessMsg] = useState('');
  const [ocrError, setOcrError] = useState('');
  const [isPanCameraOpen, setIsPanCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);

  const panFileInputRef = useRef(null);
  const panCameraInputRef = useRef(null);
  const panVideoRef = useRef(null);

  const handlePanOcrFile = async (file) => {
    if (!file) return;
    setIsOcrScanning(true);
    setOcrError('');
    setOcrSuccessMsg('');

    try {
      const result = await processPanOcr(file);
      const data = result?.data || result || {};
      const extractedPan = (data.panNumber || data.pan_number || '').trim().toUpperCase();
      const extractedName = (data.fullName || data.name || '').trim();
      const extractedFatherName = (data.fatherName || data.father_name || '').trim();

      if (!extractedPan && !extractedName) {
        throw new Error('Could not extract PAN details from the image. Please enter details manually or try a clearer image.');
      }

      if (extractedName) {
        onChange({ target: { name: 'fullName', value: extractedName } });
      }
      if (extractedPan) {
        onChange({ target: { name: 'panNumber', value: extractedPan } });
      }
      if (extractedFatherName) {
        onChange({ target: { name: 'fatherName', value: extractedFatherName } });
      }

      setOcrSuccessMsg(
        `Auto-populated PAN: "${extractedPan || '—'}"${extractedName ? `, Name: "${extractedName}"` : ''}${extractedFatherName ? `, Father's Name: "${extractedFatherName}"` : ''}. Please click "Verify PAN" to proceed.`
      );
    } catch (err) {
      setOcrError(err?.message || 'PAN OCR processing failed. Please enter details manually or try uploading a clearer image.');
    } finally {
      setIsOcrScanning(false);
    }
  };

  const handlePanFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handlePanOcrFile(file);
      e.target.value = '';
    }
  };

  const handleOpenPanCamera = async () => {
    setOcrError('');
    setOcrSuccessMsg('');
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        setCameraStream(stream);
        setIsPanCameraOpen(true);
      } else {
        panCameraInputRef.current?.click();
      }
    } catch {
      panCameraInputRef.current?.click();
    }
  };

  const handleClosePanCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setIsPanCameraOpen(false);
  };

  useEffect(() => {
    if (isPanCameraOpen && panVideoRef.current && cameraStream) {
      panVideoRef.current.srcObject = cameraStream;
    }
  }, [isPanCameraOpen, cameraStream]);

  const handleCapturePanPhoto = () => {
    if (!panVideoRef.current) return;
    const video = panVideoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (blob) {
        const capturedFile = new File([blob], `pan_camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
        handleClosePanCamera();
        handlePanOcrFile(capturedFile);
      }
    }, 'image/jpeg', 0.92);
  };

  return (
    <StepCard>
      <StepHeading
        icon={CircleUserRound}
        eyebrow="APPLICATION DETAILS"
        title={panVerified ? 'Your verified details' : 'Verify your PAN'}
        description={
          panVerified
            ? 'These came straight from the PAN database. Add the few remaining details to continue.'
            : 'Enter your 10-digit PAN. We will fill in your name, date of birth and gender for you.'
        }
        right={
          <StatusBadge>
            <Phone size={14} />
            Mobile verified
          </StatusBadge>
        }
      />

      {!panVerified && (
        <div className="mb-7 overflow-hidden rounded-2xl bg-[#F7F9F6] p-5 sm:p-6">
          <div className="flex items-start gap-3.5">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#0E3B2C] text-[#9BE3B5]">
              <ScanLine size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[#13211A]">
                Skip the typing — scan your PAN card
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Upload a photo and we will read your name and PAN number from it.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <input
              type="file"
              ref={panFileInputRef}
              accept="image/*,.pdf"
              onChange={handlePanFileChange}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => panFileInputRef.current?.click()}
              disabled={isOcrScanning}
              className={BTN_SECONDARY}
            >
              {isOcrScanning ? (
                <LoaderCircle size={16} className="animate-spin text-[#1F8A5B]" />
              ) : (
                <Upload size={16} className="text-[#1F8A5B]" />
              )}
              Upload photo
            </button>

            <input
              type="file"
              ref={panCameraInputRef}
              accept="image/*"
              capture="environment"
              onChange={handlePanFileChange}
              className="hidden"
            />

            <button
              type="button"
              onClick={handleOpenPanCamera}
              disabled={isOcrScanning}
              className={BTN_SOFT}
            >
              {isOcrScanning ? <LoaderCircle size={16} className="animate-spin" /> : <Camera size={16} />}
              Use camera
            </button>
          </div>

          {isOcrScanning && (
            <div className="mt-4 flex items-center gap-2.5 rounded-2xl bg-white p-3.5 text-sm text-[#0E3B2C]">
              <LoaderCircle size={16} className="shrink-0 animate-spin text-[#1F8A5B]" />
              <span>Reading your PAN card…</span>
            </div>
          )}

          {ocrSuccessMsg && !isOcrScanning && (
            <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-[#E7F4EC] p-3.5 text-sm leading-6 text-[#0E3B2C]">
              <Sparkles size={16} className="mt-0.5 shrink-0 text-[#1F8A5B]" />
              <span>{ocrSuccessMsg}</span>
            </div>
          )}

          {ocrError && !isOcrScanning && (
            <div className="mt-4">
              <InlineError message={ocrError} />
            </div>
          )}
        </div>
      )}

      {/* Camera Capture Modal */}
      {isPanCameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A2318]/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg overflow-hidden rounded-[28px] bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-[#13211A]">Photograph your PAN card</h3>
              <button
                type="button"
                onClick={handleClosePanCamera}
                className="cursor-pointer rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="relative mb-4 overflow-hidden rounded-2xl bg-black">
              <video
                ref={panVideoRef}
                autoPlay
                playsInline
                muted
                className="h-64 w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                <div className="flex h-44 w-full items-center justify-center rounded-2xl border-2 border-dashed border-white/80 text-sm font-semibold text-white/90">
                  Line up the card inside this frame
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={handleClosePanCamera} className={BTN_SECONDARY}>
                Cancel
              </button>
              <button type="button" onClick={handleCapturePanPhoto} className={BTN_PRIMARY}>
                <Camera size={16} />
                Capture
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-xl">
        <label className="mb-2 block text-sm font-semibold text-slate-700">
          PAN number
          <span className="ml-1 text-rose-500">*</span>
        </label>

        <div
          className={`flex min-h-12 overflow-hidden rounded-2xl border bg-white transition ${
            errors.panNumber
              ? 'border-rose-300 ring-4 ring-rose-50'
              : panVerified
                ? 'border-[#1F8A5B] ring-4 ring-[#E7F4EC]'
                : 'border-slate-200 focus-within:border-[#1F8A5B] focus-within:ring-4 focus-within:ring-[#E7F4EC]'
          }`}
        >
          <input
            type="text"
            name="panNumber"
            value={
              form.panNumber
            }
            onChange={onChange}
            readOnly={
              panVerified
            }
            placeholder="ABCDE1234F"
            maxLength={10}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[15px] font-semibold uppercase tracking-wider text-[#13211A] outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 read-only:text-slate-600"
          />

          <button
            type="button"
            onClick={
              onVerifyPan
            }
            disabled={
              isPanVerifying ||
              panVerified ||
              form.panNumber
                .length !== 10
            }
            className={`flex shrink-0 cursor-pointer items-center gap-1.5 px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              panVerified
                ? 'bg-[#E7F4EC] text-[#0E3B2C]'
                : 'bg-[#0E3B2C] text-white hover:bg-[#145239]'
            }`}
          >
            {isPanVerifying ? (
              <>
                <LoaderCircle
                  size={15}
                  className="animate-spin"
                />
                Verifying
              </>
            ) : panVerified ? (
              <>
                <CheckCircle2
                  size={15}
                />
                Verified
              </>
            ) : (
              'Verify'
            )}
          </button>
        </div>

        {errors.panNumber ? (
          <p className="animate-fade-in mt-2 text-sm text-rose-600">
            {
              errors.panNumber
            }
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            Ten characters, like ABCDE1234F
          </p>
        )}
      </div>

      {!panVerified && (
        <div className="mt-6 flex max-w-xl items-start gap-3 rounded-2xl bg-[#F7F9F6] p-4 text-sm leading-6 text-slate-600">
          <Info
            size={18}
            className="mt-0.5 shrink-0 text-[#1F8A5B]"
          />
          <p>
            Your name, father's name, date of birth and gender will fill in on their own once
            your PAN is verified.
          </p>
        </div>
      )}

      {panVerified && (
        <>
          <div className="mt-7 flex items-start gap-3 rounded-2xl bg-[#E7F4EC] p-5">
            <CheckCircle2
              size={20}
              className="mt-0.5 shrink-0 text-[#1F8A5B]"
            />
            <div>
              <p className="text-sm font-bold text-[#0E3B2C]">
                PAN verified
              </p>
              <p className="mt-0.5 text-sm text-[#0E3B2C]/75">
                We have filled in everything we could from your PAN record.
              </p>
            </div>
          </div>

          <div className="mt-8">
            <SectionHeading
              title="Your details"
              description="Straight from the PAN database — only add what is missing."
            />

            <div className="grid gap-5 md:grid-cols-2">
              <FormInput
                label="Full name"
                value={
                  form.fullName
                }
                readOnly
                disabled
                helperText="From your PAN"
              />

              <FormInput
                label="Date of birth"
                name="dateOfBirth"
                type="date"
                value={form.dateOfBirth}
                error={errors.dateOfBirth}
                onChange={onChange}
                readOnly={Boolean(panVerification?.dateOfBirth)}
                disabled={Boolean(panVerification?.dateOfBirth)}
                helperText={
                  panVerification?.dateOfBirth
                    ? 'From your PAN'
                    : 'Add your date of birth'
                }
              />

              <FormSelect
                label="Gender"
                name="gender"
                value={form.gender}
                error={errors.gender}
                onChange={onChange}
                disabled={Boolean(panVerification?.gender)}
                helperText={
                  panVerification?.gender
                    ? 'From your PAN'
                    : 'Choose your gender'
                }
                options={[
                  ['MALE', 'Male'],
                  ['FEMALE', 'Female'],
                  ['OTHER', 'Other'],
                ]}
              />

              <FormInput
                label="Father's name"
                name="fatherName"
                value={
                  form.fatherName
                }
                error={
                  errors.fatherName
                }
                onChange={onChange}
                placeholder="As printed on your PAN card"
                helperText={
                  form.fatherName
                    ? 'From your PAN'
                    : 'Add this if it did not fill in'
                }
                required
              />

              <FormInput
                label="Home PIN code"
                name="pincode"
                value={
                  form.pincode
                }
                error={
                  errors.pincode
                }
                onChange={onChange}
                placeholder="400059"
                maxLength={6}
                inputMode="numeric"
                required
              />

              <div className="flex items-end">
                {pincodeCity && pincodeState && (
                  <div className="flex w-full items-start gap-3 rounded-2xl bg-[#E7F4EC] p-4">
                    <MapPin
                      size={17}
                      className="mt-0.5 shrink-0 text-[#1F8A5B]"
                    />
                    <div>
                      <p className="text-sm font-semibold text-[#0E3B2C]">
                        {pincodeCity}, {pincodeState}
                      </p>
                      <p className="mt-0.5 text-xs text-[#0E3B2C]/70">
                        Matched to your PIN code
                      </p>
                    </div>
                  </div>
                )}

                {isPincodeLoading && (
                  <div className="flex w-full items-center gap-2 rounded-2xl bg-slate-50 p-4">
                    <LoaderCircle
                      size={16}
                      className="animate-spin text-slate-400"
                    />
                    <span className="text-sm text-slate-500">
                      Looking up your area…
                    </span>
                  </div>
                )}

                {pincodeError && (
                  <div className="w-full rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {pincodeError}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="my-9 border-t border-slate-100" />

          <SectionHeading
            title="Where should we reach you?"
            description="Receipts, your loan agreement and status updates all go here."
          />

          <div className="grid gap-5 md:grid-cols-2">
            <FormInput
              label="Mobile number"
              value={`+91 ${mobileNumber}`}
              readOnly
              disabled
              helperText="Verified when you signed in"
              required
            />

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Email address
                <span className="ml-1 text-rose-500">*</span>
              </label>

              <div
                className={`flex min-h-12 overflow-hidden rounded-2xl border bg-white transition ${
                  errors.email
                    ? 'border-rose-300 ring-4 ring-rose-50'
                    : emailVerified
                      ? 'border-[#1F8A5B] ring-4 ring-[#E7F4EC]'
                      : 'border-slate-200 focus-within:border-[#1F8A5B] focus-within:ring-4 focus-within:ring-[#E7F4EC]'
                }`}
              >
                <input
                  type="email"
                  name="email"
                  value={
                    form.email
                  }
                  onChange={
                    onChange
                  }
                  placeholder="name@example.com"
                  className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[15px] text-[#13211A] outline-none placeholder:text-slate-400"
                />

                {!emailVerified && !isEmailOtpSent && (
                  <button
                    type="button"
                    onClick={
                      onSendEmailOtp
                    }
                    disabled={
                      isEmailVerifying ||
                      !form.email.trim()
                    }
                    className="flex shrink-0 cursor-pointer items-center gap-1.5 bg-[#0E3B2C] px-5 text-sm font-semibold text-white transition hover:bg-[#145239] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isEmailVerifying ? (
                      <>
                        <LoaderCircle
                          size={15}
                          className="animate-spin"
                        />
                        Sending
                      </>
                    ) : (
                      'Send code'
                    )}
                  </button>
                )}

                {emailVerified && (
                  <span className="flex shrink-0 items-center gap-1.5 bg-[#E7F4EC] px-5 text-sm font-semibold text-[#0E3B2C]">
                    <MailCheck size={15} />
                    Verified
                  </span>
                )}
              </div>

              {isEmailOtpSent && !emailVerified && (
                <div className="animate-fade-in mt-4">
                  <p className="mb-2.5 text-sm text-slate-500">
                    Enter the 6-digit code we emailed you.
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <OtpInput
                      length={6}
                      value={emailOtp}
                      onChange={onEmailOtpChange}
                      error={Boolean(errors.email)}
                      disabled={isEmailVerifying}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={onVerifyEmailOtp}
                      disabled={isEmailVerifying || emailOtp.length !== 6}
                      className={BTN_SOFT}
                    >
                      {isEmailVerifying ? (
                        <>
                          <LoaderCircle size={15} className="animate-spin" />
                          Verifying
                        </>
                      ) : (
                        'Verify code'
                      )}
                    </button>
                  </div>
                  {developmentEmailOtp && (
                    <p className="mt-2 text-xs text-slate-400">
                      Test code: {developmentEmailOtp}
                    </p>
                  )}
                </div>
              )}

              {errors.email && (
                <p className="animate-fade-in mt-2 text-sm text-rose-600">
                  {errors.email}
                </p>
              )}
            </div>
          </div>

          <StepActions
            onSave={onSaveDraft}
            isSaving={isSaving}
            onNext={onContinue}
            nextLabel={
              isBreRunning
                ? 'Finding your lender'
                : 'Save and continue'
            }
            nextDisabled={
              isBreRunning ||
              !panVerified ||
              !emailVerified
            }
            nextDisabledReason={
              !panVerified
                ? 'Verify your PAN above to continue'
                : !emailVerified
                  ? 'Verify your email above to continue'
                  : undefined
            }
            isNextLoading={
              isBreRunning
            }
          />
        </>
      )}
    </StepCard>
  );
}

/* ================================================================== */
/*  Step 2 — Lender and assessment fee                                */
/* ================================================================== */

function AssessmentFeeStep({
  customer,
  lenderConsent,
  feePaid,
  isFeeProcessing,
  isCheckingPayment,
  showPaymentRetryHint,
  transactionId,
  onConsentChange,
  onBack,
  onPay,
  onRetryPayment,
  onContinue,
}) {
  const lenderName = customer?.allocatedLenderName || customer?.allocatedLenderCode || 'Lending Partner';
  const baseFee = customer?.assessmentFee?.baseAmount || 0;
  const gstFee = customer?.assessmentFee?.gstAmount || 0;
  const totalFee = customer?.assessmentFee?.totalAmount || 0;
  const gstRate = customer?.assessmentFee?.gstRate || 18;

  // 'ALREADY_PAID' is an internal marker set when a paid fee is detected on load — it is
  // not a real transaction reference, so it is never shown to the customer.
  const hasRealTransactionRef = Boolean(transactionId) && transactionId !== 'ALREADY_PAID';

  return (
    <StepCard>
      <StepHeading
        icon={Building2}
        eyebrow="LENDER & ASSESSMENT FEE"
        title="Your lending partner"
        description="We matched you with a partner whose policy fits your profile."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section>
          <div className="flex flex-col justify-between gap-4 rounded-2xl bg-[#F7F9F6] p-5 sm:flex-row sm:items-center sm:p-6">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#0E3B2C] text-lg font-bold text-[#9BE3B5]">
                {lenderName.substring(0, 2).toUpperCase()}
              </div>

              <div className="min-w-0">
                <h3 className="text-lg font-bold text-[#13211A]">
                  {lenderName}
                </h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  Personal loan
                </p>
              </div>
            </div>

            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#E7F4EC] px-3.5 py-1.5 text-sm font-semibold text-[#0E3B2C]">
              <BadgeCheck size={15} />
              Matched
            </span>
          </div>

          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-slate-200 p-4 text-sm leading-6 text-slate-600">
            <Info
              size={18}
              className="mt-0.5 shrink-0 text-[#1F8A5B]"
            />
            <p>
              <span className="font-semibold text-[#13211A]">Why this partner?</span> Your profile
              matches their current lending policy, and they have room to take new applications
              this month.
            </p>
          </div>

          <label
            className={`mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border p-5 transition ${
              lenderConsent
                ? 'border-[#1F8A5B] bg-[#E7F4EC]'
                : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <input
              type="checkbox"
              checked={lenderConsent}
              disabled={feePaid || isFeeProcessing || isCheckingPayment}
              onChange={(event) =>
                onConsentChange(event.target.checked)
              }
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#1F8A5B]"
            />

            <span className="text-sm leading-6 text-[#13211A]">
              I agree to share my application with <strong className="font-semibold">{lenderName}</strong> for
              assessment and a final decision, and I understand this assessment fee is{' '}
              <strong className="font-semibold text-rose-700">non-refundable</strong>, including if my
              application is not approved.
            </span>
          </label>

          <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-slate-500">
            <Info size={15} className="mt-0.5 shrink-0 text-slate-400" />
            Paying this fee does not guarantee approval. Your lender runs its own independent
            check after your application is submitted.
          </p>
        </section>

        <aside className="flex h-fit flex-col rounded-[24px] bg-[#0E3B2C] p-6 text-white">
          <p className="text-sm text-emerald-100/70">Assessment fee</p>

          <div className="mt-5 space-y-4">
            <FeeRow
              label="Base fee"
              amount={`₹${baseFee.toFixed(2)}`}
            />

            <FeeRow
              label={`GST at ${gstRate}%`}
              amount={`₹${gstFee.toFixed(2)}`}
            />

            <div className="flex items-baseline justify-between border-t border-white/15 pt-5">
              <span className="text-sm text-emerald-50/80">
                {feePaid ? 'Total paid' : 'Total payable'}
              </span>

              <strong className="text-2xl tabular-nums">
                {`₹${totalFee.toFixed(2)}`}
              </strong>
            </div>
          </div>

          <div className="mt-7">
            {feePaid ? (
              <div className="rounded-2xl bg-white/10 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="shrink-0 text-[#9BE3B5]" />
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Payment received
                    </p>
                    {hasRealTransactionRef && (
                      <p className="mt-1 text-xs text-emerald-100/70">
                        Reference {transactionId}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  disabled={
                    !lenderConsent ||
                    isFeeProcessing ||
                    isCheckingPayment
                  }
                  onClick={onPay}
                  className="flex w-full min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#9BE3B5] px-5 text-sm font-bold text-[#0E3B2C] transition hover:bg-[#B4EDC7] disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-emerald-100/50"
                >
                  {isCheckingPayment ? (
                    <>
                      <LoaderCircle
                        size={18}
                        className="animate-spin"
                      />
                      Confirming payment
                    </>
                  ) : isFeeProcessing ? (
                    <>
                      <LoaderCircle
                        size={18}
                        className="animate-spin"
                      />
                      Opening secure payment
                    </>
                  ) : (
                    <>
                      Pay ₹{totalFee.toFixed(2)}
                      <ArrowRight
                        size={17}
                      />
                    </>
                  )}
                </button>

                {!lenderConsent && !isFeeProcessing && !isCheckingPayment && (
                  <p className="animate-fade-in mt-3 flex items-center gap-1.5 text-xs text-emerald-100/70">
                    <Info size={13} className="shrink-0" />
                    Tick the consent box to enable payment
                  </p>
                )}

                {/* isFeeProcessing but not yet isCheckingPayment means the payment
                    window was asked to open but Easebuzz hasn't called back at all
                    yet — could still be legitimately loading, or could mean it never
                    opened. Never auto-resets; the customer decides when to give up. */}
                {isFeeProcessing && !isCheckingPayment && showPaymentRetryHint && (
                  <div className="animate-fade-in mt-4 rounded-2xl bg-white/10 p-4 text-center">
                    <p className="text-xs text-emerald-50/80">
                      Nothing showing up?
                    </p>
                    <button
                      type="button"
                      onClick={onRetryPayment}
                      className="mt-1.5 cursor-pointer text-xs font-bold text-[#9BE3B5] underline underline-offset-2"
                    >
                      Try the payment again
                    </button>
                  </div>
                )}
              </>
            )}

            <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-emerald-100/60">
              <Lock size={13} />
              Secure payment by Easebuzz
            </p>
          </div>
        </aside>
      </div>

      <StepActions
        onBack={onBack}
        onNext={onContinue}
        nextLabel="Continue"
        nextDisabled={true}
        nextDisabledReason={
          feePaid
            ? 'We are confirming your payment — this page will move on by itself'
            : 'Pay the assessment fee above to continue'
        }
        hideSave
      />
    </StepCard>
  );
}

function FeeRow({
  label,
  amount,
}) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 pb-4 text-sm">
      <span className="text-emerald-50/70">
        {label}
      </span>

      <strong className="tabular-nums">{amount}</strong>
    </div>
  );
}

function drawWatermarkOnCanvas(canvas, videoElement, metadata) {
  const ctx = canvas.getContext('2d');
  canvas.width = videoElement.videoWidth || 640;
  canvas.height = videoElement.videoHeight || 480;

  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

  const w = canvas.width;
  const h = canvas.height;

  const fontSize = Math.max(12, Math.floor(w / 35));
  const lineHeight = fontSize * 1.35;
  const padding = fontSize * 0.8;

  const lines = [
    `Customer: ${metadata.customerRef || 'N/A'}`,
    `Date: ${metadata.dateStr}`,
    `Time: ${metadata.timeStr}`,
    `Latitude: ${Number(metadata.latitude || 0).toFixed(6)}`,
    `Longitude: ${Number(metadata.longitude || 0).toFixed(6)}`,
  ];

  const maxTextWidth = w - padding * 2;
  ctx.font = `600 ${fontSize}px sans-serif`;

  const addressText = `Address: ${metadata.address || 'Location captured'}`;
  const words = addressText.split(' ');
  let currentLine = '';
  const wrappedAddressLines = [];

  for (let i = 0; i < words.length; i += 1) {
    const testLine = currentLine ? `${currentLine} ${words[i]}` : words[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxTextWidth && i > 0) {
      wrappedAddressLines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    wrappedAddressLines.push(currentLine);
  }

  const allLines = [...lines, ...wrappedAddressLines];
  const bannerHeight = allLines.length * lineHeight + padding * 2;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.fillRect(0, h - bannerHeight, w, bannerHeight);

  ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
  ctx.lineWidth = Math.max(2, Math.floor(w / 250));
  ctx.beginPath();
  ctx.moveTo(0, h - bannerHeight);
  ctx.lineTo(w, h - bannerHeight);
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.textBaseline = 'top';

  let currentY = h - bannerHeight + padding;
  allLines.forEach((lineText) => {
    ctx.fillText(lineText, padding, currentY);
    currentY += lineHeight;
  });
}

/* ================================================================== */
/*  Live photograph + location                                        */
/* ================================================================== */

function LivePhotographSection({
  customerId,
  applicationId,
  customerCode,
  customer,
  savedPhotoDocument,
  onPhotoSaved,
}) {
  const [consentChecked, setConsentChecked] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);

  const [locationData, setLocationData] = useState(null);
  const [addressData, setAddressData] = useState(null);

  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState('');
  const [taggedBlob, setTaggedBlob] = useState(null);

  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [, setIsGeocoding] = useState(false);
  const [isWatermarking, setIsWatermarking] = useState(false);
  const [isRunningLiveness, setIsRunningLiveness] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [, setLivenessResult] = useState(null);
  const [photoError, setPhotoError] = useState('');

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
      if (capturedPhotoUrl && capturedPhotoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(capturedPhotoUrl);
      }
    };
  }, [cameraStream, capturedPhotoUrl]);

  useEffect(() => {
    if (isCameraOpen && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch((err) => console.error('Video play error:', err));
    }
  }, [isCameraOpen, cameraStream]);

  const stopCameraStream = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setIsCameraOpen(false);
  };

  const handleOpenCamera = async () => {
    if (!consentChecked) {
      setPhotoError('Please check the consent box before opening camera.');
      return;
    }

    setPhotoError('');
    setIsLoadingLocation(true);
    setLocationData(null);
    setAddressData(null);
    setCapturedPhotoUrl('');
    setTaggedBlob(null);

    if (!navigator.geolocation) {
      setPhotoError('Geolocation is not supported by your browser.');
      setIsLoadingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          capturedAt: new Date(pos.timestamp || Date.now()),
        };
        setLocationData(coords);
        setIsLoadingLocation(false);

        setIsGeocoding(true);
        try {
          const geoRes = await reverseGeocode(coords.latitude, coords.longitude);
          setAddressData(geoRes);
        } catch (geoErr) {
          console.error('Reverse geocoding error:', geoErr);
          setAddressData({
            formattedAddress: `Lat: ${coords.latitude.toFixed(6)}, Lon: ${coords.longitude.toFixed(6)}`,
            city: '',
            state: '',
            country: 'India',
            postalCode: '',
          });
        } finally {
          setIsGeocoding(false);
        }
      },
      (err) => {
        setIsLoadingLocation(false);
        let msg = 'Failed to capture location.';
        if (err.code === 1) msg = 'Location permission denied by user.';
        else if (err.code === 2) msg = 'Location position unavailable.';
        else if (err.code === 3) msg = 'Location request timed out.';
        setPhotoError(msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      setCameraStream(stream);
      setIsCameraOpen(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (camErr) {
      console.error('Camera access error:', camErr);
      setPhotoError('Camera access denied or device camera is unavailable.');
    }
  };

  const handleCapturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    if (!locationData) {
      setPhotoError('Location verification is still in progress. Please wait.');
      return;
    }

    setIsWatermarking(true);
    setPhotoError('');

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      const dateObj = locationData.capturedAt || new Date();
      const dateStr = dateObj.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      const timeStr = dateObj.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });

      const formattedAddr = addressData?.formattedAddress || `Lat: ${locationData.latitude.toFixed(6)}, Lon: ${locationData.longitude.toFixed(6)}`;

      drawWatermarkOnCanvas(canvas, video, {
        customerRef: customerCode || `PL-${customerId}`,
        dateStr,
        timeStr,
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        address: formattedAddr,
      });

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            setPhotoError('Failed to generate watermarked photo canvas.');
            setIsWatermarking(false);
            return;
          }

          const previewUrl = URL.createObjectURL(blob);
          setCapturedPhotoUrl(previewUrl);
          setTaggedBlob(blob);
          setIsWatermarking(false);
          stopCameraStream();

          // Automatically trigger face liveness verification & photo save on capture
          handleVerifyAndSave(blob);
        },
        'image/jpeg',
        0.85,
      );
    } catch (err) {
      console.error('Watermark error:', err);
      setPhotoError('Failed to watermark photograph.');
      setIsWatermarking(false);
    }
  };

  const handleVerifyAndSave = async (overrideBlob = null) => {
    const activeBlob = overrideBlob || taggedBlob;
    if (!activeBlob || !locationData) {
      setPhotoError('Please capture a photo first.');
      return;
    }

    setPhotoError('');
    setIsRunningLiveness(true);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
      });
      reader.readAsDataURL(activeBlob);
      const base64Image = await base64Promise;

      const livenessResultJson = await verifyFaceLiveness(applicationId, base64Image);
      const innerData = livenessResultJson?.data?.data || livenessResultJson?.data || livenessResultJson;
      const livenessResultObj = innerData?.livenessResult || innerData;

      if (!livenessResultObj || livenessResultObj.is_live !== true) {
        throw new Error('Face liveness check failed. Please retake photo in clear lighting.');
      }

      setLivenessResult(livenessResultObj);
      setIsRunningLiveness(false);
      setIsUploading(true);

      const formData = new FormData();
      const imageFile = new File([activeBlob], `customer-${customerId}-live-photo.jpg`, {
        type: 'image/jpeg',
      });

      formData.append('file', imageFile);
      formData.append('applicationId', String(applicationId));
      formData.append('livenessVerificationId', innerData.livenessVerificationId || '');
      formData.append('latitude', String(locationData.latitude));
      formData.append('longitude', String(locationData.longitude));
      formData.append('accuracy', String(locationData.accuracy || 0));
      formData.append('formattedAddress', addressData?.formattedAddress || '');
      formData.append('city', addressData?.city || '');
      formData.append('state', addressData?.state || '');
      formData.append('country', addressData?.country || 'India');
      formData.append('postalCode', addressData?.postalCode || '');
      formData.append('capturedAt', locationData.capturedAt.toISOString());
      formData.append('documentType', 'CUSTOMER_LIVE_PHOTO');
      formData.append('source', 'PROFILE_DETAILS');
      formData.append('applicantType', 'BORROWER');

      const uploadResult = await uploadLivePhotoDocument(formData);

      if (uploadResult) {
        onPhotoSaved(uploadResult);
      }
    } catch (err) {
      console.error('Liveness & Upload error:', err);
      const rawErr = err?.message || err?.error || err;
      const errMsg = typeof rawErr === 'string' ? rawErr : (rawErr?.message || 'Verification or upload failed. Please try again.');
      setPhotoError(String(errMsg));
    } finally {
      setIsRunningLiveness(false);
      setIsUploading(false);
    }
  };

  const handleRetake = () => {
    stopCameraStream();
    setCapturedPhotoUrl('');
    setTaggedBlob(null);
    setLivenessResult(null);
    setPhotoError('');
    onPhotoSaved(null);
  };

  return (
    <div className="mt-9 rounded-2xl border border-slate-200 p-5 sm:p-6">
      <canvas ref={canvasRef} className="hidden" />

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#E7F4EC] text-[#1F8A5B]">
            <Camera size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#13211A]">
              Take a quick selfie
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              A live photo at your current location. The date, time and address are printed on
              the image, so it cannot be reused later.
            </p>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
          Required
        </span>
      </div>

      {!savedPhotoDocument && !capturedPhotoUrl && (
        <label
          htmlFor="photoConsent"
          className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl bg-[#F7F9F6] p-4"
        >
          <input
            type="checkbox"
            id="photoConsent"
            checked={consentChecked}
            onChange={(e) => {
              setConsentChecked(e.target.checked);
              setPhotoError('');
            }}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#1F8A5B]"
          />
          {/* Backend consent catalogue supplies this — see resolveConsentText. */}
          <span className="text-sm leading-6 text-slate-600">
            {resolveConsentText(
              customer,
              'LIVE_PHOTO_CAPTURE',
              'I consent to the capture and processing of my live photograph and current location for identity verification, fraud prevention and loan application processing.',
            )}
          </span>
        </label>
      )}

      {photoError && (
        <div className="mt-5">
          <InlineError message={photoError} />
        </div>
      )}

      {savedPhotoDocument ? (
        <div className="mt-5 rounded-2xl bg-[#E7F4EC] p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-white">
              <img
                src={resolveFileUrl(savedPhotoDocument.fileUrl)}
                alt="Your verified photo"
                className="h-full w-full object-cover"
              />
            </div>

            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#0E3B2C]">
                  <UserCheck size={13} /> Face verified
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#0E3B2C]">
                  <MapPin size={13} /> Location captured
                </span>
              </div>

              <p className="text-sm font-semibold text-[#0E3B2C]">
                {savedPhotoDocument.formattedAddress || 'Address recorded'}
              </p>

              {savedPhotoDocument.capturedAt && (
                <p className="text-xs text-[#0E3B2C]/70">
                  Taken {new Date(savedPhotoDocument.capturedAt).toLocaleString('en-IN')}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handleRetake}
              className={BTN_SECONDARY}
            >
              <RefreshCw size={15} /> Retake
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5">
          {!isCameraOpen && !capturedPhotoUrl && (
            <button
              type="button"
              disabled={!consentChecked}
              onClick={handleOpenCamera}
              className={BTN_PRIMARY}
            >
              <Camera size={17} /> Open camera
            </button>
          )}

          {isCameraOpen && (
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-full max-w-md overflow-hidden rounded-[24px] bg-black">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-72 w-full object-cover"
                />
                <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                  {isLoadingLocation ? (
                    <>
                      <LoaderCircle size={12} className="animate-spin" /> Finding your location
                    </>
                  ) : (
                    <>
                      <MapPin size={12} /> {locationData ? 'Location locked' : 'Location active'}
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCapturePhoto}
                  disabled={isLoadingLocation || isWatermarking}
                  className={BTN_PRIMARY}
                >
                  {isWatermarking ? (
                    <>
                      <LoaderCircle size={17} className="animate-spin" /> Processing
                    </>
                  ) : (
                    <>
                      <Camera size={17} /> Take photo
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={stopCameraStream}
                  className={BTN_SECONDARY}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {capturedPhotoUrl && !isCameraOpen && (
            <div className="flex flex-col items-center gap-4">
              <div className="w-full max-w-md overflow-hidden rounded-[24px] bg-slate-900">
                <img
                  src={capturedPhotoUrl}
                  alt="Your captured photo"
                  className="w-full object-contain"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleVerifyAndSave}
                  disabled={isRunningLiveness || isUploading}
                  className={BTN_PRIMARY}
                >
                  {isRunningLiveness ? (
                    <>
                      <LoaderCircle size={17} className="animate-spin" /> Checking your photo
                    </>
                  ) : isUploading ? (
                    <>
                      <LoaderCircle size={17} className="animate-spin" /> Saving
                    </>
                  ) : (
                    <>
                      <UserCheck size={17} /> Use this photo
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleRetake}
                  disabled={isRunningLiveness || isUploading}
                  className={BTN_SECONDARY}
                >
                  <RotateCcw size={16} /> Retake
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Step 3 — Profile details                                          */
/* ================================================================== */

function ProfileDetailsStep({
  customerId,
  applicationId,
  customerCode,
  customer,
  savedPhotoDocument,
  onPhotoSaved,
  form,
  errors,
  isSaving,
  onChange,
  onBack,
  onSaveDraft,
  onContinue,
}) {
  const isSalaried =
    form.employmentType ===
    'SALARIED';

  const isSelfEmployed =
    form.employmentType ===
    'SELF_EMPLOYED';

  return (
    <StepCard>
      <StepHeading
        icon={BriefcaseBusiness}
        eyebrow="COMPLETE YOUR PROFILE"
        title="About you"
        description="Where you live, what you do, and what you earn. Your lender needs this to decide."
        right={
          <StatusBadge>
            <ReceiptText size={14} />
            Fee paid
          </StatusBadge>
        }
      />

      <SectionHeading
        title="Home and work"
        description="Start with where you live and how you earn."
      />

      <div className="grid gap-5 md:grid-cols-2">
        <FormSelect
          label="Residence status"
          name="residenceStatus"
          value={
            form.residenceStatus
          }
          error={
            errors.residenceStatus
          }
          onChange={onChange}
          required
          options={[
            ['RENTED', 'Rented'],
            ['OWNED', 'Owned'],
            [
              'FAMILY_OWNED',
              'Living with parents',
            ],
            [
              'COMPANY_PROVIDED',
              'Company provided',
            ],
          ]}
        />

        <SelectableCardGroup
          label="How do you earn?"
          name="employmentType"
          value={
            form.employmentType
          }
          error={
            errors.employmentType
          }
          onChange={onChange}
          required
          options={[
            [
              'SALARIED',
              'Salaried',
              'I work for a company',
            ],
            [
              'SELF_EMPLOYED',
              'Self-employed',
              'I run my own business',
            ],
          ]}
        />
      </div>

      {isSalaried && (
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <FormSelect
            label="Company type"
            name="companyType"
            value={
              form.companyType
            }
            error={
              errors.companyType
            }
            onChange={onChange}
            required
            options={[
              [
                'PRIVATE_LIMITED',
                'Private limited',
              ],
              [
                'PUBLIC_LIMITED',
                'Public limited',
              ],
              [
                'PARTNERSHIP',
                'Partnership',
              ],
              [
                'GOVERNMENT',
                'Government',
              ],
            ]}
          />

          <FormInput
            label="Company name"
            name="companyName"
            value={
              form.companyName
            }
            error={
              errors.companyName
            }
            onChange={onChange}
            placeholder="Where you work"
            required
          />

          <FormInput
            label="Designation"
            name="designation"
            value={
              form.designation
            }
            error={
              errors.designation
            }
            onChange={onChange}
            placeholder="Your role"
            required
          />

          <FormInput
            label="Monthly take-home salary"
            name="monthlyIncome"
            value={
              form.monthlyIncome
            }
            error={
              errors.monthlyIncome
            }
            onChange={onChange}
            placeholder="38500"
            prefix="₹"
            inputMode="numeric"
            required
          />

          <FormSelect
            label="Time at this job"
            name="employmentVintage"
            value={
              form.employmentVintage
            }
            error={
              errors.employmentVintage
            }
            onChange={onChange}
            required
            options={[
              [
                'LESS_THAN_6_MONTHS',
                'Less than 6 months',
              ],
              [
                '6_TO_12_MONTHS',
                '6–12 months',
              ],
              [
                '1_TO_2_YEARS',
                '1–2 years',
              ],
              [
                '2_TO_3_YEARS',
                '2–3 years',
              ],
              [
                '3_PLUS_YEARS',
                '3+ years',
              ],
            ]}
          />

          <FormSelect
            label="Total work experience"
            name="totalExperience"
            value={
              form.totalExperience
            }
            error={
              errors.totalExperience
            }
            onChange={onChange}
            required
            options={[
              [
                'LESS_THAN_1_YEAR',
                'Less than 1 year',
              ],
              [
                '1_TO_3_YEARS',
                '1–3 years',
              ],
              [
                '3_TO_5_YEARS',
                '3–5 years',
              ],
              [
                '5_PLUS_YEARS',
                '5+ years',
              ],
            ]}
          />

          <FormSelect
            label="How are you paid?"
            name="salaryMode"
            value={
              form.salaryMode
            }
            error={
              errors.salaryMode
            }
            onChange={onChange}
            required
            options={[
              [
                'BANK_TRANSFER',
                'Bank transfer',
              ],
              ['CHEQUE', 'Cheque'],
              ['CASH', 'Cash'],
            ]}
          />
        </div>
      )}

      {isSelfEmployed && (
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <FormInput
            label="Business name"
            name="businessName"
            value={
              form.businessName
            }
            error={
              errors.businessName
            }
            onChange={onChange}
            placeholder="Your business"
            required
          />

          <FormSelect
            label="Business type"
            name="businessConstitution"
            value={
              form.businessConstitution
            }
            error={
              errors.businessConstitution
            }
            onChange={onChange}
            required
            options={[
              [
                'PROPRIETORSHIP',
                'Proprietorship',
              ],
              [
                'PARTNERSHIP',
                'Partnership',
              ],
              ['LLP', 'LLP'],
              [
                'PRIVATE_LIMITED',
                'Private limited',
              ],
            ]}
          />

          <FormSelect
            label="Years in business"
            name="businessVintage"
            value={
              form.businessVintage
            }
            error={
              errors.businessVintage
            }
            onChange={onChange}
            required
            options={[
              [
                '1_TO_2_YEARS',
                '1–2 years',
              ],
              [
                '2_TO_3_YEARS',
                '2–3 years',
              ],
              [
                '3_TO_5_YEARS',
                '3–5 years',
              ],
              [
                '5_PLUS_YEARS',
                '5+ years',
              ],
            ]}
          />

          <FormInput
            label="Monthly income"
            name="monthlyIncome"
            value={
              form.monthlyIncome
            }
            error={
              errors.monthlyIncome
            }
            onChange={onChange}
            placeholder="65000"
            prefix="₹"
            inputMode="numeric"
            required
          />

          <FormInput
            label="Annual turnover"
            name="annualTurnover"
            value={
              form.annualTurnover
            }
            error={
              errors.annualTurnover
            }
            onChange={onChange}
            placeholder="1250000"
            prefix="₹"
            inputMode="numeric"
            required
          />
        </div>
      )}

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <FormInput
          label="Work PIN code"
          name="workPincode"
          value={
            form.workPincode
          }
          error={
            errors.workPincode
          }
          onChange={onChange}
          placeholder="400059"
          maxLength={6}
          inputMode="numeric"
          required
        />

        <FormSelect
          label="Language for your loan documents"
          name="kfsLanguage"
          value={
            form.kfsLanguage
          }
          error={
            errors.kfsLanguage
          }
          onChange={onChange}
          required
          options={[
            [
              'English',
              'English',
            ],
            ['Hindi', 'Hindi'],
            [
              'Marathi',
              'Marathi',
            ],
          ]}
        />
      </div>

      <LivePhotographSection
        customerId={customerId}
        applicationId={applicationId}
        customerCode={customerCode}
        customer={customer}
        savedPhotoDocument={savedPhotoDocument}
        onPhotoSaved={onPhotoSaved}
      />

      <div className="mt-7 flex items-start gap-3 rounded-2xl bg-[#E7F4EC] p-4 text-sm leading-6 text-[#0E3B2C]">
        <ShieldCheck
          size={18}
          className="mt-0.5 shrink-0 text-[#1F8A5B]"
        />
        Everything here is encrypted, and shared only with the lender you agreed to.
      </div>

      <StepActions
        onBack={onBack}
        onSave={onSaveDraft}
        isSaving={isSaving}
        onNext={onContinue}
        nextLabel="Continue"
      />
    </StepCard>
  );
}

/* ================================================================== */
/*  Step 4 — Review and submit                                        */
/* ================================================================== */

function SubmitApplicationStep({
  form,
  customer,
  savedPhotoDocument,
  mobileNumber,
  applicationSubmitted,
  applicationNumber: _applicationNumber,
  isSubmitting,
  isApplyingAgain,
  applyAgainError,
  onApplyAgain,
  onBack,
  onSubmit,
}) {
  const navigate = useNavigate();
  const [sameAsPermanent, setSameAsPermanent] = useState(true);
  const [decisionConsentAccepted, setDecisionConsentAccepted] = useState(false);

  const status = customer?.onboardingStatus || 'APPLICATION_SUBMITTED';
  const isApproved = status === 'LENDER_APPROVED';
  const isRejected = status === 'LENDER_REJECTED';
  const hasLan = !!customer?.latestLan;
  const isSubmittedState = applicationSubmitted || status === 'APPLICATION_SUBMITTED' || isApproved || isRejected;

  // Always the real allocated partner — never a hardcoded lender name.
  const lenderName = customer?.allocatedLenderName || customer?.allocatedLenderCode || 'Your lending partner';

  if (isSubmittedState) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div
          className={`overflow-hidden rounded-[28px] p-7 sm:p-9 ${
            isRejected ? 'bg-[#2B1116] text-white' : 'bg-[#0E3B2C] text-white'
          }`}
        >
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
              isApproved
                ? 'bg-[#9BE3B5] text-[#0E3B2C]'
                : isRejected
                  ? 'bg-rose-200 text-rose-900'
                  : 'bg-white/15 text-emerald-50'
            }`}
          >
            {!isApproved && !isRejected && (
              <span className="h-1.5 w-1.5 rounded-full bg-[#9BE3B5] motion-safe:animate-pulse" />
            )}
            {isApproved ? 'Approved' : isRejected ? 'Not approved' : 'With your lender'}
          </span>

          <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-[28px]">
            {isApproved
              ? 'Congratulations — your loan is approved'
              : isRejected
                ? 'Your application was not approved'
                : 'Your application is in review'}
          </h2>

          <p className="mt-3 max-w-xl text-sm leading-6 text-white/70">
            {isApproved
              ? `${lenderName} has approved your loan. Continue to set up your disbursal.`
              : isRejected
                ? 'This lender could not approve your application this time.'
                : `${lenderName} is reviewing your application now. This page updates on its own — there is nothing you need to do.`}
          </p>
        </div>

        {isApproved && hasLan && (() => {
          const isDisbursalRequestedOrDisbursed =
            customer?.latestDisbursalStatus === 'DISBURSAL_REQUESTED' ||
            customer?.latestDisbursalStatus === 'DISBURSAL_PROCESSING' ||
            customer?.latestDisbursalStatus === 'DISBURSED' ||
            customer?.latestLoanStatus === 'DISBURSED';

          return (
            <div className={`${CARD} p-7 text-center sm:p-9`}>
              <h3 className="text-xl font-bold tracking-tight text-[#13211A]">
                {isDisbursalRequestedOrDisbursed ? 'Your loan account' : 'Next: receive your money'}
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                Loan account number
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums tracking-wide text-[#0E3B2C]">
                {customer.latestLan}
              </p>
              <button
                onClick={() =>
                  navigate(
                    isDisbursalRequestedOrDisbursed
                      ? `/customer/loan/${customer.latestLan}/details`
                      : `/customer/loan/${customer.latestLan}/post-approval`
                  )
                }
                className={`mt-7 ${BTN_PRIMARY}`}
              >
                {isDisbursalRequestedOrDisbursed ? 'View loan details' : 'Continue'}
                <ArrowRight size={17} />
              </button>
            </div>
          );
        })()}

        {isRejected && (
          <RejectionPanel
            embedded
            reapply={customer?.journey?.reapply}
            isApplyingAgain={isApplyingAgain}
            applyAgainError={applyAgainError}
            onApplyAgain={onApplyAgain}
            onHome={() => navigate('/')}
          />
        )}

        {isApproved && !hasLan && (
          <div className={`${CARD} p-7 text-center sm:p-9`}>
            <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-[#1F8A5B]" />
            <h3 className="mt-5 text-lg font-bold text-[#13211A]">Setting up your loan account</h3>
            <p className="mt-2 text-sm text-slate-500">This only takes a moment.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <StepCard>
      <StepHeading
        icon={FileCheck2}
        eyebrow="FINAL REVIEW"
        title="One last look"
        description="Check that everything is right. You cannot change these details after submitting."
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <ReviewSection
            icon={CircleUserRound}
            title="Personal details"
          >
            <ReviewItem
              label="Name"
              value={form.fullName}
            />

            <ReviewItem
              label="PAN"
              value={maskPan(
                form.panNumber,
              )}
            />

            <ReviewItem
              label="Date of birth"
              value={formatDate(
                form.dateOfBirth,
              )}
            />

            <ReviewItem
              label="Gender"
              value={formatEnum(
                form.gender,
              )}
            />

            <ReviewItem
              label="Mobile"
              value={`+91 ${mobileNumber}`}
            />

            <ReviewItem
              label="Email"
              value={form.email}
            />
          </ReviewSection>

          <ReviewSection
            icon={
              BriefcaseBusiness
            }
            title="Work and income"
          >
            <ReviewItem
              label="Employment"
              value={
                form.employmentType ===
                  'SALARIED'
                  ? 'Salaried'
                  : 'Self-employed'
              }
            />

            <ReviewItem
              label={
                form.employmentType ===
                  'SALARIED'
                  ? 'Company'
                  : 'Business'
              }
              value={
                form.employmentType ===
                  'SALARIED'
                  ? form.companyName
                  : form.businessName
              }
            />

            <ReviewItem
              label="Monthly income"
              value={formatCurrency(
                form.monthlyIncome,
              )}
            />

            <ReviewItem
              label="Residence"
              value={formatEnum(
                form.residenceStatus,
              )}
            />

            <ReviewItem
              label="Work PIN code"
              value={
                form.workPincode
              }
            />

            <ReviewItem
              label="Document language"
              value={
                form.kfsLanguage
              }
            />
          </ReviewSection>
        </div>

        <aside className="h-fit rounded-[24px] bg-[#F7F9F6] p-6">
          <h3 className="text-base font-bold text-[#13211A]">Everything is ready</h3>

          <div className="mt-5 space-y-3.5">
            <SummaryStatus
              label="Mobile"
              value="Verified"
            />

            <SummaryStatus
              label="PAN"
              value="Verified"
            />

            <SummaryStatus
              label="Email"
              value="Verified"
            />

            <SummaryStatus
              label="Eligibility check"
              value="Passed"
            />

            <SummaryStatus
              label="Lending partner"
              value={lenderName}
            />

            <SummaryStatus
              label="Assessment fee"
              value="Paid"
            />

            <SummaryStatus
              label="Your profile"
              value="Complete"
            />
          </div>

          <p className="mt-6 flex items-start gap-2.5 rounded-2xl bg-white p-4 text-sm leading-6 text-slate-500">
            <Info
              size={16}
              className="mt-0.5 shrink-0 text-slate-400"
            />
            Submitting does not guarantee approval — your lender makes its own credit decision.
          </p>

          <div className="mt-5 space-y-3">
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-white p-4 text-sm leading-6 text-slate-600 transition hover:bg-slate-50">
              <input
                type="checkbox"
                checked={sameAsPermanent}
                onChange={(event) => setSameAsPermanent(event.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[#1F8A5B]"
              />
              I live at my Aadhaar address right now.
            </label>

            {!sameAsPermanent && (
              <p className="rounded-2xl bg-white p-3.5 text-xs leading-5 text-slate-500">
                We will use the address from your verified photo: {savedPhotoDocument?.formattedAddress || 'not available'}
              </p>
            )}

            <label
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
                decisionConsentAccepted
                  ? 'border-[#1F8A5B] bg-[#E7F4EC]'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <input
                type="checkbox"
                checked={decisionConsentAccepted}
                onChange={(event) => setDecisionConsentAccepted(event.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[#1F8A5B]"
              />
              <span className="text-sm leading-6 text-[#13211A]">
                I authorise the credit bureau enquiry and the submission of this application to
                my lending partner for a decision.
              </span>
            </label>
          </div>

          <button
            type="button"
            onClick={() => onSubmit({ sameAsPermanent, decisionConsentAccepted })}
            disabled={
              isSubmitting || !decisionConsentAccepted
            }
            className={`mt-6 w-full ${BTN_PRIMARY}`}
          >
            {isSubmitting ? (
              <>
                <LoaderCircle
                  size={18}
                  className="animate-spin"
                />
                Submitting
              </>
            ) : (
              <>
                Submit application
                <ArrowRight
                  size={17}
                />
              </>
            )}
          </button>

          {!decisionConsentAccepted && !isSubmitting && (
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-500">
              <Info size={13} />
              Tick the box above to submit
            </p>
          )}
        </aside>
      </div>

      <div className="mt-8 border-t border-slate-100 pt-6">
        <button
          type="button"
          onClick={onBack}
          disabled={
            isSubmitting
          }
          className={BTN_SECONDARY}
        >
          <ArrowLeft size={16} />
          Back
        </button>
      </div>
    </StepCard>
  );
}

function ReviewSection({
  icon: Icon,
  title,
  children,
}) {
  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#E7F4EC] text-[#1F8A5B]">
          <Icon size={19} />
        </div>

        <h3 className="text-base font-bold text-[#13211A]">
          {title}
        </h3>
      </div>

      <dl className="mt-5 grid gap-5 sm:grid-cols-2">
        {children}
      </dl>
    </section>
  );
}

function ReviewItem({
  label,
  value,
}) {
  return (
    <div>
      <dt className="text-xs text-slate-500">
        {label}
      </dt>

      <dd className="mt-1 break-words text-sm font-semibold text-[#13211A]">
        {value ||
          'Not provided'}
      </dd>
    </div>
  );
}

function SummaryStatus({
  label,
  value,
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-sm text-slate-500">
        {label}
      </span>

      <span className="flex items-center gap-1.5 text-right text-sm font-semibold text-[#0E3B2C]">
        <CheckCircle2
          size={15}
          className="shrink-0 text-[#1F8A5B]"
        />
        {value}
      </span>
    </div>
  );
}

function StepCard({ children }) {
  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white p-5 sm:p-9">
      {children}
    </section>
  );
}

/* ================================================================== */
/*  Pre-approval offer                                                */
/* ================================================================== */

function PreApprovalOfferStep({ lan, onSelected }) {
  const [offer, setOffer] = useState(null);
  const [selectedTenure, setSelectedTenure] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!lan) return;
    setLoading(true);
    getPreApprovalOffer(lan)
      .then((data) => {
        setOffer(data);
        setSelectedTenure(data?.selectedTenure || (Array.isArray(data?.allowedTenures) ? data.allowedTenures[0] : null));
      })
      .catch((err) => setError(err.message || 'Unable to load your pre-approved offer.'))
      .finally(() => setLoading(false));
  }, [lan]);

  const formatCurrency = (val) => (val || val === 0) ? Number(val).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }) : '—';

  const handleSelect = async () => {
    if (!selectedTenure) return;
    setSubmitting(true);
    setError('');
    try {
      await selectPreApprovalOffer(lan, { tenureDays: selectedTenure });
      onSelected();
    } catch (err) {
      setError(err.message || 'Unable to select this offer.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StepCard>
      {loading ? (
        <div className="animate-fade-in">
          <div className="h-6 w-56 animate-pulse rounded-full bg-slate-100" />
          <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded-full bg-slate-100" />
          <div className="mt-7 h-40 animate-pulse rounded-[24px] bg-slate-100" />
          <div className="mt-6 h-24 animate-pulse rounded-2xl bg-slate-100" />
        </div>
      ) : error ? (
        <InlineError message={error} />
      ) : (
        <>
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#E7F4EC] text-[#1F8A5B]">
              <Sparkles size={17} />
            </span>
            <h2 className="text-xl font-bold tracking-tight text-[#13211A]">You are pre-approved</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Choose how long you would like to repay. You will see the exact terms before anything
            is final.
          </p>

          {/* Hero amount — the number that matters most, given the most visual weight */}
          <div className="animate-pop-in mt-7 overflow-hidden rounded-[24px] bg-[#0E3B2C] p-8 text-center text-white sm:p-10">
            <p className="text-sm text-emerald-100/70">Pre-approved amount</p>
            <p className="mt-2 text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">
              {formatCurrency(offer?.amount)}
            </p>
            {offer?.lenderApprovedAmount ? (
              <p className="mt-3 text-xs text-emerald-100/60">
                Within your lender's approved limit of {formatCurrency(offer.lenderApprovedAmount)}
              </p>
            ) : null}
          </div>

          <div className="mt-8">
            <p className="text-base font-bold text-[#13211A]">How long do you need to repay?</p>
            <p className="mt-1 text-sm text-slate-500">You can repay earlier if you want to.</p>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(offer?.allowedTenures || []).map((t) => {
                const isSelected = selectedTenure === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSelectedTenure(t)}
                    aria-pressed={isSelected}
                    className={`relative cursor-pointer rounded-2xl border p-4 text-left transition ${
                      isSelected
                        ? 'border-[#1F8A5B] bg-[#E7F4EC]'
                        : 'border-slate-200 hover:border-[#9BE3B5] hover:bg-slate-50'
                    }`}
                  >
                    {isSelected && (
                      <span className="animate-pop-in absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-[#0E3B2C] text-white">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    )}
                    <p className={`text-xl font-bold tabular-nums ${isSelected ? 'text-[#0E3B2C]' : 'text-[#13211A]'}`}>{t}</p>
                    <p className={`text-xs ${isSelected ? 'text-[#0E3B2C]/70' : 'text-slate-500'}`}>days</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-7 flex items-start gap-2.5 rounded-2xl bg-[#F7F9F6] px-4 py-3.5 text-sm leading-6 text-slate-500">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#1F8A5B]" />
            Confirming sends your choice to the lender for final approval. You will see the full
            interest, fees and EMI breakdown on the next screen before you accept anything.
          </div>

          <div className="mt-7 flex justify-end">
            <button
              type="button"
              onClick={handleSelect}
              disabled={submitting || !selectedTenure}
              className={BTN_PRIMARY}
            >
              {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              {submitting ? 'Submitting' : 'Confirm and continue'}
              {!submitting && <ArrowRight size={17} />}
            </button>
          </div>
        </>
      )}
    </StepCard>
  );
}

/* ================================================================== */
/*  Shared layout pieces                                              */
/* ================================================================== */

function StepHeading({
  icon: Icon,
  eyebrow: _eyebrow,
  title,
  description,
  right,
}) {
  return (
    <header className="mb-8 flex flex-col justify-between gap-4 border-b border-slate-100 pb-6 sm:flex-row sm:items-start">
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#E7F4EC] text-[#1F8A5B]">
          <Icon size={22} />
        </div>

        <div>
          <h2 className="text-xl font-bold tracking-tight text-[#13211A] sm:text-2xl">
            {title}
          </h2>

          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            {description}
          </p>
        </div>
      </div>

      {right}
    </header>
  );
}

function SectionHeading({
  title,
  description,
}) {
  return (
    <div className="mb-5">
      <h3 className="text-base font-bold text-[#13211A]">
        {title}
      </h3>

      <p className="mt-1 text-sm text-slate-500">
        {description}
      </p>
    </div>
  );
}

function StatusBadge({
  children,
}) {
  return (
    <span className="flex w-fit shrink-0 items-center gap-1.5 rounded-full bg-[#E7F4EC] px-3.5 py-1.5 text-sm font-semibold text-[#0E3B2C]">
      {children}
    </span>
  );
}

function StepActions({
  onBack,
  onSave,
  onNext,
  isSaving,
  nextLabel,
  nextDisabled = false,
  nextDisabledReason,
  hideSave = false,
  isNextLoading = false,
}) {
  return (
    <footer className="mt-9 border-t border-slate-100 pt-6">
      <div className="flex flex-col-reverse justify-between gap-3 sm:flex-row">
        <div className="flex flex-col gap-3 sm:flex-row">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              disabled={
                isNextLoading
              }
              className={BTN_SECONDARY}
            >
              <ArrowLeft size={16} />
              Back
            </button>
          )}

          {!hideSave && onSave && (
            <button
              type="button"
              onClick={onSave}
              disabled={
                isSaving ||
                isNextLoading
              }
              className={BTN_SECONDARY}
            >
              <Save size={16} />

              {isSaving
                ? 'Saving'
                : 'Save for later'}
            </button>
          )}
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <button
            type="button"
            onClick={onNext}
            disabled={
              nextDisabled ||
              isNextLoading
            }
            className={BTN_PRIMARY}
          >
            {isNextLoading && (
              <LoaderCircle
                size={16}
                className="animate-spin"
              />
            )}

            {nextLabel}

            {!isNextLoading && (
              <ArrowRight size={16} />
            )}
          </button>

          {/* First-time users hitting a dead, grayed-out button with no explanation is a
              classic silent abandonment point — always tell them exactly what's missing. */}
          {nextDisabled && !isNextLoading && nextDisabledReason && (
            <p className="animate-fade-in flex items-center gap-1.5 text-sm text-slate-500">
              <Info size={14} className="shrink-0" />
              {nextDisabledReason}
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}

function FormInput({
  label,
  name,
  value,
  error,
  onChange,
  placeholder,
  type = 'text',
  required = false,
  readOnly = false,
  disabled = false,
  helperText,
  prefix,
  maxLength,
  inputMode,
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="mb-2 block text-sm font-semibold text-slate-700"
      >
        {label}

        {required && (
          <span className="ml-1 text-rose-500">
            *
          </span>
        )}
      </label>

      <div
        className={`flex min-h-12 items-center overflow-hidden rounded-2xl border transition ${
          error
            ? 'border-rose-300 ring-4 ring-rose-50'
            : 'border-slate-200 focus-within:border-[#1F8A5B] focus-within:ring-4 focus-within:ring-[#E7F4EC]'
        } ${disabled ? 'bg-slate-50' : 'bg-white'}`}
      >
        {prefix && (
          <span className="self-stretch border-r border-slate-200 px-4 py-3 text-sm font-semibold text-slate-500">
            {prefix}
          </span>
        )}

        <input
          id={name}
          name={name}
          type={type}
          value={value || ''}
          onChange={onChange}
          placeholder={placeholder}
          readOnly={readOnly}
          disabled={disabled}
          maxLength={maxLength}
          inputMode={inputMode}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${name}-error` : helperText ? `${name}-helper` : undefined}
          className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[15px] text-[#13211A] outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-500"
        />
      </div>

      {error ? (
        <p id={`${name}-error`} className="animate-fade-in mt-2 text-sm text-rose-600">
          {error}
        </p>
      ) : helperText ? (
        <p id={`${name}-helper`} className="mt-2 text-sm text-slate-500">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}

function SelectableCardGroup({
  label,
  name,
  value,
  error,
  onChange,
  required = false,
  options,
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </label>

      <div className="grid grid-cols-2 gap-3">
        {options.map(([optValue, optLabel, optDescription]) => {
          const isSelected = value === optValue;
          return (
            <button
              key={optValue}
              type="button"
              onClick={() => onChange({ target: { name, value: optValue } })}
              aria-pressed={isSelected}
              className={`relative cursor-pointer rounded-2xl border p-4 text-left transition ${
                isSelected
                  ? 'border-[#1F8A5B] bg-[#E7F4EC]'
                  : 'border-slate-200 hover:border-[#9BE3B5] hover:bg-slate-50'
              }`}
            >
              {isSelected && (
                <span className="animate-pop-in absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-[#0E3B2C] text-white">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
              <p className={`text-sm font-bold ${isSelected ? 'text-[#0E3B2C]' : 'text-[#13211A]'}`}>{optLabel}</p>
              {optDescription && (
                <p className={`mt-1 text-xs leading-5 ${isSelected ? 'text-[#0E3B2C]/70' : 'text-slate-500'}`}>{optDescription}</p>
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="animate-fade-in mt-2 text-sm text-rose-600">{error}</p>
      )}
    </div>
  );
}

function FormSelect({
  label,
  name,
  value,
  error,
  onChange,
  options,
  required = false,
  disabled = false,
  helperText,
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="mb-2 block text-sm font-semibold text-slate-700"
      >
        {label}

        {required && (
          <span className="ml-1 text-rose-500">
            *
          </span>
        )}
      </label>

      <select
        id={name}
        name={name}
        value={value || ''}
        onChange={onChange}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        className={`min-h-12 w-full rounded-2xl border px-4 py-3 text-[15px] outline-none transition ${
          disabled
            ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-500'
            : error
              ? 'border-rose-300 bg-white text-[#13211A] ring-4 ring-rose-50'
              : 'border-slate-200 bg-white text-[#13211A] focus:border-[#1F8A5B] focus:ring-4 focus:ring-[#E7F4EC]'
        }`}
      >
        <option value="">
          Choose an option
        </option>

        {options.map(
          ([
            optionValue,
            optionLabel,
          ]) => (
            <option
              key={optionValue}
              value={optionValue}
            >
              {optionLabel}
            </option>
          ),
        )}
      </select>

      {error ? (
        <p className="animate-fade-in mt-2 text-sm text-rose-600">
          {error}
        </p>
      ) : helperText ? (
        <p className="mt-2 text-sm text-slate-500">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}

function maskPan(panNumber) {
  if (
    !panNumber ||
    panNumber.length !== 10
  ) {
    return (
      panNumber ||
      'Not provided'
    );
  }

  return `${panNumber.slice(
    0,
    2,
  )}***${panNumber.slice(
    5,
    9,
  )}${panNumber.slice(-1)}`;
}

function formatDate(dateValue) {
  if (!dateValue) {
    return 'Not provided';
  }

  const date = new Date(
    dateValue,
  );

  if (
    Number.isNaN(date.getTime())
  ) {
    return dateValue;
  }

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    },
  ).format(date);
}

function formatCurrency(value) {
  if (!value) {
    return 'Not provided';
  }

  return new Intl.NumberFormat(
    'en-IN',
    {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    },
  ).format(Number(value));
}

function formatEnum(value) {
  if (!value) {
    return 'Not provided';
  }

  return value
    .toLowerCase()
    .split('_')
    .map(
      (word) =>
        word
          .charAt(0)
          .toUpperCase() +
        word.slice(1),
    )
    .join(' ');
}

/**
 * IntegrationSupportCard
 * ---------------------
 * A polished retry-support card shown when the lender integration hits a recoverable
 * failure. Handles the backend's cooldown timer gracefully by parsing "Please wait N
 * seconds" from the error response and showing an auto-decrementing countdown.
 */
function IntegrationSupportCard({ customer, isRetrying, retryError, onRetry, onClearError }) {
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const cooldownTimerRef = useRef(null);

  const errorCode = customer?.journey?.integration?.safeErrorCode || 'INTEGRATION_REVIEW';
  const integrationStage = customer?.journey?.integration?.stage || null;

  // Parse cooldown seconds from backend error message like "Please wait 57 seconds before retrying again."
  useEffect(() => {
    if (!retryError) return;
    const match = retryError.match(/wait\s+(\d+)\s+seconds?/i);
    if (match) {
      const secs = parseInt(match[1], 10);
      if (secs > 0 && secs <= 120) {
        setCooldownSeconds(secs);
        onClearError?.();
      }
    }
  }, [retryError]);

  // Countdown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) {
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      return;
    }

    cooldownTimerRef.current = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownTimerRef.current);
          cooldownTimerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, [cooldownSeconds > 0]);

  const isCoolingDown = cooldownSeconds > 0;
  const isDisabled = isRetrying || isCoolingDown;

  const handleRetryClick = () => {
    if (isDisabled) return;
    onRetry?.();
  };

  return (
    <StepCard>
      <div className="mx-auto max-w-lg text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-amber-50 text-amber-700">
          <RefreshCw className="h-7 w-7" />
        </div>

        <h2 className="mt-6 text-xl font-bold tracking-tight text-[#13211A]">
          We need to send this again
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Something went wrong while handing your application to the lender. Your details and
          your payment are safe. Try once more below.
        </p>

        <div className="mt-7 rounded-2xl bg-[#F7F9F6] p-5 text-left">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1F8A5B]" />
            <p className="text-sm leading-6 text-slate-600">
              Nothing has been lost — your documents, details and payment are all recorded.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-slate-200 pt-4">
            <div>
              <p className="text-xs text-slate-500">Reference for support</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-[#13211A]">{errorCode}</p>
            </div>
            {integrationStage && (
              <div>
                <p className="text-xs text-slate-500">Stage</p>
                <p className="mt-0.5 text-sm font-semibold capitalize text-[#13211A]">
                  {integrationStage.toLowerCase().replace(/_/g, ' ')}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Non-cooldown error message */}
        {retryError && !isCoolingDown && (
          <div className="mt-5 text-left">
            <InlineError message={retryError} />
          </div>
        )}

        {/* Cooldown countdown */}
        {isCoolingDown && (
          <div className="mt-5 flex items-center justify-center gap-3 rounded-2xl bg-[#E7F4EC] p-4 text-left">
            <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-[#1F8A5B]" />
            <div>
              <p className="text-sm font-semibold text-[#0E3B2C]">
                You can try again in <span className="tabular-nums">{cooldownSeconds}s</span>
              </p>
              <p className="text-xs text-[#0E3B2C]/70">This short wait prevents a duplicate submission.</p>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleRetryClick}
          disabled={isDisabled}
          className={`mt-7 ${BTN_PRIMARY}`}
        >
          {isRetrying ? (
            <>
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Sending again
            </>
          ) : isCoolingDown ? (
            <>
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Wait {cooldownSeconds}s
            </>
          ) : (
            <>
              <RotateCcw className="h-4 w-4" />
              Send again
            </>
          )}
        </button>

        <p className="mt-6 text-xs leading-5 text-slate-500">
          Still stuck? Contact support and quote {errorCode}.
        </p>
      </div>
    </StepCard>
  );
}

const formatLongDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
};

/**
 * Shown while the lender is working on the application. The page refreshes itself in the
 * background (see fetchCustomer's silent mode), so this screen never flashes or reloads.
 */
function ProcessingPanel() {
  const steps = [
    { label: 'Details received', hint: 'Your application is safely with us', state: 'done' },
    { label: 'Checking with your lending partner', hint: 'This usually takes less than a minute', state: 'active' },
    { label: 'Decision ready', hint: 'You will move ahead automatically', state: 'todo' },
  ];

  return (
    <StepCard>
      <div className="mx-auto max-w-xl py-4 text-center sm:py-6" role="status" aria-live="polite">
        <div className="relative mx-auto grid h-20 w-20 place-items-center">
          <span className="absolute inset-0 rounded-full bg-[#E7F4EC] motion-safe:animate-ping" />
          <span className="relative grid h-16 w-16 place-items-center rounded-full bg-[#E7F4EC] text-[#1F8A5B]">
            <LoaderCircle className="h-8 w-8 animate-spin" />
          </span>
        </div>

        <h2 className="mt-7 text-2xl font-bold tracking-tight text-[#13211A]">
          Reviewing your application
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
          Keep this page open. It moves ahead on its own — there is no need to refresh.
        </p>

        <ol className="mx-auto mt-9 max-w-sm space-y-5 text-left">
          {steps.map((step) => (
            <li key={step.label} className="flex items-start gap-3.5">
              <span
                className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                  step.state === 'done'
                    ? 'bg-[#0E3B2C] text-white'
                    : step.state === 'active'
                      ? 'bg-[#E7F4EC] ring-2 ring-[#1F8A5B]'
                      : 'bg-slate-100'
                }`}
              >
                {step.state === 'done' ? (
                  <Check size={13} strokeWidth={3} />
                ) : step.state === 'active' ? (
                  <span className="h-2 w-2 rounded-full bg-[#1F8A5B] motion-safe:animate-pulse" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                )}
              </span>
              <span>
                <span className={`block text-sm font-semibold ${step.state === 'todo' ? 'text-slate-400' : 'text-[#13211A]'}`}>
                  {step.label}
                </span>
                <span className="mt-0.5 block text-sm text-slate-500">{step.hint}</span>
              </span>
            </li>
          ))}
        </ol>

        <p className="mt-9 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck size={14} /> Your information is encrypted and handled securely
        </p>
      </div>
    </StepCard>
  );
}

/**
 * Shown when an application is declined. `reapply` comes from the backend
 * (journey.reapply) and reflects REAPPLY_COOLING_OFF_DAYS, so the wait is never hard-coded here.
 */
function RejectionPanel({ reapply, embedded = false, isApplyingAgain = false, applyAgainError = '', onApplyAgain, onHome }) {
  const known = Boolean(reapply);
  const canReapply = known && reapply.canReapply;
  const daysRemaining = known ? Number(reapply.daysRemaining) || 0 : 0;
  const totalDays = known ? Number(reapply.coolingOffDays) || 0 : 0;
  const eligibleOn = known ? formatLongDate(reapply.eligibleAt) : '';
  const elapsedPct = totalDays > 0 ? Math.min(100, Math.max(0, Math.round(((totalDays - daysRemaining) / totalDays) * 100))) : 100;

  const tips = [
    'Keep your PAN, Aadhaar and bank details consistent with each other',
    'Use a bank account in your own name with regular salary or income credits',
    'Clear any overdue EMIs or credit card dues before applying again',
    'Avoid applying with several lenders at the same time',
  ];

  return (
    <StepCard>
      <div className={`mx-auto max-w-2xl ${embedded ? '' : 'py-2 sm:py-4'}`}>
        {!embedded && (
          <div className="text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-rose-50 text-rose-600 ring-8 ring-rose-50/50">
              <AlertCircle size={30} />
            </div>
            <h2 className="mt-6 text-2xl font-bold tracking-tight text-[#13211A]">
              We could not approve your application this time
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
              Based on the information available, your application does not meet our current
              lending criteria. This is not permanent — you can apply again.
            </p>
          </div>
        )}

        {known && !canReapply && (
          <div className="mt-7 rounded-2xl bg-[#F7F9F6] p-5 sm:p-6">
            <div className="flex items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white text-center">
                <span className="text-2xl font-bold leading-none tabular-nums text-[#13211A]">{daysRemaining}</span>
                <span className="-mt-2.5 text-[10px] font-semibold text-slate-500">{daysRemaining === 1 ? 'day' : 'days'}</span>
              </div>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-bold text-[#13211A]"><Clock size={15} /> Short waiting period</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                  <CalendarDays size={15} /> You can apply again on <strong className="font-semibold text-[#13211A]">{eligibleOn}</strong>
                </p>
              </div>
            </div>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white">
              <div className="h-full rounded-full bg-[#9BE3B5] transition-all duration-700" style={{ width: `${elapsedPct}%` }} />
            </div>
          </div>
        )}

        {known && canReapply && (
          <div className="mt-7 rounded-2xl bg-[#E7F4EC] p-5 text-center">
            <p className="flex items-center justify-center gap-1.5 text-sm font-bold text-[#0E3B2C]"><Sparkles size={16} /> You can apply again now</p>
            <p className="mt-1 text-sm text-[#0E3B2C]/75">Your waiting period is over. Start a fresh application whenever you are ready.</p>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-slate-200 p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-[#13211A]"><Lightbulb size={16} className="text-amber-500" /> Ways to improve your chances</p>
          <ul className="mt-4 space-y-2.5">
            {tips.map((tip) => (
              <li key={tip} className="flex items-start gap-2.5 text-sm leading-6 text-slate-600">
                <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#9BE3B5]" />
                {tip}
              </li>
            ))}
          </ul>
        </div>

        {applyAgainError && (
          <div className="mt-5" role="alert">
            <InlineError message={applyAgainError} />
          </div>
        )}

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onHome}
            className={BTN_SECONDARY}
          >
            Back to home
          </button>
          {known && (
            <button
              type="button"
              onClick={onApplyAgain}
              disabled={!canReapply || isApplyingAgain}
              className={BTN_PRIMARY}
            >
              {isApplyingAgain ? <LoaderCircle size={16} className="animate-spin" /> : null}
              {canReapply ? 'Apply again' : `Available in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}`}
            </button>
          )}
        </div>
      </div>
    </StepCard>
  );
}
