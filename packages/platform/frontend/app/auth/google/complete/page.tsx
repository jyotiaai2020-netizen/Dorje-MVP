'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { API_BASE_URL } from '@/lib/api';
import { setAuthSession } from '@/lib/auth';

const postLoginPath = (process.env.NEXT_PUBLIC_APP_TITLE || 'Student-LAD').includes('Student') ? '/student-lad' : '/';

type AuthPayload = { access_token?: string; user?: unknown; detail?: string };

async function completeGoogleSession(ticket: string | null): Promise<AuthPayload> {
  if (ticket) {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/google/complete`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) throw new Error(data.detail || 'Unable to complete Google sign-in.');
    return data;
  }

  const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, { method: 'POST', credentials: 'include' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(data.detail || 'Unable to complete Google sign-in.');
  return data;
}

function GoogleAuthCompleteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const ticket = searchParams.get('ticket');
    void completeGoogleSession(ticket)
      .then((data) => {
        if (!active || !data.access_token) return;
        setAuthSession(data.access_token, data.user as Parameters<typeof setAuthSession>[1]);
        router.replace(postLoginPath);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to complete Google sign-in.');
      });
    return () => { active = false; };
  }, [router, searchParams]);

  return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white"><div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-2xl">G</div><h1 className="mt-4 text-xl font-semibold">Completing Google sign-in</h1>{error ? <><p className="mt-3 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p><button type="button" onClick={() => router.replace('/login')} className="mt-4 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950">Return to sign in</button></> : <p className="mt-2 text-sm text-slate-400">Creating your secure Student-LAD session…</p>}</div></main>;
}

export default function GoogleAuthCompletePage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white"><div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-2xl">G</div><h1 className="mt-4 text-xl font-semibold">Completing Google sign-in</h1><p className="mt-2 text-sm text-slate-400">Creating your secure Student-LAD session…</p></div></main>}>
      <GoogleAuthCompleteContent />
    </Suspense>
  );
}
