'use client';

import type { StudentNavGroup, StudentNavItem } from './StudentSidebar';
import { Bot, CalendarDays, Compass, Home, Menu, X } from 'lucide-react';

const bottomLabels = ['Home', 'My Day', 'Workspace AI', 'Tasks'];

export default function MobileNavigation({
  groups,
  activeLabel,
  drawerOpen,
  onOpenDrawer,
  onCloseDrawer,
  onNavigate,
}: {
  groups: StudentNavGroup[];
  activeLabel: string;
  drawerOpen: boolean;
  onOpenDrawer: () => void;
  onCloseDrawer: () => void;
  onNavigate: (item: StudentNavItem) => void;
}) {
  const allItems = groups.flatMap((group) => group.items);
  const bottom = [
    { label: 'Home', icon: Home },
    { label: 'My Day', icon: Compass },
    { label: 'Workspace AI', icon: Bot },
    { label: 'Tasks', icon: CalendarDays },
  ].map((item) => ({ ...item, nav: allItems.find((candidate) => candidate.label === item.label) }));

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-slate-200 bg-white/95 px-1 py-1 text-slate-600 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur xl:hidden" aria-label="Mobile navigation">
        {bottom.map(({ label, icon: Icon, nav }) => (
          <button
            key={label}
            type="button"
            onClick={() => nav && onNavigate(nav)}
            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium ${
              activeLabel === label ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-slate-50'
            }`}
            aria-current={activeLabel === label ? 'page' : undefined}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span>{label === 'Tasks' || label === 'Calendar & Timeline' ? 'Tasks' : label === 'Workspace AI' ? 'AI' : label}</span>
          </button>
        ))}
        <button type="button" onClick={onOpenDrawer} className="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium hover:bg-slate-50">
          <Menu className="h-5 w-5" aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>

      {drawerOpen ? (
        <div className="fixed inset-0 z-[75] xl:hidden">
          <button type="button" className="absolute inset-0 bg-slate-950/40" onClick={onCloseDrawer} aria-label="Close navigation drawer" />
          <div className="absolute bottom-0 left-0 right-0 max-h-[82vh] overflow-y-auto rounded-t-[28px] bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-950">All navigation</h2>
              <button type="button" onClick={onCloseDrawer} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Close navigation">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {allItems
                .filter((item) => !bottomLabels.includes(item.label))
                .map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        onNavigate(item);
                        onCloseDrawer();
                      }}
                      className={`flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 text-center text-xs font-medium ${
                        activeLabel === item.label ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-600'
                      }`}
                      aria-current={activeLabel === item.label ? 'page' : undefined}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                      {item.label}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
