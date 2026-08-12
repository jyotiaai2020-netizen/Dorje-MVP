'use client';

import { useSyncExternalStore } from 'react';
import { AUTH_CHANGED_EVENT } from '@/lib/auth';
import { userStorageKey } from '@/lib/userStorage';

export type StudentTheme = 'Light' | 'Dark' | 'System';
export type StudentExecutionMode = 'Offline' | 'Hybrid' | 'Cloud';
export type StudentUiTheme = 'Prism' | 'Craft' | 'Forma' | 'Luma' | 'Studio';
export type KamalAvatar = '🪷' | '🦜' | '🧭' | '🌙' | '🧠' | '✨';
export type LocalVoice = 'Maya' | 'River' | 'Asha' | 'Noah';
export type AccentColor = 'Emerald' | 'Indigo' | 'Rose' | 'Amber' | 'Sky' | 'Violet';
export type AppBackground = 'Warm White' | 'Mist' | 'Ivory' | 'Slate' | 'Mint' | 'Sand';
export type PerformanceProfile = 'Lightweight' | 'Standard' | 'High';
export type NotificationPreferences = { inApp: boolean; desktop: boolean; email: boolean; calendar: boolean };

type StudentStoreState = {
  theme: StudentTheme;
  mode: StudentExecutionMode;
  uiTheme: StudentUiTheme;
  kamalAvatar: KamalAvatar;
  voice: LocalVoice;
  accentColor: AccentColor;
  background: AppBackground;
  performanceProfile: PerformanceProfile;
  notifications: NotificationPreferences;
};

type StudentStoreActions = {
  setTheme: (theme: StudentTheme) => void;
  setMode: (mode: StudentExecutionMode) => void;
  setUiTheme: (uiTheme: StudentUiTheme) => void;
  setKamalAvatar: (kamalAvatar: KamalAvatar) => void;
  setVoice: (voice: LocalVoice) => void;
  setAccentColor: (accentColor: AccentColor) => void;
  setBackground: (background: AppBackground) => void;
  setPerformanceProfile: (performanceProfile: PerformanceProfile) => void;
  setNotifications: (notifications: NotificationPreferences) => void;
};

const STORAGE_KEY = 'student_lad_app_store';
const DEFAULT_STATE: StudentStoreState = {
  theme: 'System',
  mode: 'Hybrid',
  uiTheme: 'Prism',
  kamalAvatar: '🪷',
  voice: 'Maya',
  accentColor: 'Emerald',
  background: 'Warm White',
  performanceProfile: 'Standard',
  notifications: { inApp: true, desktop: true, email: false, calendar: true },
};
let state: StudentStoreState = DEFAULT_STATE;
const listeners = new Set<() => void>();

function storageKey() {
  return userStorageKey(STORAGE_KEY);
}

function readStoredState(): StudentStoreState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey()) || '{}') as Partial<StudentStoreState>;
    const notifications = parsed.notifications && typeof parsed.notifications === 'object' ? parsed.notifications : DEFAULT_STATE.notifications;
    return {
      theme: parsed.theme === 'Light' || parsed.theme === 'Dark' || parsed.theme === 'System' ? parsed.theme : DEFAULT_STATE.theme,
      mode: parsed.mode === 'Offline' || parsed.mode === 'Hybrid' || parsed.mode === 'Cloud' ? parsed.mode : DEFAULT_STATE.mode,
      uiTheme: parsed.uiTheme === 'Prism' || parsed.uiTheme === 'Craft' || parsed.uiTheme === 'Forma' || parsed.uiTheme === 'Luma' || parsed.uiTheme === 'Studio' ? parsed.uiTheme : DEFAULT_STATE.uiTheme,
      kamalAvatar: parsed.kamalAvatar === '🪷' || parsed.kamalAvatar === '🦜' || parsed.kamalAvatar === '🧭' || parsed.kamalAvatar === '🌙' || parsed.kamalAvatar === '🧠' || parsed.kamalAvatar === '✨' ? parsed.kamalAvatar : DEFAULT_STATE.kamalAvatar,
      voice: parsed.voice === 'Maya' || parsed.voice === 'River' || parsed.voice === 'Asha' || parsed.voice === 'Noah' ? parsed.voice : DEFAULT_STATE.voice,
      accentColor: parsed.accentColor === 'Emerald' || parsed.accentColor === 'Indigo' || parsed.accentColor === 'Rose' || parsed.accentColor === 'Amber' || parsed.accentColor === 'Sky' || parsed.accentColor === 'Violet' ? parsed.accentColor : DEFAULT_STATE.accentColor,
      background: parsed.background === 'Warm White' || parsed.background === 'Mist' || parsed.background === 'Ivory' || parsed.background === 'Slate' || parsed.background === 'Mint' || parsed.background === 'Sand' ? parsed.background : DEFAULT_STATE.background,
      performanceProfile: parsed.performanceProfile === 'Lightweight' || parsed.performanceProfile === 'Standard' || parsed.performanceProfile === 'High' ? parsed.performanceProfile : DEFAULT_STATE.performanceProfile,
      notifications: {
        inApp: typeof notifications.inApp === 'boolean' ? notifications.inApp : DEFAULT_STATE.notifications.inApp,
        desktop: typeof notifications.desktop === 'boolean' ? notifications.desktop : DEFAULT_STATE.notifications.desktop,
        email: typeof notifications.email === 'boolean' ? notifications.email : DEFAULT_STATE.notifications.email,
        calendar: typeof notifications.calendar === 'boolean' ? notifications.calendar : DEFAULT_STATE.notifications.calendar,
      },
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function writeState(next: StudentStoreState) {
  state = next;
  if (typeof window !== 'undefined') window.localStorage.setItem(storageKey(), JSON.stringify(next));
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): StudentStoreState {
  return state;
}

if (typeof window !== 'undefined') {
  state = readStoredState();
  window.addEventListener('storage', (event) => {
    if (event.key === storageKey()) {
      state = readStoredState();
      listeners.forEach((listener) => listener());
    }
  });
  window.addEventListener(AUTH_CHANGED_EVENT, () => {
    state = readStoredState();
    listeners.forEach((listener) => listener());
  });
}

export function useStudentStore(): StudentStoreState & StudentStoreActions {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_STATE);
  return {
    ...snapshot,
    setTheme: (theme) => writeState({ ...state, theme }),
    setMode: (mode) => writeState({ ...state, mode }),
    setUiTheme: (uiTheme) => writeState({ ...state, uiTheme }),
    setKamalAvatar: (kamalAvatar) => writeState({ ...state, kamalAvatar }),
    setVoice: (voice) => writeState({ ...state, voice }),
    setAccentColor: (accentColor) => writeState({ ...state, accentColor }),
    setBackground: (background) => writeState({ ...state, background }),
    setPerformanceProfile: (performanceProfile) => writeState({ ...state, performanceProfile }),
    setNotifications: (notifications) => writeState({ ...state, notifications }),
  };
}
