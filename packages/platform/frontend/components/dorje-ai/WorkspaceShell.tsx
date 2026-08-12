'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL, authorizationHeaders } from '@/lib/api';
import { AUTH_CHANGED_EVENT, logout } from '@/lib/auth';
import DorjeSidebar from './DorjeSidebar';
import DorjeChat from './DorjeChat';
import ConfirmModal from './ConfirmModal';
import { listChatHistory, type StoredConversation } from '@/lib/chatHistory';
import WorkspacePanel, { type WorkspaceView } from './WorkspacePanel';
import { openWorkspaceTool } from '@/components/student-lad/tools/workspaceToolBus';
import WorkspaceToolHost from '@/components/student-lad/tools/WorkspaceToolHost';

type ModalState = { title: string; message: string } | null;
type EmailAttachment = { filename: string; content_type: string; data_base64: string; size?: number };
type HandoffPayload = { content: string; imageUrl?: string; attachments?: EmailAttachment[] };

export default function WorkspaceShell() {
  const router = useRouter(); const [chatKey, setChatKey] = useState(0); const [histories, setHistories] = useState<StoredConversation[]>([]); const [activeConversation, setActiveConversation] = useState<StoredConversation>(); const [context, setContext] = useState(''); const [modal, setModal] = useState<ModalState>(null); const [view, setView] = useState<WorkspaceView>('chat');
  useEffect(() => { const loadForCurrentUser = () => { setHistories(listChatHistory()); setActiveConversation(undefined); setChatKey((value) => value + 1); }; const timer = window.setTimeout(loadForCurrentUser, 0); window.addEventListener(AUTH_CHANGED_EVENT, loadForCurrentUser); window.addEventListener('storage', loadForCurrentUser); return () => { window.clearTimeout(timer); window.removeEventListener(AUTH_CHANGED_EVENT, loadForCurrentUser); window.removeEventListener('storage', loadForCurrentUser); }; }, []);
  useEffect(() => { const timer = window.setTimeout(() => { const requested = new URLSearchParams(window.location.search).get('view'); if (requested === 'settings') { router.replace('/student-lad/settings'); return; } if (requested === 'history' || requested === 'my-apps') setView(requested); }, 0); return () => window.clearTimeout(timer); }, [router]);
  function handoff(payload: HandoffPayload, tab: 'Email' | 'Social') { openWorkspaceTool(tab === 'Email' ? 'email' : 'social', { context: payload.content, imageUrl: payload.imageUrl, attachments: payload.attachments }); }
  async function handleLogout() { try { await fetch(`${API_BASE_URL}/api/v1/auth/logout`, { method: 'POST', credentials: 'include', headers: authorizationHeaders() }); } finally { logout(); router.replace('/login'); } }
  return (
    <div className="dorje-workspace h-dvh min-h-[560px] overflow-hidden p-0 text-slate-100 lg:p-3 2xl:p-4" data-tour-target="workspace-ai">
      <div className="dorje-surface mx-auto flex h-full min-h-0 max-w-[1920px] flex-col overflow-hidden border-slate-800 bg-slate-950/70 shadow-2xl lg:flex-row lg:rounded-2xl lg:border">
        <DorjeSidebar view={view} histories={histories} onHistoryChange={setHistories} onNavigate={setView} onSelectHistory={(conversation) => { setActiveConversation(conversation); setView('chat'); setChatKey((value) => value + 1); }} onNewChat={() => { setActiveConversation(undefined); setView('chat'); setChatKey((value) => value + 1); }} onLogout={() => void handleLogout()} />
        {view === 'chat' ? <DorjeChat key={chatKey} initialConversation={activeConversation} onHistorySaved={setHistories} context={context} onContextChange={setContext} onNotice={(message) => setModal({ title: 'DorjeAI', message })} onNewChat={() => { setActiveConversation(undefined); setView('chat'); setChatKey((value) => value + 1); }} onCreateEmail={(payload) => handoff(payload, 'Email')} onCreateSocial={(payload) => handoff(payload, 'Social')} /> : <WorkspacePanel view={view} histories={histories} onNewChat={() => { setActiveConversation(undefined); setView('chat'); setChatKey((value) => value + 1); }} onSelectHistory={(conversation) => { setActiveConversation(conversation); setView('chat'); setChatKey((value) => value + 1); }} />}
      </div>
      <ConfirmModal open={Boolean(modal)} title={modal?.title || ''} message={modal?.message || ''} onClose={() => setModal(null)} />
      <WorkspaceToolHost />
    </div>
  );
}
