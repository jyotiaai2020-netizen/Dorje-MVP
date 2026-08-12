'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import PublicRoute from '@/components/PublicRoute';
import { API_BASE_URL } from '@/lib/api';
import { setAuthSession } from '@/lib/auth';

const postLoginPath = '/student-lad';

function friendlyAuthError(message: string) {
  if (/GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|Google registration is not configured/i.test(message)) {
    return 'Google sign-in is not configured for this local Student-LAD run. Use email/password sign-in, or add Google OAuth client ID and secret in backend/.env.oauth.';
  }
  return message;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.access_token) throw new Error(data.detail || 'Unable to sign in.');
      setAuthSession(data.access_token, data.user);
      router.replace(postLoginPath);
    } catch (err) {
      setError(err instanceof Error ? friendlyAuthError(err.message) : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  }

  async function requestPasswordRecovery(event: FormEvent) {
    event.preventDefault();
    setRecoveryLoading(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/forgot-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoveryEmail.trim() || email.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Unable to start password recovery.');
      if (data.reset_token) setResetToken(data.reset_token);
      setNotice(data.message || 'If this account exists, recovery instructions are available.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start password recovery.');
    } finally {
      setRecoveryLoading(false);
    }
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault();
    setRecoveryLoading(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/reset-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken.trim(), new_password: newPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Unable to reset password.');
      setNotice(data.message || 'Password updated. Sign in with your new password.');
      setPassword('');
      setNewPassword('');
      setResetToken('');
      setRecoveryOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset password.');
    } finally {
      setRecoveryLoading(false);
    }
  }

  async function signInWithGoogle() {
    setGoogleLoading(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/google/start`, { credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.authorization_url) throw new Error(data.detail || 'Google sign-in is not available.');
      window.location.assign(data.authorization_url);
    } catch (err) {
      setError(err instanceof Error ? friendlyAuthError(err.message) : 'Google sign-in is not available.');
      setGoogleLoading(false);
    }
  }

  return (
    <PublicRoute>
      <main className="min-h-screen bg-slate-950 text-white">
        <section className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
          <div className="relative hidden overflow-hidden lg:block">
            <video autoPlay loop muted playsInline className="absolute inset-0 h-full w-full object-cover">
              <source src="/videos/lotus-dorje-intro.mp4" type="video/mp4" />
            </video>
            <div className="absolute inset-0 bg-slate-950/72" />
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/30 via-slate-950/20 to-slate-950" />
            <div className="relative flex h-full min-h-screen flex-col justify-between p-10 xl:p-14">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-emerald-300">Lotus &amp; Dorje</p>
                <h1 className="mt-5 max-w-xl text-5xl font-semibold leading-tight">Student-LAD by Dorje AI</h1>
                <p className="mt-5 max-w-lg text-lg leading-8 text-slate-200">Your secure student AI workspace for thinking, studying, organizing, planning, and growing.</p>
              </div>
              <div className="grid max-w-xl gap-3 text-sm text-slate-100">
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">Local-first workspace and CEDA review before durable memory.</div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">Kamal and Workspace AI share only approved, policy-safe context.</div>
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">Email/password works locally. OAuth providers can be enabled when configured.</div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center px-4 py-10 sm:px-8 lg:px-10">
            <div className="w-full max-w-xl rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6 shadow-2xl shadow-slate-950/70 backdrop-blur sm:p-8">
              <Link href="/" className="text-sm font-medium text-emerald-300 hover:text-emerald-200">← Back to Home</Link>
              <p className="mt-7 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Welcome back</p>
              <h2 className="mt-2 text-3xl font-semibold">Sign in</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">Use email/password for local access. Google can be enabled with OAuth credentials; Apple and Microsoft are reserved placeholders for future sign-in providers.</p>

              {error ? <p className="mt-5 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p> : null}
              {notice ? <p className="mt-5 rounded-2xl border border-sky-400/30 bg-sky-500/10 p-3 text-sm text-sky-100">{notice}</p> : null}

              <form onSubmit={submit} className="mt-6 space-y-4">
                <label className="block text-sm font-medium text-slate-200">Email
                  <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required autoComplete="email" className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-emerald-400" placeholder="you@example.com" />
                </label>
                <label className="block text-sm font-medium text-slate-200">Password
                  <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required autoComplete="current-password" className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-emerald-400" placeholder="••••••••" />
                </label>
                <button type="button" onClick={() => { setRecoveryOpen((current) => !current); setRecoveryEmail(email); }} className="text-sm font-semibold text-emerald-300 hover:text-emerald-200">Forgot password?</button>
                <button disabled={loading || !email.trim() || !password} className="w-full rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-50" type="submit">{loading ? 'Signing in…' : 'Sign in with email'}</button>
              </form>

              {recoveryOpen ? <section className="mt-5 rounded-3xl border border-emerald-400/20 bg-slate-950/70 p-4">
                <h3 className="text-sm font-semibold text-white">Recover your account</h3>
                <p className="mt-1 text-xs leading-5 text-slate-400">Local Student-LAD creates a secure reset session. In production this will send recovery instructions to your email.</p>
                <form onSubmit={requestPasswordRecovery} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <input value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} type="email" required autoComplete="email" className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400" placeholder="account email" />
                  <button type="submit" disabled={recoveryLoading} className="rounded-2xl border border-emerald-400/40 px-4 py-3 text-sm font-semibold text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-50">{recoveryLoading ? 'Sending…' : 'Get reset link'}</button>
                </form>
                <form onSubmit={resetPassword} className="mt-4 space-y-3">
                  <input value={resetToken} onChange={(event) => setResetToken(event.target.value)} required className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400" placeholder="Reset token" />
                  <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" minLength={8} required autoComplete="new-password" className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400" placeholder="New password, at least 8 characters" />
                  <button type="submit" disabled={recoveryLoading || resetToken.length < 16 || newPassword.length < 8} className="w-full rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-50">Set new password</button>
                </form>
              </section> : null}

              <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-slate-500"><span className="h-px flex-1 bg-slate-800" />or continue with<span className="h-px flex-1 bg-slate-800" /></div>
              <div className="grid gap-2 sm:grid-cols-3">
                <button type="button" onClick={() => void signInWithGoogle()} disabled={googleLoading} className="flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-white px-3 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:opacity-50"><span aria-hidden="true" className="font-bold text-[#4285F4]">G</span>{googleLoading ? 'Opening…' : 'Google'}</button>
                <button type="button" onClick={() => setNotice('Microsoft sign-in is a placeholder for a future provider. Use email/password or Google when configured.')} className="flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-semibold text-slate-200 transition hover:border-sky-400"><span aria-hidden="true" className="font-bold text-[#00A4EF]">⊞</span>Microsoft</button>
                <button type="button" onClick={() => setNotice('Apple sign-in is a placeholder for a future provider. Use email/password or Google when configured.')} className="flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-300"><span aria-hidden="true" className="font-bold"></span>Apple</button>
              </div>
              <p className="mt-6 text-center text-sm text-slate-400">New here? <Link href="/register" className="font-semibold text-emerald-300 hover:underline">Create an account</Link></p>
            </div>
          </div>
        </section>
      </main>
    </PublicRoute>
  );
}
