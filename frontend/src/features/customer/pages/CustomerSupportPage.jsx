import {
    AlertCircle,
    ArrowLeft,
    BadgeCheck,
    ChevronDown,
    ChevronRight,
    CircleHelp,
    Clock3,
    CreditCard,
    FileQuestion,
    FileText,
    Headphones,
    Landmark,
    LoaderCircle,
    LockKeyhole,
    Mail,
    MessageCircle,
    Phone,
    Send,
    ShieldAlert,
    ShieldCheck,
    Smartphone,
    UserRound,
    WalletCards,
} from 'lucide-react';
import {
    useMemo,
    useState,
} from 'react';
import {
    useNavigate,
} from 'react-router-dom';

const SUPPORT_EMAIL =
    'support@fintreefinance.com';

const SUPPORT_PHONE =
    '+91 22 6900 0000';

const SUPPORT_PHONE_LINK =
    '+912269000000';

const WHATSAPP_NUMBER =
    '919999999999';

const SUPPORT_CATEGORIES = [
    {
        id: 'APPLICATION',
        title: 'Loan Application',
        description:
            'Application status, eligibility, document submission or lender decision.',
        icon: FileText,
    },
    {
        id: 'KYC',
        title: 'KYC & Verification',
        description:
            'PAN, Aadhaar, DigiLocker, OTP or identity verification assistance.',
        icon: UserRound,
    },
    {
        id: 'DISBURSAL',
        title: 'Loan Disbursal',
        description:
            'Disbursal status, bank credit, UTR or processing-related queries.',
        icon: Landmark,
    },
    {
        id: 'REPAYMENT',
        title: 'Repayment',
        description:
            'Repayment schedule, due date, payment confirmation or overdue query.',
        icon: WalletCards,
    },
    {
        id: 'PAYMENT',
        title: 'Payment Issue',
        description:
            'Assessment fee, failed payment, duplicate debit or payment receipt.',
        icon: CreditCard,
    },
    {
        id: 'ACCOUNT',
        title: 'Account & Login',
        description:
            'Mobile login, OTP, profile, account access or security concern.',
        icon: LockKeyhole,
    },
];

const FAQ_ITEMS = [
    {
        id: 1,
        question:
            'How can I check my loan application status?',
        answer:
            'Open My Application from the customer menu. The latest application stage and lender status will be displayed based on the most recent backend update.',
    },
    {
        id: 2,
        question:
            'My OTP is not arriving. What should I do?',
        answer:
            'Check that the registered mobile number is active and has network coverage. Wait briefly before requesting another OTP. Do not share your OTP with any person, including anyone claiming to represent FinLeaf.',
    },
    {
        id: 3,
        question:
            'When will the loan amount be credited?',
        answer:
            'After all post-approval steps are completed, the lender processes the disbursal request. Once lender confirmation is received, the disbursal status, credited amount and UTR will appear in Loan Details.',
    },
    {
        id: 4,
        question:
            'Where can I see my repayment due date?',
        answer:
            'Open Loan Details and review the Repayment Summary or Repayment Schedule section. The due date and payable amount are shown after the lender confirms disbursal.',
    },
    {
        id: 5,
        question:
            'What should I do if my payment failed but money was debited?',
        answer:
            'Do not make another payment immediately. Keep the payment reference number and bank debit proof, then raise a Payment Issue request from this page.',
    },
    {
        id: 6,
        question:
            'Can FinLeaf representatives ask for my OTP or PIN?',
        answer:
            'No. Never disclose your OTP, UPI PIN, debit-card PIN, CVV, password or internet-banking credentials to anyone.',
    },
];

function getStoredCustomerSession() {
    try {
        return JSON.parse(
            localStorage.getItem(
                'customerSession',
            ) ||
            sessionStorage.getItem(
                'customerSession',
            ) ||
            'null',
        );
    } catch {
        return null;
    }
}

