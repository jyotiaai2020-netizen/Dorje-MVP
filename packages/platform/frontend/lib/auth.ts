export const TOKEN_KEY = 'lotus_token';
export const USER_KEY = 'lotus_user';
export const AUTH_CHANGED_EVENT = 'lotus-auth-changed';

export type AuthUser = {
  id?: number | string;
  name?: string | null;
  full_name?: string | null;
  email?: string | null;
  organization_id?: number | null;
  role?: 'super_admin' | 'org_admin' | 'consultant' | 'client_user';
  [key: string]: unknown;
};

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;

  const storedUser = window.localStorage.getItem(USER_KEY);
  if (!storedUser) return null;

  try {
    return JSON.parse(storedUser) as AuthUser;
  } catch {
    window.localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function isAuthenticated(): boolean {
  return Boolean(getToken());
}

function authIdentity(user: AuthUser | null): string {
  const identity = user?.id ?? user?.email ?? '';
  return String(identity).trim().toLowerCase();
}

function clearTransientSessionData(): void {
  window.sessionStorage.removeItem('dorje_handoff_payload');
  window.sessionStorage.removeItem('dorje_voice_prompt');
  window.sessionStorage.removeItem('dorje_pending_connector');
  window.sessionStorage.removeItem('student_lad_guided_tour');
}

export function setAuthSession(accessToken: string, user?: AuthUser | null): void {
  if (typeof window === 'undefined') return;
  const previousUser = getUser();
  const previousIdentity = authIdentity(previousUser);
  const nextIdentity = authIdentity(user || null);
  if (previousIdentity && nextIdentity && previousIdentity !== nextIdentity) clearTransientSessionData();
  window.localStorage.setItem(TOKEN_KEY, accessToken);
  if (user) window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  else window.localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function logout(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  clearTransientSessionData();
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}
