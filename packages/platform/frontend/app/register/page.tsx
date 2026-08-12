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
    return 'Google registration is not configured for this local Student-LAD run. Use email registration, or add Google OAuth client ID and secret in backend/.env.oauth.';
  }
  return message;
}

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
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
      const registerResponse = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName.trim(), email: email.trim(), password, organization_name: organizationName.trim() || undefined }),
      });
      const registerData = await registerResponse.json().catch(() => ({}));
      if (!registerResponse.ok) throw new Error(registerData.detail || 'Unable to create account.');
      const loginResponse = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const loginData = await loginResponse.json().catch(() => ({}));
      if (!loginResponse.ok || !loginData.access_token) throw new Error(loginData.detail || 'Account created, but automatic sign-in failed.');
      setAuthSession(loginData.access_token, loginData.user);
      router.replace(postLoginPath);
    } catch (err) {
      setError(err instanceof Error ? friendlyAuthError(err.message) : 'Unable to create account.');
    } finally {
      setLoading(false);
    }
  }

  async function registerWithGoogle() {
    setGoogleLoading(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/google/start`, { credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.authorization_url) throw new Error(data.detail || 'Google registration is not available.');
      window.location.assign(data.authorization_url);
    } catch (err) {
      setError(err instanceof Error ? friendlyAuthError(err.message) : 'Google registration is not available.');
      setGoogleLoading(false);
    }
  }

  return (
    <PublicRoute>
      <main className="min-h-screen bg-slate-950 text-white">
        <section className="grid min-h-screen lg:grid-cols-[0.95fr_1.05fr]">
          <div className="relative hidden overflow-hidden lg:block">
            <video autoPlay loop muted playsInline className="absolute inset-0 h-full w-full object-cover">
              <source src="/videos/lotus-dorje-intro.mp4" type="video/mp4" />
            </video>
            <div className="absolute inset-0 bg-slate-950/76" />
            <div className="absolute inset-0 bg-gradient-to-br from-teal-500/30 via-slate-950/20 to-slate-950" />
            <div className="relative flex h-full min-h-screen flex-col justify-between p-10 xl:p-14">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-emerald-300">Student-LAD</p>
                <h1 className="mt-5 max-w-xl text-5xl font-semibold leading-tight">Create your secure academic workspace.</h1>
                <p className="mt-5 max-w-lg text-lg leading-8 text-slate-200">Every user gets isolated history, CEDA context, reminders, connectors, and workspace records.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm leading-6 text-slate-100 backdrop-blur">Google OAuth needs configured client credentials. Apple and Microsoft are visible placeholders for future sign-in providers.</div>
            </div>
          </div>

          <div className="flex items-center justify-center px-4 py-10 sm:px-8 lg:px-10">
            <section className="w-full max-w-2xl rounded-[2rem] border border-slate-800 bg-slate-900/90 p-6 shadow-2xl shadow-slate-950/70 backdrop-blur sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Student-LAD by Dorje AI</p>
              <h1 className="mt-3 text-3xl font-semibold">Create your account</h1>
              <p className="mt-2 text-sm leading-6 text-slate-400">Email registration works locally. Google, Apple, and Microsoft provider buttons show the intended production sign-in layout.</p>
              {error ? <p className="mt-5 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p> : null}
              {notice ? <p className="mt-5 rounded-2xl border border-sky-400/30 bg-sky-500/10 p-3 text-sm text-sky-100">{notice}</p> : null}
              <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-200">Full name
                  <input value={fullName} onChange={(event) => setFullName(event.target.value)} required autoComplete="name" className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-emerald-400" placeholder="Your name" />
                </label>
                <label className="block text-sm font-medium text-slate-200">Email
                  <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required autoComplete="email" className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-emerald-400" placeholder="you@example.com" />
                </label>
                <label className="block text-sm font-medium text-slate-200">Password
                  <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required minLength={8} autoComplete="new-password" className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-emerald-400" placeholder="At least 8 characters" />
                </label>
                <label className="block text-sm font-medium text-slate-200">Workspace name <span className="text-slate-500">optional</span>
                  <input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-emerald-400" placeholder="My Student Workspace" />
                </label>
                <button disabled={loading || !fullName.trim() || !email.trim() || password.length < 8} className="sm:col-span-2 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-50" type="submit">{loading ? 'Creating account…' : 'Create account with email'}</button>
              </form>

              <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-slate-500"><span className="h-px flex-1 bg-slate-800" />or register with<span className="h-px flex-1 bg-slate-800" /></div>
              <div className="grid gap-2 sm:grid-cols-3">
                <button type="button" onClick={() => void registerWithGoogle()} disabled={googleLoading} className="flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-white px-3 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:opacity-50"><span aria-hidden="true" className="font-bold text-[#4285F4]">G</span>{googleLoading ? 'Opening…' : 'Google'}</button>
                <button type="button" onClick={() => setNotice('Microsoft registration is a placeholder for a future provider. Use email registration or Google when configured.')} className="flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-semibold text-slate-200 transition hover:border-sky-400"><span aria-hidden="true" className="font-bold text-[#00A4EF]">⊞</span>Microsoft</button>
                <button type="button" onClick={() => setNotice('Apple registration is a placeholder for a future provider. Use email registration or Google when configured.')} className="flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-300"><span aria-hidden="true" className="font-bold"></span>Apple</button>
              </div>
              <p className="mt-6 text-center text-sm text-slate-400">Already have an account? <Link href="/login" className="font-semibold text-emerald-300 hover:underline">Sign in</Link></p>
            </section>
          </div>
        </section>
      </main>
    </PublicRoute>
  );
}
