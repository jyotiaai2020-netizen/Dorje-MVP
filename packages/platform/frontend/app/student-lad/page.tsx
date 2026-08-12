'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  BarChart2,
  Bell,
  Bot,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  Compass,
  CreditCard,
  Database,
  FolderOpen,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  ListChecks,
  MessageCircle,
  Pin,
  Pencil,
  RefreshCw,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
  Workflow,
} from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import CEDAReviewWorkspace from '@/components/student-lad/CEDAReviewWorkspace';
import StudentShell from '@/components/student-lad/shell/StudentShell';
import type { StudentNavGroup, StudentNavItem } from '@/components/student-lad/shell/StudentSidebar';
import { openWorkspaceTool } from '@/components/student-lad/tools/workspaceToolBus';
import SharedConnectorCenter from '@/components/dorje-ai/SharedConnectorCenter';
import { apiFetch } from '@/lib/api';
import { AUTH_CHANGED_EVENT, getUser, type AuthUser } from '@/lib/auth';
import { listChatHistory, saveChatHistoryPolicy } from '@/lib/chatHistory';
import { KAMAL_VOICE_PROFILES, previewKamalVoice } from '@/lib/kamalVoice';
import {
  useStudentStore,
  type AccentColor,
  type AppBackground,
  type KamalAvatar,
  type LocalVoice,
  type NotificationPreferences,
  type PerformanceProfile,
  type StudentExecutionMode,
  type StudentTheme,
  type StudentUiTheme,
} from '@/lib/studentStore';
import { userStorageKey } from '@/lib/userStorage';

type ContextObject = { context_id: string; domain: string; type: string; title: string; payload: { instruction?: string }; source: { type?: string; reference?: string }; retention_reason: string; confidence: number; policy_ids: string[]; status: string; version: number; expires_at?: string; last_used_at?: string; layer: string; workspace: string; quality_score: number };
type CedaStructuredItem = { id: string; context_object_id?: string; domain: string; type: string; summary: string; related_item?: string; source_type?: string; source_reference?: string; policy_applied?: string; confidence?: number; status: string; version?: number; expires_at?: string; metadata?: { extracted_fields?: { title?: string; record_type?: string; key_date?: string }; directory?: string } };
type Reminder = { id: string; title: string; priority: string; confidence?: number; official_verification_required?: boolean; disclaimer?: string; due_at?: string; reminder_date?: string; status?: string };
type Dashboard = { workspace: string; pending_approvals: number; upcoming_reminders: number; context_health_score: number; privacy_risk_score: number; context_items: Record<string, number>; categories: Record<string, number>; storage_mode: string };
type ContextHealth = { score: number; total_objects: number; duplicate_objects: number; stale_objects: number; broken_relationships: number; suggestions: string[] };
type PIEPolicy = { policy_id: string; name: string; scope_type: string; scope_id?: string; effect: string; actions: string[]; enabled: boolean; version: number; updated_at: string };
type PIEDecision = { decision_id: string; action: string; outcome: string; explanation: string; model?: string; connector?: string; created_at: string };
type WKIMWorkspace = { location_id: string; workspace_id?: string; name: string; location: string; storage_type: string; category: string; sync_mode: string; health_status: string; permission_level: string; watcher_enabled: boolean; source: 'system' | 'wkim' | 'connector'; status: string; disconnectable: boolean };
type WKIMDocument = { document_id: string; workspace_id: string; title: string; domain: string; classification: string; file_type: string; size_bytes: number; index_status: string; last_indexed_at: string };
type WKIMHealth = { score: number; workspaces: number; indexed_documents: number; broken_references: number; pending_index: number; failed_index: number; storage_strategy: string; suggestions: string[] };
type DeviceModeValue = 'mobile' | 'desktop';
type ResourceProfileValue = '8gb' | '16gb' | '32gb';
type ConnectivityModeValue = 'offline' | 'hybrid' | 'online';
type MemoryRecord = { memory_id?: string; candidate_id?: string; id?: string; category: string; content: string; summary?: string; memory_type: string; memory_class: string; sensitivity: string; status: string; confidence: number; importance?: number; repeatability?: number; retention_policy?: string; workspace_id?: string; created_at?: string; expires_at?: string; requires_confirmation?: boolean; evidence?: string[] };
type DeviceProfileSettings = {
  device_mode: DeviceModeValue;
  resource_profile: ResourceProfileValue;
  connectivity_mode: ConnectivityModeValue;
  resource_rules?: Record<string, string[] | number | string>;
  connectivity_rules?: { allowed?: string[]; blocked?: string[]; execution_policy?: string; cloud_warning?: string };
};
type HistoryPolicySettings = {
  tier: string;
  history_policy: {
    raw_chat_history_days: number;
    summary_history_days: number;
    daily_summary_enabled: boolean;
    weekly_summary_enabled: boolean;
    cross_device_history: boolean;
    max_saved_conversations: number | null;
    admin_retention_policy?: boolean;
  };
  memory_policy?: { durable_memory_requires_policy_engine?: boolean; raw_chat_is_temporary?: boolean; summaries_remain_longer_than_raw_chat?: boolean };
  ui_rules?: { recent_conversation_limit?: number; chat_history_limit?: number | null; show_daily_summary?: boolean; show_weekly_summary?: boolean; cross_device_history?: boolean };
};
type OrchestrationPolicySettings = {
  tier: string;
  device_profile?: DeviceProfileSettings;
  memory_policy?: {
    classes?: Array<Record<string, string | boolean | number | null>>;
    rules?: Record<string, string>;
  };
  upload_limits?: {
    max_file_size_mb?: number;
    daily_upload_limit?: number | null;
    large_documents_available?: boolean;
  };
  model_residency?: {
    resident_models?: string[];
    lazy_models?: string[];
    disabled_local_models?: string[];
    deepseek_policy?: string;
    idle_unload_seconds?: number;
    cloud_fallback_allowed?: boolean;
    notes?: string[];
  };
};
type HolidayTravelEntry = {
  entry_id: string;
  entry_type: 'Holiday' | 'Trip' | 'Travel document' | 'Budget' | 'Reminder';
  name: string;
  date: string;
  location: string;
  details: string;
  status: 'active';
  source: 'manual_form';
  created_at: string;
  updated_at: string;
};

const DEVICE_PROFILE_STORAGE_KEY = 'student_lad_device_profile';
function deviceProfileStorageKey() { return userStorageKey(DEVICE_PROFILE_STORAGE_KEY); }
function calendarConflictDecisionStorageKey() { return userStorageKey('student_lad_calendar_conflict_decisions'); }
const DEFAULT_DEVICE_PROFILE: DeviceProfileSettings = { device_mode: 'desktop', resource_profile: '16gb', connectivity_mode: 'hybrid' };
const DEFAULT_HISTORY_POLICY: HistoryPolicySettings = { tier: 'free', history_policy: { raw_chat_history_days: 7, summary_history_days: 30, daily_summary_enabled: true, weekly_summary_enabled: false, cross_device_history: false, max_saved_conversations: 10 }, memory_policy: { durable_memory_requires_policy_engine: true, raw_chat_is_temporary: true, summaries_remain_longer_than_raw_chat: true }, ui_rules: { recent_conversation_limit: 3, chat_history_limit: 10, show_daily_summary: true, show_weekly_summary: false, cross_device_history: false } };
const DEFAULT_ORCHESTRATION_POLICY: OrchestrationPolicySettings = { tier: 'free', memory_policy: { classes: [{ memory_class: 'temporary', allowed: true, expires: 'interaction_end', storage_mode: 'transient', reason: 'Temporary memory expires after the current interaction.' }, { memory_class: 'session', allowed: true, expires: 'session_end', storage_mode: 'transient', reason: 'Session memory expires after the active session.' }, { memory_class: 'durable', allowed: true, expires: 'policy_retention', storage_mode: 'encrypted_local', reason: 'Durable memory requires approval and policy.' }, { memory_class: 'sensitive', allowed: false, expires: 'never', storage_mode: 'encrypted_local', reason: 'Sensitive memory must not be stored automatically.' }], rules: {} }, upload_limits: { max_file_size_mb: 5, daily_upload_limit: 5, large_documents_available: false }, model_residency: { resident_models: ['intent_classifier', 'deepseek-r1:1.5b'], lazy_models: ['qwen3:8b', 'whisper-tiny', 'qwen3.5:0.8b', 'tiny-sd'], disabled_local_models: ['ssd-1b'], deepseek_policy: 'reasoning_only', idle_unload_seconds: 900, cloud_fallback_allowed: false, notes: [] } };
const DEFAULT_DASHBOARD: Dashboard = { workspace: 'Student Workspace', pending_approvals: 0, upcoming_reminders: 0, context_health_score: 0, privacy_risk_score: 0, context_items: {}, categories: {}, storage_mode: 'local metadata' };
const DEFAULT_CONTEXT_HEALTH: ContextHealth = { score: 0, total_objects: 0, duplicate_objects: 0, stale_objects: 0, broken_relationships: 0, suggestions: [] };
const DEFAULT_WKIM_HEALTH: WKIMHealth = { score: 0, workspaces: 0, indexed_documents: 0, broken_references: 0, pending_index: 0, failed_index: 0, storage_strategy: 'references only', suggestions: [] };
type ThreeDTabTone = 'academic' | 'career' | 'immigration' | 'family' | 'health' | 'finance' | 'travel' | 'personal' | 'system';
type WellbeingArea = 'academic' | 'health' | 'relationships' | 'social' | 'economic';
type DailyActivityStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped' | 'rescheduled' | 'cancelled';
type MyDayView = 'Timeline' | 'Activity Log';
type MyDayPeriod = 'day' | 'week' | 'month' | 'year';
type MyDaySummaryFilter = 'done' | 'high' | 'critical' | 'upcoming' | null;
type DailyActivity = {
  id: string;
  title: string;
  area: WellbeingArea;
  activityType: string;
  date: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  status: DailyActivityStatus;
  priority: 'low' | 'normal' | 'high' | 'critical';
  fixedTime: boolean;
  description?: string;
  location?: string;
  relatedPerson?: string;
  amount?: number;
  currency?: string;
  source: 'manual' | 'voice' | 'kamal' | 'calendar' | 'task' | 'connector';
  sensitive: boolean;
  requiresPreparation: boolean;
  preparationNote?: string;
};
type MyDayAreaSummary = { planned: number; completed: number; attention: number; high: number; critical: number; state: 'on_track' | 'needs_attention' | 'upcoming' | 'completed' | 'no_activity_planned'; note: string };
type MyDayModel = {
  date: Date;
  greeting: string;
  summary: { priority_count: number; scheduled_count: number; completed_count: number; attention_count: number; conflict_count: number };
  areas: Record<WellbeingArea, MyDayAreaSummary>;
  priorities: DailyActivity[];
  timeline: DailyActivity[];
  unscheduled: DailyActivity[];
  activity_log: Array<{ time: string; action: string; area: WellbeingArea; result: string; source: string }>;
  suggestions: string[];
  people_to_contact: DailyActivity[];
  tomorrow_preview: string[];
};
type MyDayConflict = { id: string; title: string; first: DailyActivity; second: DailyActivity; overlapMinutes: number };
const threeDTabToneClasses: Record<ThreeDTabTone, string> = {
  academic: 'from-blue-700 to-blue-500 shadow-[0_7px_0_rgba(29,78,216,0.72),0_16px_28px_rgba(29,78,216,0.26)]',
  career: 'from-violet-700 to-violet-500 shadow-[0_7px_0_rgba(109,40,217,0.72),0_16px_28px_rgba(109,40,217,0.26)]',
  immigration: 'from-amber-700 to-amber-500 shadow-[0_7px_0_rgba(180,83,9,0.72),0_16px_28px_rgba(180,83,9,0.24)]',
  family: 'from-rose-700 to-rose-500 shadow-[0_7px_0_rgba(190,18,60,0.72),0_16px_28px_rgba(190,18,60,0.24)]',
  health: 'from-teal-700 to-teal-500 shadow-[0_7px_0_rgba(15,118,110,0.72),0_16px_28px_rgba(15,118,110,0.24)]',
  finance: 'from-green-700 to-green-500 shadow-[0_7px_0_rgba(21,128,61,0.72),0_16px_28px_rgba(21,128,61,0.24)]',
  travel: 'from-sky-700 to-sky-500 shadow-[0_7px_0_rgba(3,105,161,0.72),0_16px_28px_rgba(3,105,161,0.24)]',
  personal: 'from-slate-700 to-slate-500 shadow-[0_7px_0_rgba(51,65,85,0.72),0_16px_28px_rgba(51,65,85,0.22)]',
  system: 'from-emerald-700 to-emerald-500 shadow-[0_7px_0_rgba(4,120,87,0.72),0_16px_28px_rgba(4,120,87,0.24)]',
};
const CALENDAR_MIN_YEAR = 1999;
const CALENDAR_MAX_YEAR = 2100;
const MONTH_LABELS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const ACTIVE_REMINDER_STATUSES = new Set(['active', 'suggested', 'open', 'pending', '']);
type CalendarEvent = Reminder & { date: Date; key: string; dateLabel: string; timeLabel: string };
type SharedTaskStatus = 'draft' | 'active' | 'in_progress' | 'completed' | 'cancelled' | 'archived';
type SharedTaskCategory = 'academic' | 'health' | 'immigration' | 'career' | 'family' | 'finance' | 'holiday' | 'personal';
type SharedTask = {
  id: string;
  title: string;
  description?: string;
  category: SharedTaskCategory;
  status: SharedTaskStatus;
  priority: 'low' | 'normal' | 'high' | 'critical';
  dueAt?: Date;
  startAt?: Date;
  completedAt?: Date;
  estimatedMinutes?: number;
  progressPercent: number;
  reminderIds: string[];
  calendarEventId?: string;
  sourceRecordId?: string;
  sensitive: boolean;
  createdAt: string;
  updatedAt: string;
};
type SharedTaskScope = 'all' | 'today' | 'upcoming' | 'overdue' | 'active' | 'completed' | SharedTaskCategory;

function clampCalendarYear(year: number) {
  return Math.min(CALENDAR_MAX_YEAR, Math.max(CALENDAR_MIN_YEAR, year));
}

function parseReminderDate(value?: string) {
  if (!value || value === '—') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function priorityWeight(priority?: string) {
  return ({ critical: 0, high: 1, normal: 2, low: 3 } as Record<string, number>)[priority || 'normal'] ?? 2;
}

function reminderToEvent(reminder: Reminder): CalendarEvent | null {
  if (!ACTIVE_REMINDER_STATUSES.has(reminder.status || 'active')) return null;
  const date = parseReminderDate(reminder.due_at || reminder.reminder_date);
  if (!date) return null;
  return {
    ...reminder,
    date,
    key: dateKey(date),
    dateLabel: date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
    timeLabel: date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
  };
}

function reminderEvents(reminders: Reminder[]) {
  return reminders
    .map(reminderToEvent)
    .filter((event): event is CalendarEvent => Boolean(event))
    .sort((a, b) => a.date.getTime() - b.date.getTime() || priorityWeight(a.priority) - priorityWeight(b.priority) || a.title.localeCompare(b.title));
}

function arrayFromApi<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items)) return (value as { items: T[] }).items;
  return [];
}

function contextFromStructuredItem(item: CedaStructuredItem): ContextObject {
  const recordType = item.metadata?.extracted_fields?.record_type || item.type || 'Structured Information';
  const title = item.metadata?.extracted_fields?.title || item.related_item || item.summary;
  return {
    context_id: item.context_object_id || `CEDA-${item.id}`,
    domain: item.domain,
    type: recordType,
    title,
    payload: { instruction: item.summary },
    source: { type: item.source_type || 'ceda_review', reference: item.source_reference },
    retention_reason: 'Approved structured CEDA item',
    confidence: item.confidence ?? 0.75,
    policy_ids: item.policy_applied ? [item.policy_applied] : [`${item.domain}_context_allowed`],
    status: item.status === 'approved' ? 'active' : item.status,
    version: item.version || 1,
    expires_at: item.expires_at,
    layer: item.domain === 'preferences' ? 'persistent' : 'active',
    workspace: item.domain ? titleCase(item.domain) : 'Workspace',
    quality_score: item.confidence ?? 0.75,
  };
}

function mergeContextRows(registryRows: ContextObject[], structuredRows: CedaStructuredItem[]) {
  const merged = [...registryRows];
  const seen = new Set(merged.map((item) => item.context_id));
  const fingerprints = new Set(merged.map((item) => `${item.domain}|${displayRecordType(item)}|${cleanRecordTitle(item)}`.toLowerCase()));
  for (const item of structuredRows.filter((row) => row.status === 'approved')) {
    const mapped = contextFromStructuredItem(item);
    const fingerprint = `${mapped.domain}|${displayRecordType(mapped)}|${cleanRecordTitle(mapped)}`.toLowerCase();
    if (seen.has(mapped.context_id) || fingerprints.has(fingerprint)) continue;
    seen.add(mapped.context_id);
    fingerprints.add(fingerprint);
    merged.push(mapped);
  }
  return merged;
}

function sortRemindersBySchedule(reminders: Reminder[]) {
  return [...reminders].sort((a, b) => {
    const aDate = parseReminderDate(a.due_at || a.reminder_date);
    const bDate = parseReminderDate(b.due_at || b.reminder_date);
    if (aDate && bDate) return aDate.getTime() - bDate.getTime() || priorityWeight(a.priority) - priorityWeight(b.priority);
    if (aDate) return -1;
    if (bDate) return 1;
    return priorityWeight(a.priority) - priorityWeight(b.priority) || a.title.localeCompare(b.title);
  });
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, occurrence: number) {
  const date = new Date(year, month, 1);
  const offset = (weekday - date.getDay() + 7) % 7;
  date.setDate(1 + offset + (occurrence - 1) * 7);
  return date;
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number) {
  const date = new Date(year, month + 1, 0);
  const offset = (date.getDay() - weekday + 7) % 7;
  date.setDate(date.getDate() - offset);
  return date;
}

function addHoliday(holidays: Map<string, string[]>, date: Date, name: string) {
  const key = dateKey(date);
  holidays.set(key, [...(holidays.get(key) || []), name]);
}

function addFixedHoliday(holidays: Map<string, string[]>, year: number, month: number, day: number, name: string) {
  const actual = new Date(year, month, day);
  addHoliday(holidays, actual, name);
  if (actual.getDay() === 6) addHoliday(holidays, addDays(actual, -1), `${name} (observed)`);
  if (actual.getDay() === 0) addHoliday(holidays, addDays(actual, 1), `${name} (observed)`);
}

function usFederalHolidays(year: number) {
  const holidays = new Map<string, string[]>();
  addFixedHoliday(holidays, year, 0, 1, "New Year's Day");
  addHoliday(holidays, nthWeekdayOfMonth(year, 0, 1, 3), 'Martin Luther King Jr. Day');
  addHoliday(holidays, nthWeekdayOfMonth(year, 1, 1, 3), "Washington's Birthday");
  addHoliday(holidays, lastWeekdayOfMonth(year, 4, 1), 'Memorial Day');
  addFixedHoliday(holidays, year, 5, 19, 'Juneteenth National Independence Day');
  addFixedHoliday(holidays, year, 6, 4, 'Independence Day');
  addHoliday(holidays, nthWeekdayOfMonth(year, 8, 1, 1), 'Labor Day');
  addHoliday(holidays, nthWeekdayOfMonth(year, 9, 1, 2), 'Columbus Day');
  addFixedHoliday(holidays, year, 10, 11, 'Veterans Day');
  addHoliday(holidays, nthWeekdayOfMonth(year, 10, 4, 4), 'Thanksgiving Day');
  addFixedHoliday(holidays, year, 11, 25, 'Christmas Day');
  return holidays;
}

function holidayMapForCalendarYear(year: number) {
  const holidays = new Map<string, string[]>();
  [year - 1, year, year + 1].forEach((holidayYear) => {
    usFederalHolidays(holidayYear).forEach((names, key) => holidays.set(key, [...(holidays.get(key) || []), ...names]));
  });
  return holidays;
}

function normalizeDeviceProfile(profile?: Partial<DeviceProfileSettings>): DeviceProfileSettings {
  const parsed = profile || {};
  return {
    ...DEFAULT_DEVICE_PROFILE,
    ...parsed,
    device_mode: parsed.device_mode === 'mobile' ? 'mobile' : 'desktop',
    resource_profile: parsed.resource_profile === '8gb' || parsed.resource_profile === '32gb' ? parsed.resource_profile : '16gb',
    connectivity_mode: parsed.connectivity_mode === 'offline' || parsed.connectivity_mode === 'online' ? parsed.connectivity_mode : 'hybrid',
  };
}

function readStoredDeviceProfile(): DeviceProfileSettings {
  if (typeof window === 'undefined') return normalizeDeviceProfile();
  try {
    const stored = window.localStorage.getItem(deviceProfileStorageKey());
    if (!stored) return normalizeDeviceProfile();
    const parsed = JSON.parse(stored) as Partial<DeviceProfileSettings>;
    return normalizeDeviceProfile(parsed);
  } catch {
    return normalizeDeviceProfile();
  }
}

function saveStoredDeviceProfile(profile: DeviceProfileSettings) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(deviceProfileStorageKey(), JSON.stringify(profile));
}

function normalizeHistoryPolicy(policy?: Partial<HistoryPolicySettings>): HistoryPolicySettings {
  return {
    ...DEFAULT_HISTORY_POLICY,
    ...policy,
    history_policy: { ...DEFAULT_HISTORY_POLICY.history_policy, ...(policy?.history_policy || {}) },
    memory_policy: { ...DEFAULT_HISTORY_POLICY.memory_policy, ...(policy?.memory_policy || {}) },
    ui_rules: { ...DEFAULT_HISTORY_POLICY.ui_rules, ...(policy?.ui_rules || {}) },
  };
}

function normalizeOrchestrationPolicy(policy?: Partial<OrchestrationPolicySettings>): OrchestrationPolicySettings {
  return {
    ...DEFAULT_ORCHESTRATION_POLICY,
    ...policy,
    memory_policy: { ...DEFAULT_ORCHESTRATION_POLICY.memory_policy, ...(policy?.memory_policy || {}) },
    upload_limits: { ...DEFAULT_ORCHESTRATION_POLICY.upload_limits, ...(policy?.upload_limits || {}) },
    model_residency: { ...DEFAULT_ORCHESTRATION_POLICY.model_residency, ...(policy?.model_residency || {}) },
  };
}

const navGroups = [
  {
    label: 'TODAY',
    items: [
      { label: 'Home', icon: Home, href: '/student-lad' },
      { label: 'My Day', icon: Compass, href: '/student-lad/my-day' },
      { label: 'Workspace AI', icon: Bot, href: '/dorje-ai', external: true },
    ],
  },
  {
    label: 'ORGANIZE',
    items: [
      { label: 'Tasks', icon: CalendarDays, href: '/student-lad/tasks' },
      { label: 'Review & Save', icon: CheckCircle2, href: '/student-lad/review' },
      { label: 'Workspaces', icon: FolderOpen, href: '/student-lad/workspaces' },
      { label: 'Memory Center', icon: Database, href: '/student-lad/memory' },
    ],
  },
  {
    label: 'STUDENT',
    items: [
      { label: 'Academic', icon: GraduationCap, href: '/student-lad/academic' },
      { label: 'Immigration', icon: ShieldCheck, href: '/student-lad/immigration' },
      { label: 'Career', icon: Briefcase, href: '/student-lad/career' },
    ],
  },
  {
    label: 'LIFE',
    items: [
      { label: 'Family', icon: Users, href: '/student-lad/family' },
      { label: 'Health', icon: HeartPulse, href: '/student-lad/health' },
      { label: 'Bills & Subscriptions', icon: CreditCard, href: '/student-lad/finance' },
      { label: 'Holidays', icon: Gift, href: '/student-lad/holidays' },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { label: 'Connectors', icon: Workflow, href: '/student-lad/connectors' },
      { label: 'Analytics & Insights', icon: Database, href: '/student-lad/analytics' },
      { label: 'Policies', icon: ShieldCheck, href: '/student-lad/policies' },
      { label: 'Settings', icon: Settings, href: '/student-lad/settings' },
    ],
  },
] satisfies StudentNavGroup[];

const navItems = navGroups.flatMap((group) => group.items);
type Screen = (typeof navItems)[number]['label'];
const routeToScreen: Record<string, Screen> = {
  ...(Object.fromEntries(navItems.map((item) => [item.href, item.label])) as Record<string, Screen>),
  '/student-lad/calendar': 'Tasks',
};
const screenToRoute: Record<Screen, string> = Object.fromEntries(navItems.map((item) => [item.label, item.href])) as Record<Screen, string>;
function screenFromPath(pathname: string): Screen { return routeToScreen[pathname] || 'Home'; }
function firstDisplayName(name: string) { return name.trim().split(/\s+/)[0] || 'Student'; }
async function optionalStudentApiFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    return await apiFetch<T>(path);
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason);
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`Student-LAD optional endpoint unavailable: ${path}`, message);
    }
    return fallback;
  }
}

