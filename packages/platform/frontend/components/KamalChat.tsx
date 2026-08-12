'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BookOpen, Brain, CalendarClock, Keyboard, LifeBuoy, Mic, MicOff, Navigation, PhoneCall, Send, X } from 'lucide-react';
import { API_BASE_URL, authenticatedFetch, authorizationHeaders } from '@/lib/api';
import { buildKamalUtterance } from '@/lib/kamalVoice';
import { readTextStream } from '@/lib/stream';
import { useStudentStore, type AccentColor, type AppBackground, type KamalAvatar, type LocalVoice, type PerformanceProfile, type StudentExecutionMode, type StudentTheme, type StudentUiTheme } from '@/lib/studentStore';
import { userStorageKey } from '@/lib/userStorage';
import { openWorkspaceTool } from '@/components/student-lad/tools/workspaceToolBus';
import CedaSuggestionButtons, { type CedaSuggestion } from './dorje-ai/CedaSuggestionButtons';
import { useCedaSuggestionComposer } from './dorje-ai/useCedaSuggestionComposer';

const INITIAL_MESSAGE = 'Hi, I’m Kamal. I can answer questions about this application, navigate without a mouse, create a support request, arrange a callback, or prepare a confirmed email/call handoff.';
type ChatMessage = { id: number; role: 'assistant' | 'user'; content: string };
type Action = 'support' | 'callback' | 'schedule' | null;
type RecognitionResult = { 0: { transcript: string }; isFinal: boolean };
type RecognitionEvent = Event & { results: ArrayLike<RecognitionResult>; resultIndex: number };
type Recognition = { continuous: boolean; interimResults: boolean; lang: string; start: () => void; stop: () => void; onresult: ((event: RecognitionEvent) => void) | null; onerror: ((event: Event & { error: string }) => void) | null; onend: (() => void) | null };
type RecognitionConstructor = new () => Recognition;
type PendingCommand = { summary: string; execute: () => void | Promise<void> };
type ParsedReminder = { title: string; dueAt: string; reminderDate: string; displayTime: string };
type CalendarPrompt = { reminderId: string; title: string; dueAt: string; displayTime: string } | null;
type TourStatus = 'idle' | 'ready' | 'running';
type TourStep = { label: string; path?: string; target: string; description: string; guidance: string };
type SpotlightRect = { top: number; left: number; width: number; height: number };
type StoredTourState = { status: TourStatus; index: number };
type ParsedRecordCommand = { domain: 'academic' | 'immigration' | 'career' | 'personal'; label: string; text: string; destination: string };
type ParsedRemoveRecordCommand = ParsedRecordCommand & { recordType?: string };
type ContextRegistryRecord = { context_id: string; title: string; type: string; domain: string; status: string; payload?: { instruction?: string }; source?: { type?: string } };
type CedaStructuredItem = { id: string; domain: string; type: string; summary: string; related_item?: string; status: string; metadata?: { extracted_fields?: { title?: string; record_type?: string } } };
type StudentTaskItem = { id: string; title: string; category?: string; status?: string; priority?: string; dueAt?: string };
type ParsedTaskQuery = { scope: 'all' | 'completed' | 'overdue' | 'upcoming' | 'today' | 'active'; wantsCount: boolean; label: string };
type ParsedCedaReviewCommand = { action: 'approve' | 'deny' | 'archive' | 'delete'; query: string; all: boolean; label: string };
type KamalActionOperation = 'CREATE' | 'READ' | 'SEARCH' | 'UPDATE' | 'COMPLETE' | 'REOPEN' | 'MOVE' | 'ARCHIVE' | 'DELETE' | 'RESTORE' | 'UNDO';
type KamalActionContract = {
  actionId: string;
  operation: KamalActionOperation;
  entityType: 'task' | 'reminder';
  entityId?: string;
  query?: string;
  changes?: Record<string, unknown>;
  source: 'voice' | 'text';
  requiresConfirmation: boolean;
  expectedVersion?: number;
};
type KamalActionRecord = {
  id: string;
  title: string;
  due_at?: string | null;
  reminder_date?: string | null;
  status?: string | null;
  priority?: string | null;
  version?: number;
  action?: KamalActionContract;
};
type KamalActionPreview = {
  status: 'ignored' | 'preview' | 'not_found' | 'clarification_required';
  message?: string;
  action?: KamalActionContract;
  item?: KamalActionRecord;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  candidates?: KamalActionRecord[];
};
type ParsedSettingCommand = {
  key: 'theme' | 'mode' | 'uiTheme' | 'kamalAvatar' | 'voice' | 'accentColor' | 'background' | 'performanceProfile';
  value: StudentTheme | StudentExecutionMode | StudentUiTheme | KamalAvatar | LocalVoice | AccentColor | AppBackground | PerformanceProfile;
  label: string;
};
type KamalRoute = { pattern: RegExp; path: string; label: string; description: string };
type NavigationHandoff = { message: string; createdAt: number };

const WEEKDAY_INDEXES: Record<string, number> = { sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, friday: 5, fri: 5, saturday: 6, sat: 6 };

const routes: KamalRoute[] = [
  {
    pattern: /\b(home(?:page)?|home screen|dashboard|starting point|main page)\b/i,
    path: '/student-lad',
    label: 'Home',
    description: 'Home is your Student-LAD starting point. It shows My Day, Academic, Immigration, Career, Family, Health, Finance, and Holiday cards with priority and reminder highlights.',
  },
  {
    pattern: /\b(my day|today|daily view|day planner)\b/i,
    path: '/student-lad/my-day',
    label: 'My Day',
    description: 'My Day shows your selected day, week, month, or year summary, with priorities, conflicts, timeline, activity log, and upcoming actions.',
  },
  {
    pattern: /\b(calendar|timeline|calender|deadlines?)\b/i,
    path: '/student-lad/calendar',
    label: 'Calendar & Timeline',
    description: 'Calendar & Timeline shows reminders, academic deadlines, holidays, and scheduled events. You can create, review, and manage dated actions from here.',
  },
  {
    pattern: /\b(tasks?|reminders?|to[- ]?dos?)\b/i,
    path: '/student-lad/tasks',
    label: 'Tasks',
    description: 'Tasks organizes completed, upcoming, high-priority, and critical items so Kamal and Dorje can help you act on them.',
  },
  {
    pattern: /\b(academic|academics|courses?|assignments?|exams?|quizzes|notes?|scheduled classes?)\b/i,
    path: '/student-lad/academic',
    label: 'Academic',
    description: 'Academic manages courses, scheduled classes, assignments, exams, quizzes, and notes. Approved CEDA records appear here as structured academic information.',
  },
  {
    pattern: /\b(immigration|visa|i-20|i20|sevis|opt|cpt|uscis|ead)\b/i,
    path: '/student-lad/immigration',
    label: 'Immigration',
    description: 'Immigration tracks important document dates, OPT/CPT planning, USCIS milestones, and high-priority reminders. It is planning support, not legal advice.',
  },
  {
    pattern: /\b(career|resume|jobs?|internships?|recruiters?|linkedin)\b/i,
    path: '/student-lad/career',
    label: 'Career',
    description: 'Career helps organize resumes, applications, recruiters, interviews, LinkedIn drafts, and career goals.',
  },
  {
    pattern: /\b(family|relationships?|relationship)\b/i,
    path: '/student-lad/family',
    label: 'Family',
    description: 'Family keeps personal relationship tasks and reminders separate from academic and career work.',
  },
  {
    pattern: /\b(health|wellness|doctor|medicine|medical)\b/i,
    path: '/student-lad/health',
    label: 'Health',
    description: 'Health helps track wellness tasks, appointments, and routines while keeping sensitive details protected by privacy rules.',
  },
  {
    pattern: /\b(finance|financial|bills?|subscriptions?|economic|money)\b/i,
    path: '/student-lad/finance',
    label: 'Finance',
    description: 'Finance organizes bills, subscriptions, budget reminders, and money-related tasks.',
  },
  {
    pattern: /\b(holidays?|vacation|breaks?)\b/i,
    path: '/student-lad/holidays',
    label: 'Holidays',
    description: 'Holidays shows important public holidays, breaks, and personal celebration reminders.',
  },
  {
    pattern: /\b(review and save|review|ceda review|needs review|saved information|records?)\b/i,
    path: '/student-lad/review',
    label: 'Review & Save',
    description: 'Review & Save is where CEDA shows extracted items before they become saved information. Approve, edit, deny, archive, or delete items here.',
  },
  {
    pattern: /\b(workspaces?|storage locations?|sources?|knowledge catalog|catalog)\b/i,
    path: '/student-lad/workspaces',
    label: 'Workspace',
    description: 'Workspace shows connected storage locations and source references. It tracks where knowledge lives without duplicating files unnecessarily.',
  },
  {
    pattern: /\b(memory center|memory|what dorje remembers|pending memories)\b/i,
    path: '/student-lad/memory',
    label: 'Memory Center',
    description: 'Memory Center shows what Dorje remembers, pending memories, preferences, goals, lessons learned, and sensitive memory controls.',
  },
  {
    pattern: /\b(policies?|privacy rules?|policy engine|pie)\b/i,
    path: '/student-lad/settings',
    label: 'Policies',
    description: 'Policies live inside Settings and govern what can be saved, used, shared, sent to cloud models, or connected to outside services.',
  },
  {
    pattern: /\b(connectors?|integrations?|google|gmail|drive|calendar connector)\b/i,
    path: '/student-lad/connectors',
    label: 'Connectors',
    description: 'Connectors have one shared center. They let you connect services such as Google, Microsoft, Apple, and other tools under your permission rules.',
  },
  {
    pattern: /\b(vault|secure vault|passwords?|secrets?|api keys?)\b/i,
    path: '/student-lad/settings',
    label: 'Secure Vault',
    description: 'Secure Vault lives inside Settings and protects credentials, tokens, and secrets. Sensitive items are masked and never casually sent to models.',
  },
  {
    pattern: /\b(settings?|preferences?|configuration|billing|device config|developer mode)\b/i,
    path: '/student-lad/settings',
    label: 'Settings',
    description: 'Settings controls profile, appearance, offline or online mode, models, cloud providers, storage, security, notifications, backup, data export, billing mode, and developer options.',
  },
  {
    pattern: /\b(analytics|insights|reports?|report library)\b/i,
    path: '/student-lad/analytics',
    label: 'Analytics',
    description: 'Analytics summarizes activity, CEDA signals, priorities, reminders, and workspace trends so you can see what needs attention.',
  },
  {
    pattern: /\b(kamal|assistant|help assistant|support assistant)\b/i,
    path: '/student-lad/kamal',
    label: 'Kamal',
    description: 'Kamal is your voice and text assistant for navigation, support, records, reminders, and guided actions across Student-LAD.',
  },
  {
    pattern: /\b(workspace ?ai|dorje ?ai|dorje|multi[- ]?agent(?: workspace)?|ai workspace|dorje chat)\b/i,
    path: '/dorje-ai',
    label: 'Workspace AI',
    description: 'Workspace AI opens the Dorje chat console for deeper AI work, document reasoning, writing, reports, and multi-agent workflows.',
  },
  {
    pattern: /\b(templates?|prompt library)\b/i,
    path: '/dorje-ai/templates',
    label: 'Templates',
    description: 'Templates store reusable prompt and workflow starters for repeated academic, career, writing, and productivity tasks.',
  },
  {
    pattern: /\b(organizations?|clients?|tenant management)\b/i,
    path: '/organizations',
    label: 'Organizations',
    description: 'Organizations is reserved for tenant and enterprise management. Student-LAD keeps it in the background for future Enterprise features.',
  },
];

