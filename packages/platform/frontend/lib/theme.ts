export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_KEY = 'dorje_theme_preference';
export const THEME_CHANGED_EVENT = 'dorje-theme-changed';

export function getThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  const value = window.localStorage.getItem(THEME_KEY);
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function applyTheme(preference: ThemePreference) {
  if (typeof window === 'undefined') return;
  const resolved = preference === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

export function saveThemePreference(preference: ThemePreference) {
  window.localStorage.setItem(THEME_KEY, preference);
  applyTheme(preference);
  window.dispatchEvent(new CustomEvent(THEME_CHANGED_EVENT, { detail: preference }));
}
