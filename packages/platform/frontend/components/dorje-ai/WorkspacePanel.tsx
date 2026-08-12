'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AppWindow, Bell, Bot, Building2, Download, ExternalLink, FileText, FolderPlus, HardDrive, Info, Keyboard, Lock, Palette, Plug, Plus, Settings, Shield, SlidersHorizontal, Sparkles, Trash2, X } from 'lucide-react';
import type { StoredConversation } from '@/lib/chatHistory';
import { apiFetch } from '@/lib/api';
import { userStorageKey } from '@/lib/userStorage';
import BrandIcon from './BrandIcon';
import ThemeControl from './ThemeControl';

export type WorkspaceView = 'chat' | 'history' | 'my-apps' | 'settings';
type SavedAppLink = { id: string; name: string; url: string; folder: string; createdAt: string };
type SettingName = typeof settingCategories[number][1];
type ConnectorSummary = { provider: string; name: string; status: 'connected' | 'not_connected'; account_email?: string | null };

const settingCategories = [
  [Settings, 'General', 'Language, startup and workspace defaults'], [Palette, 'Appearance', 'Theme, density and motion'], [Building2, 'Workspace', 'Naming and folder organization'],
  [Bot, 'Models', 'Routing and preferred local models'], [SlidersHorizontal, 'AI Behavior', 'Response detail and follow-up behavior'], [Download, 'Downloads', 'Filenames and default formats'],
  [FileText, 'Export Templates', 'Reports, decks and spreadsheets'], [Bell, 'Notifications', 'Jobs, exports and connector activity'], [Shield, 'Privacy', 'Local processing and data controls'],
  [Lock, 'Security', 'Sessions, OAuth and audit activity'], [HardDrive, 'Storage', 'Usage, cleanup and retention'], [Plug, 'Connectors', 'Connected productivity accounts'],
  [Keyboard, 'Keyboard Shortcuts', 'Command palette and navigation'], [Info, 'About', 'Version and local runtime information'],
] as const;

export default function WorkspacePanel({ view, histories, onNewChat, onSelectHistory }: { view: WorkspaceView; histories: StoredConversation[]; onNewChat: () => void; onSelectHistory: (conversation: StoredConversation) => void }) {
  const [activeSetting, setActiveSetting] = useState<SettingName>('General');
  if (view === 'history') return <main className="dorje-content-panel flex min-h-0 flex-1 flex-col overflow-y-auto p-6 lg:p-10"><div className="mx-auto w-full max-w-4xl"><p className="eyebrow">Workspace library</p><h1 className="mt-2 text-3xl font-semibold text-white">Chat history</h1>{histories.length ? <div className="mt-8 grid gap-3">{histories.map((chat) => <button key={chat.id} type="button" onClick={() => onSelectHistory(chat)} className="dorje-card flex items-center gap-4 rounded-xl border border-slate-800 p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-400/30"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300"><Sparkles size={20} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-white">{chat.title}</strong><span className="mt-1 block text-xs text-slate-500">Updated {new Date(chat.updatedAt).toLocaleString()}</span></span></button>)}</div> : <EmptyState icon={Sparkles} title="No conversations yet" description="Start your first AI conversation. Recent chats will appear here." action="New Chat" onAction={onNewChat} />}</div></main>;
  if (view === 'my-apps') return <MyAppsPanel />;
  return <main className="dorje-content-panel min-h-0 flex-1 overflow-y-auto p-5 sm:p-7 lg:p-10"><div className="mx-auto max-w-6xl"><p className="eyebrow">Workspace preferences</p><h1 className="mt-2 text-3xl font-semibold text-white">Settings</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Configure DorjeAI around the way you work. Preferences remain local unless explicitly synchronized.</p><div className="mt-8 grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]"><WorkspaceSettingsVerticalTabs active={activeSetting} onSelect={setActiveSetting} /><WorkspaceSettingDetail name={activeSetting} /></div><div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-800 pt-4 text-xs text-slate-500"><span><strong className="text-slate-300">Local mode</strong> Enabled</span><span><strong className="text-slate-300">Storage</strong> Browser + local files</span><span><strong className="text-slate-300">Tenant</strong> Protected</span></div></div></main>;
}

