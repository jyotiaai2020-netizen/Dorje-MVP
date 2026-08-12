'use client';

import { useEffect, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import Image from 'next/image';
import { Archive, Bell, Camera, ChartNoAxesColumn, ChevronDown, Clock3, Cloud, Code2, Copy, Database, FileImage, FileSpreadsheet, Files, FileText, FolderOpen, Grid3X3, HardDrive, History, ImageIcon, Link2, Mail, Mic, MonitorUp, Paperclip, Pin, PinOff, Plus, Printer, Search, Send, Share2, Sigma, SlidersHorizontal, Sparkles, SquarePen, StopCircle, Table2, Tags, UserRound, Wrench, X } from 'lucide-react';
import { API_BASE_URL, authenticatedFetch, authorizationHeaders } from '@/lib/api';
import { readTextStream } from '@/lib/stream';
import { getExportPreferences } from '@/lib/exportPreferences';
import { saveChatConversation, type StoredConversation } from '@/lib/chatHistory';
import DorjeMessage from './DorjeMessage';
import BrandIcon from './BrandIcon';
import type { StructuredTableData } from './StructuredTableView';
import ModelModeSelector, { type ModelMode } from './ModelModeSelector';
import ThemeControl from './ThemeControl';
import CedaSuggestionButtons, { type CedaSuggestion } from './CedaSuggestionButtons';
import { useCedaSuggestionComposer } from './useCedaSuggestionComposer';

type Message = { role: 'user' | 'assistant'; content: string; imageUrl?: string; enhancedPrompt?: string; originalPrompt?: string; table?: StructuredTableData; tableLoading?: boolean; chartOpen?: boolean; versions?: string[]; model?: string; attachments?: { name: string; type: string }[] };
type FileReference = { name: string; type: string; content: string; stored_name?: string; source_label?: string };
type EmailAttachment = { filename: string; content_type: string; data_base64: string; size?: number };
type GeneratedDocument = EmailAttachment & { document_id: string; text_preview: string; body: string; source_prompt: string };
type WorkspaceFileKind = 'document' | 'spreadsheet' | 'presentation' | 'pdf' | 'form' | 'attachment';
type WorkspaceFileState = { file_id: string; kind: WorkspaceFileKind; title: string; filename: string; mime_type: string; body: string; version: number; versions: string[]; source: string; status: string; updated_at: string; attachment?: EmailAttachment };
type InlineEmailPayload = { content: string; imageUrl?: string; attachments?: EmailAttachment[] };
type Props = { context: string; onContextChange: (value: string) => void; onNotice: (message: string) => void; onNewChat: () => void; onCreateEmail: (payload: { content: string; imageUrl?: string; attachments?: EmailAttachment[] }) => void; onCreateSocial: (payload: { content: string; imageUrl?: string }) => void; initialConversation?: StoredConversation; onHistorySaved?: (history: StoredConversation[]) => void };
type ConnectorPromptState = { provider: string; name: string; reason: string; action: string; tab?: 'Email' | 'Connectors' };
type ConnectorFile = { id: string; name: string; mime_type: string; is_folder: boolean; size?: number; modified_time?: string; web_view_link?: string };
type CloudBrowserState = { provider: string; name: string; folderId: string; query: string; files: ConnectorFile[]; loading: boolean; error: string; path: { id: string; name: string }[] };
type UpgradePrompt = { title: string; reason: string; requiredTier?: string; capability?: string };

const modeInstructions: Record<ModelMode, string> = {
  'Fast Chat': 'Answer concisely and directly.',
  'Deep Analysis': 'Use the strongest available reasoning path for a complete, natural, deeply considered answer. Do not force a template, table, formula, or short summary unless the user asks. Be expansive enough to fully answer the request, organize with headings only when helpful, and preserve important nuance.',
  'Statistics Mode': 'Follow this workflow: 1. Problem Understanding: define the question clearly. 2. Assumptions: list key assumptions. 3. Formula: write every mathematical formula in valid LaTeX using $$...$$ for display equations and $...$ for inline notation. 4. Calculation Table: use a markdown table. 5. Recommended Chart: suggest a chart type. 6. Interpretation: explain the results. 7. Next Actions: propose next steps. Use exact values and explicit units. Avoid unnecessary text.',
  'Report Mode': 'Write a structured consulting report with these sections: Executive Summary, Key Findings, Recommendations, and Next Steps. Use clear headings, concise language, 3–5 key findings, prioritized actions, and practical next steps.',
  'Social Creator': 'Create polished social media content with a catchy headline, 2–3 short engaging paragraphs, a clear call-to-action, and optional hashtags/tags. Use emphatic language, focus on benefits, keep paragraphs short, and use emoji sparingly.',
  'Email Assistant': 'Draft a professional email with a subject line, greeting, clear concise body, closing, and optional signature block. Use formal yet approachable language, avoid jargon, and keep the email focused on one message.',
};

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Invalid image data.')); reader.onerror = () => reject(new Error('Unable to read the generated PNG.')); reader.readAsDataURL(blob); });
}

function cleanLatexTableCell(value: string) {
  return value
    .replace(/%.*$/g, '')
    .replace(/\$+\s*\$+/g, '')
    .replace(/\$(.*?)\$/g, '$1')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\mathrm\{([^}]*)\}/g, '$1')
    .replace(/\\[a-zA-Z]+(\[[^\]]*\])?(\{[^}]*\})?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\\</g, '<')
    .replace(/\\>/g, '>')
    .replace(/\\&/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function markdownTable(headers: string[], rows: string[][]) {
  const columnCount = Math.max(headers.length, ...rows.map((row) => row.length));
  const normalizedHeaders = Array.from({ length: columnCount }, (_, index) => headers[index]?.trim() || `Column ${index + 1}`);
  const normalizedRows = rows.map((row) => Array.from({ length: columnCount }, (_, index) => row[index]?.trim() || ''));
  return [
    `| ${normalizedHeaders.join(' | ')} |`,
    `| ${normalizedHeaders.map(() => '---').join(' | ')} |`,
    ...normalizedRows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function latexTableToMarkdown(value: string) {
  if (!/\\begin\{tabular\}/i.test(value)) return '';
  const caption = value.match(/\\caption\{([^}]*)\}/i)?.[1]?.trim();
  const tabular = value.match(/\\begin\{tabular\}\{[^}]*\}([\s\S]*?)\\end\{tabular\}/i)?.[1] || value;
  const rows = tabular
    .split(/\\\\/)
    .map((row) => row.trim())
    .filter((row) => row && !/^%/.test(row))
    .map((row) => row.replace(/\\(toprule|midrule|bottomrule)\b/g, '').replace(/\\cmidrule(?:\[[^\]]*\])?\{[^}]*\}/g, '').trim())
    .filter(Boolean)
    .map((row) => row.split(/(?<!\\)&/).map(cleanLatexTableCell))
    .filter((row) => row.some(Boolean));
  if (!rows.length) return '';
  const [headers, ...body] = rows;
  return `${caption ? `Table: ${caption}\n\n` : ''}${markdownTable(headers, body)}`;
}

function tabSeparatedTableToMarkdown(value: string) {
  const rows = value.trim().split(/\r?\n/).map((row) => row.split('\t').map((cell) => cell.trim())).filter((row) => row.length > 1);
  if (rows.length < 2) return '';
  const [headers, ...body] = rows;
  return markdownTable(headers, body);
}

function normalizeTablePaste(value: string) {
  return latexTableToMarkdown(value) || tabSeparatedTableToMarkdown(value);
}

