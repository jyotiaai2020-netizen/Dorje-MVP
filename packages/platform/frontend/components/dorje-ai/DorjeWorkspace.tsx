"use client";

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import DorjeChatPanel from './DorjeChatPanel';
import DorjeContextPanel from './DorjeContextPanel';
import DorjeFileUploader from './DorjeFileUploader';
import DorjeHistoryPanel from './DorjeHistoryPanel';
import DorjeReportActions from './DorjeReportActions';
import { API_BASE_URL, authenticatedFetch, authorizationHeaders } from '@/lib/api';
import { AUTH_CHANGED_EVENT } from '@/lib/auth';
import { readTextStream } from '@/lib/stream';
import { userStorageKey } from '@/lib/userStorage';
import Image from 'next/image';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

type UploadedFileReference = {
  name: string;
  type: string;
  content: string;
};

const HISTORY_KEY = 'dorje_ai_chat_history';
function historyKey() { return userStorageKey(HISTORY_KEY); }

export default function DorjeWorkspace() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [context, setContext] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileReference[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const loadForCurrentUser = () => {
      const storedHistory = window.localStorage.getItem(historyKey());
      if (!storedHistory) {
        setMessages([]);
        return;
      }
      try {
        setMessages(JSON.parse(storedHistory) as Message[]);
      } catch {
        window.localStorage.removeItem(historyKey());
        setMessages([]);
      }
    };
    const update = window.setTimeout(loadForCurrentUser, 0);
    window.addEventListener(AUTH_CHANGED_EVENT, loadForCurrentUser);
    return () => {
      window.clearTimeout(update);
      window.removeEventListener(AUTH_CHANGED_EVENT, loadForCurrentUser);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(historyKey(), JSON.stringify(messages));
    }
  }, [messages]);

  const historyPreview = useMemo(() => messages.slice(-6), [messages]);

  function isImageGenerationRequest(prompt: string) {
    return /\b(generate|create|make|draw|render|produce)\b[\s\S]{0,40}\b(image|picture|illustration|artwork|photo)\b/i.test(prompt);
  }

  async function sendPrompt(prompt: string) {
    if (!prompt.trim() || loading) return;

    const newUserMessage = { role: 'user' as const, content: prompt.trim() };
    const nextMessages = [...messages, newUserMessage];

    if (isImageGenerationRequest(prompt)) {
      setMessages(nextMessages);
      setInput('');
      await generateImage(prompt, nextMessages, true);
      return;
    }

    setMessages([...nextMessages, { role: 'assistant', content: '' }]);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/dorje-ai/chat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authorizationHeaders() },
        body: JSON.stringify({
          message: prompt.trim(),
          context,
          history: nextMessages.slice(-6),
          files: uploadedFiles,
        }),
      });

      const reply = await readTextStream(response, (chunk) => {
        setMessages((current) => {
          const updated = [...current];
          const lastIndex = updated.length - 1;
          if (updated[lastIndex]?.role === 'assistant') {
            updated[lastIndex] = {
              ...updated[lastIndex],
              content: updated[lastIndex].content + chunk,
            };
          }
          return updated;
        });
      });
      if (!reply) throw new Error('DorjeAI returned an empty response.');
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(
        message === 'Load failed' || message === 'Failed to fetch'
          ? `Cannot reach the DorjeAI API at ${API_BASE_URL}. Start the backend and try again.`
          : message || 'DorjeAI could not respond.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendPrompt(input);
  }

  async function handleUpload(file: File) {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/dorje-ai/upload`, {
        method: 'POST',
        credentials: 'include',
        headers: authorizationHeaders(),
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || data.message || 'Unable to upload file.');
      }
      setUploadedFiles((current) => [
        ...current,
        {
          name: data.filename || file.name,
          type: file.type || 'application/octet-stream',
          content: data.content || '',
        },
      ]);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload file.');
    }
  }

  async function handleGenerateReport() {
    setLoading(true);
    setError('');
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/dorje-ai/report`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authorizationHeaders() },
        body: JSON.stringify({
          message: messages[messages.length - 1]?.content || 'Generate a concise report',
          context,
          history: messages,
          files: uploadedFiles,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || data.detail || 'Unable to generate report.');
      }
      setReport(data.report || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate report.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadPdf() {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/dorje-ai/report/pdf`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authorizationHeaders() },
        body: JSON.stringify({
          message: messages[messages.length - 1]?.content || 'Generate a concise report',
          context,
          history: messages,
          files: uploadedFiles,
        }),
      });
      if (!response.ok) {
        throw new Error('Unable to download PDF.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'dorje-ai-report.pdf';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to download PDF.');
    }
  }

  async function handleDownloadDocx() {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/dorje-ai/report/docx`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authorizationHeaders() },
        body: JSON.stringify({
          message: messages[messages.length - 1]?.content || 'Generate a concise report',
          context,
          history: messages,
          files: uploadedFiles,
        }),
      });
      if (!response.ok) {
        throw new Error('Unable to download DOCX.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'dorje-ai-report.docx';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to download DOCX.');
    }
  }

  async function generateImage(
    request: string,
    sourceMessages: Message[],
    announceInChat: boolean,
  ) {
    setLoading(true);
    setError('');
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/dorje-ai/image/jobs`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authorizationHeaders() },
        body: JSON.stringify({
          message: request,
          context,
          history: sourceMessages.slice(-6),
          files: uploadedFiles,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || data.message || data.reason || (data.upgrade_required ? `${data.capability || 'This feature'} requires ${data.required_tier || 'a higher'} tier.` : '') || 'Unable to start image generation.');
      }
      const job = await response.json();
      if (!job.job_id) throw new Error('Image generation did not return a job ID.');
      setImagePrompt('Generating image locally. The first run can take several minutes…');

      let jobStatus = 'queued';
      for (let attempt = 0; attempt < 300; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const statusResponse = await authenticatedFetch(
          `${API_BASE_URL}/api/v1/dorje-ai/image/jobs/${job.job_id}`,
          {
            credentials: 'include',
            headers: authorizationHeaders(),
          },
        );
        const statusData = await statusResponse.json().catch(() => ({}));
        if (!statusResponse.ok) {
          throw new Error(statusData.detail || 'Unable to check image generation status.');
        }
        jobStatus = statusData.status;
        if (jobStatus === 'loading_model') {
          setImagePrompt('Loading the local SSD-1B image model…');
        } else if (jobStatus === 'generating') {
          setImagePrompt('Generating the image at 512×512…');
        }
        if (jobStatus === 'failed') {
          throw new Error(statusData.error || 'Image generation failed.');
        }
        if (jobStatus === 'complete') break;
      }
      if (jobStatus !== 'complete') throw new Error('Image generation timed out.');

      const contentResponse = await authenticatedFetch(
        `${API_BASE_URL}/api/v1/dorje-ai/image/jobs/${job.job_id}/content`,
        {
          credentials: 'include',
          headers: authorizationHeaders(),
        },
      );
      if (!contentResponse.ok) {
        const data = await contentResponse.json().catch(() => ({}));
        throw new Error(data.detail || 'Unable to retrieve the generated image.');
      }
      const blob = await contentResponse.blob();
      const url = URL.createObjectURL(blob);
      setImageUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return url;
      });
      setImagePrompt('Image generated locally with DorjeAI context.');
      if (announceInChat) {
        setMessages((current) => [
          ...current,
          { role: 'assistant', content: 'I generated the requested image and added it below the chat.' },
        ]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(
        message === 'Load failed' || message === 'Failed to fetch'
          ? `Lost connection to the image service at ${API_BASE_URL}. Confirm the backend is running and try again.`
          : message || 'Unable to generate image.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateImagePrompt() {
    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === 'user')?.content;
    await generateImage(
      latestUserMessage || context || 'Create a polished enterprise AI illustration',
      messages,
      false,
    );
  }

  function handleNewChat() {
    setMessages([]);
    setInput('');
    setReport('');
    setImagePrompt('');
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl('');
  }

  function handleSelectHistory(index: number) {
    const entry = historyPreview[index];
    if (entry) {
      setInput(entry.content);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-6">
        <DorjeChatPanel
          messages={messages}
          input={input}
          onInputChange={setInput}
          onSubmit={handleSend}
          loading={loading}
          error={error}
          onSummarizeInput={() => void sendPrompt(`Summarize the following text clearly. Highlight the main points, decisions, risks, and next steps.\n\n${input}`)}
          onExplainInput={() => void sendPrompt(`Explain the following text in plain language. Define technical terms and explain why the key points matter.\n\n${input}`)}
        />

        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/70 p-4 shadow-xl shadow-slate-950/30">
          <DorjeReportActions
            onGenerateReport={handleGenerateReport}
            onDownloadPdf={handleDownloadPdf}
            onDownloadDocx={handleDownloadDocx}
            onGenerateImage={handleGenerateImagePrompt}
            loading={loading}
          />

          {report ? (
            <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm leading-7 text-slate-200">
              {report}
            </div>
          ) : null}

          {imagePrompt ? (
            <div className="mt-4 rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4 text-sm leading-7 text-violet-100">
              <div className="mb-2 text-xs uppercase tracking-[0.25em] text-violet-200">Image prompt</div>
              {imagePrompt}
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt="Image generated from DorjeAI context"
                  width={768}
                  height={768}
                  unoptimized
                  className="mt-3 h-auto w-full rounded-xl"
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-6">
        <DorjeContextPanel
          value={context}
          onChange={setContext}
          onUpdate={() => setError('Context updated for this session.')}
          onSummarize={() => void sendPrompt('Summarize the working context clearly. Highlight the main points, decisions, risks, and next steps.')}
          onExplain={() => void sendPrompt('Explain the working context in plain language. Define technical terms and describe why the key points matter.')}
          loading={loading}
        />
        <DorjeFileUploader onUpload={handleUpload} selectedFiles={uploadedFiles.map((file) => file.name)} />
        <DorjeHistoryPanel history={historyPreview} onSelect={handleSelectHistory} onClear={() => { setMessages([]); setReport(''); setImagePrompt(''); }} onNewChat={handleNewChat} />
      </div>
    </div>
  );
}
