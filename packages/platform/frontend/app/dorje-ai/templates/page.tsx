'use client';

import AuthGuard from '@/components/AuthGuard';
import TemplateWorkspace from '@/components/dorje-ai/TemplateWorkspace';

export default function DorjeAITemplatesPage() { return <AuthGuard><TemplateWorkspace /></AuthGuard>; }