export default function DorjeChat({ context, onContextChange, onNotice, onNewChat, onCreateEmail, onCreateSocial, initialConversation, onHistorySaved }: Props) {
  const studentEdition = (process.env.NEXT_PUBLIC_APP_TITLE || '').includes('Student');
  const [messages, setMessages] = useState<Message[]>(initialConversation?.messages || []);
  const [conversationId] = useState(() => initialConversation?.id || `chat-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`);
  const [chatTitle, setChatTitle] = useState(initialConversation?.title || 'New conversation');
  const [createdAt] = useState(initialConversation?.createdAt || new Date().toISOString()); const [openedUpdatedAt] = useState(initialConversation?.updatedAt || new Date().toISOString());
  const [input, setInput] = useState(''); const [mode, setMode] = useState<ModelMode>('Fast Chat');
  const [upgradePrompt, setUpgradePrompt] = useState<UpgradePrompt | null>(null);
  const [persistConversation, setPersistConversation] = useState(() => Boolean(initialConversation) || !studentEdition);
  const [recording, setRecording] = useState(false); const [transcribing, setTranscribing] = useState(false);
  const [files, setFiles] = useState<FileReference[]>([]); const [loading, setLoading] = useState(false); const [uploading, setUploading] = useState(false);
  const [suggestions, setSuggestions] = useState<CedaSuggestion[]>([]); const [suggestionGreeting, setSuggestionGreeting] = useState(''); const [suggestionsLoading, setSuggestionsLoading] = useState(false); const [selectedSuggestionId, setSelectedSuggestionId] = useState('');
  const [error, setError] = useState(''); const [showContext, setShowContext] = useState(false); const [showInspector, setShowInspector] = useState(false); const [imageStatus, setImageStatus] = useState('');
  const [searchOpen, setSearchOpen] = useState(false); const [searchQuery, setSearchQuery] = useState(''); const [dragging, setDragging] = useState(false);
  const [connectorPrompt, setConnectorPrompt] = useState<ConnectorPromptState | null>(null); const [connectorBusy, setConnectorBusy] = useState(false);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [cloudBrowser, setCloudBrowser] = useState<CloudBrowserState | null>(null);
  const [generatedDocument, setGeneratedDocument] = useState<GeneratedDocument | null>(null);
  const [activeWorkspaceFile, setActiveWorkspaceFile] = useState<WorkspaceFileState | null>(null);
  const [rightPanelWidth, setRightPanelWidth] = useState(288); const [rightPanelPinned, setRightPanelPinned] = useState(false); const [rightPanelHovered, setRightPanelHovered] = useState(false); const rightResizeRef = useRef({ startX: 0, startWidth: 288 });
  const [imagePreferences, setImagePreferences] = useState<string[]>([]);
  const messageListRef = useRef<HTMLDivElement>(null); const endRef = useRef<HTMLDivElement>(null); const abortRef = useRef<AbortController | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null); const mediaStreamRef = useRef<MediaStream | null>(null); const audioChunksRef = useRef<Blob[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const localFileInputRef = useRef<HTMLInputElement>(null);
  const { copyToComposer: copySuggestionToComposer } = useCedaSuggestionComposer<HTMLTextAreaElement>({
    setInput,
    setSelectedSuggestionId,
    composerRef,
    onNotice,
    confirmationNotice: 'CEDA prepared a preview. Confirm inside the next workflow before any calendar, reminder, email, or external change is made.',
  });

  useEffect(() => { const panel = messageListRef.current; if (panel) panel.scrollTo({ top: panel.scrollHeight, behavior: loading ? 'auto' : 'smooth' }); }, [messages, imageStatus, loading]);
  useEffect(() => () => { const recorder = mediaRecorderRef.current; if (recorder?.state === 'recording') { recorder.onstop = null; recorder.stop(); } mediaStreamRef.current?.getTracks().forEach((track) => track.stop()); }, []);
  useEffect(() => { const timer = window.setTimeout(() => { try { setImagePreferences(JSON.parse(window.localStorage.getItem('dorje_image_preferences') || '[]')); } catch { setImagePreferences([]); } }, 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => { if (!messages.length && !files.length) void generateCedaSuggestions([], ''); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const timer = window.setTimeout(() => { const stored = Number(window.localStorage.getItem('dorje_right_panel_width')); if (Number.isFinite(stored) && stored >= 240 && stored <= 480) setRightPanelWidth(stored); setRightPanelPinned(window.localStorage.getItem('dorje_right_panel_pinned') === 'true'); }, 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => { const applyVoicePrompt = (event?: Event) => { const detail = event instanceof CustomEvent && typeof event.detail === 'string' ? event.detail : ''; const prompt = detail || window.sessionStorage.getItem('dorje_voice_prompt') || ''; if (prompt) { setInput((current) => `${current}${current.trim() ? ' ' : ''}${prompt}`); window.sessionStorage.removeItem('dorje_voice_prompt'); } }; const timer = window.setTimeout(() => applyVoicePrompt(), 0); window.addEventListener('dorje-voice-prompt', applyVoicePrompt); return () => { window.clearTimeout(timer); window.removeEventListener('dorje-voice-prompt', applyVoicePrompt); }; }, []);
  useEffect(() => { const shortcut = (event: KeyboardEvent) => { const command = event.metaKey || event.ctrlKey; const key = event.key.toLowerCase(); if (!command) return; if (key === 'n') { event.preventDefault(); onNewChat(); } else if (key === 'k') { event.preventDefault(); setSearchOpen(true); window.setTimeout(() => searchRef.current?.focus(), 0); } else if (key === '/') { event.preventDefault(); onNotice('Shortcuts: ⌘N new chat · ⌘K search · ⌘⇧E export · ⌘⇧P templates · ⌘⇧R reports · ⌘⇧S settings'); } else if (event.shiftKey && key === 'e') { event.preventDefault(); document.getElementById('dorje-export-chat')?.click(); } else if (event.shiftKey && key === 'p') { event.preventDefault(); window.location.assign('/dorje-ai/templates'); } else if (event.shiftKey && key === 'r') { event.preventDefault(); window.location.assign('/dorje-ai?view=reports'); } else if (event.shiftKey && key === 's') { event.preventDefault(); window.location.assign('/dorje-ai?view=settings'); } }; window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut); }, [onNewChat, onNotice]);
  useEffect(() => {
    if (!persistConversation || !messages.some((message) => message.content.trim())) return;
    const timer = window.setTimeout(() => {
      const firstUserMessage = messages.find((message) => message.role === 'user')?.content || 'DorjeAI conversation';
      const history = saveChatConversation({ id: conversationId, title: chatTitle === 'New conversation' ? firstUserMessage.slice(0, 48) : chatTitle, createdAt: initialConversation?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), messages });
      onHistorySaved?.(history);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [chatTitle, conversationId, initialConversation?.createdAt, messages, onHistorySaved, persistConversation]);

  function isImageRequest(prompt: string) { return /\b(create|generate|make|draw|render|produce|design|visualize)\b[\s\S]{0,100}\b(image|picture|illustration|artwork|photo|wallpaper|logo|poster|visual)\b/i.test(prompt) || /\b(image|picture|illustration|artwork|photo|wallpaper|logo|poster)\b[\s\S]{0,100}\b(of|showing|featuring|for)\b/i.test(prompt) || /\b(i want|show me|can you generate)\b[\s\S]{0,80}\b(picture|image|illustration|artwork|visual)\b/i.test(prompt); }
  function imageDimensions(prompt: string) { if (/\b(portrait|book cover|vertical)\b/i.test(prompt)) return { width: 512, height: 768 }; if (/\b(landscape|banner|wallpaper|website hero|wide)\b/i.test(prompt)) return { width: 768, height: 512 }; return { width: 512, height: 512 }; }
  function isDocumentRequest(prompt: string) {
    return /\b(create|write|draft|generate|make|prepare|rewrite|update|append|convert)\b[\s\S]{0,120}\b(cv|resume|report|document|docx|word file|cover letter|sop|statement of purpose|letter)\b/i.test(prompt)
      || /\b(cv|resume|report|document|docx|word file|cover letter|sop)\b[\s\S]{0,120}\b(create|write|draft|generate|make|prepare|rewrite|update|append|convert)\b/i.test(prompt);
  }
  function requestedWorkspaceKind(prompt: string, submittedFiles: FileReference[] = []): WorkspaceFileKind | null {
    if (/\b(create|make|draft|generate|prepare|open|edit|preview|convert)\b[\s\S]{0,120}\b(presentation|powerpoint|ppt|pptx|slide deck|slides)\b/i.test(prompt)) return 'presentation';
    if (/\b(create|make|draft|generate|prepare|open|edit|preview|convert|analy[sz]e)\b[\s\S]{0,120}\b(excel|xlsx|workbook|spreadsheet|google sheet|sheet|csv)\b/i.test(prompt)) return 'spreadsheet';
    if (/\b(create|make|draft|generate|prepare|open|edit|preview|convert|download)\b[\s\S]{0,120}\b(pdf)\b/i.test(prompt)) return 'pdf';
    if (/\b(create|make|draft|generate|prepare)\b[\s\S]{0,120}\b(form|survey|application form|consent form)\b/i.test(prompt)) return 'form';
    if (isDocumentRequest(prompt) || /\b(create|make|draft|generate|prepare|open|edit|preview|convert)\b[\s\S]{0,120}\b(word|docx|google doc|document|txt|markdown|rtf)\b/i.test(prompt)) return 'document';
    const uploaded = submittedFiles[0];
    if (uploaded) {
      const name = uploaded.name.toLowerCase();
      const type = uploaded.type.toLowerCase();
      if (name.endsWith('.xlsx') || name.endsWith('.csv') || type.includes('spreadsheet') || type.includes('csv')) return 'spreadsheet';
      if (name.endsWith('.pptx') || type.includes('presentation')) return 'presentation';
      if (name.endsWith('.pdf') || type.includes('pdf')) return 'pdf';
      if (name.endsWith('.docx') || name.endsWith('.txt') || name.endsWith('.md') || type.includes('wordprocessingml') || type.startsWith('text/')) return 'document';
      return 'attachment';
    }
    return null;
  }
  function isEmailActionRequest(prompt: string) {
    return /\b(email|mail|gmail|outlook|send|reply|forward)\b[\s\S]{0,120}\b(final|version|document|file|attachment|professor|teacher|sender|recipient|it|this)\b/i.test(prompt)
      || /\b(email|send|reply|forward)\b[\s\S]{0,80}\b(to|with|as attachment)\b/i.test(prompt);
  }
  function workspaceFilename(prompt: string, kind: WorkspaceFileKind) {
    const extension = kind === 'spreadsheet' ? 'xlsx' : kind === 'presentation' ? 'pptx' : kind === 'pdf' ? 'pdf' : kind === 'form' ? 'form.json' : 'docx';
    const topic = prompt
      .replace(/\b(create|write|draft|generate|make|prepare|open|edit|preview|convert|a|an|the|file|document|spreadsheet|workbook|presentation|powerpoint|pdf|form|google|microsoft|word|excel|ppt|pptx|docx|xlsx)\b/gi, ' ')
      .replace(/[^a-z0-9 ]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .slice(0, 7)
      .join('-')
      .toLowerCase();
    return `${topic || `workspace-ai-${kind}`}.${extension}`;
  }
  function createWorkspaceFile(kind: WorkspaceFileKind, prompt: string, body: string, attachment?: EmailAttachment): WorkspaceFileState {
    return {
      file_id: `file-${crypto.randomUUID().slice(0, 12)}`,
      kind,
      title: workspaceFilename(prompt, kind).replace(/\.(docx|xlsx|pptx|pdf|json)$/i, '').replaceAll('-', ' '),
      filename: attachment?.filename || workspaceFilename(prompt, kind),
      mime_type: attachment?.content_type || (kind === 'spreadsheet' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : kind === 'presentation' ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : kind === 'pdf' ? 'application/pdf' : kind === 'form' ? 'application/json' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
      body,
      version: 1,
      versions: [],
      source: 'WorkspaceAI command',
      status: kind === 'document' && attachment ? 'DOCX generated' : 'Draft preview',
      updated_at: new Date().toISOString(),
      attachment,
    };
  }
  function documentMode(prompt: string): 'create' | 'rewrite' | 'append' {
    if (/\b(append|add to|continue|extend)\b/i.test(prompt) && generatedDocument) return 'append';
    if (/\b(rewrite|update|revise|change|edit|replace)\b/i.test(prompt) && generatedDocument) return 'rewrite';
    return 'create';
  }
  function documentFilename(prompt: string) {
    const topic = prompt
      .replace(/\b(create|write|draft|generate|make|prepare|rewrite|update|append|convert|a|an|the|docx|word file|document)\b/gi, ' ')
      .replace(/[^a-z0-9 ]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .slice(0, 7)
      .join('-')
      .toLowerCase();
    return `${topic || 'dorje-ai-document'}.docx`;
  }
  function downloadAttachment(attachment: EmailAttachment) {
    const binary = window.atob(attachment.data_base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: attachment.content_type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = attachment.filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function createDocumentArtifact(prompt: string, body: string, modeOverride?: 'create' | 'rewrite' | 'append') {
    const mode = modeOverride || documentMode(prompt);
    const filename = mode === 'create' || !generatedDocument ? documentFilename(prompt) : generatedDocument.filename;
    const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/dorje-ai/documents/word`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authorizationHeaders() },
      body: JSON.stringify({
        filename,
        title: filename.replace(/\.docx$/i, '').replaceAll('-', ' '),
        body,
        mode,
        document_id: mode === 'create' ? undefined : generatedDocument?.document_id,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'DorjeAI created the content, but could not write the DOCX document.');
    const document = { ...data, body, source_prompt: prompt } as GeneratedDocument;
    setGeneratedDocument(document);
    setActiveWorkspaceFile(createWorkspaceFile('document', prompt, body, document));
    return document;
  }
  function openInlineEmail(payload: InlineEmailPayload) {
    onCreateEmail(payload);
    setSourcePickerOpen(false);
    setShowInspector(false);
  }
  async function exportDocumentPdf(doc: GeneratedDocument) {
    const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/dorje-ai/chat/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authorizationHeaders() },
      body: JSON.stringify({ message: doc.filename, history: [{ role: 'assistant', content: doc.body }], files: [], chart_assets: [] }),
    });
    if (!response.ok) throw new Error('Unable to convert this document preview to PDF.');
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = doc.filename.replace(/\.docx$/i, '.pdf');
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadChatPdf() {
    setError('');
    try {
      const preferences = getExportPreferences(); const safeFilename = (preferences.chatFilename || 'dorje-ai-chat').replace(/[^a-z0-9-_]/gi, '-');
      if (preferences.chatFormat === 'txt') { const transcript = messages.map(({ role, content, attachments }) => `${role === 'user' ? 'YOU' : 'DORJE AI'}\n${content}${attachments?.length ? `\nAttachments: ${attachments.map((item) => item.name).join(', ')}` : ''}`).join('\n\n'); const url = URL.createObjectURL(new Blob([transcript], { type: 'text/plain;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${safeFilename}.txt`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); return; }
      const chart_assets = messages.flatMap((message) => message.table?.chart_asset ? [{ chart_id: message.table.chart_asset.chart_id, title: message.table.chart_asset.title, image_data_url: message.table.chart_asset.image_data_url, dataset: message.table, validation_status: message.table.chart_asset.validation_status, source_row_count: message.table.chart_asset.source_row_count, source_columns: message.table.chart_asset.source_columns, exact_source_rows: message.table.chart_asset.exact_source_rows }] : []);
      const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/dorje-ai/chat/pdf`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authorizationHeaders() }, body: JSON.stringify({ message: 'DorjeAI chat', history: messages.map(({ role, content, attachments }) => ({ role, content: `${content}${attachments?.length ? `\n\nAttachments: ${attachments.map((item) => item.name).join(', ')}` : ''}` })), files: [], chart_assets }) });
      if (!response.ok) throw new Error('Unable to export this chat.'); const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${safeFilename}.pdf`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to export this chat.'); }
  }

  async function convertMessageToTable(index: number) {
    const content = messages[index]?.content; if (!content) return;
    setMessages((current) => current.map((message, messageIndex) => messageIndex === index ? { ...message, tableLoading: true } : message)); setError('');
    try { const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/dorje-ai/table`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authorizationHeaders() }, body: JSON.stringify({ content }) }); const table = await response.json(); if (!response.ok) throw new Error(table.detail || 'Unable to convert this content into a table.'); setMessages((current) => current.map((message, messageIndex) => messageIndex === index ? { ...message, table, tableLoading: false } : message)); }
    catch (err) { setMessages((current) => current.map((message, messageIndex) => messageIndex === index ? { ...message, tableLoading: false } : message)); setError(err instanceof Error ? err.message : 'Unable to convert this content into a table.'); }
  }

  async function attachStatisticsChart(prompt: string, submittedFiles: FileReference[]) {
    const selectedTable = [...messages].reverse().find((message) => message.table)?.table;
    const rebuildingLegacy = /\b(regenerate|rebuild|legacy dataset)\b/i.test(prompt) && (!selectedTable?.dataset_id || /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(selectedTable.dataset_id));
    const originalSource = rebuildingLegacy ? [...messages].reverse().find((message) => message.role === 'user' && /\d/.test(message.content)) : undefined;
    const analyticsPrompt = originalSource ? `${prompt}\n\nOriginal user-provided source data:\n${originalSource.content}` : prompt;
    const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/dorje-ai/analytics/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authorizationHeaders() }, body: JSON.stringify({ message: analyticsPrompt, conversation_id: conversationId, source_message_id: `${conversationId}-message-${messages.length}`, files: submittedFiles, dataset: submittedFiles.length || rebuildingLegacy ? null : selectedTable || null }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Chart could not be generated because the selected data does not match the user-provided dataset.');
    const table = { ...data.dataset, chart_asset: data.chart } as StructuredTableData;
    setMessages((current) => { const updated = [...current]; const last = updated.length - 1; if (updated[last]?.role === 'assistant') updated[last] = { ...updated[last], table, chartOpen: true }; return updated; });
  }

  async function generateImage(prompt: string, next: Message[], submittedFiles: FileReference[]) {
    setMessages(next); setInput(''); setLoading(true); setError(''); setImageStatus('Preparing your image frame…');
    try {
      const dimensions = imageDimensions(prompt);
      const created = await authenticatedFetch(`${API_BASE_URL}/api/v1/dorje-ai/image/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authorizationHeaders() }, body: JSON.stringify({ message: prompt, context, history: next.slice(-6), files: submittedFiles, image_preferences: imagePreferences, image_model: 'tiny-sd', image_width: dimensions.width, image_height: dimensions.height }) }); const job = await created.json();
      if (created.status === 401) throw new Error('Your session expired. Please sign in again.'); if (!created.ok) { if (job.upgrade_required) openUpgradePrompt({ title: 'Upgrade required', reason: job.detail || job.message || job.reason || `${job.capability || 'This feature'} is available in Paid Tier`, requiredTier: job.required_tier, capability: job.capability }); throw new Error(job.detail || job.message || job.reason || `${job.capability || 'This feature'} requires ${job.required_tier || 'a higher'} tier.`); }
      const imageModelLabel = 'Image specialist';
      setMessages([...next, { role: 'assistant', content: 'Creating your image from the enhanced prompt…', enhancedPrompt: job.enhanced_prompt, originalPrompt: prompt, model: imageModelLabel }]);
      let status = 'queued';
      for (let attempt = 0; attempt < 300; attempt += 1) { await new Promise((resolve) => window.setTimeout(resolve, 2000)); const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/dorje-ai/image/jobs/${job.job_id}`, { headers: authorizationHeaders() }); const data = await response.json(); if (!response.ok) throw new Error(data.detail || 'Unable to check image status.'); status = data.status; setImageStatus(status === 'loading_model' ? 'Loading the image specialist…' : status === 'generating' ? `Building ${job.width}×${job.height} pixels and refining details…` : 'Your image is queued…'); if (status === 'failed') throw new Error(data.error || 'Image generation failed.'); if (status === 'complete') break; }
      if (status !== 'complete') throw new Error('Image generation timed out.');
      const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/dorje-ai/image/jobs/${job.job_id}/content`, { headers: authorizationHeaders() }); if (!response.ok) throw new Error('Unable to retrieve image.'); const blob = await response.blob(); if (!blob.type.startsWith('image/png')) throw new Error(`Expected PNG but received ${blob.type || 'unknown content'}.`); const generatedImageUrl = await blobToDataUrl(blob);
      setMessages((current) => { const updated = [...current]; const last = updated.length - 1; if (updated[last]?.role === 'assistant' && updated[last].originalPrompt === prompt) updated[last] = { ...updated[last], content: 'Here is your generated image.', imageUrl: generatedImageUrl }; else updated.push({ role: 'assistant', content: 'Here is your generated image.', imageUrl: generatedImageUrl, enhancedPrompt: job.enhanced_prompt, originalPrompt: prompt, model: imageModelLabel }); return updated; }); setImageStatus('');
    } catch (err) { setImageStatus(''); setError(err instanceof Error ? err.message : 'Unable to generate image.'); } finally { setLoading(false); }
  }

  async function submitPrompt(prompt: string, baseMessages: Message[] = messages, versions?: string[], useComposerFiles = true) {
    const submittedFiles = useComposerFiles ? [...files] : [];
    const cleanPrompt = prompt.trim() || (submittedFiles.length ? 'Analyze the attached files and identify the most useful next action.' : ''); if (!cleanPrompt || loading) return;
    if (isEmailActionRequest(cleanPrompt) && (generatedDocument || activeWorkspaceFile || submittedFiles.length)) {
      const attachment = generatedDocument || activeWorkspaceFile?.attachment;
      openInlineEmail({
        content: activeWorkspaceFile?.body || generatedDocument?.body || cleanPrompt,
        attachments: attachment ? [attachment] : [],
      });
      const assistantMessage = attachment
        ? `I opened the email composer here in Workspace AI with ${attachment.filename} attached. Review the recipient, subject, body, and attachment before sending.`
        : 'I opened the email composer here in Workspace AI. Draft the message here; sending still requires your confirmation.';
      setMessages([...baseMessages, { role: 'user' as const, content: cleanPrompt, versions, attachments: submittedFiles.map(({ name, type }) => ({ name, type })) }, { role: 'assistant' as const, content: assistantMessage, model: 'Workspace AI Action Router' }]);
      setInput('');
      if (useComposerFiles) setFiles([]);
      return;
    }
    const requiredConnector = detectRequiredConnector(cleanPrompt);
    if (requiredConnector) {
      const connected = await connectorConnected(requiredConnector.provider);
      if (!connected) {
        setConnectorPrompt(requiredConnector);
        setInput(cleanPrompt);
        setError('');
        onNotice(`${requiredConnector.name} needs to be connected before DorjeAI can ${requiredConnector.action}.`);
        return;
      }
    }
    if (chatTitle === 'New conversation') setChatTitle(cleanPrompt.slice(0, 48));
    setSuggestions([]); setSuggestionGreeting(''); setSelectedSuggestionId('');
    const linkedNames = new Set(baseMessages.flatMap((message) => message.attachments || []).map((attachment) => attachment.name));
    const attachments = submittedFiles.filter((file) => !linkedNames.has(file.name)).map(({ name, type }) => ({ name, type }));
    const next = [...baseMessages, { role: 'user' as const, content: cleanPrompt, versions, attachments }];
    setInput('');
    if (useComposerFiles) setFiles([]);
    if (isImageRequest(cleanPrompt)) { await generateImage(cleanPrompt, next, submittedFiles); return; }
    const workspaceKind = requestedWorkspaceKind(cleanPrompt, submittedFiles);
    setMessages([...next, { role: 'assistant', content: '', model: 'DorjeAI Orchestrator' }]); setInput(''); setLoading(true); setError(''); setImageStatus('');
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const documentRequest = workspaceKind === 'document';
      const workspaceInstruction = workspaceKind && workspaceKind !== 'document'
        ? `\nWorkspace file workflow: produce clean ${workspaceKind} content as a preview. Do not claim a provider file was saved unless the connector confirms it. Include sections for structure, editable content, validation notes, and next actions.`
        : '';
      const documentInstruction = documentRequest ? '\nDocument workflow: first create a concise layout plan, then produce clean final document content suitable for writing into a DOCX file. Do not mention hidden planning. Use clear headings, sections, and professional formatting cues.' : '';
      const instruction = `${modeInstructions[mode]}${documentInstruction}${workspaceInstruction}`;
      const messageForBackend = mode === 'Deep Analysis' ? cleanPrompt : `${instruction}\n\n${cleanPrompt}`;
      const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/dorje-ai/chat`, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', ...authorizationHeaders() }, body: JSON.stringify({ message: messageForBackend, mode, conversation_id: conversationId, context, history: next.slice(-6), files: submittedFiles }) });
      const reply = await readTextStream(response, (chunk) => setMessages((current) => { const updated = [...current]; const last = updated.length - 1; updated[last] = { ...updated[last], content: updated[last].content + chunk }; return updated; })); if (!reply) throw new Error('DorjeAI returned an empty response.');
      if (mode === 'Statistics Mode') await attachStatisticsChart(cleanPrompt, submittedFiles);
      if (documentRequest) await createDocumentArtifact(cleanPrompt, reply);
      if (workspaceKind && workspaceKind !== 'document') setActiveWorkspaceFile(createWorkspaceFile(workspaceKind, cleanPrompt, reply));
    } catch (err) { if (err instanceof DOMException && err.name === 'AbortError') setError('Generation stopped. You can edit the prompt or try again.'); else setError(err instanceof Error ? err.message : 'DorjeAI could not respond.'); }
    finally { abortRef.current = null; setLoading(false); }
  }
  async function send(event: FormEvent) { event.preventDefault(); await submitPrompt(input); }
  function stopGeneration() { abortRef.current?.abort(); }

  async function generateCedaSuggestions(sourceFiles: FileReference[] = files, message: string = input) {
    setSuggestionsLoading(true);
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/suggestions/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authorizationHeaders() },
        body: JSON.stringify({ surface: 'dorje_workspace', workspace_id: 'workspace-ai', conversation_id: conversationId, current_message: message || null, files: sourceFiles, maximum_suggestions: 3 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Unable to generate CEDA suggestions.');
      setSuggestionGreeting(data.greeting || 'Choose a next step.');
      setSuggestions(data.suggestions || []);
    } catch {
      setSuggestionGreeting('');
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }

  async function dismissSuggestion(suggestion: CedaSuggestion) {
    setSuggestions((current) => current.filter((item) => item.id !== suggestion.id));
    try {
      await authenticatedFetch(`${API_BASE_URL}/api/v1/suggestions/${suggestion.id}/dismiss`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authorizationHeaders() }, body: JSON.stringify({ reason: 'dismissed_from_dorje_workspace' }) });
    } catch {}
  }

  function detectRequiredConnector(prompt: string): ConnectorPromptState | null {
    const explicitEmailSend = /\b(send|forward|reply)\b.{0,100}\b(email|mail|gmail|outlook|recipient|attachment|attach|file)\b/i.test(prompt)
      || /\b(email|mail)\b.{0,80}\b(to|via gmail|using gmail|from gmail|through gmail|with attachment|and send)\b/i.test(prompt)
      || /\battach\b.{0,80}\b(email|mail|gmail|outlook)\b.{0,80}\bsend\b/i.test(prompt);
    if (explicitEmailSend) return { provider: 'gmail', name: 'Gmail', reason: 'Email sending and attachments require an authorized email connector.', action: 'send email or attach files', tab: 'Email' };
    if (/\b(calendar|calender|schedule|event|meeting).{0,80}\b(sync|create|add|invite|book)\b/i.test(prompt) || /\b(add|create|book|schedule).{0,80}\b(calendar|calender|meeting|event)\b/i.test(prompt)) return { provider: 'google-calendar', name: 'Google Calendar', reason: 'Calendar events require an authorized calendar connector.', action: 'create calendar events', tab: 'Connectors' };
    if (/\b(drive|google drive|onedrive|icloud|sharepoint|notion).{0,80}\b(save|upload|sync|open|read|write|attach|import)\b/i.test(prompt)) return { provider: /\bsharepoint\b/i.test(prompt) ? 'sharepoint' : /\bnotion\b/i.test(prompt) ? 'notion' : /\bonedrive\b/i.test(prompt) ? 'onedrive' : /\bicloud\b/i.test(prompt) ? 'apple-drive' : 'google-drive', name: /\bsharepoint\b/i.test(prompt) ? 'SharePoint' : /\bnotion\b/i.test(prompt) ? 'Notion' : /\bonedrive\b/i.test(prompt) ? 'OneDrive' : /\bicloud\b/i.test(prompt) ? 'iCloud Drive' : 'Google Drive', reason: 'External file storage requires a connected storage provider.', action: 'use external files', tab: 'Connectors' };
    if (/\b(word|docx|document).{0,80}\b(microsoft|onedrive|office|online|cloud)\b/i.test(prompt)) return { provider: 'microsoft-word', name: 'Microsoft Word', reason: 'Cloud Word editing requires Microsoft authorization. Local DOCX generation can still be done from Email Studio.', action: 'edit Microsoft Word files', tab: 'Connectors' };
    return null;
  }

  async function connectorConnected(provider: string) {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/connectors`, { headers: authorizationHeaders() });
      const items = await response.json() as Array<{ provider: string; status: string }>;
      return response.ok && items.some((item) => item.provider === provider && item.status === 'connected');
    } catch {
      return false;
    }
  }

  async function connectFromChat(prompt: ConnectorPromptState) {
    setConnectorBusy(true);
    try {
      if (prompt.provider === 'gmail' || prompt.provider === 'google-calendar' || prompt.provider === 'google-drive' || prompt.provider === 'google-docs' || prompt.provider === 'google-sheets') {
        const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/connectors/google/${prompt.provider}/connect`, { headers: authorizationHeaders() });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || `Unable to start ${prompt.name} authorization.`);
        window.location.assign(data.authorization_url);
        return;
      }
      window.sessionStorage.setItem('dorje_pending_connector', JSON.stringify(prompt));
      window.location.assign('/student-lad/connectors');
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to connect ${prompt.name}.`);
    } finally {
      setConnectorBusy(false);
    }
  }

  function stageConnectorReference(provider: string, name: string, reference: string) {
    const cleanReference = reference.trim();
    if (!cleanReference) return;
    const safeName = `${name} reference`;
    const content = [
      `Cloud source: ${name}`,
      `Provider: ${provider}`,
      `Reference: ${cleanReference}`,
      'Authorization: connected or requested through Connectors',
      'Instruction: Treat this as a user-approved external file/folder reference. Retrieve contents through the connector when provider file browsing is available; otherwise ask the user to paste or upload the exact file content.',
    ].join('\n');
    setFiles((current) => [...current, { name: safeName, type: 'text/uri-list', content, source_label: `${name} connector` }]);
    onNotice(`${name} reference added to the composer.`);
  }

  async function addCloudSource(provider: string, name: string) {
    setSourcePickerOpen(false);
    const connected = await connectorConnected(provider);
    if (!connected) {
      setConnectorPrompt({ provider, name, reason: `${name} must be connected before DorjeAI can browse or use files from it.`, action: 'attach external files', tab: 'Connectors' });
      onNotice(`${name} needs authorization before files can be added from that source.`);
      return;
    }
    if (provider === 'google-docs') {
      await createGoogleDocTarget();
      return;
    }
    if (provider === 'google-drive' || provider === 'google-sheets') {
      await openCloudBrowser(provider, name);
      return;
    }
    setCloudBrowser({ provider, name, folderId: 'root', query: '', files: [], loading: false, error: `${name} is connected, but directory browsing for this connector is not activated yet. Use a shared reference for now.`, path: [{ id: 'root', name }] });
  }

  async function createGoogleDocTarget() {
    const defaultTitle = generatedDocument?.filename.replace(/\.docx$/i, '').replaceAll('-', ' ') || (chatTitle !== 'New conversation' ? chatTitle : 'DorjeAI Document');
    const promptedTitle = window.prompt('Create a new Google Docs document named:', defaultTitle);
    if (promptedTitle === null) return;
    const title = promptedTitle.trim() || defaultTitle;
    setError('');
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/connectors/google-docs/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authorizationHeaders() },
        body: JSON.stringify({ title, body: generatedDocument?.body || '' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Google Docs could not create a new document.');
      const reference = data.web_view_link || `https://docs.google.com/document/d/${data.document_id}/edit`;
      setFiles((current) => [...current, {
        name: `${data.title || title}.gdoc`,
        type: 'application/vnd.google-apps.document',
        content: [
          `Google Docs document: ${data.title || title}`,
          `Document ID: ${data.document_id}`,
          `Link: ${reference}`,
          'Instruction: This is a user-created Google Docs authoring target. Use it as the destination for requested document writing, rewriting, appending, review, export, or email handoff workflows.',
        ].join('\n'),
        stored_name: `google-docs:${data.document_id}`,
        source_label: 'Google Docs',
      }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Docs could not create a new document.');
    }
  }

  async function openCloudBrowser(provider: string, name: string, folderId = 'root', path: { id: string; name: string }[] = [{ id: 'root', name }], query = '') {
    setCloudBrowser({ provider, name, folderId, query, files: [], loading: true, error: '', path });
    try {
      const params = new URLSearchParams({ folder_id: folderId, q: query });
      const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/connectors/${provider}/files?${params.toString()}`, { headers: authorizationHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || `Unable to browse ${name}.`);
      setCloudBrowser({ provider, name, folderId, query, files: data.files || [], loading: false, error: '', path });
    } catch (err) {
      setCloudBrowser({ provider, name, folderId, query, files: [], loading: false, error: err instanceof Error ? err.message : `Unable to browse ${name}.`, path });
    }
  }

  async function importCloudFile(file: ConnectorFile) {
    if (!cloudBrowser || file.is_folder) return;
    setCloudBrowser((current) => current ? { ...current, loading: true, error: '' } : current);
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/connectors/${cloudBrowser.provider}/files/${encodeURIComponent(file.id)}/import`, { method: 'POST', headers: authorizationHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || `Unable to import ${file.name}.`);
      setFiles((current) => [...current, { name: data.name || file.name, type: data.type || file.mime_type, content: data.content || '', stored_name: data.stored_name || `${cloudBrowser.provider}:${file.id}`, source_label: data.source_label || cloudBrowser.name }]);
      setCloudBrowser(null);
      onNotice(`${file.name} added from ${cloudBrowser.name}.`);
    } catch (err) {
      setCloudBrowser((current) => current ? { ...current, loading: false, error: err instanceof Error ? err.message : `Unable to import ${file.name}.` } : current);
    }
  }

  function addPastedTextFile() {
    setSourcePickerOpen(false);
    const content = window.prompt('Paste the text you want to add as a .txt file in this chat.')?.trim();
    if (!content) return;
    setFiles((current) => [...current, { name: `pasted-text-${Date.now()}.txt`, type: 'text/plain', content, source_label: 'Pasted text' }]);
    onNotice('Pasted text added as a text file in the composer.');
  }

  function insertComposerText(text: string) {
    const composer = composerRef.current;
    const start = composer?.selectionStart ?? input.length;
    const end = composer?.selectionEnd ?? input.length;
    const next = `${input.slice(0, start)}${text}${input.slice(end)}`;
    setInput(next);
    window.setTimeout(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  }

  function handleComposerPaste(event: ReactClipboardEvent<HTMLTextAreaElement>) {
    const clipboardFiles = Array.from(event.clipboardData.files);
    if (clipboardFiles.length) {
      clipboardFiles.forEach((file) => void upload(file));
      return;
    }
    const text = event.clipboardData.getData('text/plain');
    const table = normalizeTablePaste(text);
    if (!table) return;
    event.preventDefault();
    insertComposerText(table);
    onNotice('Pasted table converted to composer table format.');
  }

  async function transcribeRecording(blob: Blob) {
    setTranscribing(true); setError('');
    try {
      const body = new FormData(); body.append('file', blob, 'dorje-voice.webm');
      const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/dorje-ai/transcribe`, { method: 'POST', headers: authorizationHeaders(), body });
      const data = await response.json(); if (!response.ok) throw new Error(data.detail || 'Voice transcription failed.');
      setInput((current) => `${current}${current.trim() ? ' ' : ''}${data.transcript}`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Voice transcription failed.'); }
    finally { setTranscribing(false); }
  }

  async function toggleRecording() {
    if (recording) { mediaRecorderRef.current?.stop(); setRecording(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream); audioChunksRef.current = []; mediaStreamRef.current = stream; mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) audioChunksRef.current.push(event.data); };
      recorder.onstop = () => { const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' }); mediaStreamRef.current?.getTracks().forEach((track) => track.stop()); mediaStreamRef.current = null; void transcribeRecording(blob); };
      recorder.start(); setRecording(true);
    } catch { setError('Microphone access was unavailable. Check browser permissions and try again.'); }
  }
  function editMessage(index: number, revisedContent?: string) { const current = messages[index]; const revised = revisedContent?.trim(); if (!revised || revised === current.content) return; const versions = [...(current.versions || []), current.content]; void submitPrompt(revised, messages.slice(0, index), versions, false); }
  function regenerateFrom(index: number) { let userIndex = -1; for (let messageIndex = index - 1; messageIndex >= 0; messageIndex -= 1) { if (messages[messageIndex].role === 'user') { userIndex = messageIndex; break; } } if (userIndex < 0) return; void submitPrompt(messages[userIndex].content, messages.slice(0, userIndex), messages[userIndex].versions, false); }

  async function upload(file: File) {
    const body = new FormData(); body.append('file', file); body.append('conversation_id', conversationId); body.append('chat_title', chatTitle); setError(''); setUploading(true);
    try { const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/dorje-ai/upload`, { method: 'POST', headers: authorizationHeaders(), body }); const data = await response.json(); if (!response.ok) { if (data.upgrade_required) openUpgradePrompt({ title: 'Upgrade for larger files', reason: data.detail || data.reason || 'Large document processing is available in Paid Tier.', requiredTier: data.required_tier, capability: data.capability || 'large_documents' }); throw new Error(data.detail || data.reason || 'Upload failed.'); } if (!data.content && !file.type.startsWith('image/')) throw new Error('No readable content was extracted from this file.'); const nextFile = { name: data.filename || file.name, type: data.content_type || file.type, content: data.content || '', stored_name: data.stored_name || data.filename, source_label: data.source_label || 'Uploaded from this device' }; const nextFiles = [...files, nextFile]; setFiles(nextFiles); void generateCedaSuggestions(nextFiles, input); }
    catch (err) { setError(err instanceof Error ? err.message : 'Upload failed.'); } finally { setUploading(false); }
  }
  async function captureScreen() { try { const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }); const video = document.createElement('video'); video.srcObject = stream; await video.play(); await new Promise((resolve) => window.setTimeout(resolve, 250)); const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext('2d')?.drawImage(video, 0, 0); stream.getTracks().forEach((track) => track.stop()); const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png')); if (!blob) throw new Error('Unable to capture the screen.'); await upload(new File([blob], `screen-capture-${Date.now()}.png`, { type: 'image/png' })); onNotice('Screen capture added to this chat.'); } catch (err) { if (err instanceof DOMException && err.name === 'NotAllowedError') return; setError(err instanceof Error ? err.message : 'Screen capture failed.'); } }
  function renameFile(index: number) { const file = files[index]; const name = window.prompt('Rename this file in the chat workspace.', file.name)?.trim(); if (name) setFiles((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name } : item)); }
  function renameChat() { const title = window.prompt('Rename this chat and its workspace.', chatTitle)?.trim(); if (title) setChatTitle(title.slice(0, 80)); }
  function resizeRightPanel(width: number) { setRightPanelWidth(Math.min(480, Math.max(240, width))); }
  function beginRightResize(event: ReactPointerEvent<HTMLButtonElement>) { rightResizeRef.current = { startX: event.clientX, startWidth: rightPanelWidth }; event.currentTarget.setPointerCapture(event.pointerId); }
  function moveRightResize(event: ReactPointerEvent<HTMLButtonElement>) { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; resizeRightPanel(rightResizeRef.current.startWidth - (event.clientX - rightResizeRef.current.startX)); }
  function finishRightResize(event: ReactPointerEvent<HTMLButtonElement>) { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); window.localStorage.setItem('dorje_right_panel_width', String(rightPanelWidth)); }
  async function shareChat() { const text = messages.map((message) => `${message.role === 'user' ? 'You' : 'Dorje AI'}: ${message.content}`).join('\n\n'); if (navigator.share) await navigator.share({ title: chatTitle, text }); else { await navigator.clipboard.writeText(text); onNotice('Chat copied to the clipboard for sharing.'); } }
  function duplicateChat() { const history = saveChatConversation({ id: crypto.randomUUID(), title: `${chatTitle} copy`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages }); onHistorySaved?.(history); onNotice('A copy of this conversation was added to Chat History.'); }
  function imageVariation(originalPrompt: string, enhancedPrompt: string, action: string) {
    let request = `${originalPrompt}. ${action}.`;
    if (action === 'Edit prompt') { const edited = window.prompt('Edit the enhanced prompt before regenerating.', enhancedPrompt)?.trim(); if (!edited) return; request = `Generate an image using this exact creative direction: ${edited}`; }
    const preferenceMap: Record<string, string> = { 'More realistic': 'Photorealistic', 'More artistic': 'Artistic', 'More cinematic': 'Cinematic', 'More colorful': 'Colorful', 'Luxury style': 'Luxury style', 'Minimal style': 'Minimal style', 'Fantasy style': 'Fantasy style', 'Product photography': 'Product photography' };
    const preference = preferenceMap[action];
    if (preference) { const updated = Array.from(new Set([...imagePreferences, preference])).slice(-10); setImagePreferences(updated); window.localStorage.setItem('dorje_image_preferences', JSON.stringify(updated)); }
    void submitPrompt(request);
  }
  function openUpgradePrompt(prompt: UpgradePrompt) { setUpgradePrompt(prompt); }
  const visibleMessages = searchQuery.trim() ? messages.filter((message) => message.content.toLowerCase().includes(searchQuery.toLowerCase())) : messages;
  const generatedAssets = messages.filter((message) => message.imageUrl || message.table).length;
  const estimatedTokens = Math.ceil(messages.reduce((total, message) => total + message.content.length, 0) / 4);
  const linkedAttachments = Array.from(new Map([...messages.flatMap((message) => message.attachments || []), ...files.map(({ name, type }) => ({ name, type }))].map((file) => [file.name, file])).values());
  const activeModel = 'Automatic specialist routing';
  const imageCount = messages.filter((message) => message.imageUrl).length; const tableCount = messages.filter((message) => message.table).length; const chartCount = messages.filter((message) => message.chartOpen).length;
  const versionCount = messages.reduce((total, message) => total + (message.versions?.length || 0), 0);
  const rightPanelExpanded = showInspector || rightPanelPinned || rightPanelHovered; const displayedRightWidth = rightPanelExpanded ? rightPanelWidth : 56;

  return (
    <section className="dorje-chat dorje-chat-grid relative grid h-full min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-[64px_minmax(0,1fr)_auto] bg-slate-950/60" style={{ '--dorje-right-width': `${displayedRightWidth}px` } as CSSProperties}>
      <div className="contents">
        <header className="dorje-topbar col-start-1 row-start-1 z-[70] flex h-16 items-center justify-end gap-3 overflow-x-auto overflow-y-visible border-b border-slate-800 px-3 sm:px-5 xl:col-span-2">
          <div className="flex flex-wrap items-center gap-2">{searchOpen ? <label className="relative"><Search size={15} className="absolute left-3 top-2.5 text-slate-500" /><input ref={searchRef} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search current workspace" className="w-48 rounded-xl border border-slate-700 bg-slate-900 py-2 pl-9 pr-8 text-xs text-white outline-none focus:border-emerald-400" /><button type="button" onClick={() => { setSearchOpen(false); setSearchQuery(''); }} className="absolute right-2 top-2 text-slate-500"><X size={15} /></button></label> : <button type="button" onClick={() => { setSearchOpen(true); window.setTimeout(() => searchRef.current?.focus(), 0); }} className="icon-control" title="Search workspace (⌘K)"><Search size={17} /></button>}<span className="hidden items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200 sm:inline-flex"><Sparkles size={14} />Automatic orchestration</span>{studentEdition ? <button type="button" onClick={() => { setPersistConversation(true); onNotice('This conversation is now explicitly saved. CEDA still stores only separately approved context instructions.'); }} disabled={persistConversation} className="rounded-xl border border-slate-700 px-2.5 py-2 text-[10px] text-slate-300 disabled:border-emerald-400/20 disabled:text-emerald-300">{persistConversation ? 'Chat saved' : 'Save chat'}</button> : null}<ModelModeSelector value={mode} onChange={setMode} /><button type="button" onClick={() => setShowInspector((value) => !value)} className="icon-control xl:hidden" title="Context panel"><FolderOpen size={17} /></button><button type="button" onClick={() => onNotice('Local workspace storage is at 18%. Cloud synchronization is available through Connectors.')} className="hidden items-center gap-1.5 rounded-xl border border-slate-800 px-2.5 py-2 text-[10px] text-slate-500 xl:flex" title="Local workspace storage"><HardDrive size={14} />18%</button><ThemeControl compact /><button type="button" onClick={() => onNotice('No new notifications. Export, connector, error and update notices will appear here.')} className="icon-control" title="Notifications"><Bell size={17} /></button><button type="button" onClick={() => onNotice('Profile, subscription, storage, workspace, API keys and billing controls are managed from the secure account area.')} className="icon-control rounded-full" title="User menu"><UserRound size={17} /></button></div>
        </header>
        {recording || transcribing ? <div role="status" aria-live="polite" className="absolute right-4 top-20 z-30 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-slate-950/95 px-3 py-2 text-xs font-medium text-emerald-200 shadow-xl backdrop-blur xl:right-[calc(var(--dorje-right-width)+1rem)]"><span className={`h-2.5 w-2.5 rounded-full ${recording ? 'animate-pulse bg-rose-400' : 'animate-pulse bg-amber-300'}`} />{recording ? 'Listening…' : 'Transcribing…'}</div> : null}
        {upgradePrompt ? <div className="fixed left-1/2 top-24 z-[10000] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 rounded-3xl border border-amber-300/30 bg-slate-950/98 p-5 text-slate-100 shadow-2xl shadow-amber-950/40 backdrop-blur" role="dialog" aria-modal="true" aria-labelledby="dorje-upgrade-title"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-lg text-slate-950">★</span><div className="min-w-0 flex-1"><h2 id="dorje-upgrade-title" className="text-base font-semibold text-white">{upgradePrompt.title}</h2><p className="mt-1 text-sm leading-6 text-slate-300">{upgradePrompt.reason}</p><p className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">Temporary upgrade bypass is active for larger document uploads and image generation tests.</p></div><button type="button" onClick={() => setUpgradePrompt(null)} className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300" aria-label="Close upgrade prompt">×</button></div><div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setUpgradePrompt(null)} className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300">Not now</button><button type="button" onClick={() => { setUpgradePrompt(null); onNotice('Temporary upgrade bypass is enabled. Try the action again.'); }} className="rounded-xl bg-amber-400 px-3 py-2 text-xs font-semibold text-slate-950">Use upgrade bypass now</button></div></div> : null}
        {connectorPrompt ? <div className="absolute left-1/2 top-20 z-40 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-3xl border border-emerald-400/20 bg-slate-950/95 p-4 text-slate-100 shadow-2xl shadow-emerald-950/30 backdrop-blur" role="dialog" aria-modal="true" aria-labelledby="dorje-connector-prompt-title"><div className="flex items-start gap-3"><BrandIcon provider={connectorPrompt.provider} /><div className="min-w-0 flex-1"><h2 id="dorje-connector-prompt-title" className="text-sm font-semibold text-white">Connect {connectorPrompt.name}</h2><p className="mt-1 text-xs leading-5 text-slate-400">{connectorPrompt.reason}</p><p className="mt-2 rounded-xl border border-slate-800 bg-slate-900/80 p-2 text-[11px] leading-5 text-slate-500">DorjeAI will only use this connector after your authorization. External sends, file writes, and calendar changes still require confirmation.</p></div><button type="button" onClick={() => setConnectorPrompt(null)} className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300" aria-label="Close connector prompt">×</button></div><div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setConnectorPrompt(null)} className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300">Not now</button><button type="button" disabled={connectorBusy} onClick={() => void connectFromChat(connectorPrompt)} className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">{connectorBusy ? 'Preparing…' : `Authorize ${connectorPrompt.name}`}</button></div></div> : null}
        {cloudBrowser ? <div className="absolute inset-x-3 top-20 z-50 mx-auto flex max-h-[min(42rem,calc(100vh-7rem))] w-[min(44rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-950/98 text-slate-100 shadow-2xl shadow-emerald-950/30 backdrop-blur" role="dialog" aria-modal="true" aria-label={`${cloudBrowser.name} file browser`}><div className="flex items-start justify-between gap-3 border-b border-slate-800 p-4"><div className="min-w-0"><p className="flex items-center gap-2 text-sm font-semibold text-white"><BrandIcon provider={cloudBrowser.provider} className="h-6 w-6" />Browse {cloudBrowser.name}</p><p className="mt-1 truncate text-xs text-slate-500">{cloudBrowser.path.map((item) => item.name).join(' / ')}</p></div><button type="button" onClick={() => setCloudBrowser(null)} className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300" aria-label="Close file browser">×</button></div><div className="border-b border-slate-800 p-3"><label className="relative block"><Search size={14} className="absolute left-3 top-2.5 text-slate-500" /><input value={cloudBrowser.query} onChange={(event) => setCloudBrowser((current) => current ? { ...current, query: event.target.value } : current)} onKeyDown={(event) => { if (event.key === 'Enter') void openCloudBrowser(cloudBrowser.provider, cloudBrowser.name, cloudBrowser.folderId, cloudBrowser.path, cloudBrowser.query); }} placeholder={`Search ${cloudBrowser.name}`} className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2 pl-9 pr-24 text-xs text-white outline-none focus:border-emerald-400" /><button type="button" onClick={() => void openCloudBrowser(cloudBrowser.provider, cloudBrowser.name, cloudBrowser.folderId, cloudBrowser.path, cloudBrowser.query)} className="absolute right-1.5 top-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-[11px] font-semibold text-slate-950">Search</button></label></div>{cloudBrowser.error ? <div className="m-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100"><p>{cloudBrowser.error}</p><button type="button" onClick={() => { const reference = window.prompt(`Paste the ${cloudBrowser.name} file/folder link, shared URL, or document ID.`)?.trim(); if (reference) { stageConnectorReference(cloudBrowser.provider, cloudBrowser.name, reference); setCloudBrowser(null); } }} className="mt-2 rounded-lg border border-amber-300/30 px-2 py-1 text-[11px] font-semibold text-amber-100">Add shared reference instead</button></div> : null}<div className="min-h-0 flex-1 overflow-y-auto p-3">{cloudBrowser.loading ? <p className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">Loading files…</p> : cloudBrowser.files.length ? <div className="divide-y divide-slate-800 overflow-hidden rounded-2xl border border-slate-800">{cloudBrowser.files.map((file) => <button key={file.id} type="button" onClick={() => file.is_folder ? void openCloudBrowser(cloudBrowser.provider, cloudBrowser.name, file.id, [...cloudBrowser.path, { id: file.id, name: file.name }], '') : void importCloudFile(file)} className="flex w-full items-center gap-3 bg-slate-900/70 px-3 py-3 text-left text-xs transition hover:bg-slate-800"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-base">{file.is_folder ? '📁' : file.mime_type.includes('spreadsheet') || file.name.endsWith('.xlsx') ? '📊' : file.mime_type.includes('pdf') || file.name.endsWith('.pdf') ? '📄' : file.mime_type.startsWith('image/') ? '🖼️' : '📝'}</span><span className="min-w-0 flex-1"><strong className="block truncate text-slate-100">{file.name}</strong><small className="block truncate text-slate-500">{file.is_folder ? 'Folder' : file.mime_type}{file.modified_time ? ` · ${new Date(file.modified_time).toLocaleDateString()}` : ''}</small></span><span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] text-slate-400">{file.is_folder ? 'Open' : 'Add'}</span></button>)}</div> : <p className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">No files found here.</p>}</div></div> : null}
        {activeWorkspaceFile ? <WorkspaceFileDrawer file={activeWorkspaceFile} onClose={() => { setActiveWorkspaceFile(null); setGeneratedDocument(null); }} onUndo={() => setActiveWorkspaceFile((current) => current && current.versions.length ? { ...current, body: current.versions[current.versions.length - 1], versions: current.versions.slice(0, -1), version: current.version + 1, status: 'Undo applied', updated_at: new Date().toISOString() } : current)} onDownload={() => activeWorkspaceFile.attachment ? downloadAttachment(activeWorkspaceFile.attachment) : onNotice('Download/export for this workspace type is prepared; create a concrete DOCX/PDF/XLSX/PPTX export before downloading.')} onExportPdf={() => generatedDocument ? void exportDocumentPdf(generatedDocument) : onNotice('PDF export is available after a concrete document artifact is generated.')} onRewrite={() => setInput(`Rewrite this ${activeWorkspaceFile.kind} with improvements:\n\n${activeWorkspaceFile.body}`)} onAppend={() => setInput(`Append to this ${activeWorkspaceFile.kind}:\n\n${activeWorkspaceFile.body}\n\nNew section: `)} onEmail={() => openInlineEmail({ content: activeWorkspaceFile.body, attachments: activeWorkspaceFile.attachment ? [activeWorkspaceFile.attachment] : [] })} /> : null}
        <main ref={messageListRef} className="col-start-1 row-start-2 min-h-0 space-y-5 overflow-y-auto overscroll-contain p-3 sm:p-5 lg:p-6" aria-label="DorjeAI conversation workspace">
          {messages.length === 0 ? <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center py-12 text-center"><Image src="/dorje-avatar.svg" alt="Dorje AI" width={64} height={64} className="h-16 w-16 rounded-2xl shadow-xl shadow-emerald-950" /><p className="mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Dorje AI — Your Secure AI Workspace</p><h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">What shall we build together?</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">One secure workspace for thinking, studying, working, organizing, creating, and growing.</p><div className="mt-6 grid w-full gap-2 sm:grid-cols-2">{['Summarize this PDF', 'Analyze this dataset', 'Build an AI roadmap', 'Create a chart from my data'].map((prompt) => <button key={prompt} type="button" onClick={() => setInput(prompt)} className="dorje-card rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-left text-sm text-slate-300 transition hover:-translate-y-0.5 hover:border-emerald-400/30">{prompt}</button>)}</div></div> : visibleMessages.map((message) => { const index = messages.indexOf(message); return <DorjeMessage key={`${message.role}-${index}`} {...message} onDelete={() => setMessages((current) => current.filter((_, messageIndex) => messageIndex !== index))} onConvertTable={() => void convertMessageToTable(index)} onEdit={(content) => editMessage(index, content)} onRegenerate={() => regenerateFrom(index)} onUseAsInput={(content) => setInput(content || message.content)} onFollowUp={(prompt) => setInput(`${prompt}:\n\n${message.content}`)} onImageVariation={(action) => imageVariation(message.originalPrompt || '', message.enhancedPrompt || '', action)} onSavePdf={() => void downloadChatPdf()} onCreateEmail={(payload) => openInlineEmail(payload)} onCreateSocial={onCreateSocial} />; })}
          {loading ? <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/10 bg-emerald-500/5 p-3"><Image src="/dorje-avatar.svg" alt="Dorje AI thinking" width={40} height={40} className="dorje-thinking h-10 w-10 rounded-xl" /><div><p className="text-sm text-emerald-100">{imageStatus || 'DorjeAI is orchestrating the workflow…'}</p><div className="mt-2 flex flex-wrap gap-1.5">{['Detecting intent', files.length ? 'Selecting context' : 'Planning workflow', 'Running specialists', 'Validating output', 'Composing result'].map((status) => <span key={status} className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] text-slate-400">{status}</span>)}</div></div></div> : null}
          {error ? <p className="rounded-xl border border-rose-400/10 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}<div ref={endRef} />
        </main>
        <div className="dorje-composer kamal-safe-composer col-start-1 row-start-3 border-t border-slate-800 bg-slate-950/95 p-3 sm:p-4 xl:col-span-2">
          {showContext ? <textarea value={context} onChange={(event) => onContextChange(event.target.value)} className="field mb-3 min-h-24" placeholder="Working context shared with Dorje AI" /> : null}
          {files.length ? <div className="mb-2 flex max-h-24 flex-wrap gap-2 overflow-y-auto">{files.map((file, index) => <span key={`${file.name}-${index}`} className="inline-flex items-center gap-1 rounded-full border border-sky-400/10 bg-sky-500/10 px-2.5 py-1 text-xs text-sky-200">📎 {file.name}<button type="button" onClick={() => renameFile(index)} title="Rename" className="opacity-60 hover:opacity-100">🏷️</button><button type="button" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} title="Remove" className="opacity-60 hover:opacity-100">×</button></span>)}</div> : null}
          {(suggestions.length || suggestionsLoading) ? <div className="mb-2"><CedaSuggestionButtons greeting={suggestionGreeting} suggestions={suggestions} loading={suggestionsLoading} selectedId={selectedSuggestionId} onCopyToComposer={(suggestion) => void copySuggestionToComposer(suggestion)} onDismiss={(suggestion) => void dismissSuggestion(suggestion)} /></div> : null}
          {sourcePickerOpen ? <SourcePluginPanel generatedDocument={generatedDocument} currentInput={input} onClose={() => setSourcePickerOpen(false)} onDevice={() => { setSourcePickerOpen(false); localFileInputRef.current?.click(); }} onPaste={addPastedTextFile} onCloud={(provider, name) => void addCloudSource(provider, name)} onEmail={() => { setSourcePickerOpen(false); openInlineEmail({ content: activeWorkspaceFile?.body || generatedDocument?.body || input || 'Draft an email from this Workspace AI conversation.', attachments: generatedDocument ? [generatedDocument] : activeWorkspaceFile?.attachment ? [activeWorkspaceFile.attachment] : [] }); }} onCloudInstruction={() => { setSourcePickerOpen(false); setInput((current) => current || 'Use the attached source to '); }} /> : null}
          <style jsx global>{`.dorje-composer [aria-label="Choose content source"]{display:none!important}`}</style>
          <form onSubmit={send} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); Array.from(event.dataTransfer.files).forEach((file) => void upload(file)); }} className={`relative rounded-2xl border bg-slate-900 p-2 shadow-xl transition focus-within:border-emerald-400/50 ${dragging ? 'border-emerald-400 ring-2 ring-emerald-400/15' : 'border-slate-700'}`}>{dragging ? <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-slate-950/90 text-sm font-medium text-emerald-300">Drop files into this workspace</div> : null}{sourcePickerOpen ? <div className="absolute bottom-16 left-2 z-30 w-[min(34rem,calc(100vw-2rem))] rounded-2xl border border-slate-700 bg-slate-950/98 p-3 text-slate-100 shadow-2xl shadow-emerald-950/30 backdrop-blur" role="dialog" aria-label="Choose content source"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-white">Add content source</p><p className="mt-1 text-xs text-slate-400">Upload readable files from this device or attach authenticated cloud references.</p></div><button type="button" onClick={() => setSourcePickerOpen(false)} className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300">×</button></div><div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"><button type="button" onClick={() => { setSourcePickerOpen(false); localFileInputRef.current?.click(); }} className="source-option"><HardDrive size={16} /><span><strong>Device files</strong><small>TXT, DOCX, XLSX, PDF, images</small></span></button><button type="button" onClick={addPastedTextFile} className="source-option"><FileText size={16} /><span><strong>Paste text file</strong><small>Add notes as .txt content</small></span></button><button type="button" onClick={() => void addCloudSource('google-drive', 'Google Drive')} className="source-option"><BrandIcon provider="google-drive" className="h-5 w-5" /><span><strong>Google Drive</strong><small>Docs, Sheets, PDFs, folders</small></span></button><button type="button" onClick={() => void addCloudSource('onedrive', 'OneDrive')} className="source-option"><BrandIcon provider="onedrive" className="h-5 w-5" /><span><strong>OneDrive</strong><small>Microsoft cloud files</small></span></button><button type="button" onClick={() => void addCloudSource('sharepoint', 'SharePoint')} className="source-option"><Database size={16} /><span><strong>SharePoint</strong><small>Team sites and libraries</small></span></button><button type="button" onClick={() => void addCloudSource('apple-drive', 'iCloud Drive')} className="source-option"><BrandIcon provider="apple-drive" className="h-5 w-5" /><span><strong>Apple / iCloud</strong><small>iCloud files after auth</small></span></button><button type="button" onClick={() => void addCloudSource('notion', 'Notion')} className="source-option"><Link2 size={16} /><span><strong>Notion</strong><small>Page or database reference</small></span></button><button type="button" onClick={() => { setSourcePickerOpen(false); setInput((current) => current || 'Use the attached source to '); }} className="source-option"><Cloud size={16} /><span><strong>Cloud instruction</strong><small>Tell DorjeAI what to fetch/use</small></span></button></div><p className="mt-3 rounded-xl border border-emerald-400/10 bg-emerald-500/5 p-2 text-[11px] leading-5 text-emerald-100/70">Connector files are used only after authorization. If a connector cannot browse files yet, DorjeAI stages the source reference and asks for exact content when needed.</p></div> : null}<input ref={localFileInputRef} type="file" multiple className="hidden" accept=".pdf,.docx,.txt,.md,.csv,.xlsx,.json,.py,.js,.ts,.tsx,.png,.jpg,.jpeg,.webp,.mp4,.wav,.mp3,.m4a,.ogg,.webm" onChange={(event) => { const selected = Array.from(event.target.files || []); selected.forEach((file) => void upload(file)); event.currentTarget.value = ''; }} /><textarea ref={composerRef} rows={2} value={input} onChange={(event) => setInput(event.target.value)} onPaste={handleComposerPaste} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} className="w-full resize-none bg-transparent px-2 py-2 text-sm text-white outline-none" placeholder="Ask, analyze, create, or drop files here…" /><div className="flex flex-wrap items-center gap-1 border-t border-slate-800 pt-2"><button type="button" className="composer-tool" title="Attach from device or connector" aria-label="Attach from device or connector" onClick={() => setSourcePickerOpen((value) => !value)}><Plus size={17} aria-hidden="true" /><span className="composer-tooltip">Attach from device or connector</span></button><ComposerTool icon={Grid3X3} label="Context" onClick={() => setShowContext((value) => !value)} /><ComposerTool icon={recording ? StopCircle : Mic} label={transcribing ? 'Transcribing' : recording ? 'Stop recording' : 'Voice'} active={recording} onClick={() => void toggleRecording()} /><ComposerTool icon={FileImage} label="Image" onClick={() => setInput('Generate an image of ')} /><ComposerTool icon={Table2} label="Table" onClick={() => setInput('Convert this into a structured table:\n')} /><ComposerTool icon={ChartNoAxesColumn} label="Chart" onClick={() => { setMode('Statistics Mode'); setInput('Create a chart from:\n'); }} /><ComposerTool icon={Sigma} label="Statistics" onClick={() => setMode('Statistics Mode')} /><ComposerTool icon={Code2} label="Code" onClick={() => setInput('Write production-ready code for ')} /><ComposerTool icon={SquarePen} label="Drawing" onClick={() => onNotice('Drawing canvas is prepared as a workspace extension. Attach a sketch or describe the diagram you need.')} /><label className="composer-tool" title="Camera" aria-label="Camera upload"><input type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ''; }} /><Camera size={16} aria-hidden="true" /><span className="composer-tooltip">Camera upload</span></label><ComposerTool icon={MonitorUp} label="Capture" onClick={() => void captureScreen()} /><span className="ml-auto text-[10px] text-slate-500 sm:text-xs">{uploading ? 'Uploading…' : `${input.length.toLocaleString()} chars`}</span>{loading ? <button type="button" onClick={stopGeneration} className="send-button bg-rose-500" title="Stop generation"><StopCircle size={17} /></button> : <button id="dorje-send-message" type="submit" disabled={(!input.trim() && !files.length) || uploading || transcribing} className="send-button" title="Send message (Enter)"><Send size={17} /></button>}</div></form>
          <p className="mt-2 text-center text-[10px] text-slate-600 sm:text-[11px]">Dorje AI may make mistakes. Review drafts before using them.</p>
        </div>
      </div>
      <aside onMouseEnter={() => setRightPanelHovered(true)} onMouseLeave={() => setRightPanelHovered(false)} onFocus={() => setRightPanelHovered(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setRightPanelHovered(false); }} className={`dorje-context dorje-context-panel ${showInspector ? 'fixed inset-x-3 bottom-3 top-24 z-40 flex' : 'hidden'} relative w-auto flex-col overflow-visible rounded-2xl border border-slate-800 bg-slate-950/98 shadow-2xl transition-[width] duration-200 xl:static xl:col-start-2 xl:row-start-2 xl:flex xl:rounded-none xl:border-y-0 xl:border-r-0`}>
        {rightPanelExpanded ? <button type="button" role="separator" aria-label="Resize right context panel" aria-orientation="vertical" aria-valuemin={240} aria-valuemax={480} aria-valuenow={rightPanelWidth} onPointerDown={beginRightResize} onPointerMove={moveRightResize} onPointerUp={finishRightResize} onPointerCancel={finishRightResize} onKeyDown={(event) => { if (event.key === 'ArrowLeft') resizeRightPanel(rightPanelWidth + 10); if (event.key === 'ArrowRight') resizeRightPanel(rightPanelWidth - 10); }} className="panel-resizer panel-resizer-left hidden xl:block" title="Drag to resize context panel" /> : null}
        {rightPanelExpanded ? <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 p-4"><div className="min-w-0"><p className="flex items-center gap-2 truncate text-sm font-semibold text-white"><SlidersHorizontal size={16} className="text-emerald-300" />Context &amp; Tools</p><button type="button" onClick={renameChat} className="mt-1 truncate text-left text-[10px] text-slate-500 hover:text-emerald-300">{chatTitle} · Rename</button></div><div className="flex items-center gap-1"><button type="button" aria-pressed={rightPanelPinned} onClick={() => { const next = !rightPanelPinned; setRightPanelPinned(next); window.localStorage.setItem('dorje_right_panel_pinned', String(next)); }} className="icon-control" title={rightPanelPinned ? 'Unpin and auto-hide panel' : 'Pin panel open'}>{rightPanelPinned ? <PinOff size={15} /> : <Pin size={15} />}</button><button type="button" onClick={() => setShowInspector(false)} className="icon-control xl:hidden"><X size={16} /></button></div></div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          <InspectorSection icon={Clock3} title="Current Chat" open>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs"><dt className="text-slate-500">Title</dt><dd className="truncate text-right text-slate-300">{chatTitle}</dd><dt className="text-slate-500">Created</dt><dd className="text-right text-slate-300">{new Date(createdAt).toLocaleString()}</dd><dt className="text-slate-500">Modified</dt><dd className="text-right text-slate-300">{messages.length ? 'Current session' : new Date(openedUpdatedAt).toLocaleString()}</dd><dt className="text-slate-500">Model</dt><dd className="truncate text-right text-slate-300">{activeModel}</dd><dt className="text-slate-500">Tokens</dt><dd className="text-right text-slate-300">≈ {estimatedTokens.toLocaleString()}</dd></dl>
          </InspectorSection>
          <InspectorSection icon={Files} title="Files" value={`${linkedAttachments.length}`} open>
            <div className="space-y-2">{linkedAttachments.length ? linkedAttachments.map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 p-2.5 text-xs text-slate-300"><Paperclip size={13} className="shrink-0 text-sky-300" /><span className="min-w-0 flex-1 truncate" title={file.name}>{file.name}</span></div>) : <p className="context-empty">No files yet. Add from your device or an authorized connector.</p>}</div>
            <button type="button" onClick={() => { setSourcePickerOpen(true); setShowInspector(false); }} className="mt-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/10">+ Add from source</button>
          </InspectorSection>
          <InspectorSection icon={ImageIcon} title="Generated Assets" value={`${generatedAssets}`} open>
            {generatedAssets ? <div className="grid grid-cols-3 gap-2"><AssetCount label="Images" value={imageCount} /><AssetCount label="Tables" value={tableCount} /><AssetCount label="Charts" value={chartCount} /></div> : <p className="context-empty">Images, tables, charts and reports created in this chat appear here.</p>}
          </InspectorSection>
          <InspectorSection icon={Wrench} title="Quick Actions">
            <div className="grid grid-cols-2 gap-2"><button id="dorje-export-chat" type="button" onClick={() => void downloadChatPdf()} className="action-secondary text-left">Export</button><button type="button" onClick={() => void shareChat()} className="action-secondary text-left"><Share2 size={13} className="mr-1 inline" />Share</button><button type="button" onClick={() => window.print()} className="action-secondary text-left"><Printer size={13} className="mr-1 inline" />Print</button><button type="button" onClick={duplicateChat} className="action-secondary text-left"><Copy size={13} className="mr-1 inline" />Duplicate</button><button type="button" onClick={() => onNotice('Archive storage is prepared for the server-backed workspace library.')} className="action-secondary col-span-2 text-left"><Archive size={13} className="mr-1 inline" />Archive</button></div>
          </InspectorSection>
          <InspectorSection icon={SlidersHorizontal} title="Model Information">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs"><dt className="text-slate-500">Engine</dt><dd className="truncate text-right text-slate-300">{activeModel}</dd><dt className="text-slate-500">Routing</dt><dd className="text-right text-slate-300">Automatic</dd><dt className="text-slate-500">Mode</dt><dd className="text-right text-slate-300">{mode}</dd><dt className="text-slate-500">Validation</dt><dd className="text-right text-slate-300">Enabled</dd><dt className="text-slate-500">Tokens</dt><dd className="text-right text-slate-300">≈ {estimatedTokens.toLocaleString()}</dd></dl><div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full max-w-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, estimatedTokens / 80)}%` }} /></div>
          </InspectorSection>
          <InspectorSection icon={Tags} title="Chat Metadata">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs"><dt className="text-slate-500">Folder</dt><dd className="text-right text-slate-300">Local workspace</dd><dt className="text-slate-500">Project</dt><dd className="text-right text-slate-300">Unassigned</dd><dt className="text-slate-500">Client</dt><dd className="text-right text-slate-300">Current tenant</dd><dt className="text-slate-500">Version</dt><dd className="text-right text-slate-300">{versionCount + 1}</dd></dl>{context ? <p className="mt-3 line-clamp-3 rounded-lg bg-slate-900 p-2 text-[11px] leading-5 text-slate-500">{context}</p> : null}
          </InspectorSection>
          <InspectorSection icon={History} title="History" value={`${versionCount}`}>
            <p className="text-xs leading-5 text-slate-500">{versionCount ? `${versionCount} previous message version${versionCount === 1 ? '' : 's'} retained in this chat.` : 'Edits, previous versions and export activity will appear here.'}</p>
          </InspectorSection>
          <div className="rounded-xl border border-emerald-400/10 bg-emerald-500/5 p-3 text-xs leading-5 text-emerald-100/70"><HardDrive size={15} className="mb-2" />Local Mode<br /><span className="text-slate-500">Files remain local unless you enable a connector.</span></div>
        </div>
        </div> : <ContextIconRail />}
      </aside>
    </section>
  );
}