const TOUR_STEPS: TourStep[] = [
  { label: 'User Profile', target: 'user-profile', description: 'Top right profile menu contains Help / Guided tour, Settings, and Logout. This is the account and help control point.', guidance: 'Let’s begin at your profile menu in the top-right corner. This is where help, settings, and logout live.' },
  { label: 'Home', path: '/student-lad', target: 'main-content', description: 'Home is the launch surface with focused areas, top priorities, and reminders.', guidance: 'This is Home — your launch surface. It gives you a quick pulse across the main parts of Student-LAD.' },
  { label: 'My Day', path: '/student-lad/my-day', target: 'main-content', description: 'My Day summarizes tasks, priorities, conflicts, timeline, and activity log for the selected date.', guidance: 'Here is My Day. Use this when you want to know what needs attention today and what is already handled.' },
  { label: 'Workspace AI', path: '/dorje-ai', target: 'workspace-ai', description: 'Workspace AI is where reports, document reasoning, writing, files, charts, and deeper DorjeAI conversations happen.', guidance: 'Workspace AI is the deeper Dorje console. This is where you work with files, reports, charts, writing, and richer reasoning.' },
  { label: 'Academic', path: '/student-lad/academic', target: 'main-content', description: 'Academic stores courses, assignments, exams, notes, scheduled classes, and source uploads after CEDA approval.', guidance: 'Academic keeps your courses, assignments, exams, notes, and class records organized as structured information.' },
  { label: 'Immigration', path: '/student-lad/immigration', target: 'main-content', description: 'Immigration tracks planning metadata, milestones, documents, and reminders with DSO/USCIS verification notes.', guidance: 'Immigration keeps planning dates and milestones visible. It helps you prepare, while reminding you to verify official requirements.' },
  { label: 'Career', path: '/student-lad/career', target: 'main-content', description: 'Career manages resumes, applications, recruiters, networking, job boards, and career communication drafts.', guidance: 'Career is your job-search and professional preparation hub — resumes, recruiters, applications, networking, and drafts.' },
  { label: 'Family', path: '/student-lad/family', target: 'main-content', description: 'Family stores sensitive family records locally and requires explicit permission before sharing or cloud use.', guidance: 'Family keeps personal relationship information separate and protected under sensitive-data rules.' },
  { label: 'Health', path: '/student-lad/health', target: 'main-content', description: 'Health tracks appointments, medicine, insurance, and wellness items under sensitive-data rules.', guidance: 'Health is for appointments, medicine, insurance, and wellness items. Sensitive details stay protected by policy.' },
  { label: 'Bills & Subscriptions', path: '/student-lad/finance', target: 'main-content', description: 'Bills & Subscriptions tracks due dates, renewals, recurring charges, reminders, and masked payment labels only.', guidance: 'Bills and Subscriptions helps you see upcoming payments, renewals, reminders, and recurring charges without storing raw payment secrets.' },
  { label: 'Holidays', path: '/student-lad/holidays', target: 'main-content', description: 'Holidays manages travel, US holidays, documents, budgets, and reminders.', guidance: 'Holidays helps plan breaks, travel, documents, budgets, and holiday reminders.' },
  { label: 'Review & Save', path: '/student-lad/review', target: 'main-content', description: 'Review & Save is the approval table where CEDA shows clean extracted items before they become saved information.', guidance: 'Review and Save is the consent gate. CEDA shows what it found, and you decide what becomes saved information.' },
  { label: 'Memory Center', path: '/student-lad/memory', target: 'main-content', description: 'Memory Center shows approved memories, preferences, lessons, pending memories, and export/forget controls.', guidance: 'Memory Center shows what Dorje is allowed to remember: approved information, preferences, lessons, and controls to edit or forget.' },
  { label: 'Connectors', path: '/student-lad/connectors', target: 'main-content', description: 'Connectors lets users authorize Google, Microsoft, Apple, email, calendar, storage, AI, and publishing tools.', guidance: 'Connectors is where outside services are authorized. Dorje asks before using anything that needs permission.' },
  { label: 'Policies', path: '/student-lad/policies', target: 'main-content', description: 'Policies define what DorjeAI may save, use, send, publish, retrieve, or route to cloud models.', guidance: 'Policies are the rules for Dorje’s behavior — what can be saved, shared, sent to cloud models, or used in outputs.' },
  { label: 'Settings', path: '/student-lad/settings', target: 'main-content', description: 'Settings controls profile, appearance, execution mode, models, storage, security, notifications, backup, and developer options.', guidance: 'Settings is where the app adapts to your device, privacy preferences, models, storage, security, and notifications.' },
];

function consumeNavigationHandoff(): string | null {
  if (typeof window === 'undefined') return null;
  const stored = window.sessionStorage.getItem('kamal_navigation_message');
  if (!stored) return null;
  window.sessionStorage.removeItem('kamal_navigation_message');
  try {
    const payload = JSON.parse(stored) as Partial<NavigationHandoff>;
    if (!payload.message || !payload.createdAt || Date.now() - payload.createdAt > 15000) return null;
    return payload.message;
  } catch {
    return null;
  }
}

function readStoredTourState(): StoredTourState {
  if (typeof window === 'undefined') return { status: 'idle', index: 0 };
  try {
    const stored = window.sessionStorage.getItem('kamal_guided_tour_state');
    if (!stored) return { status: 'idle', index: 0 };
    const parsed = JSON.parse(stored) as Partial<StoredTourState>;
    const status = parsed.status === 'ready' || parsed.status === 'running' ? parsed.status : 'idle';
    const index = Number.isFinite(parsed.index) ? Math.max(0, Math.min(Number(parsed.index), TOUR_STEPS.length - 1)) : 0;
    return { status, index };
  } catch {
    return { status: 'idle', index: 0 };
  }
}

function writeStoredTourState(status: TourStatus, index: number) {
  if (typeof window === 'undefined') return;
  if (status === 'idle') {
    window.sessionStorage.removeItem('kamal_guided_tour_state');
    return;
  }
  window.sessionStorage.setItem('kamal_guided_tour_state', JSON.stringify({ status, index }));
}

