import type { StructuredTableData } from '@/components/dorje-ai/StructuredTableView';
import { userStorageKey } from '@/lib/userStorage';

export type StoredMessage = { role: 'user' | 'assistant'; content: string; imageUrl?: string; enhancedPrompt?: string; originalPrompt?: string; table?: StructuredTableData; chartOpen?: boolean; versions?: string[]; model?: string; attachments?: { name: string; type: string }[] };
export type StoredConversation = { id: string; title: string; createdAt?: string; updatedAt: string; messages: StoredMessage[]; pinned?: boolean; favorite?: boolean; summary?: string; rawHistoryExpired?: boolean };
type HistoryPolicy = { raw_chat_history_days: number; summary_history_days: number; max_saved_conversations: number | null; daily_summary_enabled?: boolean; weekly_summary_enabled?: boolean; cross_device_history?: boolean };

const KEY = 'dorje_chat_history';
const POLICY_KEY = 'student_lad_history_policy';
const DEFAULT_HISTORY_POLICY: HistoryPolicy = { raw_chat_history_days: 7, summary_history_days: 30, max_saved_conversations: 10, daily_summary_enabled: true, weekly_summary_enabled: false, cross_device_history: false };
function historyKey() { return userStorageKey(KEY); }
function policyKey() { return userStorageKey(POLICY_KEY); }

function readHistoryPolicy(): HistoryPolicy {
  if (typeof window === 'undefined') return DEFAULT_HISTORY_POLICY;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(policyKey()) || 'null') as Partial<HistoryPolicy> | null;
    return { ...DEFAULT_HISTORY_POLICY, ...(parsed || {}) };
  } catch {
    return DEFAULT_HISTORY_POLICY;
  }
}

export function saveChatHistoryPolicy(policy: Partial<HistoryPolicy>) {
  if (typeof window === 'undefined') return;
  const next = { ...DEFAULT_HISTORY_POLICY, ...policy };
  window.localStorage.setItem(policyKey(), JSON.stringify(next));
}

function conversationTimestamp(conversation: StoredConversation): number {
  const value = Date.parse(conversation.updatedAt || conversation.createdAt || '');
  return Number.isFinite(value) ? value : 0;
}

function summarizeConversation(conversation: StoredConversation): string {
  if (conversation.summary?.trim()) return conversation.summary.trim();
  const firstUser = conversation.messages.find((message) => message.role === 'user' && message.content.trim())?.content.trim();
  return (firstUser || conversation.title || 'Saved conversation').slice(0, 160);
}

function applyHistoryRetention(conversations: StoredConversation[]): StoredConversation[] {
  const policy = readHistoryPolicy();
  const now = Date.now();
  const rawCutoff = now - policy.raw_chat_history_days * 24 * 60 * 60 * 1000;
  const summaryCutoff = now - policy.summary_history_days * 24 * 60 * 60 * 1000;
  const retained = conversations
    .map((conversation) => {
      const timestamp = conversationTimestamp(conversation);
      if (!timestamp || timestamp < summaryCutoff) return null;
      if (timestamp < rawCutoff) {
        const summary = summarizeConversation(conversation);
        if (!summary) return null;
        return { ...conversation, messages: [], summary, rawHistoryExpired: true };
      }
      return { ...conversation, rawHistoryExpired: false };
    })
    .filter(Boolean) as StoredConversation[];
  retained.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || conversationTimestamp(b) - conversationTimestamp(a));
  return typeof policy.max_saved_conversations === 'number' ? retained.slice(0, policy.max_saved_conversations) : retained;
}

function readAllHistory(): StoredConversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(historyKey()) || '[]') as StoredConversation[];
    const retained = applyHistoryRetention(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(retained)) window.localStorage.setItem(historyKey(), JSON.stringify(retained));
    return retained;
  } catch {
    return [];
  }
}

export function listChatHistory(): StoredConversation[] {
  return readAllHistory();
}

export function listRecentChatHistory(limit = 3): StoredConversation[] {
  return readAllHistory().slice(0, limit);
}

export function saveChatConversation(conversation: StoredConversation): StoredConversation[] {
  const histories = applyHistoryRetention([conversation, ...readAllHistory().filter((item) => item.id !== conversation.id)])
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || conversationTimestamp(b) - conversationTimestamp(a));
  try { window.localStorage.setItem(historyKey(), JSON.stringify(histories)); }
  catch {
    const compact = histories.map((item) => ({ ...item, messages: item.messages.map((message) => ({ role: message.role, content: message.content, table: message.table })) }));
    window.localStorage.setItem(historyKey(), JSON.stringify(compact));
    return compact;
  }
  return histories;
}

export function renameChatConversation(id: string, title: string): StoredConversation[] {
  const histories = listChatHistory().map((item) => item.id === id ? { ...item, title: title.trim() || item.title, updatedAt: new Date().toISOString() } : item);
  window.localStorage.setItem(historyKey(), JSON.stringify(histories));
  return histories;
}

export function deleteChatConversation(id: string): StoredConversation[] {
  const histories = listChatHistory().filter((item) => item.id !== id);
  window.localStorage.setItem(historyKey(), JSON.stringify(histories)); return histories;
}

export function duplicateChatConversation(id: string): StoredConversation[] {
  const source = listChatHistory().find((item) => item.id === id); if (!source) return listChatHistory();
  return saveChatConversation({ ...source, id: crypto.randomUUID(), title: `${source.title} copy`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), pinned: false });
}

export function updateChatFlags(id: string, changes: Pick<StoredConversation, 'pinned' | 'favorite'>): StoredConversation[] {
  const histories = listChatHistory().map((item) => item.id === id ? { ...item, ...changes, updatedAt: new Date().toISOString() } : item).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt.localeCompare(a.updatedAt));
  window.localStorage.setItem(historyKey(), JSON.stringify(histories)); return histories;
}