export default function CustomerSupportPage() {
    const navigate =
        useNavigate();

    const session =
        getStoredCustomerSession();

    const [selectedCategory, setSelectedCategory] =
        useState('');

    const [subject, setSubject] =
        useState('');

    const [message, setMessage] =
        useState('');

    const [openFaqId, setOpenFaqId] =
        useState(null);

    const [formError, setFormError] =
        useState('');

    const [isSubmitting, setIsSubmitting] =
        useState(false);

    const mobileNumber =
        session?.mobileNumber || '';

    const customerReference =
        session?.customerCode ||
        session?.customerId ||
        'Not available';

    const selectedCategoryLabel =
        useMemo(() => {
            return (
                SUPPORT_CATEGORIES.find(
                    (category) =>
                        category.id ===
                        selectedCategory,
                )?.title || ''
            );
        }, [selectedCategory]);

    const handleCategorySelect = (
        category,
    ) => {
        setSelectedCategory(
            category.id,
        );

        if (!subject) {
            setSubject(
                `${category.title} assistance`,
            );
        }

        setFormError('');

        window.setTimeout(() => {
            document
                .getElementById(
                    'support-request-form',
                )
                ?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                });
        }, 100);
    };

    const handleWhatsApp = () => {
        const text = encodeURIComponent(
            `Hello FinLeaf Support, I need assistance with my account. Customer reference: ${customerReference}.`,
        );

        window.open(
            `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`,
            '_blank',
            'noopener,noreferrer',
        );
    };

    const handleSubmit = async (
        event,
    ) => {
        event.preventDefault();

        if (!selectedCategory) {
            setFormError(
                'Please select a support category.',
            );
            return;
        }

        if (!subject.trim()) {
            setFormError(
                'Please enter the subject of your request.',
            );
            return;
        }

        if (message.trim().length < 20) {
            setFormError(
                'Please describe the issue in at least 20 characters.',
            );
            return;
        }

        setFormError('');
        setIsSubmitting(true);

        try {
            const emailSubject =
                encodeURIComponent(
                    `[${selectedCategoryLabel}] ${subject.trim()}`,
                );

            const emailBody =
                encodeURIComponent(
                    [
                        'Hello FinLeaf Support,',
                        '',
                        message.trim(),
                        '',
                        'Customer details:',
                        `Customer reference: ${customerReference}`,
                        `Registered mobile: ${mobileNumber
                            ? `+91 ${mobileNumber}`
                            : 'Not available'
                        }`,
                        `Category: ${selectedCategoryLabel}`,
                        '',
                        'Regards,',
                        'FinLeaf Customer',
                    ].join('\n'),
                );

            window.location.href =
                `mailto:${SUPPORT_EMAIL}?subject=${emailSubject}&body=${emailBody}`;
        } finally {
            window.setTimeout(() => {
                setIsSubmitting(false);
            }, 700);
        }
    };

    return (
        <div className="mx-auto w-full max-w-[1440px] space-y-6 pb-10">
            {/* Header */}
            <section className="relative overflow-hidden rounded-[26px] bg-gradient-to-r from-[#064e3b] via-[#047857] to-[#0f766e] text-white shadow-lg shadow-brand-900/10">
                <div className="pointer-events-none absolute inset-0">
                    <div className="absolute -left-20 -top-24 h-72 w-72 rounded-full bg-brand-300/20 blur-3xl" />

                    <div className="absolute -bottom-28 right-0 h-80 w-80 rounded-full bg-info-300/15 blur-3xl" />

                    <div
                        className="absolute inset-0 opacity-[0.04]"
                        style={{
                            backgroundImage:
                                'linear-gradient(rgba(255,255,255,.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.7) 1px, transparent 1px)',
                            backgroundSize:
                                '42px 42px',
                        }}
                    />
                </div>

                <div className="relative grid min-h-[260px] items-center gap-6 px-5 py-7 sm:px-8 lg:grid-cols-[1fr_300px] lg:px-10">
                    <div>
                        <button
                            type="button"
                            onClick={() =>
                                navigate(
                                    '/customer/dashboard',
                                )
                            }
                            className="inline-flex items-center gap-2 rounded-lg px-1 py-1 text-xs font-semibold text-brand-100 transition hover:text-white"
                        >
                            <ArrowLeft size={15} />
                            Back to Dashboard
                        </button>

                        <div className="mt-5 flex items-center gap-3">
                            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/15 bg-white/10 backdrop-blur">
                                <Headphones size={23} />
                            </div>

                            <div>
                                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-200">
                                    Customer Assistance
                                </p>

                                <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                                    Help & Support
                                </h1>
                            </div>
                        </div>

                        <p className="mt-5 max-w-2xl text-sm leading-6 text-brand-50/80 sm:text-base">
                            Find answers, connect with our support team or raise a request regarding your loan journey.
                        </p>

                        <div className="mt-5 flex flex-wrap gap-2">
                            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold backdrop-blur">
                                <ShieldCheck size={13} />
                                Secure support
                            </span>

                            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold backdrop-blur">
                                <Clock3 size={13} />
                                Mon–Sat, 10 AM–7 PM
                            </span>
                        </div>
                    </div>

                    {/* <div className="hidden items-end justify-center lg:flex">
                        <img
                            src="/image/dashboard-woman-clipboard.png"
                            alt="FinLeaf customer support"
                            className="max-h-[245px] w-full max-w-[250px] object-contain object-bottom"
                        />
                    </div> */}
                </div>
            </section>

            {/* Contact methods */}
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <ContactCard
                    icon={Phone}
                    title="Call Support"
                    description="Speak directly with our customer support team."
                    value={SUPPORT_PHONE}
                    actionLabel="Call now"
                    tone="emerald"
                    onClick={() => {
                        window.location.href =
                            `tel:${SUPPORT_PHONE_LINK}`;
                    }}
                />

                <ContactCard
                    icon={MessageCircle}
                    title="WhatsApp Support"
                    description="Start a WhatsApp conversation for quick assistance."
                    value="Chat securely"
                    actionLabel="Open WhatsApp"
                    tone="green"
                    onClick={handleWhatsApp}
                />

                <ContactCard
                    icon={Mail}
                    title="Email Support"
                    description="Send documents or provide detailed information."
                    value={SUPPORT_EMAIL}
                    actionLabel="Send email"
                    tone="blue"
                    onClick={() => {
                        window.location.href =
                            `mailto:${SUPPORT_EMAIL}`;
                    }}
                />
            </section>

            {/* Category selection */}
            <section className="overflow-hidden rounded-[26px] border border-neutral-200 bg-white shadow-sm">
                <div className="border-b border-neutral-100 px-5 py-5 sm:px-7">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-700">
                        Select an issue
                    </p>

                    <h2 className="mt-2 text-xl font-bold text-neutral-950">
                        How can we help you?
                    </h2>

                    <p className="mt-1 text-sm text-neutral-500">
                        Choose the category that best describes your request.
                    </p>
                </div>

                <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-7 xl:grid-cols-3">
                    {SUPPORT_CATEGORIES.map(
                        (category) => {
                            const Icon =
                                category.icon;

                            const isSelected =
                                selectedCategory ===
                                category.id;

                            return (
                                <button
                                    key={category.id}
                                    type="button"
                                    onClick={() =>
                                        handleCategorySelect(
                                            category,
                                        )
                                    }
                                    className={`group flex items-start gap-4 rounded-2xl border p-4 text-left transition-all ${isSelected
                                        ? 'border-brand-400 bg-brand-50 shadow-sm ring-4 ring-brand-50'
                                        : 'border-neutral-200 bg-white hover:-tranneutral-y-0.5 hover:border-brand-200 hover:shadow-lg hover:shadow-neutral-900/5'
                                        }`}
                                >
                                    <div
                                        className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl transition ${isSelected
                                            ? 'bg-brand-600 text-white'
                                            : 'bg-neutral-100 text-neutral-600 group-hover:bg-brand-100 group-hover:text-brand-700'
                                            }`}
                                    >
                                        <Icon size={20} />
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <h3 className="text-sm font-bold text-neutral-950">
                                                {category.title}
                                            </h3>

                                            {isSelected ? (
                                                <BadgeCheck
                                                    size={18}
                                                    className="shrink-0 text-brand-600"
                                                />
                                            ) : (
                                                <ChevronRight
                                                    size={17}
                                                    className="shrink-0 text-neutral-400 transition group-hover:tranneutral-x-0.5 group-hover:text-brand-600"
                                                />
                                            )}
                                        </div>

                                        <p className="mt-1.5 text-xs leading-5 text-neutral-500">
                                            {category.description}
                                        </p>
                                    </div>
                                </button>
                            );
                        },
                    )}
                </div>
            </section>

            {/* Form and customer information */}
            <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
                <form
                    id="support-request-form"
                    onSubmit={handleSubmit}
                    className="overflow-hidden rounded-[26px] border border-neutral-200 bg-white shadow-sm scroll-mt-6"
                >
                    <div className="border-b border-neutral-100 px-5 py-5 sm:px-7">
                        <div className="flex items-center gap-3">
                            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-100 text-brand-700">
                                <FileQuestion size={21} />
                            </div>

                            <div>
                                <h2 className="text-lg font-bold text-neutral-950">
                                    Raise a support request
                                </h2>

                                <p className="mt-0.5 text-xs text-neutral-500">
                                    Describe your issue so our team can assist you.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-5 p-5 sm:p-7">
                        {formError && (
                            <div
                                role="alert"
                                className="flex items-start gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700"
                            >
                                <AlertCircle
                                    size={18}
                                    className="mt-0.5 shrink-0"
                                />

                                <span>
                                    {formError}
                                </span>
                            </div>
                        )}

                        <div>
                            <label
                                htmlFor="supportCategory"
                                className="mb-2 block text-sm font-semibold text-neutral-800"
                            >
                                Support category
                            </label>

                            <select
                                id="supportCategory"
                                value={selectedCategory}
                                onChange={(event) => {
                                    setSelectedCategory(
                                        event.target.value,
                                    );
                                    setFormError('');
                                }}
                                className="min-h-12 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-800 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
                            >
                                <option value="">
                                    Select a category
                                </option>

                                {SUPPORT_CATEGORIES.map(
                                    (category) => (
                                        <option
                                            key={category.id}
                                            value={category.id}
                                        >
                                            {category.title}
                                        </option>
                                    ),
                                )}
                            </select>
                        </div>

                        <div>
                            <label
                                htmlFor="supportSubject"
                                className="mb-2 block text-sm font-semibold text-neutral-800"
                            >
                                Subject
                            </label>

                            <input
                                id="supportSubject"
                                type="text"
                                maxLength={120}
                                value={subject}
                                onChange={(event) => {
                                    setSubject(
                                        event.target.value,
                                    );
                                    setFormError('');
                                }}
                                placeholder="Briefly describe the issue"
                                className="min-h-12 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-900 outline-none transition placeholder:font-normal placeholder:text-neutral-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
                            />
                        </div>

                        <div>
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <label
                                    htmlFor="supportMessage"
                                    className="text-sm font-semibold text-neutral-800"
                                >
                                    Description
                                </label>

                                <span className="text-[11px] text-neutral-400">
                                    {message.length}/1000
                                </span>
                            </div>

                            <textarea
                                id="supportMessage"
                                rows={6}
                                maxLength={1000}
                                value={message}
                                onChange={(event) => {
                                    setMessage(
                                        event.target.value,
                                    );
                                    setFormError('');
                                }}
                                placeholder="Explain the issue, mention any error message, payment reference or relevant details..."
                                className="w-full resize-none rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm leading-6 text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
                            />
                        </div>

                        <div className="flex items-start gap-3 rounded-2xl border border-info-100 bg-info-50 p-4">
                            <ShieldCheck
                                size={18}
                                className="mt-0.5 shrink-0 text-info-700"
                            />

                            <p className="text-xs leading-5 text-info-800">
                                Do not include an OTP, UPI PIN, CVV, card PIN, password or internet-banking credentials.
                            </p>
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-600/20 transition hover:-tranneutral-y-0.5 hover:from-brand-700 hover:to-brand-700 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:tranneutral-y-0 sm:w-auto"
                        >
                            {isSubmitting ? (
                                <>
                                    <LoaderCircle
                                        size={17}
                                        className="animate-spin"
                                    />
                                    Preparing request...
                                </>
                            ) : (
                                <>
                                    <Send size={17} />
                                    Submit Request
                                </>
                            )}
                        </button>
                    </div>
                </form>

                <aside className="space-y-5">
                    <div className="rounded-[26px] border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
                        <div className="flex items-center gap-3">
                            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-neutral-100 text-neutral-700">
                                <UserRound size={21} />
                            </div>

                            <div>
                                <p className="text-xs text-neutral-500">
                                    Customer reference
                                </p>

                                <p className="mt-0.5 break-all text-sm font-bold text-neutral-950">
                                    {customerReference}
                                </p>
                            </div>
                        </div>

                        <div className="mt-5 divide-y divide-neutral-100">
                            <CustomerInfoRow
                                label="Registered mobile"
                                value={
                                    mobileNumber
                                        ? `+91 ${mobileNumber}`
                                        : 'Not available'
                                }
                            />

                            <CustomerInfoRow
                                label="Support hours"
                                value="Mon–Sat, 10 AM–7 PM"
                            />

                            <CustomerInfoRow
                                label="Expected response"
                                value="Within 1 business day"
                            />
                        </div>
                    </div>

                    <div className="relative overflow-hidden rounded-[26px] border border-danger-100 bg-gradient-to-br from-danger-50 to-white p-5 shadow-sm sm:p-6">
                        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-danger-100 blur-3xl" />

                        <div className="relative">
                            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-danger-100 text-danger-700">
                                <ShieldAlert size={21} />
                            </div>

                            <h3 className="mt-4 text-base font-bold text-danger-950">
                                Report suspected fraud
                            </h3>

                            <p className="mt-2 text-xs leading-5 text-danger-800/80">
                                Contact support immediately if someone asks for your OTP, PIN, password or requests payment to a personal account.
                            </p>

                            <button
                                type="button"
                                onClick={() => {
                                    window.location.href =
                                        `tel:${SUPPORT_PHONE_LINK}`;
                                }}
                                className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-danger-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-danger-700"
                            >
                                <Phone size={15} />
                                Call Fraud Support
                            </button>
                        </div>
                    </div>
                </aside>
            </section>

            {/* FAQ */}
            <section className="overflow-hidden rounded-[26px] border border-neutral-200 bg-white shadow-sm">
                <div className="border-b border-neutral-100 px-5 py-5 sm:px-7">
                    <div className="flex items-center gap-3">
                        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-info-100 text-info-700">
                            <CircleHelp size={21} />
                        </div>

                        <div>
                            <h2 className="text-lg font-bold text-neutral-950">
                                Frequently asked questions
                            </h2>

                            <p className="mt-0.5 text-xs text-neutral-500">
                                Quick answers to common customer queries.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="divide-y divide-neutral-100">
                    {FAQ_ITEMS.map(
                        (item) => {
                            const isOpen =
                                openFaqId ===
                                item.id;

                            return (
                                <article
                                    key={item.id}
                                    className="px-5 sm:px-7"
                                >
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setOpenFaqId(
                                                isOpen
                                                    ? null
                                                    : item.id,
                                            )
                                        }
                                        className="flex w-full items-center justify-between gap-4 py-5 text-left"
                                        aria-expanded={isOpen}
                                    >
                                        <span className="text-sm font-bold leading-6 text-neutral-900">
                                            {item.question}
                                        </span>

                                        <span
                                            className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition ${isOpen
                                                ? 'rotate-180 bg-brand-100 text-brand-700'
                                                : 'bg-neutral-100 text-neutral-500'
                                                }`}
                                        >
                                            <ChevronDown
                                                size={17}
                                            />
                                        </span>
                                    </button>

                                    {isOpen && (
                                        <div className="pb-5 pr-10">
                                            <p className="text-sm leading-6 text-neutral-600">
                                                {item.answer}
                                            </p>
                                        </div>
                                    )}
                                </article>
                            );
                        },
                    )}
                </div>
            </section>

            {/* Footer note */}
            <section className="flex flex-col gap-4 rounded-[24px] border border-brand-100 bg-brand-50/70 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                    <BadgeCheck
                        size={20}
                        className="mt-0.5 shrink-0 text-brand-700"
                    />

                    <div>
                        <p className="text-sm font-bold text-brand-950">
                            Official FinLeaf support
                        </p>

                        <p className="mt-1 text-xs leading-5 text-brand-800/75">
                            FinLeaf will never ask you to transfer money to a personal bank account.
                        </p>
                    </div>
                </div>

                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-3 py-2 text-[11px] font-bold text-brand-700 shadow-sm">
                    <Smartphone size={14} />
                    Keep your registered mobile available
                </span>
            </section>
        </div>
    );
}

