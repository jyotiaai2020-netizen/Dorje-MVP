'use client';

import { useRouter } from 'next/navigation';
import { API_BASE_URL, authorizationHeaders } from '@/lib/api';
import { logout } from '@/lib/auth';
import DorjeSidebar from './DorjeSidebar';
import SharedConnectorCenter from './SharedConnectorCenter';

export default function ConnectorWorkspace() {
  const router = useRouter();

  async function handleLogout() {
    try { await fetch(`${API_BASE_URL}/api/v1/auth/logout`, { method: 'POST', credentials: 'include', headers: authorizationHeaders() }); }
    finally { logout(); router.replace('/login'); }
  }

  return (
    <div className="dorje-workspace h-dvh min-h-[560px] overflow-hidden text-slate-100 lg:p-3 2xl:p-4">
      <div className="dorje-surface mx-auto flex h-full min-h-0 max-w-[1600px] flex-col overflow-hidden border-slate-800 bg-slate-950/70 shadow-2xl lg:flex-row lg:rounded-2xl lg:border">
        <DorjeSidebar active="connectors" onNewChat={() => router.push('/dorje-ai')} onLogout={() => void handleLogout()} />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <SharedConnectorCenter className="min-h-full rounded-none border-0 shadow-none" onBack={() => router.push('/dorje-ai')} />
        </main>
      </div>
    </div>
  );
}
