'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';

const authenticatedHome = (process.env.NEXT_PUBLIC_APP_TITLE || 'Student-LAD').includes('Student') ? '/student-lad' : '/';

export default function PublicRoute({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace(authenticatedHome);
      return;
    }

    const update = window.setTimeout(() => setAllowed(true), 0);
    return () => window.clearTimeout(update);
  }, [router]);

  return allowed ? children : null;
}
