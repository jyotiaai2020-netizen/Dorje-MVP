'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StudentNavGroup, StudentNavItem } from './StudentSidebar';

type SpeechRecognitionResultLike = { transcript: string };
type SpeechRecognitionEventLike = { results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>> };
type SpeechRecognitionErrorEventLike = { error?: string };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type OrchestratorNode = {
  id: string;
  label: string;
  description: string;
  icon: string;
  tone: string;
  item?: StudentNavItem;
  children?: StudentNavItem[];
};

const toneClasses: Record<string, string> = {
  home: 'from-emerald-400 via-teal-500 to-cyan-600 shadow-[0_16px_0_rgba(6,95,70,0.55),0_30px_60px_rgba(20,184,166,0.26)]',
  organize: 'from-sky-400 via-blue-500 to-indigo-600 shadow-[0_16px_0_rgba(30,64,175,0.52),0_30px_60px_rgba(59,130,246,0.26)]',
  student: 'from-violet-400 via-purple-500 to-fuchsia-600 shadow-[0_16px_0_rgba(107,33,168,0.52),0_30px_60px_rgba(168,85,247,0.26)]',
  life: 'from-rose-400 via-pink-500 to-orange-500 shadow-[0_16px_0_rgba(190,18,60,0.52),0_30px_60px_rgba(244,63,94,0.24)]',
  system: 'from-slate-500 via-slate-700 to-slate-950 shadow-[0_16px_0_rgba(15,23,42,0.58),0_30px_60px_rgba(15,23,42,0.30)]',
  item: 'from-white via-slate-100 to-slate-300 text-slate-950 shadow-[0_14px_0_rgba(148,163,184,0.68),0_28px_55px_rgba(15,23,42,0.22)]',
};

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const target = window as Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
  return target.SpeechRecognition || target.webkitSpeechRecognition || null;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function iconForGroup(label: string) {
  if (label === 'ORGANIZE') return '🧭';
  if (label === 'STUDENT') return '🎓';
  if (label === 'LIFE') return '🌿';
  if (label === 'SYSTEM') return '⚙️';
  return '✦';
}

function toneForGroup(label: string) {
  if (label === 'ORGANIZE') return 'organize';
  if (label === 'STUDENT') return 'student';
  if (label === 'LIFE') return 'life';
  if (label === 'SYSTEM') return 'system';
  return 'item';
}

function readableGroupLabel(label: string) {
  return label.charAt(0) + label.slice(1).toLowerCase();
}


function destinationAliases(item: StudentNavItem) {
  const label = normalize(item.label);
  const aliases = new Set([label]);
  if (label === 'calendar and timeline') aliases.add('calendar').add('timeline');
  if (label === 'task and reminders' || label === 'tasks and reminders') aliases.add('calendar').add('timeline').add('tasks').add('task').add('reminders').add('reminder');
  if (label === 'review and save') aliases.add('review').add('save').add('ceda review');
  if (label === 'memory center') aliases.add('memory').add('memories');
  if (label === 'workspace ai') aliases.add('workspace ai').add('dorje').add('dorje chat').add('dorje ai');
  if (label === 'bills and subscriptions') aliases.add('finance').add('bills').add('subscriptions').add('money');
  if (label === 'holidays') aliases.add('holiday').add('travel').add('trip');
  if (label === 'analytics and insights') aliases.add('analytics').add('insights');
  return [...aliases];
}

function nodeAliases(node: OrchestratorNode) {
  const label = normalize(node.label);
  const aliases = new Set([label, `${label} cube`, `${label} component`, `${label} app`, `${label} section`, `${label} area`]);
  if (label === 'life') aliases.add('live').add('live cube').add('live component').add('life apps').add('personal life');
  if (label === 'organize') aliases.add('organisation').add('organization').add('organizer').add('organize apps');
  if (label === 'student') aliases.add('student apps').add('study').add('school').add('academic group');
  if (label === 'system') aliases.add('system apps').add('admin');
  if (label === 'home') aliases.add('dashboard').add('start');
  return [...aliases];
}

