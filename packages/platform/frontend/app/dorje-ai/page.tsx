'use client';

import AuthGuard from '@/components/AuthGuard';
import { WorkspaceShell } from '@/components/dorje-ai';

export default function DorjeAIPage() {
  return (
    <AuthGuard><WorkspaceShell /></AuthGuard>
  );
}