function WorkspaceSettingsVerticalTabs({ active, onSelect }: { active: SettingName; onSelect: (name: SettingName) => void }) {
  return <nav className="lg:sticky lg:top-6 lg:self-start" aria-label="Workspace AI settings sections">
    <div className="border-l border-slate-800">
      {settingCategories.map(([Icon, name, description]) => <button key={name} type="button" onClick={() => onSelect(name)} className={`group flex w-full items-start gap-3 border-l-2 px-4 py-3 text-left transition ${active === name ? '-ml-px border-emerald-300 bg-emerald-400/5' : '-ml-px border-transparent hover:border-slate-600 hover:bg-slate-900/40'}`} aria-current={active === name ? 'page' : undefined}>
        <Icon size={18} className={`mt-0.5 shrink-0 ${active === name ? 'text-emerald-300' : 'text-slate-500 group-hover:text-slate-300'}`} />
        <span className="min-w-0">
          <strong className={`block text-sm ${active === name ? 'text-white' : 'text-slate-300'}`}>{name}</strong>
          <span className="mt-0.5 block text-xs leading-5 text-slate-500">{description}</span>
        </span>
      </button>)}
    </div>
  </nav>;
}

function WorkspaceSettingDetail({ name }: { name: SettingName }) {
  const settingsKey = userStorageKey('workspace_ai_settings');
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    return JSON.parse(window.localStorage.getItem(settingsKey) || '{}') as Record<string, string>;
  });
  function update(field: string, value: string) {
    const next = { ...values, [`${name}:${field}`]: value };
    setValues(next);
    window.localStorage.setItem(settingsKey, JSON.stringify(next));
  }
  if (name === 'Appearance') return <section><div className="border-b border-slate-800 pb-4"><div className="flex items-center gap-3"><Palette className="text-emerald-300" size={20} /><div><h2 className="text-xl font-semibold text-white">Appearance</h2><p className="text-sm text-slate-500">Follow your operating system or choose a fixed theme.</p></div></div></div><div className="mt-5"><ThemeControl /></div><PrivacyImpact name={name} /></section>;
  if (name === 'Connectors') return <WorkspaceConnectorsSettings />;
  const fields = workspaceSettingFields[name] || ['Preference', 'Default behavior', 'Sync rule'];
  return <section><div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4"><div><h2 className="text-xl font-semibold text-white">{name}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{settingCategories.find(([, item]) => item === name)?.[2]}</p></div><span className="rounded-full border border-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-200">Local form</span></div><div className="mt-2 divide-y divide-slate-800">{fields.map((field) => <label key={field} className="grid gap-3 py-4 text-sm sm:grid-cols-[220px_minmax(0,1fr)] sm:items-center"><span><span className="block font-semibold text-slate-200">{field}</span><span className="mt-0.5 block text-xs text-slate-500">Saved to this browser workspace.</span></span><input value={values[`${name}:${field}`] || defaultSettingValue(name, field)} onChange={(event) => update(field, event.target.value)} className="w-full border-b border-slate-700 bg-transparent px-0 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-300" /></label>)}</div><PrivacyImpact name={name} /></section>;
}

function PrivacyImpact({ name }: { name: SettingName }) {
  return <div className="mt-6 border-t border-slate-800 pt-4 text-sm leading-6 text-slate-400"><p className="font-semibold text-emerald-200">Privacy impact</p><p className="mt-1">{workspaceSettingImpact[name]}</p></div>;
}

const workspaceSettingFields: Partial<Record<SettingName, string[]>> = {
  General: ['Language', 'Startup screen', 'Workspace default'],
  Workspace: ['Workspace name', 'Folder naming', 'Default project'],
  Models: ['Routing mode', 'Preferred local model', 'Fallback behavior'],
  'AI Behavior': ['Response detail', 'Follow-up suggestions', 'Confirmation level'],
  Downloads: ['Filename prefix', 'Default format', 'Save location'],
  'Export Templates': ['Report template', 'Deck template', 'Spreadsheet template'],
  Notifications: ['Export alerts', 'Connector alerts', 'Reminder alerts'],
  Privacy: ['Local processing', 'Context retention', 'Cloud approval'],
  Security: ['Session timeout', 'OAuth audit', 'Vault confirmation'],
  Storage: ['Cleanup window', 'Cache policy', 'Export retention'],
  'Keyboard Shortcuts': ['Command palette', 'New chat', 'Send shortcut'],
  About: ['Runtime', 'Edition', 'Support channel'],
};

