import { getUser } from '@/lib/auth';

export function userStorageKey(baseKey: string): string {
  const user = getUser();
  const identity = user?.id ?? user?.email;
  if (identity === undefined || identity === null || String(identity).trim() === '') return `${baseKey}:anonymous`;
  return `${baseKey}:user:${encodeURIComponent(String(identity).trim().toLowerCase())}`;
}
