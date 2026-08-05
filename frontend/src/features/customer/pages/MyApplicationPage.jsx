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
  Clock3,
  FileCheck2,
  Camera,
  Image,
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
  FileText,
  UserCheck,
  X,
} from 'lucide-react';
import { usePincodeLookup } from '../hooks/usePincodeLookup';
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
  updatePincode,
} from '../customerApi';
import { authApi } from '../../auth/authApi';


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
    id: 'submit_application',
    label: 'Submit Application',
  },
];

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

  const basicDetailsCompleted =
    mobileVerified &&
    panVerified &&
    emailVerified &&
    hasFullName &&
    hasPanNumber &&
    hasDob &&
    hasGender;

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

  const eligibilityCompleted =
    customer.eligibilityStatus !== null &&
    customer.eligibilityStatus !== undefined &&
    customer.eligibilityStatus !== 'NOT_CHECKED';

  const normalizedStatus = String(
    customer.eligibilityStatus || '',
  ).toUpperCase();
  const eligibilityPassed = [
    'ELIGIBLE',
    'PASSED',
    'APPROVED',
  ].includes(normalizedStatus);

  const assessmentFeePaid = Boolean(
    customer.assessmentFeePaid ||
    customer.latestPayment?.status === 'SUCCESS' ||
    customer.latestPaymentStatus === 'SUCCESS' ||
    (Array.isArray(customer.plPaymentLinks) && customer.plPaymentLinks.some((p) => p.status === 'SUCCESS')),
  );

  const applicationSubmitted = Boolean(
    ['APPLICATION_SUBMITTED', 'LENDER_APPROVED', 'LENDER_REJECTED', 'DISBURSED'].includes(customer.onboardingStatus)
  );

  const aadhaarKycStatus = String(
    customer.aadhaarKycStatus ||
    customer.digilockerStatus ||
    ''
  ).toUpperCase();

  const aadhaarKycCompleted = Boolean(
    customer.aadhaarVerified === true ||
    customer.digilockerVerified === true ||
    ['VERIFIED', 'COMPLETED', 'SUCCESS'].includes(aadhaarKycStatus)
  );

  let currentStep = 'basic_details';
  if (!basicDetailsCompleted) {
    currentStep = 'basic_details';
  } else if (eligibilityCompleted && !eligibilityPassed) {
    currentStep = 'rejection_screen';
  } else if (!eligibilityCompleted || !eligibilityPassed) {
    currentStep = 'basic_details';
  } else if (!assessmentFeePaid) {
    currentStep = 'assessment_fee';
  } else if (!profileDetailsCompleted) {
    currentStep = 'profile_details';
  } else if (!aadhaarKycCompleted) {
    currentStep = 'aadhaar_kyc';
  } else {
    currentStep = 'submit_application';
  }

  if (applicationSubmitted) {
    currentStep = 'submit_application';
  }

  const backendStep = customer.journey?.nextPermittedStep;
  const backendStepMap = {
    BASIC_DETAILS: 'basic_details',
    PLATFORM_REJECTED: 'rejection_screen',
    ASSESSMENT_FEE: 'assessment_fee',
    PROFILE_DETAILS: 'profile_details',
    AADHAAR_KYC: 'aadhaar_kyc',
    ADDRESS_DETAILS: 'submit_application',
    LENDER_CREATE_PROCESSING: 'integration_processing',
    LENDER_UPDATE_PROCESSING: 'integration_processing',
    LENDER_DECISION_PROCESSING: 'integration_processing',
    APPROVAL_PROCESSING: 'integration_processing',
    INTEGRATION_SUPPORT: 'integration_support',
    LENDER_REJECTED: 'submit_application',
    BANK_DETAILS: 'submit_application',
  };
  if (backendStepMap[backendStep]) currentStep = backendStepMap[backendStep];

  return {
    mobileVerified,
    panVerified,
    emailVerified,
    basicDetailsCompleted,
    profileDetailsCompleted,
    aadhaarKycCompleted,
    aadhaarKycStatus,
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

  const [platformProducts, setPlatformProducts] = useState([]);
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

  const [isSaving, setIsSaving] = useState(false);

  const [paymentId, setPaymentId] = useState('');
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
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [submissionData, setSubmissionData] = useState(null);

  const mobileNumber =
    customer?.mobileNumber ||
    storedSession?.mobileNumber ||
    '';

  const fetchCustomer = async () => {
    setIsCustomerLoading(true);
    setCustomerLoadError('');

    try {
      const customerData = await getCustomerMe();
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

      if (customerData.latestApplicationId) {
        setApplicationNumber(`PL-APP-${customerData.latestApplicationId}`);
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
      try {
        const livePhotoDoc = await getCustomerLivePhoto(customerData?.id);
        if (livePhotoDoc && livePhotoDoc.status === 'VERIFIED') {
          setSavedPhotoDocument(livePhotoDoc);
        }
      } catch (photoErr) {
        console.error('Failed to load saved live photo document:', photoErr);
      }
    } catch (err) {
      setCustomerLoadError(
        err?.message || 'Unable to load your details.',
      );
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

  const currentStepIndex = FLOW_STEPS.findIndex(
    (step) => step.id === currentStep,
  );

  const safeCurrentStepIndex =
    currentStepIndex >= 0 ? currentStepIndex : 0;

  const progressPercentage =
    ((safeCurrentStepIndex + 1) / FLOW_STEPS.length) * 100;

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
    } else {
      const birthDate = new Date(
        form.dateOfBirth,
      );

      const today = new Date();

      let age =
        today.getFullYear() -
        birthDate.getFullYear();

      const monthDifference =
        today.getMonth() -
        birthDate.getMonth();

      if (
        monthDifference < 0 ||
        (monthDifference === 0 &&
          today.getDate() <
          birthDate.getDate())
      ) {
        age -= 1;
      }

      if (age < 21 || age > 60) {
        validationErrors.dateOfBirth =
          'Applicant age must be between 21 and 60 years.';
      }
    }

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

    return (
      Object.keys(validationErrors)
        .length === 0
    );
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
      const result = await authApi.sendEmailOtp({
        customerId: storedSession.customerId,
        email: form.email.trim(),
      });

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
      await authApi.verifyEmailOtp({
        customerId: storedSession.customerId,
        email: form.email.trim(),
        otp: otpValue,
      });

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

    const enteredName =
      normalizePersonName(form.fullName);

    const validationErrors = {};

    if (!enteredName) {
      validationErrors.fullName =
        'Enter the name as per PAN.';
    }

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
      const result = await verifyCustomerPan(normalizedPan);

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
          '',
        );

      if (!providerName) {
        throw new Error(
          'The PAN provider did not return the holder name.',
        );
      }

      if (
        !doNamesMatch(
          enteredName,
          providerName,
        )
      ) {
        throw new Error(
          `Entered name does not match the PAN record. PAN record name: ${providerName}`,
        );
      }

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

      if (!normalizedDateOfBirth) {
        throw new Error(
          'The PAN provider did not return a valid date of birth.',
        );
      }

      if (!normalizedGender) {
        throw new Error(
          'The PAN provider did not return a valid gender.',
        );
      }

      const updatedForm = {
        ...form,

        panNumber:
          verifiedPan || normalizedPan,

        fullName: providerName,

        dateOfBirth:
          normalizedDateOfBirth,

        gender: normalizedGender,

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
        panNumber: '',
        dateOfBirth: '',
        gender: '',
      }));

      showMessage(
        'PAN verified successfully. Name, date of birth and gender have been populated.',
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
    if (!validateBasicDetails()) {
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
          residentialPincode: form.pincode ? form.pincode.trim() : undefined,
          email: form.email ? form.email.trim() : undefined,
          emailVerified: emailVerified,
        });

        const appRes = await resumeApplication(customerId);

        if (appRes?.applicationNumber) {
          setApplicationNumber(appRes.applicationNumber);
        }
      }

      let result;
      try {
        const rawResult = await runEligibility(customerId);
        // apiRequest unpacks success/data automatically, so we wrap it back to match the component's expectations
        result = { success: true, data: rawResult };
      } catch (err) {
        result = { success: false, error: err };
      }

      if (!result.success) {
        // ERROR state
        const errorMsg = result.error?.message || result.message;
        console.error('Eligibility technical error:', errorMsg);
        showMessage(errorMsg || 'Unable to complete the eligibility check. Please try again.', 'error');
        setBrePassed(false);
        return;
      }

      if (result.data.outcome === 'FAIL') {
        // FAIL state
        setBrePassed(false);
        setCurrentStep('rejection_screen'); // or however rejection is handled
        showMessage('We are unable to proceed with your application based on our platform policy.', 'error');
        // Refresh customer to get persistent rejection status
        await fetchCustomer();
        return;
      }

      // PASS state
      setBrePassed(true);
      setCurrentStep('assessment_fee');
      setErrors({});

      // Refresh customer profile to load allocated lender and fee snapshot
      await fetchCustomer();

      showMessage(
        'Eligibility check passed. An eligible lender has been assigned.',
      );

      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    } catch (error) {
      console.error('Platform BRE or Father Name save failed:', error);
      setBrePassed(false);
      showMessage(
        'Unable to complete the eligibility check. Please try again.',
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

    if (typeof window.EasebuzzCheckout !== 'function') {
      showMessage(
        'Easebuzz checkout could not be loaded. Please refresh the page.',
        'error',
      );
      return;
    }

    setIsFeeProcessing(true);
    clearMessage();

    try {
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

      const easebuzzCheckout = new window.EasebuzzCheckout(
        merchantKey,
        env === 'prod' ? 'prod' : 'test',
      );

      const handleEasebuzzResponse = (paymentResponse) => {
        console.log('Easebuzz checkout callback response:', paymentResponse);

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
        theme: '#2563eb',
      });
    } catch (error) {
      console.error('Failed to initiate Easebuzz payment:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Payment initiation failed.';
      showMessage(errorMessage, 'error');
      setIsFeeProcessing(false);
    }
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
          showMessage('Assessment fee payment verified successfully.');
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
    };
  }, []);

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
    if (!validateBasicDetails()) {
      showMessage('Basic details are incomplete.', 'error');
      goToStep('basic_details');
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
      const appNum = res?.applicationNumber || `PL-APP-${Date.now()}`;

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

  if (customerLoadError) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-xl rounded-3xl border border-red-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-100 text-red-600">
            <AlertCircle size={28} />
          </div>

          <h3 className="mt-4 text-lg font-bold text-slate-900">
            Unable to load application
          </h3>

          <p className="mt-2 text-sm text-slate-600">
            {customerLoadError}
          </p>

          <button
            type="button"
            onClick={fetchCustomer}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow transition hover:bg-emerald-700"
          >
            <RotateCcw size={16} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const workflow = deriveCustomerWorkflow(customer);

  return (
    <div className="mx-auto max-w-7xl">
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
          transactionId={transactionId}
          onConsentChange={setLenderConsent}
          onBack={() => goToStep('basic_details')}
          onPay={handlePayClick}
          onContinue={handleProceedToProfile}
        />
      )}

      {currentStep === 'rejection_screen' && (
        <StepCard>
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-red-100 text-red-600 mb-6">
              <AlertCircle size={32} />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">Application Unsuccessful</h2>
            <p className="text-slate-600 max-w-md mx-auto mb-8">
              Based on the information provided, we are unable to proceed with your application at this time as it does not meet our current platform policies.
              {customer?.eligibilityReason && customer.eligibilityReason !== 'Platform policy rejection' && (
                <span className="block mt-4 p-3 bg-red-50 text-sm text-red-700 rounded border border-red-100 font-medium text-left">
                  {customer.eligibilityReason}
                </span>
              )}
            </p>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition"
            >
              Return to Home
            </button>
          </div>
        </StepCard>
      )}

      {currentStep === 'profile_details' && (
        <ProfileDetailsStep
          customerId={customerId}
          applicationId={customer?.latestApplicationId}
          customerCode={customer?.customerCode}
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

      {currentStep === 'submit_application' && (
        <SubmitApplicationStep
          form={form}
          customer={customer}
          savedPhotoDocument={savedPhotoDocument}
          mobileNumber={mobileNumber}
          applicationSubmitted={applicationSubmitted}
          applicationNumber={applicationNumber}
          isSubmitting={isSubmitting}
          onBack={() => goToStep('aadhaar_kyc')}
          onSubmit={handleSubmitApplication}
        />
      )}
      {currentStep === 'integration_processing' && (
        <StepCard>
          <div className="p-8 text-center">
            <LoaderCircle className="mx-auto h-10 w-10 animate-spin text-emerald-600" />
            <h2 className="mt-4 text-xl font-bold text-slate-900">Your lender application is processing</h2>
            <p className="mt-2 text-sm text-slate-600">We are securely completing the current lender integration stage. This page will resume from the backend-confirmed state.</p>
          </div>
        </StepCard>
      )}
      {currentStep === 'integration_support' && (
        <StepCard>
          <div className="p-8 text-center">
            <AlertCircle className="mx-auto h-10 w-10 text-amber-600" />
            <h2 className="mt-4 text-xl font-bold text-slate-900">We need to retry this application securely</h2>
            <p className="mt-2 text-sm text-slate-600">Your data and payment remain recorded. Please contact support and quote error code {customer?.journey?.integration?.safeErrorCode || 'INTEGRATION_REVIEW'}.</p>
          </div>
        </StepCard>
      )}
    </div>
  );
}