const workspaceSettingImpact: Record<SettingName, string> = {
  General: 'Saved locally for workspace defaults. No connector or cloud access changes.',
  Appearance: 'Theme choices stay in browser preferences and do not affect model routing.',
  Workspace: 'Changes affect folder organization and future saved assets.',
  Models: 'Model preferences affect local/cloud routing but still require policy approval.',
  'AI Behavior': 'Response preferences influence drafting style and confirmation prompts.',
  Downloads: 'Download preferences affect filenames and local export behavior.',
  'Export Templates': 'Templates affect future report, deck, and spreadsheet exports.',
  Notifications: 'Notification settings affect reminders, connector status, and export alerts.',
  Privacy: 'Privacy settings govern local processing, context retention, and cloud approvals.',
  Security: 'Security settings affect sessions, OAuth activity, and vault access logging.',
  Storage: 'Storage settings affect cleanup, local cache, and retention.',
  Connectors: 'Connectors require explicit OAuth or credential authorization before use.',
  'Keyboard Shortcuts': 'Shortcuts affect only local navigation and command behavior.',
  About: 'Version and runtime information is read-only.',
};

function defaultSettingValue(name: SettingName, field: string) {
  const defaults: Record<string, string> = {
    'General:Language': 'English',
    'General:Startup screen': 'Workspace AI',
    'Models:Routing mode': 'Auto',
    'Privacy:Local processing': 'Preferred',
    'Security:Session timeout': 'Protected',
    'About:Runtime': 'Student-LAD local',
  };
  return defaults[`${name}:${field}`] || 'Configured locally';
}