function SourcePluginPanel({
  generatedDocument,
  onClose,
  onDevice,
  onPaste,
  onCloud,
  onEmail,
  onCloudInstruction,
}: {
  generatedDocument: GeneratedDocument | null;
  currentInput: string;
  onClose: () => void;
  onDevice: () => void;
  onPaste: () => void;
  onCloud: (provider: string, name: string) => void;
  onEmail: () => void;
  onCloudInstruction: () => void;
}) {
  const sources = [
    { label: 'Device files', helper: 'TXT, DOCX, XLSX, PDF, images', icon: <HardDrive size={16} />, action: onDevice },
    { label: 'Text note', helper: 'Paste notes as a .txt file', icon: <FileText size={16} />, action: onPaste },
    { label: 'Google Drive', helper: 'Docs, Sheets, PDFs, folders', icon: <BrandIcon provider="google-drive" className="h-5 w-5" />, action: () => onCloud('google-drive', 'Google Drive') },
    { label: 'Google Docs', helper: 'Create a new Google Doc target', icon: <BrandIcon provider="google-docs" className="h-5 w-5" />, action: () => onCloud('google-docs', 'Google Docs') },
    { label: 'Google Sheets', helper: 'Spreadsheets and tables', icon: <FileSpreadsheet size={16} />, action: () => onCloud('google-sheets', 'Google Sheets') },
    { label: 'OneDrive', helper: 'Microsoft cloud files', icon: <BrandIcon provider="onedrive" className="h-5 w-5" />, action: () => onCloud('onedrive', 'OneDrive') },
    { label: 'Word / Office', helper: 'DOCX workflow connector', icon: <BrandIcon provider="microsoft-word" className="h-5 w-5" />, action: () => onCloud('microsoft-word', 'Microsoft Word') },
    { label: 'Excel', helper: 'Workbook connector', icon: <FileSpreadsheet size={16} />, action: () => onCloud('microsoft-excel', 'Microsoft Excel') },
    { label: 'SharePoint', helper: 'Team sites and libraries', icon: <Database size={16} />, action: () => onCloud('sharepoint', 'SharePoint') },
    { label: 'Notion', helper: 'Page or database reference', icon: <Link2 size={16} />, action: () => onCloud('notion', 'Notion') },
    { label: 'Email plugin', helper: generatedDocument ? 'Attach current DOCX to email' : 'Draft with email connector', icon: <Mail size={16} />, action: onEmail },
    { label: 'Cloud instruction', helper: 'Tell DorjeAI what to fetch/use', icon: <Cloud size={16} />, action: onCloudInstruction },
  ];
  return (
    <div className="mb-2 rounded-2xl border border-emerald-400/20 bg-slate-950/98 p-3 text-slate-100 shadow-2xl shadow-emerald-950/30 backdrop-blur" role="dialog" aria-label="Add source or plugin">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-white"><Plus size={15} className="text-emerald-300" />Add source or plugin</p>
          <p className="mt-1 text-xs text-slate-400">Choose files, cloud connectors, document plugins, or email handoff for this Workspace AI task.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300" aria-label="Close source picker">×</button>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {sources.map((source) => (
          <button key={source.label} type="button" onClick={source.action} title={`${source.label}: ${source.helper}`} aria-label={`${source.label}: ${source.helper}`} className="source-option source-option-icon group relative justify-center text-center">
            {source.icon}
            <span className="source-tooltip"><strong>{source.label}</strong><small>{source.helper}</small></span>
          </button>
        ))}
      </div>
      <p className="mt-3 rounded-xl border border-emerald-400/10 bg-emerald-500/5 p-2 text-[11px] leading-5 text-emerald-100/70">
        Document creation follows DorjeAI orchestration: small planner creates structure, the selected model drafts content, then deterministic code writes DOCX/PDF and hands it to email only after your review.
      </p>
    </div>
  );
}

