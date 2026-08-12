import { userStorageKey } from '@/lib/userStorage';

export type ExportPreferences = {
  chatFormat: 'pdf' | 'txt';
  tableFormat: 'xlsx' | 'csv';
  chatFilename: string;
  tableFilename: string;
};

export const DEFAULT_EXPORT_PREFERENCES: ExportPreferences = {
  chatFormat: 'pdf',
  tableFormat: 'xlsx',
  chatFilename: 'dorje-ai-chat',
  tableFilename: 'dorje-ai-table',
};

const KEY = 'dorje_export_preferences';

export function getExportPreferences(): ExportPreferences {
  if (typeof window === 'undefined') return DEFAULT_EXPORT_PREFERENCES;
  try { return { ...DEFAULT_EXPORT_PREFERENCES, ...JSON.parse(window.localStorage.getItem(userStorageKey(KEY)) || '{}') }; }
  catch { return DEFAULT_EXPORT_PREFERENCES; }
}

export function saveExportPreferences(preferences: ExportPreferences) {
  window.localStorage.setItem(userStorageKey(KEY), JSON.stringify(preferences));
}
