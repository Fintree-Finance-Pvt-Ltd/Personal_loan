import { useId, useState } from 'react';

// Shared primitives for the admin/internal-team side. Two radius tiers, applied
// consistently everywhere in this file (see the Fintree admin design notes in
// AdminLayout.jsx): panels (Card, modals) use rounded-xl; controls (Button, Input,
// Select, Textarea, Badge) use rounded-lg. Nothing here reaches for a third radius.

// 'critical' and 'success' accepted as aliases of 'danger' and 'primary' respectively —
// a couple of call sites assumed those variant names. 'outline' is treated the same as
// 'secondary' (a bordered button) for the same reason.
export function Button({ as: Component = 'button', variant = 'primary', size = 'md', className = '', children, ...props }) {
  const styles =
    variant === 'danger' || variant === 'critical'
      ? 'bg-danger-600 text-white hover:bg-danger-700 focus-visible:outline-danger-600'
      // Subtle/tinted danger — for a frequent, per-row destructive action (e.g. "Reject"
      // in a review queue) where a bold solid-red button repeated down a whole table
      // reads as alarming rather than routine. Reserve solid `danger` for the rarer,
      // truly final confirmation step (e.g. inside a "confirm rejection" dialog).
      : variant === 'dangerGhost'
        ? 'border border-danger-200 bg-danger-50 text-danger-700 hover:bg-danger-100'
        : variant === 'secondary' || variant === 'outline'
          ? 'border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50 hover:border-neutral-400'
          : variant === 'ghost'
            ? 'text-neutral-700 hover:bg-neutral-100'
            : 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/10';
  const sizing = size === 'sm' ? 'min-h-8 px-3 text-xs' : 'min-h-10 px-4 text-sm';
  return (
    <Component
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 ${sizing} ${styles} ${className}`}
      {...props}
    >
      {children}
    </Component>
  );
}

export function Input({ label, error, hint, id: providedId, className = '', ...props }) {
  const generatedId = useId();
  const id = providedId || generatedId;
  return (
    <label className="block text-sm font-medium text-neutral-700" htmlFor={id}>
      {label}
      <input
        id={id}
        className={`mt-1.5 w-full rounded-lg border bg-white px-3.5 py-2.5 text-[15px] text-neutral-900 shadow-sm outline-none transition placeholder:text-neutral-400 focus:ring-4 ${
          error
            ? 'border-danger-400 focus:border-danger-500 focus:ring-danger-100'
            : 'border-neutral-300 focus:border-brand-500 focus:ring-brand-100'
        } ${className}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...props}
      />
      {hint && !error && <span id={`${id}-hint`} className="mt-1 block text-xs font-normal text-neutral-500">{hint}</span>}
      {error && <span id={`${id}-error`} className="mt-1 block text-xs font-semibold text-danger-600">{error}</span>}
    </label>
  );
}

export function Textarea({ label, error, hint, id: providedId, className = '', ...props }) {
  const generatedId = useId();
  const id = providedId || generatedId;
  return (
    <label className="block text-sm font-medium text-neutral-700" htmlFor={id}>
      {label}
      <textarea
        id={id}
        className={`mt-1.5 w-full rounded-lg border bg-white px-3.5 py-2.5 text-[15px] text-neutral-900 shadow-sm outline-none transition placeholder:text-neutral-400 focus:ring-4 ${
          error
            ? 'border-danger-400 focus:border-danger-500 focus:ring-danger-100'
            : 'border-neutral-300 focus:border-brand-500 focus:ring-brand-100'
        } ${className}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...props}
      />
      {hint && !error && <span id={`${id}-hint`} className="mt-1 block text-xs font-normal text-neutral-500">{hint}</span>}
      {error && <span id={`${id}-error`} className="mt-1 block text-xs font-semibold text-danger-600">{error}</span>}
    </label>
  );
}

export function Select({ label, error, hint, id: providedId, children, className = '', ...props }) {
  const generatedId = useId();
  const id = providedId || generatedId;
  return (
    <label className="block text-sm font-medium text-neutral-700" htmlFor={id}>
      {label}
      <select
        id={id}
        className={`mt-1.5 w-full rounded-lg border bg-white px-3.5 py-2.5 text-[15px] text-neutral-900 shadow-sm outline-none transition focus:ring-4 ${
          error
            ? 'border-danger-400 focus:border-danger-500 focus:ring-danger-100'
            : 'border-neutral-300 focus:border-brand-500 focus:ring-brand-100'
        } ${className}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...props}
      >
        {children}
      </select>
      {hint && !error && <span id={`${id}-hint`} className="mt-1 block text-xs font-normal text-neutral-500">{hint}</span>}
      {error && <span id={`${id}-error`} className="mt-1 block text-xs font-semibold text-danger-600">{error}</span>}
    </label>
  );
}

