'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import KamalChat from '@/components/KamalChat';
import { AUTH_CHANGED_EVENT, isAuthenticated } from '@/lib/auth';
import { applyTheme, getThemePreference, THEME_CHANGED_EVENT } from '@/lib/theme';

const PUBLIC_ROUTES = new Set(['/login', '/register']);

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const updateAuthentication = () => setAuthenticated(isAuthenticated());
    updateAuthentication();

    window.addEventListener('storage', updateAuthentication);
    window.addEventListener(AUTH_CHANGED_EVENT, updateAuthentication);
    return () => {
      window.removeEventListener('storage', updateAuthentication);
      window.removeEventListener(AUTH_CHANGED_EVENT, updateAuthentication);
    };
  }, [pathname]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => applyTheme(getThemePreference());
    update(); media.addEventListener('change', update); window.addEventListener(THEME_CHANGED_EVENT, update);
    return () => { media.removeEventListener('change', update); window.removeEventListener(THEME_CHANGED_EVENT, update); };
  }, []);

  const showKamal = authenticated && !PUBLIC_ROUTES.has(pathname);

  return (
    <>
      {children}
      {showKamal ? <KamalChat /> : null}
    </>
  );
}
