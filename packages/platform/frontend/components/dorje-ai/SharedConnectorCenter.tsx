'use client';

import { useEffect, useState } from 'react';
import ConnectorPanel, { type WorkspaceTab } from './ConnectorPanel';
import ConfirmModal from './ConfirmModal';
import { openWorkspaceTool, type WorkspaceToolKind } from '@/components/student-lad/tools/workspaceToolBus';

type ModalState = { title: string; message: string } | null;
type EmailAttachment = { filename: string; content_type: string; data_base64: string; size?: number };

type SharedConnectorCenterProps = {
  initialContext?: string;
  initialImageUrl?: string;
  initialTab?: WorkspaceTab;
  className?: string;
  onBack?: () => void;
  showHeader?: boolean;
};

function isWorkspaceTab(value: string | null): value is WorkspaceTab {
  return value === 'Connectors';
}

function oldToolTab(value: string | null): WorkspaceToolKind | null {
  if (value === 'Email') return 'email';
  if (value === 'Social') return 'social';
  if (value === 'Reports') return 'report';
  if (value === 'Media') return 'media';
  return null;
}

export default function SharedConnectorCenter({
  initialContext = '',
  initialImageUrl = '',
  initialTab = 'Connectors',
  className = '',
  onBack,
  showHeader = true,
}: SharedConnectorCenterProps) {
  const [ready, setReady] = useState(false);
  const [context, setContext] = useState(initialContext);
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [emailAttachments, setEmailAttachments] = useState<EmailAttachment[]>([]);
  const [activeInitialTab, setActiveInitialTab] = useState<WorkspaceTab>(initialTab);
  const [workspaceKey, setWorkspaceKey] = useState(0);
  const [modal, setModal] = useState<ModalState>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const requestedTab = params.get('tab');

      if (params.get('connected')) {
        const provider = params.get('connected')!.replace(/^google-/, '').replaceAll('-', ' ');
        setModal({
          title: 'Google service connected',
          message: `${provider.charAt(0).toUpperCase()}${provider.slice(1)} is connected. Dorje AI stores encrypted OAuth credentials on the server.`,
        });
      }
      if (params.get('oauth_error')) {
        setModal({ title: 'Google connection failed', message: `Google OAuth returned: ${params.get('oauth_error')}` });
      }
      if (params.get('connected') || params.get('oauth_error')) {
        params.delete('connected');
        params.delete('oauth_error');
        const cleanQuery = params.toString();
        window.history.replaceState(null, '', `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ''}`);
      }
      if (isWorkspaceTab(requestedTab)) setActiveInitialTab(requestedTab);

      const storedPayload = window.sessionStorage.getItem('dorje_handoff_payload');
      let handoffPayload: { content?: string; imageUrl?: string; attachments?: EmailAttachment[] } | null = null;
      if (storedPayload) {
        try {
          const payload = JSON.parse(storedPayload);
          handoffPayload = payload;
          setContext(payload.content || '');
          setImageUrl(payload.imageUrl || '');
          setEmailAttachments(Array.isArray(payload.attachments) ? payload.attachments : []);
        } catch {
          setContext('');
          setImageUrl('');
          setEmailAttachments([]);
        }
      }
      const legacyTool = oldToolTab(requestedTab);
      if (legacyTool) {
        openWorkspaceTool(legacyTool, {
          context: handoffPayload?.content || '',
          imageUrl: handoffPayload?.imageUrl || '',
          attachments: Array.isArray(handoffPayload?.attachments) ? handoffPayload?.attachments : [],
        });
        params.delete('tab');
        const cleanQuery = params.toString();
        window.history.replaceState(null, '', `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ''}`);
      }

      const pendingConnector = window.sessionStorage.getItem('dorje_pending_connector');
      if (pendingConnector) {
        try {
          const payload = JSON.parse(pendingConnector);
          setModal({
            title: `Connect ${payload.name || 'connector'}`,
            message: `${payload.reason || 'This connector is required for the requested Workspace AI action.'} Choose the connector card below to add authorization details or continue the supported OAuth flow.`,
          });
        } catch {
          setModal({
            title: 'Connect application',
            message: 'Choose the connector card below to add authorization details or continue the supported OAuth flow.',
          });
        }
      }

      window.sessionStorage.removeItem('dorje_handoff_payload');
      window.sessionStorage.removeItem('dorje_pending_connector');
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function showOAuth(provider: string) {
    const gated = ['Google AI Studio', 'Gemini'].includes(provider)
      ? 'This service requires a Google Cloud project and Generative Language API configuration; it is not a consumer-account data connector.'
      : provider === 'NotebookLM'
        ? 'NotebookLM API access currently requires NotebookLM Enterprise licensing and Google Cloud project configuration.'
        : provider === 'Google Flow'
          ? 'Google Flow does not currently expose a supported public OAuth API for third-party project access.'
          : 'This provider remains a secure placeholder until its supported API workflow is implemented.';
    setModal({ title: `Connect ${provider}`, message: gated });
  }

  function showBlocked(kind: 'email' | 'social') {
    setModal({
      title: kind === 'email' ? 'Connect Gmail first' : 'Publishing is locked',
      message: kind === 'email'
        ? 'Open the Connectors tab and connect your Gmail account before sending.'
        : 'This action will be enabled after its provider OAuth flow is implemented.',
    });
  }

  function resetWorkspace() {
    setContext('');
    setImageUrl('');
    setWorkspaceKey((value) => value + 1);
  }

  return (
    <section className={`overflow-hidden rounded-[28px] border border-slate-800 bg-slate-950 text-slate-100 shadow-2xl ${className}`}>
      {showHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Shared Connector Center</p>
            <h1 className="mt-1 text-xl font-semibold text-white">Connectors & Content Studio</h1>
            <p className="mt-1 text-sm text-slate-400">The same secure connector center is available from Student-LAD Home and WorkspaceAI.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={resetWorkspace} className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800">
              ↻ Reset form
            </button>
            {onBack ? (
              <button type="button" onClick={onBack} className="rounded-xl border border-emerald-400/30 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-500/10">
                ← Back
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {ready ? (
        <ConnectorPanel
          key={workspaceKey}
          standalone
          initialTab={activeInitialTab}
          context={context}
          imageUrl={imageUrl}
          emailAttachments={emailAttachments}
          onOAuth={showOAuth}
          onBlocked={showBlocked}
        />
      ) : (
        <p className="p-6 text-sm text-slate-400">Loading connector center…</p>
      )}
      <ConfirmModal open={Boolean(modal)} title={modal?.title || ''} message={modal?.message || ''} onClose={() => setModal(null)} />
    </section>
  );
}
