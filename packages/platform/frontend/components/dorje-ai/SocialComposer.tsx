'use client';

import { useState } from 'react';
import Image from 'next/image';
import { API_BASE_URL, apiFetch, authenticatedFetch, authorizationHeaders } from '@/lib/api';
import { readTextStream } from '@/lib/stream';

type MediaReference = { name: string; type: string; content: string };

export default function SocialComposer({ context, initialImageUrl = '', onBlocked }: { context: string; initialImageUrl?: string; onBlocked: (kind: 'social') => void }) {
  const imageContext = initialImageUrl ? `${context}\n\nA generated image from DorjeAI is attached and should be used with this post.` : context;
  const [form, setForm] = useState({ platform: 'LinkedIn', objective: context ? 'Turn this DorjeAI result into a social post' : '', audience: '', tone: 'Professional', keyPoints: imageContext, cta: '', hashtagPreference: 'Relevant and concise' });
  const [post, setPost] = useState(''); const [hashtags, setHashtags] = useState<string[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [media, setMedia] = useState<{ name: string; previewUrl: string } | null>(initialImageUrl ? { name: 'dorje-generated-image.png', previewUrl: initialImageUrl } : null); const [analyzing, setAnalyzing] = useState(false);
  const [mediaReference, setMediaReference] = useState<MediaReference | null>(initialImageUrl ? { name: 'dorje-generated-image.png', type: 'image/png', content: initialImageUrl } : null);
  const [mediaAnalysis, setMediaAnalysis] = useState('');

  async function analyzeReference(reference: MediaReference) {
    const mediaKind = reference.type === 'video/mp4' ? 'representative video frames' : 'image';
    const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/dorje-ai/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authorizationHeaders() }, body: JSON.stringify({ message: `Analyze this ${mediaKind} for a social media post. Describe the subject, action, setting, tone, notable visuals, brand-safe factual details, and a strong caption direction.`, model: 'qwen3.5:0.8b', history: [], files: [reference] }) });
    return readTextStream(response, () => undefined);
  }

  async function analyzeMedia(file: File) {
    setAnalyzing(true); setError('');
    try {
      const body = new FormData(); body.append('file', file);
      const upload = await authenticatedFetch(`${API_BASE_URL}/api/v1/dorje-ai/upload`, { method: 'POST', headers: authorizationHeaders(), body });
      const uploaded = await upload.json(); if (!upload.ok) throw new Error(uploaded.detail || 'Media upload failed.');
      const reference = { name: uploaded.filename, type: uploaded.content_type, content: uploaded.content };
      const analysis = await analyzeReference(reference);
      setMediaReference(reference); setMediaAnalysis(analysis);
      setForm((current) => ({ ...current, objective: current.objective || 'Create a social post for this media', keyPoints: `${current.keyPoints}\n\nQwen Vision analysis:\n${analysis}`.trim() }));
      setMedia({ name: file.name, previewUrl: URL.createObjectURL(file) });
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to analyze this media.'); }
    finally { setAnalyzing(false); }
  }
  async function generate() {
    if (!form.objective.trim()) return; setLoading(true); setError('');
    try {
      let visualAnalysis = mediaAnalysis;
      if (mediaReference && !visualAnalysis) {
        setAnalyzing(true);
        visualAnalysis = await analyzeReference(mediaReference);
        setMediaAnalysis(visualAnalysis);
        setForm((current) => ({ ...current, keyPoints: `${current.keyPoints}\n\nQwen Vision analysis:\n${visualAnalysis}`.trim() }));
      }
      const keyPoints = `${form.keyPoints}${visualAnalysis && !form.keyPoints.includes(visualAnalysis) ? `\n\nQwen Vision analysis:\n${visualAnalysis}` : ''}`;
      const draft = await apiFetch<{ post: string; hashtags: string[] }>('/api/v1/dorje-ai/social/draft', { method: 'POST', body: JSON.stringify({ platform: form.platform, objective: form.objective, audience: form.audience, tone: form.tone, key_points: `${keyPoints}\nHashtags: ${form.hashtagPreference}`.slice(0, 5000), cta: form.cta, context }) });
      setPost(draft.post); setHashtags(draft.hashtags);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to generate post.'); } finally { setLoading(false); setAnalyzing(false); }
  }
  return (
    <div className="space-y-3">
      <label className="block cursor-pointer rounded-xl border border-dashed border-sky-400/30 bg-sky-500/5 p-3 text-center text-sm text-sky-200"><input type="file" accept="image/png,image/jpeg,image/webp,video/mp4,.png,.jpg,.jpeg,.webp,.mp4" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void analyzeMedia(file); }} />{analyzing ? 'Analyzing media with Qwen3.5 Vision…' : 'Upload image or MP4 for social post'}</label>
      {media ? <div className="rounded-xl border border-slate-700 p-2">{media.name.endsWith('.mp4') ? <video src={media.previewUrl} controls playsInline className="max-h-56 w-full rounded-lg bg-black" /> : <Image src={media.previewUrl} alt="Media attached to social draft" width={512} height={512} unoptimized className="max-h-72 w-full rounded-lg bg-black object-contain" />}<p className="mt-1 text-xs text-slate-400">{media.name}</p></div> : null}
      <div className="grid grid-cols-2 gap-2"><select className="field" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>{['LinkedIn','Instagram','Facebook','Medium'].map((p) => <option key={p}>{p}</option>)}</select><select className="field" value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })}>{['Professional','Thought leadership','Conversational','Bold','Educational'].map((t) => <option key={t}>{t}</option>)}</select></div>
      <input className="field" placeholder="Post objective" value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} /><input className="field" placeholder="Audience" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} /><textarea className="field min-h-20" placeholder="Key points" value={form.keyPoints} onChange={(e) => setForm({ ...form, keyPoints: e.target.value })} /><input className="field" placeholder="Hashtag preference" value={form.hashtagPreference} onChange={(e) => setForm({ ...form, hashtagPreference: e.target.value })} /><input className="field" placeholder="Call to action" value={form.cta} onChange={(e) => setForm({ ...form, cta: e.target.value })} />
      <button type="button" onClick={generate} disabled={loading || analyzing || !form.objective.trim()} className="action-primary">{analyzing ? 'Analyzing media…' : loading ? 'Creating…' : 'Generate Post with Vision'}</button>{error ? <p className="text-xs text-rose-300">{error}</p> : null}
      <textarea className="field min-h-44" placeholder="Post preview" value={post} onChange={(e) => setPost(e.target.value)} /><input className="field" value={hashtags.map((tag) => `#${tag.replace(/^#/, '')}`).join(' ')} onChange={(e) => setHashtags(e.target.value.split(/\s+/).filter(Boolean))} placeholder="Hashtags" />
      <div className="flex gap-2"><button type="button" onClick={() => void navigator.clipboard.writeText(`${post}\n\n${hashtags.join(' ')}`)} disabled={!post} className="action-secondary">Copy Draft</button><button type="button" onClick={() => onBlocked('social')} className="action-secondary">Publish 🔒</button></div><p className="security-note">Publishing remains a secure placeholder until OAuth connection and backend token storage are configured.</p>
    </div>
  );
}