export default function KamalChat() {
  const router = useRouter(); const pathname = usePathname(); const recognitionRef = useRef<Recognition | null>(null); const keepListeningRef = useRef(false); const pendingCommandRef = useRef<PendingCommand | null>(null); const modeRef = useRef<'text' | 'voice'>('text'); const speechGenerationRef = useRef(0);
  const { kamalAvatar, voice: kamalVoice, setTheme, setMode: setExecutionMode, setUiTheme, setKamalAvatar, setVoice, setAccentColor, setBackground, setPerformanceProfile } = useStudentStore();
  const composerRef = useRef<HTMLInputElement>(null);
  const tourStatusRef = useRef<TourStatus>('idle'); const tourIndexRef = useRef(0);
  const tourRefsInitializedRef = useRef(false);
  const [navigationHandoff] = useState(() => consumeNavigationHandoff());
  const [storedTour] = useState(() => readStoredTourState());
  if (!tourRefsInitializedRef.current) {
    tourStatusRef.current = storedTour.status;
    tourIndexRef.current = storedTour.index;
    tourRefsInitializedRef.current = true;
  }
  const [open, setOpen] = useState(Boolean(navigationHandoff) || storedTour.status !== 'idle'); const [mode, setMode] = useState<'text' | 'voice'>('text'); const [listening, setListening] = useState(false); const [speaking, setSpeaking] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => navigationHandoff ? [{ id: 1, role: 'assistant', content: INITIAL_MESSAGE }, { id: 2, role: 'assistant', content: navigationHandoff }] : [{ id: 1, role: 'assistant', content: INITIAL_MESSAGE }]);
  const [input, setInput] = useState(''); const [loading, setLoading] = useState(false); const [notice, setNotice] = useState(''); const [action, setAction] = useState<Action>(null); const [confirmation, setConfirmation] = useState('');
  const [suggestions, setSuggestions] = useState<CedaSuggestion[]>([]); const [suggestionGreeting, setSuggestionGreeting] = useState(''); const [suggestionsLoading, setSuggestionsLoading] = useState(false); const [selectedSuggestionId, setSelectedSuggestionId] = useState('');
  const [tourStatus, setTourStatus] = useState<TourStatus>(storedTour.status); const [tourIndex, setTourIndex] = useState(storedTour.index);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [calendarPrompt, setCalendarPrompt] = useState<CalendarPrompt>(null);
  const [actionChoices, setActionChoices] = useState<KamalActionRecord[]>([]);
  const [lastUndoToken, setLastUndoToken] = useState('');
  const { copyToComposer: copySuggestionToComposer } = useCedaSuggestionComposer<HTMLInputElement>({
    setInput,
    setSelectedSuggestionId,
    composerRef,
    onNotice: setNotice,
    confirmationNotice: 'Kamal prepared a preview. You will confirm before anything changes.',
  });

  useEffect(() => () => { keepListeningRef.current = false; recognitionRef.current?.stop(); speechGenerationRef.current += 1; window.speechSynthesis?.cancel(); }, []);
  useEffect(() => {
    tourStatusRef.current = tourStatus;
    tourIndexRef.current = tourIndex;
  }, [tourIndex, tourStatus]);
  useEffect(() => {
    if (storedTour.status === 'idle' || typeof window === 'undefined' || window.sessionStorage.getItem('kamal_guided_tour_voice') !== 'true') return;
    const timer = window.setTimeout(() => startVoice(), 250);
    return () => window.clearTimeout(timer);
    // This resumes a previously user-enabled guided tour microphone after a route switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const openKamal = () => setOpen(true);
    const startGuidedTour = () => {
      setOpen(true);
      setTourStatus('ready');
      setTourIndex(0);
      writeStoredTourState('ready', 0);
      window.sessionStorage.setItem('kamal_guided_tour_voice', 'true');
      const message = 'Guided tour is ready. Say “start tour” or select Start Tour. I will begin at the top-right user profile menu, then move through Today, Home, My Day, Workspace AI, Academic, Immigration, Career, Family, Health, Bills, Holidays, Review & Save, Memory Center, Connectors, Policies, and Settings. I will continue until you say “stop tour” or select Stop.';
      addMessage('assistant', message);
      startVoice();
      window.setTimeout(() => speak(message), 120);
    };
    window.addEventListener('kamal:open', openKamal);
    window.addEventListener('kamal:start-guided-tour', startGuidedTour);
    return () => {
      window.removeEventListener('kamal:open', openKamal);
      window.removeEventListener('kamal:start-guided-tour', startGuidedTour);
    };
    // The guided-tour listener intentionally uses the component speech helper without
    // re-registering on every render; speech state is managed through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    writeStoredTourState(tourStatus, tourIndex);
  }, [tourIndex, tourStatus]);
  useEffect(() => {
    if (tourStatus !== 'running') {
      return;
    }

    const step = TOUR_STEPS[tourIndex];
    let attempts = 0;
    let timeoutId = 0;

    function updateSpotlight() {
      const target = document.querySelector(`[data-tour-target="${step.target}"]`) || document.querySelector('[data-tour-target="main-content"]');
      if (!target) {
        attempts += 1;
        if (attempts < 20) timeoutId = window.setTimeout(updateSpotlight, 120);
        return;
      }

      const rect = target.getBoundingClientRect();
      const padding = 10;
      setSpotlightRect({
        top: Math.max(8, rect.top - padding),
        left: Math.max(8, rect.left - padding),
        width: Math.min(window.innerWidth - 16, rect.width + padding * 2),
        height: Math.min(window.innerHeight - 16, rect.height + padding * 2),
      });
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }

    updateSpotlight();
    window.addEventListener('resize', updateSpotlight);
    window.addEventListener('scroll', updateSpotlight, true);
    return () => {
      window.removeEventListener('resize', updateSpotlight);
      window.removeEventListener('scroll', updateSpotlight, true);
      window.clearTimeout(timeoutId);
    };
  }, [pathname, tourIndex, tourStatus]);
  useEffect(() => { if (open && tourStatus !== 'running') void generateKamalSuggestions(); }, [open, tourStatus]);
  function addMessage(role: ChatMessage['role'], content: string) { setMessages((current) => [...current, { id: Date.now() + current.length, role, content }]); }
  function describeTourStep(index: number) {
    const safeIndex = Math.max(0, Math.min(index, TOUR_STEPS.length - 1));
    const step = TOUR_STEPS[safeIndex];
    if (step.target === 'user-profile') window.dispatchEvent(new Event('student-tour:open-profile'));
    const message = `${step.guidance}\n\nSay “next” when you’re ready, “previous” to go back, or “stop tour” to end.`;
    addMessage('assistant', message);
    speak(message);
    if (step.path) openPath(step.path, 200, true);
  }
  function startTour() {
    setOpen(true);
    window.sessionStorage.setItem('kamal_guided_tour_voice', 'true');
    if (modeRef.current !== 'voice' || !recognitionRef.current) startVoice();
    setTourStatus('running');
    setTourIndex(0);
    tourStatusRef.current = 'running';
    tourIndexRef.current = 0;
    writeStoredTourState('running', 0);
    describeTourStep(0);
  }
  function nextTourStep() {
    const currentStatus = tourStatusRef.current;
    const currentIndex = tourIndexRef.current;
    if (currentStatus === 'ready') { startTour(); return; }
    const next = currentIndex + 1;
    if (next >= TOUR_STEPS.length) {
      const message = 'Guided tour complete. You can restart it anytime from Help / Guided tour.';
      addMessage('assistant', message);
      speak(message);
      setTourStatus('idle');
      tourStatusRef.current = 'idle';
      tourIndexRef.current = 0;
      writeStoredTourState('idle', 0);
      window.sessionStorage.removeItem('kamal_guided_tour_voice');
      return;
    }
    setTourIndex(next);
    setTourStatus('running');
    tourIndexRef.current = next;
    tourStatusRef.current = 'running';
    writeStoredTourState('running', next);
    describeTourStep(next);
  }
  function previousTourStep() {
    const previous = Math.max(0, tourIndexRef.current - 1);
    setTourStatus('running');
    setTourIndex(previous);
    tourStatusRef.current = 'running';
    tourIndexRef.current = previous;
    writeStoredTourState('running', previous);
    describeTourStep(previous);
  }
  function stopTour() {
    setTourStatus('idle');
    tourStatusRef.current = 'idle';
    tourIndexRef.current = 0;
    writeStoredTourState('idle', 0);
    window.sessionStorage.removeItem('kamal_guided_tour_voice');
    const message = 'Guided tour stopped. You can restart it from Help / Guided tour whenever you want.';
    addMessage('assistant', message);
    speak(message);
  }
  function navigate(path: string, label: string, description?: string) {
    const message = description ? `Opening ${label}. ${description}` : `Opening ${label}.`;
    window.sessionStorage.setItem('kamal_navigation_message', JSON.stringify({ message, createdAt: Date.now() }));
    addMessage('assistant', message);
    speak(message);
    openPath(path);
    window.setTimeout(() => window.sessionStorage.removeItem('kamal_navigation_message'), 3000);
  }
  function openPath(path: string, delay = 0, soft = false) {
    const targetPath = path.split('?')[0];
    window.setTimeout(() => {
      router.push(path);
      if (soft) return;
      window.setTimeout(() => { if (window.location.pathname !== targetPath) window.location.assign(path); }, 80);
      window.setTimeout(() => { if (window.location.pathname !== targetPath) window.location.href = path; }, 400);
    }, delay);
  }
  function handoffEmail(content: string) { openWorkspaceTool('email', { context: content, initialContent: content }); }
  function speak(text: string) {
    if (modeRef.current !== 'voice' || !('speechSynthesis' in window)) return;
    const spokenText = text
      .replace(/```[\s\S]*?```/g, ' Code block omitted. ')
      .replace(/https?:\/\/\S+/g, ' link ')
      .replace(/[#*_`>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!spokenText) return;

    const resumeListening = keepListeningRef.current || listening;
    keepListeningRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);

    const generation = speechGenerationRef.current + 1;
    speechGenerationRef.current = generation;
    window.speechSynthesis.cancel();
    const utterance = buildKamalUtterance(spokenText, kamalVoice);
    const finish = () => {
      if (speechGenerationRef.current !== generation) return;
      setSpeaking(false);
      if (resumeListening && modeRef.current === 'voice') startVoice();
      else setNotice('Voice response complete.');
    };
    utterance.onstart = () => { setSpeaking(true); setNotice('Kamal is speaking…'); };
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  }
  function requestConfirmation(summary: string, execute: () => void | Promise<void>) { pendingCommandRef.current = { summary, execute }; setConfirmation(summary); const prompt = `I understood: ${summary}. Should I continue? Say yes or no.`; addMessage('assistant', prompt); speak(prompt); }
  function resolveConfirmation(confirmed: boolean) { const pending = pendingCommandRef.current; if (!pending) return; pendingCommandRef.current = null; setConfirmation(''); if (confirmed) { addMessage('assistant', `Confirmed. ${pending.summary}.`); speak('Confirmed. I will do that now.'); void Promise.resolve(pending.execute()).catch((reason) => { const message = reason instanceof Error ? reason.message : 'Unable to complete that action.'; addMessage('assistant', message); speak(message); }); } else { addMessage('assistant', 'Cancelled. Tell me what you would like instead.'); speak('Cancelled. Tell me what you would like instead.'); } }

  function parseReminderCommand(text: string): ParsedReminder | null {
    if (!/\b(reminder|remider|remindar|remindre|remind me|set\s+(?:a\s+)?(?:reminder|remider|remindar|remindre)|create\s+(?:a\s+)?(?:reminder|remider|remindar|remindre)|add\s+(?:a\s+)?(?:reminder|remider|remindar|remindre))\b/i.test(text)) return null;
    const lower = text.toLowerCase();
    const now = new Date();
    const due = new Date(now);
    const tomorrowPattern = /\b(tomorrow|tomm?orr?ow|tomorow|tommorw|tmrw|tomrw)\b/i;
    const weekdayMatch = lower.match(/\b(sunday|sun|monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat)\b/i);
    if (tomorrowPattern.test(lower)) due.setDate(now.getDate() + 1);
    else if (!/\btoday\b/.test(lower)) {
      const monthMatch = text.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:,\s*(\d{4}))?/i);
      if (monthMatch) {
        const monthIndex = new Date(`${monthMatch[1]} 1, ${monthMatch[3] || now.getFullYear()}`).getMonth();
        due.setFullYear(Number(monthMatch[3] || now.getFullYear()), monthIndex, Number(monthMatch[2]));
      } else if (weekdayMatch) {
        const targetDay = WEEKDAY_INDEXES[weekdayMatch[1].toLowerCase()];
        let daysUntil = (targetDay - now.getDay() + 7) % 7;
        if (daysUntil === 0) daysUntil = 7;
        due.setDate(now.getDate() + daysUntil);
      }
    }
    const timeMatch = text.match(/\b(?:at|for)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) || text.match(/\b(?:at|for)\s*(\d{1,2}):(\d{2})\b/i);
    if (timeMatch) {
      let hour = Number(timeMatch[1]);
      const minute = Number(timeMatch[2] || 0);
      const meridiem = timeMatch[3]?.toLowerCase();
      if (meridiem === 'pm' && hour < 12) hour += 12;
      if (meridiem === 'am' && hour === 12) hour = 0;
      due.setHours(hour, minute, 0, 0);
    } else {
      due.setHours(9, 0, 0, 0);
    }
    let title = text
      .replace(/\bplease\b/gi, '')
      .replace(/\b(?:can you|could you|kamal)\b/gi, '')
      .replace(/\b(?:set|create|add)\s+(?:a\s+)?(?:reminder|remider|remindar|remindre)(?:\s+for)?\b/gi, '')
      .replace(/\bremind me(?:\s+to)?\b/gi, '')
      .replace(/\b(?:reminder|remider|remindar|remindre)\b/gi, '')
      .replace(/\b(?:at|for)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, '')
      .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, '')
      .replace(/\b(?:today|tomorrow|tomm?orr?ow|tomorow|tommorw|tmrw|tomrw)\b/gi, '')
      .replace(/\b(?:sunday|sun|monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat)\b/gi, '')
      .replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:,\s*\d{4})?\b/gi, '')
      .replace(/[.?!]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!title || title.length < 3 || /^\d{1,2}(?::\d{2})?\s*(?:am|pm)?$/i.test(title) || /^(?:for|at|on)$/i.test(title)) title = 'Reminder from Kamal';
    title = title.charAt(0).toUpperCase() + title.slice(1);
    const displayTime = due.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    return { title, dueAt: due.toISOString(), reminderDate: due.toISOString(), displayTime };
  }

  function destinationForPersonalText(text: string) {
    if (/\b(family|relationship|parent|child|children|school|birthday|friend)\b/i.test(text)) return '/student-lad/family';
    if (/\b(health|doctor|medicine|medical|wellness|workout|insurance)\b/i.test(text)) return '/student-lad/health';
    if (/\b(bill|subscription|finance|financial|payment|rent|budget|economic)\b/i.test(text)) return '/student-lad/finance';
    if (/\b(holiday|travel|trip|vacation|flight|hotel)\b/i.test(text)) return '/student-lad/holidays';
    return '/student-lad';
  }



  function parseRemoveRecordCommand(text: string): ParsedRemoveRecordCommand | null {
    if (!/\b(remove|delete|archive|clear)\b/i.test(text)) return null;
    const domain = /\b(assignment|academic|course|class|exam|quiz|note|notes|syllabus|reading|professor|lecture|homework)\b/i.test(text)
      ? 'academic'
      : /\b(visa|passport|i-20|i20|sevis|cpt|opt|stem opt|uscis|ead|immigration)\b/i.test(text)
        ? 'immigration'
        : /\b(resume|career|job|internship|recruiter|linkedin|interview|application|portfolio|cover letter)\b/i.test(text)
          ? 'career'
          : /\b(family|health|doctor|medicine|bill|subscription|finance|holiday|trip|travel|personal)\b/i.test(text)
            ? 'personal'
            : 'academic';
    const recordType = /\b(scheduled class|class time|class schedule)\b/i.test(text) || (/\bclass\b/i.test(text) && /\b\d{1,2}(?::\d{2})?\s*(am|pm)\b/i.test(text)) ? 'Scheduled Class'
      : /\bcourse|class\b/i.test(text) ? 'Course'
        : /\bassignment|homework|project|paper|submission\b/i.test(text) ? 'Assignment'
        : /\bexam|quiz|test|midterm|final\b/i.test(text) ? 'Exam / Quiz'
          : /\bnote|notes|lecture|reading\b/i.test(text) ? 'Note'
            : undefined;
    const cleaned = text
      .replace(/\bkamal\b/gi, '')
      .replace(/\b(?:please\s+)?(?:remove|delete|archive|clear)\b/gi, '')
      .replace(/\b(?:from|in|under)\s+(?:the\s+)?(?:academic|immigration|career|personal|family|health|finance|holiday|holidays|assignment|assignments|course|courses|exam|exams|quiz|quizzes|note|notes)\s+(?:section|sections|tab|area|screen|directory|folder)?\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    const fallback = cleaned || recordType || 'selected record';
    const destination = domain === 'academic' ? '/student-lad/academic' : domain === 'immigration' ? '/student-lad/immigration' : domain === 'career' ? '/student-lad/career' : destinationForPersonalText(text);
    return { domain, recordType, label: fallback.length > 48 ? `${fallback.slice(0, 45)}…` : fallback, text: fallback, destination };
  }

  function parseRecordCommand(text: string): ParsedRecordCommand | null {
    if (!/\b(add|create|save|store|remember|record)\b/i.test(text)) return null;
    const courseMatch = text.match(/\b(?:add|create|save|store|remember|record)\s+(?:a\s+)?course\s+([A-Za-z]{2,}\s*-?\s*\d{2,5}[A-Za-z]?)\b/i);
    if (courseMatch) {
      const code = courseMatch[1].replace(/\s+/g, '').toUpperCase();
      return { domain: 'academic', label: `course ${code}`, text: `Course ${code}`, destination: '/student-lad/academic' };
    }

    const domain = /\b(assignment|academic|course|class|exam|syllabus|reading|professor|lecture|homework)\b/i.test(text)
      ? 'academic'
      : /\b(visa|passport|i-20|i20|sevis|cpt|opt|stem opt|uscis|ead|immigration)\b/i.test(text)
        ? 'immigration'
        : /\b(resume|career|job|internship|recruiter|linkedin|interview|application|portfolio|cover letter)\b/i.test(text)
          ? 'career'
          : /\b(family|health|doctor|medicine|bill|subscription|finance|holiday|trip|travel|personal)\b/i.test(text)
            ? 'personal'
            : null;
    if (!domain) return null;

    const cleaned = text
      .replace(/\bkamal\b/gi, '')
      .replace(/\b(?:please\s+)?(?:add|create|save|store|remember|record)\b/gi, '')
      .replace(/\b(?:to|in|under)\s+(?:the\s+)?(?:academic|immigration|career|personal|family|health|finance|holiday|holidays)\s+(?:section|tab|area|screen)?\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    const fallback = cleaned || text.trim();
    const destination = domain === 'academic' ? '/student-lad/academic' : domain === 'immigration' ? '/student-lad/immigration' : domain === 'career' ? '/student-lad/career' : destinationForPersonalText(text);
    return { domain, label: fallback.length > 48 ? `${fallback.slice(0, 45)}…` : fallback, text: fallback, destination };
  }

  function parseTaskQuery(text: string): ParsedTaskQuery | null {
    if (!/\b(task|tasks|reminder|reminders|todo|to-do|queue)\b/i.test(text)) return null;
    if (/\b(mark|change|update|set|complete|finish|archive|delete|remove|add|create)\b/i.test(text)) return null;
    if (!/\b(tell|show|list|what|which|how many|count|total|do i have|my)\b/i.test(text)) return null;
    const lower = text.toLowerCase();
    const scope: ParsedTaskQuery['scope'] =
      /\boverdue|late|past due\b/.test(lower) ? 'overdue'
        : /\bcompleted|complete|done|finished\b/.test(lower) ? 'completed'
          : /\bupcoming|future|next\b/.test(lower) ? 'upcoming'
            : /\btoday|daily\b/.test(lower) ? 'today'
              : /\bactive|open|pending\b/.test(lower) ? 'active'
                : 'all';
    const wantsCount = /\b(how many|count|total|number)\b/i.test(text);
    return { scope, wantsCount, label: scope === 'all' ? 'tasks' : `${scope} tasks` };
  }

  function parseCedaReviewCommand(text: string): ParsedCedaReviewCommand | null {
    if (!/\b(ceda|review|saved information|memory|context|pending)\b/i.test(text)) return null;
    const actionMatch = text.match(/\b(approve|save|accept|deny|reject|discard|archive|delete|remove)\b/i);
    if (!actionMatch) return null;
    const raw = actionMatch[1].toLowerCase();
    const action: ParsedCedaReviewCommand['action'] = /approve|save|accept/.test(raw) ? 'approve' : /deny|reject|discard/.test(raw) ? 'deny' : /archive/.test(raw) ? 'archive' : 'delete';
    const all = /\b(all|everything|every pending|all pending)\b/i.test(text);
    const query = text
      .replace(/\bkamal\b/gi, '')
      .replace(/\b(?:please\s+)?(?:approve|save|accept|deny|reject|discard|archive|delete|remove)\b/gi, '')
      .replace(/\b(?:all|everything|every pending|all pending)\b/gi, '')
      .replace(/\b(?:ceda|review|saved information|memory|context|pending|items?|records?)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    return { action, all, query, label: all ? 'all pending CEDA items' : (query || 'the first pending CEDA item') };
  }

  function parseSettingCommand(text: string): ParsedSettingCommand | null {
    if (!/\b(setting|settings|theme|appearance|voice|avatar|accent|background|mode|performance)\b/i.test(text)) return null;
    if (!/\b(change|set|switch|use|apply|enable)\b/i.test(text)) return null;
    const lower = text.toLowerCase();
    const includes = (values: string[]) => values.some((value) => lower.includes(value.toLowerCase()));
    if (includes(['elder female', 'mature female', 'mature woman', 'maya'])) return { key: 'voice', value: 'Maya', label: 'Kamal voice to Maya' };
    if (includes(['elder male', 'mature male', 'mature man', 'river'])) return { key: 'voice', value: 'River', label: 'Kamal voice to River' };
    if (includes(['young female', 'young woman', 'asha'])) return { key: 'voice', value: 'Asha', label: 'Kamal voice to Asha' };
    if (includes(['young male', 'young man', 'noah'])) return { key: 'voice', value: 'Noah', label: 'Kamal voice to Noah' };
    const avatarMap: Array<[KamalAvatar, string[]]> = [['🪷', ['lotus']], ['🦜', ['parrot']], ['🧭', ['compass']], ['🌙', ['moon']], ['🧠', ['brain']], ['✨', ['sparkle', 'star']]];
    for (const [value, names] of avatarMap) if (includes(names)) return { key: 'kamalAvatar', value, label: `Kamal avatar to ${names[0]}` };
    const theme = lower.match(/\b(light|dark|system)\b/);
    if (theme && (/\b(theme|appearance|dark mode|light mode|system mode)\b/.test(lower) || !/\b(execution|online|offline|hybrid|cloud)\b/.test(lower))) return { key: 'theme', value: (theme[1][0].toUpperCase() + theme[1].slice(1)) as StudentTheme, label: `appearance to ${theme[1]}` };
    const execution = lower.match(/\b(offline|hybrid|cloud|online)\b/);
    if (execution && /\b(mode|execution|online|offline|hybrid|cloud)\b/.test(lower)) return { key: 'mode', value: (execution[1] === 'online' ? 'Cloud' : execution[1][0].toUpperCase() + execution[1].slice(1)) as StudentExecutionMode, label: `execution mode to ${execution[1]}` };
    const performance = lower.match(/\b(lightweight|standard|high)\b/);
    if (performance && /\b(performance|profile|device)\b/.test(lower)) return { key: 'performanceProfile', value: (performance[1][0].toUpperCase() + performance[1].slice(1)) as PerformanceProfile, label: `performance profile to ${performance[1]}` };
    for (const value of ['Prism', 'Craft', 'Forma', 'Luma', 'Studio'] as StudentUiTheme[]) if (lower.includes(value.toLowerCase())) return { key: 'uiTheme', value, label: `UI theme to ${value}` };
    for (const value of ['Emerald', 'Indigo', 'Rose', 'Amber', 'Sky', 'Violet'] as AccentColor[]) if (lower.includes(value.toLowerCase())) return { key: 'accentColor', value, label: `accent color to ${value}` };
    for (const value of ['Warm White', 'Mist', 'Ivory', 'Slate', 'Mint', 'Sand'] as AppBackground[]) if (lower.includes(value.toLowerCase())) return { key: 'background', value, label: `app background to ${value}` };
    return null;
  }

  function textScore(haystack: string, query: string) {
    const normalizedHaystack = haystack.toLowerCase();
    const words = query.toLowerCase().split(/\s+/).filter((word) => word.length > 2);
    if (!words.length) return 0;
    return words.reduce((score, word) => score + (normalizedHaystack.includes(word) ? 2 : 0), 0);
  }

  async function logKamalAction(eventType: string, payload: Record<string, unknown>, sensitivity: 'public' | 'internal' | 'private' | 'sensitive' = 'private') {
    try {
      await authenticatedFetch(`${API_BASE_URL}/api/v1/ceda/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authorizationHeaders() },
        body: JSON.stringify({
          event_type: eventType,
          payload,
          source_module: 'kamal_voice_or_text',
          event_id: `kamal-${eventType}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          sensitivity,
        }),
      });
    } catch {
      try {
        const key = userStorageKey('kamal_action_log');
        const existing = JSON.parse(window.localStorage.getItem(key) || '[]') as unknown[];
        window.localStorage.setItem(key, JSON.stringify([{ event_type: eventType, payload, created_at: new Date().toISOString() }, ...existing].slice(0, 200)));
      } catch {}
    }
  }

  function formatKamalActionRecord(record?: KamalActionRecord | null) {
    if (!record) return 'selected task';
    const date = formatTaskDate(record.due_at || record.reminder_date || undefined);
    const status = record.status || 'active';
    return `“${record.title}” · due ${date} · currently ${status}`;
  }

  function looksLikeTaskMutationCommand(text: string) {
    const lower = text.toLowerCase();
    const mentionsTask = /\b(task|tasks|reminder|reminders|todo|to-do|bill|quiz|assignment|appointment|thing|it)\b/.test(lower);
    const mutationVerb = /\b(mark|complete|completed|finish|finished|done|reopen|incomplete|archive|delete|remove|restore|undo|change|update|move|fix)\b|\bas complete(?:d)?\b|\bto complete(?:d)?\b/.test(lower);
    const readIntent = /\b(tell|show|list|what|which|how many|count|total|do i have|review)\b/.test(lower);
    return mentionsTask && mutationVerb && !readIntent;
  }

  function formatKamalActionPreview(preview: KamalActionPreview) {
    const item = preview.item;
    const beforeStatus = String(preview.before?.status || item?.status || 'active');
    const afterStatus = String(preview.after?.status || preview.action?.changes?.status || 'active');
    if (preview.action?.operation === 'UNDO') {
      return `undo the last change for ${formatKamalActionRecord(item)} back to ${afterStatus}`;
    }
    return `change ${formatKamalActionRecord(item)} from ${beforeStatus} to ${afterStatus}`;
  }

  async function executeKamalAction(actionToRun: KamalActionContract) {
    const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/kamal/actions/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authorizationHeaders() },
      body: JSON.stringify({ action: actionToRun }),
    });
    const data = await response.json().catch(() => ({})) as { message?: string; item?: KamalActionRecord; undo_token?: string; detail?: string };
    if (!response.ok) throw new Error(data.detail || 'I could not update that task.');
    if (data.undo_token) setLastUndoToken(data.undo_token);
    const message = data.message || `Updated ${data.item?.title || 'the selected task'}. Tasks, Calendar, My Day, and Upcoming will refresh from the same record.`;
    addMessage('assistant', message);
    speak(message);
    setActionChoices([]);
    window.dispatchEvent(new Event('student-lad:refresh'));
  }

  async function previewKamalAction(message: string): Promise<boolean> {
    setActionChoices([]);
    const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/kamal/actions/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authorizationHeaders() },
      body: JSON.stringify({ message, source: modeRef.current }),
    });
    if (response.status === 404 || response.status === 422) return false;
    const preview = await response.json().catch(() => ({})) as KamalActionPreview & { detail?: string };
    if (!response.ok) throw new Error(preview.detail || 'I could not prepare a safe task action.');
    if (preview.status === 'ignored') return false;
    if (preview.status === 'not_found') {
      const reply = preview.message || 'I could not find a matching active task or reminder, so nothing was changed.';
      addMessage('assistant', reply);
      speak(reply);
      return true;
    }
    if (preview.status === 'clarification_required') {
      const candidates = Array.isArray(preview.candidates) ? preview.candidates.filter((candidate) => candidate.action) : [];
      setActionChoices(candidates);
      const reply = preview.message || 'I found more than one matching task. Please choose the exact record before I change anything.';
      addMessage('assistant', reply);
      speak(reply);
      return true;
    }
    if (preview.status === 'preview' && preview.action) {
      requestConfirmation(formatKamalActionPreview(preview), () => executeKamalAction(preview.action as KamalActionContract));
      return true;
    }
    return false;
  }

  function confirmKamalActionChoice(choice: KamalActionRecord) {
    if (!choice.action) return;
    setActionChoices([]);
    requestConfirmation(`change ${formatKamalActionRecord(choice)} to ${String(choice.action.changes?.status || 'the requested status')}`, () => executeKamalAction(choice.action as KamalActionContract));
  }

  function requestUndoLastKamalAction() {
    if (!lastUndoToken) return;
    const actionToRun: KamalActionContract = {
      actionId: `kamal-undo-${Date.now()}`,
      operation: 'UNDO',
      entityType: 'reminder',
      source: modeRef.current,
      requiresConfirmation: true,
      changes: { undo_token: lastUndoToken },
    };
    requestConfirmation('undo the last confirmed task change', () => executeKamalAction(actionToRun));
  }

  function formatTaskDate(value?: string) {
    if (!value) return 'no date';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' });
  }

  async function answerTaskQuery(query: ParsedTaskQuery) {
    const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/tasks?scope=${encodeURIComponent(query.scope)}`, { headers: authorizationHeaders() });
    const data = await response.json().catch(() => ({})) as { items?: StudentTaskItem[]; counts?: Record<string, number> };
    if (!response.ok) throw new Error('I could not read your task queue right now.');
    const items = Array.isArray(data.items) ? data.items : [];
    const count = typeof data.counts?.[query.scope] === 'number' ? data.counts[query.scope] : items.length;
    const noun = count === 1 ? 'task' : 'tasks';
    let message = `You have ${count} ${query.label === 'tasks' ? '' : `${query.scope} `}${noun}.`;
    if (!query.wantsCount && items.length) {
      const lines = items.slice(0, 5).map((task) => {
        const priority = task.priority && task.priority !== 'normal' ? ` · ${task.priority.toUpperCase()}` : '';
        return `• ${task.title} — ${formatTaskDate(task.dueAt)}${priority}`;
      });
      message += `\n${lines.join('\n')}`;
      if (items.length > 5) message += `\n…and ${items.length - 5} more.`;
    } else if (!items.length && !query.wantsCount) {
      message += ' Nothing is in that part of your queue yet.';
    }
    if (query.scope === 'overdue' && count > 0) message += '\nWould you like me to open Tasks so you can review them?';
    addMessage('assistant', message);
    speak(message);
  }

  async function applyCedaReviewCommand(command: ParsedCedaReviewCommand) {
    const status = command.action === 'approve' || command.action === 'deny' ? 'pending' : 'approved';
    const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/ceda/items?status=${status}`, { headers: authorizationHeaders() });
    const items = await response.json().catch(() => []) as CedaStructuredItem[];
    if (!response.ok) throw new Error('I could not read the CEDA review queue.');
    const matches = command.all
      ? items
      : items.map((item) => ({ item, score: textScore(`${item.summary} ${item.type} ${item.related_item || ''}`, command.query) })).filter((entry) => command.query ? entry.score > 0 : true).sort((a, b) => b.score - a.score).slice(0, 1).map((entry) => entry.item);
    if (!matches.length) throw new Error(command.all ? `There are no ${status} CEDA items to ${command.action}.` : `I could not find a CEDA item matching “${command.query || 'first item'}”.`);
    if (command.all && (command.action === 'approve' || command.action === 'deny')) {
      const bulk = await authenticatedFetch(`${API_BASE_URL}/api/v1/ceda/items/bulk-${command.action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authorizationHeaders() },
        body: JSON.stringify({ item_ids: matches.map((item) => item.id) }),
      });
      const bulkData = await bulk.json().catch(() => ({}));
      if (!bulk.ok) throw new Error(bulkData.detail || `Unable to ${command.action} the selected CEDA items.`);
    } else {
      for (const item of matches) {
        const res = await authenticatedFetch(`${API_BASE_URL}/api/v1/ceda/items/${item.id}/${command.action}`, { method: 'POST', headers: authorizationHeaders() });
        const itemData = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(itemData.detail || `Unable to ${command.action} “${item.summary}”.`);
      }
    }
    await logKamalAction(`ceda.item_${command.action}`, { item_ids: matches.map((item) => item.id), label: command.label });
    const actionLabel = command.action === 'approve' ? 'approved and saved' : command.action === 'deny' ? 'denied' : command.action === 'archive' ? 'archived' : 'deleted';
    const message = `${matches.length} CEDA item${matches.length === 1 ? '' : 's'} ${actionLabel}. Review & Save will refresh now.`;
    addMessage('assistant', message);
    speak(message);
    window.dispatchEvent(new Event('student-lad:refresh'));
    openPath('/student-lad/review', 250);
  }

  async function applySettingCommand(command: ParsedSettingCommand) {
    if (command.key === 'theme') setTheme(command.value as StudentTheme);
    else if (command.key === 'mode') setExecutionMode(command.value as StudentExecutionMode);
    else if (command.key === 'uiTheme') setUiTheme(command.value as StudentUiTheme);
    else if (command.key === 'kamalAvatar') setKamalAvatar(command.value as KamalAvatar);
    else if (command.key === 'voice') setVoice(command.value as LocalVoice);
    else if (command.key === 'accentColor') setAccentColor(command.value as AccentColor);
    else if (command.key === 'background') setBackground(command.value as AppBackground);
    else if (command.key === 'performanceProfile') setPerformanceProfile(command.value as PerformanceProfile);
    try {
      await authenticatedFetch(`${API_BASE_URL}/api/v1/settings/app-preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authorizationHeaders() },
        body: JSON.stringify({ preferences: { [command.key]: command.value } }),
      });
    } catch {}
    await logKamalAction('settings.preference_updated', { key: command.key, value: command.value, label: command.label });
    const message = `Updated ${command.label}. The setting was saved for this user and logged.`;
    addMessage('assistant', message);
    speak(message);
    window.dispatchEvent(new Event('student-lad:settings-updated'));
  }


  function recordScore(item: ContextRegistryRecord, command: ParsedRemoveRecordCommand) {
    const haystack = `${item.title} ${item.type} ${item.domain}`.toLowerCase();
    const words = command.text.toLowerCase().split(/\s+/).filter((word) => word.length > 2);
    const wordScore = words.reduce((score, word) => score + (haystack.includes(word) ? 2 : 0), 0);
    const typeScore = command.recordType && item.type.toLowerCase().includes(command.recordType.toLowerCase().split(' ')[0]) ? 5 : 0;
    return wordScore + typeScore;
  }

  async function removeStructuredRecord(record: ParsedRemoveRecordCommand) {
    const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/context-os/registry?domain=${encodeURIComponent(record.domain)}`, { headers: authorizationHeaders() });
    const items = await response.json().catch(() => []) as ContextRegistryRecord[];
    if (!response.ok) throw new Error('Unable to search saved records for removal.');
    const ranked = items
      .filter((item) => item.status === 'active')
      .map((item) => ({ item, score: recordScore(item, record) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    const match = ranked[0]?.item;
    if (!match) throw new Error(`I could not find an active ${record.domain} record matching “${record.text}”.`);
    const remove = await authenticatedFetch(`${API_BASE_URL}/api/v1/ceda/objects/${match.context_id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authorizationHeaders() },
      body: JSON.stringify({ target: 'deleted', reason: `Kamal remove command: ${record.text}` }),
    });
    const data = await remove.json().catch(() => ({}));
    if (!remove.ok) throw new Error(data.detail || 'Unable to remove that saved record.');
    await logKamalAction('record.removed', { context_id: match.context_id, title: match.title, domain: record.domain, command: record.text });
    const message = `Removed ${match.title} from ${record.domain}. The remove command was logged by CEDA.`;
    addMessage('assistant', message);
    speak(message);
    window.dispatchEvent(new Event('student-lad:refresh'));
    openPath(record.destination, 250);
  }

  function academicRecordType(record: { title?: string; type?: string; summary?: string; related_item?: string; payload?: { instruction?: string }; metadata?: { extracted_fields?: { record_type?: string } } }) {
    const explicit = record.metadata?.extracted_fields?.record_type;
    if (explicit && !/^(structured information|structured_information|academic information)$/i.test(explicit)) return explicit;
    const text = `${record.type || ''} ${record.title || ''} ${record.summary || ''} ${record.related_item || ''} ${record.payload?.instruction || ''}`.toLowerCase().replace(/\s+/g, ' ');
    if (/(scheduled class|class time|class schedule|lecture time|seminar|meets? at)/i.test(text)) return 'Scheduled Class';
    if (/(^|[^a-z0-9])(course|cource|courses|course structure|class code)([^a-z0-9]|$)/i.test(text) || /\b(intr|dsrt)\s*-?\s*\d{2,5}[a-z]?\b/i.test(text)) return 'Course';
    if (/(assignment|homework|submission|due|module\s*\d+|\bm\d+\b)/i.test(text)) return 'Assignment';
    if (/(exam|quiz|test|midterm|final)/i.test(text)) return 'Exam / Quiz';
    if (/(note|notes|reading|lecture note)/i.test(text)) return 'Note';
    return record.type || 'Academic record';
  }

  function academicRecordTitle(record: { title?: string; summary?: string; related_item?: string; payload?: { instruction?: string }; metadata?: { extracted_fields?: { title?: string } } }) {
    return (record.metadata?.extracted_fields?.title || record.title || record.related_item || record.summary || record.payload?.instruction || 'Academic record')
      .replace(/^academic record:\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isAcademicCourseQuestion(text: string) {
    return /\b(what|which|show|list|view|tell me|registered|saved|my)\b/i.test(text) && /\b(courses?|classes|subjects?)\b/i.test(text) && !/\b(add|create|save|store|remove|delete)\b/i.test(text);
  }

  async function answerAcademicCourseQuestion() {
    const [registryResponse, cedaResponse] = await Promise.all([
      authenticatedFetch(`${API_BASE_URL}/api/v1/context-os/registry?domain=academic`, { headers: authorizationHeaders() }),
      authenticatedFetch(`${API_BASE_URL}/api/v1/ceda/items?status=approved&domain=academic`, { headers: authorizationHeaders() }),
    ]);
    const registry = registryResponse.ok ? await registryResponse.json().catch(() => []) as ContextRegistryRecord[] : [];
    const ceda = cedaResponse.ok ? await cedaResponse.json().catch(() => []) as CedaStructuredItem[] : [];
    const courseNames = new Map<string, string>();
    for (const item of registry.filter((record) => record.status === 'active' && academicRecordType(record) === 'Course')) {
      const title = academicRecordTitle(item);
      if (title) courseNames.set(title.toLowerCase(), title);
    }
    for (const item of ceda.filter((record) => record.status === 'approved' && academicRecordType(record) === 'Course')) {
      const title = academicRecordTitle(item);
      if (title) courseNames.set(title.toLowerCase(), title);
    }
    const courses = [...courseNames.values()].sort((a, b) => a.localeCompare(b));
    const message = courses.length
      ? `You have ${courses.length} saved course${courses.length === 1 ? '' : 's'} in Academic:\n${courses.map((course) => `• ${course}`).join('\n')}\n\nThese come from approved CEDA/Context OS academic records.`
      : 'I do not see any approved course records yet. You can say “Kamal add course INTR799 to the academic section,” or add one from Academic.';
    addMessage('assistant', message);
    speak(message);
  }

  function isReportCreationRequest(text: string) {
    return /\b(create|make|build|write|draft|generate|prepare)\b/i.test(text)
      && /\b(report|research report|project report|analysis report|document report)\b/i.test(text)
      && !/\b(issue|bug|problem|support ticket|technical support)\b/i.test(text);
  }

  function openWorkspaceReportRequest(text: string) {
    const prompt = text.toLowerCase().includes('report') ? text : `Create a report: ${text}`;
    window.sessionStorage.setItem('dorje_voice_prompt', prompt);
    const message = 'Reports are created through Workspace AI chat. I’m opening Workspace AI and placing your report request in the composer so DorjeAI can ask for sources, analyze files, and produce the report.';
    window.sessionStorage.setItem('kamal_navigation_message', JSON.stringify({ message, createdAt: Date.now() }));
    addMessage('assistant', message);
    speak(message);
    if (pathname.startsWith('/dorje-ai')) {
      window.dispatchEvent(new CustomEvent('dorje-voice-prompt', { detail: prompt }));
    } else {
      openPath('/dorje-ai', 250);
    }
  }

  async function createStructuredRecord(record: ParsedRecordCommand) {
    const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/ceda/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authorizationHeaders() },
      body: JSON.stringify({ text: `${record.domain} record: ${record.text}`, source_type: 'kamal_voice_or_text', source_reference: 'Kamal command' }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Unable to save this record through CEDA.');
    if (data.duplicate_item_id) {
      const duplicateMessage = `That ${record.domain} record already exists, so I did not create a duplicate. Opening the ${record.domain} section.`;
      addMessage('assistant', duplicateMessage);
      speak(duplicateMessage);
      openPath(record.destination);
      return;
    }
    const items = Array.isArray(data.items) ? data.items as Array<{ id: string }> : [];
    for (const item of items) {
      const approve = await authenticatedFetch(`${API_BASE_URL}/api/v1/ceda/items/${item.id}/approve`, { method: 'POST', headers: authorizationHeaders() });
      if (!approve.ok) {
        const approveData = await approve.json().catch(() => ({}));
        throw new Error(approveData.detail || 'CEDA extracted the record, but approval failed.');
      }
    }
    const message = items.length
      ? `Added ${record.label} to the ${record.domain} section. Opening it now.`
      : `I could not find a structured ${record.domain} record to save. Try adding a course, deadline, date, application, or note.`;
    if (items.length) await logKamalAction('record.created', { item_ids: items.map((item) => item.id), domain: record.domain, label: record.label, source: 'kamal_voice_or_text' });
    addMessage('assistant', message);
    speak(message);
    window.dispatchEvent(new Event('student-lad:refresh'));
    openPath(record.destination);
  }

  async function createLocalReminder(reminder: ParsedReminder) {
    const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/ceda/reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authorizationHeaders() },
      body: JSON.stringify({ title: reminder.title, due_at: reminder.dueAt, reminder_date: reminder.reminderDate, priority: 'normal', source: 'kamal_voice_command' }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || (response.status === 405 ? 'Calendar reminder endpoint is not available on the running backend. Restart the Student-LAD backend on port 8100.' : 'Unable to create this reminder.'));
    await logKamalAction('reminder.created', { reminder_id: data.id, title: data.title, due_at: data.due_at || reminder.dueAt, source: 'kamal_voice_command' });
    const message = `Reminder created: ${data.title} for ${reminder.displayTime}. It is now visible in Calendar & Timeline.`;
    addMessage('assistant', message);
    speak(message);
    setCalendarPrompt({ reminderId: data.id, title: data.title, dueAt: data.due_at || reminder.dueAt, displayTime: reminder.displayTime });
    window.dispatchEvent(new Event('student-lad:refresh'));
  }

  async function connectCalendarProvider(provider: 'google-calendar' | 'apple-calendar' | 'microsoft-calendar') {
    try {
      if (provider === 'google-calendar') {
        const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/connectors/google/google-calendar/connect`, { headers: authorizationHeaders() });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Unable to start Google Calendar connection.');
        addMessage('assistant', 'Opening Google Calendar permissions. After connection, Kamal can sync approved reminders to your Google calendar.');
        window.location.href = data.authorization_url;
        return;
      }
      const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/dorje-ai/connectors/${provider}/connect`, { method: 'POST', headers: authorizationHeaders() });
      const data = await response.json();
      addMessage('assistant', data.message || `${provider.replace('-', ' ')} connector is being prepared. Your reminder remains saved locally.`);
      speak(data.message || 'This connector is being prepared. Your reminder remains saved locally.');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Unable to open this calendar connector.';
      addMessage('assistant', message);
      speak(message);
    }
  }

  async function processInput(text: string, showUser = true) {
    const clean = text.trim(); if (!clean || loading) return; if (showUser) addMessage('user', clean); setInput(''); setAction(null);
    if (pendingCommandRef.current) { if (/\b(yes|yeah|yep|confirm|confirmed|continue|proceed|do it|correct|okay|ok)\b/i.test(clean)) resolveConfirmation(true); else if (/\b(no|nope|cancel|stop|wrong|do not|don't)\b/i.test(clean)) resolveConfirmation(false); else { const prompt = `Please say yes to confirm or no to cancel: ${pendingCommandRef.current.summary}.`; addMessage('assistant', prompt); speak(prompt); } return; }
    if (tourStatusRef.current !== 'idle' || /\b(start tour|guided tour)\b/i.test(clean)) {
      if (/\b(stop|stop tour|end tour|quit tour|cancel tour)\b/i.test(clean)) { stopTour(); return; }
      if (/\b(start tour|begin tour|start|begin)\b/i.test(clean)) { startTour(); return; }
      if (/\b(next|continue|go on|forward)\b/i.test(clean)) { nextTourStep(); return; }
      if (/\b(previous|back|go back)\b/i.test(clean)) { previousTourStep(); return; }
    }
    if (/\bdismiss suggestions?\b/i.test(clean)) {
      await Promise.all(suggestions.map((suggestion) => dismissKamalSuggestion(suggestion)));
      const reply = 'Suggestions dismissed.';
      addMessage('assistant', reply);
      speak(reply);
      return;
    }
    const useFirstSuggestion = /\b(use|choose|select|copy)\s+(?:the\s+)?first suggestion\b/i.test(clean);
    const suggestionByLabel = suggestions.find((suggestion) => new RegExp(`\\b(?:use|choose|select|copy)\\s+${escapeRegExp(suggestion.label)}\\b`, 'i').test(clean));
    if (useFirstSuggestion || suggestionByLabel) {
      const suggestion = suggestionByLabel || suggestions[0];
      if (suggestion) {
        await copySuggestionToComposer(suggestion);
        const reply = `Copied “${suggestion.label}” into the composer. Edit it or say send when ready.`;
        addMessage('assistant', reply);
        speak(reply);
      }
      return;
    }
    const taskMutationIntent = looksLikeTaskMutationCommand(clean);
    try {
      const handledKamalAction = await previewKamalAction(clean);
      if (handledKamalAction) return;
      if (taskMutationIntent) {
        const fallback = 'I could not identify an exact task action safely, so nothing was changed. Please say the exact task title or choose it from Tasks.';
        addMessage('assistant', fallback);
        speak(fallback);
        return;
      }
    } catch {
      const fallback = 'I could not prepare a safe task action right now. Nothing was changed.';
      addMessage('assistant', fallback);
      speak(fallback);
      return;
    }
    const taskQuery = parseTaskQuery(clean);
    if (taskQuery) { setLoading(true); try { await answerTaskQuery(taskQuery); } catch { const fallback = 'I could not read your task queue right now. Please try again after the workspace finishes loading.'; addMessage('assistant', fallback); speak(fallback); } finally { setLoading(false); } return; }
    const cedaReviewCommand = parseCedaReviewCommand(clean);
    if (cedaReviewCommand) { requestConfirmation(`${cedaReviewCommand.action} ${cedaReviewCommand.label}`, () => applyCedaReviewCommand(cedaReviewCommand)); return; }
    const settingCommand = parseSettingCommand(clean);
    if (settingCommand) { requestConfirmation(`change ${settingCommand.label}`, () => applySettingCommand(settingCommand)); return; }
    if (isReportCreationRequest(clean)) { requestConfirmation('open Workspace AI and prepare this report request', () => openWorkspaceReportRequest(clean)); return; }
    const removeRecordCommand = parseRemoveRecordCommand(clean);
    if (removeRecordCommand) { requestConfirmation(`remove ${removeRecordCommand.label} from the ${removeRecordCommand.domain} section`, () => removeStructuredRecord(removeRecordCommand)); return; }
    const recordCommand = parseRecordCommand(clean);
    if (recordCommand) { requestConfirmation(`add ${recordCommand.label} to the ${recordCommand.domain} section`, () => createStructuredRecord(recordCommand)); return; }
    const reminder = parseReminderCommand(clean);
    if (reminder) { requestConfirmation(`create a local reminder “${reminder.title}” for ${reminder.displayTime}`, () => createLocalReminder(reminder)); return; }
    if (isAcademicCourseQuestion(clean)) { setLoading(true); try { await answerAcademicCourseQuestion(); } catch { const fallback = 'I could not read your Academic records right now. Please try again after the workspace finishes loading.'; addMessage('assistant', fallback); speak(fallback); } finally { setLoading(false); } return; }
    const typeMatch = clean.match(/(?:\b(?:dorje ?ai|dorje|multi[- ]?agent|workspace|chat)(?: and)?\s+)?\b(?:type|write|enter|dictate)\s+(.+)/i);
    if (typeMatch?.[1]) { const prompt = typeMatch[1].trim(); requestConfirmation(`open DorjeAI and type “${prompt}”`, () => { window.sessionStorage.setItem('dorje_voice_prompt', prompt); if (pathname.startsWith('/dorje-ai')) window.dispatchEvent(new CustomEvent('dorje-voice-prompt', { detail: prompt })); else router.push('/dorje-ai'); }); return; }
    if (/\b(?:send|submit)(?: it| message| prompt)?\b/i.test(clean) && pathname.startsWith('/dorje-ai')) { requestConfirmation('send the current DorjeAI message', () => document.getElementById('dorje-send-message')?.click()); return; }
    const route = routes.find((candidate) => candidate.pattern.test(clean)); const navigationIntent = /\b(go|open|navigate|take me|show me|switch|visit|bring me|send me|enter)\b/i.test(clean) || /^(?:the )?(?:dashboard|home(?:page)?|my day|calendar|tasks?|academic|immigration|career|family|health|finance|holidays?|review|records?|workspace|memory|policies?|connectors?|vault|settings?|analytics|kamal|dorje ?ai|workspace ?ai|templates?|organizations?)$/i.test(clean); if (route && navigationIntent) { requestConfirmation(`open ${route.label}`, () => navigate(route.path, route.label, route.description)); return; }
    if (/\b(support ticket|report (?:an |a )?issue|technical support|need support|help ticket)\b/i.test(clean)) { requestConfirmation('open the support request form', () => { setAction('support'); addMessage('assistant', 'Tell me the issue and priority below. I’ll create a tracked local support request and prepare an email handoff if you want one.'); }); return; }
    if (/\b(call ?back|call me|request a call|phone me)\b/i.test(clean)) { requestConfirmation('open the callback request form', () => { setAction('callback'); addMessage('assistant', 'Please provide your preferred time, contact details, and agenda.'); }); return; }
    if (/\b(schedule|arrange|book|set up).{0,40}\b(call|meeting|appointment)\b/i.test(clean)) { requestConfirmation('prepare a scheduled call', () => { setAction('schedule'); addMessage('assistant', 'I can prepare the invitation and email. Calendar and directory access require their connectors before Kamal can publish the event.'); }); return; }
    const assistantId = Date.now() + 1; const history = messages.slice(-6).map(({ role, content }) => ({ role, content })); setMessages((current) => [...current, { id: assistantId, role: 'assistant', content: '' }]); setLoading(true);
    try { const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/chat/kamal`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...authorizationHeaders() }, body: JSON.stringify({ message: clean, history }) }); const reply = await readTextStream(response, (chunk) => setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: message.content + chunk } : message))); if (!reply) throw new Error('Empty response'); speak(reply); const cedaResponse = await authenticatedFetch(`${API_BASE_URL}/api/v1/ceda/dashboard`, { headers: authorizationHeaders() }); if (cedaResponse.ok) { const ceda = await cedaResponse.json(); if (ceda.pending_approvals > 0) setNotice(`CEDA has ${ceda.pending_approvals} context item${ceda.pending_approvals === 1 ? '' : 's'} awaiting your approval.`); } }
    catch { const fallback = 'I’m temporarily offline. You can still use navigation and request tools, or email contact@lotusanddorje.org.'; setMessages((current) => current.map((message) => message.id === assistantId && !message.content ? { ...message, content: fallback } : message)); speak(fallback); }
    finally { setLoading(false); }
  }

  function startVoice() {
    const browserWindow = window as Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }; const Constructor = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!Constructor) { setNotice('Voice control is not supported in this browser.'); setMode('text'); return; }
    const recognition = new Constructor(); recognition.continuous = true; recognition.interimResults = false; recognition.lang = 'en-US';
    recognition.onresult = (event) => { for (let index = event.resultIndex; index < event.results.length; index += 1) if (event.results[index].isFinal) { const transcript = event.results[index][0].transcript.trim(); setNotice(`Heard: ${transcript}`); void processInput(transcript); } };
    recognition.onerror = (event) => { if (event.error !== 'no-speech' && event.error !== 'aborted') setNotice(`Voice error: ${event.error}`); };
    recognition.onend = () => { if (keepListeningRef.current) { try { recognition.start(); } catch { setNotice('Voice control paused. Toggle it to restart.'); } } else setListening(false); };
    recognitionRef.current = recognition; keepListeningRef.current = true; modeRef.current = 'voice'; setMode('voice'); try { recognition.start(); setListening(true); setNotice('Listening. Speak an option or command.'); } catch { setNotice('Unable to start microphone access.'); }
  }
  function stopVoice() { keepListeningRef.current = false; recognitionRef.current?.stop(); recognitionRef.current = null; speechGenerationRef.current += 1; window.speechSynthesis?.cancel(); setListening(false); setSpeaking(false); setNotice('Voice control off.'); }
  function changeMode(next: 'text' | 'voice') { modeRef.current = next; setMode(next); if (next === 'voice') startVoice(); else stopVoice(); }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void processInput(input); }

  async function generateKamalSuggestions(message = '') {
    setSuggestionsLoading(true);
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/suggestions/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authorizationHeaders() }, body: JSON.stringify({ surface: 'kamal_chat', workspace_id: 'personal', conversation_id: 'kamal-chat', current_message: message || null, maximum_suggestions: 3 }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Unable to load suggestions.');
      setSuggestionGreeting(data.greeting || 'Here are useful next steps.');
      setSuggestions(data.suggestions || []);
    } catch {
      setSuggestions([]); setSuggestionGreeting('');
    } finally {
      setSuggestionsLoading(false);
    }
  }

  async function dismissKamalSuggestion(suggestion: CedaSuggestion) {
    setSuggestions((current) => current.filter((item) => item.id !== suggestion.id));
    try { await authenticatedFetch(`${API_BASE_URL}/api/v1/suggestions/${suggestion.id}/dismiss`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authorizationHeaders() }, body: JSON.stringify({ reason: 'dismissed_from_kamal_chat' }) }); } catch {}
  }

  const tourRunning = tourStatus === 'running';
  return <>
    {tourRunning ? <TourSpotlight rect={spotlightRect} step={TOUR_STEPS[tourIndex]} /> : null}
    <button type="button" onClick={() => setOpen((value) => !value)} className="kamal-float fixed bottom-6 right-6 z-50 flex h-16 w-16 items-center justify-center rounded-full border border-sky-200 bg-white text-4xl shadow-lg shadow-sky-100 transition hover:scale-105" aria-label="Open Kamal assistant" data-kamal-voice={kamalVoice} title={`Open Kamal assistant · ${kamalVoice} voice`}>{kamalAvatar}</button>
    {open ? <div role="dialog" aria-label="Kamal assistant" data-kamal-voice={kamalVoice} className={`fixed right-6 z-[90] flex max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl transition-all ${tourRunning ? 'bottom-6 w-[22rem]' : 'bottom-24 h-[min(40rem,calc(100dvh-7rem))] w-[25rem]'}`}>
      <header className="border-b border-slate-800 bg-slate-950 px-4 py-3 text-white"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="text-2xl" aria-hidden="true">{kamalAvatar}</span><div><h2 className="text-lg font-semibold">Kamal</h2><p className="text-xs text-slate-400">Application, support &amp; workflow assistant</p></div></div><button type="button" onClick={() => setOpen(false)} className="rounded-full bg-slate-800 p-2 text-slate-200"><X size={16} /></button></div><div className="mt-3 grid grid-cols-2 rounded-xl bg-slate-900 p-1"><ModeButton active={mode === 'text'} icon={Keyboard} label="Text" onClick={() => changeMode('text')} /><ModeButton active={mode === 'voice'} icon={listening ? Mic : MicOff} label={listening ? 'Listening' : 'Voice'} onClick={() => changeMode('voice')} /></div></header>
      {!tourRunning ? <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">{messages.map((message) => <div key={message.id} className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-6 ${message.role === 'assistant' ? 'bg-white text-slate-700 shadow-sm' : 'ml-auto bg-sky-600 text-white'}`}>{message.content}</div>)}{loading ? <div className="text-sm text-slate-500">Kamal is responding…</div> : null}{speaking ? <div className="text-sm text-emerald-600">Kamal is speaking…</div> : null}</div> : null}
      <div className="border-t border-slate-200 bg-white p-3">{!tourRunning ? <div className="mb-2 flex items-center justify-end gap-1.5 rounded-2xl border border-slate-100 bg-slate-50/80 px-2 py-1.5"><QuickAction icon={Navigation} label="Navigate app" onClick={() => addMessage('assistant', 'Say or type: “Take me to Home”, “Open My Day”, “Open Academic”, “Open Calendar”, “Open Workspace AI”, or “Settings”.')} /><QuickAction icon={Brain} label="CEDA context" onClick={() => requestConfirmation('open Review & Save', () => navigate('/student-lad/review', 'Review & Save', 'Review & Save shows CEDA items waiting for approval plus saved information, reminders, sources, and history.'))} /><QuickAction icon={BookOpen} label="Guided tour" onClick={() => window.dispatchEvent(new Event('kamal:start-guided-tour'))} /><QuickAction icon={LifeBuoy} label="Support ticket" onClick={() => setAction('support')} /><QuickAction icon={PhoneCall} label="Request callback" onClick={() => setAction('callback')} /><QuickAction icon={CalendarClock} label="Schedule a call" onClick={() => setAction('schedule')} /></div> : null}
        {tourStatus !== 'idle' ? <div className="mb-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-emerald-900">{tourStatus === 'ready' ? 'Guided tour ready' : TOUR_STEPS[tourIndex].label}</p><span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-emerald-800">{tourIndex + 1} of {TOUR_STEPS.length}</span></div>{tourRunning ? <p className="mt-1 text-[11px] leading-4 text-emerald-900">{TOUR_STEPS[tourIndex].description}</p> : null}<div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={startTour} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">Start Tour</button><button type="button" onClick={previousTourStep} disabled={tourStatus === 'ready' || tourIndex === 0} className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs text-emerald-900 disabled:opacity-40">Previous</button><button type="button" onClick={nextTourStep} className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs text-emerald-900">Next</button><button type="button" onClick={stopTour} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-700">Stop</button></div></div> : null}
        {actionChoices.length ? <div className="mb-2 rounded-xl border border-sky-200 bg-sky-50 p-2.5"><p className="text-xs font-semibold text-sky-950">Choose the exact task before Kamal changes anything:</p><div className="mt-2 space-y-1.5">{actionChoices.map((choice) => <button key={choice.id} type="button" onClick={() => confirmKamalActionChoice(choice)} className="block w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-left text-xs text-slate-800 hover:border-sky-400"><span className="font-semibold">{choice.title}</span><span className="ml-1 text-slate-500">· {formatTaskDate(choice.due_at || choice.reminder_date || undefined)} · {choice.status || 'active'}</span></button>)}</div></div> : null}
        {confirmation ? <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5"><p className="text-xs text-amber-900">Confirm: {confirmation}</p><div className="mt-2 flex gap-2"><button type="button" onClick={() => resolveConfirmation(true)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">Yes, continue</button><button type="button" onClick={() => resolveConfirmation(false)} className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs text-amber-900">No, cancel</button>{lastUndoToken ? <button type="button" onClick={requestUndoLastKamalAction} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700">Undo</button> : null}</div></div> : null}
        {!confirmation && lastUndoToken ? <button type="button" onClick={requestUndoLastKamalAction} className="mb-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">Undo last task change</button> : null}
        {action ? <ActionForm action={action} onCancel={() => setAction(null)} onComplete={(message, emailDraft) => { addMessage('assistant', message); setAction(null); speak(message); if (emailDraft && window.confirm('Open the secure email composer for this request?')) handoffEmail(emailDraft); }} /> : null}
        {calendarPrompt ? <CalendarConnectorPrompt prompt={calendarPrompt} onClose={() => setCalendarPrompt(null)} onConnect={connectCalendarProvider} /> : null}
        {notice ? <p className="mb-2 rounded-lg bg-slate-100 px-2 py-1 text-[11px] text-slate-600">{notice}</p> : null}
        {!tourRunning && (suggestions.length || suggestionsLoading) ? <div className="mb-2"><CedaSuggestionButtons compact greeting={suggestionGreeting} suggestions={suggestions} loading={suggestionsLoading} selectedId={selectedSuggestionId} onCopyToComposer={(suggestion) => void copySuggestionToComposer(suggestion)} onDismiss={(suggestion) => void dismissKamalSuggestion(suggestion)} /></div> : null}
        <form onSubmit={submit} className="flex gap-2"><input ref={composerRef} value={input} onChange={(event) => setInput(event.target.value)} placeholder={mode === 'voice' ? 'Voice transcript or type a command…' : 'Ask Kamal or enter a command…'} className="min-w-0 flex-1 rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400" /><button type="button" onClick={listening ? stopVoice : startVoice} className={`rounded-full border p-2 ${listening ? 'border-emerald-300 bg-emerald-500 text-white' : 'border-slate-200 text-slate-600'}`} aria-label={listening ? 'Stop voice control' : 'Start voice control'}>{listening ? <Mic size={18} /> : <MicOff size={18} />}</button><button type="submit" disabled={loading || !input.trim()} className="rounded-full bg-sky-600 p-2 text-white disabled:opacity-40"><Send size={18} /></button></form>
      </div>
    </div> : null}
  </>;
}

