import { useId, useState } from 'react';

export function Button({ as: Component = 'button', variant = 'primary', className = '', children, ...props }) {
  const styles =
    variant === 'danger'
      ? 'bg-red-700 text-white hover:bg-red-800'
      : variant === 'secondary'
        ? 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
        : 'bg-brand-600 text-white hover:bg-brand-700';
  return (
    <Component
      className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2.5 font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${styles} ${className}`}
      {...props}
    >
      {children}
    </Component>
  );
}

export function Input({ label, error, id: providedId, ...props }) {
  const generatedId = useId();
  const id = providedId || generatedId;
  return (
    <label className="block text-sm font-medium text-slate-700" htmlFor={id}>
      {label}
      <input
        id={id}
        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-600"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error && <span id={`${id}-error`} className="mt-1.5 block text-sm text-red-700">{error}</span>}
    </label>
  );
}

export function Textarea({ label, error, id: providedId, ...props }) {
  const generatedId = useId();
  const id = providedId || generatedId;
  return (
    <label className="block text-sm font-medium text-slate-700" htmlFor={id}>
      {label}
      <textarea
        id={id}
        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-600"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error && <span id={`${id}-error`} className="mt-1.5 block text-sm text-red-700">{error}</span>}
    </label>
  );
}

export function Select({ label, error, id: providedId, children, ...props }) {
  const generatedId = useId();
  const id = providedId || generatedId;
  return (
    <label className="block text-sm font-medium text-slate-700" htmlFor={id}>
      {label}
      <select
        id={id}
        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-slate-900 shadow-sm focus:border-brand-600"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      >
        {children}
      </select>
      {error && <span id={`${id}-error`} className="mt-1.5 block text-sm text-red-700">{error}</span>}
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
        className="absolute right-3 top-10 rounded-md px-2 py-1 text-sm font-medium text-brand-700"
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

export const Card = ({ children, className = '' }) => (
  <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>{children}</section>
);
export const Alert = ({ children, tone = 'error' }) => (
  <div role="alert" className={`rounded-xl border p-3.5 text-sm ${tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-brand-100 bg-brand-50 text-brand-700'}`}>{children}</div>
);
export const Badge = ({ children, tone = 'brand' }) => (
  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone === 'neutral' ? 'bg-slate-100 text-slate-700' : 'bg-brand-50 text-brand-700'}`}>{children}</span>
);
export const Spinner = ({ label = 'Loading' }) => <span className="inline-flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" /><span>{label}</span></span>;
export const PageHeader = ({ title, description, actions }) => (
  <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-bold text-ink">{title}</h1><p className="mt-1 text-slate-600">{description}</p></div>{actions}</header>
);