function WorkspaceFileDrawer({
  file,
  onClose,
  onUndo,
  onDownload,
  onExportPdf,
  onRewrite,
  onAppend,
  onEmail,
}: {
  file: WorkspaceFileState;
  onClose: () => void;
  onUndo: () => void;
  onDownload: () => void;
  onExportPdf: () => void;
  onRewrite: () => void;
  onAppend: () => void;
  onEmail: () => void;
}) {
  const icon = file.kind === 'spreadsheet' ? '📊' : file.kind === 'presentation' ? '🖥️' : file.kind === 'pdf' ? '📄' : file.kind === 'form' ? '🧾' : file.kind === 'attachment' ? '📎' : '📝';
  const statusTone = file.kind === 'document' ? 'text-emerald-200 bg-emerald-500/10' : file.kind === 'spreadsheet' ? 'text-sky-200 bg-sky-500/10' : file.kind === 'presentation' ? 'text-violet-200 bg-violet-500/10' : 'text-amber-100 bg-amber-500/10';
  return (
    <aside className="fixed bottom-4 right-4 top-24 z-[70] flex w-[min(34rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-emerald-400/20 bg-slate-950 shadow-2xl shadow-slate-950/70" aria-label={`${file.kind} workspace drawer`}>
      <div className="border-b border-slate-800 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-white"><span aria-hidden="true">{icon}</span> Workspace file</p>
            <h2 className="mt-1 truncate text-base font-semibold text-emerald-100" title={file.filename}>{file.filename}</h2>
          </div>
          <button type="button" onClick={onClose} className="icon-control" aria-label="Close workspace file drawer"><X size={16} /></button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <span className={`rounded-full px-2 py-1 ${statusTone}`}>{file.kind}</span>
          <span className="rounded-full bg-slate-800 px-2 py-1 text-slate-300">v{file.version}</span>
          <span className="rounded-full bg-slate-800 px-2 py-1 text-slate-300">{file.status}</span>
          <span className="rounded-full bg-slate-800 px-2 py-1 text-slate-300">Updated {new Date(file.updated_at).toLocaleTimeString()}</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="rounded-2xl border border-slate-800 bg-white p-5 text-slate-950 shadow-inner">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{file.kind === 'spreadsheet' ? 'Spreadsheet preview' : file.kind === 'presentation' ? 'Presentation outline' : file.kind === 'pdf' ? 'PDF source preview' : file.kind === 'form' ? 'Form draft' : 'Document preview'}</p>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-800">{file.body || 'No readable preview yet.'}</pre>
        </div>
      </div>
      <div className="border-t border-slate-800 p-3">
        <div className="mb-2 grid grid-cols-3 gap-2 text-[11px]">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-2"><strong className="block text-slate-200">Local draft</strong><span className="text-slate-500">preserved</span></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-2"><strong className="block text-slate-200">Cloud save</strong><span className="text-slate-500">confirm</span></div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-2"><strong className="block text-slate-200">External send</strong><span className="text-slate-500">confirm</span></div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={onDownload} className="action-secondary text-left"><FileText size={14} className="mr-1 inline" />Download</button>
          <button type="button" onClick={onExportPdf} className="action-secondary text-left"><Printer size={14} className="mr-1 inline" />PDF</button>
          <button type="button" onClick={onRewrite} className="action-secondary text-left"><SquarePen size={14} className="mr-1 inline" />Rewrite</button>
          <button type="button" onClick={onAppend} className="action-secondary text-left"><Plus size={14} className="mr-1 inline" />Append</button>
          <button type="button" onClick={onUndo} disabled={!file.versions.length} className="action-secondary text-left disabled:opacity-40"><History size={14} className="mr-1 inline" />Undo</button>
          <button type="button" onClick={onEmail} className="action-primary text-left"><Mail size={14} className="mr-1 inline" />Email here</button>
        </div>
      </div>
    </aside>
  );
}

