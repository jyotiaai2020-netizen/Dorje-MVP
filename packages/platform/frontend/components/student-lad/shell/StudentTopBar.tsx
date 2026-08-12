'use client';

import { useEffect, useState } from 'react';
import { Bell, ChevronDown, Cloud, HelpCircle, LogOut, Menu, Mic, Paperclip, Plus, Search, Send, Settings, UserCircle, Wifi, WifiOff } from 'lucide-react';

export type ExecutionMode = 'Offline' | 'Hybrid' | 'Cloud';

const modeConfig = {
  Offline: { icon: WifiOff, text: 'Local processing only.', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  Hybrid: { icon: Wifi, text: 'Local first. Cloud only with approval.', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  Cloud: { icon: Cloud, text: 'Connected processing enabled where permitted.', className: 'border-sky-200 bg-sky-50 text-sky-800' },
} satisfies Record<ExecutionMode, { icon: typeof Wifi; text: string; className: string }>;

export default function StudentTopBar({
  title,
  mode,
  displayName,
  sidebarCollapsed,
  onToggleSidebar,
  onModeChange,
  onOpenCommandPalette,
  onCommand,
  onOpenHelp,
  onOpenSettings,
  onLogout,
}: {
  title: string;
  mode: ExecutionMode;
  displayName: string;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onModeChange: (mode: ExecutionMode) => void;
  onOpenCommandPalette: () => void;
  onCommand: (value: string) => void;
  onOpenHelp: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}) {
  const [value, setValue] = useState('');
  const [modeOpen, setModeOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const config = modeConfig[mode];
  const ModeIcon = config.icon;

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenCommandPalette();
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [onOpenCommandPalette]);
  useEffect(() => {
    const openForTour = () => setProfileOpen(true);
    window.addEventListener('student-tour:open-profile', openForTour);
    return () => window.removeEventListener('student-tour:open-profile', openForTour);
  }, []);

  function submit() {
    const next = value.trim();
    if (!next) return;
    onCommand(next);
    setValue('');
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/86">
      <div className="grid gap-3 lg:grid-cols-[minmax(180px,260px)_minmax(280px,1fr)_auto] lg:items-center">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="hidden rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 xl:inline-flex"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Student-LAD</p>
            <h1 className="truncate text-lg font-semibold text-slate-950">{title}</h1>
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="flex min-h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 shadow-sm focus-within:border-emerald-300 focus-within:bg-white"
        >
          <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
            placeholder="Create a task, add a reminder, find a file…"
            aria-label="Global command"
          />
          <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-white" aria-label="Start voice command">
            <Mic className="h-4 w-4" />
          </button>
          <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-white" aria-label="Attach file">
            <Paperclip className="h-4 w-4" />
          </button>
          <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-white" aria-label="Quick create">
            <Plus className="h-4 w-4" />
          </button>
          <button type="submit" className="rounded-xl bg-emerald-600 p-2 text-white transition hover:bg-emerald-500" aria-label="Submit command">
            <Send className="h-4 w-4" />
          </button>
        </form>

        <div className="flex items-center justify-between gap-2 lg:justify-end">
          <div className="relative" data-tour-target="user-profile">
            <button
              type="button"
              onClick={() => setModeOpen((open) => !open)}
              className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold ${config.className}`}
              aria-expanded={modeOpen}
            >
              <ModeIcon className="h-4 w-4" />
              {mode}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {modeOpen ? (
              <div className="absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
                {(Object.keys(modeConfig) as ExecutionMode[]).map((item) => {
                  const ItemIcon = modeConfig[item].icon;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        onModeChange(item);
                        setModeOpen(false);
                      }}
                      className="flex w-full items-start gap-3 rounded-xl p-3 text-left hover:bg-slate-50"
                    >
                      <ItemIcon className="mt-0.5 h-4 w-4 text-slate-600" />
                      <span>
                        <span className="block text-sm font-semibold text-slate-950">{item}</span>
                        <span className="mt-0.5 block text-xs leading-5 text-slate-500">{modeConfig[item].text}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <button type="button" className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label="Notifications">
            <Bell className="h-4 w-4" />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setProfileOpen((open) => !open)}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              aria-label="User profile menu"
              aria-expanded={profileOpen}
            >
              <UserCircle className="h-4 w-4" />
              <span className="hidden max-w-[9rem] truncate sm:inline">{displayName}</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>
            {profileOpen ? (
              <div className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
                <div className="border-b border-slate-100 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Signed in</p>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-950">{displayName}</p>
                </div>
                <button type="button" onClick={() => { setProfileOpen(false); onOpenHelp(); }} className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><HelpCircle className="h-4 w-4 text-emerald-700" />Help / Guided tour</button>
                <button type="button" onClick={() => { setProfileOpen(false); onOpenSettings(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><Settings className="h-4 w-4 text-slate-600" />Settings</button>
                <button type="button" onClick={() => { setProfileOpen(false); onLogout(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"><LogOut className="h-4 w-4" />Logout</button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
