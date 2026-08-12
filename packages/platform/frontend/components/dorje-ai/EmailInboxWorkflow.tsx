'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';

type EmailAttachment = { filename: string; content_type: string; data_base64: string; size?: number };
type GmailMessage = {
  message_id: string;
  thread_id?: string | null;
  subject: string;
  sender: string;
  received_at?: string | null;
  snippet: string;
  has_attachments: boolean;
};
type GmailAttachment = EmailAttachment & { attachment_id: string; text_preview?: string };
type GmailDetail = GmailMessage & { body_text: string; body_html: string; attachments: GmailAttachment[] };
type GmailSummary = { summary: string; attachment_summaries: string[]; suggested_actions: string[] };
type CreatedDocument = {
  provider: string;
  document_id: string;
  title: string;
  web_view_link?: string;
  attachment?: EmailAttachment | null;
};

function shortProviderLabel(value: string) {
  if (value === 'google-docs') return 'Google Docs';
  if (value === 'local-docx') return 'Local DOCX';
  if (value === 'onedrive') return 'OneDrive';
  if (value === 'sharepoint') return 'SharePoint';
  if (value === 'microsoft-word') return 'Word';
  if (value === 'apple-drive') return 'iCloud';
  return value;
}

export default function EmailInboxWorkflow({ onConnectGmail }: { onConnectGmail: () => void }) {
  const [query, setQuery] = useState('newer_than:30d');
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [selected, setSelected] = useState<GmailDetail | null>(null);
  const [summary, setSummary] = useState<GmailSummary | null>(null);
  const [docBody, setDocBody] = useState('');
  const [docTitle, setDocTitle] = useState('Email Summary');
  const [documentProvider, setDocumentProvider] = useState('local-docx');
  const [createdDocument, setCreatedDocument] = useState<CreatedDocument | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadMessages() {
    setBusy('messages'); setError(''); setNotice('');
    try {
      const result = await apiFetch<{ messages: GmailMessage[] }>(`/api/v1/connectors/gmail/messages?q=${encodeURIComponent(query || 'newer_than:30d')}&max_results=12`, { skipAuthRedirect: true });
      setMessages(result.messages);
      if (!result.messages.length) setNotice('No matching Gmail messages found.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to read Gmail messages.';
      setError(message);
    } finally {
      setBusy('');
    }
  }

  async function readMessage(messageId: string) {
    setBusy(messageId); setError(''); setNotice(''); setSummary(null); setCreatedDocument(null);
    try {
      const detail = await apiFetch<GmailDetail>(`/api/v1/connectors/gmail/messages/${messageId}`, { skipAuthRedirect: true });
      setSelected(detail);
      setDocTitle((detail.subject || 'Email Summary').replace(/^re:\s*/i, '').trim() || 'Email Summary');
      const attachmentText = detail.attachments
        .filter((item) => item.text_preview)
        .map((item) => `\n\nAttachment: ${item.filename}\n${item.text_preview}`)
        .join('');
      setDocBody(`${detail.body_text || detail.snippet}${attachmentText}`.trim());
      setReplyBody(`Hi,\n\nThanks for your email. I reviewed the message and attached material.\n\nBest,\n`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to read this email.');
    } finally {
      setBusy('');
    }
  }

  async function summarizeSelected() {
    if (!selected) return;
    setBusy('summary'); setError(''); setNotice('');
    try {
      const result = await apiFetch<GmailSummary>(`/api/v1/connectors/gmail/messages/${selected.message_id}/summarize`, { method: 'POST', skipAuthRedirect: true });
      setSummary(result);
      setDocBody([
        `# ${docTitle}`,
        '',
        '## Email summary',
        result.summary,
        '',
        result.attachment_summaries.length ? '## Attachment summaries' : '',
        ...result.attachment_summaries.map((item) => `- ${item}`),
        '',
        '## Suggested actions',
        ...result.suggested_actions.map((item) => `- ${item}`),
      ].filter(Boolean).join('\n'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to summarize this email.');
    } finally {
      setBusy('');
    }
  }

  async function createDocument() {
    if (!docBody.trim()) { setError('Read or summarize an email before creating a document.'); return; }
    setBusy('document'); setError(''); setNotice('');
    try {
      const result = await apiFetch<CreatedDocument>('/api/v1/connectors/documents/from-email', {
        method: 'POST',
        skipAuthRedirect: true,
        body: JSON.stringify({ provider: documentProvider, title: docTitle, body: docBody, mode: 'create' }),
      });
      setCreatedDocument(result);
      setNotice(`${shortProviderLabel(documentProvider)} document created.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to create ${shortProviderLabel(documentProvider)} document.`);
    } finally {
      setBusy('');
    }
  }

  async function replyWithDocument() {
    if (!selected) return;
    if (!replyBody.trim()) { setError('Write a reply before sending.'); return; }
    const attachments = createdDocument?.attachment ? [createdDocument.attachment] : [];
    if (!window.confirm(`Send this reply to the original sender${attachments.length ? ' with the created document attached' : ''}?`)) return;
    setBusy('reply'); setError(''); setNotice('');
    try {
      await apiFetch('/api/v1/connectors/gmail/reply', {
        method: 'POST',
        skipAuthRedirect: true,
        body: JSON.stringify({ message_id: selected.message_id, body: replyBody, subject: selected.subject, attachments }),
      });
      setNotice('Reply sent through Gmail.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send Gmail reply.');
    } finally {
      setBusy('');
    }
  }

  const needsConnect = /connect gmail|reconnect gmail|authorization|read access/i.test(error);

  return (
    <section className="space-y-3 rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Email → Document → Cloud → Reply</p>
          <h3 className="mt-1 text-sm font-semibold text-white">Read email and attachments</h3>
          <p className="mt-1 text-xs leading-5 text-slate-400">Gmail is live. Outlook, Apple Mail, OneDrive, and SharePoint appear here after their OAuth/API connectors are activated.</p>
        </div>
        <button type="button" onClick={onConnectGmail} className="rounded-xl border border-cyan-300/25 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/10" title="Connect or reconnect Gmail">🔐 Gmail</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Gmail search, e.g. has:attachment newer_than:30d" />
        <button type="button" onClick={() => void loadMessages()} disabled={busy === 'messages'} className="action-secondary">{busy === 'messages' ? 'Reading…' : 'Load'}</button>
      </div>
      {error ? <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs text-rose-200"><p>{error}</p>{needsConnect ? <button type="button" onClick={onConnectGmail} className="mt-2 rounded-lg bg-emerald-500 px-3 py-1.5 font-semibold text-slate-950">Reconnect Gmail</button> : null}</div> : null}
      {notice ? <p className="rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-200">{notice}</p> : null}
      {messages.length ? <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
        {messages.map((message) => <button key={message.message_id} type="button" onClick={() => void readMessage(message.message_id)} className={`w-full rounded-xl border p-3 text-left text-xs transition ${selected?.message_id === message.message_id ? 'border-cyan-300 bg-cyan-400/10' : 'border-slate-700 bg-slate-900/70 hover:border-cyan-400/50'}`}>
          <span className="flex items-center justify-between gap-2"><strong className="truncate text-slate-100">{message.subject || '(No subject)'}</strong><span className="shrink-0 text-slate-500">{message.has_attachments ? '📎' : '✉️'}</span></span>
          <span className="mt-1 block truncate text-slate-400">{message.sender}</span>
          <span className="mt-1 block truncate text-slate-500">{message.snippet}</span>
        </button>)}
      </div> : null}
      {selected ? <div className="grid gap-3 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
          <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold text-white">{selected.subject || '(No subject)'}</h4><button type="button" onClick={() => void summarizeSelected()} disabled={busy === 'summary'} className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-bold text-slate-950">{busy === 'summary' ? 'Summarizing…' : 'Summarize'}</button></div>
          <p className="mt-1 text-xs text-slate-400">{selected.sender}</p>
          <p className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-slate-300">{selected.body_text || selected.snippet || 'No readable body text.'}</p>
          {selected.attachments.length ? <div className="mt-3 space-y-1">{selected.attachments.map((item) => <p key={item.attachment_id} className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-300">📎 {item.filename} · {item.text_preview ? 'text extracted' : 'binary/preview unavailable'}</p>)}</div> : null}
          {summary ? <div className="mt-3 rounded-xl bg-cyan-500/10 p-3 text-xs leading-5 text-cyan-100"><strong>Summary</strong><p className="mt-1">{summary.summary}</p></div> : null}
        </section>
        <section className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]"><input className="field" value={docTitle} onChange={(event) => setDocTitle(event.target.value)} placeholder="Document title" /><select className="field" value={documentProvider} onChange={(event) => setDocumentProvider(event.target.value)}><option value="local-docx">Local DOCX</option><option value="google-docs">Google Docs</option><option value="onedrive">OneDrive</option><option value="sharepoint">SharePoint</option><option value="microsoft-word">Microsoft Word</option><option value="apple-drive">iCloud Drive</option></select></div>
          <textarea className="field mt-2 min-h-48" value={docBody} onChange={(event) => setDocBody(event.target.value)} placeholder="Editable document content from email and attachments" />
          <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => void createDocument()} disabled={busy === 'document'} className="action-secondary">{busy === 'document' ? 'Creating…' : 'Create document'}</button>{createdDocument?.web_view_link ? <a href={createdDocument.web_view_link} target="_blank" rel="noreferrer" className="action-secondary">Open cloud doc</a> : null}</div>
          {createdDocument ? <p className="mt-2 rounded-lg bg-emerald-500/10 p-2 text-xs text-emerald-200">Created: {shortProviderLabel(createdDocument.provider)} · {createdDocument.title}</p> : null}
          <textarea className="field mt-3 min-h-28" value={replyBody} onChange={(event) => setReplyBody(event.target.value)} placeholder="Reply draft to sender" />
          <button type="button" onClick={() => void replyWithDocument()} disabled={busy === 'reply'} className="mt-2 action-primary">{busy === 'reply' ? 'Sending…' : 'Reply with edited document'}</button>
        </section>
      </div> : null}
    </section>
  );
}
