'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ChevronLeft, ChevronRight, Pin, PinOff } from 'lucide-react';

export type StudentNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  external?: boolean;
};

export type StudentNavGroup = {
  label: string;
  items: StudentNavItem[];
};

export default function StudentSidebar({
  groups,
  activeLabel,
  collapsed,
  pinned,
  onToggle,
  onTogglePin,
  onNavigate,
  onHoverChange,
}: {
  groups: StudentNavGroup[];
  activeLabel: string;
  collapsed: boolean;
  pinned: boolean;
  onToggle: () => void;
  onTogglePin: () => void;
  onNavigate: (item: StudentNavItem) => void;
  onHoverChange?: (hovered: boolean) => void;
}) {
  return (
    <aside
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      onFocus={() => onHoverChange?.(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onHoverChange?.(false); }}
      className={`hidden shrink-0 flex-col overflow-hidden border-r border-slate-800 bg-slate-950 text-slate-200 shadow-2xl shadow-slate-950/20 transition-[width] duration-200 xl:flex ${
        collapsed ? 'w-[72px]' : 'w-[264px]'
      }`}
      aria-label="Student-LAD navigation"
      data-pinned={pinned}
    >
      <div className={`border-b border-slate-800 px-3 py-4 ${collapsed ? 'space-y-2' : 'space-y-3'}`}>
        <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          <Link href="/student-lad" className={`min-w-0 ${collapsed ? 'flex justify-center' : 'flex flex-1 items-center gap-3'}`}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-sm font-bold text-white">D</span>
            {!collapsed ? (
              <span className="min-w-0">
                <span className="block text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Dorje AI</span>
                <span className="mt-1 block text-lg font-semibold leading-none text-white">Student-LAD</span>
                <span className="mt-1 block text-xs text-slate-400">Local Academic Dorje</span>
              </span>
            ) : null}
          </Link>
          {!collapsed ? (
            <button
              type="button"
              onClick={onTogglePin}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-800 text-slate-400 transition hover:border-emerald-400/40 hover:bg-emerald-500/10 hover:text-emerald-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
              aria-pressed={pinned}
              aria-label={pinned ? 'Unpin left Context and Tools panel' : 'Pin left Context and Tools panel'}
              title={pinned ? 'Unpin panel' : 'Pin panel'}
            >
              {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </button>
          ) : null}
        </div>
        {collapsed ? (
          <button
            type="button"
            onClick={onTogglePin}
            className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 text-slate-500 transition hover:bg-slate-900 hover:text-emerald-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
            aria-pressed={pinned}
            aria-label="Pin left Context and Tools panel"
            title="Pin Context & Tools"
          >
            <Pin className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {!collapsed ? (
        <div className="border-b border-slate-800 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">Active workspace</p>
          <p className="mt-1 text-sm font-medium text-slate-200">Fall 2026</p>
          <p className="text-xs text-slate-300">Northeastern University</p>
        </div>
      ) : null}

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {groups.map((group) => (
          <section key={group.label} className="mb-3">
            {!collapsed ? <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">{group.label}</p> : null}
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activeLabel === item.label;
                const className = `group relative flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${
                  active ? 'bg-emerald-500/16 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                } ${collapsed ? 'justify-center' : ''}`;
                const content = (
                  <>
                    {active ? <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-emerald-400" aria-hidden="true" /> : null}
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                    {collapsed ? (
                      <span className="pointer-events-none absolute left-full z-50 ml-2 rounded-lg bg-slate-900 px-2 py-1 text-xs text-white opacity-0 shadow-xl transition group-hover:opacity-100">
                        {item.label}
                      </span>
                    ) : null}
                  </>
                );
                return item.external ? (
                  <Link key={item.label} href={item.href} className={className} aria-current={active ? 'page' : undefined} title={collapsed ? item.label : undefined}>
                    {content}
                  </Link>
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => onNavigate(item)}
                    className={className}
                    aria-current={active ? 'page' : undefined}
                    title={collapsed ? item.label : undefined}
                  >
                    {content}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </nav>

      <div className="border-t border-slate-800 p-2">
        <div className={`flex gap-2 ${collapsed ? 'flex-col' : ''}`}>
          <button
            type="button"
            onClick={onToggle}
            className="flex min-h-10 flex-1 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-900 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand now' : 'Collapse now'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
          {!collapsed ? (
            <button
              type="button"
              onClick={onTogglePin}
              className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl text-xs font-semibold text-slate-300 transition hover:bg-slate-900 hover:text-emerald-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
              aria-pressed={pinned}
              title={pinned ? 'Unpin and auto-hide' : 'Pin open'}
            >
              {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              <span>{pinned ? 'Unpin' : 'Pin'}</span>
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
