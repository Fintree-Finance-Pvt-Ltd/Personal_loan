import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
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
  Info,
  LoaderCircle,
  Lock,
  MailCheck,
  MapPin,
  Phone,
  ReceiptText,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { usePincodeLookup } from '../hooks/usePincodeLookup';
import { authApi } from '../../auth/authApi';

const APPLICATION_STORAGE_KEY =
  'customerLoanApplication';

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

function readStoredApplication() {
  try {
    const savedValue = localStorage.getItem(
      APPLICATION_STORAGE_KEY,
    );

    return savedValue
      ? JSON.parse(savedValue)
      : null;
  } catch {
    return null;
  }
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

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      normalizedValue,
    )
  ) {
    return normalizedValue;
  }

  const dateMatch = normalizedValue.match(
    /^(\d{2})\/(\d{2})\/(\d{4})$/,
  );

  if (!dateMatch) {
    return '';
  }

  const [, day, month, year] = dateMatch;

  return `${year}-${month}-${day}`;
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

export default function MyApplicationPage() {
  const storedSession = useMemo(() => {
    try {
      return JSON.parse(
        sessionStorage.getItem(
          'customerSession',
        ) || 'null',
      );
    } catch {
      return null;
    }
  }, []);

  const savedApplication = useMemo(
    () => readStoredApplication(),
    [],
  );

  const [form, setForm] = useState(() => ({
    ...INITIAL_FORM,
    ...(savedApplication?.form ||
      savedApplication ||
      {}),
  }));

  const [currentStep, setCurrentStep] =
    useState(
      savedApplication?.currentStep ||
        'basic_details',
    );

  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] =
    useState('success');

  const [emailVerified, setEmailVerified] =
    useState(
      Boolean(
        savedApplication?.emailVerified,
      ),
    );

  const [
    isEmailVerifying,
    setIsEmailVerifying,
  ] = useState(false);

  const [emailOtp, setEmailOtp] = useState('');
  const [isEmailOtpSent, setIsEmailOtpSent] = useState(false);
  const [developmentEmailOtp, setDevelopmentEmailOtp] = useState('');

  const [isBreRunning, setIsBreRunning] =
    useState(false);

  const [brePassed, setBrePassed] =
    useState(
      Boolean(savedApplication?.brePassed),
    );

  const [
    lenderConsent,
    setLenderConsent,
  ] = useState(
    Boolean(savedApplication?.lenderConsent),
  );

  const [feePaid, setFeePaid] = useState(
    Boolean(savedApplication?.feePaid),
  );

  const [
    isFeeProcessing,
    setIsFeeProcessing,
  ] = useState(false);

  const [isSaving, setIsSaving] =
    useState(false);

  const [
    isPanVerifying,
    setIsPanVerifying,
  ] = useState(false);

  const [panVerified, setPanVerified] =
    useState(
      Boolean(savedApplication?.panVerified),
    );

  const [panVerification, setPanVerification] =
    useState(
      savedApplication?.panVerification ||
        null,
    );

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);

  const [
    applicationSubmitted,
    setApplicationSubmitted,
  ] = useState(
    Boolean(
      savedApplication?.applicationSubmitted,
    ),
  );

  const [
    applicationNumber,
    setApplicationNumber,
  ] = useState(
    savedApplication?.applicationNumber ||
      'PL-260724-1001',
  );

  const mobileNumber =
    storedSession?.mobileNumber ||
    '9876543210';

  const currentStepIndex =
    FLOW_STEPS.findIndex(
      (step) => step.id === currentStep,
    );

  const safeCurrentStepIndex =
    currentStepIndex >= 0
      ? currentStepIndex
      : 0;

  const progressPercentage =
    ((safeCurrentStepIndex + 1) /
      FLOW_STEPS.length) *
    100;

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

  const updateStoredApplication = (
    additionalData = {},
  ) => {
    const data = {
      form,
      currentStep,
      emailVerified,
      panVerified,
      panVerification,
      brePassed,
      lenderConsent,
      feePaid,
      applicationSubmitted,
      applicationNumber,
      updatedAt: new Date().toISOString(),
      ...additionalData,
    };

    localStorage.setItem(
      APPLICATION_STORAGE_KEY,
      JSON.stringify(data),
    );

    return data;
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
        updateStoredApplication({
          form,
          emailVerified: true,
        });
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

      updateStoredApplication({
        form,
        emailVerified: true,
      });

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
      const response = await fetch(
        '/api/external-api/verify-pan',
        {
          method: 'POST',

          headers: {
            Accept: 'application/json',
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            customerId:
              storedSession.customerId,
            panNumber: normalizedPan,
          }),
        },
      );

      let result = null;

      try {
        result = await response.json();
      } catch {
        throw new Error(
          'PAN verification service returned an invalid response.',
        );
      }

      if (!response.ok) {
        const backendMessage =
          result?.message ||
          result?.data?.message ||
          result?.data?.data?.message ||
          result?.error ||
          'PAN verification failed.';

        throw new Error(
          Array.isArray(backendMessage)
            ? backendMessage.join(', ')
            : backendMessage,
        );
      }

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
      setPanVerification(
        verificationData,
      );

      setErrors((currentErrors) => ({
        ...currentErrors,
        fullName: '',
        panNumber: '',
        dateOfBirth: '',
        gender: '',
      }));

      const storedData = {
        form: updatedForm,
        currentStep,
        emailVerified,
        panVerified: true,
        panVerification:
          verificationData,
        brePassed: false,
        lenderConsent,
        feePaid,
        applicationSubmitted,
        applicationNumber,
        updatedAt:
          new Date().toISOString(),
      };

      localStorage.setItem(
        APPLICATION_STORAGE_KEY,
        JSON.stringify(storedData),
      );

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

  const handleBasicDetailsContinue =
    async () => {
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
        /*
         * Replace this delay with your real
         * Platform BRE endpoint.
         */
        await delay(1400);

        const platformBreResult = {
          status: 'PASSED',
          checkedAt:
            new Date().toISOString(),

          checks: {
            panVerified: true,
            ageEligible: true,
            pincodeServiceable: true,
            duplicateApplication: false,
          },
        };

        setBrePassed(true);
        setCurrentStep(
          'assessment_fee',
        );
        setErrors({});

        const storedData = {
          form,
          currentStep:
            'assessment_fee',
          emailVerified: true,
          panVerified: true,
          panVerification,
          brePassed: true,
          platformBre:
            platformBreResult,
          lenderConsent,
          feePaid,
          applicationSubmitted,
          applicationNumber,
          updatedAt:
            new Date().toISOString(),
        };

        localStorage.setItem(
          APPLICATION_STORAGE_KEY,
          JSON.stringify(storedData),
        );

        showMessage(
          'Eligibility check passed. An eligible lender has been assigned.',
        );

        window.scrollTo({
          top: 0,
          behavior: 'smooth',
        });
      } catch (error) {
        console.error(
          'Platform BRE failed:',
          error,
        );

        setBrePassed(false);

        showMessage(
          'Unable to complete the eligibility check. Please try again.',
          'error',
        );
      } finally {
        setIsBreRunning(false);
      }
    };

  const handleDummyFeePayment =
    async () => {
      if (!lenderConsent) {
        showMessage(
          'Please provide lender data-sharing consent.',
          'error',
        );

        return;
      }

      setIsFeeProcessing(true);
      clearMessage();

      try {
        await delay(1000);

        setFeePaid(true);

        updateStoredApplication({
          currentStep:
            'assessment_fee',
          lenderConsent: true,
          feePaid: true,
        });

        showMessage(
          'Dummy assessment fee payment completed successfully.',
        );
      } finally {
        setIsFeeProcessing(false);
      }
    };

  const handleProceedToProfile = () => {
    if (!feePaid) {
      showMessage(
        'Complete the assessment fee payment first.',
        'error',
      );

      return;
    }

    updateStoredApplication({
      currentStep:
        'profile_details',
      feePaid: true,
      lenderConsent: true,
    });

    goToStep('profile_details');
  };

  const handleProfileContinue = () => {
    if (!validateProfileDetails()) {
      showMessage(
        'Please complete all required profile details.',
        'error',
      );

      return;
    }

    updateStoredApplication({
      currentStep:
        'submit_application',
    });

    goToStep('submit_application');
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    clearMessage();

    try {
      await delay(500);

      updateStoredApplication();

      showMessage(
        'Application draft saved successfully.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitApplication =
    async () => {
      if (!validateBasicDetails()) {
        showMessage(
          'Basic details are incomplete.',
          'error',
        );

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

      if (
        !feePaid ||
        !lenderConsent
      ) {
        showMessage(
          'Assessment fee or lender consent is incomplete.',
          'error',
        );

        goToStep('assessment_fee');
        return;
      }

      if (!validateProfileDetails()) {
        showMessage(
          'Profile details are incomplete.',
          'error',
        );

        goToStep('profile_details');
        return;
      }

      setIsSubmitting(true);
      clearMessage();

      try {
        const generatedApplicationNumber =
          `PL-${new Date()
            .toISOString()
            .slice(2, 10)
            .replaceAll(
              '-',
              '',
            )}-${Math.floor(
            1000 +
              Math.random() * 9000,
          )}`;

        const payload = {
          applicationNumber:
            generatedApplicationNumber,

          mobileNumber,
          countryCode: '+91',

          lender: {
            code: 'FTF',
            name:
              'Fintree Finance Private Limited',
          },

          assessmentFee: {
            baseFee: 199,
            gst: 35.82,
            total: 234.82,
            paymentStatus: 'PAID',
            paymentReference:
              `PAY-${Date.now()}`,
          },

          platformBre: {
            status: 'PASSED',
            checkedAt:
              new Date().toISOString(),
          },

          panVerification,

          applicant: form,

          applicationStatus:
            'SUBMITTED_TO_LENDER',

          submittedAt:
            new Date().toISOString(),
        };

        console.log(
          'Dummy submitted application payload:',
          payload,
        );

        await delay(1400);

        setApplicationNumber(
          generatedApplicationNumber,
        );

        setApplicationSubmitted(true);

        const finalStoredData = {
          form,
          currentStep:
            'submit_application',
          emailVerified: true,
          panVerified: true,
          panVerification,
          brePassed: true,
          lenderConsent: true,
          feePaid: true,
          applicationSubmitted: true,
          applicationNumber:
            generatedApplicationNumber,
          submittedPayload: payload,
          updatedAt:
            new Date().toISOString(),
        };

        localStorage.setItem(
          APPLICATION_STORAGE_KEY,
          JSON.stringify(
            finalStoredData,
          ),
        );
      } catch (submissionError) {
        console.error(
          'Application submission failed:',
          submissionError,
        );

        showMessage(
          'Unable to submit the application. Please try again.',
          'error',
        );
      } finally {
        setIsSubmitting(false);
      }
    };

  const handleStartNewApplication =
    () => {
      localStorage.removeItem(
        APPLICATION_STORAGE_KEY,
      );

      setForm(INITIAL_FORM);
      setCurrentStep('basic_details');
      setErrors({});
      setMessage('');
      setEmailVerified(false);
      setPanVerified(false);
      setPanVerification(null);
      setBrePassed(false);
      setLenderConsent(false);
      setFeePaid(false);
      setApplicationSubmitted(false);
      setApplicationNumber(
        'PL-260724-1001',
      );

      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    };

  return (
    <div className="mx-auto max-w-7xl">
      <ApplicationProgress
        currentStep={currentStep}
        currentStepIndex={
          safeCurrentStepIndex
        }
        progressPercentage={
          progressPercentage
        }
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
        />
      )}

      {currentStep ===
        'assessment_fee' && (
        <AssessmentFeeStep
          lenderConsent={
            lenderConsent
          }
          feePaid={feePaid}
          isFeeProcessing={
            isFeeProcessing
          }
          onConsentChange={
            setLenderConsent
          }
          onBack={() =>
            goToStep(
              'basic_details',
            )
          }
          onPay={
            handleDummyFeePayment
          }
          onContinue={
            handleProceedToProfile
          }
        />
      )}

      {currentStep ===
        'profile_details' && (
        <ProfileDetailsStep
          form={form}
          errors={errors}
          isSaving={isSaving}
          onChange={handleChange}
          onBack={() =>
            goToStep(
              'assessment_fee',
            )
          }
          onSaveDraft={
            handleSaveDraft
          }
          onContinue={
            handleProfileContinue
          }
        />
      )}

      {currentStep ===
        'submit_application' && (
        <SubmitApplicationStep
          form={form}
          mobileNumber={mobileNumber}
          applicationSubmitted={
            applicationSubmitted
          }
          applicationNumber={
            applicationNumber
          }
          isSubmitting={
            isSubmitting
          }
          onBack={() =>
            goToStep(
              'profile_details',
            )
          }
          onSubmit={
            handleSubmitApplication
          }
          onStartNew={
            handleStartNewApplication
          }
        />
      )}
    </div>
  );
}

function ApplicationProgress({
  currentStep,
  currentStepIndex,
  progressPercentage,
}) {
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
              Complete all steps and
              submit your application to
              the assigned lender.
            </p>
          </div>

          <div className="w-full max-w-sm rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur">
            <div className="flex justify-between text-sm">
              <span className="text-emerald-100">
                Progress
              </span>

              <strong>
                {Math.round(
                  progressPercentage,
                )}
                %
              </strong>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white transition-all duration-500"
                style={{
                  width: `${progressPercentage}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto px-4 py-4 sm:px-6">
        <div className="flex min-w-[680px] items-center">
          {FLOW_STEPS.map(
            (step, index) => {
              const completed =
                index <
                currentStepIndex;

              const active =
                step.id ===
                currentStep;

              return (
                <div
                  key={step.id}
                  className="flex flex-1 items-center"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${
                        completed
                          ? 'bg-emerald-600 text-white'
                          : active
                            ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                            : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {completed ? (
                        <Check
                          size={17}
                        />
                      ) : (
                        index + 1
                      )}
                    </div>

                    <span
                      className={`whitespace-nowrap text-xs font-semibold ${
                        active
                          ? 'text-blue-700'
                          : completed
                            ? 'text-emerald-700'
                            : 'text-slate-400'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>

                  {index <
                    FLOW_STEPS.length -
                      1 && (
                    <div
                      className={`mx-3 h-0.5 flex-1 ${
                        completed
                          ? 'bg-emerald-500'
                          : 'bg-slate-200'
                      }`}
                    />
                  )}
                </div>
              );
            },
          )}
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
      className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${
        type === 'error'
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
      }`}
    >
      {message}
    </div>
  );
}

function BasicDetailsStep({
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
}) {
  const {
    city: pincodeCity,
    state: pincodeState,
    isLoading: isPincodeLoading,
    error: pincodeError,
  } = usePincodeLookup(panVerified ? form.pincode : '');

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
            className={`flex overflow-hidden rounded-xl border bg-white ${
              errors.panNumber
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
              className={`flex shrink-0 items-center gap-1.5 border-l px-4 text-xs font-semibold ${
                panVerified
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
                onChange={() => {}}
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
                className={`flex overflow-hidden rounded-xl border bg-white ${
                  errors.email
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
                    className={`flex overflow-hidden rounded-xl border bg-white ${
                      errors.email
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
  lenderConsent,
  feePaid,
  isFeeProcessing,
  onConsentChange,
  onBack,
  onPay,
  onContinue,
}) {
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
            Proposed lending
            partner
          </p>

          <div className="mt-5 flex flex-col justify-between gap-4 border-b border-slate-100 pb-6 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-600 font-bold text-white">
                FF
              </div>

              <div>
                <h3 className="font-bold text-slate-900">
                  Fintree Finance
                  Private Limited
                </h3>

                <p className="mt-1 text-xs text-slate-500">
                  Personal Loan · New
                  customer
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
              <strong>
                Why this lender?
              </strong>
              <br />
              Your profile matches
              the active lender policy
              and monthly capacity is
              available.
            </p>
          </div>

          <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
            <input
              type="checkbox"
              checked={
                lenderConsent
              }
              disabled={feePaid}
              onChange={(event) =>
                onConsentChange(
                  event.target
                    .checked,
                )
              }
              className="mt-0.5 h-4 w-4 accent-blue-600"
            />

            <span className="text-xs leading-5 text-slate-700">
              I consent to share my
              application data with{' '}
              <strong>
                Fintree Finance
              </strong>{' '}
              for eligibility
              assessment and final
              decision.
            </span>
          </label>

          <p className="mt-4 text-xs leading-5 text-slate-400">
            Payment does not guarantee
            loan approval. The lender
            performs an independent
            eligibility check after
            submission.
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
                amount="₹199.00"
              />

              <FeeRow
                label="GST at 18%"
                amount="₹35.82"
              />

              <div className="flex items-center justify-between border-t border-slate-800 pt-5">
                <span className="text-sm text-slate-300">
                  Total payable
                </span>

                <strong className="text-2xl">
                  ₹234.82
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
                      Reference:
                      PAY-DUMMY-23482
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={
                  !lenderConsent ||
                  isFeeProcessing
                }
                onClick={onPay}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isFeeProcessing ? (
                  <>
                    <LoaderCircle
                      size={18}
                      className="animate-spin"
                    />
                    Processing
                    payment...
                  </>
                ) : (
                  <>
                    Pay ₹234.82
                    <ArrowRight
                      size={17}
                    />
                  </>
                )}
              </button>
            )}

            <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
              <Lock size={13} />
              Dummy secure payment
            </p>
          </div>
        </aside>
      </div>

      <StepActions
        onBack={onBack}
        onNext={onContinue}
        nextLabel="Complete Profile"
        nextDisabled={!feePaid}
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

function ProfileDetailsStep({
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
        nextLabel="Review Application"
      />
    </StepCard>
  );
}

function SubmitApplicationStep({
  form,
  mobileNumber,
  applicationSubmitted,
  applicationNumber,
  isSubmitting,
  onBack,
  onSubmit,
  onStartNew,
}) {
  if (applicationSubmitted) {
    return (
      <div className="rounded-3xl border border-emerald-200 bg-white p-6 text-center shadow-sm sm:p-10">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckCircle2 size={42} />
        </div>

        <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
          Application submitted
        </p>

        <h2 className="mt-3 text-3xl font-bold text-slate-900">
          Your application has
          been submitted
        </h2>

        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">
          Your application has
          been sent to Fintree
          Finance for lender
          assessment.
        </p>

        <div className="mx-auto mt-8 grid max-w-2xl gap-4 text-left sm:grid-cols-3">
          <SuccessDetail
            label="Application Number"
            value={
              applicationNumber
            }
          />

          <SuccessDetail
            label="Lender"
            value="Fintree Finance"
          />

          <SuccessDetail
            label="Current Status"
            value="Submitted to lender"
          />
        </div>

        <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-blue-100 bg-blue-50 p-4 text-left">
          <div className="flex items-start gap-3">
            <Clock3
              size={21}
              className="mt-0.5 shrink-0 text-blue-700"
            />

            <div>
              <p className="text-sm font-bold text-blue-900">
                What happens next?
              </p>

              <p className="mt-1 text-xs leading-5 text-blue-800">
                The lender will run
                its own eligibility
                and credit checks.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onStartNew}
          className="mt-8 rounded-xl border border-slate-300 px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Start New Dummy
          Application
        </button>
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

          <button
            type="button"
            onClick={onSubmit}
            disabled={
              isSubmitting
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
        className={`flex min-h-12 items-center overflow-hidden rounded-xl border transition ${
          error
            ? 'border-red-400 ring-4 ring-red-50'
            : 'border-slate-300 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-50'
        } ${
          disabled
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
        className={`min-h-12 w-full rounded-xl border px-4 py-3 text-sm font-medium outline-none transition ${
          disabled
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