'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Bot } from 'lucide-react';
import { getUser, logout } from '@/lib/auth';
import type { AuthUser } from '@/lib/auth';
import { API_BASE_URL, authorizationHeaders } from '@/lib/api';

type HeaderProps = {
  title: string;
  subtitle?: string;
};

export default function Header({ title, subtitle }: HeaderProps) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const displayName = user?.name || user?.full_name || user?.email || 'Signed-in user';

  useEffect(() => {
    const update = window.setTimeout(() => setUser(getUser()), 0);
    return () => window.clearTimeout(update);
  }, []);

  async function handleLogout() {
    try {
      await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: authorizationHeaders(),
      });
    } finally {
      logout();
      router.replace('/login');
    }
  }

  return (
    <header className="border-b border-slate-200 bg-white/80 px-6 py-5 backdrop-blur">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          {subtitle ? <p className="text-sm text-slate-600">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dorje-ai"
            className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100"
          >
            <Bot size={16} />
            <span className="hidden sm:inline">Open DorjeAI</span>
          </Link>
          <div className="text-right">
            <p className="text-sm font-medium text-slate-800">{displayName}</p>
            {user?.email && user.email !== displayName ? (
              <p className="text-xs text-slate-500">{user.email}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
