'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';

export default function RootPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/student-lad');
  }, [router]);

  return (
    <AuthGuard>
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-center text-white">
        <section className="max-w-md rounded-3xl border border-emerald-400/20 bg-white/10 p-8 shadow-2xl backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">Student-LAD</p>
          <h1 className="mt-3 text-2xl font-semibold">Opening your secure AI workspace…</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">Student-LAD is your secure AI workspace for studying, planning, organizing, and growing.</p>
        </section>
      </main>
    </AuthGuard>
  );
}