function AadhaarKycStep({
  customerId,
  customerCode,
  customer,
  workflow,
  onCompleted,
  onBack,
}) {
  const [consentGiven, setConsentGiven] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [kycStatus, setKycStatus] = useState(null);
  const [polling, setPolling] = useState(false);
  const pollTimerRef = useRef(null);

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
        onCompleted?.();
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
    try {
      const res = await initiateCustomerAadhaarKyc(customerCode);
      if (res?.verificationUrl) {
        const popup = window.open(
          res.verificationUrl,
          'DigitapDigiLocker',
          'width=520,height=760,resizable=yes,scrollbars=yes'
        );
        if (!popup) {
          setError('Popup was blocked by browser. Please allow popups and click Start DigiLocker Verification again.');
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

  const isVerified = Boolean(
    kycStatus?.aadhaarVerified ||
    kycStatus?.status === 'VERIFIED' ||
    customer?.aadhaarVerified ||
    customer?.digilockerStatus === 'VERIFIED'
  );

  return (
    <StepCard>
      <StepHeading
        icon={FileCheck2}
        eyebrow="AADHAAR VERIFICATION"
        title="Aadhaar KYC via DigiLocker"
        description="Verify your identity securely through DigiLocker before submitting your application to the lender."
      />

      <div className="mt-6 space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5 space-y-3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Applicant Name</p>
              <p className="mt-0.5 text-sm font-bold text-slate-800">{customer?.fullName || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Registered Mobile</p>
              <p className="mt-0.5 text-sm font-bold text-slate-800">
                {customer?.mobileNumber ? `+91 ${customer.mobileNumber.slice(0, 2)}****${customer.mobileNumber.slice(-4)}` : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Customer Reference</p>
              <p className="mt-0.5 font-mono text-sm font-bold text-emerald-700">{customerCode || customer?.customerCode || 'N/A'}</p>
            </div>
          </div>
        </div>

        {isVerified ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-500 text-white">
              <CheckCircle2 size={24} />
            </div>
            <h3 className="mt-3 text-lg font-bold text-emerald-900">Aadhaar KYC Verified</h3>
            <p className="mt-1 text-sm text-emerald-700">
              Your identity has been verified via DigiLocker.
              {kycStatus?.maskedAadhaar ? ` (Aadhaar: ${kycStatus.maskedAadhaar})` : ''}
            </p>
            {(kycStatus?.aadhaarVerifiedName || customer?.aadhaarVerifiedName) && (
              <p className="mt-2 text-sm font-semibold text-emerald-900">
                Verified Name: {kycStatus?.aadhaarVerifiedName || customer?.aadhaarVerifiedName}
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-5">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentGiven}
                  onChange={(e) => setConsentGiven(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs text-slate-700 leading-relaxed">
                  I consent to Fintree Finance Private Limited securely initiating DigiLocker-based Aadhaar KYC using my verified account information. I authorize the retrieval and processing of permitted identity information for loan onboarding, verification and lender submission.
                </span>
              </label>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-700 flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={handleStartDigilocker}
                disabled={!consentGiven || loading}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow transition hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
              >
                {loading ? <LoaderCircle size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                Start DigiLocker Verification
              </button>

              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 cursor-pointer"
              >
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                Check Status
              </button>
            </div>

            {polling && (
              <div className="flex items-center gap-3 text-xs font-medium text-blue-700 bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                <LoaderCircle size={14} className="animate-spin text-blue-600" />
                <span>DigiLocker verification in progress... Please complete the window and return.</span>
              </div>
            )}
          </>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 pt-6">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 cursor-pointer"
          >
            <ArrowLeft size={16} /> Back
          </button>

          {isVerified && (
            <button
              type="button"
              onClick={onCompleted}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow transition hover:bg-emerald-700 cursor-pointer"
            >
              Continue to Submit Application <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </StepCard>
  );
}

function ApplicationProgress({ currentStep, workflow }) {
  const stepIndices = {
    basic_details: 0,
    assessment_fee: 1,
    profile_details: 2,
    aadhaar_kyc: 3,
    submit_application: 4,
  };
  const currentStepIndex = stepIndices[currentStep] ?? 0;
  const progressPercentage =
    ((currentStepIndex + 1) / FLOW_STEPS.length) * 100;

  return (
    <section className="mb-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-emerald-700 to-emerald-500 px-6 py-6 text-white sm:px-8">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <p className="text-sm font-medium text-emerald-100">
              Personal Loan Application
            </p>

            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
              My Application
            </h1>

            <p className="mt-2 text-sm text-emerald-50">
              Complete all steps and submit your application to the assigned lender.
            </p>
          </div>

          <div className="w-full max-w-sm rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur">
            <div className="flex justify-between text-sm">
              <span className="text-emerald-100">Progress</span>
              <strong>{Math.round(progressPercentage)}%</strong>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white transition-all duration-500"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        </div>

        {/* Basic Details Status Badges Summary */}
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/20 pt-4">
          <span className="text-xs font-semibold text-emerald-100">
            Basic Details Status:
          </span>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${workflow?.mobileVerified
                ? 'bg-emerald-800/80 text-white border border-emerald-400/50'
                : 'bg-white/10 text-emerald-100'
              }`}
          >
            {workflow?.mobileVerified ? (
              <CheckCircle2 size={14} className="text-emerald-300" />
            ) : null}
            Mobile {workflow?.mobileVerified ? 'Verified' : 'Pending'}
          </span>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${workflow?.panVerified
                ? 'bg-emerald-800/80 text-white border border-emerald-400/50'
                : 'bg-white/10 text-emerald-100'
              }`}
          >
            {workflow?.panVerified ? (
              <CheckCircle2 size={14} className="text-emerald-300" />
            ) : null}
            PAN {workflow?.panVerified ? 'Verified' : 'Pending'}
          </span>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${workflow?.emailVerified
                ? 'bg-emerald-800/80 text-white border border-emerald-400/50'
                : 'bg-white/10 text-emerald-100'
              }`}
          >
            {workflow?.emailVerified ? (
              <CheckCircle2 size={14} className="text-emerald-300" />
            ) : null}
            Email {workflow?.emailVerified ? 'Verified' : 'Pending'}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto px-4 py-4 sm:px-6">
        <div className="flex min-w-[680px] items-center">
          {FLOW_STEPS.map((step, index) => {
            let isCompleted = false;
            if (step.id === 'basic_details') {
              isCompleted = Boolean(workflow?.basicDetailsCompleted);
            } else if (step.id === 'assessment_fee') {
              isCompleted = Boolean(workflow?.assessmentFeePaid);
            } else if (step.id === 'profile_details') {
              isCompleted = Boolean(workflow?.profileDetailsCompleted);
            } else if (step.id === 'aadhaar_kyc') {
              isCompleted = Boolean(workflow?.aadhaarKycCompleted);
            } else if (step.id === 'submit_application') {
              isCompleted = Boolean(workflow?.applicationSubmitted);
            }

            const isActive = step.id === currentStep && !isCompleted;

            return (
              <div key={step.id} className="flex flex-1 items-center">
                <div className="flex items-center gap-2">
                  <div
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${isCompleted
                        ? 'bg-emerald-600 text-white'
                        : isActive
                          ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                          : 'bg-slate-100 text-slate-400'
                      }`}
                  >
                    {isCompleted ? <Check size={17} /> : index + 1}
                  </div>

                  <span
                    className={`whitespace-nowrap text-xs font-semibold ${isActive
                        ? 'text-blue-700'
                        : isCompleted
                          ? 'text-emerald-700'
                          : 'text-slate-400'
                      }`}
                  >
                    {step.label}
                  </span>
                </div>

                {index < FLOW_STEPS.length - 1 && (
                  <div
                    className={`mx-3 h-0.5 flex-1 ${isCompleted ? 'bg-emerald-500' : 'bg-slate-200'
                      }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MessageBanner({
  message,
  type,
}) {
  return (
    <div
      className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${type === 'error'
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
        }`}
    >
      {message}
    </div>
  );
}

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
  isPanVerifying,
  isBreRunning,
  isSaving,
  onChange,
  onVerifyEmail,
  onSendEmailOtp,
  onVerifyEmailOtp,
  onEmailOtpChange,
  onVerifyPan,
  onSaveDraft,
  onContinue,
  platformProducts,
  isLoadingPlatformProducts,
  applicationNumber,
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
        `Auto-populated Name: "${extractedName || '—'}", PAN: "${extractedPan || '—'}"${extractedFatherName ? `, & Father's Name: "${extractedFatherName}"` : ''}. Please review details and click "Verify PAN".`
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
        title="Verify your PAN"
        description={
          panVerified
            ? 'Your PAN has been verified. Complete the remaining details to check your eligibility.'
            : 'Enter your name exactly as shown on your PAN card and enter your PAN number.'
        }
        right={
          <StatusBadge>
            <Phone size={15} />
            Mobile verified
          </StatusBadge>
        }
      />


      <SectionHeading
        title="PAN verification"
        description="The entered name must match the PAN holder name."
      />

      {!panVerified && (
        <div className="mb-6 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50/80 via-slate-50 to-indigo-50/50 p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-200">
                <ScanLine size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  Auto-fill details via PAN Card OCR
                  <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-extrabold text-blue-700 uppercase tracking-wider">AI Scan</span>
                </h4>
                <p className="text-xs text-slate-500">
                  Upload or capture your PAN card image to auto-fill your Name as per PAN and PAN Number
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
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
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-400 transition cursor-pointer disabled:opacity-60"
            >
              {isOcrScanning ? <LoaderCircle size={15} className="animate-spin text-blue-600" /> : <Upload size={15} className="text-blue-600" />}
              <span>Upload PAN Photo</span>
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
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition cursor-pointer disabled:opacity-60"
            >
              {isOcrScanning ? <LoaderCircle size={15} className="animate-spin" /> : <Camera size={15} />}
              <span>Take Photo (Camera)</span>
            </button>
          </div>

          {isOcrScanning && (
            <div className="mt-3.5 flex items-center gap-2.5 rounded-xl bg-blue-100/80 p-3 text-xs font-semibold text-blue-900 border border-blue-200">
              <LoaderCircle size={16} className="animate-spin text-blue-600 shrink-0" />
              <span>Scanning PAN Card with AI OCR... Extracting Full Name and PAN Number...</span>
            </div>
          )}

          {ocrSuccessMsg && !isOcrScanning && (
            <div className="mt-3.5 flex items-start gap-2.5 rounded-xl bg-emerald-50 p-3.5 text-xs font-medium text-emerald-900 border border-emerald-200">
              <Sparkles size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-emerald-800">PAN OCR Success!</span> {ocrSuccessMsg}
              </div>
            </div>
          )}

          {ocrError && !isOcrScanning && (
            <div className="mt-3.5 flex items-start gap-2.5 rounded-xl bg-red-50 p-3 text-xs font-medium text-red-800 border border-red-200">
              <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
              <div>{ocrError}</div>
            </div>
          )}
        </div>
      )}

      {/* Camera Capture Modal */}
      {isPanCameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Camera className="h-5 w-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">Capture PAN Card Photo</h3>
              </div>
              <button
                type="button"
                onClick={handleClosePanCamera}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="relative overflow-hidden rounded-2xl bg-black mb-4">
              <video
                ref={panVideoRef}
                autoPlay
                playsInline
                muted
                className="h-64 w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                <div className="h-44 w-full rounded-2xl border-2 border-dashed border-white/80 bg-blue-500/10 shadow-2xl flex flex-col items-center justify-center text-white/90 text-xs font-semibold">
                  <span>Align PAN Card inside frame</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleClosePanCamera}
                className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCapturePanPhoto}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-700 transition cursor-pointer"
              >
                <Camera size={16} />
                <span>Capture & Scan PAN</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <FormInput
          label="Name as per PAN"
          name="fullName"
          value={form.fullName}
          error={errors.fullName}
          onChange={onChange}
          placeholder="Enter full name as per PAN"
          readOnly={panVerified}
          helperText={
            panVerified
              ? 'Name verified from PAN records'
              : 'Enter the complete name shown on your PAN card'
          }
          required
        />

        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            PAN number
            <span className="ml-1 text-red-500">
              *
            </span>
          </label>

          <div
            className={`flex overflow-hidden rounded-xl border bg-white ${errors.panNumber
                ? 'border-red-400 ring-4 ring-red-50'
                : panVerified
                  ? 'border-emerald-400 ring-4 ring-emerald-50'
                  : 'border-slate-300 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-50'
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
              className="min-w-0 flex-1 px-4 py-3 text-sm font-medium uppercase outline-none read-only:bg-slate-50 read-only:text-slate-600"
            />

            <button
              type="button"
              onClick={
                onVerifyPan
              }
              disabled={
                isPanVerifying ||
                panVerified ||
                !form.fullName.trim() ||
                form.panNumber
                  .length !== 10
              }
              className={`flex shrink-0 items-center gap-1.5 border-l px-4 text-xs font-semibold ${panVerified
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 text-blue-700 hover:bg-blue-50'
                } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {isPanVerifying ? (
                <>
                  <LoaderCircle
                    size={15}
                    className="animate-spin"
                  />
                  Verifying PAN
                </>
              ) : panVerified ? (
                <>
                  <CheckCircle2
                    size={15}
                  />
                  PAN Verified
                </>
              ) : (
                'Verify PAN'
              )}
            </button>
          </div>

          {errors.panNumber ? (
            <p className="mt-1.5 text-xs text-red-600">
              {
                errors.panNumber
              }
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-slate-500">
              Format:
              ABCDE1234F
            </p>
          )}
        </div>

        <FormInput
          label="Father's name"
          name="fatherName"
          value={form.fatherName}
          error={errors.fatherName}
          onChange={onChange}
          placeholder="Enter father's full name"
          helperText="Auto-filled via PAN OCR or enter manually"
          required
        />
      </div>

      {!panVerified && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <Info
            size={19}
            className="mt-0.5 shrink-0 text-blue-700"
          />

          <p className="text-sm leading-6 text-blue-800">
            Your verified name,
            date of birth and gender
            will appear automatically
            after PAN verification.
          </p>
        </div>
      )}

      {panVerified && (
        <>
          <div className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2
                size={22}
                className="mt-0.5 shrink-0 text-emerald-700"
              />

              <div>
                <p className="text-sm font-bold text-emerald-900">
                  PAN verified
                  successfully
                </p>

                <p className="mt-1 text-xs text-emerald-700">
                  Your PAN details
                  have been fetched
                  and populated.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-7">
            <SectionHeading
              title="Verified personal details"
              description="These details were received from the PAN verification service."
            />

            <div className="grid gap-5 md:grid-cols-2">
              <FormInput
                label="Verified name"
                value={
                  form.fullName
                }
                readOnly
                disabled
                helperText="Verified from PAN"
              />

              <FormInput
                label="Date of birth"
                name="dateOfBirth"
                type="date"
                value={
                  form.dateOfBirth
                }
                error={
                  errors.dateOfBirth
                }
                readOnly
                disabled
                helperText="Verified from PAN"
              />

              <FormSelect
                label="Gender"
                name="gender"
                value={form.gender}
                error={
                  errors.gender
                }
                onChange={() => { }}
                disabled
                options={[
                  ['MALE', 'Male'],
                  [
                    'FEMALE',
                    'Female',
                  ],
                  [
                    'OTHER',
                    'Other',
                  ],
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
                placeholder="Enter father's full name"
                required
              />

              <FormInput
                label="Residential PIN code"
                name="pincode"
                value={
                  form.pincode
                }
                error={
                  errors.pincode
                }
                onChange={onChange}
                placeholder="Enter 6-digit PIN code"
                maxLength={6}
                inputMode="numeric"
                required
              />

              {pincodeCity && pincodeState && (
                <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <MapPin
                    size={18}
                    className="mt-0.5 shrink-0 text-emerald-700"
                  />
                  <div>
                    <p className="text-sm font-semibold text-emerald-900">
                      {pincodeCity}, {pincodeState}
                    </p>
                    <p className="mt-0.5 text-xs text-emerald-600">
                      Location verified from PIN code
                    </p>
                  </div>
                </div>
              )}

              {isPincodeLoading && (
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <LoaderCircle
                    size={16}
                    className="animate-spin text-slate-500"
                  />
                  <span className="text-xs text-slate-500">
                    Looking up location...
                  </span>
                </div>
              )}

              {pincodeError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                  {pincodeError}
                </div>
              )}
            </div>
          </div>

          <div className="my-8 border-t border-slate-200" />

          <SectionHeading
            title="Communication"
            description="We will send receipts, KFS and application updates here."
          />

          <div className="grid gap-5 md:grid-cols-2">
            <FormInput
              label="Mobile number"
              value={`+91 ${mobileNumber}`}
              readOnly
              disabled
              helperText="Verified during login"
              required
            />

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Email address
                <span className="ml-1 text-red-500">
                  *
                </span>
              </label>

              <div
                className={`flex overflow-hidden rounded-xl border bg-white ${errors.email
                    ? 'border-red-400 ring-4 ring-red-50'
                    : emailVerified
                      ? 'border-emerald-400 ring-4 ring-emerald-50'
                      : 'border-slate-300 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-50'
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
                  className="min-w-0 flex-1 px-4 py-3 text-sm outline-none"
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
                    className={`flex shrink-0 items-center gap-1.5 border-l px-4 text-xs font-semibold border-slate-200 text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {isEmailVerifying ? (
                      <>
                        <LoaderCircle
                          size={15}
                          className="animate-spin"
                        />
                        Sending OTP
                      </>
                    ) : (
                      'Send OTP'
                    )}
                  </button>
                )}

                {emailVerified && (
                  <span
                    className={`flex shrink-0 items-center gap-1.5 border-l px-4 text-xs font-semibold border-emerald-200 bg-emerald-50 text-emerald-700`}
                  >
                    <MailCheck size={15} />
                    Verified
                  </span>
                )}
              </div>

              {isEmailOtpSent && !emailVerified && (
                <div className="mt-3">
                  <div
                    className={`flex overflow-hidden rounded-xl border bg-white ${errors.email
                        ? 'border-red-400 ring-4 ring-red-50'
                        : 'border-slate-300 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-50'
                      }`}
                  >
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={emailOtp}
                      onChange={(event) =>
                        onEmailOtpChange(
                          event.target.value.replace(/\D/g, '').slice(0, 6)
                        )
                      }
                      placeholder="Enter 6-digit OTP"
                      className="min-w-0 flex-1 px-4 py-3 text-sm font-medium outline-none"
                    />
                    <button
                      type="button"
                      onClick={onVerifyEmailOtp}
                      disabled={isEmailVerifying || emailOtp.length !== 6}
                      className="flex shrink-0 items-center gap-1.5 border-l border-slate-200 px-4 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isEmailVerifying ? (
                        <>
                          <LoaderCircle size={15} className="animate-spin" />
                          Verifying
                        </>
                      ) : (
                        'Verify OTP'
                      )}
                    </button>
                  </div>
                  {developmentEmailOtp && (
                    <p className="mt-1.5 text-xs text-amber-600">
                      Dev OTP: {developmentEmailOtp}
                    </p>
                  )}
                </div>
              )}

              {errors.email && (
                <p className="mt-1.5 text-xs text-red-600">
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
                ? 'Checking Eligibility...'
                : 'Check Eligibility'
            }
            nextDisabled={
              isBreRunning ||
              !panVerified ||
              !emailVerified
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

function AssessmentFeeStep({
  customer,
  lenderConsent,
  feePaid,
  isFeeProcessing,
  isCheckingPayment,
  transactionId,
  onConsentChange,
  onBack,
  onPay,
  onContinue,
}) {
  const lenderName = customer?.allocatedLenderName || customer?.allocatedLenderCode || 'Lending Partner';
  const baseFee = customer?.assessmentFee?.baseAmount || 0;
  const gstFee = customer?.assessmentFee?.gstAmount || 0;
  const totalFee = customer?.assessmentFee?.totalAmount || 0;
  const gstRate = customer?.assessmentFee?.gstRate || 18;

  return (
    <StepCard>
      <StepHeading
        icon={Building2}
        eyebrow="LENDER & ASSESSMENT FEE"
        title="Your application route"
        description="An eligible lending partner has been assigned based on policy and available allocation."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-3xl border border-slate-200 p-6">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700">
            <BadgeCheck size={17} />
            Allocated lending partner
          </p>

          <div className="mt-5 flex flex-col justify-between gap-4 border-b border-slate-100 pb-6 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-600 font-bold text-white">
                {lenderName.substring(0, 2).toUpperCase()}
              </div>

              <div>
                <h3 className="font-bold text-slate-900">
                  {lenderName}
                </h3>

                <p className="mt-1 text-xs text-slate-500">
                  Personal Loan · New customer
                </p>
              </div>
            </div>

            <span className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
              Assigned
            </span>
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
            <Info
              size={19}
              className="mt-0.5 shrink-0 text-blue-700"
            />

            <p>
              <strong>Why this lender?</strong>
              <br />
              Your profile matches the active lender policy and monthly capacity is available.
            </p>
          </div>

          <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
            <input
              type="checkbox"
              checked={lenderConsent}
              disabled={feePaid || isFeeProcessing || isCheckingPayment}
              onChange={(event) =>
                onConsentChange(event.target.checked)
              }
              className="mt-0.5 h-4 w-4 accent-blue-600"
            />

            <span className="text-xs leading-5 text-slate-700">
              I consent to share my application data with{' '}
              <strong>{lenderName}</strong> for eligibility assessment and final decision.
            </span>
          </label>

          <p className="mt-4 text-xs leading-5 text-slate-400">
            Payment does not guarantee loan approval. The lender performs an independent eligibility check after submission.
          </p>
        </section>

        <aside className="flex flex-col justify-between rounded-3xl bg-slate-950 p-6 text-white shadow-xl">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Assessment fee
            </p>

            <div className="mt-6 space-y-4">
              <FeeRow
                label="Base fee"
                amount={`₹${baseFee.toFixed(2)}`}
              />

              <FeeRow
                label={`GST at ${gstRate}%`}
                amount={`₹${gstFee.toFixed(2)}`}
              />

              <div className="flex items-center justify-between border-t border-slate-800 pt-5">
                <span className="text-sm text-slate-300">
                  Total payable
                </span>

                <strong className="text-2xl">
                  {`₹${totalFee.toFixed(2)}`}
                </strong>
              </div>
            </div>
          </div>

          <div className="mt-8">
            {feePaid ? (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="shrink-0 text-emerald-400" />

                  <div>
                    <p className="text-sm font-bold text-white">
                      Payment successful
                    </p>

                    <p className="mt-1 text-xs text-emerald-200">
                      {transactionId ? `Txn Ref: ${transactionId}` : 'Fee Verified'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={
                  !lenderConsent ||
                  isFeeProcessing ||
                  isCheckingPayment
                }
                onClick={onPay}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isCheckingPayment ? (
                  <>
                    <LoaderCircle
                      size={18}
                      className="animate-spin"
                    />
                    Confirming payment...
                  </>
                ) : isFeeProcessing ? (
                  <>
                    <LoaderCircle
                      size={18}
                      className="animate-spin"
                    />
                    Initializing secure payment...
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
            )}

            <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
              <Lock size={13} />
              256bit Secure Easebuzz Payment
            </p>
          </div>
        </aside>
      </div>

      <StepActions
        onBack={onBack}
        onNext={onContinue}
        nextLabel="Complete Profile"
        nextDisabled={false}
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
    <div className="flex justify-between border-b border-slate-800 pb-4 text-sm">
      <span className="text-slate-400">
        {label}
      </span>

      <strong>{amount}</strong>
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

function LivePhotographSection({
  customerId,
  applicationId,
  customerCode,
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
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isWatermarking, setIsWatermarking] = useState(false);
  const [isRunningLiveness, setIsRunningLiveness] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [livenessResult, setLivenessResult] = useState(null);
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

  const handleVerifyAndSave = async () => {
    if (!taggedBlob || !locationData) {
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
      reader.readAsDataURL(taggedBlob);
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
      const imageFile = new File([taggedBlob], `customer-${customerId}-live-photo.jpg`, {
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
    <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <canvas ref={canvasRef} className="hidden" />

      <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <Camera size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Live photograph and location verification
            </h3>
            <p className="text-xs text-slate-500">
              Capture a live photograph at your current location. The date, time, coordinates and address will be printed on the image.
            </p>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
          Required
        </span>
      </div>

      {!savedPhotoDocument && !capturedPhotoUrl && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <input
            type="checkbox"
            id="photoConsent"
            checked={consentChecked}
            onChange={(e) => {
              setConsentChecked(e.target.checked);
              setPhotoError('');
            }}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          <label htmlFor="photoConsent" className="text-xs leading-relaxed text-slate-700">
            I consent to the capture and processing of my live photograph and current location for identity verification, fraud prevention and loan application processing.
          </label>
        </div>
      )}

      {photoError && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">
          <AlertCircle size={16} className="shrink-0 text-rose-600" />
          <span>{photoError}</span>
        </div>
      )}

      {savedPhotoDocument ? (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-lg border border-emerald-300 bg-slate-100">
              <img
                src={savedPhotoDocument.fileUrl}
                alt="Saved customer photo"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex-1 space-y-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 font-semibold text-emerald-800">
                  <UserCheck size={13} /> Face Verified
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 font-semibold text-blue-800">
                  <MapPin size={13} /> Location Captured
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 font-semibold text-slate-700">
                  <CheckCircle2 size={13} /> Uploaded & Saved
                </span>
              </div>
              <p className="font-semibold text-slate-900">
                {savedPhotoDocument.formattedAddress || 'Address recorded'}
              </p>
              {savedPhotoDocument.latitude && savedPhotoDocument.longitude && (
                <p className="text-slate-600">
                  Lat: {Number(savedPhotoDocument.latitude).toFixed(6)}, Lon: {Number(savedPhotoDocument.longitude).toFixed(6)}
                </p>
              )}
              {savedPhotoDocument.capturedAt && (
                <p className="text-slate-500">
                  Captured: {new Date(savedPhotoDocument.capturedAt).toLocaleString('en-IN')}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleRetake}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw size={14} /> Retake Photo
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
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Camera size={18} /> Open Camera & Verify Location
            </button>
          )}

          {isCameraOpen && (
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-full max-w-md overflow-hidden rounded-2xl border-2 border-emerald-500 bg-slate-900 shadow-lg">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-72 w-full object-cover"
                />
                <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-slate-900/80 px-3 py-1 text-xs font-medium text-emerald-400 backdrop-blur-sm">
                  {isLoadingLocation ? (
                    <>
                      <LoaderCircle size={12} className="animate-spin" /> Fetching GPS coordinates...
                    </>
                  ) : (
                    <>
                      <MapPin size={12} /> {locationData ? `GPS: ${locationData.latitude.toFixed(4)}, ${locationData.longitude.toFixed(4)}` : 'Location active'}
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCapturePhoto}
                  disabled={isLoadingLocation || isWatermarking}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isWatermarking ? (
                    <>
                      <LoaderCircle size={18} className="animate-spin" /> Processing Snapshot...
                    </>
                  ) : (
                    <>
                      <Camera size={18} /> Capture Photo
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={stopCameraStream}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <X size={18} /> Cancel
                </button>
              </div>
            </div>
          )}

          {capturedPhotoUrl && !isCameraOpen && (
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-full max-w-md overflow-hidden rounded-2xl border-2 border-emerald-500 bg-slate-950 shadow-lg">
                <img
                  src={capturedPhotoUrl}
                  alt="Captured Geo-tagged"
                  className="w-full object-contain"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleVerifyAndSave}
                  disabled={isRunningLiveness || isUploading}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isRunningLiveness ? (
                    <>
                      <LoaderCircle size={18} className="animate-spin" /> Verifying Face Liveness...
                    </>
                  ) : isUploading ? (
                    <>
                      <LoaderCircle size={18} className="animate-spin" /> Saving Document...
                    </>
                  ) : (
                    <>
                      <UserCheck size={18} /> Verify and Save Photo
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleRetake}
                  disabled={isRunningLiveness || isUploading}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <RotateCcw size={18} /> Retake
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProfileDetailsStep({
  customerId,
  applicationId,
  customerCode,
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
        title="Residence and professional details"
        description="Add the details required by the assigned lender before submission."
        right={
          <StatusBadge>
            <ReceiptText
              size={15}
            />
            Fee paid
          </StatusBadge>
        }
      />

      <SectionHeading
        title="Residence and employment"
        description="Provide your current residence and work status."
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

        <FormSelect
          label="Employment type"
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
            ],
            [
              'SELF_EMPLOYED',
              'Self-employed',
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
            placeholder="Enter company name"
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
            placeholder="Enter designation"
            required
          />

          <FormInput
            label="Net monthly salary"
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
            label="Current employment vintage"
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
            label="Mode of salary"
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
            placeholder="Enter business name"
            required
          />

          <FormSelect
            label="Business constitution"
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
            label="Business vintage"
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
          label="KFS language"
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
        savedPhotoDocument={savedPhotoDocument}
        onPhotoSaved={onPhotoSaved}
      />

      <div className="mt-7 flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
        <ShieldCheck
          size={20}
          className="mt-0.5 shrink-0"
        />

        Your information is
        encrypted and shared only
        with the assigned lender
        after consent.
      </div>

      <StepActions
        onBack={onBack}
        onSave={onSaveDraft}
        isSaving={isSaving}
        onNext={onContinue}
        nextLabel="Continue to Aadhaar KYC"
      />
    </StepCard>
  );
}

function SubmitApplicationStep({
  form,
  customer,
  savedPhotoDocument,
  mobileNumber,
  applicationSubmitted,
  applicationNumber,
  isSubmitting,
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
  if (isSubmittedState) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className={`rounded-3xl p-6 text-white shadow-xl ${isApproved ? 'bg-gradient-to-r from-emerald-900 via-slate-900 to-slate-950 border border-emerald-500/30' : isRejected ? 'bg-gradient-to-r from-red-900 via-slate-900 to-slate-950 border border-red-500/30' : 'bg-gradient-to-r from-slate-900 via-amber-950/40 to-slate-950 border border-amber-500/30'}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${isApproved ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : isRejected ? 'bg-red-500/20 text-red-300 border border-red-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}`}>
                  <span className={`h-2 w-2 rounded-full ${isApproved ? 'bg-emerald-400' : isRejected ? 'bg-red-400' : 'bg-amber-400 animate-ping'}`}></span>
                  {isApproved ? 'FINAL APPROVAL GRANTED' : isRejected ? 'APPLICATION REJECTED' : 'UNDER FINAL APPROVAL'}
                </span>
              </div>
              <h2 className="mt-3 text-2xl font-black text-white tracking-tight">
                {isApproved ? 'Congratulations! Loan Final Approval Received' : isRejected ? 'Application Declined' : 'Application Submitted for Final Review'}
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
                {isApproved
                  ? 'Fintree Finance has approved your loan application. You can now continue your post-approval journey.'
                  : isRejected
                    ? 'Unfortunately, your application did not meet the lender criteria at this time.'
                    : 'Your loan application is currently under final evaluation by our credit underwriting team. Once final approval comes, the next flow will start automatically.'}
              </p>
            </div>
          </div>
        </div>

        {isApproved && hasLan && (() => {
          const isDisbursalRequestedOrDisbursed =
            customer?.latestDisbursalStatus === 'DISBURSAL_REQUESTED' ||
            customer?.latestDisbursalStatus === 'DISBURSAL_PROCESSING' ||
            customer?.latestDisbursalStatus === 'DISBURSED' ||
            customer?.latestLoanStatus === 'DISBURSED';

          return (
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-center shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 mb-2">
                {isDisbursalRequestedOrDisbursed ? 'Loan Account & Disbursal Status' : 'Continue to Disbursal'}
              </h3>
              <p className="text-sm text-slate-600 mb-6">Your Loan Account Number is: <strong>{customer.latestLan}</strong></p>
              <button
                onClick={() =>
                  navigate(
                    isDisbursalRequestedOrDisbursed
                      ? `/customer/loan/${customer.latestLan}/details`
                      : `/customer/loan/${customer.latestLan}/post-approval`
                  )
                }
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white shadow hover:bg-emerald-700 cursor-pointer"
              >
                {isDisbursalRequestedOrDisbursed ? 'View Loan Details' : 'Continue Approved Loan Journey'}
                <ArrowRight size={18} />
              </button>
            </div>
          );
        })()}

        {isApproved && !hasLan && (
          <div className="rounded-3xl border border-emerald-200 bg-white p-6 text-center shadow-sm">
            <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-emerald-600 mb-4" />
            <h3 className="text-lg font-bold text-slate-900 mb-2">Generating Loan Account...</h3>
            <p className="text-sm text-slate-600">Please wait while we set up your loan account.</p>
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
        title="Review and submit your application"
        description="Confirm that the information below is correct before submitting it to the lender."
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <ReviewSection
            icon={CircleUserRound}
            title="Personal Details"
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
            title="Professional Details"
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
              label="KFS language"
              value={
                form.kfsLanguage
              }
            />
          </ReviewSection>
        </div>

        <aside className="h-fit rounded-3xl border border-slate-200 bg-slate-50 p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Submission Summary
          </p>

          <div className="mt-5 space-y-4">
            <SummaryStatus
              label="Mobile verification"
              value="Completed"
            />

            <SummaryStatus
              label="PAN verification"
              value="Completed"
            />

            <SummaryStatus
              label="Email verification"
              value="Completed"
            />

            <SummaryStatus
              label="Platform BRE"
              value="Passed"
            />

            <SummaryStatus
              label="Assigned lender"
              value="Fintree Finance"
            />

            <SummaryStatus
              label="Assessment fee"
              value="Paid"
            />

            <SummaryStatus
              label="Profile details"
              value="Completed"
            />
          </div>

          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <Info
                size={18}
                className="mt-0.5 shrink-0 text-amber-700"
              />

              <p className="text-xs leading-5 text-amber-800">
                Submission does not
                guarantee loan
                approval. The lender
                performs its own
                credit assessment.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
            <label className="flex items-start gap-3 text-xs leading-5 text-slate-700">
              <input
                type="checkbox"
                checked={sameAsPermanent}
                onChange={(event) => setSameAsPermanent(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              My current address is the same as my DigiLocker permanent address.
            </label>
            {!sameAsPermanent && (
              <p className="rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
                Current address from verified photo location: {savedPhotoDocument?.formattedAddress || 'Location address unavailable'}
              </p>
            )}
            <label className="flex items-start gap-3 text-xs leading-5 text-slate-700">
              <input
                type="checkbox"
                checked={decisionConsentAccepted}
                onChange={(event) => setDecisionConsentAccepted(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              I authorize the bureau enquiry, lender credit assessment, and submission of this completed application to the allocated lender for a decision.
            </label>
          </div>

          <button
            type="button"
            onClick={() => onSubmit({ sameAsPermanent, decisionConsentAccepted })}
            disabled={
              isSubmitting || !decisionConsentAccepted
            }
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <LoaderCircle
                  size={18}
                  className="animate-spin"
                />
                Submitting
                Application...
              </>
            ) : (
              <>
                Submit Application
                <ArrowRight
                  size={17}
                />
              </>
            )}
          </button>

          <p className="mt-3 flex items-center justify-center gap-1 text-[11px] text-slate-500">
            <Lock size={12} />
            Secure application
            submission
          </p>
        </aside>
      </div>

      <div className="mt-8 border-t border-slate-200 pt-6">
        <button
          type="button"
          onClick={onBack}
          disabled={
            isSubmitting
          }
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <ArrowLeft size={17} />
          Back to Profile
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
    <section className="rounded-3xl border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <Icon size={20} />
        </div>

        <h3 className="font-bold text-slate-900">
          {title}
        </h3>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        {children}
      </div>
    </section>
  );
}

function ReviewItem({
  label,
  value,
}) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-semibold text-slate-900">
        {value ||
          'Not provided'}
      </p>
    </div>
  );
}

function SummaryStatus({
  label,
  value,
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4 last:border-0 last:pb-0">
      <span className="text-xs text-slate-500">
        {label}
      </span>

      <span className="flex items-center gap-1 text-right text-xs font-bold text-emerald-700">
        <CheckCircle2
          size={14}
        />
        {value}
      </span>
    </div>
  );
}

function SuccessDetail({
  label,
  value,
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs text-slate-500">
        {label}
      </p>

      <p className="mt-2 break-words text-sm font-bold text-slate-900">
        {value}
      </p>
    </div>
  );
}

function StepCard({ children }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      {children}
    </section>
  );
}

function StepHeading({
  icon: Icon,
  eyebrow,
  title,
  description,
  right,
}) {
  return (
    <header className="mb-8 flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start">
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
          <Icon size={23} />
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
            {eyebrow}
          </p>

          <h2 className="mt-2 text-2xl font-bold text-slate-900">
            {title}
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
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
      <h3 className="text-lg font-bold text-slate-900">
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
    <span className="flex w-fit shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
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
  hideSave = false,
  isNextLoading = false,
}) {
  return (
    <footer className="mt-8 flex flex-col-reverse justify-between gap-3 border-t border-slate-200 pt-6 sm:flex-row">
      <div className="flex flex-col gap-3 sm:flex-row">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            disabled={
              isNextLoading
            }
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <ArrowLeft size={17} />
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
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <Save size={17} />

            {isSaving
              ? 'Saving...'
              : 'Save Draft'}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={
          nextDisabled ||
          isNextLoading
        }
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isNextLoading && (
          <LoaderCircle
            size={17}
            className="animate-spin"
          />
        )}

        {nextLabel}

        {!isNextLoading && (
          <ArrowRight size={17} />
        )}
      </button>
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
          <span className="ml-1 text-red-500">
            *
          </span>
        )}
      </label>

      <div
        className={`flex min-h-12 items-center overflow-hidden rounded-xl border transition ${error
            ? 'border-red-400 ring-4 ring-red-50'
            : 'border-slate-300 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-50'
          } ${disabled
            ? 'bg-slate-100'
            : 'bg-white'
          }`}
      >
        {prefix && (
          <span className="border-r border-slate-200 px-4 text-sm font-bold text-slate-600">
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
          className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm font-medium text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-500"
        />
      </div>

      {error ? (
        <p className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      ) : helperText ? (
        <p className="mt-1.5 text-xs text-slate-500">
          {helperText}
        </p>
      ) : null}
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
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="mb-2 block text-sm font-semibold text-slate-700"
      >
        {label}

        {required && (
          <span className="ml-1 text-red-500">
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
        className={`min-h-12 w-full rounded-xl border px-4 py-3 text-sm font-medium outline-none transition ${disabled
            ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500'
            : error
              ? 'border-red-400 bg-white text-slate-900 ring-4 ring-red-50'
              : 'border-slate-300 bg-white text-slate-900 focus:border-blue-600 focus:ring-4 focus:ring-blue-50'
          }`}
      >
        <option value="">
          Select {label}
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

      {error && (
        <p className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      )}
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