export function PasswordInput({ label, error, ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input label={label} error={error} type={visible ? 'text' : 'password'} {...props} />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        className="absolute right-3 top-[34px] rounded-md px-2 py-1 text-xs font-bold uppercase tracking-wide text-brand-700 hover:bg-brand-50"
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

// Panels tier (rounded-xl). Flat by default — a hairline border communicates structure
// without the soft-app drop-shadow look; pass `elevated` for the rare panel that needs
// to visually float above the page (e.g. a dropdown-adjacent card), which gets a subtle
// shadow tinted to the ink hue instead of a generic black one.
export const Card = ({ children, className = '', elevated = false }) => (
  <section
    className={`rounded-xl border border-neutral-200 bg-white p-5 ${
      elevated ? 'shadow-[0_8px_28px_rgba(16,42,46,0.08)]' : ''
    } ${className}`}
  >
    {children}
  </section>
);

// A Card with a titled header row + divider — the standard "panel of related fields or
// records" shape used across create/edit/detail pages, so those pages stop hand-rolling
// their own header+border markup differently each time.
export const Panel = ({ title, description, actions, children, className = '' }) => (
  <section className={`overflow-hidden rounded-xl border border-neutral-200 bg-white ${className}`}>
    {(title || actions) && (
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50/60 px-5 py-4">
        <div>
          {title && <h3 className="font-display text-[15px] font-bold text-ink">{title}</h3>}
          {description && <p className="mt-0.5 text-sm text-neutral-500">{description}</p>}
        </div>
        {actions}
      </div>
    )}
    <div className="p-5">{children}</div>
  </section>
);

export const Alert = ({ children, tone = 'error', className = '' }) => {
  const tones = {
    error: 'border-danger-200 bg-danger-50 text-danger-800',
    // 'danger' accepted as an alias of 'error' — several call sites pass it directly.
    danger: 'border-danger-200 bg-danger-50 text-danger-800',
    success: 'border-brand-200 bg-brand-50 text-brand-800',
    warning: 'border-caution-200 bg-caution-50 text-caution-800',
    info: 'border-info-200 bg-info-50 text-info-800',
  };
  return (
    <div role="alert" className={`rounded-lg border-l-4 px-4 py-3 text-sm font-medium ${tones[tone] || tones.error} ${className}`}>
      {children}
    </div>
  );
};

// Full semantic tone set mapped onto the app's existing color scales — a banking admin
// panel lives or dies by status legibility (Pending / Approved / Rejected / Processing /
// Failed), so this is deliberately richer than a brand/neutral binary.
// Every alias below is a real tone value some page in the codebase already passes,
// assuming either Alert's names (success/error/warning) or a raw Tailwind color
// (emerald/green/red/amber/blue/violet/slate) instead of this app's semantic scale.
// Rather than hunting down and editing every call site, each resolves to the correct
// semantic color here — one place, matching the same color-family mapping used
// throughout this redesign (emerald/green/teal -> brand, red/rose -> danger,
// amber/yellow -> caution, blue/sky/cyan -> info, violet/purple/indigo/pink -> accent).
export const Badge = ({ children, tone = 'neutral', dot = false }) => {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    success: 'bg-brand-50 text-brand-700',
    emerald: 'bg-brand-50 text-brand-700',
    green: 'bg-brand-50 text-brand-700',
    info: 'bg-info-50 text-info-700',
    blue: 'bg-info-50 text-info-700',
    accent: 'bg-accent-50 text-accent-700',
    violet: 'bg-accent-50 text-accent-700',
    caution: 'bg-caution-50 text-caution-700',
    warning: 'bg-caution-50 text-caution-700',
    amber: 'bg-caution-50 text-caution-700',
    danger: 'bg-danger-50 text-danger-700',
    critical: 'bg-danger-50 text-danger-700',
    error: 'bg-danger-50 text-danger-700',
    red: 'bg-danger-50 text-danger-700',
    neutral: 'bg-neutral-100 text-neutral-700',
    slate: 'bg-neutral-100 text-neutral-700',
  };
  const dots = {
    brand: 'bg-brand-500',
    success: 'bg-brand-500',
    emerald: 'bg-brand-500',
    green: 'bg-brand-500',
    info: 'bg-info-500',
    blue: 'bg-info-500',
    accent: 'bg-accent-500',
    violet: 'bg-accent-500',
    caution: 'bg-caution-500',
    warning: 'bg-caution-500',
    amber: 'bg-caution-500',
    danger: 'bg-danger-500',
    critical: 'bg-danger-500',
    error: 'bg-danger-500',
    red: 'bg-danger-500',
    neutral: 'bg-neutral-400',
    slate: 'bg-neutral-400',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold ${tones[tone] || tones.neutral}`}>
      {dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dots[tone] || dots.neutral}`} />}
      {children}
    </span>
  );
};

