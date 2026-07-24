import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../../../auth/AuthContext';
import { Alert, Button, Input, PasswordInput, Spinner } from '../../../components/ui';
import { apiError } from '../../../lib/api';

const schema = z.object({
  email: z.string().max(254).email('Enter a valid email address.'),
  password: z.string().min(12, 'Password must be at least 12 characters.').max(128),
});

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    document.title = 'Admin sign in — Personal Loan Platform';
  }, []);
  if (auth.status === 'authenticated') return <Navigate to="/admin-master/dashboard" replace />;

  const submit = async (values) => {
    setError('');
    try {
      await auth.login(values);
      const destination = location.state?.from?.pathname || '/admin-master/dashboard';
      navigate(destination, { replace: true });
    } catch (requestError) {
      const status = requestError.response?.status;
      setError(
        status === 423
          ? 'This account is temporarily locked. Try again later or contact a security administrator.'
          : status === 429
            ? 'Too many sign-in attempts. Please wait before trying again.'
            : apiError(requestError, 'Invalid email or password.'),
      );
    }
  };

  return (
    <main className="grid min-h-screen bg-slate-50 lg:grid-cols-[1.05fr_.95fr]">
      <section className="hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-500 font-bold">PL</div><span className="text-lg font-semibold">Fintree Personal Loan Platform</span></div>
        <div className="max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[.22em] text-brand-100">Admin security foundation</p>
          <h1 className="mt-5 text-4xl font-bold leading-tight">Controlled access for responsible lending operations.</h1>
          <p className="mt-5 text-lg leading-8 text-slate-300">Short-lived access, rotating sessions, exact permissions, and integrity-protected audit records form the first layer of the platform.</p>
        </div>
        <p className="text-sm text-slate-400">Authorized administrators only · Activity is security logged</p>
      </section>
      <section className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-panel sm:p-9">
          <div className="mb-8 lg:hidden"><div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-700 font-bold text-white">PL</div></div>
          <p className="text-sm font-semibold text-brand-700">ADMIN MASTER</p>
          <h2 className="mt-2 text-3xl font-bold text-ink">Secure sign in</h2>
          <p className="mt-2 text-slate-600">Use your assigned administrator account.</p>
          <form className="mt-7 space-y-5" onSubmit={handleSubmit(submit)} noValidate>
            {error && <Alert>{error}</Alert>}
            <Input label="Email address" autoComplete="username" placeholder="name@company.com" error={errors.email?.message} {...register('email')} />
            <PasswordInput label="Password" autoComplete="current-password" error={errors.password?.message} {...register('password')} />
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Spinner label="Signing in" /> : 'Sign in securely'}
            </Button>
          </form>
          <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            <strong className="text-slate-800">Secure login:</strong> Your session is time-limited and refresh credentials remain in a protected browser cookie.
          </div>
        </div>
      </section>
    </main>
  );
}

