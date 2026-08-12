'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { apiFetch } from '@/lib/api';

type EmailAttachment = { filename: string; content_type: string; data_base64: string; size?: number };
type WordDocument = EmailAttachment & { document_id: string; text_preview: string };
type CedaItem = { summary: string; type?: string; domain?: string; status?: string; key_date?: string; related_item?: string };

export default function EmailComposer({ context, initialImageUrl = '', initialAttachments = [], onBlocked }: { context: string; initialImageUrl?: string; initialAttachments?: EmailAttachment[]; onBlocked: (kind: 'email') => void }) {
  const attachmentNote = initialImageUrl ? '\n\nInclude the attached DorjeAI/Google Flow media with this email.' : '';
  const [form, setForm] = useState({ to: '', cc: '', bcc: '', subject: '', tone: 'Professional', goal: context ? `Turn this DorjeAI result into an email:\n\n${context}${attachmentNote}` : '' });
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [gmail, setGmail] = useState<{ status: string; account_email?: string | null } | null>(null);
  const [attachments, setAttachments] = useState<EmailAttachment[]>(initialAttachments);
  const [wordDocument, setWordDocument] = useState<WordDocument | null>(null);

  useEffect(() => { void apiFetch<Array<{ provider: string; status: string; account_email?: string | null }>>('/api/v1/connectors').then((items) => setGmail(items.find((item) => item.provider === 'gmail') || null)).catch(() => setGmail(null)); }, []);

  async function connectGmail() {
    setLoading(true); setError('');
    try {
      const result = await apiFetch<{ authorization_url: string }>('/api/v1/connectors/google/gmail/connect');
      if (!result.authorization_url.startsWith('https://accounts.google.com/')) throw new Error('Google returned an invalid authorization address.');
      window.location.assign(result.authorization_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start Gmail authorization.');
      setLoading(false);
    }
  }

  async function generate() {
    if (!form.goal.trim()) return;
    setLoading(true); setError('');
    try {
      const draft = await apiFetch<{ subject: string; body: string }>('/api/v1/dorje-ai/email/draft', {
        method: 'POST', body: JSON.stringify({ goal: form.goal, tone: form.tone, recipient: form.to, context }),
      });
      setForm((current) => ({ ...current, subject: draft.subject })); setBody(draft.body);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to generate draft.'); }
    finally { setLoading(false); }
  }

  function addresses(value: string) { return value.split(/[,;]/).map((item) => item.trim()).filter(Boolean); }
  async function fillFromCeda() {
    setLoading(true); setError('');
    try {
      const items = await apiFetch<CedaItem[]>('/api/v1/ceda/items?status=approved');
      const usable = items.slice(0, 8).map((item) => {
        const date = item.key_date ? ` (${item.key_date})` : '';
        return `- ${item.domain || 'context'} / ${item.type || 'record'}: ${item.summary}${date}`;
      }).join('\n');
      if (!usable) { setError('No approved CEDA context is available for autofill yet.'); return; }
      setForm((current) => ({
        ...current,
        goal: `${current.goal ? `${current.goal}\n\n` : ''}Use these approved CEDA details where relevant:\n${usable}`,
      }));
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load approved CEDA context.'); }
    finally { setLoading(false); }
  }
  async function saveWord(mode: 'create' | 'rewrite' | 'append') {
    if (!body.trim()) { setError('Write or generate the email body before creating a Word file.'); return; }
    setLoading(true); setError('');
    try {
      const document = await apiFetch<WordDocument>('/api/v1/dorje-ai/documents/word', {
        method: 'POST',
        body: JSON.stringify({
          filename: `${(form.subject || 'dorje-ai-email').replace(/[^a-z0-9-_ ]/gi, '').trim() || 'dorje-ai-email'}.docx`,
          title: form.subject || 'Dorje AI Email Draft',
          body,
          mode,
          document_id: wordDocument?.document_id,
        }),
      });
      setWordDocument(document);
      setAttachments((current) => [document, ...current.filter((item) => item.filename !== document.filename)]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to create Word document.'); }
    finally { setLoading(false); }
  }
  function attachFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const data = result.includes(',') ? result.split(',').pop() || '' : result;
      if (!data) { setError('Unable to read attachment.'); return; }
      setAttachments((current) => [{ filename: file.name, content_type: file.type || 'application/octet-stream', data_base64: data, size: file.size }, ...current]);
    };
    reader.onerror = () => setError('Unable to read attachment.');
    reader.readAsDataURL(file);
  }
  async function send() {
    if (gmail?.status !== 'connected') { setError('Connect Gmail before sending email.'); onBlocked('email'); return; }
    if (!form.to.trim() || !form.subject.trim() || !body.trim()) { setError('Recipient, subject, and message body are required.'); return; }
    if (!window.confirm(`Send this email now from ${gmail.account_email}${attachments.length ? ` with ${attachments.length} attachment${attachments.length === 1 ? '' : 's'}` : ''}?`)) return;
    setLoading(true); setError('');
    try {
      await apiFetch('/api/v1/connectors/gmail/send', { method: 'POST', skipAuthRedirect: true, body: JSON.stringify({ to: addresses(form.to), cc: addresses(form.cc), bcc: addresses(form.bcc), subject: form.subject, body, html: false, attachments }) });
      setError(''); window.alert('Email sent through your connected Gmail account.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to send email.';
      setError(message);
      if (/gmail authorization|reconnect gmail|connect gmail|authorization expired|no longer valid/i.test(message)) setGmail({ status: 'not_connected' });
    }
    finally { setLoading(false); }
  }
  const needsGmailReconnect = !gmail || gmail.status !== 'connected' || /gmail authorization|reconnect gmail|connect gmail|authorization expired|no longer valid/i.test(error);

  return (
    <div className="space-y-3">
      <select disabled className="field"><option>{gmail?.status === 'connected' ? `Gmail · ${gmail.account_email}` : 'No connected email account'}</option></select>
      {initialImageUrl ? <div className="rounded-xl border border-slate-700 p-2"><Image src={initialImageUrl} alt="Media attached to email draft" width={512} height={512} unoptimized className="max-h-72 w-full rounded-lg bg-black object-contain" /><p className="mt-1 text-xs text-slate-400">dorje-generated-image.png · ready for Google Flow/email handoff</p></div> : null}
      <div className="grid grid-cols-2 gap-2"><input className="field col-span-2" placeholder="To" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /><input className="field" placeholder="CC" value={form.cc} onChange={(e) => setForm({ ...form, cc: e.target.value })} /><input className="field" placeholder="BCC" value={form.bcc} onChange={(e) => setForm({ ...form, bcc: e.target.value })} /></div>
      <select className="field" value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })}>{['Professional','Friendly','Executive','Sales','Support','Follow-up'].map((tone) => <option key={tone}>{tone}</option>)}</select>
      <textarea className="field min-h-24" placeholder="What should this email accomplish?" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} />
      <div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={generate} disabled={loading || !form.goal.trim()} className="action-primary">{loading ? 'Working…' : 'Generate Draft'}</button><button type="button" onClick={() => void fillFromCeda()} disabled={loading} className="action-secondary">Fill from CEDA</button></div>
      {error ? <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs text-rose-200"><p>{error}</p>{needsGmailReconnect ? <button type="button" onClick={() => void connectGmail()} disabled={loading} className="mt-2 rounded-lg bg-emerald-500 px-3 py-1.5 font-semibold text-slate-950 disabled:opacity-50">Reconnect Gmail</button> : null}</div> : null}
      <input className="field" placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
      <textarea className="field min-h-44" placeholder="Draft preview" value={body} onChange={(e) => setBody(e.target.value)} />
      <section className="rounded-xl border border-slate-700 p-3">
        <p className="text-xs font-semibold text-slate-200">Word file + attachments</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3"><button type="button" onClick={() => void saveWord('create')} disabled={loading || !body} className="action-secondary">Create Word</button><button type="button" onClick={() => void saveWord('rewrite')} disabled={loading || !body || !wordDocument} className="action-secondary">Rewrite same</button><button type="button" onClick={() => void saveWord('append')} disabled={loading || !body || !wordDocument} className="action-secondary">Append same</button></div>
        <label className="mt-2 block rounded-lg border border-dashed border-slate-700 px-3 py-2 text-xs text-slate-400">Attach local file<input type="file" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) attachFile(file); event.currentTarget.value = ''; }} /></label>
        {attachments.length ? <div className="mt-2 space-y-1">{attachments.map((item) => <div key={`${item.filename}-${item.size || item.data_base64.length}`} className="flex items-center justify-between gap-2 rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-200"><span className="truncate">📎 {item.filename}</span><button type="button" onClick={() => setAttachments((current) => current.filter((candidate) => candidate !== item))} className="text-rose-300">Remove</button></div>)}</div> : <p className="mt-2 text-xs text-slate-500">No attachments yet.</p>}
      </section>
      <div className="flex gap-2"><button type="button" onClick={() => void navigator.clipboard.writeText(`Subject: ${form.subject}\n\n${body}`)} disabled={!body} className="action-secondary">Copy Draft</button><button type="button" onClick={gmail?.status === 'connected' ? () => void send() : () => void connectGmail()} disabled={loading || (gmail?.status === 'connected' && !body)} className="action-secondary">{gmail?.status === 'connected' ? 'Send with Gmail' : 'Connect Gmail 🔒'}</button></div>
      <p className="security-note">Sending always requires confirmation. OAuth tokens are encrypted and stored only by the backend.</p>
    </div>
  );
}