export default function StudentLADPage() {
  const pathname = usePathname();
  const router = useRouter();
  const screen = screenFromPath(pathname);
  const [user, setUser] = useState<AuthUser | null>(() => getUser());
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [context, setContext] = useState<ContextObject[]>([]);
  const [policies, setPolicies] = useState<Record<string, Record<string, unknown>>>({});
  const [piePolicies, setPiePolicies] = useState<PIEPolicy[]>([]);
  const [pieDecisions, setPieDecisions] = useState<PIEDecision[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [health, setHealth] = useState<ContextHealth>();
  const [locations, setLocations] = useState<WKIMWorkspace[]>([]);
  const [catalog, setCatalog] = useState<WKIMDocument[]>([]);
  const [wkimHealth, setWkimHealth] = useState<WKIMHealth>();
  const [deviceProfile, setDeviceProfile] = useState<DeviceProfileSettings>(() => readStoredDeviceProfile());
  const [historyPolicy, setHistoryPolicy] = useState<HistoryPolicySettings>(() => DEFAULT_HISTORY_POLICY);
  const [orchestrationPolicy, setOrchestrationPolicy] = useState<OrchestrationPolicySettings>(() => DEFAULT_ORCHESTRATION_POLICY);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [pendingMemories, setPendingMemories] = useState<MemoryRecord[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [nextDashboard, nextContext, nextStructuredContext, nextPolicies, nextReminders, nextHealth, nextPiePolicies, nextPieDecisions, nextLocations, nextCatalog, nextWkimHealth, nextDeviceProfile, nextHistoryPolicy, nextOrchestrationPolicy, nextMemories, nextPendingMemories] = await Promise.all([
        optionalStudentApiFetch<Dashboard>('/api/v1/ceda/dashboard', DEFAULT_DASHBOARD),
        optionalStudentApiFetch<ContextObject[]>('/api/v1/context-os/registry', []),
        optionalStudentApiFetch<CedaStructuredItem[]>('/api/v1/ceda/items?status=approved', []),
        optionalStudentApiFetch<Record<string, Record<string, unknown>>>('/api/v1/ceda/policies', {}),
        optionalStudentApiFetch<{ items: Reminder[] }>('/api/v1/ceda/reminders', { items: [] }),
        optionalStudentApiFetch<ContextHealth>('/api/v1/context-os/health', DEFAULT_CONTEXT_HEALTH),
        optionalStudentApiFetch<PIEPolicy[]>('/api/v1/pie/policies', []),
        optionalStudentApiFetch<PIEDecision[]>('/api/v1/pie/decisions?limit=10', []),
        optionalStudentApiFetch<WKIMWorkspace[]>('/api/v1/wkim/storage-locations', []),
        optionalStudentApiFetch<WKIMDocument[]>('/api/v1/wkim/catalog', []),
        optionalStudentApiFetch<WKIMHealth>('/api/v1/wkim/health', DEFAULT_WKIM_HEALTH),
        optionalStudentApiFetch<DeviceProfileSettings>('/api/v1/settings/device-profile', DEFAULT_DEVICE_PROFILE),
        optionalStudentApiFetch<HistoryPolicySettings>('/api/v1/settings/history-policy', DEFAULT_HISTORY_POLICY),
        optionalStudentApiFetch<OrchestrationPolicySettings>('/api/v1/settings/orchestration-policy', DEFAULT_ORCHESTRATION_POLICY),
        optionalStudentApiFetch<{ items: MemoryRecord[] }>('/api/v1/dorje-ai/memory', { items: [] }),
        optionalStudentApiFetch<{ items: MemoryRecord[] }>('/api/v1/dorje-ai/memory/pending', { items: [] }),
      ]);
      const normalizedDeviceProfile = normalizeDeviceProfile(nextDeviceProfile);
      const normalizedHistoryPolicy = normalizeHistoryPolicy(nextHistoryPolicy);
      const normalizedOrchestrationPolicy = normalizeOrchestrationPolicy(nextOrchestrationPolicy);
      const contextRows = arrayFromApi<ContextObject>(nextContext);
      const structuredContextRows = arrayFromApi<CedaStructuredItem>(nextStructuredContext);
      const reminderRows = arrayFromApi<Reminder>(nextReminders);
      const piePolicyRows = arrayFromApi<PIEPolicy>(nextPiePolicies);
      const pieDecisionRows = arrayFromApi<PIEDecision>(nextPieDecisions);
      const locationRows = arrayFromApi<WKIMWorkspace>(nextLocations);
      const catalogRows = arrayFromApi<WKIMDocument>(nextCatalog);
      setDashboard(nextDashboard); setContext(mergeContextRows(contextRows, structuredContextRows)); setPolicies(nextPolicies); setReminders(sortRemindersBySchedule(reminderRows)); setHealth(nextHealth); setPiePolicies(piePolicyRows); setPieDecisions(pieDecisionRows); setLocations(locationRows); setCatalog(catalogRows); setWkimHealth(nextWkimHealth); setDeviceProfile(normalizedDeviceProfile); setHistoryPolicy(normalizedHistoryPolicy); setOrchestrationPolicy(normalizedOrchestrationPolicy); setMemories(arrayFromApi<MemoryRecord>(nextMemories)); setPendingMemories(arrayFromApi<MemoryRecord>(nextPendingMemories)); saveStoredDeviceProfile(normalizedDeviceProfile); saveChatHistoryPolicy(normalizedHistoryPolicy.history_policy); setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load Student-LAD workspace.');
    }
  }, [
    setCatalog,
    setContext,
    setDashboard,
    setDeviceProfile,
    setError,
    setHealth,
    setHistoryPolicy,
    setLocations,
    setMemories,
    setOrchestrationPolicy,
    setPendingMemories,
    setPieDecisions,
    setPiePolicies,
    setPolicies,
    setReminders,
    setWkimHealth,
  ]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { const refresh = () => void load(); window.addEventListener('student-lad:refresh', refresh); return () => window.removeEventListener('student-lad:refresh', refresh); }, [load]);
  useEffect(() => {
    const refreshForUser = () => {
      setUser(getUser());
      setDashboard(undefined);
      setContext([]);
      setPolicies({});
      setPiePolicies([]);
      setPieDecisions([]);
      setReminders([]);
      setHealth(undefined);
      setLocations([]);
      setCatalog([]);
      setWkimHealth(undefined);
      setMemories([]);
      setPendingMemories([]);
      void load();
    };
    window.addEventListener(AUTH_CHANGED_EVENT, refreshForUser);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, refreshForUser);
  }, [load]);

  const displayName = user?.name || user?.full_name || user?.email?.split('@')[0] || 'Student';
  const pendingReview = dashboard?.pending_approvals ?? 0;
  const academic = context.filter((item) => item.domain === 'academic');
  const immigration = context.filter((item) => item.domain === 'immigration');
  const career = context.filter((item) => item.domain === 'career');
  const rightPanel = rightPanelFor(screen, { pendingReview, reminders, health, pieDecisions, locations, catalog });

  async function removeKnowledgeReference(item: WKIMDocument) {
    if (!window.confirm(`Remove “${item.title}” from the DorjeAI catalog? The original file will not be deleted.`)) return;
    await apiFetch(`/api/v1/wkim/catalog/${item.document_id}`, { method: 'DELETE' });
    setCatalog((current) => current.filter((candidate) => candidate.document_id !== item.document_id));
    setNotice('Knowledge reference removed. The original file was not deleted.');
  }

  async function clearKnowledgeCatalog() {
    if (!catalog.length || !window.confirm(`Clear all ${catalog.length} catalog reference(s)? Original files will remain untouched.`)) return;
    await apiFetch('/api/v1/wkim/catalog', { method: 'DELETE' });
    setNotice('Knowledge catalog cleared. Original files were not deleted.');
    await load();
  }

  async function disconnectLocation(item: WKIMWorkspace) {
    if (!item.workspace_id || !item.disconnectable || !window.confirm(`Disconnect “${item.name}” and clear its DorjeAI references? Original files and folders will remain untouched.`)) return;
    await apiFetch(`/api/v1/wkim/workspaces/${item.workspace_id}?clear_catalog=true`, { method: 'DELETE' });
    setNotice('Workspace disconnected. Original files and folders were not deleted.');
    await load();
  }

  async function updateSavePolicy(category: string, save: string) {
    await apiFetch(`/api/v1/ceda/policies/${category.toLowerCase()}`, { method: 'PUT', body: JSON.stringify({ rules: { save } }) });
    setNotice(`${category} policy updated to “${save.replaceAll('_', ' ')}”.`);
    await load();
  }

  async function updateDeviceProfile(changes: Partial<DeviceProfileSettings>) {
    const nextProfile = { ...deviceProfile, ...changes };
    setDeviceProfile(nextProfile);
    saveStoredDeviceProfile(nextProfile);
    try {
      const saved = await apiFetch<DeviceProfileSettings>('/api/v1/settings/device-profile', {
        method: 'PUT',
        body: JSON.stringify({
          device_mode: nextProfile.device_mode,
          resource_profile: nextProfile.resource_profile,
          connectivity_mode: nextProfile.connectivity_mode,
        }),
      });
      const normalizedSaved = normalizeDeviceProfile(saved);
      setDeviceProfile(normalizedSaved);
      saveStoredDeviceProfile(normalizedSaved);
      setNotice('App Device config updated.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save App Device config.');
    }
  }

  async function createCalendarReminder(payload: { title: string; due_at: string; reminder_date?: string; priority?: string }) {
    setError('');
    const created = await apiFetch<Reminder>('/api/v1/ceda/reminders', {
      method: 'POST',
      body: JSON.stringify({
        title: payload.title,
        due_at: payload.due_at,
        reminder_date: payload.reminder_date || payload.due_at,
        priority: payload.priority || 'normal',
      }),
    });
    setNotice(`Reminder created: ${created.title}. It is now visible in Tasks, Upcoming, and Saved Information.`);
    await load();
  }

  async function updateCalendarReminder(id: string, payload: Partial<{ title: string; due_at: string; reminder_date: string; priority: string; status: string }>) {
    setError('');
    const updated = await apiFetch<Reminder>(`/api/v1/ceda/reminders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    setNotice(`Reminder updated: ${updated.title}.`);
    await load();
  }

  async function deleteCalendarReminder(id: string) {
    if (!window.confirm('Delete this local reminder from Tasks?')) return;
    setError('');
    await apiFetch<Reminder>(`/api/v1/ceda/reminders/${id}`, { method: 'DELETE' });
    setNotice('Reminder deleted from Tasks. Its saved information was archived.');
    await load();
  }

  async function approveMemory(candidate: MemoryRecord) {
    const candidateId = candidate.candidate_id || candidate.id;
    if (!candidateId) return;
    await apiFetch('/api/v1/dorje-ai/memory/approve', { method: 'POST', body: JSON.stringify({ candidate_id: candidateId }) });
    setNotice('Memory approved and added to DorjeAI context.');
    await load();
  }

  async function rejectMemory(candidate: MemoryRecord) {
    const candidateId = candidate.candidate_id || candidate.id;
    if (!candidateId) return;
    await apiFetch('/api/v1/dorje-ai/memory/reject', { method: 'POST', body: JSON.stringify({ candidate_id: candidateId }) });
    setNotice('Memory candidate rejected. DorjeAI will not use it.');
    await load();
  }

  async function editMemory(memory: MemoryRecord) {
    const memoryId = memory.memory_id || memory.id;
    if (!memoryId) return;
    const next = window.prompt('Edit memory content', memory.content || memory.summary || '');
    if (!next?.trim()) return;
    await apiFetch(`/api/v1/dorje-ai/memory/${memoryId}`, { method: 'PATCH', body: JSON.stringify({ content: next.trim() }) });
    setNotice('Edited copy created. Original memory was preserved as superseded.');
    await load();
  }

  async function forgetMemory(memory: MemoryRecord) {
    const memoryId = memory.memory_id || memory.id;
    if (!memoryId || !window.confirm('Forget this memory? DorjeAI will remove it from future retrieval.')) return;
    await apiFetch(`/api/v1/dorje-ai/memory/${memoryId}`, { method: 'DELETE' });
    setNotice('Memory forgotten. Only audit status remains.');
    await load();
  }

  async function exportMemory() {
    const data = await apiFetch<{ memories: MemoryRecord[]; pending: MemoryRecord[] }>('/api/v1/dorje-ai/memory/export');
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'student-lad-memory.json'; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function createStructuredRecord(domain: string, text: string, sourceReference = 'Manual entry') {
    const clean = text.trim();
    if (!clean) return;
    setError('');
    const extract = await apiFetch<{ items?: Array<{ id: string; summary?: string }>; item_count?: number; status?: string; duplicate_item_id?: string }>('/api/v1/ceda/extract', {
      method: 'POST',
      body: JSON.stringify({ text: `${domain} record: ${clean}`, source_type: `${domain}_manual_entry`, source_reference: sourceReference }),
    });
    if (extract.duplicate_item_id) {
      setNotice('This looks like an existing saved record. No duplicate was created.');
      await load();
      return;
    }
    const items = extract.items || [];
    for (const item of items) await apiFetch(`/api/v1/ceda/items/${item.id}/approve`, { method: 'POST' });
    setNotice(items.length ? `Saved ${items.length} ${domain} record${items.length === 1 ? '' : 's'} and refreshed the workspace.` : 'No structured record was found to save.');
    await load();
    window.dispatchEvent(new Event('student-lad:refresh'));
  }

  function navigate(nextScreen: Screen) {
    if (nextScreen === 'Workspace AI') {
      router.push('/dorje-ai');
      return;
    }
    router.push(screenToRoute[nextScreen] || '/student-lad');
  }

  function navigateItem(item: StudentNavItem) {
    if (item.external || item.label === 'Workspace AI') {
      router.push(item.href);
      return;
    }
    router.push(item.href || '/student-lad');
  }

  return (
    <AuthGuard>
      <StudentShell
        groups={navGroups}
        activeLabel={screen}
        displayName={displayName}
        rightPanel={rightPanel}
        indexedFiles={catalog.length}
        connectedLocations={locations.length}
        onNavigate={navigateItem}
      >
        <div className="space-y-5">
          {error ? <Status tone="error">{error}</Status> : null}
          {notice ? <Status tone="success">{notice}</Status> : null}
          {screen === 'Home' ? <HomeScreen name={displayName} dashboard={dashboard} reminders={reminders} health={health} academic={academic.length} immigration={immigration.length} career={career.length} onNavigate={navigate} /> : null}
          {screen === 'My Day' ? <MyDayScreen reminders={reminders} displayName={firstDisplayName(displayName)} onNavigate={navigate} /> : null}
          {screen === 'Kamal Chat' ? <KamalScreen /> : null}
          {screen === 'Review & Save' ? <CEDAReviewWorkspace /> : null}
          {screen === 'Memory Center' ? <MemoryCenterScreen memories={memories} pending={pendingMemories} onApprove={(item) => void approveMemory(item)} onReject={(item) => void rejectMemory(item)} onEdit={(item) => void editMemory(item)} onForget={(item) => void forgetMemory(item)} onExport={() => void exportMemory()} /> : null}
          {screen === 'Tasks' ? <CalendarScreen initialTab={pathname === '/student-lad/calendar' ? 'Calendar' : 'Tasks'} reminders={reminders} onCreateReminder={createCalendarReminder} onUpdateReminder={updateCalendarReminder} onDeleteReminder={deleteCalendarReminder} /> : null}
          {screen === 'Workspaces' ? <WorkspacesScreen locations={locations} catalog={catalog} health={wkimHealth} onClear={() => void clearKnowledgeCatalog()} onRemove={(item) => void removeKnowledgeReference(item)} onDisconnect={(item) => void disconnectLocation(item)} /> : null}
          {screen === 'Academic' ? <AcademicScreen academic={academic} onCreateRecord={(text, source) => void createStructuredRecord('academic', text, source)} /> : null}
          {screen === 'Immigration' ? <ImmigrationScreen immigration={immigration} onCreateRecord={(text, source) => void createStructuredRecord('immigration', text, source)} /> : null}
          {screen === 'Career' ? <CareerScreen career={career} onCreateRecord={(text, source) => void createStructuredRecord('career', text, source)} /> : null}
          {screen === 'Family' ? <FamilyScreen onCreateRecord={(text, source) => void createStructuredRecord('personal', text, source)} /> : null}
          {screen === 'Health' ? <HealthScreen onCreateRecord={(text, source) => void createStructuredRecord('personal', text, source)} /> : null}
          {screen === 'Bills & Subscriptions' ? <FinanceScreen onCreateRecord={(text, source) => void createStructuredRecord('personal', text, source)} /> : null}
          {screen === 'Holidays' ? <HolidaysScreen /> : null}
          {screen === 'Connectors' ? <ConnectorsScreen /> : null}
          {screen === 'Policies' ? <PoliciesScreen policies={policies} piePolicies={piePolicies} pieDecisions={pieDecisions} onUpdateSavePolicy={(category, save) => void updateSavePolicy(category, save)} /> : null}
          {screen === 'Analytics & Insights' ? <AnalyticsScreen dashboard={dashboard} health={health} /> : null}
          {screen === 'Settings' ? <SettingsScreen policies={policies} piePolicies={piePolicies} pieDecisions={pieDecisions} deviceProfile={deviceProfile} historyPolicy={historyPolicy} orchestrationPolicy={orchestrationPolicy} onUpdateDeviceProfile={(changes) => void updateDeviceProfile(changes)} onUpdateSavePolicy={(category, save) => void updateSavePolicy(category, save)} /> : null}
        </div>
      </StudentShell>
    </AuthGuard>
  );
}

function HomeScreen({ name, dashboard, reminders, health, academic, immigration, career, onNavigate }: { name: string; dashboard?: Dashboard; reminders: Reminder[]; health?: ContextHealth; academic: number; immigration: number; career: number; onNavigate: (screen: Screen) => void }) {
  const top = reminders[0];
  const cards: HomeDashboardCardData[] = [
    { title: 'My Day', icon: '☀️', tone: 'system', screen: 'My Day', href: screenToRoute['My Day'], summary: `${reminders.length} reminder${reminders.length === 1 ? '' : 's'} · ${dashboard?.pending_approvals ?? 0} review`, priority: top?.title || 'Plan your first task', reminder: top?.due_at ? new Date(top.due_at).toLocaleString() : 'No timed reminder' },
    { title: 'Academic', icon: '📚', tone: 'academic', screen: 'Academic', href: screenToRoute.Academic, summary: `${academic} saved academic item${academic === 1 ? '' : 's'}`, priority: reminders.find((item) => /assignment|class|study|course|exam|statistics/i.test(item.title))?.title || 'Upload syllabus or assignment', reminder: 'Track deadlines and readings' },
    { title: 'Immigration', icon: '🛂', tone: 'immigration', screen: 'Immigration', href: screenToRoute.Immigration, summary: `${immigration} saved immigration item${immigration === 1 ? '' : 's'}`, priority: reminders.find((item) => /visa|i-20|opt|cpt|uscis|passport/i.test(item.title))?.title || 'Verify key dates', reminder: 'DSO / USCIS verification required' },
    { title: 'Career', icon: '💼', tone: 'career', screen: 'Career', href: screenToRoute.Career, summary: `${career} saved career item${career === 1 ? '' : 's'}`, priority: reminders.find((item) => /resume|career|job|interview|linkedin/i.test(item.title))?.title || 'Review resume pipeline', reminder: 'Applications and follow-ups' },
    { title: 'Family', icon: '👨‍👩‍👧', tone: 'family', screen: 'Family', href: screenToRoute.Family, summary: 'Family events and trusted contacts', priority: reminders.find((item) => /family|parent|call|birthday/i.test(item.title))?.title || 'No family task due', reminder: 'Keep important people close' },
    { title: 'Health', icon: '💚', tone: 'health', screen: 'Health', href: screenToRoute.Health, summary: 'Health routines and personal care', priority: reminders.find((item) => /gym|health|medicine|doctor|sleep/i.test(item.title))?.title || 'No health task due', reminder: 'Local private reminders' },
    { title: 'Finance', icon: '💵', tone: 'finance', screen: 'Bills & Subscriptions', href: screenToRoute['Bills & Subscriptions'], summary: 'Bills, subscriptions, and spending', priority: reminders.find((item) => /bill|rent|pay|expense|subscription|electricity/i.test(item.title))?.title || 'No payment due', reminder: 'Money tasks stay private' },
    { title: 'Holiday', icon: '✈️', tone: 'travel', screen: 'Holidays', href: screenToRoute.Holidays, summary: 'Holidays, travel, and breaks', priority: reminders.find((item) => /holiday|travel|trip|flight|break/i.test(item.title))?.title || 'No trip planned', reminder: 'Plan around academic timeline' },
  ];
  return <><Hero eyebrow="Student-LAD Home" title={`Good morning, ${name}. Choose where to continue.`} body="Eight focused areas keep your day, studies, documents, reminders, and life admin close without crowding the workspace." />
    <section aria-label="Student-LAD home cards" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => <HomeDashboardCard key={card.title} card={card} onOpen={() => onNavigate(card.screen)} />)}
    </section>
    <div className="grid gap-5 xl:grid-cols-[1fr_.8fr]"><Panel title="Top reminder"><FocusCard title={top?.title || 'Nothing urgent yet'} due={top?.due_at || 'No reminder due'} priority={top?.priority || 'normal'} action={top ? 'Open the related card to view details.' : 'Use Kamal to add your first reminder.'} /></Panel><Panel title="Home health"><div className="grid gap-3 sm:grid-cols-3"><Mini label="Needs Review" value={String(dashboard?.pending_approvals ?? 0)} /><Mini label="Reminders" value={String(reminders.length)} /><Mini label="Info Quality" value={`${health?.score ?? dashboard?.context_health_score ?? 0}%`} /></div></Panel></div>
  </>;
}

type HomeDashboardCardData = { title: string; icon: string; tone: ThreeDTabTone; screen: Screen; href: string; summary: string; priority: string; reminder: string };

function HomeDashboardCard({ card }: { card: HomeDashboardCardData; onOpen: () => void }) {
  return <Link href={card.href} className={`group relative block min-h-56 overflow-hidden rounded-[28px] bg-gradient-to-br p-5 text-left text-white transition duration-200 hover:-translate-y-1 active:translate-y-1 ${threeDTabToneClasses[card.tone]}`} aria-label={`Open ${card.title}`}>
    <span className="absolute inset-x-0 top-0 h-px bg-white/65" />
    <span className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/20 blur-2xl transition group-hover:scale-125" />
    <span className="relative flex items-start justify-between gap-3"><span className="text-3xl" aria-hidden="true">{card.icon}</span><span className="rounded-full bg-white/18 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/90">Open</span></span>
    <h2 className="relative mt-4 text-2xl font-black tracking-tight">{card.title}</h2>
    <p className="relative mt-2 text-sm leading-5 text-white/85">{card.summary}</p>
    <div className="relative mt-5 rounded-2xl bg-black/16 p-3 ring-1 ring-white/16">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white">Top priority</p>
      <p className="mt-1 text-sm font-semibold leading-5 text-white">{card.priority}</p>
    </div>
    <p className="relative mt-3 rounded-2xl bg-white/14 px-3 py-2 text-xs font-semibold leading-5 text-white/88">⏰ {card.reminder}</p>
  </Link>;
}

function MyDayScreen({ reminders, displayName, onNavigate }: { reminders: Reminder[]; displayName: string; onNavigate: (screen: Screen) => void }) {
  const [selectedDate, setSelectedDate] = useState(new Date('2026-07-13T09:00:00'));
  const [period, setPeriod] = useState<MyDayPeriod>('day');
  const [view, setView] = useState<MyDayView>('Timeline');
  const [showAreaSummary, setShowAreaSummary] = useState(false);
  const [summaryFilter, setSummaryFilter] = useState<MyDaySummaryFilter>(null);
  const [activities, setActivities] = useState<DailyActivity[]>(() => createMyDayActivities(selectedDate, reminders));
  const [log, setLog] = useState(() => createMyDayLog());
  const model = createMyDayViewModel(selectedDate, activities, displayName);
  const periodActivities = period === 'day' ? activities : createMyDayPeriodActivities(selectedDate, reminders, period);
  const periodModel = period === 'day' ? model : createMyDayViewModel(selectedDate, periodActivities, displayName);
  const priorities = model.priorities.slice(0, 3);
  const conflicts = detectDayConflicts(activities);

  function moveDay(days: number) {
    const next = new Date(selectedDate);
    next.setDate(selectedDate.getDate() + days);
    setSelectedDate(next);
    setActivities(createMyDayActivities(next, reminders));
  }

  function movePeriod(direction: -1 | 1) {
    if (period === 'day') {
      moveDay(direction);
      return;
    }
    const next = new Date(selectedDate);
    if (period === 'week') next.setDate(selectedDate.getDate() + direction * 7);
    if (period === 'month') next.setMonth(selectedDate.getMonth() + direction);
    if (period === 'year') next.setFullYear(selectedDate.getFullYear() + direction);
    setSelectedDate(next);
    setActivities(createMyDayActivities(next, reminders));
  }

  function selectDate(next: Date) {
    setSelectedDate(next);
    setPeriod('day');
    setView('Timeline');
    setActivities(createMyDayActivities(next, reminders));
  }

  function updateStatus(activity: DailyActivity, status: DailyActivityStatus) {
    setActivities((current) => current.map((item) => item.id === activity.id ? { ...item, status } : item));
    setLog((current) => [{ time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), action: `${statusLabel(status)} ${activity.title}`, area: activity.area, result: statusLabel(status), source: 'Completed task' }, ...current]);
  }

  function changePeriod(nextPeriod: MyDayPeriod) {
    setSummaryFilter(null);
    setPeriod(nextPeriod);
    if (nextPeriod === 'day') setView('Timeline');
  }

  function changeView(nextView: MyDayView) {
    setSummaryFilter(null);
    setPeriod('day');
    setView(nextView);
  }

  function movePeriodAndReset(direction: -1 | 1) {
    setSummaryFilter(null);
    movePeriod(direction);
  }

  return <main aria-label="My Day daily activity dashboard" className="space-y-5">
    <MyDayHeader date={selectedDate} model={periodModel} period={period} view={view} onMovePeriod={movePeriodAndReset} onToday={() => selectDate(new Date('2026-07-14T09:00:00'))} onDatePick={(next) => { setSummaryFilter(null); selectDate(next); }} onPeriodChange={changePeriod} onViewChange={changeView} />
    <CumulativeTaskSummary period={period} date={selectedDate} model={periodModel} activities={periodActivities} showAreas={showAreaSummary} activeFilter={summaryFilter} onFilterChange={setSummaryFilter} onToggleAreas={() => setShowAreaSummary((value) => !value)} />
    {summaryFilter ? <SummaryFilteredTasks filter={summaryFilter} activities={periodActivities} onUpdateStatus={updateStatus} onClear={() => setSummaryFilter(null)} /> : null}
    {period === 'day' ? <>
      {view === 'Timeline' ? <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]" aria-label="My Day timeline and action summary">
        <DailyTimeline activities={activities} onUpdateStatus={updateStatus} />
        <aside className="space-y-4" aria-label="Top priorities and conflicts">
          <TopPriorities priorities={priorities} onAskKamal={() => { window.dispatchEvent(new Event('kamal:open')); onNavigate('Kamal Chat'); }} compact />
          {conflicts.length ? <ConflictAlert conflicts={conflicts} onAskKamal={() => { window.dispatchEvent(new Event('kamal:open')); onNavigate('Kamal Chat'); }} compact /> : null}
          <UnscheduledTray activities={model.unscheduled} onUpdateStatus={updateStatus} onAskKamal={() => { window.dispatchEvent(new Event('kamal:open')); onNavigate('Kamal Chat'); }} compact />
        </aside>
      </section> : null}
      {view === 'Activity Log' ? <ActivityLogView log={log} /> : null}
      <DailyReflection model={model} />
    </> : <>
      <PeriodSummaryView period={period} model={periodModel} showAreas={showAreaSummary} onAskKamal={() => { window.dispatchEvent(new Event('kamal:open')); onNavigate('Kamal Chat'); }} />
    </>}
  </main>;
}

function KamalScreen() {
  return <><Hero eyebrow="Kamal Chat" title="Talk to Kamal without leaving Student-LAD" body="Use the button below or the floating Kamal parrot assistant for live chat, voice commands, support, and app navigation." /><div className="grid gap-5 lg:grid-cols-[1fr_.8fr]"><Panel title="Conversation workspace"><div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">Kamal opens as a floating assistant so it can stay with you across every page.</div><div className="mt-4 grid gap-2 sm:grid-cols-3"><Button onClick={() => window.dispatchEvent(new Event('kamal:open'))}>Open Kamal Chat</Button><Button>Save as note</Button><Button>Extract deadline</Button><Button>Create reminder</Button><Button>Summarize file</Button><Button>Draft email</Button><Button>Draft LinkedIn post</Button></div></Panel><Panel title="Live Review Preview"><SimpleTable headers={['Type','Summary','Date','Action','Reminder','Confidence','Review']} rows={[['Academic Deadline','Possible deadline from chat','Needs date','Create review item','Ask first','—','Pending user input']]} /></Panel></div></>;
}

function MyDayHeader({ date, model, period, view, onMovePeriod, onDatePick, onPeriodChange, onViewChange }: { date: Date; model: MyDayModel; period: MyDayPeriod; view: MyDayView; onMovePeriod: (direction: -1 | 1) => void; onToday: () => void; onDatePick: (date: Date) => void; onPeriodChange: (period: MyDayPeriod) => void; onViewChange: (view: MyDayView) => void }) {
  const tabClass = (active: boolean, selectedClass = 'bg-white text-slate-950') => `min-h-10 rounded-xl px-3 py-2 text-xs font-semibold transition sm:px-4 sm:text-sm ${active ? selectedClass : 'border border-white/15 bg-white/10 text-white hover:bg-white/20'}`;
  return <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-4 text-white shadow-xl sm:p-5">
    <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-48 w-48 rounded-full bg-emerald-300/15 blur-3xl" />
    <div className="relative min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300 sm:text-xs">My Day</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{period === 'day' ? 'My Day' : `My ${titleCase(period)} Summary`}</h1>
      <p className="mt-1 text-sm font-medium text-slate-200">{periodRangeLabel(date, period)}</p>
      <p className="mt-4 text-lg font-semibold leading-snug sm:text-xl">{model.greeting}</p>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200 sm:text-base">You have {model.summary.priority_count} priorities, {model.summary.scheduled_count} scheduled events, and {model.summary.attention_count} item{model.summary.attention_count === 1 ? '' : 's'} needing attention.</p>
    </div>
    <div className="relative mt-5 grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center" aria-label="My Day controls">
      <button type="button" title={`Previous ${period === 'day' ? 'day' : period}`} aria-label={`Previous ${period === 'day' ? 'day' : period}`} onClick={() => onMovePeriod(-1)} className="justify-self-start rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-lg font-black text-white hover:bg-white/20">‹</button>
      <div className="flex min-w-0 flex-wrap items-center justify-center gap-2" aria-label="My Day control bar">
        {(['Timeline', 'Activity Log'] as const).map((label) => <button key={label} type="button" role="tab" aria-selected={period === 'day' && view === label} onClick={() => { onPeriodChange('day'); onViewChange(label); }} className={tabClass(period === 'day' && view === label)}>{label}</button>)}
        <label title="Calendar picker" aria-label="Calendar picker" className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-lg text-white hover:bg-white/20"><span aria-hidden="true">📅</span><input aria-label="Calendar picker" type="date" value={dateKey(date)} onChange={(event) => { const next = new Date(`${event.target.value}T09:00:00`); if (!Number.isNaN(next.getTime())) { onDatePick(next); onPeriodChange('day'); onViewChange('Timeline'); } }} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 [color-scheme:dark]" /></label>
        {(['day', 'week', 'month', 'year'] as const).map((label) => <button key={label} type="button" role="tab" aria-selected={period === label} onClick={() => onPeriodChange(label)} className={tabClass(period === label, 'bg-emerald-300 text-slate-950')}>{label === 'day' ? 'Today' : titleCase(label)}</button>)}
      </div>
      <button type="button" title={`Next ${period === 'day' ? 'day' : period}`} aria-label={`Next ${period === 'day' ? 'day' : period}`} onClick={() => onMovePeriod(1)} className="justify-self-end rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-lg font-black text-white hover:bg-white/20">›</button>
    </div>
  </section>;
}

function PeriodSummaryView({ period, model, onAskKamal }: { period: Exclude<MyDayPeriod, 'day'>; model: MyDayModel; showAreas: boolean; onAskKamal: () => void }) {
  const topPriorities = model.priorities.slice(0, period === 'year' ? 8 : 5);
  return <section aria-label={`${period} summary`} className="space-y-5">
    <Panel title={`${titleCase(period)} Priorities`}>
      <div className="space-y-3">{topPriorities.map((item) => <article key={item.id} className="rounded-[22px] border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><CategoryBadgeTone tone={toneForArea(item.area)} /><Badge value={item.priority} /></div><h3 className="mt-2 whitespace-normal text-base font-semibold text-slate-950">{item.title}</h3><p className="mt-1 whitespace-normal text-xs text-slate-600">{new Date(`${item.date}T09:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: period === 'year' ? 'numeric' : undefined })} · {item.startTime ? formatTime(item.startTime) : 'Anytime'}</p></div>

          <div className="flex shrink-0 justify-end"><ActionIconButton label="Ask Kamal" symbol="🦜" onClick={onAskKamal} tone="emerald" /></div>
        </div>
      </article>)}</div>
    </Panel>
  </section>;
}

function CumulativeTaskSummary({ period, date, model, activities, showAreas, activeFilter, onFilterChange, onToggleAreas }: { period: MyDayPeriod; date: Date; model: MyDayModel; activities: DailyActivity[]; showAreas: boolean; activeFilter: MyDaySummaryFilter; onFilterChange: (filter: MyDaySummaryFilter) => void; onToggleAreas: () => void }) {
  const high = activities.filter((item) => item.priority === 'high').length;
  const critical = activities.filter((item) => item.priority === 'critical').length;
  const upcoming = Math.max(activities.length - model.summary.completed_count, 0);
  const areaRows = (['academic','health','relationships','social','economic'] as WellbeingArea[]).map((area) => {
    const summary = model.areas[area];
    return [areaIcon(area), areaLabel(area), `${summary.completed}/${summary.planned}`, summary.high, summary.critical, Math.max(summary.planned - summary.completed, 0)];
  });
  return <Panel title={`${titleCase(period)} Task Summary`}>
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <p className="max-w-xl text-sm leading-6 text-slate-600"><span className="font-semibold text-slate-900">{periodRangeLabel(date, period)}.</span> Cumulative tasks across Academic, Health, Relationships, Social, and Economic areas.</p>
      <button type="button" onClick={onToggleAreas} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">{showAreas ? 'Hide individual areas' : 'See individual areas'}</button>
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Task status filters">
      <SummaryMetricButton label="D" title="Done" value={`${model.summary.completed_count}/${activities.length}`} tone="done" active={activeFilter === 'done'} onClick={() => onFilterChange(activeFilter === 'done' ? null : 'done')} />
      <SummaryMetricButton label="HP" title="High priority" value={String(high)} tone="high" active={activeFilter === 'high'} onClick={() => onFilterChange(activeFilter === 'high' ? null : 'high')} />
      <SummaryMetricButton label="CR" title="Critical" value={String(critical)} tone="critical" active={activeFilter === 'critical'} onClick={() => onFilterChange(activeFilter === 'critical' ? null : 'critical')} />
      <SummaryMetricButton label="U" title="Upcoming" value={String(upcoming)} tone="upcoming" active={activeFilter === 'upcoming'} onClick={() => onFilterChange(activeFilter === 'upcoming' ? null : 'upcoming')} />
    </div>
    {showAreas ? <div className="mt-4"><SimpleTable headers={['', 'Area', 'Done / Total', 'HP', 'CR', 'U']} rows={areaRows} /></div> : null}
  </Panel>;
}

function SummaryMetricButton({ label, title, value, tone, active, onClick }: { label: string; title: string; value: string; tone: 'done' | 'high' | 'critical' | 'upcoming'; active: boolean; onClick: () => void }) {
  const bulbClass = tone === 'done' ? 'bg-emerald-500' : tone === 'high' ? 'bg-yellow-400' : tone === 'critical' ? 'bg-red-700' : 'bg-slate-400';
  return <button type="button" title={title} aria-label={`${title}: ${value}`} onClick={onClick} className={`group flex min-w-0 items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-3 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50 ${active ? 'border-slate-500 ring-2 ring-slate-200' : 'border-slate-200'}`}>
    <span className="flex min-w-0 items-center gap-3"><span aria-hidden="true" className={`h-3 w-3 shrink-0 rounded-full ${bulbClass} shadow-sm`} /><span className="min-w-0"><span className="block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</span><span className="block whitespace-normal text-xs text-slate-600">{title}</span></span></span>
    <span className="shrink-0 text-xl font-black text-slate-950">{value}</span>
  </button>;
}

function SummaryFilteredTasks({ filter, activities, onUpdateStatus, onClear }: { filter: Exclude<MyDaySummaryFilter, null>; activities: DailyActivity[]; onUpdateStatus: (activity: DailyActivity, status: DailyActivityStatus) => void; onClear: () => void }) {
  const filtered = activities.filter((activity) => {
    if (filter === 'done') return activity.status === 'completed';
    if (filter === 'high') return activity.priority === 'high';
    if (filter === 'critical') return activity.priority === 'critical';
    return activity.status !== 'completed';
  });
  const title = filter === 'done' ? 'Completed Tasks' : filter === 'high' ? 'High Priority Tasks' : filter === 'critical' ? 'Critical Tasks' : 'Upcoming Tasks';
  return <Panel title={title}>
    <div className="mb-3 flex justify-end"><button type="button" onClick={onClear} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">Clear filter</button></div>
    <div className="space-y-3">{filtered.length ? filtered.map((activity) => <TaskResultCard key={`${filter}-${activity.id}`} activity={activity} onUpdateStatus={onUpdateStatus} readonly={filter === 'done' || activity.status === 'completed'} />) : <EmptyPipelineCard />}</div>
  </Panel>;
}

function TaskResultCard({ activity, onUpdateStatus, readonly = false }: { activity: DailyActivity; onUpdateStatus: (activity: DailyActivity, status: DailyActivityStatus) => void; readonly?: boolean }) {
  return <article className="rounded-[22px] border border-slate-200 bg-white p-4">
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0"><div className="flex flex-wrap gap-2"><CategoryBadgeTone tone={toneForArea(activity.area)} /><Badge value={activity.priority} />{readonly ? <Badge value="completed" /> : null}</div><h3 className="mt-2 whitespace-normal text-sm font-semibold text-slate-950">{activity.title}</h3><p className="mt-1 whitespace-normal text-xs leading-5 text-slate-600">{activity.startTime ? `${formatTime(activity.startTime)} · ` : ''}{activity.description || activity.preparationNote || 'Task details available in the selected day.'}</p></div>
      {!readonly ? <div className="flex shrink-0 flex-row flex-wrap gap-2 sm:justify-end"><ActionIconButton label="Start" symbol="▶" onClick={() => onUpdateStatus(activity, 'in_progress')} /><ActionIconButton label="Complete" symbol="✓" onClick={() => onUpdateStatus(activity, 'completed')} tone="emerald" /><ActionIconButton label="Reschedule" symbol="↻" onClick={() => onUpdateStatus(activity, 'rescheduled')} /></div> : null}
    </div>
  </article>;
}

function TopPriorities({ priorities, onAskKamal, compact = false }: { priorities: DailyActivity[]; onAskKamal: () => void; compact?: boolean }) {
  return <Panel title="Top Priorities"><div className="grid gap-3">{priorities.length ? priorities.map((item) => <article key={item.id} className={`rounded-[22px] border border-slate-200 bg-slate-50 ${compact ? 'p-4' : 'p-5'}`}>
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><CategoryBadgeTone tone={toneForArea(item.area)} /><Badge value={item.priority} /></div>
        <h3 className={`${compact ? 'text-sm' : 'text-lg'} mt-2 whitespace-normal font-semibold text-slate-950`}>{item.title}</h3>
        <p className="mt-2 whitespace-normal text-xs text-slate-700">{item.startTime ? `${formatTime(item.startTime)}${item.endTime ? `–${formatTime(item.endTime)}` : ''}` : item.description || 'Due today'}</p>
        {!compact ? <><p className="mt-2 whitespace-normal text-xs leading-5 text-slate-600">Reason: {priorityReason(item)}</p><p className="mt-1 text-xs text-slate-600">Effort: {item.durationMinutes ? `${item.durationMinutes} min` : 'Needs estimate'}</p></> : null}
      </div>
      <div className="flex shrink-0 flex-row flex-wrap gap-2 sm:justify-end">
        <ActionIconButton label="Continue" symbol="▶" />
        <ActionIconButton label="Open" symbol="↗" />
        <ActionIconButton label="Ask Kamal" symbol="🦜" onClick={onAskKamal} tone="emerald" />
      </div>
    </div>
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-emerald-500" style={{ width: item.status === 'completed' ? '100%' : item.status === 'in_progress' ? '45%' : '15%' }} /></div>
  </article>) : <EmptyPipelineCard />}</div></Panel>;
}