export const Spinner = ({ label = 'Loading' }) => (
  <span className="inline-flex items-center gap-2 text-sm">
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
    <span>{label}</span>
  </span>
);

export const PageHeader = ({ eyebrow, title, description, actions }) => (
  <header className="mb-6 flex flex-col gap-4 border-b border-neutral-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
    <div>
      {eyebrow && (
        <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-brand-600">{eyebrow}</p>
      )}
      <h1 className="font-display text-2xl font-extrabold text-ink">{title}</h1>
      {description && <p className="mt-1 text-[15px] text-neutral-500">{description}</p>}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
  </header>
);

// KPI tile for dashboards (Distribution/Capacity dashboards, the main admin Dashboard).
// `tone` picks the icon chip's color from the same semantic scale as Badge.
export function StatCard({ icon: Icon, label, value, helper, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    info: 'bg-info-50 text-info-700',
    accent: 'bg-accent-50 text-accent-700',
    caution: 'bg-caution-50 text-caution-700',
    danger: 'bg-danger-50 text-danger-700',
    neutral: 'bg-neutral-100 text-neutral-700',
  };
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">{label}</p>
        {Icon && (
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tones[tone] || tones.brand}`}>
            <Icon size={17} strokeWidth={2} />
          </span>
        )}
      </div>
      <p className="font-numeric font-display mt-3 text-[28px] font-extrabold leading-none text-ink">{value}</p>
      {helper && <p className="mt-2 text-xs text-neutral-500">{helper}</p>}
    </div>
  );
}

// Composed "nothing here yet" view — replaces bare "No data" text across list pages.
export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-neutral-50/60 px-6 py-14 text-center">
      {Icon && (
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-white text-neutral-400 shadow-sm">
          <Icon size={22} strokeWidth={1.75} />
        </span>
      )}
      <p className="font-display text-base font-bold text-ink">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm text-neutral-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// Thin wrapper standardizing the "data table inside a bordered panel" shape used across
// list pages — a scrollable container plus consistent header/cell padding and hover rows.
// Pages keep authoring their own <thead>/<tbody> markup; this only owns the outer chrome.
export function TableShell({ children, className = '' }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-neutral-200 bg-white ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
      </div>
    </div>
  );
}
