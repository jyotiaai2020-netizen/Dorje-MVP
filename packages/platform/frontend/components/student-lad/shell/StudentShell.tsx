'use client';

import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import CommandPalette, { type CommandPaletteItem } from '../command/CommandPalette';
import MobileNavigation from './MobileNavigation';
import OrchestratorOverlay from './OrchestratorOverlay';
import SmartContextPanel, { type SmartPanelModel } from './SmartContextPanel';
import StudentSidebar, { type StudentNavGroup, type StudentNavItem } from './StudentSidebar';
import StudentStatusBar from './StudentStatusBar';
import StudentTopBar, { type ExecutionMode } from './StudentTopBar';
import WorkspaceToolHost from '../tools/WorkspaceToolHost';
import { logout } from '@/lib/auth';
import { useStudentStore, type AccentColor, type AppBackground, type StudentUiTheme } from '@/lib/studentStore';

const ACCENT_TOKENS: Record<AccentColor, { accent: string; strong: string; soft: string; glow: string }> = {
  Emerald: { accent: '#10b981', strong: '#047857', soft: '#ecfdf5', glow: 'rgba(16,185,129,0.18)' },
  Indigo: { accent: '#6366f1', strong: '#4338ca', soft: '#eef2ff', glow: 'rgba(99,102,241,0.18)' },
  Rose: { accent: '#f43f5e', strong: '#be123c', soft: '#fff1f2', glow: 'rgba(244,63,94,0.18)' },
  Amber: { accent: '#f59e0b', strong: '#b45309', soft: '#fffbeb', glow: 'rgba(245,158,11,0.2)' },
  Sky: { accent: '#0ea5e9', strong: '#0369a1', soft: '#f0f9ff', glow: 'rgba(14,165,233,0.18)' },
  Violet: { accent: '#8b5cf6', strong: '#6d28d9', soft: '#f5f3ff', glow: 'rgba(139,92,246,0.18)' },
};

const BACKGROUND_TOKENS: Record<AppBackground, string> = {
  'Warm White': '#fffaf2',
  Mist: '#eef6ff',
  Ivory: '#fffff0',
  Slate: '#e2e8f0',
  Mint: '#ecfdf5',
  Sand: '#fef3c7',
};