function DailyTimeline({ activities, onUpdateStatus }: { activities: DailyActivity[]; onUpdateStatus: (activity: DailyActivity, status: DailyActivityStatus) => void }) {
  const scheduled = activities.filter((item) => item.startTime).sort(compareDailyActivities);
  return <Panel title="Daily Timeline">{scheduled.length ? <ol aria-label="Chronological daily timeline" className="relative space-y-3 before:absolute before:left-[4.35rem] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-emerald-100">
    {scheduled.map((activity) => <li key={activity.id} className={`relative grid gap-3 rounded-[22px] border p-5 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto] ${activity.status === 'completed' ? 'border-slate-200 bg-slate-50 opacity-75' : activity.status === 'in_progress' ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
      <time className="text-xs font-mono font-semibold text-slate-700">{formatTime(activity.startTime)}{activity.endTime ? <span className="block text-slate-500">{formatTime(activity.endTime)}</span> : null}</time>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><CategoryBadgeTone tone={toneForArea(activity.area)} /><Badge value={statusLabel(activity.status)} />{activity.fixedTime ? <Badge value="fixed" /> : null}</div>
        <h3 className="mt-2 whitespace-normal text-sm font-semibold text-slate-950">{activity.title}</h3>
        <p className="mt-1 whitespace-normal text-xs leading-5 text-slate-600">{activity.location ? `${activity.location} · ` : ''}{activity.description || activity.preparationNote || 'No preparation note.'}</p>
      </div>
      {activity.status !== 'completed' ? <div className="flex shrink-0 flex-row flex-wrap gap-2 sm:justify-end">
        <ActionIconButton label="Start" symbol="▶" onClick={() => onUpdateStatus(activity, 'in_progress')} />
        <ActionIconButton label="Complete" symbol="✓" onClick={() => onUpdateStatus(activity, 'completed')} tone="emerald" />
        <ActionIconButton label="Reschedule" symbol="↻" onClick={() => onUpdateStatus(activity, 'rescheduled')} />
        <ActionIconButton label="Skip" symbol="⏭" onClick={() => onUpdateStatus(activity, 'skipped')} />
      </div> : <div className="flex shrink-0 justify-end"><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Done</span></div>}
    </li>)}
  </ol> : <EmptyPipelineCard />}</Panel>;
}

function UnscheduledTray({ activities, onUpdateStatus, onAskKamal, compact = false }: { activities: DailyActivity[]; onUpdateStatus: (activity: DailyActivity, status: DailyActivityStatus) => void; onAskKamal: () => void; compact?: boolean }) {
  return <Panel title="Still to fit into today"><div className="space-y-3">{activities.length ? activities.map((activity) => <article key={activity.id} className={`rounded-[22px] border border-slate-200 bg-white ${compact ? 'p-4' : 'p-5'}`}>
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div className="min-w-0"><div className="flex flex-wrap gap-2"><CategoryBadgeTone tone={toneForArea(activity.area)} /><Badge value={activity.priority} /></div><h3 className="mt-2 whitespace-normal text-sm font-semibold text-slate-950">{activity.title}</h3><p className="mt-1 whitespace-normal text-xs text-slate-600">Due today · {activity.durationMinutes || 45} minutes · suggested time 3:00 PM</p></div><div className="flex shrink-0 flex-row flex-wrap gap-2 md:justify-end"><ActionIconButton label="Add to timeline" symbol="＋" /><ActionIconButton label="Complete" symbol="✓" onClick={() => onUpdateStatus(activity, 'completed')} tone="emerald" /><ActionIconButton label="Move to tomorrow" symbol="→" /><ActionIconButton label="Ask Kamal" symbol="🦜" onClick={onAskKamal} tone="emerald" /></div></div>
  </article>) : <EmptyPipelineCard />}</div></Panel>;
}

function EmptyPipelineCard() {
  return <article className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-semibold text-slate-600">Nothing in pipeline yet.</article>;
}

function ActionIconButton({ label, symbol, onClick, tone = 'neutral' }: { label: string; symbol: string; onClick?: () => void; tone?: 'neutral' | 'emerald' | 'yellow' }) {
  const toneClass = tone === 'emerald' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : tone === 'yellow' ? 'border-yellow-200 bg-yellow-50 text-yellow-900 hover:bg-yellow-100' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50';
  return <button type="button" title={label} aria-label={label} onClick={onClick} className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-sm font-black shadow-sm transition ${toneClass}`}><span aria-hidden="true">{symbol}</span><span className="sr-only">{label}</span></button>;
}

function ActivityLogView({ log }: { log: MyDayModel['activity_log'] }) {
  const [filter, setFilter] = useState<'all' | WellbeingArea>('all');
  const filtered = filter === 'all' ? log : log.filter((item) => item.area === filter);
  return <Panel title="Activity Log"><div className="mb-3 flex flex-wrap gap-2">{(['all','academic','health','relationships','social','economic'] as const).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={`rounded-xl px-3 py-2 text-xs font-semibold ${filter === item ? 'bg-slate-950 text-white' : 'border border-slate-200 text-slate-700'}`}>{item === 'all' ? 'All' : areaLabel(item)}</button>)}</div><ol className="space-y-3">{filtered.map((item, index) => <li key={`${item.time}-${item.action}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center gap-2"><time className="font-mono text-xs font-semibold text-slate-700">{item.time}</time><CategoryBadgeTone tone={toneForArea(item.area)} /><Badge value={item.source} /></div><p className="mt-2 text-sm font-semibold text-slate-950">{item.action}</p><p className="mt-1 text-xs text-slate-600">{item.result}</p></li>)}</ol></Panel>;
}

function ConflictAlert({ conflicts, onAskKamal, compact = false }: { conflicts: MyDayConflict[]; onAskKamal: () => void; compact?: boolean }) {
  return <section aria-label="Schedule conflicts" className="rounded-[24px] border border-yellow-200 bg-yellow-50 p-4"><h2 className={`${compact ? 'text-base' : 'text-lg'} font-semibold text-yellow-950`}>Conflict detected</h2>{conflicts.map((conflict) => <article key={conflict.id} className="mt-3 rounded-[20px] bg-white p-4"><p className="text-sm font-semibold text-slate-950">{conflict.title}</p><p className="mt-1 text-xs text-slate-600">{conflict.first.title} overlaps with {conflict.second.title} by {conflict.overlapMinutes} minutes.</p><div className="mt-3 flex flex-wrap gap-2"><ActionIconButton label="Resolve" symbol="⚡" tone="yellow" /><ActionIconButton label="Keep both" symbol="＝" /><ActionIconButton label="Find another time" symbol="🕘" /><ActionIconButton label="Ask Kamal" symbol="🦜" onClick={onAskKamal} tone="emerald" /></div></article>)}</section>;
}

function DailyReflection({ model }: { model: MyDayModel }) {
  return <Panel title="Close your day"><div className="grid gap-3 md:grid-cols-2"><p className="text-sm leading-6 text-slate-600">Optional reflection. Nothing sensitive is saved automatically. Review before storing anything durable.</p><div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">Today you completed {model.summary.completed_count} activities. Tomorrow: {model.tomorrow_preview.join(', ')}.</div></div><div className="mt-3 flex flex-wrap gap-2"><Button>Save summary</Button><Button>Edit</Button><Button>Move tasks</Button><Button>Skip</Button></div></Panel>;
}

function createMyDayPeriodActivities(date: Date, reminders: Reminder[], period: Exclude<MyDayPeriod, 'day'>) {
  const days = daysForPeriod(date, period);
  return days.flatMap((day) => createMyDayActivities(day, reminders).map((activity) => ({ ...activity, id: `${dateKey(day)}-${activity.id}`, date: dateKey(day) })));
}

function daysForPeriod(date: Date, period: Exclude<MyDayPeriod, 'day'>) {
  if (period === 'week') {
    const start = startOfWeek(date);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }
  if (period === 'month') {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const total = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    return Array.from({ length: total }, (_, index) => addDays(start, index));
  }
  const start = new Date(date.getFullYear(), 0, 1);
  const total = Math.round((new Date(date.getFullYear() + 1, 0, 1).getTime() - start.getTime()) / 86_400_000);
  return Array.from({ length: total }, (_, index) => addDays(start, index));
}

function startOfWeek(date: Date) {
  return addDays(startOfDay(date), -date.getDay());
}

function periodRangeLabel(date: Date, period: MyDayPeriod) {
  if (period === 'day') return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const days = daysForPeriod(date, period);
  const start = days[0];
  const end = days[days.length - 1];
  if (period === 'month') return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  if (period === 'year') return String(date.getFullYear());
  return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function createMyDayActivities(date: Date, reminders: Reminder[]): DailyActivity[] {
  const day = dateKey(date);
  const isSampleDay = day === '2026-07-13';
  const base: DailyActivity[] = isSampleDay ? [
    { id: 'day-academic-class', title: 'Research Methods class', area: 'academic', activityType: 'class', date: day, startTime: '09:00', endTime: '10:15', status: 'completed', priority: 'normal', fixedTime: true, location: 'Room 302', source: 'calendar', sensitive: false, requiresPreparation: true, preparationNote: 'Bring draft survey.' },
    { id: 'day-reading', title: 'Read Statistics Chapter 6', area: 'academic', activityType: 'reading', date: day, startTime: '11:00', durationMinutes: 60, status: 'completed', priority: 'normal', fixedTime: false, source: 'task', sensitive: false, requiresPreparation: false },
    { id: 'day-lunch', title: 'Lunch', area: 'health', activityType: 'meal', date: day, startTime: '13:00', durationMinutes: 30, status: 'not_started', priority: 'normal', fixedTime: false, source: 'manual', sensitive: true, requiresPreparation: false },
    { id: 'day-stats-work', title: 'Work on Statistics assignment', area: 'academic', activityType: 'focus_session', date: day, startTime: '15:00', endTime: '16:30', status: 'not_started', priority: 'high', fixedTime: false, source: 'task', sensitive: false, requiresPreparation: true, preparationNote: 'Open homework file and notes.' },
    { id: 'day-gym', title: 'Gym', area: 'health', activityType: 'health_routine', date: day, startTime: '17:00', endTime: '17:45', status: 'not_started', priority: 'normal', fixedTime: false, location: 'Campus recreation center', source: 'manual', sensitive: true, requiresPreparation: false },
    { id: 'day-meeting-prep', title: 'Travel and preparation for student meeting', area: 'social', activityType: 'travel_block', date: day, startTime: '17:30', endTime: '18:00', status: 'not_started', priority: 'normal', fixedTime: true, source: 'manual', sensitive: false, requiresPreparation: false },
    { id: 'day-isa', title: 'International Student Association meeting', area: 'social', activityType: 'social_activity', date: day, startTime: '18:00', endTime: '19:00', status: 'not_started', priority: 'normal', fixedTime: true, location: 'Student center', source: 'calendar', sensitive: false, requiresPreparation: false },
    { id: 'day-parents', title: 'Call parents', area: 'relationships', activityType: 'relationship_follow_up', date: day, startTime: '19:00', durationMinutes: 30, status: 'not_started', priority: 'normal', fixedTime: false, relatedPerson: 'Parents', source: 'manual', sensitive: true, requiresPreparation: false },
    { id: 'day-medicine', title: 'Medicine reminder', area: 'health', activityType: 'health_routine', date: day, startTime: '21:00', durationMinutes: 5, status: 'not_started', priority: 'normal', fixedTime: true, source: 'manual', sensitive: true, requiresPreparation: false },
    { id: 'day-deadline', title: 'Statistics assignment due', area: 'academic', activityType: 'deadline', date: day, startTime: '23:59', status: 'not_started', priority: 'critical', fixedTime: true, description: 'Due today at 11:59 PM.', source: 'task', sensitive: false, requiresPreparation: true, preparationNote: 'Submit before deadline.' },
    { id: 'day-lunch-expense', title: 'Lunch expense', area: 'economic', activityType: 'spending_entry', date: day, startTime: '12:18', status: 'completed', priority: 'normal', fixedTime: false, amount: 15, currency: 'USD', source: 'manual', sensitive: true, requiresPreparation: false },
    { id: 'day-electricity', title: 'Electricity bill due tomorrow', area: 'economic', activityType: 'payment_reminder', date: day, status: 'not_started', priority: 'high', fixedTime: false, description: 'Reminder active.', source: 'manual', sensitive: true, requiresPreparation: false },
  ] : [];
  const live = reminderEvents(reminders).filter((event) => dateKey(event.date) === day).slice(0, 4).map((event) => ({
    id: `live-${event.id}`,
    title: event.title,
    area: inferAreaFromText(event.title),
    activityType: 'reminder',
    date: day,
    startTime: event.date.getFullYear() === date.getFullYear() && event.date.getMonth() === date.getMonth() && event.date.getDate() === date.getDate() ? event.date.toTimeString().slice(0, 5) : undefined,
    status: event.status === 'completed' ? 'completed' as const : 'not_started' as const,
    priority: normalizePriority(event.priority),
    fixedTime: Boolean(event.due_at),
    description: `Saved reminder · ${event.dateLabel}`,
    source: 'task' as const,
    sensitive: inferAreaFromText(event.title) !== 'academic' && inferAreaFromText(event.title) !== 'social',
    requiresPreparation: false,
  }));
  return [...base, ...live].sort(compareDailyActivities);
}

function inferAreaFromText(text: string): WellbeingArea {
  const lower = text.toLowerCase();
  if (/\b(class|assignment|exam|quiz|study|statistics|reading|professor|course|research)\b/.test(lower)) return 'academic';
  if (/\b(gym|doctor|dentist|medicine|sleep|meal|lunch|breakfast|health|water|exercise)\b/.test(lower)) return 'health';
  if (/\b(parent|mother|father|family|friend|advisor|mentor|call|message)\b/.test(lower)) return 'relationships';
  if (/\b(club|association|meeting|community|social|friends|dinner|networking|volunteer)\b/.test(lower)) return 'social';
  if (/\b(spent|bill|rent|subscription|membership|paid|groceries|expense|dollar|\$)\b/.test(lower)) return 'economic';
  return 'academic';
}

function createMyDayLog(): MyDayModel['activity_log'] {
  return [
    { time: '8:04 AM', action: 'Marked breakfast completed', area: 'health', result: 'Completed', source: 'Entered manually' },
    { time: '8:35 AM', action: 'Started Statistics reading', area: 'academic', result: 'In progress', source: 'Completed task' },
    { time: '9:42 AM', action: 'Completed Statistics reading', area: 'academic', result: '1h 7m', source: 'Completed task' },
    { time: '12:18 PM', action: 'Recorded lunch expense', area: 'economic', result: '$15.00', source: 'Entered manually' },
    { time: '3:10 PM', action: 'Created reminder to call parents', area: 'relationships', result: 'Needs confirmation', source: 'Kamal command' },
  ];
}

function createMyDayViewModel(date: Date, activities: DailyActivity[], displayName = 'Student'): MyDayModel {
  const conflicts = detectDayConflicts(activities);
  const scheduled = activities.filter((item) => item.startTime);
  const completed = activities.filter((item) => item.status === 'completed');
  const priorities = [...activities].sort((a, b) => priorityScore(b) - priorityScore(a));
  const areas = (['academic','health','relationships','social','economic'] as WellbeingArea[]).reduce((acc, area) => {
    const items = activities.filter((item) => item.area === area);
    const done = items.filter((item) => item.status === 'completed').length;
    const high = items.filter((item) => item.priority === 'high').length;
    const critical = items.filter((item) => item.priority === 'critical').length;
    const attention = high + critical + (area === 'social' ? conflicts.length : 0);
    acc[area] = { planned: items.length, completed: done, attention, high, critical, state: items.length === 0 ? 'no_activity_planned' : critical > 0 || high > 0 ? 'needs_attention' : done === items.length ? 'completed' : done > 0 ? 'on_track' : 'upcoming', note: areaNote(area, items, attention) };
    return acc;
  }, {} as Record<WellbeingArea, MyDayAreaSummary>);
  return {
    date,
    greeting: `Good morning, ${displayName}.`,
    summary: { priority_count: activities.filter((item) => item.priority === 'high' || item.priority === 'critical').length, scheduled_count: scheduled.length, completed_count: completed.length, attention_count: activities.filter((item) => item.priority === 'high' || item.priority === 'critical').length + conflicts.length, conflict_count: conflicts.length },
    areas,
    priorities,
    timeline: scheduled.sort(compareDailyActivities),
    unscheduled: activities.filter((item) => !item.startTime && item.status !== 'completed'),
    activity_log: createMyDayLog(),
    suggestions: ['Use the open 45-minute period for the Statistics assignment.', 'Gym and meeting preparation overlap. Review the conflict before 5 PM.', 'Record any unlogged spending before closing the day.'],
    people_to_contact: activities.filter((item) => item.area === 'relationships'),
    tomorrow_preview: ['Submit statistics assignment', 'Pay electricity bill', 'Call parents if not completed today'],
  };
}

function detectDayConflicts(activities: DailyActivity[]): MyDayConflict[] {
  const timed = activities.filter((item) => item.startTime).sort(compareDailyActivities);
  const conflicts: MyDayConflict[] = [];
  for (let index = 0; index < timed.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < timed.length; otherIndex += 1) {
      const first = timed[index];
      const second = timed[otherIndex];
      const overlap = overlapMinutes(first, second);
      if (overlap > 0) conflicts.push({ id: `${first.id}-${second.id}`, title: 'Schedule overlap', first, second, overlapMinutes: overlap });
    }
  }
  return conflicts.slice(0, 3);
}

function compareDailyActivities(a: DailyActivity, b: DailyActivity) {
  return minutesFromTime(a.startTime) - minutesFromTime(b.startTime) || priorityScore(b) - priorityScore(a);
}

function minutesFromTime(value?: string) {
  if (!value) return 24 * 60 + 1;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + (minute || 0);
}

function activityEndMinutes(activity: DailyActivity) {
  if (activity.endTime) return minutesFromTime(activity.endTime);
  return minutesFromTime(activity.startTime) + (activity.durationMinutes || 60);
}

function overlapMinutes(first: DailyActivity, second: DailyActivity) {
  const start = Math.max(minutesFromTime(first.startTime), minutesFromTime(second.startTime));
  const end = Math.min(activityEndMinutes(first), activityEndMinutes(second));
  return Math.max(0, end - start);
}

function priorityScore(activity: DailyActivity) {
  const weight = { critical: 100, high: 75, normal: 40, low: 20 }[activity.priority];
  const statusPenalty = activity.status === 'completed' ? -60 : activity.status === 'in_progress' ? 10 : 0;
  const fixedBoost = activity.fixedTime ? 8 : 0;
  return weight + statusPenalty + fixedBoost;
}

function normalizePriority(priority?: string): DailyActivity['priority'] {
  return priority === 'critical' || priority === 'high' || priority === 'low' ? priority : 'normal';
}

function areaLabel(area: WellbeingArea) {
  return ({ academic: 'Academic', health: 'Health', relationships: 'Relationships', social: 'Social', economic: 'Economic' } as Record<WellbeingArea, string>)[area];
}

function areaIcon(area: WellbeingArea) {
  return ({ academic: '📚', health: '💚', relationships: '🤝', social: '🌐', economic: '💵' } as Record<WellbeingArea, string>)[area];
}

function toneForArea(area: WellbeingArea): ThreeDTabTone {
  return ({ academic: 'academic', health: 'health', relationships: 'family', social: 'travel', economic: 'finance' } as Record<WellbeingArea, ThreeDTabTone>)[area];
}

function formatTime(value?: string) {
  if (!value) return 'Unscheduled';
  const [hour, minute] = value.split(':').map(Number);
  const date = new Date(2026, 6, 13, hour, minute || 0);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function statusLabel(status: DailyActivityStatus | string) {
  return titleCase(status.replaceAll('_', ' '));
}

function priorityReason(activity: DailyActivity) {
  if (activity.priority === 'critical') return 'Due today and requires completion.';
  if (activity.fixedTime) return 'Fixed time activity on today’s schedule.';
  if (activity.status === 'in_progress') return 'Already started and worth finishing.';
  return activity.description || 'Relevant to today’s plan.';
}

function areaNote(area: WellbeingArea, items: DailyActivity[], attention: number) {
  if (!items.length) return `No ${areaLabel(area).toLowerCase()} activity planned today.`;
  if (area === 'economic') {
    const total = items.reduce((sum, item) => sum + (item.amount || 0), 0);
    return total ? `$${total.toFixed(2)} recorded today${attention ? ' · bill or payment needs attention' : ''}` : 'Payment reminders and expenses stay private.';
  }
  if (attention) return `${attention} item${attention === 1 ? '' : 's'} need attention.`;
  const next = items.find((item) => item.status !== 'completed');
  return next ? `Next: ${next.title}${next.startTime ? ` at ${formatTime(next.startTime)}` : ''}` : 'Completed for today.';
}



type MemoryTab = 'Recent Chats' | 'Saved Information' | 'Preferences' | 'Tasks & Events' | 'Documents' | 'Forgotten' | 'Export';
type MemoryMode = 'Offline' | 'Hybrid' | 'Cloud';
type MockMemoryChat = { id: string; title: string; pinned?: boolean; mode: MemoryMode; preview: string; updated: string; messageCount: number };
type MockSavedInfo = { id: string; type: string; area: string; content: string; saved: string };
type MockPreference = { id: string; label: string; value: string };

const memoryTabs: MemoryTab[] = ['Recent Chats', 'Saved Information', 'Preferences', 'Tasks & Events', 'Documents', 'Forgotten', 'Export'];
function MemoryCenterScreen({ memories, onExport }: { memories: MemoryRecord[]; pending: MemoryRecord[]; onApprove: (item: MemoryRecord) => void; onReject: (item: MemoryRecord) => void; onEdit: (item: MemoryRecord) => void; onForget: (item: MemoryRecord) => void; onExport: () => void }) {
  const [tab, setTab] = useState<MemoryTab>('Recent Chats');
  const recentChats: MockMemoryChat[] = listChatHistory().map((chat) => ({
    id: chat.id,
    title: chat.title,
    pinned: chat.pinned,
    mode: 'Hybrid',
    preview: chat.summary || chat.messages.find((message) => message.content.trim())?.content || 'Saved conversation',
    updated: chat.updatedAt ? new Date(chat.updatedAt).toLocaleString() : 'No activity yet',
    messageCount: chat.messages.length,
  }));
  const savedInfo: MockSavedInfo[] = memories.filter((item) => item.status === 'approved' || item.status === 'active').map((item) => ({
    id: item.memory_id || item.id || item.candidate_id || item.content,
    type: item.category || item.memory_type || 'Memory',
    area: item.workspace_id || item.memory_class || 'Workspace',
    content: item.summary || item.content,
    saved: item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Saved',
  }));
  const preferences: MockPreference[] = savedInfo.filter((item) => /preference|policy|reminder/i.test(`${item.type} ${item.content}`)).map((item) => ({ id: item.id, label: item.type, value: item.content }));
  const pinnedCount = recentChats.filter((chat) => chat.pinned).length;
  const sensitiveCount = memories.filter((item) => item.sensitivity === 'high' || item.memory_class === 'sensitive').length;
  return <main className="mx-auto max-w-5xl space-y-5 pb-24">
    <header className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Memory Center</p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-950">What Dorje remembers and why.</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Memory Center explains approved memories, active chat history, preferences, and export/forget controls. Approval stays in Review & Save; Workspaces organize projects and sources.</p>
    </header>

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Memory usage summary">
      <Metric label="Approved memories" value={savedInfo.length} />
      <Metric label="Recent chats" value={recentChats.length} />
      <Metric label="Pinned chats" value={pinnedCount} />
      <Metric label="Sensitive memory" value={sensitiveCount} />
    </section>

    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">Memory lifecycle</h2>
      <div className="mt-4 grid gap-2 text-center text-xs font-bold text-slate-600 sm:grid-cols-5">
        {['Captured', 'Reviewed', 'Approved', 'Used with policy', 'Updated or forgotten'].map((step) => <span key={step} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">{step}</span>)}
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">Each saved item records why it was retained, which policy allows it, where it belongs, confidence, and when it was last used. Raw conversation is not treated as durable memory unless explicitly saved.</p>
    </section>

    <nav aria-label="Memory Center tabs" className="overflow-x-auto rounded-2xl border border-slate-200 bg-white px-2 shadow-sm">
      <div className="flex min-w-max gap-1 py-2">
        {memoryTabs.map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === item ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>{item}</button>)}
      </div>
    </nav>

    {tab === 'Recent Chats' ? <section className="space-y-3">
      {recentChats.length ? recentChats.map((chat) => <MemoryChatCard key={chat.id} chat={chat} />) : <EmptyUserData title="No chat history yet" body="Start a Workspace AI or Kamal conversation and explicitly save it when you want it to appear here." />}
    </section> : null}

    {tab === 'Saved Information' ? <section className="space-y-4">
      <div className="rounded-[24px] border border-emerald-100 bg-emerald-50 p-5 text-emerald-950">
        <h2 className="font-semibold">Reviewed and approved by you</h2>
        <p className="mt-2 text-sm leading-6">These items can be used by Kamal and Workspace AI when active, relevant, and policy-allowed. You can correct or revoke saved facts at any time.</p>
      </div>
      <div className="space-y-3">{savedInfo.length ? savedInfo.map((item) => <SavedInfoCard key={item.id} item={item} />) : <EmptyUserData title="No saved information yet" body="Approved CEDA memories and user-approved facts will appear here for this account only." />}</div>
    </section> : null}

    {tab === 'Preferences' ? <SectionCard title="Kamal behavior preferences">
      <div className="divide-y divide-slate-100">{preferences.length ? preferences.map((item) => <div key={item.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-slate-950">{item.label}</p><p className="mt-1 text-sm text-slate-500">{item.value}</p></div><button type="button" className="text-left text-sm font-semibold text-emerald-700 hover:text-emerald-900">Edit</button></div>) : <EmptyUserData title="No preferences saved yet" body="Kamal learns preferences only after you approve them or explicitly say Always/Never/Ask first." />}</div>
    </SectionCard> : null}

    {tab !== 'Recent Chats' && tab !== 'Saved Information' && tab !== 'Preferences' ? <MemoryPlaceholder tab={tab} onExport={onExport} /> : null}

    <section className="rounded-[24px] border border-amber-100 bg-amber-50 p-5 text-amber-950 shadow-sm">
      <h2 className="text-lg font-semibold">Actionable notifications live outside Memory Center</h2>
      <p className="mt-2 text-sm leading-6">Memory Center shows memory state. Review requests, reminders, policy warnings, connector changes, sync events, and completed actions are surfaced as actionable notices linked to their owning object.</p>
    </section>
  </main>;
}

function ModeBadge({ mode }: { mode: MemoryMode }) {
  const tone = mode === 'Offline' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : mode === 'Hybrid' ? 'bg-blue-50 text-blue-800 border-blue-200' : 'bg-violet-50 text-violet-800 border-violet-200';
  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{mode}</span>;
}

function MemoryChatCard({ chat }: { chat: MockMemoryChat }) {
  return <article className="group rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-200 hover:shadow-md">
    <div className="flex items-start gap-4">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white"><MessageCircle size={22} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-slate-950">{chat.title}</h2>
          {chat.pinned ? <span title="Pinned" className="text-amber-500">★</span> : null}
          <ModeBadge mode={chat.mode} />
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-600">{chat.preview}</p>
        <p className="mt-3 text-xs font-medium text-slate-400">{chat.updated} · {chat.messageCount} messages</p>
      </div>
      <div className="flex opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
        <button type="button" title="Pin chat" aria-label="Pin chat" className="rounded-full p-2 text-slate-500 hover:bg-amber-50 hover:text-amber-600"><Pin size={16} /></button>
        <button type="button" title="Delete chat" aria-label="Delete chat" className="rounded-full p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={16} /></button>
      </div>
    </div>
  </article>;
}

function SavedInfoCard({ item }: { item: MockSavedInfo }) {
  return <article className="group rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-200 hover:shadow-md">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{item.type} · {item.area}</p>
        <p className="mt-3 text-base font-semibold leading-6 text-slate-950">{item.content}</p>
        <p className="mt-3 text-xs font-medium text-slate-400">Saved {item.saved}</p>
      </div>
      <div className="flex opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
        <button type="button" title="Edit saved information" aria-label="Edit saved information" className="rounded-full p-2 text-slate-500 hover:bg-sky-50 hover:text-sky-700"><Pencil size={16} /></button>
        <button type="button" title="Forget saved information" aria-label="Forget saved information" className="rounded-full p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={16} /></button>
      </div>
    </div>
  </article>;
}

function EmptyUserData({ title, body }: { title: string; body: string }) {
  return <div className="rounded-[24px] border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm"><p className="text-sm font-semibold text-slate-800">{title}</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{body}</p></div>;
}

function MemoryPlaceholder({ tab, onExport }: { tab: MemoryTab; onExport: () => void }) {
  return <section className="rounded-[24px] border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><Database size={28} /></div>
    <h2 className="mt-4 text-xl font-semibold text-slate-950">{tab}</h2>
    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Your {tab.toLowerCase()} will appear here as Student-LAD captures approved activity, documents, forgotten items, and memory lifecycle events.</p>
    {tab === 'Export' ? <button type="button" onClick={onExport} className="mt-6 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800">Export Memory Data</button> : null}
  </section>;
}

function CalendarScreen({ initialTab = 'Calendar', reminders, onCreateReminder, onUpdateReminder, onDeleteReminder }: { initialTab?: 'Calendar' | 'Tasks'; reminders: Reminder[]; onCreateReminder: (payload: { title: string; due_at: string; reminder_date?: string; priority?: string }) => Promise<void>; onUpdateReminder: (id: string, payload: Partial<{ title: string; due_at: string; reminder_date: string; priority: string; status: string }>) => Promise<void>; onDeleteReminder: (id: string) => Promise<void> }) {
  const today = new Date();
  const [activeTab, setActiveTab] = useState<'Calendar' | 'Tasks'>(initialTab);
  const [calendarView, setCalendarView] = useState<'Month' | 'Week' | 'Agenda'>('Month');
  const [taskView, setTaskView] = useState<'List' | 'Board' | 'Due Date' | 'Priority'>('List');
  const [syncOpen, setSyncOpen] = useState(false);
  const [conflictDismissed, setConflictDismissed] = useState(false);
  const [conflictDecisions, setConflictDecisions] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(window.localStorage.getItem(calendarConflictDecisionStorageKey()) || '{}') as Record<string, string>; } catch { return {}; }
  });
  const [quickTask, setQuickTask] = useState('');
  const [taskScope, setTaskScope] = useState<SharedTaskScope>('all');
  const [categoryFilters, setCategoryFilters] = useState<string[]>(['Academic', 'Career', 'Immigration', 'Family', 'Health', 'Bills', 'Holidays', 'Personal']);
  const [localTasks, setLocalTasks] = useState<Array<{ id: string; title: string; category: string; priority: string; dueDate?: Date; status: 'active' | 'completed'; effort: string; progress: number; reminder: boolean }>>([]);
  const [notificationState, setNotificationState] = useState<'default' | 'granted' | 'denied'>(() => typeof Notification === 'undefined' ? 'denied' : Notification.permission);
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(clampCalendarYear(today.getFullYear()));
  const categories = ['Academic', 'Career', 'Immigration', 'Family', 'Health', 'Bills', 'Holidays', 'Personal'];
  const events = reminderEvents(reminders).filter((event) => categoryFilters.includes(calendarCategory(event.title)));
  const allTasks = [...reminders.map(reminderToTask), ...localTasks.map(localTaskToShared)];
  const taskCounts = taskScopeCounts(allTasks, today);
  const filteredTasks = allTasks.filter((task) => taskMatchesScope(task, taskScope, today));
  const groupedTasks = {
    overdue: filteredTasks.filter((task) => isTaskOverdue(task, today)),
    active: filteredTasks.filter((task) => isTaskActive(task) && !isTaskOverdue(task, today)),
    completed: filteredTasks.filter((task) => task.status === 'completed'),
  };
  const conflicts = detectCalendarConflicts(events);
  useEffect(() => {
    try { window.localStorage.setItem(calendarConflictDecisionStorageKey(), JSON.stringify(conflictDecisions)); } catch {}
  }, [conflictDecisions]);

  function moveMonth(offset: number) {
    const next = new Date(year, month + offset, 1);
    const nextYear = clampCalendarYear(next.getFullYear());
    setYear(nextYear);
    setMonth(nextYear === CALENDAR_MIN_YEAR && next.getFullYear() < CALENDAR_MIN_YEAR ? 0 : nextYear === CALENDAR_MAX_YEAR && next.getFullYear() > CALENDAR_MAX_YEAR ? 11 : next.getMonth());
  }

  function goToday() {
    setYear(clampCalendarYear(today.getFullYear()));
    setMonth(today.getMonth());
  }

  async function addReminder(defaultDate?: Date) {
    const title = window.prompt('Reminder title', 'Academic deadline');
    if (!title?.trim()) return;
    const defaultWhen = defaultDate ? `${dateKey(defaultDate)} 09:00` : `${dateKey(today)} 09:00`;
    const when = window.prompt('Date and time, for example 2026-07-20 09:00', defaultWhen);
    if (!when?.trim()) return;
    const parsed = parseCalendarInput(when);
    if (!parsed) { window.alert('Please enter a valid date and time.'); return; }
    await onCreateReminder({ title: title.trim(), due_at: parsed.toISOString(), reminder_date: parsed.toISOString(), priority: 'normal' });
  }

  async function editReminder(event: CalendarEvent) {
    const title = window.prompt('Edit reminder title', event.title);
    if (!title?.trim()) return;
    const when = window.prompt('Edit date and time', `${dateKey(event.date)} ${event.date.toTimeString().slice(0, 5)}`);
    if (!when?.trim()) return;
    const parsed = parseCalendarInput(when);
    if (!parsed) { window.alert('Please enter a valid date and time.'); return; }
    const priority = window.prompt('Priority: low, normal, high, or critical', event.priority || 'normal') || event.priority || 'normal';
    await onUpdateReminder(event.id, { title: title.trim(), due_at: parsed.toISOString(), reminder_date: parsed.toISOString(), priority: priority.toLowerCase() });
  }

  function addQuickTask() {
    const title = quickTask.trim();
    if (!title) return;
    const dueDate = parseNaturalTaskDate(title, today);
    setLocalTasks((tasks) => [...tasks, {
      id: `local-task-${Date.now()}`,
      title,
      category: calendarCategory(title),
      priority: /critical|urgent|asap|overdue/i.test(title) ? 'critical' : /high|important/i.test(title) ? 'high' : 'normal',
      dueDate,
      status: 'active',
      effort: /quick|short|small/i.test(title) ? 'Low' : 'Medium',
      progress: 20,
      reminder: Boolean(dueDate),
    }]);
    setQuickTask('');
  }

  async function toggleTaskDone(task: SharedTask) {
    if (task.id.startsWith('local-task-')) {
      setLocalTasks((tasks) => tasks.map((item) => item.id === task.id ? { ...item, status: item.status === 'completed' ? 'active' : 'completed', progress: item.status === 'completed' ? 35 : 100 } : item));
      return;
    }
    await onUpdateReminder(task.id, { status: task.status === 'completed' ? 'active' : 'completed' });
  }

  async function enableNotifications() {
    if (typeof Notification === 'undefined') { setNotificationState('denied'); return; }
    const permission = await Notification.requestPermission();
    setNotificationState(permission);
  }

  const calendarBody = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setSyncOpen(true)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-300 hover:text-emerald-800">Sync Calendars</button>
          <button type="button" title="Add Event" onClick={() => void addReminder()} className="group rounded-xl bg-emerald-700 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"><CalendarDays className="inline h-4 w-4" /><span className="ml-2 hidden group-hover:inline">Add Event</span></button>
        </div>
        <div className="flex flex-wrap gap-2">{['Outlook', 'Apple (Mac/iPhone)', 'Android'].map((source) => <button key={source} type="button" onClick={() => setSyncOpen(true)} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-emerald-300">{source}</button>)}</div>
      </div>
      {conflicts.length && !conflictDismissed ? <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><span>⚠ {conflicts.length} overlapping event window{conflicts.length === 1 ? '' : 's'} detected. Resolve before changing external calendars.</span><button type="button" onClick={() => setConflictDismissed(true)} className="rounded-lg bg-white px-3 py-1 text-xs font-semibold">Dismiss</button></div> : null}
      {conflicts.length ? <CalendarConflictResolver conflicts={conflicts} decisions={conflictDecisions} onResolve={(id, decision) => setConflictDecisions((current) => ({ ...current, [id]: decision }))} onAskKamal={() => window.dispatchEvent(new Event('kamal:open'))} /> : null}
      <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-[0_18px_0_rgba(15,23,42,0.06)] md:grid-cols-[1fr_auto] md:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-label="Previous month" onClick={() => moveMonth(-1)} className="rounded-xl border border-slate-200 px-3 py-2">◀</button>
          <strong className="min-w-40 text-center text-slate-950">{MONTH_LABELS[month]} {year}</strong>
          <button type="button" aria-label="Next month" onClick={() => moveMonth(1)} className="rounded-xl border border-slate-200 px-3 py-2">▶</button>
          <button type="button" onClick={goToday} className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">Today</button>
        </div>
        <div className="flex rounded-2xl bg-slate-100 p-1">{(['Month','Week','Agenda'] as const).map((item) => <button key={item} type="button" onClick={() => setCalendarView(item)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${calendarView === item ? 'bg-slate-950 text-white' : 'text-slate-600 hover:text-slate-950'}`}>{item}</button>)}</div>
      </div>
      <div className="flex flex-wrap gap-2">{categories.map((category) => <button key={category} type="button" onClick={() => setCategoryFilters((selected) => selected.includes(category) ? selected.filter((item) => item !== category) : [...selected, category])} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${categoryFilters.includes(category) ? 'bg-emerald-800 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{category}</button>)}</div>
      <section className="rounded-[2rem] border border-emerald-100 bg-gradient-to-br from-white via-emerald-50/40 to-slate-100 p-4 shadow-[0_22px_0_rgba(16,185,129,0.12)]">
        {calendarView === 'Month' ? <MergedMonthGrid month={month} year={year} events={events} tasks={allTasks} conflicts={conflicts} onAdd={(date) => void addReminder(date)} onEdit={(event) => void editReminder(event)} /> : null}
        {calendarView === 'Week' ? <MergedWeekStrip month={month} year={year} events={events} tasks={allTasks} onAdd={(date) => void addReminder(date)} /> : null}
        {calendarView === 'Agenda' ? <MergedAgenda events={events} tasks={allTasks} conflicts={conflicts} onEdit={(event) => void editReminder(event)} onDelete={(event) => void onDeleteReminder(event.id)} /> : null}
      </section>
    </>
  );

  const tasksBody = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" title="New Task" onClick={() => setQuickTask((value) => value || 'New task by Friday')} className="group rounded-xl bg-emerald-700 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"><ListChecks className="inline h-4 w-4" /><span className="ml-2 hidden group-hover:inline">New Task</span></button>
        <div className="flex rounded-2xl bg-slate-100 p-1">{(['List','Board','Due Date','Priority'] as const).map((item) => <button key={item} type="button" onClick={() => setTaskView(item)} className={`rounded-xl px-3 py-2 text-xs font-semibold ${taskView === item ? 'bg-slate-950 text-white' : 'text-slate-600 hover:text-slate-950'}`}>{item}</button>)}</div>
      </div>
      <div className={`rounded-2xl border p-3 text-sm ${notificationState === 'granted' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : notificationState === 'denied' ? 'border-slate-200 bg-slate-50 text-slate-700' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
        {notificationState === 'granted' ? 'Desktop deadline reminders are enabled.' : notificationState === 'denied' ? 'Desktop reminders are blocked or unavailable in this browser.' : <span>Enable desktop deadline reminders. <button type="button" onClick={() => void enableNotifications()} className="ml-2 font-semibold underline">Enable</button></span>}
      </div>
      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 md:grid-cols-[1fr_auto]">
        <input value={quickTask} onChange={(event) => setQuickTask(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addQuickTask(); }} placeholder="Add task naturally, e.g. Finish essay by Friday" className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
        <button type="button" onClick={addQuickTask} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Add</button>
        <p className="md:col-span-2 text-xs text-slate-500">Preview: detects today, tomorrow, weekdays, priority words, reminders, and categories from your text.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
        <TaskHierarchy active={taskScope} counts={taskCounts} onSelect={setTaskScope} />
        {taskView === 'List' ? <div className="space-y-4"><TaskGroupPanel title="⚠ Overdue" tone="red" tasks={groupedTasks.overdue} onToggle={toggleTaskDone} /><TaskGroupPanel title="Active" tone="slate" tasks={groupedTasks.active} onToggle={toggleTaskDone} /><TaskGroupPanel title="Completed" tone="emerald" tasks={groupedTasks.completed} onToggle={toggleTaskDone} /></div> : <TaskBoard view={taskView} tasks={filteredTasks} onToggle={toggleTaskDone} />}
      </div>
    </>
  );

  return (
    <>
      <Hero eyebrow="Calendar & Tasks" title="All events, tasks, and reminders in one place." body="Plan from one merged surface. Calendar shows time, Tasks shows action, and both read from the same saved reminders and local task layer." />
      <div className="flex w-fit rounded-2xl bg-slate-100 p-1">
        <button type="button" onClick={() => setActiveTab('Calendar')} className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${activeTab === 'Calendar' ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-600 hover:text-slate-950'}`}><CalendarDays className="h-4 w-4" />Calendar</button>
        <button type="button" onClick={() => { setActiveTab('Tasks'); setTaskScope('all'); }} className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${activeTab === 'Tasks' ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-600 hover:text-slate-950'}`}><ListChecks className="h-4 w-4" />Tasks</button>
      </div>
      {activeTab === 'Calendar' ? calendarBody : tasksBody}
      {syncOpen ? <CalendarSyncModal onClose={() => setSyncOpen(false)} /> : null}
    </>
  );
}
function calendarCategory(text = '') {
  const lower = text.toLowerCase();
  if (/visa|i-20|opt|cpt|uscis|passport|sevis/.test(lower)) return 'Immigration';
  if (/resume|career|job|interview|recruiter|linkedin/.test(lower)) return 'Career';
  if (/family|relationship|parent|home/.test(lower)) return 'Family';
  if (/health|doctor|workout|medicine/.test(lower)) return 'Health';
  if (/bill|rent|fee|payment|finance|budget/.test(lower)) return 'Bills';
  if (/holiday|travel|trip|flight/.test(lower)) return 'Holidays';
  if (/personal|habit|errand/.test(lower)) return 'Personal';
  return 'Academic';
}

function taskCategoryFromText(text = ''): SharedTaskCategory {
  const category = calendarCategory(text);
  if (category === 'Bills') return 'finance';
  if (category === 'Holidays') return 'holiday';
  return category.toLowerCase() as SharedTaskCategory;
}

function taskCategoryLabel(category: SharedTaskCategory) {
  return category === 'holiday' ? 'Holidays' : category === 'finance' ? 'Finance' : titleCase(category);
}

function reminderToTask(reminder: Reminder): SharedTask {
  const dueAt = parseReminderDate(reminder.due_at || reminder.reminder_date) || undefined;
  const status = reminder.status === 'completed' ? 'completed' : reminder.status === 'archived' ? 'archived' : reminder.status === 'cancelled' ? 'cancelled' : 'active';
  return {
    id: reminder.id,
    title: reminder.title,
    category: taskCategoryFromText(reminder.title),
    status,
    priority: ((reminder.priority || 'normal').toLowerCase() as SharedTask['priority']) || 'normal',
    dueAt,
    progressPercent: status === 'completed' ? 100 : Math.min(85, Math.max(15, Math.round((reminder.confidence || 0.64) * 100))),
    reminderIds: [reminder.id],
    calendarEventId: reminder.id,
    sourceRecordId: reminder.id,
    sensitive: Boolean(reminder.official_verification_required) || /visa|passport|uscis|sevis|i-20|medical|health|financial/i.test(reminder.title),
    createdAt: reminder.due_at || new Date().toISOString(),
    updatedAt: reminder.due_at || new Date().toISOString(),
  };
}

function localTaskToShared(task: { id: string; title: string; category: string; priority: string; dueDate?: Date; status: 'active' | 'completed'; effort: string; progress: number; reminder: boolean }): SharedTask {
  return {
    id: task.id,
    title: task.title,
    category: taskCategoryFromText(`${task.category} ${task.title}`),
    status: task.status,
    priority: ((task.priority || 'normal').toLowerCase() as SharedTask['priority']) || 'normal',
    dueAt: task.dueDate,
    estimatedMinutes: task.effort === 'Low' ? 30 : 60,
    progressPercent: task.progress,
    reminderIds: task.reminder ? [task.id] : [],
    sensitive: /visa|passport|medical|health|financial|bill|payment/i.test(task.title),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function isTaskOverdue(task: SharedTask, today = new Date()) {
  return Boolean(task.dueAt && startOfDay(task.dueAt) < startOfDay(today) && !['completed', 'cancelled', 'archived'].includes(task.status));
}

function isTaskToday(task: SharedTask, today = new Date()) {
  return Boolean(task.dueAt && dateKey(task.dueAt) === dateKey(today));
}

function isTaskUpcoming(task: SharedTask, today = new Date()) {
  return Boolean(task.dueAt && startOfDay(task.dueAt) > startOfDay(today) && !['completed', 'cancelled', 'archived'].includes(task.status));
}

function isTaskActive(task: SharedTask) {
  return task.status === 'active' || task.status === 'in_progress';
}

function taskMatchesScope(task: SharedTask, scope: SharedTaskScope, today = new Date()) {
  if (scope === 'all') return true;
  if (scope === 'today') return isTaskToday(task, today);
  if (scope === 'upcoming') return isTaskUpcoming(task, today);
  if (scope === 'overdue') return isTaskOverdue(task, today);
  if (scope === 'active') return isTaskActive(task);
  if (scope === 'completed') return task.status === 'completed';
  return task.category === scope;
}

function taskScopeCounts(tasks: SharedTask[], today = new Date()) {
  const scopes: SharedTaskScope[] = ['all', 'today', 'upcoming', 'overdue', 'active', 'completed', 'academic', 'health', 'immigration', 'career', 'family', 'finance', 'holiday'];
  return Object.fromEntries(scopes.map((scope) => [scope, tasks.filter((task) => taskMatchesScope(task, scope, today)).length])) as Record<SharedTaskScope, number>;
}

function eventCategoryTone(category: string) {
  if (category === 'Immigration') return 'from-amber-100 to-orange-50 text-amber-950 border-amber-200';
  if (category === 'Career') return 'from-violet-100 to-indigo-50 text-violet-950 border-violet-200';
  if (category === 'Family') return 'from-pink-100 to-rose-50 text-pink-950 border-pink-200';
  if (category === 'Health') return 'from-emerald-100 to-teal-50 text-emerald-950 border-emerald-200';
  if (category === 'Bills') return 'from-slate-100 to-zinc-50 text-slate-950 border-slate-200';
  if (category === 'Holidays') return 'from-sky-100 to-blue-50 text-sky-950 border-sky-200';
  if (category === 'Personal') return 'from-fuchsia-100 to-purple-50 text-fuchsia-950 border-fuchsia-200';
  return 'from-blue-100 to-cyan-50 text-blue-950 border-blue-200';
}

function detectCalendarConflicts(events: CalendarEvent[]) {
  const buckets = new Map<string, CalendarEvent[]>();
  events.forEach((event) => {
    const key = `${dateKey(event.date)}-${event.date.getHours()}-${event.date.getMinutes() < 30 ? '00' : '30'}`;
    buckets.set(key, [...(buckets.get(key) || []), event]);
  });
  return Array.from(buckets.values()).filter((group) => group.length > 1);
}

function calendarConflictId(group: CalendarEvent[]) {
  return group.map((event) => event.id).sort().join('__');
}

function calendarEventEnd(event: CalendarEvent) {
  return new Date(event.date.getTime() + 60 * 60 * 1000);
}

function calendarConflictOverlapMinutes(group: CalendarEvent[]) {
  if (group.length < 2) return 0;
  const starts = group.map((event) => event.date.getTime());
  const ends = group.map((event) => calendarEventEnd(event).getTime());
  return Math.max(0, Math.round((Math.min(...ends) - Math.max(...starts)) / 60000));
}

function calendarConflictAlternatives(group: CalendarEvent[]) {
  const latestEnd = new Date(Math.max(...group.map((event) => calendarEventEnd(event).getTime())));
  return [30, 90, 24 * 60].map((minutes) => {
    const date = new Date(latestEnd.getTime() + minutes * 60000);
    return date.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  });
}

function CalendarConflictResolver({ conflicts, decisions, onResolve, onAskKamal }: { conflicts: CalendarEvent[][]; decisions: Record<string, string>; onResolve: (id: string, decision: string) => void; onAskKamal: () => void }) {
  const choices = ['Keep both', 'Move requested', 'Move existing', 'Find next available time', 'Shorten one event', 'Cancel'];
  return <section className="rounded-[28px] border border-red-200 bg-white p-4 shadow-sm" aria-label="Calendar conflict resolution">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-red-700">Conflict resolver</p>
        <h2 className="mt-1 text-lg font-black text-slate-950">Choose before anything moves.</h2>
      </div>
      <button type="button" onClick={onAskKamal} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">🦜 Ask Kamal</button>
    </div>
    <div className="mt-4 space-y-3">
      {conflicts.map((group) => {
        const id = calendarConflictId(group);
        const [requested, existing] = group;
        const overlap = calendarConflictOverlapMinutes(group);
        const decision = decisions[id];
        return <article key={id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-red-700">High severity · {overlap || 60} min overlap</p>
              <h3 className="mt-1 text-sm font-black text-slate-950">{requested?.title || 'Requested event'} ↔ {existing?.title || 'Existing event'}</h3>
              <p className="mt-1 text-xs text-slate-600">{requested?.date.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · preparation/travel buffer requires review.</p>
            </div>
            {decision ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">Saved: {decision}</span> : <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">Decision needed</span>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {choices.map((choice) => <button key={choice} type="button" onClick={() => onResolve(id, choice)} className={`rounded-xl px-3 py-2 text-xs font-bold ${decision === choice ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:border-red-200'}`}>{choice}</button>)}
          </div>
          <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-blue-800">Deterministic alternatives</p>
            <div className="mt-2 flex flex-wrap gap-2">{calendarConflictAlternatives(group).map((slot) => <button key={slot} type="button" onClick={() => onResolve(id, `Find next available time: ${slot}`)} className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-blue-900 shadow-sm">{slot}</button>)}</div>
          </div>
        </article>;
      })}
    </div>
  </section>;
}

function parseNaturalTaskDate(text: string, today: Date) {
  const lower = text.toLowerCase();
  if (lower.includes('today')) return today;
  if (lower.includes('tomorrow')) return addDays(today, 1);
  const weekdays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const weekday = weekdays.findIndex((day) => lower.includes(day));
  if (weekday >= 0) {
    const daysAhead = (weekday - today.getDay() + 7) % 7 || 7;
    return addDays(today, daysAhead);
  }
  return undefined;
}

function MergedMonthGrid({ month, year, events, tasks, conflicts, onAdd, onEdit }: { month: number; year: number; events: CalendarEvent[]; tasks: SharedTask[]; conflicts: CalendarEvent[][]; onAdd: (date: Date) => void; onEdit: (event: CalendarEvent) => void }) {
  const first = new Date(year, month, 1);
  const start = addDays(first, -first.getDay());
  const days = Array.from({ length: 42 }, (_, index) => addDays(start, index));
  const holidays = holidayMapForCalendarYear(year);
  const todayKey = dateKey(new Date());
  const conflictKeys = new Set(conflicts.flatMap((group) => group.map((event) => dateKey(event.date))));
  return <div className="space-y-3"><div className="grid grid-cols-7 gap-2 text-center text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day) => <span key={day}>{day}</span>)}</div><div className="grid grid-cols-7 gap-2">{days.map((day) => {
    const key = dateKey(day);
    const dayEvents = events.filter((event) => dateKey(event.date) === key);
    const dayTasks = tasks.filter((task) => task.dueAt && dateKey(task.dueAt) === key);
    const isCurrentMonth = day.getMonth() === month;
    const holidayNames = holidays.get(key) || [];
    return <article key={key} className={`min-h-32 rounded-2xl border p-2 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${key === todayKey ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200' : isCurrentMonth ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 text-slate-400'}`}>
      <button type="button" onClick={() => onAdd(day)} className="flex w-full items-center justify-between text-xs font-bold"><span>{day.getDate()}</span>{holidayNames.length ? <span title={holidayNames.join(', ')}>★</span> : null}</button>
      <div className="mt-2 flex flex-wrap gap-1">{dayEvents.slice(0, 4).map((event) => <button key={event.id} type="button" title={`${event.title} · ${event.timeLabel}`} onClick={() => onEdit(event)} className={`h-2.5 w-2.5 rounded-full ${event.priority === 'critical' ? 'bg-red-700' : event.priority === 'high' ? 'bg-yellow-400' : 'bg-emerald-500'}`} />)}{conflictKeys.has(key) ? <span title="Conflict" className="rounded-full bg-red-700 px-1 text-[9px] font-black text-white">!</span> : null}</div>
      <div className="mt-2 space-y-1">{dayTasks.slice(0, 2).map((task) => <div key={task.id} title={task.title} className="rounded-lg bg-slate-100 px-2 py-1"><div className="truncate text-[10px] font-semibold text-slate-700">{task.title}</div><div className="mt-1 h-1 rounded-full bg-slate-200"><span className="block h-1 rounded-full bg-emerald-500" style={{ width: `${task.progressPercent}%` }} /></div></div>)}</div>
      {dayEvents.length + dayTasks.length === 0 && isCurrentMonth ? <p className="mt-5 text-center text-[10px] text-slate-400">all done</p> : null}
    </article>;
  })}</div><div className="flex flex-wrap gap-2 text-xs text-slate-600"><span>★ US holiday</span><span>● event</span><span className="text-yellow-700">● HP</span><span className="text-red-700">● CR</span><span>▰ task progress</span></div></div>;
}

function MergedWeekStrip({ month, year, events, tasks, onAdd }: { month: number; year: number; events: CalendarEvent[]; tasks: SharedTask[]; onAdd: (date: Date) => void }) {
  const anchor = new Date(year, month, 1);
  const start = addDays(anchor, -anchor.getDay());
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  return <div className="grid gap-3 md:grid-cols-7">{days.map((day) => {
    const key = dateKey(day);
    const dayEvents = events.filter((event) => dateKey(event.date) === key);
    const dayTasks = tasks.filter((task) => task.dueAt && dateKey(task.dueAt) === key);
    return <article key={key} className="min-h-72 rounded-2xl border border-slate-200 bg-white p-3"><button type="button" onClick={() => onAdd(day)} className="text-left"><p className="text-xs font-bold uppercase text-slate-500">{day.toLocaleDateString('en-US', { weekday: 'short' })}</p><p className="text-xl font-black text-slate-950">{day.getDate()}</p></button><div className="mt-3 space-y-2">{dayEvents.map((event) => <p key={event.id} className={`rounded-xl border bg-gradient-to-br p-2 text-xs font-semibold ${eventCategoryTone(calendarCategory(event.title))}`}>{event.timeLabel} · {event.title}</p>)}{dayTasks.map((task) => <p key={task.id} className="rounded-xl bg-slate-100 p-2 text-xs font-semibold text-slate-700">☑ {task.title}</p>)}</div></article>;
  })}</div>;
}

function MergedAgenda({ events, tasks, conflicts, onEdit, onDelete }: { events: CalendarEvent[]; tasks: SharedTask[]; conflicts: CalendarEvent[][]; onEdit: (event: CalendarEvent) => void; onDelete: (event: CalendarEvent) => void }) {
  const conflictIds = new Set(conflicts.flatMap((group) => group.map((event) => event.id)));
  const rows = [...events.map((event) => ({ kind: 'event' as const, id: event.id, title: event.title, date: event.date, category: calendarCategory(event.title), priority: event.priority, event })), ...tasks.filter((task) => task.dueAt).map((task) => ({ kind: 'task' as const, id: task.id, title: task.title, date: task.dueAt as Date, category: taskCategoryLabel(task.category), priority: task.priority }))].sort((a, b) => a.date.getTime() - b.date.getTime());
  return <div className="space-y-3">{rows.length ? rows.map((row) => <article key={`${row.kind}-${row.id}`} className={`rounded-2xl border bg-gradient-to-br p-4 ${row.kind === 'event' && conflictIds.has(row.id) ? 'from-red-100 to-red-50 text-red-950 border-red-300' : eventCategoryTone(row.category)}`}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.12em] opacity-70">{row.kind} · {row.category}</p><h3 className="mt-1 font-black">{row.title}</h3><p className="text-xs opacity-80">{row.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · {row.date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p></div><div className="flex gap-2">{row.kind === 'event' ? <><button type="button" onClick={() => onEdit(row.event)} title="Edit" className="rounded-lg bg-white/70 px-3 py-1 text-xs font-bold">✎</button><button type="button" onClick={() => onDelete(row.event)} title="Delete" className="rounded-lg bg-white/70 px-3 py-1 text-xs font-bold">🗑</button></> : <Badge value={row.priority} />}</div></div></article>) : <p className="rounded-2xl bg-white p-6 text-sm text-slate-500">No events or tasks for the selected filters.</p>}</div>;
}

function TaskHierarchy({ active, counts, onSelect }: { active: SharedTaskScope; counts: Record<SharedTaskScope, number>; onSelect: (scope: SharedTaskScope) => void }) {
  const groups: Array<{ title?: string; items: Array<{ label: string; scope: SharedTaskScope }> }> = [
    { items: [{ label: 'All Tasks', scope: 'all' }] },
    { title: 'Time', items: [{ label: 'Today', scope: 'today' }, { label: 'Upcoming', scope: 'upcoming' }, { label: 'Overdue', scope: 'overdue' }] },
    { title: 'Status', items: [{ label: 'Active', scope: 'active' }, { label: 'Completed', scope: 'completed' }] },
    { title: 'Categories', items: [
      { label: 'Academic', scope: 'academic' },
      { label: 'Health', scope: 'health' },
      { label: 'Immigration', scope: 'immigration' },
      { label: 'Career', scope: 'career' },
      { label: 'Family', scope: 'family' },
      { label: 'Finance', scope: 'finance' },
      { label: 'Holidays', scope: 'holiday' },
    ] },
  ];
  return <aside className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm" aria-label="Task hierarchy">
    {groups.map((group, index) => <div key={group.title || 'all'} className={index ? 'mt-4 border-t border-slate-100 pt-4' : ''}>
      {group.title ? <p className="px-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{group.title}</p> : null}
      <div className="mt-1 space-y-1">
        {group.items.map((item) => <button key={item.scope} type="button" onClick={() => onSelect(item.scope)} className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${active === item.scope ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'}`} aria-pressed={active === item.scope}>
          <span>{item.label}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${active === item.scope ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'}`}>{counts[item.scope] || 0}</span>
        </button>)}
      </div>
    </div>)}
  </aside>;
}

function TaskGroupPanel({ title, tone, tasks, onToggle }: { title: string; tone: 'red' | 'slate' | 'emerald'; tasks: SharedTask[]; onToggle: (task: SharedTask) => Promise<void> }) {
  const toneClass = tone === 'red' ? 'border-red-200 bg-red-50' : tone === 'emerald' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white';
  return <section className={`rounded-3xl border p-4 ${toneClass}`}><h3 className="text-sm font-black text-slate-950">{title}</h3><div className="mt-3 space-y-2">{tasks.length ? tasks.map((task) => <TaskRow key={task.id} task={task} onToggle={onToggle} />) : <p className="rounded-2xl bg-white/70 p-4 text-sm text-slate-500">Nothing in pipeline yet.</p>}</div></section>;
}

function TaskRow({ task, onToggle }: { task: SharedTask; onToggle: (task: SharedTask) => Promise<void> }) {
  return <article className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:grid-cols-[auto_1fr_auto] md:items-center"><input aria-label={`Complete ${task.title}`} type="checkbox" checked={task.status === 'completed'} onChange={() => void onToggle(task)} className="h-5 w-5 accent-emerald-700" /><div><h4 className={`text-sm font-bold text-slate-950 ${task.status === 'completed' ? 'line-through opacity-60' : ''}`}>{task.title}</h4><p className="mt-1 text-xs text-slate-500">{task.dueAt ? task.dueAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No due date'} · {task.estimatedMinutes ? `${task.estimatedMinutes} min` : 'Medium'} effort · {task.reminderIds.length ? '🔔' : 'No reminder'}</p><div className="mt-2 h-1.5 rounded-full bg-slate-100"><span className="block h-1.5 rounded-full bg-emerald-500" style={{ width: `${task.progressPercent}%` }} /></div></div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{taskCategoryLabel(task.category)}</span><Badge value={task.priority} /></div></article>;
}

function TaskBoard({ view, tasks, onToggle }: { view: 'Board' | 'Due Date' | 'Priority'; tasks: SharedTask[]; onToggle: (task: SharedTask) => Promise<void> }) {
  const groups = view === 'Priority' ? ['critical', 'high', 'normal', 'low'] : view === 'Due Date' ? ['Overdue', 'Today', 'Upcoming', 'No Date'] : ['Academic', 'Career', 'Family', 'Health', 'Finance', 'Immigration', 'Holidays', 'Personal'];
  return <div className="grid gap-4 lg:grid-cols-3">{groups.map((group) => <section key={group} className="rounded-3xl border border-slate-200 bg-white p-4"><h3 className="text-sm font-black text-slate-950">{group}</h3><div className="mt-3 space-y-2">{tasks.filter((task) => boardTaskMatch(task, group, view)).map((task) => <TaskRow key={task.id} task={task} onToggle={onToggle} />)}{!tasks.some((task) => boardTaskMatch(task, group, view)) ? <p className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">Nothing here.</p> : null}</div></section>)}</div>;
}

function boardTaskMatch(task: SharedTask, group: string, view: 'Board' | 'Due Date' | 'Priority') {
  if (view === 'Priority') return (task.priority || 'normal').toLowerCase() === group;
  if (view === 'Board') return taskCategoryLabel(task.category) === group;
  const today = startOfDay(new Date());
  if (!task.dueAt) return group === 'No Date';
  const day = startOfDay(task.dueAt);
  if (group === 'Overdue') return day < today;
  if (group === 'Today') return dateKey(day) === dateKey(today);
  return group === 'Upcoming' && day > today;
}

function CalendarSyncModal({ onClose }: { onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"><section className="max-w-xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-black text-slate-950">Sync calendars</h2><p className="mt-1 text-sm text-slate-600">Connect Google, Outlook, Apple, or Android calendars when you want external sync. Local reminders continue to work without cloud access.</p></div><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold">✕</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{['Google Calendar','Outlook Calendar','Apple / iCloud','Android Calendar'].map((source) => <button key={source} type="button" onClick={() => window.dispatchEvent(new Event('kamal:open'))} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left font-bold text-slate-900 hover:border-emerald-300">＋ {source}<p className="mt-1 text-xs font-medium text-slate-500">Authorize from connector popup</p></button>)}</div></section></div>;
}

type WorkspaceTab = 'Overview' | 'Locations' | 'Catalog' | 'Index Status' | 'Activity';
const workspaceTabs: WorkspaceTab[] = ['Overview', 'Locations', 'Catalog', 'Index Status', 'Activity'];

function WorkspacesScreen({ locations, catalog, health, onClear, onRemove, onDisconnect }: { locations: WKIMWorkspace[]; catalog: WKIMDocument[]; health?: WKIMHealth; onClear: () => void; onRemove: (item: WKIMDocument) => void; onDisconnect: (item: WKIMWorkspace) => void }) {
  const [tab, setTab] = useState<WorkspaceTab>('Overview');
  const [selectedCatalog, setSelectedCatalog] = useState<Set<string>>(new Set());
  const pending = catalog.filter((item) => item.index_status === 'pending').length;
  const failed = catalog.filter((item) => item.index_status === 'failed').length;
  const indexed = catalog.filter((item) => item.index_status === 'indexed').length;
  const groupedCatalog = catalog.reduce<Record<string, WKIMDocument[]>>((groups, item) => { const domain = item.domain || 'Workspace'; groups[domain] = [...(groups[domain] || []), item]; return groups; }, {});
  const allCatalogSelected = catalog.length > 0 && catalog.every((item) => selectedCatalog.has(item.document_id));

  return <main className="mx-auto max-w-7xl space-y-5 pb-24" aria-label="Workspaces">
    <header className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-emerald-700">Workspaces</p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-950">Show where information lives.</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">DorjeAI manages knowledge locations, metadata, references, and indexing status. Original files stay where the user keeps them unless explicitly copied.</p>
    </header>

    <nav aria-label="Workspace tabs" className="overflow-x-auto rounded-2xl border border-slate-200 bg-white px-2 shadow-sm"><div className="flex min-w-max gap-1 py-2">{workspaceTabs.map((value)=><button key={value} type="button" onClick={()=>setTab(value)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${tab===value?'bg-slate-950 text-white':'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>{value}{value==='Catalog'?<span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-800">{catalog.length}</span>:null}{value==='Locations'?<span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800">{locations.length}</span>:null}{value==='Index Status'&&pending+failed>0?<span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">{pending+failed}</span>:null}</button>)}</div></nav>

    {tab==='Overview'?<section className="space-y-5"><div className="grid gap-4 md:grid-cols-4"><Metric label="Knowledge Health" value={`${health?.score ?? 0}%`} /><Metric label="Connected Locations" value={locations.length} /><Metric label="Indexed References" value={health?.indexed_documents ?? indexed} /><Metric label="Broken References" value={health?.broken_references ?? 0} /></div><section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-slate-950">Storage strategy</h2><p className="mt-2 text-sm leading-6 text-slate-600">{health?.storage_strategy || 'Dorje AI stores structured metadata and references. Original files stay where you keep them.'}</p><div className="mt-4 grid gap-3 md:grid-cols-3"><Mini label="Pending index" value={String(health?.pending_index ?? pending)} /><Mini label="Failed index" value={String(health?.failed_index ?? failed)} /><Mini label="Reference mode" value="No duplication" /></div></section></section>:null}

    {tab==='Locations'?<section className="rounded-[24px] border border-slate-200 bg-white shadow-sm"><WorkspaceTableHeader title="Connected Locations" subtitle="Connected storage spaces, folders, and connector-backed locations." count={locations.length}/><LocationTable locations={locations} onDisconnect={onDisconnect}/></section>:null}

    {tab==='Catalog'?<section className="space-y-3"><div className="rounded-[24px] border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><label className="inline-flex items-center gap-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={allCatalogSelected} onChange={(event)=>setSelectedCatalog(event.target.checked?new Set(catalog.map(item=>item.document_id)):new Set())} className="h-4 w-4 accent-emerald-600"/>Select all references</label><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={onClear} className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700">Clear catalog</button><span className="text-xs text-slate-500">{catalog.length} references</span></div></div>{selectedCatalog.size?<div className="flex flex-wrap items-center gap-3 border-b border-emerald-100 bg-emerald-50 px-4 py-3 text-sm"><strong className="text-emerald-950">{selectedCatalog.size} selected</strong><button type="button" onClick={()=>setSelectedCatalog(new Set())} className="text-xs font-semibold text-slate-600 underline-offset-2 hover:underline">Clear selection</button></div>:null}<CatalogTable catalog={catalog} selected={selectedCatalog} setSelected={setSelectedCatalog} onRemove={onRemove}/></div>{Object.entries(groupedCatalog).length?<section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-slate-950">Catalog groups</h2><div className="mt-4 flex flex-wrap gap-2">{Object.entries(groupedCatalog).map(([domain, items]) => <span key={domain} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">{titleCase(domain)} · {items.length}</span>)}</div></section>:null}</section>:null}

    {tab==='Index Status'?<section className="rounded-[24px] border border-slate-200 bg-white shadow-sm"><WorkspaceTableHeader title="Index Status" subtitle="Shows whether references are indexed, pending, failed, or need review." count={catalog.length}/><SimpleTable headers={['Source','Domain','Status','Last Updated','Classification']} rows={catalog.map((item)=>[item.title,titleCase(item.domain),<WorkspaceStatusBadge key={`${item.document_id}-status`} value={item.index_status}/>,new Date(item.last_indexed_at).toLocaleString(),item.classification])}/></section>:null}

    {tab==='Activity'?<section className="rounded-[24px] border border-slate-200 bg-white p-12 text-center shadow-sm"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">📂</div><h2 className="mt-4 text-xl font-semibold text-slate-950">Workspace activity</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Uploads, changes, re-indexing, connector events, and watcher activity will appear here as WKIM records events.</p></section>:null}
  </main>;
}

function WorkspaceTableHeader({title,subtitle,count}:{title:string;subtitle:string;count:number}){return <div className="flex flex-col gap-1 border-b border-slate-100 p-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-semibold text-slate-950">{title}</h2><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{count} total</span></div>}
function LocationTable({locations,onDisconnect}:{locations:WKIMWorkspace[];onDisconnect:(item:WKIMWorkspace)=>void}){return <div className="overflow-x-auto"><table className="min-w-[980px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500"><tr>{['Location Name','Type','Location','Access','Watcher','Status','Policy','Actions'].map(header=><th key={header} className="px-4 py-3 font-semibold">{header}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{locations.map(item=><tr key={item.location_id} className="hover:bg-slate-50/70"><td className="px-4 py-4 font-semibold text-slate-950">{item.name}</td><td className="px-4 py-4"><WorkspaceSourceBadge value={item.storage_type}/></td><td className="max-w-sm truncate px-4 py-4 text-slate-600" title={item.location}>{item.location}</td><td className="px-4 py-4 text-slate-600">{item.permission_level}</td><td className="px-4 py-4">{item.watcher_enabled?'On':'Off'}</td><td className="px-4 py-4"><WorkspaceStatusBadge value={item.status}/></td><td className="px-4 py-4"><WorkspaceCategoryBadge value={item.category}/></td><td className="px-4 py-4">{item.disconnectable?<button type="button" onClick={()=>onDisconnect(item)} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100">Disconnect</button>:<span className="text-xs font-semibold text-slate-400">System</span>}</td></tr>)}{!locations.length?<tr><td colSpan={8} className="p-10 text-center text-sm text-slate-500">No connected locations yet.</td></tr>:null}</tbody></table></div>}
function CatalogTable({catalog,selected,setSelected,onRemove}:{catalog:WKIMDocument[];selected:Set<string>;setSelected:(value:Set<string>)=>void;onRemove:(item:WKIMDocument)=>void}){return <div className="overflow-x-auto"><table className="min-w-[980px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500"><tr>{['','Source Name','Type','Domain','Indexed','Last Updated','Extracted Items','Status','Actions'].map(header=><th key={header} className="px-4 py-3 font-semibold">{header}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{catalog.map(item=><tr key={item.document_id} className="hover:bg-slate-50/70"><td className="px-4 py-4"><input type="checkbox" checked={selected.has(item.document_id)} onChange={event=>{const next=new Set(selected);if(event.target.checked)next.add(item.document_id);else next.delete(item.document_id);setSelected(next)}} className="h-4 w-4 accent-emerald-600"/></td><td className="px-4 py-4 font-semibold text-slate-950">{item.title}</td><td className="px-4 py-4"><WorkspaceSourceBadge value={item.file_type}/></td><td className="px-4 py-4"><WorkspaceCategoryBadge value={item.domain}/></td><td className="px-4 py-4">{item.index_status==='indexed'?'Yes':'No'}</td><td className="px-4 py-4 text-slate-600">{new Date(item.last_indexed_at).toLocaleString()}</td><td className="px-4 py-4 text-slate-600">{item.classification}</td><td className="px-4 py-4"><WorkspaceStatusBadge value={item.index_status}/></td><td className="px-4 py-4"><button type="button" onClick={()=>onRemove(item)} className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50">Remove reference</button></td></tr>)}{!catalog.length?<tr><td colSpan={9} className="p-10 text-center text-sm text-slate-500">No knowledge references yet.</td></tr>:null}</tbody></table></div>}
function WorkspaceCategoryBadge({value}:{value:string}){const normalized=(value||'workspace').toLowerCase();const tone=normalized.includes('academic')?'bg-blue-50 text-blue-800 border-blue-200':normalized.includes('immigration')?'bg-amber-50 text-amber-800 border-amber-200':normalized.includes('career')?'bg-violet-50 text-violet-800 border-violet-200':normalized.includes('connector')?'bg-emerald-50 text-emerald-800 border-emerald-200':'bg-slate-50 text-slate-700 border-slate-200';return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${tone}`}>{titleCase(value||'workspace')}</span>}
function WorkspaceSourceBadge({value}:{value:string}){return <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase text-slate-500">{(value||'source').replaceAll('_',' ')}</span>}
function WorkspaceStatusBadge({value}:{value:string}){const normalized=(value||'unknown').toLowerCase();const tone=normalized==='indexed'||normalized==='connected'||normalized==='healthy'||normalized==='active'?'bg-emerald-50 text-emerald-800 border-emerald-200':normalized==='pending'||normalized==='needs_review'?'bg-amber-50 text-amber-800 border-amber-200':normalized==='failed'||normalized==='broken'?'bg-red-50 text-red-800 border-red-200':'bg-slate-100 text-slate-700 border-slate-200';return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${tone}`}>{normalized.replaceAll('_',' ')}</span>}


function cleanRecordTitle(item: ContextObject) {
  const text = item.title || item.payload?.instruction || 'Academic record';
  return text.replace(/^academic record:\s*/i, '').replace(/\s+/g, ' ').trim() || 'Academic record';
}

function displayRecordType(item: ContextObject) {
  const text = `${item.type || ''} ${item.title || ''} ${item.payload?.instruction || ''}`.toLowerCase().replace(/\s+/g, ' ');
  if (/(scheduled class|class time|class schedule|lecture time|seminar|meets? at)/i.test(text)) return 'Scheduled Class';
  if (/(^|[^a-z0-9])(course|cource|courses|course structure|class code)([^a-z0-9]|$)/i.test(text) || /\b(intr|dsrt)\s*-?\s*\d{2,5}[a-z]?\b/i.test(text)) return 'Course';
  if (/(assignment|homework|submission|due|module\s*\d+|\bm\d+\b)/i.test(text)) return 'Assignment';
  if (/(exam|quiz|test|midterm|final)/i.test(text)) return 'Exam / Quiz';
  if (/(note|notes|reading|lecture note)/i.test(text)) return 'Note';
  return item.type ? titleCase(item.type) : 'Other academic record';
}

function recordsOfType(records: ContextObject[], expectedType: string) {
  return records.filter((item) => displayRecordType(item) === expectedType);
}

function AcademicScreen({ academic, onCreateRecord }: { academic: ContextObject[]; onCreateRecord: (text: string, source?: string) => void }) {
  const courses = recordsOfType(academic, 'Course');
  const scheduledClasses = recordsOfType(academic, 'Scheduled Class');
  const assignments = recordsOfType(academic, 'Assignment');
  const exams = recordsOfType(academic, 'Exam / Quiz');
  const notes = recordsOfType(academic, 'Note');
  const unknown = academic.filter((item) => !['Course','Scheduled Class','Assignment','Exam / Quiz','Note'].includes(displayRecordType(item)));
  const directories = [
    { label: 'Courses', records: courses, icon: '📚', empty: 'No courses yet. Say: Kamal add course INTR799 to academic section.' },
    { label: 'Scheduled Classes', records: scheduledClasses, icon: '🕘', empty: 'No scheduled classes yet. Say: Kamal add scheduled class INTR799 Monday 4pm.' },
    { label: 'Assignments', records: assignments, icon: '📝', empty: 'No assignments yet. Add a deadline, upload an assignment, or dictate one to Kamal.' },
    { label: 'Exams / Quizzes', records: exams, icon: '🧪', empty: 'No exams or quizzes yet.' },
    { label: 'Notes', records: notes, icon: '📓', empty: 'No notes yet. Upload lecture notes or add a study note.' },
    ...(unknown.length ? [{ label: 'Other', records: unknown, icon: '✦', empty: '' }] : []),
  ];
  const [selectedDirectory, setSelectedDirectory] = useState<string>('All');
  const visibleRecords = selectedDirectory === 'All' ? academic : directories.find((item) => item.label === selectedDirectory)?.records || [];

  return <main className="mx-auto max-w-6xl space-y-5">
    <Hero eyebrow="Courses, scheduled classes, assignments, notes, exams, research" title="Academic Hub" body="Academic records stay separated by type so Kamal and DorjeAI can retrieve the right context without mixing courses, assignments, exams, notes, or class times." />
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      <AcademicKpi label="All" icon="◎" count={academic.length} active={selectedDirectory === 'All'} tone="slate" onClick={() => setSelectedDirectory('All')} />
      {directories.map((item) => <AcademicKpi key={item.label} label={item.label} icon={item.icon} count={item.records.length} active={selectedDirectory === item.label} tone={academicKpiTone(item.label)} onClick={() => setSelectedDirectory(item.label)} />)}
    </div>
    <AcademicQuickActions onCreateRecord={onCreateRecord} />
    <AcademicRecordsTable title={selectedDirectory === 'All' ? 'All academic records' : selectedDirectory} records={visibleRecords} empty={selectedDirectory === 'All' ? 'No academic records yet. Add a course, assignment, scheduled class, exam, quiz, or note.' : directories.find((item) => item.label === selectedDirectory)?.empty || 'No records yet.'} />
  </main>;
}

function AcademicKpi({ label, icon, count, active, tone, onClick }: { label: string; icon: string; count: number; active: boolean; tone: 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate'; onClick: () => void }) {
  const tones = {
    blue: active ? 'border-blue-400 bg-blue-50 text-blue-950' : 'border-slate-200 bg-white text-slate-800 hover:border-blue-300',
    emerald: active ? 'border-emerald-400 bg-emerald-50 text-emerald-950' : 'border-slate-200 bg-white text-slate-800 hover:border-emerald-300',
    amber: active ? 'border-amber-400 bg-amber-50 text-amber-950' : 'border-slate-200 bg-white text-slate-800 hover:border-amber-300',
    rose: active ? 'border-rose-400 bg-rose-50 text-rose-950' : 'border-slate-200 bg-white text-slate-800 hover:border-rose-300',
    violet: active ? 'border-violet-400 bg-violet-50 text-violet-950' : 'border-slate-200 bg-white text-slate-800 hover:border-violet-300',
    slate: active ? 'border-slate-500 bg-slate-100 text-slate-950' : 'border-slate-200 bg-white text-slate-800 hover:border-slate-400',
  };
  return <button type="button" title={`View ${label}`} onClick={onClick} className={`rounded-2xl border px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 ${tones[tone]}`} aria-pressed={active}>
    <span className="flex items-center justify-between gap-3"><span className="text-xl" aria-hidden="true">{icon}</span><span className="text-2xl font-bold">{count}</span></span>
    <span className="mt-2 block text-xs font-semibold uppercase tracking-[0.14em]">{label}</span>
  </button>;
}

function academicKpiTone(label: string): 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate' {
  if (label.includes('Course')) return 'blue';
  if (label.includes('Scheduled')) return 'emerald';
  if (label.includes('Assignment')) return 'amber';
  if (label.includes('Exam')) return 'rose';
  if (label.includes('Note')) return 'violet';
  return 'slate';
}

function AcademicQuickActions({ onCreateRecord }: { onCreateRecord: (text: string, source?: string) => void }) {
  const [text, setText] = useState('');
  const [source, setSource] = useState('academic quick entry');
  const [message, setMessage] = useState('');
  const actions = [
    ['＋', 'Add course', 'Course: '],
    ['🕘', 'Add scheduled class time', 'Scheduled class: '],
    ['📝', 'Add assignment', 'Assignment: '],
    ['🧪', 'Add exam / quiz', 'Exam / quiz: '],
    ['📓', 'Add note', 'Note: '],
  ] as const;

  async function uploadFile(file?: File) {
    if (!file) return;
    try {
      const content = await file.text();
      onCreateRecord(content || `${file.name} uploaded for academic extraction.`, file.name);
      setMessage(`${file.name} submitted for academic extraction.`);
    } catch {
      onCreateRecord(`${file.name} uploaded for academic extraction.`, file.name);
      setMessage(`${file.name} submitted by file reference.`);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    onCreateRecord(clean, source.trim() || 'academic quick entry');
    setText('');
    setMessage('Academic entry submitted.');
  }

  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-950">Add / Upload Academic</h2>
        <p className="mt-1 text-xs text-slate-500">Use symbols, voice via Kamal, or upload. Hover icons for action names.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map(([icon, label, prefix]) => <button key={label} type="button" title={label} onClick={() => { setText(prefix); setSource(label); }} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-lg hover:border-emerald-300 hover:bg-emerald-50" aria-label={label}>{icon}</button>)}
        <label title="Upload academic source" aria-label="Upload academic source" className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-lg hover:border-sky-300 hover:bg-sky-50">⇧<input type="file" className="hidden" accept=".txt,.md,.csv,.json,.rtf,.pdf,.doc,.docx" onChange={(event) => { void uploadFile(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>
        <button type="button" title="Use Kamal voice" onClick={() => window.dispatchEvent(new Event('kamal:open'))} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-lg hover:border-violet-300 hover:bg-violet-50" aria-label="Use Kamal voice">🎙</button>
      </div>
    </div>
    <form onSubmit={submit} className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-end">
      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Entry<input value={text} onChange={(event) => setText(event.target.value)} placeholder="Example: Course INTR799 is a statistics course." className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-950 outline-none focus:border-emerald-400" /></label>
      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Source<input value={source} onChange={(event) => setSource(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-950 outline-none focus:border-emerald-400" /></label>
      <button type="submit" title="Save entry" disabled={!text.trim()} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">✓</button>
    </form>
    {message ? <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{message}</p> : null}
  </section>;
}

function AcademicRecordsTable({ title, records, empty }: { title: string; records: ContextObject[]; empty: string }) {
  const rows = records.length ? records : [{ title: empty, type: '—', source: { type: 'manual' }, confidence: 0, status: 'empty', domain: 'academic', payload: {} } as ContextObject];
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
      <h2 className="font-semibold text-slate-950">{title}</h2>
      <div className="flex flex-wrap gap-2 text-xs">
        <AcademicLegend label="Done" color="bg-emerald-500" />
        <AcademicLegend label="HP" color="bg-yellow-400" />
        <AcademicLegend label="CR" color="bg-red-700" />
        <AcademicLegend label="U" color="bg-slate-400" />
      </div>
    </div>
    <div className="overflow-x-auto">
      <table className="min-w-[920px] w-full text-left text-sm">
        <thead className="bg-slate-100 text-xs uppercase tracking-[0.12em] text-slate-600">
          <tr>{['Record','Type','Urgency','Source','Confidence','Status','Actions'].map((header) => <th key={header} className="px-4 py-3 font-semibold">{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((item, index) => <tr key={`${item.context_id || item.title}-${index}`} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
            <td className="max-w-[360px] px-4 py-3 font-medium text-slate-950">{cleanRecordTitle(item)}</td>
            <td className="px-4 py-3 text-slate-700">{displayRecordType(item)}</td>
            <td className="px-4 py-3"><AcademicUrgencyBadge item={item} /></td>
            <td className="px-4 py-3 text-slate-700">{item.source?.type || 'manual'}</td>
            <td className="px-4 py-3 text-slate-700">{item.confidence ? `${Math.round(item.confidence * 100)}%` : '—'}</td>
            <td className="px-4 py-3"><AcademicStatusBadge status={item.status} /></td>
            <td className="px-4 py-3"><AcademicRowActions item={item} /></td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </section>;
}

function AcademicLegend({ label, color }: { label: string; color: string }) {
  return <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-slate-700"><span className={`h-2.5 w-2.5 rounded-full ${color}`} />{label}</span>;
}

function academicUrgency(item: ContextObject): 'done' | 'critical' | 'high' | 'upcoming' {
  const text = `${item.status} ${displayRecordType(item)} ${item.title} ${item.payload?.instruction || ''}`.toLowerCase();
  if (/\b(done|complete|completed|submitted|approved)\b/.test(text)) return 'done';
  if (/\b(critical|final|exam|quiz|due today|urgent|overdue)\b/.test(text)) return 'critical';
  if (/\b(high|assignment|deadline|due|submission|scheduled class)\b/.test(text)) return 'high';
  return 'upcoming';
}

function AcademicUrgencyBadge({ item }: { item: ContextObject }) {
  const urgency = academicUrgency(item);
  const styles = {
    done: 'bg-emerald-100 text-emerald-800',
    high: 'bg-yellow-100 text-yellow-900',
    critical: 'bg-red-100 text-red-800',
    upcoming: 'bg-slate-100 text-slate-700',
  };
  const label = urgency === 'done' ? 'Done' : urgency === 'high' ? 'HP' : urgency === 'critical' ? 'CR' : 'U';
  return <span title={urgency} className={`rounded-full px-2.5 py-1 text-xs font-bold ${styles[urgency]}`}>{label}</span>;
}

function AcademicStatusBadge({ status }: { status?: string }) {
  const clean = status || 'active';
  const done = /\b(done|complete|completed|approved|active)\b/i.test(clean);
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${done ? 'bg-emerald-50 text-emerald-800' : clean === 'empty' ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-800'}`}>{clean}</span>;
}

function AcademicRowActions({ item }: { item: ContextObject }) {
  const title = cleanRecordTitle(item);
  return <div className="flex items-center gap-1">
    <button type="button" title={`View ${title}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50" aria-label={`View ${title}`}>⌕</button>
    <button type="button" title={`Edit ${title}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:border-sky-300 hover:bg-sky-50" aria-label={`Edit ${title}`}>✎</button>
    <button type="button" title={`Create reminder for ${title}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:border-amber-300 hover:bg-amber-50" aria-label={`Create reminder for ${title}`}>⏰</button>
  </div>;
}
type ImmigrationProfile = 'Student (F-1)' | 'Professional (H-1B)';
type ImmigrationView = 'Journey' | 'Timeline' | 'Handbook';
type ImmigrationMilestone = {
  id: string;
  icon: string;
  label: string;
  description: string;
  target: string;
  status: 'Completed' | 'In Progress' | 'Upcoming' | 'Locked';
  alert?: boolean;
  tip: string;
  details: Array<[string, string]>;
  checklist: string[];
  documents?: Array<{ name: string; uploaded: boolean; sensitive?: boolean }>;
};

function ImmigrationScreen({ immigration, onCreateRecord }: { immigration: ContextObject[]; onCreateRecord: (text: string, source?: string) => void }) {
  const [profile, setProfile] = useState<ImmigrationProfile>('Student (F-1)');
  const [view, setView] = useState<ImmigrationView>('Journey');
  const [selectedId, setSelectedId] = useState('passport');
  const [completed, setCompleted] = useState<Record<string, string[]>>({});
  const [showProModal, setShowProModal] = useState(false);
  const [universityLinks, setUniversityLinks] = useState<Array<{ id: string; label: string; description: string; url: string }>>([]);
  const milestones = profile === 'Student (F-1)' ? studentImmigrationMilestones(immigration) : professionalImmigrationMilestones();
  const selected = milestones.find((item) => item.id === selectedId && item.status !== 'Locked') || milestones.find((item) => item.status !== 'Locked') || milestones[0];
  const completedMilestones = milestones.filter((item) => milestoneProgress(item, completed[item.id]).completed === item.checklist.length).length;
  const progress = Math.round((completedMilestones / Math.max(1, milestones.length)) * 100);
  const statusCards: Array<[string, string | number, string]> = profile === 'Student (F-1)'
    ? [['Visa Status', immigration.find((item) => /visa/i.test(item.title))?.status || 'Review', 'Travel planning'], ['I-20 Status', immigration.find((item) => /i-?20/i.test(item.title)) ? 'On file' : 'Add', 'Program dates'], ['OPT Window', 'Plan', 'Prepare early'], ['Next Milestone', selected?.label || 'Add record', 'Current focus']]
    : [['H-1B Status', 'Locked', 'Professional path'], ['I-140', 'Future', 'Green card step'], ['I-485', 'Future', 'Adjustment step'], ['Citizenship', 'Future', 'Long-term path']];

  function toggleChecklist(milestoneId: string, item: string) {
    setCompleted((current) => {
      const existing = current[milestoneId] || [];
      const next = existing.includes(item) ? existing.filter((value) => value !== item) : [...existing, item];
      return { ...current, [milestoneId]: next };
    });
  }

  function createReminder(milestone: ImmigrationMilestone) {
    onCreateRecord(`Reminder needed for ${milestone.label}. Target: ${milestone.target}. Verify with DSO, USCIS, or qualified immigration counsel.`, `immigration:${milestone.id}`);
  }

  return <main className="mx-auto max-w-6xl space-y-5">
    <section className="flex flex-col gap-4 rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950 p-6 text-white shadow-xl md:flex-row md:items-start md:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Immigration planning</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Immigration Journey</h1></div>
      <div className="inline-flex rounded-2xl border border-white/15 bg-white/10 p-1">
        {(['Student (F-1)','Professional (H-1B)'] as const).map((item) => <button key={item} type="button" onClick={() => { setProfile(item); setSelectedId(item === 'Student (F-1)' ? 'passport' : 'h1b'); }} className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${profile === item ? 'bg-amber-300 text-slate-950' : 'text-white hover:bg-white/10'}`}>{item === 'Student (F-1)' ? '🎓' : '💼'} {item}</button>)}
      </div>
    </section>
    <section className="rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">⚠️ This is planning and reminder support, not legal advice. Verify dates and eligibility with your DSO, university international office, USCIS, or qualified immigration counsel.</section>
    <JourneyStatusCards cards={statusCards} />
    {profile === 'Student (F-1)' ? <button type="button" onClick={() => setShowProModal(true)} className="w-full rounded-[24px] border-2 border-dashed border-violet-300 bg-violet-50 p-4 text-left text-violet-950 transition hover:border-violet-500"><span className="font-semibold">💼 Professional Journey</span><span className="ml-2 text-sm">H-1B → Green Card → Citizenship</span><span className="float-right text-xs font-semibold">Preview locked</span></button> : null}
    <JourneyViewControls view={view} onView={(next) => setView(next)} completed={completedMilestones} total={milestones.length} progress={progress} />
    {view === 'Journey' ? <>
      <ImmigrationStepSelector milestones={milestones} selectedId={selected?.id || ''} completed={completed} onSelect={setSelectedId} />
      {selected ? <ImmigrationStepDetail milestone={selected} completed={completed[selected.id] || []} onToggle={toggleChecklist} onReminder={createReminder} onSources={() => setView('Handbook')} onCreateRecord={onCreateRecord} /> : null}
    </> : null}
    {view === 'Timeline' ? <ImmigrationTimeline milestones={milestones} completed={completed} profile={profile} /> : null}
    {view === 'Handbook' ? <ImmigrationHandbook links={universityLinks} onLinks={setUniversityLinks} /> : null}
    {showProModal ? <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Professional journey locked"><section className="max-w-lg rounded-3xl border border-violet-200 bg-white p-6 shadow-2xl"><h2 className="text-xl font-semibold text-slate-950">Professional Journey is locked</h2><p className="mt-2 text-sm leading-6 text-slate-600">The H-1B → Green Card → Citizenship path is prepared for Professional-LAD. Student-LAD can preview the path, but professional immigration planning remains locked until that edition is enabled.</p><button type="button" onClick={() => setShowProModal(false)} className="mt-5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white">Close</button></section></div> : null}
  </main>;
}

function studentImmigrationMilestones(records: ContextObject[]): ImmigrationMilestone[] {
  const hasI20 = records.some((item) => /i-?20/i.test(item.title));
  const hasVisa = records.some((item) => /visa/i.test(item.title));
  return [
    { id: 'passport', icon: '🛂', label: 'Passport', description: 'Keep passport validity visible before travel, visa renewal, CPT, OPT, and official filings.', target: 'Review yearly', status: 'In Progress', tip: 'Renew well before expiration, especially before travel or employment authorization planning.', details: [['Security', 'Sensitive · masked by default'], ['Source', 'User-provided document metadata'], ['Cloud use', 'No']], checklist: ['Add passport expiration date', 'Mask passport number', 'Create renewal reminder'], documents: [{ name: 'Passport biographic page', uploaded: false, sensitive: true }] },
    { id: 'visa', icon: '🛃', label: 'Visa', description: 'Track visa expiration and travel planning separately from legal status in the US.', target: hasVisa ? 'On file' : 'Add visa date', status: hasVisa ? 'In Progress' : 'Upcoming', alert: !hasVisa, tip: 'Visa expiration affects travel and re-entry. Verify renewal plans with your international office before leaving the US.', details: [['Use', 'Travel awareness'], ['Reminder', 'Before travel'], ['Verification', 'DSO / consulate']], checklist: ['Add visa expiration date', 'Add appointment notes if any', 'Create travel review reminder'], documents: [{ name: 'Visa stamp', uploaded: hasVisa, sensitive: true }] },
    { id: 'i20', icon: '📄', label: 'I-20', description: 'Program start/end dates drive CPT, OPT, and school timeline planning.', target: hasI20 ? 'On file' : 'Add program end date', status: hasI20 ? 'In Progress' : 'Upcoming', alert: !hasI20, tip: 'Your I-20 program end date is the anchor for several planning windows. Confirm it with your DSO.', details: [['SEVIS', 'Masked'], ['Program dates', hasI20 ? 'Known' : 'Missing'], ['Policy', 'Ask before saving']], checklist: ['Add program start date', 'Add program end date', 'Confirm SEVIS record is masked'], documents: [{ name: 'Current I-20', uploaded: hasI20, sensitive: true }] },
    { id: 'cpt', icon: '💼', label: 'CPT', description: 'Coordinate internship authorization dates and DSO approval before work begins.', target: 'Before internship', status: 'Upcoming', tip: 'Do not start CPT work until your authorization is approved and reflected on your I-20.', details: [['Action', 'DSO approval'], ['Dates', 'Employer-specific'], ['Reminder', 'Before start date']], checklist: ['Add internship offer date', 'Add CPT start/end dates', 'Confirm authorized employer'], documents: [{ name: 'CPT I-20', uploaded: false, sensitive: true }] },
    { id: 'opt', icon: '🪪', label: 'OPT', description: 'Plan OPT preparation, DSO coordination, filing window awareness, and EAD tracking.', target: 'Before program end', status: 'Upcoming', alert: true, tip: 'Use official guidance and your DSO to confirm the filing window and application materials.', details: [['Window', 'Configurable rule pack'], ['Priority', 'High'], ['Legal note', 'Verify official guidance']], checklist: ['Add program end date', 'Prepare OPT package checklist', 'Create filing-window reminders'], documents: [{ name: 'OPT receipt / EAD', uploaded: false, sensitive: true }] },
    { id: 'documents', icon: '🔐', label: 'Documents', description: 'Sensitive immigration files stay masked and local-first unless the user explicitly authorizes use.', target: 'Vault review', status: 'In Progress', tip: 'Store only useful metadata. Do not send scans to cloud models unless you explicitly approve it.', details: [['Vault', 'Encrypted metadata'], ['Cloud', 'Blocked by default'], ['Audit', 'Enabled']], checklist: ['Review missing documents', 'Mask identifiers', 'Confirm retention rules'], documents: [{ name: 'Passport', uploaded: false, sensitive: true }, { name: 'Visa', uploaded: hasVisa, sensitive: true }, { name: 'I-20', uploaded: hasI20, sensitive: true }, { name: 'EAD', uploaded: false, sensitive: true }] },
  ];
}

function professionalImmigrationMilestones(): ImmigrationMilestone[] {
  return [
    { id: 'h1b', icon: '💼', label: 'H-1B', description: 'Employer-sponsored work authorization planning path.', target: 'Professional edition', status: 'In Progress', tip: 'Professional-LAD will support employer, attorney, and filing milestone tracking.', details: [['Edition', 'Professional-LAD'], ['Status', 'Preview'], ['Verification', 'Attorney / employer']], checklist: ['Add employer sponsor', 'Track lottery or cap-exempt path', 'Add filing milestones'] },
    { id: 'i140', icon: '📑', label: 'I-140', description: 'Immigrant petition milestone in green card planning.', target: 'Future', status: 'Upcoming', tip: 'This should be managed with qualified legal counsel.', details: [['Path', 'Green card'], ['Source', 'Attorney documents'], ['Sensitivity', 'High']], checklist: ['Add petition status', 'Add receipt date', 'Track decision'] },
    { id: 'i485', icon: '🧾', label: 'I-485', description: 'Adjustment of status milestone.', target: 'Future', status: 'Upcoming', tip: 'Dates and eligibility must be verified with official sources and counsel.', details: [['Path', 'Adjustment'], ['Priority date', 'Required'], ['Sensitivity', 'High']], checklist: ['Add priority date', 'Track biometrics', 'Track interview'] },
    { id: 'citizenship', icon: '🗽', label: 'Citizenship', description: 'Long-term naturalization planning.', target: 'Future', status: 'Locked', tip: 'Professional-LAD roadmap item.', details: [['Path', 'Long term'], ['Edition', 'Future'], ['Status', 'Locked']], checklist: ['Track residency rules', 'Prepare future plan'] },
  ];
}

function milestoneProgress(milestone: ImmigrationMilestone, done: string[] = []) {
  const completed = milestone.checklist.filter((item) => done.includes(item)).length;
  const percent = Math.round((completed / Math.max(1, milestone.checklist.length)) * 100);
  return { completed, percent };
}

function ImmigrationStepSelector({ milestones, selectedId, completed, onSelect }: { milestones: ImmigrationMilestone[]; selectedId: string; completed: Record<string, string[]>; onSelect: (id: string) => void }) {
  return <nav aria-label="Immigration milestone selector" className="overflow-x-auto rounded-[28px] border border-white/70 bg-white/85 p-3 shadow-[0_18px_40px_rgba(15,23,42,0.10)]"><div className="flex min-w-max gap-3">{milestones.map((step) => {
    const progress = milestoneProgress(step, completed[step.id]);
    const locked = step.status === 'Locked';
    return <button key={step.id} type="button" disabled={locked} title={`${step.label}: ${step.status}`} onClick={() => onSelect(step.id)} className={`relative min-w-[8.5rem] rounded-2xl bg-gradient-to-br px-4 py-3 text-left text-white transition ${selectedId === step.id ? `${threeDTabToneClasses.immigration} -translate-y-1` : locked ? 'from-slate-400 to-slate-500 opacity-50' : `${threeDTabToneClasses.academic} opacity-90 hover:-translate-y-0.5`}`}>
      <span className="text-2xl">{step.icon}</span><span className="mt-2 block text-sm font-bold">{step.label}</span><span className="mt-1 block text-[11px] text-white/80">{step.status}</span>
      {progress.completed === step.checklist.length ? <span className="absolute right-2 top-2 rounded-full bg-emerald-400 px-1.5 text-xs text-slate-950">✓</span> : null}
      {step.alert ? <span className="absolute right-2 bottom-2 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white" /> : null}
    </button>;
  })}</div></nav>;
}

function ImmigrationStepDetail({ milestone, completed, onToggle, onReminder, onSources, onCreateRecord }: { milestone: ImmigrationMilestone; completed: string[]; onToggle: (milestoneId: string, item: string) => void; onReminder: (milestone: ImmigrationMilestone) => void; onSources: () => void; onCreateRecord: (text: string, source?: string) => void }) {
  const progress = milestoneProgress(milestone, completed);
  if (milestone.id === 'documents') return <ImmigrationDocumentsStep milestone={milestone} completed={completed} onToggle={onToggle} onReminder={onReminder} onSources={onSources} onCreateRecord={onCreateRecord} />;
  return <section className="space-y-5">
    <ImmigrationMilestoneActions milestone={milestone} onCreateRecord={onCreateRecord} />
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className={`rounded-[28px] bg-gradient-to-br p-6 text-white ${threeDTabToneClasses.immigration}`}>
        <div className="flex items-start justify-between gap-3"><div><span className="text-5xl">{milestone.icon}</span><h2 className="mt-4 text-2xl font-semibold">{milestone.label}</h2><p className="mt-2 text-sm leading-6 text-white/80">{milestone.description}</p></div><span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{milestone.status}</span></div>
        {milestone.alert ? <p className="mt-5 rounded-2xl bg-red-500/20 p-3 text-sm font-semibold">● Action required: review or add missing date/document metadata.</p> : null}
        <div className="mt-5 rounded-2xl bg-amber-300/15 p-4 text-sm leading-6"><p className="font-semibold">🛡️ Tip</p><p className="mt-1 text-white/85">{milestone.tip}</p></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">{milestone.details.map(([label, value]) => <div key={label} className="rounded-2xl bg-white/10 p-3"><p className="text-[11px] uppercase tracking-[0.14em] text-white/60">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>)}</div>
      </div>
      <ImmigrationChecklist milestone={milestone} completed={completed} progress={progress.percent} onToggle={onToggle} onReminder={onReminder} onSources={onSources} />
    </div>
  </section>;
}

function ImmigrationChecklist({ milestone, completed, progress, onToggle, onReminder, onSources }: { milestone: ImmigrationMilestone; completed: string[]; progress: number; onToggle: (milestoneId: string, item: string) => void; onReminder: (milestone: ImmigrationMilestone) => void; onSources: () => void }) {
  return <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-slate-950">Checklist</h2><span className="text-xs font-semibold text-slate-500">{progress}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-amber-500" style={{ width: `${progress}%` }} /></div><div className="mt-4 space-y-2">{milestone.checklist.map((item) => {
    const checked = completed.includes(item);
    return <button key={item} type="button" onClick={() => onToggle(milestone.id, item)} className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm transition ${checked ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-amber-300'}`}><span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${checked ? 'bg-emerald-500 text-white' : 'bg-white text-slate-400'}`}>{checked ? '✓' : '○'}</span>{item}</button>;
  })}</div><div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => onReminder(milestone)} className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white">⏰ Set Reminder</button><button type="button" onClick={onSources} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-amber-300">📖 Official Sources</button></div></section>;
}

function ImmigrationDocumentsStep({ milestone, completed, onToggle, onReminder, onSources, onCreateRecord }: { milestone: ImmigrationMilestone; completed: string[]; onToggle: (milestoneId: string, item: string) => void; onReminder: (milestone: ImmigrationMilestone) => void; onSources: () => void; onCreateRecord: (text: string, source?: string) => void }) {
  const docs = milestone.documents || [];
  const uploaded = docs.filter((item) => item.uploaded).length;
  return <section className="space-y-5"><ImmigrationMilestoneActions milestone={milestone} onCreateRecord={onCreateRecord} /><div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]"><div className={`rounded-[28px] bg-gradient-to-br p-6 text-white ${threeDTabToneClasses.immigration}`}><span className="text-5xl">🔐</span><h2 className="mt-4 text-2xl font-semibold">Document Vault</h2><p className="mt-2 text-sm text-white/80">{uploaded} of {docs.length} uploaded · sensitive by default</p><div className="mt-5 space-y-3">{docs.map((doc) => <div key={doc.name} className="flex items-center gap-3 rounded-2xl bg-white/10 p-3"><span className={`h-3 w-3 rounded-full ${doc.uploaded ? 'bg-emerald-300' : 'bg-red-400'}`} /><span className="min-w-0 flex-1 font-semibold">{doc.name}</span>{doc.sensitive ? <span className="rounded-full bg-white/15 px-2 py-1 text-[11px]">🔒 Sensitive</span> : null}<button type="button" title={doc.uploaded ? 'View document metadata' : 'Upload document'} className={`rounded-lg px-3 py-1 text-xs font-semibold ${doc.uploaded ? 'bg-emerald-300 text-slate-950' : 'bg-red-500 text-white'}`}>{doc.uploaded ? 'View' : 'Upload'}</button></div>)}</div></div><ImmigrationChecklist milestone={milestone} completed={completed} progress={milestoneProgress(milestone, completed).percent} onToggle={onToggle} onReminder={onReminder} onSources={onSources} /></div></section>;
}

function ImmigrationMilestoneActions({ milestone, onCreateRecord }: { milestone: ImmigrationMilestone; onCreateRecord: (text: string, source?: string) => void }) {
  const [text, setText] = useState('');
  const [source, setSource] = useState(`${milestone.label} manual entry`);
  const [notice, setNotice] = useState('');
  const actionTemplates = [
    ['＋', 'Add detail', `${milestone.label}: `],
    ['📅', 'Add date', `${milestone.label} date: `],
    ['🪪', 'Add document metadata', `${milestone.label} document metadata: `],
    ['⏰', 'Add reminder note', `${milestone.label} reminder note: `],
    ['🛡️', 'Add verification note', `${milestone.label} verification note: `],
  ] as const;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    onCreateRecord(`${milestone.label} milestone detail: ${clean}. This is immigration planning support only; verify with DSO, USCIS, or qualified immigration counsel.`, `immigration:${milestone.id}:${source.trim() || 'manual'}`);
    setText('');
    setNotice(`${milestone.label} detail submitted for structured immigration extraction.`);
  }

  async function handleFile(file?: File) {
    if (!file) return;
    try {
      const content = await file.text();
      const clean = content.replace(/\s+/g, ' ').trim();
      onCreateRecord(`${milestone.label} uploaded document information: ${clean || file.name}. Store only useful metadata and mask sensitive identifiers.`, `immigration:${milestone.id}:${file.name}`);
      setNotice(`${file.name} submitted for ${milestone.label}.`);
    } catch {
      onCreateRecord(`${milestone.label} document uploaded: ${file.name}. Extract metadata only and mask sensitive identifiers.`, `immigration:${milestone.id}:${file.name}`);
      setNotice(`${file.name} submitted as a secure document reference.`);
    }
  }

  return <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="font-semibold text-slate-950">Actions for {milestone.icon} {milestone.label}</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">Add details by form, upload a document, or ask Kamal by voice/text. Sensitive identifiers should be masked.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {actionTemplates.map(([icon, label, prefix]) => <button key={label} type="button" title={label} aria-label={label} onClick={() => { setText(prefix); setSource(label); }} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-lg hover:border-amber-300 hover:bg-amber-50">{icon}</button>)}
        <label title={`Upload ${milestone.label} document`} aria-label={`Upload ${milestone.label} document`} className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-lg hover:border-sky-300 hover:bg-sky-50">⇧<input type="file" className="hidden" accept=".txt,.md,.csv,.json,.rtf,.pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={(event) => { void handleFile(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>
        <button type="button" title="Use Kamal voice/text" aria-label="Use Kamal voice/text" onClick={() => window.dispatchEvent(new Event('kamal:open'))} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-lg hover:border-violet-300 hover:bg-violet-50">🎙</button>
      </div>
    </div>
    <form onSubmit={submit} className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-end">
      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Milestone detail<input value={text} onChange={(event) => setText(event.target.value)} placeholder={`Example: ${milestone.label} expires on May 15, 2027.`} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-950 outline-none focus:border-amber-400" /></label>
      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Source<input value={source} onChange={(event) => setSource(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-950 outline-none focus:border-amber-400" /></label>
      <button type="submit" title="Save milestone detail" disabled={!text.trim()} className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">✓</button>
    </form>
    {notice ? <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">{notice}</p> : null}
  </section>;
}

function ImmigrationTimeline({ milestones, completed, profile }: { milestones: ImmigrationMilestone[]; completed: Record<string, string[]>; profile: ImmigrationProfile }) {
  return <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-slate-950">{profile === 'Student (F-1)' ? 'F-1 Timeline' : 'Professional Timeline'}</h2><div className="mt-5 space-y-4">{milestones.map((milestone, index) => {
    const progress = milestoneProgress(milestone, completed[milestone.id]);
    return <article key={milestone.id} className="relative ml-4 border-l border-amber-200 pb-4 pl-6 last:pb-0"><span className="absolute -left-3 top-0 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">{index + 1}</span><div className={`rounded-2xl bg-gradient-to-br p-4 text-white ${milestone.status === 'Locked' ? 'from-slate-400 to-slate-500' : threeDTabToneClasses.immigration}`}><div className="flex flex-wrap items-start justify-between gap-3"><h3 className="font-semibold">{milestone.icon} {milestone.label}</h3><span className="rounded-full bg-white/15 px-2.5 py-1 text-xs">{milestone.status}</span></div><p className="mt-1 text-sm text-white/80">{milestone.target}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/20"><span className="block h-full rounded-full bg-white" style={{ width: `${progress.percent}%` }} /></div></div></article>;
  })}</div></section>;
}

function ImmigrationHandbook({ links, onLinks }: { links: Array<{ id: string; label: string; description: string; url: string }>; onLinks: (links: Array<{ id: string; label: string; description: string; url: string }>) => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const groups = [
    ['USCIS', [['OPT information', 'https://www.uscis.gov/'], ['Case status', 'https://egov.uscis.gov/']]],
    ['Federal Updates', [['Study in the States', 'https://studyinthestates.dhs.gov/'], ['SEVIS', 'https://www.ice.gov/sevis']]],
    ['Social Security', [['SSA', 'https://www.ssa.gov/']]],
    ['IRS / Tax', [['IRS students', 'https://www.irs.gov/']]],
  ] as const;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = normalizeExternalLink(url);
    if (!label.trim() || !clean) return;
    onLinks([...links, { id: crypto.randomUUID(), label: label.trim(), description: description.trim(), url: clean }]);
    setLabel(''); setDescription(''); setUrl(''); setOpen(false);
  }
  return <section className="space-y-5"><div className="grid gap-4 md:grid-cols-2">{groups.map(([group, items]) => <article key={group} className={`rounded-2xl bg-gradient-to-br p-5 text-white ${threeDTabToneClasses.immigration}`}><h2 className="font-semibold">{group}</h2><div className="mt-3 space-y-2">{items.map(([name, href]) => <button key={name} type="button" onClick={() => window.open(href, '_blank', 'noopener,noreferrer')} className="block w-full rounded-xl bg-white/10 px-3 py-2 text-left text-sm hover:bg-white/20">↗ {name}</button>)}</div></article>)}</div><section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-slate-950">My University Links</h2><button type="button" onClick={() => setOpen((value) => !value)} className="rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-white">＋ Add University Link</button></div>{open ? <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]"><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="International office" className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-950" /><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-950" /><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-950" /><button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Save</button></form> : null}<div className="mt-4 grid gap-3 md:grid-cols-2">{links.map((item) => <article key={item.id} className="group rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-950">{item.label}</h3><p className="mt-1 text-xs text-slate-500">{item.description || item.url}</p></div><button type="button" title="Delete link" onClick={() => onLinks(links.filter((link) => link.id !== item.id))} className="opacity-0 transition group-hover:opacity-100">🗑</button></div></article>)}</div>{!links.length ? <p className="mt-3 text-sm text-slate-500">Add your university international office, DSO page, or school-specific immigration links.</p> : null}</section></section>;
}
function normalizeExternalLink(value: string) {
  try {
    const withProtocol = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
    return new URL(withProtocol).toString();
  } catch {
    return '';
  }
}
type CareerTab = 'Overview' | 'Job Applications' | 'Resume & Cover Letter' | 'Recruiters' | 'Networking' | 'Job Boards';
type CareerApplication = { organization: string; role: string; status: 'Applied' | 'Active' | 'Interview' | 'Offer' | 'Rejected'; appliedDate: string; nextAction: string; resumeVersion: string; interviewDate?: string };
type CareerFile = { id: string; name: string; note: string; date: string; url: string; file?: File };
type RecruiterRecord = { id: string; name: string; company: string; email: string; phone: string; linkedIn: string; note: string };
type NetworkLink = { id: string; label: string; url: string; icon: string; tone: string };

const mockJobApplications: CareerApplication[] = [];

function CareerScreen({ career }: { career: ContextObject[]; onCreateRecord: (text: string, source?: string) => void }) {
  const [tab, setTab] = useState<CareerTab>('Overview');
  const [resumes, setResumes] = useState<CareerFile[]>([]);
  const [coverLetters, setCoverLetters] = useState<CareerFile[]>([]);
  const [recruiters, setRecruiters] = useState<RecruiterRecord[]>([]);
  const [networkLinks, setNetworkLinks] = useState<NetworkLink[]>([]);
  const stats = {
    applications: mockJobApplications.length,
    active: mockJobApplications.filter((item) => item.status === 'Active' || item.status === 'Applied').length,
    interviews: mockJobApplications.filter((item) => item.status === 'Interview').length,
    offers: mockJobApplications.filter((item) => item.status === 'Offer').length,
  };

  return <main className="mx-auto max-w-7xl space-y-5">
    <section className="flex flex-col gap-3 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Resume, applications, recruiters, network</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Career Hub</h1><p className="mt-2 text-sm text-slate-500">{career.length} saved career context item{career.length === 1 ? '' : 's'} available after approval.</p></div>
      <button type="button" onClick={() => window.dispatchEvent(new Event('kamal:open'))} title="Ask Kamal for career help" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">🎙 Ask Kamal</button>
    </section>
    <CareerTabBar active={tab} onSelect={setTab} />
    {tab === 'Overview' ? <CareerOverview stats={stats} applications={mockJobApplications} onTab={setTab} /> : null}
    {tab === 'Job Applications' ? <ApplicationTable applications={mockJobApplications} /> : null}
    {tab === 'Resume & Cover Letter' ? <ResumeCoverLetterTab resumes={resumes} coverLetters={coverLetters} onResumes={setResumes} onCoverLetters={setCoverLetters} onDraftEmail={() => openWorkspaceTool('email', { context: `Draft an application email. Resume options: ${resumes.map((item) => item.name).join(', ') || 'none yet'}. Cover letter options: ${coverLetters.map((item) => item.name).join(', ') || 'none yet'}.` })} /> : null}
    {tab === 'Recruiters' ? <RecruitersTab recruiters={recruiters} onRecruiters={setRecruiters} /> : null}
    {tab === 'Networking' ? <NetworkingTab links={networkLinks} onLinks={setNetworkLinks} /> : null}
    {tab === 'Job Boards' ? <JobBoardsTab /> : null}
  </main>;
}

function CareerTabBar({ active, onSelect }: { active: CareerTab; onSelect: (tab: CareerTab) => void }) {
  const tabs: CareerTab[] = ['Overview', 'Job Applications', 'Resume & Cover Letter', 'Recruiters', 'Networking', 'Job Boards'];
  return <nav aria-label="Career Hub tabs" className="overflow-x-auto border-b border-slate-200 bg-white/80"><div role="tablist" className="flex min-w-max gap-6 px-1">{tabs.map((tab) => <button key={tab} type="button" role="tab" aria-selected={active === tab} onClick={() => onSelect(tab)} className={`border-b-2 px-1 py-3 text-sm font-semibold transition ${active === tab ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'}`}>{tab}</button>)}</div></nav>;
}

function CareerOverview({ stats, applications, onTab }: { stats: { applications: number; active: number; interviews: number; offers: number }; applications: CareerApplication[]; onTab: (tab: CareerTab) => void }) {
  const interviews = applications.filter((item) => item.interviewDate);
  return <section className="space-y-5"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><CareerStatCard icon="📄" label="Applications" value={stats.applications} tone="from-violet-600 to-violet-500" /><CareerStatCard icon="⚡" label="Active" value={stats.active} tone="from-blue-600 to-blue-500" /><CareerStatCard icon="🎤" label="Interviews" value={stats.interviews} tone="from-emerald-600 to-emerald-500" /><CareerStatCard icon="🏆" label="Offers" value={stats.offers} tone="from-amber-500 to-orange-500" /></div><div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]"><Panel title="Recent Applications"><ApplicationTable applications={applications.slice(0, 4)} compact /><button type="button" onClick={() => onTab('Job Applications')} className="mt-3 text-sm font-semibold text-emerald-700">View all →</button></Panel><Panel title="Upcoming Interviews">{interviews.length ? <div className="space-y-3">{interviews.map((item) => <article key={`${item.organization}-${item.role}`} className="rounded-2xl border border-violet-100 bg-violet-50 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-violet-950">{item.organization}</h3><p className="mt-1 text-sm text-violet-800">{item.role} · {item.interviewDate}</p></div><CareerStatusBadge status={item.status} /></div></article>)}</div> : <p className="text-sm text-slate-500">No interviews scheduled yet.</p>}</Panel></div><Panel title="Quick Access"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{(['Resume & Cover Letter','Recruiters','Networking','Job Boards'] as CareerTab[]).map((item) => <button key={item} type="button" onClick={() => onTab(item)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:border-emerald-300 hover:bg-emerald-50">{item} →</button>)}</div></Panel></section>;
}

function CareerStatCard({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: string }) {
  return <article className={`rounded-2xl bg-gradient-to-br ${tone} p-5 text-white shadow-[0_8px_0_rgba(15,23,42,0.18),0_18px_30px_rgba(15,23,42,0.12)]`}><span className="text-2xl">{icon}</span><p className="mt-4 text-3xl font-bold">{value}</p><p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/75">{label}</p></article>;
}

function ApplicationTable({ applications, compact = false }: { applications: CareerApplication[]; compact?: boolean }) {
  return <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="min-w-[900px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500"><tr>{['Organization','Role','Status','Applied','Next Action','Resume','Interview'].map((header) => <th key={header} className="px-3 py-3 font-semibold">{header}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{applications.map((item, index) => <tr key={`${item.organization}-${item.role}`} className={index % 2 ? 'bg-slate-50/70' : 'bg-white'}><td className="px-3 py-3 font-semibold text-slate-950">{item.organization}</td><td className="px-3 py-3 text-slate-700">{item.role}</td><td className="px-3 py-3"><CareerStatusBadge status={item.status} /></td><td className="px-3 py-3 text-slate-700">{item.appliedDate}</td><td className="px-3 py-3 text-slate-700">{item.nextAction}</td><td className="px-3 py-3 font-mono text-xs text-slate-700">{item.resumeVersion}</td><td className="px-3 py-3 text-slate-700">{item.interviewDate || '—'}</td></tr>)}</tbody></table>{compact ? null : <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">Read-only application tracker. Add/edit workflow can be connected later to CEDA records.</p>}</div>;
}

function CareerStatusBadge({ status }: { status: CareerApplication['status'] }) {
  const styles: Record<CareerApplication['status'], string> = { Applied: 'bg-slate-100 text-slate-700', Active: 'bg-blue-100 text-blue-800', Interview: 'bg-emerald-100 text-emerald-800', Offer: 'bg-amber-100 text-amber-900', Rejected: 'bg-rose-100 text-rose-800' };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status]}`}>{status}</span>;
}

function ResumeCoverLetterTab({ resumes, coverLetters, onResumes, onCoverLetters, onDraftEmail }: { resumes: CareerFile[]; coverLetters: CareerFile[]; onResumes: (items: CareerFile[]) => void; onCoverLetters: (items: CareerFile[]) => void; onDraftEmail: () => void }) {
  return <section className="space-y-5"><div className="flex justify-end"><button type="button" onClick={onDraftEmail} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">✉ Draft Application Email</button></div><div className="grid gap-5 xl:grid-cols-2"><CareerFileManager title="Resumes" accent="emerald" files={resumes} onFiles={onResumes} /><CareerFileManager title="Cover Letters" accent="violet" files={coverLetters} onFiles={onCoverLetters} /></div></section>;
}

function CareerFileManager({ title, accent, files, onFiles }: { title: string; accent: 'emerald' | 'violet'; files: CareerFile[]; onFiles: (items: CareerFile[]) => void }) {
  function addFile(file?: File) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    onFiles([...files, { id: crypto.randomUUID(), name: file.name, note: title === 'Resumes' ? 'Uploaded resume' : 'Uploaded cover letter', date: new Date().toISOString().slice(0, 10), url, file }]);
  }
  return <Panel title={title}><div className="mb-3 flex justify-end"><label className={`cursor-pointer rounded-xl px-3 py-2 text-sm font-semibold text-white ${accent === 'emerald' ? 'bg-emerald-600' : 'bg-violet-600'}`}>⇧ Upload<input type="file" className="hidden" accept=".pdf,.doc,.docx" onChange={(event) => { addFile(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label></div><div className="divide-y divide-slate-100">{files.map((item) => <div key={item.id} className="flex items-center gap-3 py-3"><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${accent === 'emerald' ? 'bg-emerald-50 text-emerald-700' : 'bg-violet-50 text-violet-700'}`}>{title === 'Resumes' ? '📄' : '✉'}</span><div className="min-w-0 flex-1"><p className="truncate font-semibold text-slate-950">{item.name}</p><p className="text-xs text-slate-500">{item.note} · {item.date}</p></div><a href={item.url} download={item.name} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">Download</a><button type="button" title={`Delete ${item.name}`} onClick={() => onFiles(files.filter((file) => file.id !== item.id))} className="rounded-lg border border-rose-100 px-2 py-1 text-xs text-rose-700">🗑</button></div>)}</div></Panel>;
}

function RecruitersTab({ recruiters, onRecruiters }: { recruiters: RecruiterRecord[]; onRecruiters: (items: RecruiterRecord[]) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', company: '', email: '', phone: '', linkedIn: '', note: '' });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!form.name.trim()) return; onRecruiters([...recruiters, { id: crypto.randomUUID(), ...form, name: form.name.trim() }]); setForm({ name: '', company: '', email: '', phone: '', linkedIn: '', note: '' }); setOpen(false); }
  return <section className="space-y-5"><button type="button" onClick={() => setOpen((value) => !value)} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">＋ Add Recruiter</button>{open ? <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-3"><input required placeholder="Name*" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-slate-950" /><input placeholder="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-slate-950" /><input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-slate-950" /><input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-slate-950" /><input placeholder="LinkedIn URL" value={form.linkedIn} onChange={(e) => setForm({ ...form, linkedIn: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-slate-950" /><input placeholder="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-slate-950" /><button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white md:col-span-3">Save Recruiter</button></form> : null}<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{recruiters.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-950">{item.name}</h2><p className="text-sm text-slate-500">{item.company || 'Recruiter'}</p></div><button type="button" onClick={() => onRecruiters(recruiters.filter((recruiter) => recruiter.id !== item.id))}>🗑</button></div><p className="mt-3 text-sm text-slate-600">{item.note || 'No note yet.'}</p><div className="mt-4 flex flex-wrap gap-2">{item.email ? <a href={`mailto:${item.email}`} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">Email</a> : null}{item.phone ? <a href={`tel:${item.phone}`} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">Call</a> : null}{item.linkedIn ? <a href={item.linkedIn} target="_blank" rel="noreferrer" className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">LinkedIn</a> : null}</div></article>)}</div>{!recruiters.length ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">No recruiters yet. Add your first contact.</p> : null}</section>;
}

function NetworkingTab({ links, onLinks }: { links: NetworkLink[]; onLinks: (items: NetworkLink[]) => void }) {
  const presets = [{ label: 'LinkedIn', icon: 'in', baseUrl: 'https://linkedin.com/in/', tone: 'from-blue-700 to-blue-500' }, { label: 'Telegram', icon: '✈', baseUrl: 'https://t.me/', tone: 'from-sky-500 to-blue-500' }, { label: 'Discord', icon: '☯', baseUrl: 'https://discord.com/users/', tone: 'from-indigo-600 to-violet-600' }, { label: 'WhatsApp', icon: '☘', baseUrl: 'https://wa.me/', tone: 'from-emerald-500 to-green-600' }, { label: 'Snapchat', icon: '👻', baseUrl: 'https://snapchat.com/add/', tone: 'from-yellow-300 to-amber-400' }, { label: 'GitHub', icon: '⌘', baseUrl: 'https://github.com/', tone: 'from-slate-800 to-slate-600' }, { label: 'Twitter/X', icon: '𝕏', baseUrl: 'https://x.com/', tone: 'from-slate-950 to-slate-700' }, { label: 'Custom', icon: '✦', baseUrl: '', tone: 'from-fuchsia-600 to-violet-600' }];
  const [preset, setPreset] = useState(presets[0]);
  const [handle, setHandle] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  function add(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const url = preset.label === 'Custom' ? normalizeExternalLink(customUrl) : `${preset.baseUrl}${handle.replace(/^@/, '')}`; const label = preset.label === 'Custom' ? customLabel.trim() || 'Custom' : preset.label; if (!url) return; onLinks([...links, { id: crypto.randomUUID(), label, url, icon: preset.icon, tone: preset.tone }]); setHandle(''); setCustomLabel(''); setCustomUrl(''); }
  return <section className="space-y-5"><form onSubmit={add} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-8">{presets.map((item) => <button key={item.label} type="button" onClick={() => setPreset(item)} className={`rounded-2xl bg-gradient-to-br ${item.tone} p-3 text-center text-white shadow-sm ${preset.label === item.label ? 'ring-4 ring-emerald-200' : ''}`}><span className="block text-xl">{item.icon}</span><span className="mt-1 block text-xs font-semibold">{item.label}</span></button>)}</div><div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">{preset.label === 'Custom' ? <><input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="Label" className="rounded-xl border border-slate-200 px-3 py-2 text-slate-950" /><input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="https://..." className="rounded-xl border border-slate-200 px-3 py-2 text-slate-950" /></> : <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="username / handle" className="rounded-xl border border-slate-200 px-3 py-2 text-slate-950 md:col-span-2" />}<button className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Save</button></div></form><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{links.map((item) => <article key={item.id} className={`group relative rounded-2xl bg-gradient-to-br ${item.tone} p-5 text-white shadow-[0_8px_0_rgba(15,23,42,0.15)] transition hover:-translate-y-1`}><button type="button" onClick={() => onLinks(links.filter((link) => link.id !== item.id))} className="absolute right-2 top-2 opacity-0 group-hover:opacity-100">×</button><span className="text-2xl">{item.icon}</span><h3 className="mt-3 font-semibold">{item.label}</h3><p className="mt-1 truncate text-xs text-white/75">{item.url.replace(/^https?:\/\//, '')}</p></article>)}</div></section>;
}

function JobBoardsTab() {
  const boards = [{ label: 'LinkedIn', url: 'https://www.linkedin.com/jobs/', icon: 'in', tone: 'from-blue-700 to-blue-500' }, { label: 'Indeed', url: 'https://www.indeed.com/', icon: 'i', tone: 'from-indigo-600 to-blue-500' }, { label: 'Glassdoor', url: 'https://www.glassdoor.com/', icon: 'G', tone: 'from-emerald-600 to-teal-500' }, { label: 'Handshake', url: 'https://joinhandshake.com/', icon: '🤝', tone: 'from-violet-600 to-purple-500' }, { label: 'Wellfound', url: 'https://wellfound.com/', icon: 'W', tone: 'from-slate-800 to-slate-600' }, { label: 'Levels.fyi', url: 'https://www.levels.fyi/', icon: 'L', tone: 'from-amber-500 to-orange-500' }];
  return <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{boards.map((item) => <button key={item.label} type="button" onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')} className={`rounded-3xl bg-gradient-to-br ${item.tone} p-6 text-left text-white shadow-[0_9px_0_rgba(15,23,42,0.18),0_18px_30px_rgba(15,23,42,0.12)] transition hover:-translate-y-1`}><span className="text-3xl font-bold">{item.icon}</span><h2 className="mt-5 text-xl font-semibold">{item.label}</h2><p className="mt-1 text-sm text-white/75">Open job board ↗</p></button>)}</section>;
}
function FamilyScreen({ onCreateRecord }: { onCreateRecord: (text: string, source?: string) => void }) {
  const tabs = ['Overview', 'Members', 'Children', 'School', 'Activities', 'Health', 'Birthdays', 'Friends'] as const;
  type FamilyTab = typeof tabs[number];
  const [tab, setTab] = useState<FamilyTab>('Overview');
  const [members, setMembers] = useState<FamilyMember[]>(() => readFamilyData().members);
  const [events, setEvents] = useState<FamilyEvent[]>(() => readFamilyData().events);
  const [activities, setActivities] = useState<FamilyActivity[]>(() => readFamilyData().activities);
  const [health, setHealth] = useState<FamilyHealthRecord[]>(() => readFamilyData().health);
  const [friends, setFriends] = useState<FamilyFriend[]>(() => readFamilyData().friends);
  const [memberModal, setMemberModal] = useState<FamilyMember | 'new' | null>(null);
  const [eventModal, setEventModal] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [friendOpen, setFriendOpen] = useState(false);

  function persist(next: Partial<FamilyData>) {
    const data = { members, events, activities, health, friends, ...next };
    writeFamilyData(data);
  }
  function saveMembers(next: FamilyMember[]) { setMembers(next); persist({ members: next }); }
  function saveEvents(next: FamilyEvent[]) { setEvents(next); persist({ events: next }); }
  function saveActivities(next: FamilyActivity[]) { setActivities(next); persist({ activities: next }); }
  function saveHealth(next: FamilyHealthRecord[]) { setHealth(next); persist({ health: next }); }
  function saveFriends(next: FamilyFriend[]) { setFriends(next); persist({ friends: next }); }
  function upsertMember(member: FamilyMember) {
    const next = members.some((item) => item.id === member.id) ? members.map((item) => item.id === member.id ? member : item) : [...members, member];
    saveMembers(next);
    onCreateRecord(`Family member saved: ${member.name}, relation ${member.relation}.`, 'family:member');
  }
  function addEvent(event: FamilyEvent) {
    saveEvents([...events, event]);
    onCreateRecord(`Family event saved: ${event.title} on ${event.date}.`, 'family:event');
  }
  const children = members.filter((member) => /child|son|daughter|kid/i.test(member.relation));
  const schoolEvents = events.filter((event) => event.category === 'School');
  const sortedEvents = [...events].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));

  return <main className="mx-auto max-w-7xl space-y-5">
    <section className="rounded-[28px] border border-rose-100 bg-gradient-to-br from-rose-50 via-white to-pink-50 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-black uppercase tracking-[0.18em] text-rose-600">Family Hub</p><span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-black text-rose-800">🔒 Sensitive</span></div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Family Hub</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Family information is stored locally and never shared without permission.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setEventModal(true)} className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50">Add Event</button>
          <button type="button" title="Add Member" onClick={() => setMemberModal('new')} className="group rounded-xl bg-rose-600 px-3 py-2 text-sm font-bold text-white shadow-sm hover:bg-rose-700"><span aria-hidden="true">＋</span><span className="ml-2 hidden group-hover:inline">Add Member</span></button>
        </div>
      </div>
    </section>
    <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold leading-6 text-rose-950">🔐 Family data needs explicit permission before cloud processing. Sensitive details are masked by default and should only be used for local planning, reminders, and user-approved drafts.</section>
    <nav className="overflow-x-auto border-b border-rose-100 bg-white/80" aria-label="Family Hub tabs"><div className="flex min-w-max gap-5">{tabs.map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`border-b-2 px-1 py-3 text-sm font-bold transition ${tab === item ? 'border-rose-500 text-rose-700' : 'border-transparent text-slate-500 hover:border-rose-200 hover:text-rose-700'}`}>{item}</button>)}</div></nav>
    {tab === 'Overview' ? <FamilyOverview events={sortedEvents} members={members} onAddEvent={() => setEventModal(true)} onRemoveEvent={(id) => saveEvents(events.filter((event) => event.id !== id))} /> : null}
    {tab === 'Members' ? <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{members.map((member) => <FamilyMemberCard key={member.id} member={member} events={events} onEdit={() => setMemberModal(member)} onDelete={() => saveMembers(members.filter((item) => item.id !== member.id))} />)}<button type="button" onClick={() => setMemberModal('new')} className="min-h-72 rounded-[28px] border-2 border-dashed border-rose-200 bg-rose-50/60 p-6 text-center text-rose-700 transition hover:bg-rose-100"><span className="text-4xl">＋</span><span className="mt-3 block font-black">Add Member</span></button></section> : null}
    {tab === 'Children' ? <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children.length ? children.map((child) => <FamilyChildCard key={child.id} child={child} events={events} />) : <FamilyEmpty title="No children saved yet" body="Add a family member with relation Child, Son, or Daughter." />}</section> : null}
    {tab === 'School' ? <Panel title="School Events & Commitments"><div className="space-y-2">{schoolEvents.length ? schoolEvents.map((event) => <FamilyEventRow key={event.id} event={event} onRemove={() => saveEvents(events.filter((item) => item.id !== event.id))} action={<button type="button" onClick={() => onCreateRecord(`Add school event to calendar: ${event.title} on ${event.date} ${event.time}`, 'family:school-calendar')} className="text-xs font-bold text-rose-700">Add to calendar</button>} />) : <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">No school events yet.</p>}</div></Panel> : null}
    {tab === 'Activities' ? <FamilyActivities activities={activities} open={activityOpen} onOpen={setActivityOpen} onSave={(activity) => saveActivities([...activities, activity])} onRemove={(id) => saveActivities(activities.filter((item) => item.id !== id))} members={members} /> : null}
    {tab === 'Health' ? <FamilyHealth records={health} open={healthOpen} onOpen={setHealthOpen} onSave={(record) => saveHealth([...health, record])} onRemove={(id) => saveHealth(health.filter((item) => item.id !== id))} members={members} /> : null}
    {tab === 'Birthdays' ? <Panel title="Birthdays & Anniversaries"><div className="space-y-2">{members.filter((member) => member.birthday).length ? members.filter((member) => member.birthday).map((member) => <div key={member.id} className="flex items-center gap-3 rounded-2xl bg-rose-50 p-3"><span className="text-2xl">{member.emoji}</span><div className="flex-1"><p className="font-bold text-slate-950">{member.name}</p><p className="text-xs text-slate-500">{member.birthday}</p></div><span title="Birthday">🎂</span></div>) : <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">Add birthdays from member details.</p>}</div></Panel> : null}
    {tab === 'Friends' ? <FamilyFriends friends={friends} open={friendOpen} onOpen={setFriendOpen} onSave={(friend) => saveFriends([...friends, friend])} onRemove={(id) => saveFriends(friends.filter((item) => item.id !== id))} /> : null}
    {memberModal ? <FamilyMemberModal member={memberModal === 'new' ? null : memberModal} onClose={() => setMemberModal(null)} onSave={(member) => { upsertMember(member); setMemberModal(null); }} /> : null}
    {eventModal ? <FamilyEventModal onClose={() => setEventModal(false)} onSave={(event) => { addEvent(event); setEventModal(false); }} /> : null}
  </main>;
}

type FamilyMember = { id: string; name: string; relation: string; birthday: string; phone: string; email: string; notes: string; emoji: string; color: string; grade?: string; school?: string; teacher?: string; activities?: string };
type FamilyEvent = { id: string; title: string; date: string; time: string; category: 'Family' | 'School' | 'Birthday' | 'Health' | 'Activity'; notes: string };
type FamilyActivity = { id: string; name: string; child: string; day: string; time: string; location: string };
type FamilyHealthRecord = { id: string; member: string; type: string; detail: string; date: string };
type FamilyFriend = { id: string; name: string; relation: string; phone: string; notes: string; emoji: string };
type FamilyData = { members: FamilyMember[]; events: FamilyEvent[]; activities: FamilyActivity[]; health: FamilyHealthRecord[]; friends: FamilyFriend[] };

function defaultFamilyData(): FamilyData {
  return {
    members: [],
    events: [],
    activities: [],
    health: [],
    friends: [],
  };
}

function familyStorageKey() { return userStorageKey('student_lad_family_hub'); }
function readFamilyData(): FamilyData {
  if (typeof window === 'undefined') return defaultFamilyData();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(familyStorageKey()) || 'null') as Partial<FamilyData> | null;
    return { ...defaultFamilyData(), ...(parsed || {}) };
  } catch {
    return defaultFamilyData();
  }
}
function writeFamilyData(data: FamilyData) {
  if (typeof window !== 'undefined') window.localStorage.setItem(familyStorageKey(), JSON.stringify(data));
}
function familyId(prefix: string) {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

function FamilyOverview({ events, members, onAddEvent, onRemoveEvent }: { events: FamilyEvent[]; members: FamilyMember[]; onAddEvent: () => void; onRemoveEvent: (id: string) => void }) {
  return <section className="grid gap-5 lg:grid-cols-2"><Panel title="Upcoming Family Events"><div className="mb-3 flex justify-end"><button type="button" title="Add Event" onClick={onAddEvent} className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-bold text-white">＋</button></div><div className="space-y-2">{events.length ? events.slice(0, 6).map((event) => <FamilyEventRow key={event.id} event={event} onRemove={() => onRemoveEvent(event.id)} />) : <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">No family events yet.</p>}</div></Panel><Panel title="Family Members"><div className="space-y-3">{members.map((member) => <div key={member.id} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-rose-100"><span className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${member.color} text-2xl text-white shadow-md`}>{member.emoji}</span><div><p className="font-bold text-slate-950">{member.name}</p><p className="text-xs text-slate-500">{member.relation}</p></div></div>)}</div></Panel></section>;
}

function FamilyEventRow({ event, onRemove, action }: { event: FamilyEvent; onRemove: () => void; action?: ReactNode }) {
  return <article className="flex items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-3"><span className="text-xl">{event.category === 'School' ? '🏫' : event.category === 'Birthday' ? '🎂' : event.category === 'Health' ? '🩺' : event.category === 'Activity' ? '🎭' : '👪'}</span><div className="min-w-0 flex-1"><p className="truncate font-bold text-slate-950">{event.title}</p><p className="text-xs text-slate-500">{event.date} · {event.time || 'Anytime'} · {event.category}</p></div>{action}<button type="button" title="Remove" onClick={onRemove} className="rounded-full px-2 py-1 text-rose-700 hover:bg-white">×</button></article>;
}

function FamilyMemberCard({ member, events, onEdit, onDelete }: { member: FamilyMember; events: FamilyEvent[]; onEdit: () => void; onDelete: () => void }) {
  const nextEvent = events.find((event) => event.title.toLowerCase().includes(member.name.toLowerCase())) || events[0];
  return <article className={`min-h-72 rounded-[28px] bg-gradient-to-br ${member.color} p-5 text-white shadow-[0_10px_0_rgba(190,18,60,0.22),0_20px_36px_rgba(15,23,42,0.18)] transition hover:-translate-y-1`}><div className="flex items-start justify-between gap-3"><span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/20 text-4xl shadow-inner">{member.emoji}</span><div className="flex gap-2"><button type="button" title="Edit" onClick={onEdit} className="rounded-lg bg-white/20 px-2 py-1">✎</button><button type="button" title="Delete" onClick={onDelete} className="rounded-lg bg-white/20 px-2 py-1">🗑</button></div></div><h2 className="mt-5 text-2xl font-black">{member.name}</h2><p className="text-sm text-white/80">{member.relation}</p><dl className="mt-4 space-y-2 text-sm"><div><dt className="text-white/60">Birthday</dt><dd>{member.birthday || '—'}</dd></div><div><dt className="text-white/60">Phone</dt><dd>{member.phone || '—'}</dd></div></dl><span className="mt-4 inline-flex rounded-full bg-white/20 px-3 py-1 text-xs font-bold">{nextEvent ? `Next: ${nextEvent.title}` : 'No event'}</span></article>;
}

function FamilyChildCard({ child, events }: { child: FamilyMember; events: FamilyEvent[] }) {
  const nextEvent = events.find((event) => event.category === 'School' || event.title.toLowerCase().includes(child.name.toLowerCase()));
  return <article className={`rounded-[28px] bg-gradient-to-br ${child.color} p-5 text-white shadow-[0_10px_0_rgba(190,18,60,0.22)]`}><span className="text-4xl">{child.emoji}</span><h2 className="mt-4 text-xl font-black">{child.name}</h2><p className="text-sm text-white/80">{child.grade || 'Grade not set'} · {child.school || 'School not set'}</p><p className="mt-3 text-sm text-white/80">Teacher: {child.teacher || '—'}</p><p className="text-sm text-white/80">Activities: {child.activities || '—'}</p><span className="mt-4 inline-flex rounded-full bg-white/20 px-3 py-1 text-xs font-bold">{nextEvent ? `Next: ${nextEvent.title}` : 'No school event'}</span></article>;
}

function FamilyActivities({ activities, open, onOpen, onSave, onRemove, members }: { activities: FamilyActivity[]; open: boolean; onOpen: (value: boolean) => void; onSave: (activity: FamilyActivity) => void; onRemove: (id: string) => void; members: FamilyMember[] }) {
  const [form, setForm] = useState({ name: '', child: '', day: '', time: '', location: '' });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!form.name.trim()) return; onSave({ id: familyId('act'), ...form, name: form.name.trim() }); setForm({ name: '', child: '', day: '', time: '', location: '' }); onOpen(false); }
  return <Panel title="Extracurricular Activities"><div className="mb-3 flex justify-end"><button type="button" title="Add Activity" onClick={() => onOpen(!open)} className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-bold text-white">＋</button></div>{open ? <form onSubmit={submit} className="mb-4 grid gap-3 md:grid-cols-2"><FamilyInput label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} /><FamilySelect label="Child" value={form.child} options={members.map((item) => item.name)} onChange={(value) => setForm({ ...form, child: value })} /><FamilyInput label="Day" value={form.day} onChange={(value) => setForm({ ...form, day: value })} /><FamilyInput label="Time" value={form.time} onChange={(value) => setForm({ ...form, time: value })} /><FamilyInput label="Location" value={form.location} onChange={(value) => setForm({ ...form, location: value })} /><button className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white">Save Activity</button></form> : null}<div className="space-y-2">{activities.map((activity) => <div key={activity.id} className="flex items-center gap-3 rounded-2xl bg-rose-50 p-3"><span>🎭</span><div className="flex-1"><p className="font-bold text-slate-950">{activity.name}</p><p className="text-xs text-slate-500">{activity.child || 'Family'} · {activity.day} {activity.time} · {activity.location}</p></div><button onClick={() => onRemove(activity.id)} className="text-rose-700">×</button></div>)}</div></Panel>;
}

function FamilyHealth({ records, open, onOpen, onSave, onRemove, members }: { records: FamilyHealthRecord[]; open: boolean; onOpen: (value: boolean) => void; onSave: (record: FamilyHealthRecord) => void; onRemove: (id: string) => void; members: FamilyMember[] }) {
  const [form, setForm] = useState({ member: '', type: 'Doctor', detail: '', date: '' });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!form.detail.trim()) return; onSave({ id: familyId('hlth'), ...form }); setForm({ member: '', type: 'Doctor', detail: '', date: '' }); onOpen(false); }
  return <Panel title="Health Records"><div className="mb-3 flex justify-end"><button type="button" title="Add Record" onClick={() => onOpen(!open)} className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-bold text-white">＋</button></div>{open ? <form onSubmit={submit} className="mb-4 grid gap-3 md:grid-cols-2"><FamilySelect label="Member" value={form.member} options={members.map((item) => item.name)} onChange={(value) => setForm({ ...form, member: value })} /><FamilySelect label="Type" value={form.type} options={['Doctor','Allergy','Medication','Insurance','Other']} onChange={(value) => setForm({ ...form, type: value })} /><FamilyInput label="Detail" value={form.detail} onChange={(value) => setForm({ ...form, detail: value })} /><FamilyInput label="Date" type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} /><button className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white">Save Record</button></form> : null}<div className="space-y-2">{records.map((record) => <div key={record.id} className="flex items-center gap-3 rounded-2xl bg-rose-50 p-3"><span>🩺</span><div className="flex-1"><p className="font-bold text-slate-950">{record.type}: {record.detail}</p><p className="text-xs text-slate-500">{record.member || 'Family'} · {record.date || 'No date'}</p></div><button onClick={() => onRemove(record.id)} className="text-rose-700">×</button></div>)}</div></Panel>;
}

function FamilyFriends({ friends, open, onOpen, onSave, onRemove }: { friends: FamilyFriend[]; open: boolean; onOpen: (value: boolean) => void; onSave: (friend: FamilyFriend) => void; onRemove: (id: string) => void }) {
  const [form, setForm] = useState({ name: '', relation: '', phone: '', notes: '', emoji: '🙂' });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!form.name.trim()) return; onSave({ id: familyId('frnd'), ...form, name: form.name.trim() }); setForm({ name: '', relation: '', phone: '', notes: '', emoji: '🙂' }); onOpen(false); }
  return <Panel title="Friends & Contacts"><div className="mb-3 flex justify-end"><button type="button" title="Add Friend" onClick={() => onOpen(!open)} className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-bold text-white">＋</button></div>{open ? <form onSubmit={submit} className="mb-4 grid gap-3 md:grid-cols-2"><FamilyInput label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} /><FamilyInput label="Relation" value={form.relation} onChange={(value) => setForm({ ...form, relation: value })} /><FamilyInput label="Phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} /><FamilyInput label="Notes" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} /><FamilySelect label="Emoji" value={form.emoji} options={['🙂','🌸','🎓','⚽','🎵','⭐']} onChange={(value) => setForm({ ...form, emoji: value })} /><button className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white">Save Friend</button></form> : null}<div className="space-y-2">{friends.map((friend) => <div key={friend.id} className="flex items-center gap-3 rounded-2xl bg-rose-50 p-3"><span className="text-2xl">{friend.emoji}</span><div className="flex-1"><p className="font-bold text-slate-950">{friend.name}</p><p className="text-xs text-slate-500">{friend.relation} · {friend.notes}</p></div>{friend.phone ? <a href={`tel:${friend.phone}`} className="text-xs font-bold text-rose-700">Call</a> : null}<button onClick={() => onRemove(friend.id)} className="text-rose-700">×</button></div>)}</div></Panel>;
}

function FamilyMemberModal({ member, onClose, onSave }: { member: FamilyMember | null; onClose: () => void; onSave: (member: FamilyMember) => void }) {
  const colors = ['from-rose-500 to-pink-500','from-pink-600 to-fuchsia-500','from-rose-600 to-red-500','from-purple-600 to-pink-500'];
  const [form, setForm] = useState<FamilyMember>(member || { id: familyId('mem'), name: '', relation: '', birthday: '', phone: '', email: '', notes: '', emoji: '🌸', color: colors[0], grade: '', school: '', teacher: '', activities: '' });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!form.name.trim()) return; onSave({ ...form, name: form.name.trim() }); }
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"><form onSubmit={submit} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-black text-slate-950">{member ? 'Edit Member' : 'Add Member'}</h2><p className="text-sm text-slate-500">Sensitive family profile · local storage</p></div><button type="button" onClick={onClose} className="rounded-xl border px-3 py-1">×</button></div><div className="mt-5 grid gap-3 md:grid-cols-2"><FamilySelect label="Emoji avatar" value={form.emoji} options={['🌸','🌿','🧒','👧','👦','👵','👴','🐾','⭐']} onChange={(value) => setForm({ ...form, emoji: value })} /><label className="text-xs font-bold text-slate-700">Card color<div className="mt-2 flex gap-2">{colors.map((color) => <button key={color} type="button" onClick={() => setForm({ ...form, color })} className={`h-9 w-9 rounded-xl bg-gradient-to-br ${color} ${form.color === color ? 'ring-4 ring-rose-200' : ''}`} />)}</div></label><FamilyInput label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} /><FamilyInput label="Relation" value={form.relation} onChange={(value) => setForm({ ...form, relation: value })} /><FamilyInput label="Birthday" type="date" value={form.birthday} onChange={(value) => setForm({ ...form, birthday: value })} /><FamilyInput label="Phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} /><FamilyInput label="Email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} /><FamilyInput label="Grade" value={form.grade || ''} onChange={(value) => setForm({ ...form, grade: value })} /><FamilyInput label="School" value={form.school || ''} onChange={(value) => setForm({ ...form, school: value })} /><FamilyInput label="Teacher" value={form.teacher || ''} onChange={(value) => setForm({ ...form, teacher: value })} /><FamilyInput label="Activities" value={form.activities || ''} onChange={(value) => setForm({ ...form, activities: value })} /><FamilyInput label="Notes" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} /></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl border px-4 py-2 text-sm font-bold">Cancel</button><button className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white">Save</button></div></form></div>;
}

function FamilyEventModal({ onClose, onSave }: { onClose: () => void; onSave: (event: FamilyEvent) => void }) {
  const [form, setForm] = useState({ title: '', date: '', time: '', category: 'Family' as FamilyEvent['category'], notes: '' });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!form.title.trim() || !form.date) return; onSave({ id: familyId('evt'), ...form, title: form.title.trim() }); }
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"><form onSubmit={submit} className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><h2 className="text-xl font-black text-slate-950">Add Family Event</h2><button type="button" onClick={onClose} className="rounded-xl border px-3 py-1">×</button></div><div className="mt-5 grid gap-3"><FamilyInput label="Title" value={form.title} onChange={(value) => setForm({ ...form, title: value })} /><FamilyInput label="Date" type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} /><FamilyInput label="Time" type="time" value={form.time} onChange={(value) => setForm({ ...form, time: value })} /><FamilySelect label="Category" value={form.category} options={['Family','School','Birthday','Health','Activity']} onChange={(value) => setForm({ ...form, category: value as FamilyEvent['category'] })} /><FamilyInput label="Notes" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} /></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl border px-4 py-2 text-sm font-bold">Cancel</button><button className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white">Add Event</button></div></form></div>;
}

function FamilyInput({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="text-xs font-bold text-slate-700">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-xl border border-rose-100 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-rose-400" /></label>;
}
function FamilySelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="text-xs font-bold text-slate-700">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-xl border border-rose-100 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-rose-400"><option value="">Choose…</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}
function FamilyEmpty({ title, body }: { title: string; body: string }) {
  return <section className="col-span-full rounded-[28px] border border-dashed border-rose-200 bg-rose-50 p-8 text-center"><p className="text-3xl">👪</p><h2 className="mt-3 font-black text-slate-950">{title}</h2><p className="mt-1 text-sm text-rose-700">{body}</p></section>;
}
function HealthScreen({ onCreateRecord }: { onCreateRecord: (text: string, source?: string) => void }) {
  return <LifeJourneyScreen title="Health Journey" eyebrow="Appointments, medicine, insurance, wellness" banner="Health records are sensitive. Student-LAD keeps entries local-first and uses them only for reminders, planning, and user-approved summaries." cards={[['Appointments', 0, 'Doctor, dentist, wellness'], ['Medicine', 0, 'Dose reminders'], ['Insurance', 'Local', 'Policy references'], ['Next Check', 'Add', 'Upcoming care task']]} steps={[['🩺','Appointments','Upcoming'], ['💊','Medicine','Upcoming'], ['🛡️','Insurance','Reference'], ['🏃','Wellness','Upcoming'], ['📖','Handbook','Reference']]} actions={['Add doctor appointment','Add medicine reminder','Track gym membership','Add insurance note']} onCreateRecord={onCreateRecord} />;
}
function FinanceScreen({ onCreateRecord }: { onCreateRecord: (text: string, source?: string) => void }) {
  type FinanceTab = 'Overview' | 'Bills' | 'Subscriptions' | 'Memberships' | 'Payments' | 'Reminders' | 'History';
  type Bill = { id: string; provider: string; type: string; amount: number; due: string; paymentMethod: string; status: 'paid' | 'saved' | 'pending' | 'overdue'; reminder: boolean };
  type Subscription = { id: string; service: string; cycle: string; price: number; nextRenewal: string; autoRenew: boolean; usage: 'active' | 'idle'; cancelReminder: boolean };
  const tabs: FinanceTab[] = ['Overview', 'Bills', 'Subscriptions', 'Memberships', 'Payments', 'Reminders', 'History'];
  const [tab, setTab] = useState<FinanceTab>('Overview');
  const today = new Date();
  const bills: Bill[] = [
    { id: 'bill-rent', provider: 'Apartment Rent', type: 'Housing', amount: 1450, due: '2026-07-20', paymentMethod: 'Checking •••• 1120', status: 'pending', reminder: true },
    { id: 'bill-phone', provider: 'Mobile Plan', type: 'Phone', amount: 58, due: '2026-07-18', paymentMethod: 'Visa •••• 4242', status: 'pending', reminder: true },
    { id: 'bill-electric', provider: 'Electricity', type: 'Utility', amount: 92, due: '2026-07-10', paymentMethod: 'Visa •••• 4242', status: 'overdue', reminder: true },
  ];
  const subscriptions: Subscription[] = [
    { id: 'sub-gym', service: 'Campus Gym', cycle: 'Monthly', price: 35, nextRenewal: '2026-07-22', autoRenew: true, usage: 'active', cancelReminder: false },
    { id: 'sub-cloud', service: 'Cloud Storage', cycle: 'Monthly', price: 9.99, nextRenewal: '2026-07-19', autoRenew: true, usage: 'idle', cancelReminder: true },
    { id: 'sub-learning', service: 'Learning Platform', cycle: 'Monthly', price: 19, nextRenewal: '2026-08-02', autoRenew: false, usage: 'active', cancelReminder: true },
  ];
  const inSevenDays = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
  const dueThisWeek = bills.filter((bill) => {
    const due = new Date(`${bill.due}T12:00:00`);
    return due >= new Date(today.getFullYear(), today.getMonth(), today.getDate()) && due <= inSevenDays;
  }).reduce((sum, bill) => sum + bill.amount, 0);
  const monthlyRecurring = subscriptions.reduce((sum, item) => sum + item.price, 0);
  const pendingBills = bills.filter((bill) => bill.status !== 'paid').length;
  const autoRenewals = subscriptions.filter((item) => item.autoRenew).length;

  function daysUntil(date: string) {
    const target = new Date(`${date}T12:00:00`);
    return Math.ceil((target.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
  }
  function financeStatusClasses(status: string) {
    if (status === 'paid' || status === 'saved') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (status === 'overdue') return 'bg-red-100 text-red-800 border-red-200';
    return 'bg-amber-100 text-amber-800 border-amber-200';
  }
  function FinanceStatusBadge({ status }: { status: string }) {
    return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${financeStatusClasses(status)}`}>{status}</span>;
  }
  function BillRow({ bill }: { bill: Bill }) {
    const due = new Date(`${bill.due}T12:00:00`);
    const overdue = due < new Date(today.getFullYear(), today.getMonth(), today.getDate()) && bill.status !== 'paid';
    return <article className={`grid gap-3 rounded-2xl border p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center ${overdue ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-950">{bill.provider}</h3><FinanceStatusBadge status={overdue ? 'overdue' : bill.status} />{bill.reminder ? <Bell className="h-4 w-4 text-emerald-600" aria-label="Reminder set" /> : null}</div>
        <p className="mt-1 text-xs text-slate-500">{bill.type} · {bill.paymentMethod}</p>
      </div>
      <div className="text-left sm:text-right"><p className="text-lg font-black text-slate-950">${bill.amount.toLocaleString()}</p><p className={`text-xs font-semibold ${overdue ? 'text-red-700' : 'text-slate-500'}`}>Due {due.toLocaleDateString()}</p></div>
      <button type="button" onClick={() => onCreateRecord(`Mark bill payment for ${bill.provider} due ${bill.due}`, 'finance_manual_entry')} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-black text-white transition hover:bg-emerald-800" title="Pay or mark paid">Pay</button>
    </article>;
  }
  function SubscriptionRow({ item }: { item: Subscription }) {
    const left = daysUntil(item.nextRenewal);
    return <article className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
      <div className="min-w-0"><h3 className="font-semibold text-slate-950">{item.service}</h3><p className="mt-1 text-xs text-slate-500">{item.cycle} · renews {new Date(`${item.nextRenewal}T12:00:00`).toLocaleDateString()}</p></div>
      <div className="text-left sm:text-right"><p className="text-lg font-black text-slate-950">${item.price.toFixed(item.price % 1 ? 2 : 0)}<span className="text-xs text-slate-500">/mo</span></p><p className={`text-xs font-black ${left <= 7 ? 'text-amber-700' : 'text-slate-500'}`}>{left}d left</p></div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">{item.cancelReminder ? <Bell className="h-4 w-4 text-amber-600" aria-label="Cancel reminder set" /> : null}{item.autoRenew ? <RefreshCw className="h-4 w-4 text-blue-600" aria-label="Auto-renew enabled" /> : null}<span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${item.usage === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{item.usage}</span></div>
    </article>;
  }
  function renderFinanceEmpty(title: string) {
    return <section className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-slate-500"><CreditCard className="mx-auto h-8 w-8 text-slate-400" /><h2 className="mt-3 font-black text-slate-800">{title}</h2><p className="mt-1 text-sm">This section will populate as you add finance records, payment reminders, and renewal history.</p></section>;
  }

  return <main className="mx-auto max-w-5xl space-y-5">
    <section className="rounded-[28px] bg-gradient-to-br from-slate-950 via-zinc-900 to-emerald-950 p-6 text-white shadow-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Finance</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Bills &amp; Subscriptions</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Track payments, renewals, and recurring charges without storing raw card, bank, or payment credentials.</p>
    </section>
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">🔒 Payment-method labels stay local and masked. Full card numbers, routing numbers, passwords, and bank credentials are never stored in Student-LAD context.</section>
    <RecordEntryPanel title="Add finance record" domain="personal" actions={['Add bill reminder','Add subscription','Track renewal','Add payment note']} onCreateRecord={onCreateRecord} />
    <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2" aria-label="Bills and subscriptions tabs">
      {tabs.map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`shrink-0 rounded-xl px-3 py-2 text-sm font-black transition ${tab === item ? 'bg-slate-950 text-white shadow' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950'}`}>{item}</button>)}
    </nav>
    {tab === 'Overview' ? <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <FinanceStat label="Due This Week" value={`$${dueThisWeek.toLocaleString()}`} tone="amber" />
      <FinanceStat label="Monthly Recurring" value={`$${monthlyRecurring.toFixed(2)}`} tone="emerald" />
      <FinanceStat label="Bills Pending" value={String(pendingBills)} tone="red" />
      <FinanceStat label="Auto-Renewals" value={String(autoRenewals)} tone="blue" />
    </section> : null}
    {(tab === 'Overview' || tab === 'Bills') ? <Panel title={tab === 'Bills' ? 'All Bills' : 'Bills Due'}><div className="space-y-3">{bills.map((bill) => <BillRow key={bill.id} bill={bill} />)}</div></Panel> : null}
    {(tab === 'Overview' || tab === 'Subscriptions') ? <Panel title={tab === 'Subscriptions' ? 'All Subscriptions' : 'Subscriptions & Memberships'}><div className="space-y-3">{subscriptions.map((item) => <SubscriptionRow key={item.id} item={item} />)}</div></Panel> : null}
    {['Memberships','Payments','Reminders','History'].includes(tab) ? renderFinanceEmpty(`${tab} will appear here`) : null}
  </main>;
}
function FinanceStat({ label, value, tone }: { label: string; value: string; tone: 'amber' | 'emerald' | 'red' | 'blue' }) {
  const tones = {
    amber: 'from-amber-50 to-orange-50 border-amber-200 text-amber-900',
    emerald: 'from-emerald-50 to-teal-50 border-emerald-200 text-emerald-900',
    red: 'from-red-50 to-rose-50 border-red-200 text-red-900',
    blue: 'from-blue-50 to-sky-50 border-blue-200 text-blue-900',
  };
  return <article className={`rounded-3xl border bg-gradient-to-br p-4 shadow-sm ${tones[tone]}`}><p className="text-xs font-black uppercase tracking-[0.16em] opacity-70">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></article>;
}
function HolidaysScreen() {
  const tabs = ['Productivity', 'Holidays', 'Travel', 'Documents', 'Budgets', 'Reminders', 'AI Usage'] as const;
  type HolidayTab = typeof tabs[number];
  const [activeTab, setActiveTab] = useState<HolidayTab>('Productivity');
  const [profile, setProfile] = useState<'Student' | 'Professional'>('Student');
  const [entries, setEntries] = useState<HolidayTravelEntry[]>(() => readHolidayTravelEntries());
  const today = new Date();
  const year = Math.min(Math.max(today.getFullYear(), CALENDAR_MIN_YEAR), CALENDAR_MAX_YEAR);
  const holidayRows = Array.from(usFederalHolidays(year).entries())
    .map(([key, names]) => ({ key, date: new Date(`${key}T09:00:00`), name: names.join(', ') }))
    .filter((item) => item.date >= new Date(today.getFullYear(), today.getMonth(), today.getDate()))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const nextHoliday = holidayRows[0];
  const upcoming = holidayRows.slice(0, 5);
  const completedThisYear = Math.max(0, 11 - holidayRows.filter((item) => !item.name.includes('observed')).length);
  const trips = entries.filter((item) => item.entry_type === 'Trip');
  const documents = entries.filter((item) => item.entry_type === 'Travel document');
  const reminders = entries.filter((item) => item.entry_type === 'Reminder');
  const planningData = [
    { label: 'Holidays reviewed', value: Math.min(completedThisYear + 3, 11), color: 'bg-emerald-500' },
    { label: 'Travel plans', value: trips.length, color: 'bg-sky-500' },
    { label: 'Documents checked', value: documents.length, color: 'bg-indigo-500' },
    { label: 'Reminder drafts', value: reminders.length, color: 'bg-amber-500' },
  ];

  function saveEntry(entry: HolidayTravelEntry) {
    const next = [...entries, entry].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    setEntries(next);
    writeHolidayTravelEntries(next);
  }

  return <main className="mx-auto max-w-6xl space-y-5">
    <JourneyHeader title="Holidays & Travel" eyebrow="United States holidays, trips, documents, planning" profile={profile} onProfile={setProfile} />
    <JourneyBanner>Holiday and travel entries save immediately to this screen with a unique entry ID. They do not require CEDA approval unless you later choose to convert one into reusable context.</JourneyBanner>
    <JourneyStatusCards cards={[['US Holidays', 11, 'Federal calendar included'], ['Trips', trips.length, 'Saved immediately'], ['Travel Documents', documents.length, 'Local records'], ['Reminders', reminders.length, 'Local screen records']]} />
    <HolidayTabBar tabs={tabs} active={activeTab} onSelect={setActiveTab} />
    {activeTab === 'Productivity' ? <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="US Holidays" value="11" detail="Federal calendar included" />
        <Metric label="Next Holiday" value={nextHoliday ? nextHoliday.name.replace(' National Independence Day', '') : 'Complete'} detail={nextHoliday ? nextHoliday.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `${year} reviewed`} />
        <Metric label="Travel Plans" value={trips.length} detail="Saved immediately" />
        <Metric label="Reminder Drafts" value={reminders.length} detail="Local screen records" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Upcoming US holidays">
          <div className="space-y-3">
            {upcoming.map((item) => {
              const daysAway = Math.max(0, Math.ceil((item.date.getTime() - today.getTime()) / 86_400_000));
              const width = `${Math.max(14, Math.min(100, 100 - daysAway / 4))}%`;
              return <article key={item.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-slate-950">★ {item.name}</h3>
                    <p className="mt-1 text-xs text-slate-500">{item.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">{daysAway}d</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white"><span className="block h-full rounded-full bg-emerald-500" style={{ width }} /></div>
              </article>;
            })}
          </div>
        </Panel>
        <Panel title="Planning summary">
          <div className="space-y-4">
            {planningData.map((item) => <div key={item.label}>
              <div className="flex items-center justify-between text-sm"><span className="font-semibold text-slate-800">{item.label}</span><span className="text-slate-500">{item.value}</span></div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${item.color}`} style={{ width: `${Math.max(6, item.value * 9)}%` }} /></div>
            </div>)}
          </div>
        </Panel>
      </div>
    </> : <HolidayPlaceholder tab={activeTab} />}
    <Panel title="Saved holiday & travel entries">
      <SimpleTable headers={['Entry ID','Type','Name','Date','Location','Status','Updated']} rows={entries.map((item) => [item.entry_id, item.entry_type, item.name, item.date, item.location || '—', item.status, new Date(item.updated_at).toLocaleString()])} />
      {!entries.length ? <p className="mt-3 text-sm text-slate-500">Entries added below appear here immediately and do not require CEDA approval.</p> : null}
    </Panel>
    <HolidayEntryStepper onSave={saveEntry} />
  </main>;
}

function HolidayTabBar<T extends string>({ tabs, active, onSelect }: { tabs: readonly T[]; active: T; onSelect: (tab: T) => void }) {
  return <nav aria-label="Holiday section tabs" className="overflow-x-auto border-b border-slate-200 bg-white/80 pb-0">
    <div role="tablist" className="flex min-w-max gap-5 px-1">
      {tabs.map((tab) => {
        const isActive = active === tab;
        return <button key={tab} type="button" role="tab" aria-selected={isActive} onClick={() => onSelect(tab)} className={`border-b-2 px-1 py-3 text-sm font-semibold transition ${isActive ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'}`}>{tab}</button>;
      })}
    </div>
  </nav>;
}

function HolidayPlaceholder({ tab }: { tab: string }) {
  return <section className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
    <Gift className="h-10 w-10 text-slate-400" />
    <h2 className="mt-4 text-lg font-semibold text-slate-950">{tab} Analytics</h2>
    <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">This section will populate as you add holiday plans, travel records, reminders, budgets, and documents.</p>
  </section>;
}

function HolidayEntryStepper({ onSave }: { onSave: (entry: HolidayTravelEntry) => void }) {
  const [kind, setKind] = useState('');
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [details, setDetails] = useState('');
  const [notice, setNotice] = useState('');
  const steps = [
    { id: 'type', label: '1 Type', ready: true },
    { id: 'name', label: '2 Name', ready: Boolean(kind) },
    { id: 'date', label: '3 Date', ready: Boolean(kind && name) },
    { id: 'where', label: '4 Where', ready: Boolean(kind && name && date) },
    { id: 'details', label: '5 Details', ready: Boolean(kind && name && date && location) },
  ];
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanKind = kind.trim() as HolidayTravelEntry['entry_type'];
    const cleanName = name.trim();
    const cleanLocation = location.trim();
    const cleanDetails = details.trim();
    if (!cleanKind || !cleanName || !date) {
      setNotice('Add type, name, and date before saving.');
      return;
    }
    const now = new Date().toISOString();
    const entry: HolidayTravelEntry = {
      entry_id: createHolidayEntryId(cleanKind, date),
      entry_type: cleanKind,
      name: cleanName,
      date,
      location: cleanLocation,
      details: cleanDetails,
      status: 'active',
      source: 'manual_form',
      created_at: now,
      updated_at: now,
    };
    onSave(entry);
    setKind('');
    setName('');
    setDate('');
    setLocation('');
    setDetails('');
    setNotice(`${entry.entry_id} saved immediately to Holidays & Travel.`);
  }
  return <Panel title="Add holiday or travel record">
    <div className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Holiday entry steps">
      {steps.map((step) => <span key={step.id} className={`min-w-max rounded-full px-3 py-1.5 text-xs font-semibold ${step.ready ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>{step.label}</span>)}
    </div>
    <form onSubmit={submit} className="grid gap-3 lg:grid-cols-5 lg:items-end">
      <label className="text-xs font-semibold text-slate-700">Type<select value={kind} onChange={(event) => setKind(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"><option value="">Choose…</option><option>Holiday</option><option>Trip</option><option>Travel document</option><option>Budget</option><option>Reminder</option></select></label>
      {kind ? <label className="text-xs font-semibold text-slate-700">Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Thanksgiving trip" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" /></label> : null}
      {kind && name ? <label className="text-xs font-semibold text-slate-700">Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" /></label> : null}
      {kind && name && date ? <label className="text-xs font-semibold text-slate-700">Where<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Boston / home / airport" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" /></label> : null}
      {kind && name && date && location ? <label className="text-xs font-semibold text-slate-700">Details<input value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Packing, budget, reminder…" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" /></label> : null}
      <button type="submit" className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950">Save for review</button>
    </form>
    {notice ? <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p> : null}
  </Panel>;
}

function holidayTravelStorageKey() {
  return userStorageKey('student_lad_holiday_travel_entries');
}

function readHolidayTravelEntries(): HolidayTravelEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(holidayTravelStorageKey()) || '[]') as HolidayTravelEntry[];
    return parsed.filter((item) => item.entry_id && item.entry_type && item.name && item.date);
  } catch {
    return [];
  }
}

function writeHolidayTravelEntries(entries: HolidayTravelEntry[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(holidayTravelStorageKey(), JSON.stringify(entries));
}

function createHolidayEntryId(kind: HolidayTravelEntry['entry_type'], date: string) {
  const prefix = kind === 'Trip' ? 'TRP' : kind === 'Travel document' ? 'DOC' : kind === 'Budget' ? 'BDG' : kind === 'Reminder' ? 'REM' : 'HLD';
  const cleanDate = date.replace(/-/g, '') || new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8).toUpperCase() : Math.random().toString(36).slice(2, 10).toUpperCase();
  return `${prefix}-${cleanDate}-${random}`;
}

function LifeJourneyScreen({ title, eyebrow, banner, cards, steps, actions, onCreateRecord }: { title: string; eyebrow: string; banner: string; cards: Array<[string, string | number, string]>; steps: Array<[string, string, string]>; actions: string[]; onCreateRecord: (text: string, source?: string) => void }) {
  const [profile, setProfile] = useState<'Student' | 'Professional'>('Student');
  const [view, setView] = useState<'Journey' | 'Timeline' | 'Handbook'>('Journey');
  const [selected, setSelected] = useState(0);
  const current = steps[selected] || steps[0];
  const completed = steps.filter(([, , status]) => /complete|ready/i.test(status)).length;
  const progress = Math.round((completed / Math.max(steps.length, 1)) * 100);
  return <main className="mx-auto max-w-6xl space-y-5">
    <JourneyHeader title={title} eyebrow={eyebrow} profile={profile} onProfile={setProfile} />
    <JourneyBanner>{banner}</JourneyBanner>
    <JourneyStatusCards cards={cards} />
    {profile === 'Student' ? <section title="Professional path is available for advanced planning." className="rounded-[24px] border border-dashed border-violet-300 bg-violet-50 p-3 text-sm font-semibold text-violet-900">🔒 Professional path</section> : null}
    <JourneyViewControls view={view} onView={setView} completed={completed} total={steps.length} progress={progress} />
    {view === 'Journey' ? <>
      <JourneyStepSelector steps={steps} selected={selected} onSelect={setSelected} />
      <section className="grid gap-5 lg:grid-cols-[1fr_.85fr]">
        <Panel title={`${current?.[1] || title} Detail`}>
          <div className="rounded-[28px] bg-gradient-to-br from-slate-950 to-emerald-900 p-5 text-white shadow-xl">
            <p className="text-4xl">{current?.[0]}</p>
            <h2 className="mt-3 text-2xl font-semibold">{current?.[1]}</h2>
            <p className="mt-2 text-sm text-slate-300" title="Use this area to add structured entries, reminders, notes, and source references.">Status: {current?.[2]}</p>
            <span title="Policy-aware and local-first" className="mt-4 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-white/20">🛡️ Local</span>
          </div>
          <div title="Use short, specific records like appointment date, renewal date, or reminder note." className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">💡 Short entries work best</div>
        </Panel>
        <Panel title="Checklist">
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} /></div>
          <div className="space-y-2">{['Add source', 'Confirm date', 'Create reminder', 'Review privacy'].map((item, index) => <label key={item} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"><input type="checkbox" defaultChecked={index < completed} className="h-4 w-4 accent-emerald-600" />{item}</label>)}</div>
          <div className="mt-4 flex flex-wrap gap-2"><IconTextButton icon="⏰" label="Reminder">Set Reminder</IconTextButton><IconTextButton icon="🔗" label="Sources" onClick={() => setView('Handbook')}>Official Sources</IconTextButton></div>
        </Panel>
      </section>
      <RecordEntryPanel title={`Upload / Add ${title.replace(' Journey', '')}`} domain="personal" actions={actions} onCreateRecord={onCreateRecord} />
    </> : null}
    {view === 'Timeline' ? <JourneyTimeline steps={steps} /> : null}
    {view === 'Handbook' ? <JourneyHandbook title={title} /> : null}
  </main>;
}

function JourneyHeader({ title, eyebrow, profile, onProfile }: { title: string; eyebrow: string; profile: 'Student' | 'Professional'; onProfile: (profile: 'Student' | 'Professional') => void }) {
  return <section className="flex flex-col gap-4 rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-6 text-white shadow-xl md:flex-row md:items-start md:justify-between">
    <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">{eyebrow}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1></div>
    <div className="inline-flex rounded-2xl border border-white/15 bg-white/10 p-1">
      {(['Student','Professional'] as const).map((item) => <button key={item} type="button" title={`${item} profile`} onClick={() => onProfile(item)} className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${profile === item ? 'bg-emerald-300 text-slate-950' : 'text-white hover:bg-white/10'}`}>{item === 'Student' ? '🎓' : '💼'} {item}</button>)}
    </div>
  </section>;
}

function JourneyBanner({ children }: { children: ReactNode }) {
  return <section title={typeof children === 'string' ? children : undefined} className="rounded-[22px] border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">⚠️ {children}</section>;
}

function JourneyStatusCards({ cards }: { cards: Array<[string, string | number, string]> }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value, detail], index) => <article key={label} title={detail} className={`rounded-[24px] bg-gradient-to-br p-5 text-white transition hover:-translate-y-1 ${index % 4 === 0 ? threeDTabToneClasses.system : index % 4 === 1 ? threeDTabToneClasses.academic : index % 4 === 2 ? threeDTabToneClasses.travel : threeDTabToneClasses.personal}`}><p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/75">{label}</p><p className="mt-3 text-2xl font-bold">{value}</p></article>)}</div>;
}

function JourneyViewControls({ view, onView, completed, total, progress }: { view: 'Journey' | 'Timeline' | 'Handbook'; onView: (view: 'Journey' | 'Timeline' | 'Handbook') => void; completed: number; total: number; progress: number }) {
  const icon = { Journey: '🧭', Timeline: '🕘', Handbook: '📖' } as const;
  return <section className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div className="flex flex-wrap gap-2">{(['Journey','Timeline','Handbook'] as const).map((item) => <button key={item} type="button" title={item} onClick={() => onView(item)} className={`rounded-full px-4 py-2 text-sm font-semibold ${view === item ? 'bg-emerald-500 text-slate-950' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{icon[item]} <span className="sr-only">{item}</span><span className="hidden sm:inline">{item}</span></button>)}</div><div className="min-w-52" title={`${completed}/${total} milestones`}><p className="text-xs font-semibold text-slate-500">● {completed}/{total}</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} /></div></div></div></section>;
}

function JourneyStepSelector({ steps, selected, onSelect }: { steps: Array<[string, string, string]>; selected: number; onSelect: (index: number) => void }) {
  return <nav aria-label="Journey milestone selector" className="overflow-x-auto rounded-[28px] border border-white/70 bg-white/85 p-3 shadow-[0_18px_40px_rgba(15,23,42,0.10)]"><div className="flex min-w-max gap-3">{steps.map(([icon, label, status], index) => <button key={label} type="button" title={`${label}: ${status}`} onClick={() => onSelect(index)} className={`relative min-w-[8rem] rounded-2xl bg-gradient-to-br px-4 py-3 text-left text-white transition ${selected === index ? `${threeDTabToneClasses.system} -translate-y-1` : `${threeDTabToneClasses.personal} opacity-85 hover:-translate-y-0.5`}`}><span className="text-2xl">{icon}</span><span className="mt-2 block text-sm font-bold">{label}</span>{/attention|required/i.test(status) ? <span className="absolute right-2 top-2 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white" /> : null}</button>)}</div></nav>;
}

function JourneyTimeline({ steps }: { steps: Array<[string, string, string]> }) {
  return <Panel title="Timeline">{steps.map(([icon, label, status], index) => <article key={label} className="relative ml-4 border-l border-emerald-200 pb-4 pl-6 last:pb-0"><span className="absolute -left-3 top-0 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-xs text-white">{index + 1}</span><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><h3 className="font-semibold text-slate-950">{icon} {label}</h3><p className="mt-1 text-sm text-slate-600">{status} · Target date appears when a record or reminder is added.</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-white"><span className="block h-full w-1/3 rounded-full bg-emerald-500" /></div></div></article>)}</Panel>;
}

function JourneyHandbook({ title }: { title: string }) {
  return <Panel title={`${title} Handbook`}><div className="grid gap-3 md:grid-cols-2">{['🔗 Official sources','⭐ Personal links','📄 Templates','🛡️ Safety rules'].map((item) => <button key={item} type="button" title="Add and review trusted links or workflow notes." className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 text-left font-semibold text-slate-950 hover:border-emerald-300">{item}</button>)}</div></Panel>;
}
function ConnectorsScreen() {
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <JourneyHeader title="Connectors" eyebrow="System" profile="Student" onProfile={() => undefined} />
      <JourneyBanner>Manage Google, Microsoft, Apple, AI, publishing, email, calendar, and storage connections here without leaving Student-LAD.</JourneyBanner>
      <SharedConnectorCenter className="min-h-[680px]" />
    </main>
  );
}

type AnalyticsTab = 'Productivity' | 'Academic' | 'Time' | 'Tasks' | 'Habits' | 'Knowledge' | 'AI Usage';
type ChartDatum = Record<string, string | number>;

const analyticsTabs: AnalyticsTab[] = ['Productivity', 'Academic', 'Time', 'Tasks', 'Habits', 'Knowledge', 'AI Usage'];
const taskData: ChartDatum[] = [
  { label: 'W1', completed: 9, overdue: 2 },
  { label: 'W2', completed: 12, overdue: 3 },
  { label: 'W3', completed: 10, overdue: 1 },
  { label: 'W4', completed: 14, overdue: 2 },
];
const aiUsageData: ChartDatum[] = [
  { label: 'Mon', local: 3, cloud: 0 },
  { label: 'Tue', local: 2, cloud: 1 },
  { label: 'Wed', local: 5, cloud: 0 },
  { label: 'Thu', local: 4, cloud: 0 },
  { label: 'Fri', local: 3, cloud: 1 },
  { label: 'Sat', local: 2, cloud: 0 },
  { label: 'Sun', local: 1, cloud: 0 },
];
const studyData: ChartDatum[] = [
  { label: 'Mon', hours: 2.5 },
  { label: 'Tue', hours: 1.5 },
  { label: 'Wed', hours: 3.25 },
  { label: 'Thu', hours: 2 },
  { label: 'Fri', hours: 1 },
  { label: 'Sat', hours: 4 },
  { label: 'Sun', hours: 2.75 },
];

function AnalyticsScreen({ dashboard, health }: { dashboard?: Dashboard; health?: ContextHealth }) {
  const [tab, setTab] = useState<AnalyticsTab>('Productivity');
  const completedThisWeek = Number(taskData[taskData.length - 1].completed || 0);
  const overdueNow = Number(taskData[taskData.length - 1].overdue || 0);
  const focusHours = studyData.reduce((total, item) => total + Number(item.hours || 0), 0);
  const localAi = aiUsageData.reduce((total, item) => total + Number(item.local || 0), 0);
  const cloudAi = aiUsageData.reduce((total, item) => total + Number(item.cloud || 0), 0);

  return <main className="mx-auto max-w-6xl space-y-5 pb-24">
    <header className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Analytics & Insights</p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-950">Your personal productivity and learning data.</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Stats are designed to compute locally from tasks, calendar blocks, CEDA records, and AI execution events. Today this screen uses static local arrays as the frontend contract for future live data.</p>
    </header>

    <nav aria-label="Analytics tabs" className="overflow-x-auto rounded-2xl border border-slate-200 bg-white px-2 shadow-sm">
      <div className="flex min-w-max gap-1 py-2">
        {analyticsTabs.map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === item ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>{item}</button>)}
      </div>
    </nav>

    {tab === 'Productivity' ? <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsStatCard label="Tasks Completed" value={completedThisWeek} detail="week" delta="+2 vs last week" />
        <AnalyticsStatCard label="Focus Hours" value={focusHours.toFixed(1)} detail="week" delta="+3.5 vs last week" />
        <AnalyticsStatCard label="Overdue Tasks" value={overdueNow} detail="current" delta="-1 vs last week" />
        <AnalyticsStatCard label="AI-Assisted Tasks" value={localAi + cloudAi} detail="week" delta={`Local: ${localAi}, Cloud: ${cloudAi}`} />
      </div>
      <AnalyticsSectionCard title="Tasks Completed vs Overdue" subtitle="Source: local task store and due-date status.">
        <GroupedBarChart data={taskData} series={[{ key: 'completed', label: 'Completed', color: '#10b981' }, { key: 'overdue', label: 'Overdue', color: '#f59e0b' }]} />
      </AnalyticsSectionCard>
      <AnalyticsSectionCard title="AI Usage — Local vs Cloud" subtitle="Lower cloud = more private.">
        <GroupedBarChart data={aiUsageData} series={[{ key: 'local', label: 'Local', color: '#4f46e5' }, { key: 'cloud', label: 'Cloud', color: '#7dd3fc' }]} />
      </AnalyticsSectionCard>
    </div> : null}

    {tab === 'Academic' ? <AnalyticsSectionCard title="Study Hours" subtitle="Source: local calendar and focus blocks.">
      <GroupedBarChart data={studyData} series={[{ key: 'hours', label: 'Hours', color: '#2563eb' }]} yAxisLabel="hours" />
    </AnalyticsSectionCard> : null}

    {tab !== 'Productivity' && tab !== 'Academic' ? <AnalyticsPlaceholder tab={tab} /> : null}

    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">Notifications contract</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Mini label="Threshold alerts" value="Settings-gated" />
        <Mini label="Week-in-review" value="Digest ready" />
        <Mini label="Duplicate noise" value="Tasks/My Day only" />
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">Analytics counts overdue work, focus trends, cloud usage, and knowledge growth. It should not duplicate each task alert; reminders remain owned by My Day and Tasks.</p>
      <p className="mt-2 text-xs text-slate-500">Health: {health?.score ?? 0}% · Privacy risk: {dashboard?.privacy_risk_score ?? 0}%</p>
    </section>
  </main>;
}

function AnalyticsStatCard({ label, value, detail, delta }: { label: string; value: string | number; detail: string; delta: string }) {
  return <article className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
    <div className="mt-3 flex items-end justify-between gap-3">
      <p className="text-3xl font-bold text-slate-950">{value}</p>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{detail}</span>
    </div>
    <p className="mt-3 text-xs font-semibold text-emerald-700">{delta}</p>
  </article>;
}

function AnalyticsSectionCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
    </div>
    <div className="mt-5">{children}</div>
  </section>;
}

function GroupedBarChart({ data, series, yAxisLabel }: { data: ChartDatum[]; series: Array<{ key: string; label: string; color: string }>; yAxisLabel?: string }) {
  const width = 920;
  const height = 300;
  const padding = { top: 20, right: 24, bottom: 46, left: yAxisLabel ? 64 : 44 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...data.flatMap((item) => series.map((entry) => Number(item[entry.key] || 0))));
  const groupWidth = chartWidth / data.length;
  const barGap = 6;
  const barWidth = Math.max(12, (groupWidth - 24 - barGap * (series.length - 1)) / series.length);
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return <div className="overflow-x-auto">
    <svg role="img" aria-label="Analytics bar chart" viewBox={`0 0 ${width} ${height}`} className="min-w-[720px] w-full">
      <rect x="0" y="0" width={width} height={height} rx="18" fill="#f8fafc" />
      {ticks.map((tick) => {
        const y = padding.top + chartHeight - chartHeight * tick;
        return <g key={tick}><line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 6" /><text x={padding.left - 10} y={y + 4} textAnchor="end" fontSize="11" fill="#64748b">{Math.round(maxValue * tick)}</text></g>;
      })}
      {yAxisLabel ? <text x="18" y={padding.top + chartHeight / 2} textAnchor="middle" fontSize="12" fill="#64748b" transform={`rotate(-90 18 ${padding.top + chartHeight / 2})`}>{yAxisLabel}</text> : null}
      {data.map((item, itemIndex) => {
        const groupX = padding.left + itemIndex * groupWidth + 14;
        return <g key={String(item.label)}>
          {series.map((entry, seriesIndex) => {
            const value = Number(item[entry.key] || 0);
            const barHeight = chartHeight * (value / maxValue);
            const x = groupX + seriesIndex * (barWidth + barGap);
            const y = padding.top + chartHeight - barHeight;
            return <g key={entry.key}><rect x={x} y={y} width={barWidth} height={barHeight} rx="5" fill={entry.color}><title>{`${item.label}: ${entry.label} ${value}`}</title></rect></g>;
          })}
          <text x={groupX + (series.length * barWidth + (series.length - 1) * barGap) / 2} y={height - 18} textAnchor="middle" fontSize="12" fill="#475569">{String(item.label)}</text>
        </g>;
      })}
    </svg>
    <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold text-slate-600">
      {series.map((entry) => <span key={entry.key} className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ backgroundColor: entry.color }} />{entry.label}</span>)}
    </div>
  </div>;
}

function AnalyticsPlaceholder({ tab }: { tab: AnalyticsTab }) {
  return <section className="rounded-[24px] border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><BarChart2 size={28} /></div>
    <h2 className="mt-4 text-xl font-semibold text-slate-950">{tab} Analytics</h2>
    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Analytics for {tab} will be populated as you use Student-LAD. Local activity, approved context, task events, and execution-mode counters will feed this section over time.</p>
  </section>;
}
type PolicyLevel = 'ask_every_time' | 'allow_locally' | 'allow_with_confirmation' | 'never_allow';
type PolicyOption = { value: PolicyLevel; label: string; className: string; selectClassName: string };
type PolicyDefinition = { id: string; name: string; description: string; defaultLevel: PolicyLevel; backendCategory?: string; backendSaveValue?: string };
type PolicyGroup = { title: string; description: string; policies: PolicyDefinition[] };

const POLICY_OPTIONS: PolicyOption[] = [
  { value: 'ask_every_time', label: 'Ask every time', className: 'border-amber-200 bg-amber-50 text-amber-800', selectClassName: 'border-amber-300 bg-amber-50 text-amber-900' },
  { value: 'allow_locally', label: 'Always allow locally', className: 'border-emerald-200 bg-emerald-50 text-emerald-800', selectClassName: 'border-emerald-300 bg-emerald-50 text-emerald-900' },
  { value: 'allow_with_confirmation', label: 'Allow with confirmation', className: 'border-blue-200 bg-blue-50 text-blue-800', selectClassName: 'border-blue-300 bg-blue-50 text-blue-900' },
  { value: 'never_allow', label: 'Never allow', className: 'border-red-200 bg-red-50 text-red-800', selectClassName: 'border-red-300 bg-red-50 text-red-900' },
];

const policyGroups: PolicyGroup[] = [
  { title: 'Cloud Processing', description: 'Control cloud AI processing and live web retrieval.', policies: [
    { id: 'cloud-ai-processing', name: 'Cloud AI processing', description: 'Use cloud models only when local models are insufficient or explicitly selected.', defaultLevel: 'allow_with_confirmation' },
    { id: 'live-web-retrieval', name: 'Live web retrieval', description: 'Retrieve current web information for answers that need live sources.', defaultLevel: 'ask_every_time' },
  ] },
  { title: 'Calendar Actions', description: 'Control event creation, modification, and deletion.', policies: [
    { id: 'calendar-create', name: 'Create calendar events', description: 'Allow Kamal and DorjeAI to create reminders, deadlines, and study blocks.', defaultLevel: 'allow_with_confirmation' },
    { id: 'calendar-modify', name: 'Modify calendar events', description: 'Change event time, title, notes, or reminder settings.', defaultLevel: 'ask_every_time' },
    { id: 'calendar-delete', name: 'Delete calendar events', description: 'Remove events or reminders from the local or connected calendar.', defaultLevel: 'never_allow' },
  ] },
  { title: 'Email Actions', description: 'Separate safe drafting from external sending.', policies: [
    { id: 'email-draft', name: 'Draft email', description: 'Prepare emails locally using approved context and user style.', defaultLevel: 'allow_locally' },
    { id: 'email-send', name: 'Send email', description: 'Send or schedule email through Gmail, Outlook, Apple Mail, or another connector.', defaultLevel: 'ask_every_time' },
  ] },
  { title: 'Sensitive Information', description: 'Protect identity, immigration, health, and financial details.', policies: [
    { id: 'store-passport-visa', name: 'Store passport / visa numbers', description: 'Save masked immigration identifiers as structured context.', defaultLevel: 'ask_every_time', backendCategory: 'immigration', backendSaveValue: 'ask_first' },
    { id: 'store-medical', name: 'Store medical information', description: 'Save health notes, medicine, appointments, or insurance details.', defaultLevel: 'ask_every_time', backendCategory: 'health', backendSaveValue: 'ask_first' },
    { id: 'store-financial', name: 'Store financial details', description: 'Save bills, financial reminders, accounts, or payment notes.', defaultLevel: 'ask_every_time', backendCategory: 'finance', backendSaveValue: 'ask_first' },
  ] },
  { title: 'Data Retention', description: 'Control chat retention and automatic archiving.', policies: [
    { id: 'chat-history-retention', name: 'Chat history retention', description: 'Keep raw conversations only for the configured tier window; store distilled context separately.', defaultLevel: 'allow_with_confirmation' },
    { id: 'auto-archive-old-chats', name: 'Auto-archive old chats', description: 'Archive older conversations while keeping approved CEDA context available.', defaultLevel: 'allow_locally' },
    { id: 'academic-context-save', name: 'Save academic context', description: 'Save assignments, exams, course notes, and academic deadlines after review.', defaultLevel: 'ask_every_time', backendCategory: 'academic', backendSaveValue: 'ask_first' },
  ] },
];

function PoliciesScreen({ policies, piePolicies, pieDecisions, onUpdateSavePolicy }: { policies: Record<string, Record<string, unknown>>; piePolicies: PIEPolicy[]; pieDecisions: PIEDecision[]; onUpdateSavePolicy: (category: string, save: string) => void }) {
  return <main className="mx-auto max-w-4xl space-y-5 pb-24">
    <header className="rounded-[28px] border border-emerald-100 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"><ShieldCheck size={24} /></span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Policies & Permissions</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Control what Dorje AI is allowed to do on your behalf.</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">These rules guide Kamal, Workspace AI, CEDA, connectors, calendars, email, cloud models, and retention. Sensitive actions stay permission-first and auditable.</p>
        </div>
      </div>
    </header>

    {policyGroups.map((group) => <PolicySectionCard key={group.title} group={group} policies={policies} onUpdateSavePolicy={onUpdateSavePolicy} />)}

    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Recent permission decisions</h2>
          <p className="text-sm text-slate-500">Live PIE decisions from the backend audit path.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{pieDecisions.length} recorded</span>
      </div>
      <div className="mt-4">
        <SimpleTable headers={['Action','Decision','Reason','Time']} rows={(pieDecisions.length ? pieDecisions : [{ action:'Information retrieval', outcome:'allow', explanation:'Approved active information only', created_at:new Date().toISOString() } as PIEDecision]).slice(0, 6).map((d) => [d.action, d.outcome, d.explanation, new Date(d.created_at).toLocaleString()])} />
      </div>
    </section>

    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">Policy templates</h2>
      <p className="mt-1 text-sm text-slate-600">{piePolicies.length ? `${piePolicies.length} user-owned templates are available for versioned governance.` : 'Default Student-LAD templates are active. New custom templates will appear here after creation.'}</p>
    </section>
  </main>;
}

function PolicySectionCard({ group, policies, onUpdateSavePolicy }: { group: PolicyGroup; policies: Record<string, Record<string, unknown>>; onUpdateSavePolicy: (category: string, save: string) => void }) {
  return <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-4">
      <h2 className="text-lg font-semibold text-slate-950">{group.title}</h2>
      <p className="mt-1 text-sm text-slate-500">{group.description}</p>
    </div>
    <div className="divide-y divide-slate-100">
      {group.policies.map((policy) => <PolicyRow key={policy.id} policy={policy} policies={policies} onUpdateSavePolicy={onUpdateSavePolicy} />)}
    </div>
  </section>;
}

function derivePolicyLevel(policy: PolicyDefinition, policies: Record<string, Record<string, unknown>>): PolicyLevel {
  if (!policy.backendCategory) return policy.defaultLevel;
  const backendSave = String(policies[policy.backendCategory]?.save || 'ask_first');
  if (backendSave === 'always') return 'allow_locally';
  if (backendSave === 'never') return 'never_allow';
  return 'ask_every_time';
}

function levelToBackendSave(level: PolicyLevel): string {
  if (level === 'allow_locally') return 'always';
  if (level === 'never_allow') return 'never';
  return 'ask_first';
}

function PolicyRow({ policy, policies, onUpdateSavePolicy }: { policy: PolicyDefinition; policies: Record<string, Record<string, unknown>>; onUpdateSavePolicy: (category: string, save: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [setting, setSetting] = useState<PolicyLevel>(() => derivePolicyLevel(policy, policies));
  const option = POLICY_OPTIONS.find((item) => item.value === setting) || POLICY_OPTIONS[0];
  const commit = (value: PolicyLevel) => {
    setSetting(value);
    setEditing(false);
    if (policy.backendCategory) onUpdateSavePolicy(policy.backendCategory, levelToBackendSave(value));
  };

  return <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <h3 className="text-sm font-semibold text-slate-950">{policy.name}</h3>
      <p className="mt-1 text-sm leading-5 text-slate-500">{policy.description}</p>
      {policy.backendCategory ? <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">PIE/CEDA mapped · {policy.backendCategory}</p> : null}
    </div>
    <div className="flex shrink-0 items-center gap-2">
      {editing ? <select autoFocus aria-label={`Set ${policy.name}`} value={setting} onChange={(event) => commit(event.target.value as PolicyLevel)} onBlur={() => setEditing(false)} className={`rounded-full border px-3 py-2 text-xs font-semibold outline-none ${option.selectClassName}`}>{POLICY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select> : <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${option.className}`}>{option.label}</span>}
      <button type="button" title={`Edit ${policy.name}`} aria-label={`Edit ${policy.name}`} onClick={() => setEditing(true)} className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 shadow-sm hover:border-emerald-200 hover:text-emerald-700"><Pencil size={15} /></button>
    </div>
  </div>;
}
type SettingOption<T extends string> = { value: T; title: string; description?: string; visual?: ReactNode; className?: string };
const mockUser = {
  name: 'Student',
  email: 'Not set',
  institution: 'Student-LAD Workspace',
  activeSemester: 'Fall 2026',
  timezone: 'America/New_York',
};

function SettingsScreen({}: { policies: Record<string, Record<string, unknown>>; piePolicies: PIEPolicy[]; pieDecisions: PIEDecision[]; deviceProfile: DeviceProfileSettings; historyPolicy: HistoryPolicySettings; orchestrationPolicy: OrchestrationPolicySettings; onUpdateDeviceProfile: (changes: Partial<DeviceProfileSettings>) => void; onUpdateSavePolicy: (category: string, save: string) => void }) {
  const user = getUser();
  const { theme, mode, uiTheme, kamalAvatar, voice, accentColor, background, performanceProfile, notifications, setTheme, setMode, setUiTheme, setKamalAvatar, setVoice, setAccentColor, setBackground, setPerformanceProfile, setNotifications } = useStudentStore();
  const [settingsNotice, setSettingsNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    void apiFetch<{ preferences: Partial<{ theme: StudentTheme; mode: StudentExecutionMode; uiTheme: StudentUiTheme; kamalAvatar: KamalAvatar; voice: LocalVoice; accentColor: AccentColor; background: AppBackground; performanceProfile: PerformanceProfile; notifications: NotificationPreferences }> }>('/api/v1/settings/app-preferences')
      .then(({ preferences }) => {
        if (cancelled) return;
        const prefs = preferences || {};
        if (prefs.theme) setTheme(prefs.theme);
        if (prefs.mode) setMode(prefs.mode);
        if (prefs.uiTheme) setUiTheme(prefs.uiTheme);
        if (prefs.kamalAvatar) setKamalAvatar(prefs.kamalAvatar);
        if (prefs.voice) setVoice(prefs.voice);
        if (prefs.accentColor) setAccentColor(prefs.accentColor);
        if (prefs.background) setBackground(prefs.background);
        if (prefs.performanceProfile) setPerformanceProfile(prefs.performanceProfile);
        if (prefs.notifications) setNotifications(prefs.notifications);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  // Hydrate once from the backend. Store setter functions are recreated by the lightweight external store wrapper.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function persistPreference(preferences: Record<string, unknown>) {
    try {
      await apiFetch('/api/v1/settings/app-preferences', { method: 'PUT', body: JSON.stringify({ preferences }) });
      setSettingsNotice('Saved.');
      window.setTimeout(() => setSettingsNotice(''), 1800);
    } catch {
      setSettingsNotice('Saved locally. Backend sync will retry when available.');
    }
  }

  function choose<T>(setter: (value: T) => void, key: string) {
    return (value: T) => {
      setter(value);
      void persistPreference({ [key]: value });
    };
  }

  const displayUser = {
    ...mockUser,
    name: user?.name || user?.full_name || user?.email?.split('@')[0] || mockUser.name,
    email: user?.email || mockUser.email,
  };
  const profileHint = performanceProfile === 'Lightweight' ? 'Best for 8GB RAM downloads and older laptops.' : performanceProfile === 'High' ? 'Best for 32GB RAM desktops and advanced local workloads.' : 'Recommended for 16GB RAM laptops.';
  const backgroundClass = ({ 'Warm White': 'bg-[#fffaf2]', Mist: 'bg-[#eef6ff]', Ivory: 'bg-[#fffff0]', Slate: 'bg-[#e2e8f0]', Mint: 'bg-[#ecfdf5]', Sand: 'bg-[#fef3c7]' } as Record<AppBackground, string>)[background];
  const accentPreview = ({ Emerald: 'from-emerald-500 to-teal-600', Indigo: 'from-indigo-500 to-blue-700', Rose: 'from-rose-400 to-pink-600', Amber: 'from-amber-400 to-orange-500', Sky: 'from-sky-400 to-cyan-600', Violet: 'from-violet-500 to-fuchsia-600' } as Record<AccentColor, string>)[accentColor];

  return <main className={`mx-auto max-w-3xl space-y-5 rounded-[2rem] p-3 pb-24 ${backgroundClass}`}>
    <header className={`rounded-[28px] border border-slate-200 bg-gradient-to-br ${accentPreview} p-5 text-white shadow-sm`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">Student-LAD Settings</p>
      <h1 className="mt-2 text-3xl font-semibold">Settings</h1>
      <p className="mt-2 text-sm leading-6 text-white/85">Configure your account, personalization, security, notifications, and local runtime profile. These choices are saved per user.</p>
      {settingsNotice ? <p className="mt-3 inline-flex rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white">{settingsNotice}</p> : null}
    </header>

    <SectionCard title="Account">
      <div className="divide-y divide-slate-100">
        <ReadOnlyRow label="Name" value={displayUser.name} />
        <ReadOnlyRow label="Email" value={displayUser.email} />
        <ReadOnlyRow label="Institution" value={displayUser.institution} />
        <ReadOnlyRow label="Active semester" value={displayUser.activeSemester} />
        <ReadOnlyRow label="Timezone" value={displayUser.timezone} />
      </div>
    </SectionCard>

    <PersonalizationSettings kamalAvatar={kamalAvatar} onKamalAvatar={choose(setKamalAvatar, 'kamalAvatar')} voice={voice} onVoice={choose(setVoice, 'voice')} accentColor={accentColor} onAccentColor={choose(setAccentColor, 'accentColor')} uiTheme={uiTheme} onUiTheme={choose(setUiTheme, 'uiTheme')} background={background} onBackground={choose(setBackground, 'background')} theme={theme} onTheme={choose(setTheme, 'theme')} />

    <SectionCard title="AI & Execution">
      <div className="space-y-5">
        <SettingRow label="Execution Mode" description="Offline works locally, Hybrid asks before connectors/cloud, Cloud allows online services when approved.">
          <SegmentedControl value={mode} options={['Offline', 'Hybrid', 'Cloud']} onChange={(value) => choose(setMode, 'mode')(value as StudentExecutionMode)} />
        </SettingRow>
        <SettingRow label="Performance Profile" description={profileHint}>
          <SegmentedControl value={performanceProfile} options={['Lightweight', 'Standard', 'High']} onChange={(value) => choose(setPerformanceProfile, 'performanceProfile')(value as PerformanceProfile)} />
        </SettingRow>
        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
          <Mini label="8GB RAM" value="Lightweight" />
          <Mini label="16GB RAM" value="Standard" />
          <Mini label="32GB RAM" value="High" />
        </div>
      </div>
    </SectionCard>

    <DesktopCaptureSettings />

    <SectionCard title="Notifications">
      <div className="space-y-3">
        <SettingRow label="In-app notifications" description="Show reminders and status messages inside Student-LAD."><Toggle checked={notifications.inApp} onChange={(checked) => { const next = { ...notifications, inApp: checked }; setNotifications(next); void persistPreference({ notifications: next }); }} /></SettingRow>
        <SettingRow label="Desktop notifications" description="Use OS notifications when the downloadable app is running."><Toggle checked={notifications.desktop} onChange={(checked) => { const next = { ...notifications, desktop: checked }; setNotifications(next); void persistPreference({ notifications: next }); }} /></SettingRow>
        <SettingRow label="Email reminders" description="Send reminders through a connected email account after authorization."><Toggle checked={notifications.email} onChange={(checked) => { const next = { ...notifications, email: checked }; setNotifications(next); void persistPreference({ notifications: next }); }} /></SettingRow>
        <SettingRow label="Calendar reminders" description="Create reminder events through local or connected calendars."><Toggle checked={notifications.calendar} onChange={(checked) => { const next = { ...notifications, calendar: checked }; setNotifications(next); void persistPreference({ notifications: next }); }} /></SettingRow>
      </div>
    </SectionCard>

    <SectionCard title="Security">
      <div className="space-y-3">
        <ReadOnlyRow label="Local data" value="Encrypted local-first workspace" />
        <ReadOnlyRow label="Sensitive memory" value="Ask before saving" />
        <ReadOnlyRow label="Cloud processing" value="Requires explicit approval" />
        <ReadOnlyRow label="Active session" value="Current browser / local app" />
        <ChangePasswordForm />
        <button type="button" className="mt-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 transition hover:bg-rose-100">Sign out all</button>
      </div>
    </SectionCard>

    <SectionCard title="Advanced">
      <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-950">Show local model diagnostics</summary>
        <div className="mt-4 space-y-3">
          <ReadOnlyRow label="Model ready" value="Qwen / DeepSeek local routing" />
          <ReadOnlyRow label="Index size" value="Local knowledge index, profile based" />
          <ReadOnlyRow label="Server port" value="Backend 8100 · Frontend 3100" />
          <ReadOnlyRow label="Last diagnostic" value="Run diagnostics to refresh" />
          <div className="flex flex-wrap gap-2 pt-2"><Button>Run Diagnostics</Button><Button>View Logs</Button></div>
        </div>
      </details>
    </SectionCard>
  </main>;
}

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    setError('');
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const result = await apiFetch<{ message?: string }>('/api/v1/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      setNotice(result.message || 'Password changed. Other sessions were signed out.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to change password.');
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="text-sm font-semibold text-slate-950">Change password</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">Updates your local Student-LAD password and signs out other sessions.</p>
      </div>
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold text-emerald-800">Account recovery ready</span>
    </div>
    <div className="mt-4 grid gap-3">
      <input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" required autoComplete="current-password" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-emerald-400" placeholder="Current password" />
      <div className="grid gap-3 sm:grid-cols-2">
        <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" required minLength={8} autoComplete="new-password" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-emerald-400" placeholder="New password" />
        <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" required minLength={8} autoComplete="new-password" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none focus:border-emerald-400" placeholder="Confirm new password" />
      </div>
      <button type="submit" disabled={busy || !currentPassword || newPassword.length < 8 || confirmPassword.length < 8} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-45">{busy ? 'Changing password…' : 'Update password'}</button>
    </div>
    {notice ? <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</p> : null}
    {error ? <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error}</p> : null}
  </form>;
}

function PersonalizationSettings({ kamalAvatar, onKamalAvatar, voice, onVoice, accentColor, onAccentColor, uiTheme, onUiTheme, background, onBackground, theme, onTheme }: { kamalAvatar: KamalAvatar; onKamalAvatar: (value: KamalAvatar) => void; voice: LocalVoice; onVoice: (value: LocalVoice) => void; accentColor: AccentColor; onAccentColor: (value: AccentColor) => void; uiTheme: StudentUiTheme; onUiTheme: (value: StudentUiTheme) => void; background: AppBackground; onBackground: (value: AppBackground) => void; theme: StudentTheme; onTheme: (value: StudentTheme) => void }) {
  const avatarOptions: Array<SettingOption<KamalAvatar>> = ['🪷', '🦜', '🧭', '🌙', '🧠', '✨'].map((value) => ({ value: value as KamalAvatar, title: value, description: avatarLabel(value as KamalAvatar) }));
  const accentOptions: Array<SettingOption<AccentColor>> = [
    { value: 'Emerald', title: 'Emerald', className: 'from-emerald-400 to-teal-600' },
    { value: 'Indigo', title: 'Indigo', className: 'from-indigo-400 to-blue-700' },
    { value: 'Rose', title: 'Rose', className: 'from-rose-300 to-pink-600' },
    { value: 'Amber', title: 'Amber', className: 'from-amber-300 to-orange-500' },
    { value: 'Sky', title: 'Sky', className: 'from-sky-300 to-cyan-600' },
    { value: 'Violet', title: 'Violet', className: 'from-violet-400 to-fuchsia-600' },
  ];
  const uiThemeOptions: Array<SettingOption<StudentUiTheme>> = [
    { value: 'Prism', title: 'Prism', description: 'Clinical clarity with bright accents.', visual: <ThemeSwatch colors={['#0f766e', '#38bdf8', '#f8fafc']} /> },
    { value: 'Craft', title: 'Craft', description: 'Soft workspace neutrals.', visual: <ThemeSwatch colors={['#7c2d12', '#f59e0b', '#fff7ed']} /> },
    { value: 'Forma', title: 'Forma', description: 'Structured, calm panels.', visual: <ThemeSwatch colors={['#1e293b', '#64748b', '#f1f5f9']} /> },
    { value: 'Luma', title: 'Luma', description: 'Airy healthcare-inspired light.', visual: <ThemeSwatch colors={['#0ea5e9', '#a7f3d0', '#ffffff']} /> },
    { value: 'Studio', title: 'Studio', description: 'Creative focus and contrast.', visual: <ThemeSwatch colors={['#4c1d95', '#fb7185', '#fdf2f8']} /> },
  ];
  const backgroundOptions: Array<SettingOption<AppBackground>> = [
    { value: 'Warm White', title: 'Warm White', className: 'bg-[#fffaf2]' },
    { value: 'Mist', title: 'Mist', className: 'bg-[#eef6ff]' },
    { value: 'Ivory', title: 'Ivory', className: 'bg-[#fffff0]' },
    { value: 'Slate', title: 'Slate', className: 'bg-[#e2e8f0]' },
    { value: 'Mint', title: 'Mint', className: 'bg-[#ecfdf5]' },
    { value: 'Sand', title: 'Sand', className: 'bg-[#fef3c7]' },
  ];

  return <SectionCard title="Personalization">
    <div className="space-y-6">
      <VisualPicker label="Kamal Avatar" value={kamalAvatar} options={avatarOptions} onChange={onKamalAvatar} variant="emoji" />
      <KamalVoicePicker value={voice} onApply={onVoice} />
      <VisualPicker label="Accent Color" value={accentColor} options={accentOptions} onChange={onAccentColor} variant="gradient" />
      <VisualPicker label="UI Theme" value={uiTheme} options={uiThemeOptions} onChange={onUiTheme} variant="theme" />
      <VisualPicker label="App Background" value={background} options={backgroundOptions} onChange={onBackground} variant="background" />
      <SettingRow label="Appearance" description="Persists app-wide through the Student-LAD store."><SegmentedControl value={theme} options={['Light', 'Dark', 'System']} onChange={(value) => onTheme(value as StudentTheme)} /></SettingRow>
    </div>
  </SectionCard>;
}

function KamalVoicePicker({ value, onApply }: { value: LocalVoice; onApply: (value: LocalVoice) => void }) {
  const [draftState, setDraftState] = useState<{ base: LocalVoice; draft: LocalVoice }>(() => ({ base: value, draft: value }));
  const [status, setStatus] = useState('');
  const draftVoice = draftState.base === value ? draftState.draft : value;
  const voices = Object.keys(KAMAL_VOICE_PROFILES) as LocalVoice[];
  const changed = draftVoice !== value;

  function preview(voiceName: LocalVoice) {
    setDraftState({ base: value, draft: voiceName });
    const played = previewKamalVoice(voiceName);
    setStatus(played ? `Playing ${voiceName} preview.` : 'Voice preview is not available in this browser. The profile will apply when speech synthesis is available.');
  }

  function applyVoice() {
    onApply(draftVoice);
    setStatus(`${draftVoice} voice applied to Kamal.`);
  }

  return <section aria-label="Kamal Voice" className="space-y-3">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-slate-950">Kamal Voice</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">Preview each profile before applying. Actual system voice depends on the browser/OS voices installed, while rate and pitch always change.</p>
      </div>
      <div className="text-xs font-semibold text-slate-500">Current: <span className="text-slate-950">{value}</span></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      {voices.map((voiceName) => {
        const profile = KAMAL_VOICE_PROFILES[voiceName];
        const active = value === voiceName;
        const selected = draftVoice === voiceName;
        return <article key={voiceName} className={`rounded-2xl border bg-white p-3 transition ${selected ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-slate-300'}`}>
          <div className="flex items-start justify-between gap-3">
            <button type="button" onClick={() => setDraftState({ base: value, draft: voiceName })} className="min-w-0 flex-1 text-left" aria-label={`Select ${voiceName} voice`}>
              <span className="flex items-center gap-2">
                <span className="font-semibold text-slate-950">{profile.label}</span>
                {active ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">Applied</span> : null}
                {selected && !active ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">Selected</span> : null}
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">{profile.description}</span>
            </button>
            <button type="button" onClick={() => preview(voiceName)} className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 hover:border-sky-300 hover:bg-sky-100" aria-label={`Preview ${voiceName} voice`}>▶</button>
          </div>
        </article>;
      })}
    </div>
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs leading-5 text-slate-600">{status || 'Choose a voice profile, press ▶ to preview, then apply it to Kamal.'}</p>
      <button type="button" onClick={applyVoice} disabled={!changed} className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45">Apply Kamal Voice</button>
    </div>
  </section>;
}

function DesktopCaptureSettings() {
  const [captureText, setCaptureText] = useState('');
  const [sourceTitle, setSourceTitle] = useState('Desktop capture');
  const [status, setStatus] = useState('');
  const [summary, setSummary] = useState('');
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function submitText(mode: 'selection' | 'page' | 'send_to_ceda') {
    const content = captureText.trim();
    if (!content) { setStatus('Paste selected text or page notes first.'); return; }
    setStatus('Sending capture to local Student-LAD…');
    try {
      const result = await apiFetch<{ summary?: string; ceda_batch?: { item_count?: number } }>(mode === 'send_to_ceda' ? '/api/v1/capture/send-to-ceda' : mode === 'page' ? '/api/v1/capture/page' : '/api/v1/capture/selection', {
        method: 'POST',
        body: JSON.stringify({ content, source_title: sourceTitle, source_type: mode === 'page' ? 'desktop_page' : 'desktop_selection', capture_mode: mode, user_action: mode === 'send_to_ceda' ? 'send_to_ceda' : 'summarize', requires_ceda_review: mode !== 'selection' }),
      });
      setSummary(result.summary || 'Capture processed.');
      setStatus(result.ceda_batch ? `CEDA review created with ${result.ceda_batch.item_count || 0} item(s).` : 'Summary created locally. Nothing was stored.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Capture failed.');
    }
  }

  async function captureScreen() {
    setStatus('Requesting screen permission…');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
      stream.getTracks().forEach((track) => track.stop());
      const imageDataUrl = canvas.toDataURL('image/png');
      const result = await apiFetch<{ summary?: string; message?: string; ceda_batch?: { item_count?: number } }>('/api/v1/capture/screenshot', {
        method: 'POST',
        body: JSON.stringify({ image_data_url: imageDataUrl, source_title: sourceTitle || 'Desktop screenshot', notes: captureText, requires_ceda_review: true }),
      });
      setSummary(result.summary || result.message || 'Screenshot metadata captured.');
      setStatus(result.ceda_batch ? `Screenshot staged for CEDA review.` : 'Screenshot summary created.');
    } catch (error) {
      setStatus(error instanceof DOMException && error.name === 'NotAllowedError' ? 'Screen capture permission was cancelled.' : error instanceof Error ? error.message : 'Screen capture failed.');
    }
  }

  async function toggleListening() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    setStatus('Requesting microphone permission…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const body = new FormData();
        body.append('file', new File([blob], `desktop-listening-${Date.now()}.webm`, { type: 'audio/webm' }));
        body.append('source_title', sourceTitle || 'Webinar audio');
        body.append('requires_ceda_review', 'true');
        setStatus('Transcribing locally and preparing notes…');
        try {
          const result = await apiFetch<{ summary?: string; transcript?: string; ceda_batch?: { item_count?: number } }>('/api/v1/capture/audio', { method: 'POST', body });
          setCaptureText(result.transcript || '');
          setSummary(result.summary || 'Audio transcribed.');
          setStatus(result.ceda_batch ? `Transcript staged for CEDA review.` : 'Audio summary created.');
        } catch (error) {
          setStatus(error instanceof Error ? error.message : 'Audio capture failed.');
        }
      };
      recorder.start();
      setRecording(true);
      setStatus('Listening locally. Stop when the webinar section is complete.');
    } catch (error) {
      setStatus(error instanceof DOMException && error.name === 'NotAllowedError' ? 'Microphone permission was blocked or cancelled.' : error instanceof Error ? error.message : 'Unable to start listening.');
    }
  }

  useEffect(() => () => { if (recorderRef.current?.state === 'recording') recorderRef.current.stop(); streamRef.current?.getTracks().forEach((track) => track.stop()); }, []);

  return <SectionCard title="Desktop Capture">
    <div className="space-y-4">
      <p className="text-sm leading-6 text-slate-600">Capture selected text, screen content, or webinar audio into temporary summaries. Durable notes and tasks still go through CEDA review before becoming saved information.</p>
      <SettingRow label="Source title" description="Used as the source reference in CEDA review."><input value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} className="w-56 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400" /></SettingRow>
      <textarea value={captureText} onChange={(event) => setCaptureText(event.target.value)} placeholder="Paste selected text, webinar notes, or page content here…" className="min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 outline-none focus:border-emerald-400" />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void submitText('selection')}>Summarize Text</Button>
        <Button onClick={() => void submitText('send_to_ceda')}>Send to CEDA</Button>
        <Button onClick={() => void captureScreen()}>Capture Screen</Button>
        <Button onClick={() => void toggleListening()}>{recording ? 'Stop Listening' : 'Start Listening'}</Button>
      </div>
      {status ? <p className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{status}</p> : null}
      {summary ? <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Summary</p><p className="mt-2 text-sm leading-6 text-emerald-950">{summary}</p></div> : null}
    </div>
  </SectionCard>;
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-xl font-semibold text-slate-950">{title}</h2><div className="mt-5">{children}</div></section>;
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-sm font-semibold text-slate-950">{label}</p>{description ? <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p> : null}</div><div className="shrink-0">{children}</div></div>;
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 py-3 text-sm"><span className="text-slate-500">{label}</span><span className="text-right font-semibold text-slate-950">{value}</span></div>;
}

function SegmentedControl<T extends string>({ value, options, onChange }: { value: T; options: readonly T[]; onChange: (value: T) => void }) {
  return <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1">{options.map((option) => <button key={option} type="button" onClick={() => onChange(option)} className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${value === option ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>{option}</button>)}</div>;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-7 w-12 rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'left-6' : 'left-1'}`} /></button>;
}

function VisualPicker<T extends string>({ label, value, options, onChange, variant }: { label: string; value: T; options: Array<SettingOption<T>>; onChange: (value: T) => void; variant: 'emoji' | 'card' | 'gradient' | 'theme' | 'background' }) {
  return <div><p className="mb-3 text-sm font-semibold text-slate-950">{label}</p><div className={`grid gap-3 ${variant === 'card' || variant === 'theme' ? 'sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>{options.map((option) => {
    const active = value === option.value;
    return <button key={option.value} type="button" onClick={() => onChange(option.value)} className={`relative rounded-2xl border p-3 text-left transition ${active ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-slate-300'} ${variant === 'gradient' ? `bg-gradient-to-br ${option.className || ''} text-white shadow-[0_8px_0_rgba(15,23,42,0.14)] hover:-translate-y-0.5` : 'bg-white'}`}>
      {active ? <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[11px] text-white">✓</span> : null}
      {variant === 'emoji' ? <span className="text-3xl">{option.title}</span> : null}
      {variant === 'theme' ? <span className="mb-3 block">{option.visual}</span> : null}
      {variant === 'background' ? <span className={`mb-3 block h-12 rounded-xl ring-1 ring-slate-200 ${option.className}`} /> : null}
      {variant !== 'emoji' && variant !== 'gradient' ? <span className="block font-semibold text-slate-950">{option.title}</span> : null}
      {variant === 'gradient' ? <span className="block pt-8 text-sm font-semibold">{option.title}</span> : null}
      {option.description ? <span className="mt-1 block text-xs leading-5 text-slate-500">{option.description}</span> : null}
    </button>;
  })}</div></div>;
}

function ThemeSwatch({ colors }: { colors: string[] }) {
  return <span className="flex h-9 overflow-hidden rounded-xl border border-slate-200">{colors.map((color) => <span key={color} className="flex-1" style={{ backgroundColor: color }} />)}</span>;
}

function avatarLabel(value: KamalAvatar) {
  return ({ '🪷': 'Lotus', '🦜': 'Parrot', '🧭': 'Guide', '🌙': 'Calm', '🧠': 'Focus', '✨': 'Spark' } as Record<KamalAvatar, string>)[value];
}


function RecordEntryPanel({ title, domain, actions, onCreateRecord }: { title: string; domain: string; actions: string[]; onCreateRecord: (text: string, source?: string) => void }) {
  const [text, setText] = useState('');
  const [sourceName, setSourceName] = useState('Manual entry');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  function submitRecord(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const clean = text.trim();
    if (!clean) { setNotice('Add a short note, record, date, or instruction first.'); return; }
    setBusy(true);
    setNotice('Sending to CEDA for extraction and approval…');
    void Promise.resolve(onCreateRecord(clean, sourceName || `${domain} manual form`))
      .then(() => { setText(''); setSourceName('Manual entry'); setNotice('Saved. The screen will refresh with approved structured information.'); })
      .catch((reason) => setNotice(reason instanceof Error ? reason.message : 'Unable to save this record.'))
      .finally(() => setBusy(false));
  }

  async function handleFile(file?: File) {
    if (!file) return;
    setBusy(true);
    setSourceName(file.name);
    setNotice(`Uploading ${file.name} for document extraction…`);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('conversation_id', `student-lad-${domain}`);
      body.append('chat_title', `${domain} record upload`);
      const uploaded = await apiFetch<{ filename?: string; content?: string; message?: string; detail?: string }>('/api/v1/dorje-ai/upload', { method: 'POST', body });
      const extracted = (uploaded.content || '').replace(/\{\\rtf[\s\S]*?\}/g, ' ').replace(/\s+/g, ' ').trim();
      const recordText = extracted || `${uploaded.filename || file.name} uploaded to ${domain}. Review this source and extract useful records.`;
      await Promise.resolve(onCreateRecord(recordText, uploaded.filename || file.name));
      setText('');
      setNotice(`${uploaded.filename || file.name} was extracted and submitted to CEDA. Useful records will appear after approval.`);
    } catch (reason) {
      try {
        const content = await file.text();
        const clean = content.replace(/\{\\rtf[\s\S]*?\}/g, ' ').replace(/\s+/g, ' ').trim();
        await Promise.resolve(onCreateRecord(clean || `${file.name} uploaded to ${domain}. Review this source and extract useful records.`, file.name));
        setNotice(`${file.name} was submitted from browser text extraction because backend upload was unavailable.`);
      } catch {
        setNotice(reason instanceof Error ? reason.message : `${file.name} could not be extracted. Try Workspace upload or paste the text.`);
      }
    } finally {
      setBusy(false);
    }
  }

  return <Panel title={title}>
    <form onSubmit={submitRecord} className="space-y-4">
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
        <p className="text-sm font-semibold text-slate-900">Add by text, voice, or upload</p>
        <p className="mt-1 text-xs leading-5 text-slate-600">Type here, upload a source file, or say “Kamal add course INTR799 to academic section.” CEDA extracts clean structured records before saving.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => <button key={action} type="button" onClick={() => { setText(`${action}: `); setSourceName(`${domain} quick action`); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-300 hover:text-emerald-700">{action}</button>)}
        <button type="button" onClick={() => window.dispatchEvent(new Event('kamal:open'))} className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700">Use Kamal voice</button>
      </div>
      <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Record details<textarea aria-label={`${domain} record text`} value={text} onChange={(event) => setText(event.target.value)} placeholder="Example: Course INTR799 starts this semester. Professor notes are in my syllabus." className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm normal-case tracking-normal text-slate-900 outline-none focus:border-emerald-400" /></label>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <input value={sourceName} onChange={(event) => setSourceName(event.target.value)} aria-label="Record source reference" className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400" />
        <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-300">Upload source<input type="file" className="hidden" accept=".txt,.md,.csv,.json,.rtf,.pdf,.doc,.docx" onChange={(event) => { void handleFile(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>
        <button type="submit" disabled={busy || !text.trim()} className="rounded-2xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-45">Save record</button>
      </div>
      {notice ? <p className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">{notice}</p> : null}
    </form>
  </Panel>;
}

function CategoryBadgeTone({ tone }: { tone: ThreeDTabTone }) {
  const label = tone === 'system' ? 'Student-LAD' : titleCase(tone);
  const classes: Record<ThreeDTabTone, string> = {
    academic: 'bg-blue-50 text-blue-700 border-blue-200',
    career: 'bg-violet-50 text-violet-700 border-violet-200',
    immigration: 'bg-amber-50 text-amber-800 border-amber-200',
    family: 'bg-rose-50 text-rose-700 border-rose-200',
    health: 'bg-teal-50 text-teal-700 border-teal-200',
    finance: 'bg-green-50 text-green-700 border-green-200',
    travel: 'bg-sky-50 text-sky-700 border-sky-200',
    personal: 'bg-slate-50 text-slate-700 border-slate-200',
    system: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${classes[tone]}`}>{label}</span>;
}
function Hero({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) { return <section className="rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-6 text-white shadow-xl"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">{eyebrow}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">{body}</p></section>; }
function Panel({ title, children }: { title: string; children: ReactNode }) { return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-3 text-lg font-semibold text-slate-900">{title}</h2>{children}</section>; }
function Metric({ label, value, detail, onClick }: { label: string; value: string | number; detail?: string; onClick?: () => void }) { const content = <><h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</h2><p className="mt-2 truncate text-2xl font-semibold text-slate-950">{value}</p></>; return onClick ? <button type="button" title={detail} onClick={onClick} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-emerald-300">{content}</button> : <article title={detail} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">{content}</article>; }
function FocusCard({ title, due, priority, action }: { title: string; due: string; priority: string; action: string }) { return <div className="rounded-2xl bg-slate-50 p-4"><h3 className="font-semibold text-slate-900">{title}</h3><p className="mt-2 text-sm text-slate-600">Due: {due} · Priority: {priority}</p><p className="mt-2 text-sm text-slate-600">{action}</p><div className="mt-4 flex flex-wrap gap-2"><Button>Start Work</Button><Button onClick={() => window.dispatchEvent(new Event('kamal:open'))}>Ask Kamal</Button><Button>Reschedule</Button></div></div>; }
function parseCalendarInput(value: string) {
  const normalized = value.trim().replace(' ', 'T');
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function Badge({ value }: { value: string }) {
  const tone = value === 'critical' ? 'bg-red-700 text-white' : value === 'high' ? 'bg-yellow-100 text-yellow-900' : value === 'low' ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-800';
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${tone}`}>{value}</span>;
}
function SimpleTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) { return <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="min-w-[760px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500"><tr>{headers.map((header) => <th key={header} className="px-3 py-3 font-semibold">{header}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.length ? rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-3 text-slate-700">{cell}</td>)}</tr>) : <tr><td colSpan={headers.length} className="p-8 text-center text-slate-500">Nothing to show yet.</td></tr>}</tbody></table></div>; }
function titleCase(value: string) { return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function Button({ children, onClick }: { children: ReactNode; onClick?: () => void }) { return <button type="button" onClick={onClick} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700">{children}</button>; }
function IconTextButton({ icon, label, onClick, children }: { icon: string; label: string; onClick?: () => void; children: ReactNode }) { return <button type="button" title={String(children)} aria-label={label} onClick={onClick} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700"><span aria-hidden="true">{icon}</span><span>{label}</span></button>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold text-slate-800">{value}</p></div>; }
function Status({ tone, children }: { tone: 'error' | 'success'; children: ReactNode }) { return <p className={`rounded-xl p-3 text-sm ${tone === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-800'}`}>{children}</p>; }

function rightPanelFor(screen: Screen, data: { pendingReview: number; reminders: Reminder[]; health?: ContextHealth; pieDecisions: PIEDecision[]; locations: WKIMWorkspace[]; catalog: WKIMDocument[] }) {
  if (screen === 'Home') return { title: 'Why this matters', body: 'Top priorities are selected from deadlines, effort, source confidence, reminders, and policy-safe approved context.', items: [`Needs review: ${data.pendingReview}`, `Upcoming reminders: ${data.reminders.length}`, `Information quality: ${data.health?.score ?? 0}%`] };
  if (screen === 'My Day') {
    const top = data.reminders[0];
    const high = data.reminders.filter((item) => item.priority === 'high').length;
    const critical = data.reminders.filter((item) => item.priority === 'critical').length;
    return {
      title: 'Day Assistant',
      body: top ? `Next up: ${top.title}${top.due_at ? ` · ${new Date(top.due_at).toLocaleString()}` : ''}` : 'Plan today with approved reminders, saved information, and policy-safe context.',
      items: [
        'KPI legend: D done · HP high · CR critical · U upcoming.',
        `HP high priority: ${high}`,
        `CR critical: ${critical}`,
        `Upcoming reminders: ${data.reminders.length}`,
        'Use Ask Kamal to plan, reschedule, or create guided actions.',
      ],
    };
  }
  if (screen === 'Review & Save') return { title: 'Selected item detail', body: 'Review source, policy, confidence, version, and suggested action before saving anything as durable context.', items: ['Approve only useful information.', 'Edit creates a new version.', 'Denied items are not used by AI.'] };
  if (screen === 'Memory Center') return { title: 'Memory controls', body: 'Saved memories are distilled conclusions created after permission checks.', items: ['Pending memories require approval.', 'Sensitive memory is never auto-saved.', 'Forget removes memory from retrieval.', 'Export provides a user-owned JSON copy.'] };
  if (screen === 'Workspaces') return { title: 'Workspace assistant', body: 'Dorje AI tracks knowledge locations and references without becoming a file manager.', items: [`Connected locations: ${data.locations.length}`, `Catalog references: ${data.catalog.length}`, 'Original files remain user-owned.'] };
  if (screen === 'Settings') return { title: 'Privacy impact summary', body: 'Settings changes are evaluated by how they affect cloud use, storage, information retention, connectors, and AI model routing.', items: ['Cloud use: off unless explicitly enabled.', 'Storage: local settings, references, backups, and vault records.', 'Information retention: governed by memory and policy rules.', 'Connectors: each provider requires permission.', 'AI models: local preferred; cloud requires approval.'] };
  return { title: `${screen} helper`, body: 'This panel keeps related context, reminders, suggested actions, and policy notes close to the current screen.', items: ['Related context appears after approval.', 'Sensitive data is masked by default.', 'Use Ask Kamal for guided actions.'] };
}