function ComposerTool({ icon: Icon, label, onClick, active = false }: { icon: typeof Mic; label: string; onClick: () => void; active?: boolean }) { return <button type="button" onClick={onClick} className={`composer-tool ${active ? 'bg-rose-500/15 text-rose-200' : ''}`} title={label} aria-label={label}><Icon size={16} aria-hidden="true" /><span className="composer-tooltip">{label}</span></button>; }
function InspectorSection({ icon: Icon, title, value, children, open = false }: { icon: typeof Paperclip; title: string; value?: string; children?: ReactNode; open?: boolean }) { return <details open={open} className="dorje-card group rounded-xl border border-slate-800 bg-slate-900/50"><summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-3 text-xs font-semibold text-slate-200"><Icon size={15} className="text-emerald-300" /><span>{title}</span>{value ? <span className="ml-auto rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">{value}</span> : <span className="ml-auto" />}<ChevronDown size={14} className="transition group-open:rotate-180" /></summary><div className="border-t border-slate-800 p-3">{children}</div></details>; }
function AssetCount({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-center"><strong className="block text-sm text-white">{value}</strong><span className="text-[10px] text-slate-500">{label}</span></div>; }
function ContextIconRail() { const items = [[Clock3, 'Current chat'], [Files, 'Files'], [ImageIcon, 'Generated assets'], [Wrench, 'Quick actions'], [SlidersHorizontal, 'Model information'], [Tags, 'Chat metadata'], [History, 'History']] as const; return <div className="flex h-full w-14 flex-col items-center gap-2 py-3" aria-label="Context and tools collapsed">{items.map(([Icon, label]) => <button key={label} type="button" className="icon-control border-transparent" title={`${label} — hover to expand`}><Icon size={17} /></button>)}<Pin size={15} className="mt-auto mb-2 text-slate-600" /></div>; }