function WorkspaceConnectorsSettings() {
  const [connectors, setConnectors] = useState<ConnectorSummary[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { let alive = true; apiFetch<ConnectorSummary[]>('/api/v1/connectors').then((items) => { if (alive) setConnectors(items); }).catch((reason) => { if (alive) setError(reason instanceof Error ? reason.message : 'Unable to load connectors.'); }); return () => { alive = false; }; }, []);
  const connected = connectors.filter((item) => item.status === 'connected').length;
  const catalog = connectors.length ? connectors : defaultConnectorCatalog;
  return <section><div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4"><div><h2 className="text-xl font-semibold text-white">Connectors</h2><p className="mt-1 text-sm leading-6 text-slate-500">Connected productivity accounts. Full authorization and setup opens in the shared Connector Center.</p></div><button type="button" onClick={() => window.location.assign('/student-lad/connectors')} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950">Open Connector Center</button></div>{error ? <p className="mt-4 border-l-2 border-rose-400 bg-rose-500/5 px-3 py-2 text-xs text-rose-200">{error}</p> : null}<div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500"><span><strong className="text-slate-300">Connected</strong> {connected}</span><span><strong className="text-slate-300">Permission</strong> Required</span><span><strong className="text-slate-300">Tokens</strong> Server encrypted</span></div><div className="mt-5 divide-y divide-slate-800">{catalog.map((connector) => <div key={connector.provider} className="flex items-center gap-3 py-3"><BrandIcon provider={connector.provider} className="h-8 w-8 shrink-0 rounded-lg" /><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold text-white">{connector.name}</h3><p className="mt-0.5 text-xs text-slate-500">{connector.status === 'connected' ? connector.account_email || 'Connected account' : 'Not connected'}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${connector.status === 'connected' ? 'bg-emerald-500/15 text-emerald-200' : 'bg-slate-800 text-slate-400'}`}>{connector.status === 'connected' ? 'On' : 'Add'}</span></div>)}</div><PrivacyImpact name="Connectors" /></section>;
}

const defaultConnectorCatalog: ConnectorSummary[] = [
  { provider: 'gmail', name: 'Gmail', status: 'not_connected' },
  { provider: 'google-calendar', name: 'Google Calendar', status: 'not_connected' },
  { provider: 'google-drive', name: 'Google Drive', status: 'not_connected' },
  { provider: 'microsoft-email', name: 'Outlook Email', status: 'not_connected' },
  { provider: 'microsoft-word', name: 'Microsoft Word', status: 'not_connected' },
  { provider: 'onedrive', name: 'OneDrive', status: 'not_connected' },
  { provider: 'apple-calendar', name: 'Apple Calendar', status: 'not_connected' },
  { provider: 'apple-drive', name: 'iCloud Drive', status: 'not_connected' },
  { provider: 'chatgpt', name: 'ChatGPT', status: 'not_connected' },
  { provider: 'gemini', name: 'Gemini', status: 'not_connected' },
];

function MyAppsPanel() {
  const storageKey = userStorageKey('workspace_ai_my_apps');
  const [links, setLinks] = useState<SavedAppLink[]>(() => {
    if (typeof window === 'undefined') return [];
    return sortLinks(JSON.parse(window.localStorage.getItem(storageKey) || '[]') as SavedAppLink[]);
  });
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [folder, setFolder] = useState('General');
  const [newFolder, setNewFolder] = useState('');
  const [activeForm, setActiveForm] = useState<'link' | 'folder' | null>(null);

  const folders = useMemo(() => Array.from(new Set(['General', ...links.map((item) => item.folder), folder].filter(Boolean))).sort((a, b) => a.localeCompare(b)), [folder, links]);
  const grouped = useMemo(() => folders.map((folderName) => [folderName, links.filter((item) => item.folder === folderName).sort((a, b) => a.name.localeCompare(b.name))] as const), [folders, links]);

  function persist(next: SavedAppLink[]) {
    const sorted = sortLinks(next);
    setLinks(sorted);
    window.localStorage.setItem(storageKey, JSON.stringify(sorted));
  }

  function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = newFolder.trim();
    if (!clean) return;
    setFolder(clean);
    setNewFolder('');
    setActiveForm(null);
  }

  function addLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeUrl(url);
    if (!normalized) return;
    const linkName = (name.trim() || deriveAppName(normalized)).trim();
    persist([{ id: crypto.randomUUID(), name: linkName, url: normalized, folder: folder.trim() || 'General', createdAt: new Date().toISOString() }, ...links]);
    setUrl('');
    setName('');
    setActiveForm(null);
  }

  function removeLink(id: string) {
    persist(links.filter((item) => item.id !== id));
  }

  return <main className="dorje-content-panel min-h-0 flex-1 overflow-y-auto p-5 sm:p-7 lg:p-10"><div className="mx-auto max-w-6xl"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="eyebrow">Workspace AI shortcuts</p><h1 className="mt-2 text-3xl font-semibold text-white">My Apps</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Save websites and external sources as clean buttons. Folders and links are sorted alphabetically, and button labels use the application name instead of long URLs.</p></div><div className="flex shrink-0 items-center justify-end gap-2"><button type="button" onClick={() => setActiveForm((value) => value === 'link' ? null : 'link')} className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition ${activeForm === 'link' ? 'border-emerald-300 bg-emerald-400 text-slate-950' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100 hover:border-emerald-300'}`} aria-expanded={activeForm === 'link'} aria-controls="my-apps-add-link-form" aria-label="Add link"><Plus size={16} />Add link</button><button type="button" onClick={() => setActiveForm((value) => value === 'folder' ? null : 'folder')} className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition ${activeForm === 'folder' ? 'border-sky-300 bg-sky-400 text-slate-950' : 'border-sky-400/30 bg-sky-500/10 text-sky-100 hover:border-sky-300'}`} aria-expanded={activeForm === 'folder'} aria-controls="my-apps-create-folder-form" aria-label="Open folder form"><FolderPlus size={16} />Folder</button></div></div>{activeForm ? <section className="dorje-card mt-6 rounded-2xl border border-slate-800 p-5 shadow-2xl shadow-slate-950/30"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3">{activeForm === 'link' ? <AppWindow className="text-emerald-300" size={20} /> : <FolderPlus className="text-sky-300" size={20} />}<div><h2 className="font-semibold text-white">{activeForm === 'link' ? 'Add link' : 'Create folder'}</h2><p className="text-xs text-slate-500">{activeForm === 'link' ? 'Create a colorful app button from a website URL.' : 'Create a folder and select it for the next saved link.'}</p></div></div><button type="button" onClick={() => setActiveForm(null)} className="rounded-full border border-slate-700 p-2 text-slate-300 hover:border-rose-300 hover:text-rose-200" aria-label="Close My Apps form"><X size={14} /></button></div>{activeForm === 'link' ? <form id="my-apps-add-link-form" onSubmit={addLink} className="mt-4 grid gap-3 md:grid-cols-[1.4fr_1fr_.8fr_auto] md:items-end"><label className="text-xs font-semibold text-slate-300">Website URL<input required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://codex.com/user" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400" /></label><label className="text-xs font-semibold text-slate-300">Button name, optional<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Auto example: codex" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400" /></label><label className="text-xs font-semibold text-slate-300">Folder<select value={folder} onChange={(event) => setFolder(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400">{folders.map((folderName) => <option key={folderName}>{folderName}</option>)}</select></label><button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950"><Plus size={15} />Create</button></form> : <form id="my-apps-create-folder-form" onSubmit={createFolder} className="mt-4 flex flex-col gap-2 sm:flex-row"><input value={newFolder} onChange={(event) => setNewFolder(event.target.value)} placeholder="Research, Coding, University…" className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400" /><button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-400/40 px-4 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/10"><FolderPlus size={15} />Create</button></form>}</section> : null}<div className="mt-6 space-y-4">{grouped.map(([folderName, items]) => <section key={folderName} className="dorje-card rounded-2xl border border-slate-800 p-5"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-white">{folderName}</h2><span className="rounded-full border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-400">{items.length}</span></div>{items.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map((item, index) => <article key={item.id} className={`group relative overflow-hidden rounded-2xl border p-4 shadow-lg shadow-slate-950/20 transition hover:-translate-y-0.5 ${appColor(index)}`}><div className="flex items-start justify-between gap-3"><a href={item.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 text-lg shadow-inner" aria-hidden="true">✦ </span><strong className="mt-3 block truncate text-base text-white"> {item.name}</strong><span className="mt-1 block truncate text-xs text-white"> {new URL(item.url).hostname.replace(/^www\./i, '')}</span></a><div className="flex items-center gap-1"><button type="button" onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')} className="rounded-full bg-white/15 p-2 text-white hover:bg-white/25" aria-label={`Open ${item.name}`} title="Open"><ExternalLink size={14} /></button><button type="button" onClick={() => removeLink(item.id)} className="rounded-full bg-white/15 p-2 text-white hover:bg-rose-500/40" aria-label={`Remove ${item.name}`} title="Remove"><Trash2 size={14} /></button></div></div></article>)}</div> : <p className="mt-3 text-sm text-slate-500">No links in this folder yet.</p>}</section>)}</div></div></main>;
}

function EmptyState({ icon: Icon, title, description, action, onAction }: { icon: typeof Sparkles; title: string; description: string; action: string; onAction: () => void }) { return <div className="dorje-card mt-8 flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 p-8 text-center"><span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-300 shadow-lg shadow-emerald-950/20"><Icon size={28} /></span><h2 className="mt-5 text-xl font-semibold text-white">{title}</h2><p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">{description}</p><button type="button" onClick={onAction} className="mt-6 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950">{action}</button></div>; }
function sortLinks(items: SavedAppLink[]) { return [...items].sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name)); }
function normalizeUrl(value: string) { try { const withProtocol = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`; return new URL(withProtocol).toString(); } catch { return ''; } }
function deriveAppName(value: string) { try { const host = new URL(value).hostname.replace(/^www\./i, ''); const root = host.split('.')[0] || host; return root.charAt(0).toUpperCase() + root.slice(1); } catch { return 'App'; } }
function appColor(index: number) {
  const colors = [
    'border-emerald-300/30 bg-gradient-to-br from-emerald-500/70 to-teal-700/70',
    'border-sky-300/30 bg-gradient-to-br from-sky-500/70 to-indigo-700/70',
    'border-fuchsia-300/30 bg-gradient-to-br from-fuchsia-500/70 to-purple-800/70',
    'border-amber-300/30 bg-gradient-to-br from-amber-500/75 to-orange-700/70',
    'border-rose-300/30 bg-gradient-to-br from-rose-500/70 to-red-800/70',
  ];
  return colors[index % colors.length];
}