function ContactCard({
    icon: Icon,
    title,
    description,
    value,
    actionLabel,
    tone,
    onClick,
}) {
    const tones = {
        emerald: {
            card:
                'border-brand-100 bg-gradient-to-br from-white to-brand-50/70',
            icon:
                'bg-brand-100 text-brand-700',
            action:
                'text-brand-700',
        },
        green: {
            card:
                'border-brand-100 bg-gradient-to-br from-white to-brand-50/70',
            icon:
                'bg-brand-100 text-brand-700',
            action:
                'text-brand-700',
        },
        blue: {
            card:
                'border-info-100 bg-gradient-to-br from-white to-info-50/70',
            icon:
                'bg-info-100 text-info-700',
            action:
                'text-info-700',
        },
    };

    const selectedTone =
        tones[tone] ||
        tones.emerald;

    return (
        <button
            type="button"
            onClick={onClick}
            className={`group rounded-[22px] border p-5 text-left shadow-sm transition hover:-tranneutral-y-0.5 hover:shadow-lg hover:shadow-neutral-900/5 ${selectedTone.card}`}
        >
            <div className="flex items-start justify-between gap-4">
                <div
                    className={`grid h-11 w-11 place-items-center rounded-2xl ${selectedTone.icon}`}
                >
                    <Icon size={21} />
                </div>

                <ChevronRight
                    size={19}
                    className="text-neutral-400 transition group-hover:tranneutral-x-1"
                />
            </div>

            <h3 className="mt-5 text-base font-bold text-neutral-950">
                {title}
            </h3>

            <p className="mt-1.5 text-xs leading-5 text-neutral-500">
                {description}
            </p>

            <p className="mt-4 break-all text-sm font-bold text-neutral-800">
                {value}
            </p>

            <span
                className={`mt-2 inline-flex items-center gap-1 text-xs font-bold ${selectedTone.action}`}
            >
                {actionLabel}
                <ChevronRight size={14} />
            </span>
        </button>
    );
}

function CustomerInfoRow({
    label,
    value,
}) {
    return (
        <div className="flex items-start justify-between gap-4 py-3.5">
            <span className="text-xs text-neutral-500">
                {label}
            </span>

            <span className="max-w-[60%] break-words text-right text-xs font-bold text-neutral-900">
                {value}
            </span>
        </div>
    );
}