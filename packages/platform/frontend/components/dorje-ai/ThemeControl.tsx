'use client';

import { useEffect, useState } from 'react';
import { Laptop, Moon, Sun } from 'lucide-react';
import { getThemePreference, saveThemePreference, THEME_CHANGED_EVENT, type ThemePreference } from '@/lib/theme';

const choices: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Laptop },
];

export default function ThemeControl({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<ThemePreference>('system');
  useEffect(() => {
    const timer = window.setTimeout(() => setTheme(getThemePreference()), 0);
    const update = (event: Event) => setTheme((event as CustomEvent<ThemePreference>).detail || getThemePreference());
    window.addEventListener(THEME_CHANGED_EVENT, update);
    return () => { window.clearTimeout(timer); window.removeEventListener(THEME_CHANGED_EVENT, update); };
  }, []);
  if (compact) {
    const current = choices.find((choice) => choice.value === theme) || choices[2]; const Icon = current.icon;
    return <button type="button" onClick={() => { const next = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system'; saveThemePreference(next); setTheme(next); }} className="icon-control" title={`Theme: ${current.label}`} aria-label={`Theme: ${current.label}`}><Icon size={17} /></button>;
  }
  return <div className="grid grid-cols-3 gap-2">{choices.map(({ value, label, icon: Icon }) => <button key={value} type="button" onClick={() => { saveThemePreference(value); setTheme(value); }} className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border text-sm transition ${theme === value ? 'border-emerald-400 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}><Icon size={20} />{label}</button>)}</div>;
}