function TourSpotlight({ rect, step }: { rect: SpotlightRect | null; step: TourStep }) {
  if (!rect || typeof window === 'undefined') return <div className="pointer-events-none fixed inset-0 z-[80] bg-slate-950/45 backdrop-blur-[2px]" aria-hidden="true" />;
  const right = Math.max(0, window.innerWidth - rect.left - rect.width);
  const labelTop = rect.top + rect.height + 12 < window.innerHeight - 96 ? rect.top + rect.height + 12 : Math.max(16, rect.top - 88);
  const labelLeft = Math.min(Math.max(16, rect.left), Math.max(16, window.innerWidth - 320));
  return (
    <div className="pointer-events-none fixed inset-0 z-[80]" aria-hidden="true" data-testid="guided-tour-spotlight">
      <div className="absolute left-0 right-0 top-0 bg-slate-950/55 backdrop-blur-[2px]" style={{ height: rect.top }} />
      <div className="absolute left-0 bg-slate-950/55 backdrop-blur-[2px]" style={{ top: rect.top, width: rect.left, height: rect.height }} />
      <div className="absolute bg-slate-950/55 backdrop-blur-[2px]" style={{ top: rect.top, left: rect.left + rect.width, right, height: rect.height }} />
      <div className="absolute bottom-0 left-0 right-0 bg-slate-950/55 backdrop-blur-[2px]" style={{ top: rect.top + rect.height }} />
      <div className="absolute rounded-[1.75rem] border-2 border-emerald-300 shadow-[0_0_0_8px_rgba(16,185,129,0.18),0_24px_80px_rgba(15,23,42,0.35)]" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />
      <div className="absolute flex items-center gap-2 rounded-2xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-2xl" style={{ top: labelTop, left: labelLeft, maxWidth: 300 }}>
        <span className="text-lg">🖱️</span>
        <span>Focus here: {step.label}</span>
      </div>
    </div>
  );
}

function ModeButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Mic; label: string; onClick: () => void }) { return <button type="button" onClick={onClick} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${active ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'}`}><Icon size={15} />{label}</button>; }
function QuickAction({ icon: Icon, label, onClick }: { icon: typeof Navigation; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
    >
      <Icon size={16} aria-hidden="true" />
      <span className="pointer-events-none absolute bottom-full right-0 z-[120] mb-2 whitespace-nowrap rounded-lg bg-slate-950 px-2 py-1 text-[11px] font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100">
        {label}
      </span>
    </button>
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function CalendarConnectorPrompt({ prompt, onClose, onConnect }: { prompt: NonNullable<CalendarPrompt>; onClose: () => void; onConnect: (provider: 'google-calendar' | 'apple-calendar' | 'microsoft-calendar') => void }) {
  return (
    <section className="mb-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-emerald-950">Reminder saved locally</p>
          <p className="mt-1 text-[11px] leading-4 text-emerald-900">“{prompt.title}” is on your Student-LAD Calendar &amp; Timeline for {prompt.displayTime}. To sync it outside Student-LAD, connect a calendar provider.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full px-2 py-1 text-xs text-emerald-900" aria-label="Close calendar connector prompt">×</button>
      </div>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
        <button type="button" onClick={() => onConnect('google-calendar')} className="rounded-lg bg-white px-2 py-2 text-[11px] font-semibold text-slate-800 shadow-sm hover:bg-emerald-100">Gmail / Google Calendar</button>
        <button type="button" onClick={() => onConnect('apple-calendar')} className="rounded-lg bg-white px-2 py-2 text-[11px] font-semibold text-slate-800 shadow-sm hover:bg-emerald-100">Apple Calendar</button>
        <button type="button" onClick={() => onConnect('microsoft-calendar')} className="rounded-lg bg-white px-2 py-2 text-[11px] font-semibold text-slate-800 shadow-sm hover:bg-emerald-100">Microsoft Calendar</button>
      </div>
      <button type="button" onClick={onClose} className="mt-2 text-[11px] font-semibold text-emerald-800">Keep this reminder local only</button>
    </section>
  );
}

function ActionForm({ action, onCancel, onComplete }: { action: Exclude<Action, null>; onCancel: () => void; onComplete: (message: string, emailDraft?: string) => void }) {
  const [name, setName] = useState(''); const [contact, setContact] = useState(''); const [time, setTime] = useState(''); const [agenda, setAgenda] = useState(''); const [priority, setPriority] = useState('Normal');
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (action === 'support') { const ticket = `KAMAL-${Date.now().toString().slice(-8)}`; const record = { ticket, name, contact, priority, details: agenda, createdAt: new Date().toISOString(), status: 'new' }; const key = userStorageKey('kamal_support_tickets'); const existing = JSON.parse(window.localStorage.getItem(key) || '[]'); window.localStorage.setItem(key, JSON.stringify([record, ...existing].slice(0, 20))); onComplete(`Support request ${ticket} was created locally with ${priority.toLowerCase()} priority.`, `To: contact@lotusanddorje.org\nSubject: Support request ${ticket}\n\nName: ${name}\nContact: ${contact}\nPriority: ${priority}\nIssue: ${agenda}`); return; } const kind = action === 'callback' ? 'Callback request' : 'Call proposal'; const record = { kind, name, contact, time, agenda, createdAt: new Date().toISOString(), status: 'draft' }; const key = userStorageKey('kamal_call_requests'); const existing = JSON.parse(window.localStorage.getItem(key) || '[]'); window.localStorage.setItem(key, JSON.stringify([record, ...existing].slice(0, 20))); onComplete(`${kind} saved. External scheduling requires confirmation and a connected Calendar; I can prepare the email now.`, `To: ${contact}\nSubject: ${kind}: ${agenda || 'Meeting request'}\n\nHello ${name || 'there'},\n\nProposed time: ${time}\nAgenda: ${agenda}\n\nPlease confirm your availability.`); }
  return <form onSubmit={submit} className="mb-2 space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-2.5"><p className="text-xs font-semibold text-slate-800">{action === 'support' ? 'Create support request' : action === 'callback' ? 'Request a callback' : 'Prepare a scheduled call'}</p><div className="grid grid-cols-2 gap-2"><input required value={name} onChange={(event) => setName(event.target.value)} placeholder={action === 'support' ? 'Your name' : 'Contact name'} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900" /><input required value={contact} onChange={(event) => setContact(event.target.value)} placeholder="Email or phone" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900" /></div>{action === 'support' ? <select value={priority} onChange={(event) => setPriority(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900"><option>Low</option><option>Normal</option><option>High</option><option>Urgent</option></select> : <input required type="datetime-local" value={time} onChange={(event) => setTime(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900" />}<textarea required value={agenda} onChange={(event) => setAgenda(event.target.value)} placeholder={action === 'support' ? 'Describe the issue' : 'Meeting agenda'} className="min-h-16 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900" /><div className="flex gap-2"><button type="submit" className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white">Save request</button><button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600">Cancel</button></div></form>;
}
