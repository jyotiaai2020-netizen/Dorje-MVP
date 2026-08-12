'use client';

import { useEffect, useState } from 'react';
import { FileText, ImageIcon, Mail, Megaphone, X } from 'lucide-react';
import EmailComposer from '@/components/dorje-ai/EmailComposer';
import MediaStudio from '@/components/dorje-ai/MediaStudio';
import ReportStudio from '@/components/dorje-ai/ReportStudio';
import SocialComposer from '@/components/dorje-ai/SocialComposer';
import { WORKSPACE_TOOL_OPEN_EVENT, type WorkspaceToolPayload } from './workspaceToolBus';

const toolMeta = {
  email: { title: 'Email Composer', subtitle: 'Draft, review, attach, and send from this screen after confirmation.', icon: Mail },
  social: { title: 'Social Publisher', subtitle: 'Create platform-ready drafts. Publishing requires connector permission and approval.', icon: Megaphone },
  report: { title: 'Report Builder', subtitle: 'Build reports without leaving your current workflow.', icon: FileText },
  media: { title: 'Media Studio', subtitle: 'Generate prompts, captions, storyboards, and media planning copy.', icon: ImageIcon },
} as const;

export default function WorkspaceToolHost() {
  const [payload, setPayload] = useState<WorkspaceToolPayload | null>(null);

  useEffect(() => {
    const open = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail as WorkspaceToolPayload : null;
      if (!detail?.tool) return;
      setPayload(detail);
    };
    window.addEventListener(WORKSPACE_TOOL_OPEN_EVENT, open);
    return () => window.removeEventListener(WORKSPACE_TOOL_OPEN_EVENT, open);
  }, []);

  if (!payload) return null;
  const meta = toolMeta[payload.tool];
  const Icon = meta.icon;
  const context = payload.initialContent || payload.context || '';

  return (
    <div className="fixed inset-0 z-[95] flex justify-end bg-slate-950/35 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label={meta.title}>
      <button type="button" aria-label="Close Workspace tool" className="absolute inset-0 cursor-default" onClick={() => setPayload(null)} />
      <aside className="relative flex h-full w-full flex-col overflow-hidden bg-slate-950 text-slate-100 shadow-2xl shadow-slate-950/70 sm:max-w-xl lg:max-w-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 bg-slate-950/95 p-4">
          <div className="flex min-w-0 gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-200">
              <Icon size={18} />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-white">{meta.title}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">{meta.subtitle}</p>
            </div>
          </div>
          <button type="button" onClick={() => setPayload(null)} className="rounded-full border border-slate-700 p-2 text-slate-300 hover:border-rose-300 hover:text-rose-200" aria-label={`Close ${meta.title}`}>
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {payload.tool === 'email' ? <EmailComposer context={context} initialImageUrl={payload.imageUrl} initialAttachments={payload.attachments || []} onBlocked={() => undefined} /> : null}
          {payload.tool === 'social' ? <SocialComposer context={context} initialImageUrl={payload.imageUrl} onBlocked={() => undefined} /> : null}
          {payload.tool === 'report' ? <ReportStudio context={context} /> : null}
          {payload.tool === 'media' ? <MediaStudio context={context} /> : null}
        </div>
      </aside>
    </div>
  );
}