function commandContainsDestination(command: string, label: string) {
  const destination = normalize(label);
  const genericWords = new Set(['cube', 'component', 'group', 'area', 'section', 'app', 'apps']);
  return command === destination || command.includes(destination) || destination.split(' ').some((word) => word.length > 4 && !genericWords.has(word) && command.includes(word));
}

function chromeVoicePermissionMessage(error?: string) {
  if (error === 'not-allowed' || error === 'service-not-allowed') {
    return 'Chrome blocked microphone access. Select the lock/camera icon in the address bar, allow Microphone for this site, then press Listen again.';
  }
  if (error === 'audio-capture') return 'Chrome cannot find an active microphone. Check your input device, then press Listen again.';
  if (error === 'network') return 'Chrome speech recognition needs network access. Use keyboard/mouse cubes or try again when online.';
  if (error === 'no-speech') return 'I did not hear speech. Press Listen and try “open Academic” or “next”.';
  if (error === 'aborted') return 'Voice paused. Select Listen again when ready.';
  return `Voice is unavailable${error ? `: ${error}` : ''}. Use mouse or keyboard cubes, or allow microphone access and try Listen again.`;
}

export default function OrchestratorOverlay({
  open,
  groups,
  onClose,
  onNavigate,
}: {
  open: boolean;
  groups: StudentNavGroup[];
  onClose: () => void;
  onNavigate: (item: StudentNavItem) => void;
}) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const parrotVideoRef = useRef<HTMLVideoElement | null>(null);
  const commandHandlerRef = useRef<(detail: string) => void>(() => undefined);
  const autoListenAttemptedRef = useRef(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('Say “next”, “previous”, “open”, “back”, or a cube name.');

  const launchGroup = groups.find((group) => group.label === 'LAUNCH');
  const allItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const homeItem = launchGroup?.items.find((item) => item.label === 'Home') || allItems.find((item) => item.label === 'Home');

  const rootNodes = useMemo<OrchestratorNode[]>(() => {
    const nodes: OrchestratorNode[] = [];
    if (homeItem) nodes.push({ id: 'home', label: 'Home', description: 'Return to the Student-LAD home dashboard.', icon: '🏠', tone: 'home', item: homeItem });
    groups.filter((group) => ['ORGANIZE', 'STUDENT', 'LIFE', 'SYSTEM'].includes(group.label)).forEach((group) => {
      nodes.push({ id: group.label.toLowerCase(), label: readableGroupLabel(group.label), description: `${group.items.length} connected workspace area${group.items.length === 1 ? '' : 's'}.`, icon: iconForGroup(group.label), tone: toneForGroup(group.label), children: group.items });
    });
    return nodes;
  }, [groups, homeItem]);

  const activeRoot = rootNodes.find((node) => node.id === activeNodeId) || null;
  const visibleNodes = useMemo<OrchestratorNode[]>(() => {
    if (!activeRoot?.children?.length) return rootNodes;
    return activeRoot.children.map((item) => ({ id: item.label, label: item.label, description: `Open ${item.label}.`, icon: '◈', tone: activeRoot.tone, item }));
  }, [activeRoot, rootNodes]);

  const selected = visibleNodes[selectedIndex] || visibleNodes[0];

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const startListening = useCallback((automatic = false) => {
    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      setVoiceStatus(automatic ? 'Voice control is not available in this browser. Use mouse or keyboard cubes, or enable speech recognition and reopen Orbit.' : 'Voice control is not available in this browser. Use mouse or keyboard cubes.');
      return;
    }
    if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      setVoiceStatus('Chrome allows microphone voice control only on HTTPS or localhost. Open Student-LAD on HTTPS or 127.0.0.1, then retry listening.');
      return;
    }
    recognitionRef.current?.stop();
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const transcript = last?.[0]?.transcript || '';
      commandHandlerRef.current(transcript);
    };
    recognition.onerror = (event) => {
      setVoiceStatus(chromeVoicePermissionMessage(event.error));
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
      setVoiceStatus(automatic ? 'Listening automatically… say “next”, “open Academic”, “go Settings”, or “back”.' : 'Listening… say “next”, “open Academic”, “go Settings”, or “back”.');
    } catch (error) {
      setListening(false);
      setVoiceStatus(error instanceof DOMException ? chromeVoicePermissionMessage(error.name) : 'Voice could not start. Retry from Chrome after allowing microphone access.');
    }
  }, []);

  useEffect(() => {
    commandHandlerRef.current = handleVoiceCommand;
  });

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (activeNodeId) {
          setActiveNodeId(null);
          setSelectedIndex(0);
        } else {
          onClose();
        }
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') move(1);
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') move(-1);
      if (event.key === 'Enter') activateSelected();
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  });

  useEffect(() => {
    if (!open) return;
    const commandHandler = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === 'string') commandHandlerRef.current(detail);
    };
    window.addEventListener('student-lad:orbit-command', commandHandler);
    return () => window.removeEventListener('student-lad:orbit-command', commandHandler);
  }, [open]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  useEffect(() => {
    if (!open) {
      autoListenAttemptedRef.current = false;
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      return;
    }
    if (autoListenAttemptedRef.current) return;
    const timer = window.setTimeout(() => {
      if (autoListenAttemptedRef.current) return;
      autoListenAttemptedRef.current = true;
      startListening(true);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [open, startListening, stopListening]);

  useEffect(() => {
    if (!listening) return;
    const video = parrotVideoRef.current;
    if (!video) return;
    video.currentTime = 0;
    void video.play().catch(() => undefined);
  }, [listening]);

  function move(direction: 1 | -1) {
    setSelectedIndex((current) => {
      const total = visibleNodes.length || 1;
      return (current + direction + total) % total;
    });
  }

  function navigateToItem(item: StudentNavItem) {
    stopListening();
    onNavigate(item);
    onClose();
    if (item.href) window.setTimeout(() => { if (window.location.pathname !== item.href) window.location.assign(item.href); }, 50);
  }

  function activateNode(node: OrchestratorNode) {
    if (node.children?.length) {
      setActiveNodeId(node.id);
      setSelectedIndex(0);
      setVoiceStatus(`${node.label} cube opened. Choose a sub-cube.`);
      return;
    }
    if (node.item) navigateToItem(node.item);
  }

  function activateSelected() {
    if (selected) activateNode(selected);
  }

  function findDestination(command: string) {
    const isCubeCommand = /\b(cube|component|group|area|section|apps?)\b/.test(command);
    const visibleNode = visibleNodes.find((node) => nodeAliases(node).some((alias) => commandContainsDestination(command, alias)));
    if (visibleNode) return { node: visibleNode };
    const exactItem = allItems.find((item) => destinationAliases(item).some((alias) => commandContainsDestination(command, alias)));
    if (exactItem) return { item: exactItem };
    const rootNode = rootNodes.find((node) => nodeAliases(node).some((alias) => commandContainsDestination(command, alias)));
    if (rootNode && (isCubeCommand || !activeNodeId || rootNode.id === activeNodeId)) return { node: rootNode };
    if (rootNode) return { node: rootNode };
    return null;
  }

  function openDestination(command: string) {
    const destination = findDestination(command);
    if (!destination) return false;
    if (destination.item) {
      navigateToItem(destination.item);
      return true;
    }
    if (destination.node) {
      activateNode(destination.node);
      return true;
    }
    return false;
  }

  function directVoiceDestination(command: string) {
    const rules: Array<[RegExp, RegExp]> = [
      [/\b(calendar|task|tasks|reminder|reminders|timeline)\b/, /^Tasks$/i],
      [/\b(immigration|visa|passport|i-?20|uscis|opt|cpt|sevis)\b/, /^Immigration$/i],
      [/\b(finance|bills?|subscriptions?|money)\b/, /^Bills & Subscriptions$/i],
      [/\b(memory|memories|remembered)\b/, /^Memory Center$/i],
      [/\b(settings?|configuration|preferences)\b/, /^Settings$/i],
      [/\b(academic|course|assignment|exam)\b/, /^Academic$/i],
      [/\b(career|resume|job|recruiter)\b/, /^Career$/i],
      [/\b(family)\b/, /^Family$/i],
      [/\b(health)\b/, /^Health$/i],
      [/\b(holiday|holidays|travel|trip)\b/, /^Holidays$/i],
    ];
    const rule = rules.find(([commandPattern]) => commandPattern.test(command));
    if (!rule) return null;
    return allItems.find((item) => rule[1].test(item.label)) || null;
  }

  function handleVoiceCommand(raw: string) {
    const command = normalize(raw);
    if (!command) return;
    setVoiceStatus(`Heard: “${raw}”`);
    if (/\b(next|forward|right)\b/.test(command)) {
      move(1);
      return;
    }
    if (/\b(previous|prev|backward|left)\b/.test(command)) {
      move(-1);
      return;
    }
    if (/\b(back|up|top)\b/.test(command) && activeNodeId) {
      setActiveNodeId(null);
      setSelectedIndex(0);
      return;
    }
    if (/\b(go|goto|open|enter|select|take me to|navigate|launch|show|move to|bring me to)\b/.test(command)) {
      const direct = directVoiceDestination(command);
      if (direct) {
        navigateToItem(direct);
        return;
      }
      if (openDestination(command)) return;
      activateSelected();
      return;
    }
    if (openDestination(command)) return;
    setVoiceStatus(`I heard “${raw}”, but I need an app name like Home, Calendar, Academic, Finance, or Settings.`);
  }

  function toggleListening() {
    if (listening) {
      stopListening();
      setVoiceStatus('Orbit voice paused. Use the parrot button to listen again.');
      return;
    }
    startListening(false);
  }

  if (!open) return null;

  return <div className="fixed inset-0 z-[95] overflow-hidden bg-slate-950/55 p-4 text-white backdrop-blur-xl" role="dialog" aria-modal="true" aria-label="DorjeAI top view orchestrator">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.28),transparent_34%),radial-gradient(circle_at_70%_30%,rgba(59,130,246,0.22),transparent_28%),radial-gradient(circle_at_40%_80%,rgba(217,70,239,0.18),transparent_30%)]" />
    <div className="relative mx-auto flex h-full max-w-7xl flex-col rounded-[34px] border border-white/15 bg-slate-950/35 shadow-[0_40px_120px_rgba(0,0,0,0.55)] ring-1 ring-white/10">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-200">DorjeAI Orchestrator Front View</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight">{activeRoot ? activeRoot.label : 'Workspace orbit'}</h2>
          <p className="mt-1 text-sm text-white/70">The current screen blurs behind a front-facing 3D orbit. The focused cube stays sharp while other apps revolve softly around it.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeRoot ? <button type="button" onClick={() => { setActiveNodeId(null); setSelectedIndex(0); }} className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15">← Top orbit</button> : null}
          <button type="button" onClick={toggleListening} className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-black shadow-lg ${listening ? 'bg-emerald-300 text-emerald-950' : 'border border-white/15 bg-white/10 text-white hover:bg-white/15'}`} aria-label={listening ? 'Stop parrot listening' : 'Retry parrot listening'}><span aria-hidden="true">🦜</span>{listening ? 'Listening…' : 'Retry voice'}</button>
          <button type="button" onClick={() => { stopListening(); onClose(); }} className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15">Close</button>
        </div>
      </header>

      <section className="relative min-h-0 flex-1 overflow-hidden px-4 py-6 md:px-8" aria-label="Floating cube orbit">
        {listening ? <div className="pointer-events-none absolute inset-x-4 top-8 z-0 mx-auto h-[72%] max-w-5xl overflow-hidden rounded-[42px] border border-emerald-200/10 opacity-45 blur-[0.4px] [mask-image:radial-gradient(ellipse_at_center,black_28%,rgba(0,0,0,0.72)_48%,transparent_76%)]" aria-hidden="true">
          <video ref={parrotVideoRef} className="h-full w-full scale-125 object-cover object-center saturate-125" src="/student-lad/parrot-orbit.mp4" autoPlay muted playsInline onTimeUpdate={(event) => { if (event.currentTarget.currentTime >= 6) event.currentTarget.currentTime = 0; }} />
          <div className="absolute inset-0 bg-slate-950/42 mix-blend-multiply" />
        </div> : null}
        <div className="absolute left-6 top-8 z-30 hidden md:block" aria-label="Parrot listen control">
          <button type="button" onClick={toggleListening} className={`flex h-14 w-14 items-center justify-center rounded-full border text-3xl shadow-[0_18px_50px_rgba(16,185,129,0.22)] transition hover:scale-105 ${listening ? 'animate-pulse border-emerald-100 bg-emerald-300 text-emerald-950' : 'border-emerald-200/25 bg-emerald-300/15 text-emerald-100'}`} aria-label={listening ? 'Stop parrot listening' : 'Retry parrot listening'}>
            <span aria-hidden="true">🦜</span>
          </button>
        </div>
        <div className="pointer-events-none absolute bottom-7 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-black/25 px-4 py-2 text-xs font-semibold text-white/80 shadow-2xl backdrop-blur">
          <span aria-hidden="true">🦜</span>
          <span>{voiceStatus}</span>
        </div>
        <div className="relative z-20 mx-auto h-full min-h-[520px] max-w-5xl" style={{ perspective: '1400px' }}>
          <button type="button" onClick={activateSelected} className="absolute left-1/2 top-1/2 z-50 flex h-48 w-48 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-[36px] border border-white/35 bg-white/16 p-4 text-center shadow-[0_26px_90px_rgba(16,185,129,0.42),0_0_55px_rgba(255,255,255,0.10)] backdrop-blur-xl transition hover:scale-105 md:h-60 md:w-60" aria-label={`Open focused cube ${selected?.label || ''}`}>
            <span className="absolute inset-0 rounded-[36px] bg-gradient-to-br from-white/18 to-transparent" aria-hidden="true" />
            <span className="relative text-6xl" aria-hidden="true">{selected?.icon || '✦'}</span>
            <span className="relative mt-3 text-2xl font-black">{selected?.label || 'Select'}</span>
            <span className="relative mt-2 text-xs leading-5 text-white/75">{selected?.description || 'Choose a cube to continue.'}</span>
          </button>
          {visibleNodes.map((node, index) => {
            const total = visibleNodes.length || 1;
            const angle = ((360 / total) * (index - selectedIndex) - 90) * (Math.PI / 180);
            const radiusX = typeof window !== 'undefined' && window.innerWidth < 768 ? 160 : 320;
            const radiusY = typeof window !== 'undefined' && window.innerWidth < 768 ? 72 : 132;
            const x = Math.cos(angle) * radiusX;
            const y = Math.sin(angle) * radiusY;
            const depth = Math.sin(angle);
            const inFront = depth > 0.45;
            const selectedNode = index === selectedIndex;
            const blur = selectedNode ? 0 : depth < -0.2 ? 3.4 : 1.4;
            const scale = selectedNode ? 0.78 : 0.72 + ((depth + 1) * 0.12);
            const opacity = selectedNode ? 0.18 : depth < -0.35 ? 0.38 : 0.66;
            return <button
              key={node.id}
              type="button"
              onClick={() => { setSelectedIndex(index); if (selectedNode) activateNode(node); }}
              className={`absolute left-1/2 top-1/2 flex h-24 w-24 flex-col items-center justify-center rounded-[24px] bg-gradient-to-br p-3 text-center font-bold text-white transition duration-500 hover:!blur-0 hover:!opacity-100 hover:scale-105 md:h-32 md:w-32 ${toneClasses[node.tone] || toneClasses.item} ${selectedNode ? 'pointer-events-none ring-2 ring-white/20' : 'ring-1 ring-white/20'}`}
              style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) translateZ(${depth * 130}px) rotateX(13deg) rotateY(${-depth * 24}deg) scale(${scale})`, transformStyle: 'preserve-3d', filter: `blur(${blur}px)`, opacity, zIndex: inFront ? 35 : 15 }}
              aria-label={`${selectedNode ? 'Orbit ghost' : 'Focus'} cube ${node.label}`}
            >
              <span className="text-3xl" aria-hidden="true">{node.icon}</span>
              <span className="mt-2 text-sm leading-4">{node.label}</span>
            </button>;
          })}
        </div>
      </section>

      <footer className="grid gap-3 border-t border-white/10 px-5 py-4 text-xs text-white/72 md:grid-cols-3">
        <span>Mouse: click once to focus, click focused cube to enter.</span>
        <span>Keyboard: arrows move, Enter opens, Escape goes back/close.</span>
        <span>Voice: “next”, “previous”, “open”, “go Academic”, “Settings”.</span>
      </footer>
    </div>
  </div>;
}