const UI_THEME_TOKENS: Record<StudentUiTheme, { surface: string; border: string; fontFamily: string; radius: string; overlay: string }> = {
  Prism: { surface: 'rgba(255,255,255,0.92)', border: 'rgba(15,118,110,0.16)', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', radius: '28px', overlay: 'rgba(14,165,233,0.08)' },
  Craft: { surface: 'rgba(255,247,237,0.94)', border: 'rgba(124,45,18,0.14)', fontFamily: 'ui-serif, Georgia, Cambria, serif', radius: '24px', overlay: 'rgba(245,158,11,0.11)' },
  Forma: { surface: 'rgba(248,250,252,0.96)', border: 'rgba(30,41,59,0.14)', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', radius: '18px', overlay: 'rgba(100,116,139,0.1)' },
  Luma: { surface: 'rgba(255,255,255,0.96)', border: 'rgba(14,165,233,0.14)', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', radius: '32px', overlay: 'rgba(167,243,208,0.16)' },
  Studio: { surface: 'rgba(253,242,248,0.94)', border: 'rgba(76,29,149,0.14)', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', radius: '26px', overlay: 'rgba(251,113,133,0.12)' },
};

export default function StudentShell({
  groups,
  activeLabel,
  displayName,
  rightPanel,
  indexedFiles,
  connectedLocations,
  children,
  onNavigate,
}: {
  groups: StudentNavGroup[];
  activeLabel: string;
  displayName: string;
  rightPanel: SmartPanelModel;
  indexedFiles: number;
  connectedLocations: number;
  children: ReactNode;
  onNavigate: (item: StudentNavItem) => void;
}) {
  const router = useRouter();
  const { accentColor, background, uiTheme } = useStudentStore();
  const accent = ACCENT_TOKENS[accentColor];
  const theme = UI_THEME_TOKENS[uiTheme];
  const shellStyle = {
    '--student-accent': accent.accent,
    '--student-accent-strong': accent.strong,
    '--student-accent-soft': accent.soft,
    '--student-accent-glow': accent.glow,
    '--student-surface': theme.surface,
    '--student-border': theme.border,
    '--student-radius': theme.radius,
    background: `radial-gradient(circle at 18% 0%, ${accent.glow}, transparent 30%), radial-gradient(circle at 86% 12%, ${theme.overlay}, transparent 28%), ${BACKGROUND_TOKENS[background]}`,
    fontFamily: theme.fontFamily,
  } as CSSProperties;
  const [sidebarPinned, setSidebarPinned] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem('student_lad_left_panel_pinned') !== 'false';
  });
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [sidebarManualCollapsed, setSidebarManualCollapsed] = useState(false);
  const [smartPanelOpen, setSmartPanelOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [orchestratorOpen, setOrchestratorOpen] = useState(false);
  const [mode, setMode] = useState<ExecutionMode>('Hybrid');
  const sidebarCollapsed = sidebarManualCollapsed || (!sidebarPinned && !sidebarHovered);

  const askKamal = useCallback(() => {
    window.dispatchEvent(new Event('kamal:open'));
  }, []);
  const openGuidedTour = useCallback(() => {
    window.dispatchEvent(new Event('kamal:start-guided-tour'));
  }, []);

  const allItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const commandItems: CommandPaletteItem[] = useMemo(
    () => [
      ...allItems.slice(0, 12).map((item) => ({
        label: `Open ${item.label}`,
        description: `Go to ${item.label}.`,
        action: () => onNavigate(item),
      })),
      { label: 'Ask Kamal', description: 'Open the global assistant for help or commands.', action: askKamal },
      { label: 'Switch to Offline mode', description: 'Use local-only processing.', action: () => setMode('Offline') },
      { label: 'Switch to Hybrid mode', description: 'Use local-first execution with approval for connected services.', action: () => setMode('Hybrid') },
      { label: 'Switch to Cloud mode', description: 'Use connected processing where policy allows.', action: () => setMode('Cloud') },
    ],
    [allItems, askKamal, onNavigate],
  );

  function handleCommand(value: string) {
    const normalized = value.toLowerCase();
    const match = allItems.find((item) => normalized.includes(item.label.toLowerCase().replace(' & ', ' ')) || normalized.includes(item.label.toLowerCase()));
    if (match) {
      onNavigate(match);
      return;
    }
    askKamal();
  }

  return (
    <div className="student-lad flex h-dvh overflow-hidden bg-slate-100 text-slate-950" data-accent-color={accentColor} data-ui-theme={uiTheme} data-app-background={background} style={shellStyle}>
      <a href="#student-lad-main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:rounded-xl focus:bg-white focus:px-4 focus:py-2 focus:text-slate-950 focus:shadow-xl">
        Skip to content
      </a>
      <StudentSidebar
        groups={groups}
        activeLabel={activeLabel}
        collapsed={sidebarCollapsed}
        pinned={sidebarPinned}
        onToggle={() => {
          if (sidebarManualCollapsed) {
            setSidebarManualCollapsed(false);
            setSidebarPinned(true);
            window.localStorage.setItem('student_lad_left_panel_pinned', 'true');
          } else {
            setSidebarManualCollapsed(true);
            setSidebarPinned(false);
            window.localStorage.setItem('student_lad_left_panel_pinned', 'false');
          }
        }}
        onTogglePin={() => {
          const next = !sidebarPinned;
          setSidebarPinned(next);
          setSidebarHovered(false);
          setSidebarManualCollapsed(false);
          window.localStorage.setItem('student_lad_left_panel_pinned', String(next));
        }}
        onHoverChange={setSidebarHovered}
        onNavigate={onNavigate}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <StudentTopBar
          title={activeLabel}
          mode={mode}
          displayName={displayName}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => {
            setSidebarManualCollapsed(false);
            setSidebarPinned((current) => {
              const next = !current;
              window.localStorage.setItem('student_lad_left_panel_pinned', String(next));
              return next;
            });
          }}
          onModeChange={setMode}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          onCommand={handleCommand}
          onOpenHelp={openGuidedTour}
          onOpenSettings={() => {
            const settings = allItems.find((item) => item.label === 'Settings');
            if (settings) onNavigate(settings);
          }}
          onLogout={() => {
            logout();
            router.replace('/login');
          }}
        />
        <div className="flex min-h-0 flex-1">
          <main id="student-lad-main" data-tour-target="main-content" className="min-w-0 flex-1 overflow-y-auto p-4 pb-24 lg:p-6 xl:pb-6" style={{ background: `linear-gradient(180deg, var(--student-surface), transparent 34%)` }}>
            {children}
          </main>
          <SmartContextPanel panel={rightPanel} open={smartPanelOpen} onClose={() => setSmartPanelOpen(false)} onAskKamal={askKamal} />
        </div>
        <StudentStatusBar mode={mode} indexedFiles={indexedFiles} connectedLocations={connectedLocations} />
      </div>
      <button
        type="button"
        onClick={() => setOrchestratorOpen(true)}
        className="fixed bottom-32 right-4 z-50 rounded-full px-4 py-2 text-sm font-black text-white shadow-2xl ring-1 ring-white/20 transition hover:-translate-y-0.5"
        style={{ backgroundColor: 'var(--student-accent-strong)', boxShadow: `0 18px 42px var(--student-accent-glow)` }}
        aria-label="Open DorjeAI orchestrator top view"
      >
        🦜 Orbit
      </button>
      <button
        type="button"
        onClick={() => setSmartPanelOpen(true)}
        className="fixed bottom-20 right-4 z-50 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-xl xl:hidden"
        style={{ backgroundColor: 'var(--student-accent-strong)' }}
      >
        Context
      </button>
      <MobileNavigation
        groups={groups}
        activeLabel={activeLabel}
        drawerOpen={mobileDrawerOpen}
        onOpenDrawer={() => setMobileDrawerOpen(true)}
        onCloseDrawer={() => setMobileDrawerOpen(false)}
        onNavigate={onNavigate}
      />
      {commandPaletteOpen ? <CommandPalette items={commandItems} onClose={() => setCommandPaletteOpen(false)} /> : null}
      <OrchestratorOverlay key={orchestratorOpen ? 'orchestrator-open' : 'orchestrator-closed'} open={orchestratorOpen} groups={groups} onClose={() => setOrchestratorOpen(false)} onNavigate={onNavigate} />
      <WorkspaceToolHost />
    </div>
  );
}
