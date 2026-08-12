"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/", label: "Dashboard", description: "Executive overview" },
  { href: "/student-lad", label: "CEDA Insights", description: "Context, policies & reminders" },
  { href: "/organizations", label: "Organizations", description: "Client portfolio" },
  { href: "/reports", label: "Reports", description: "Generate insights" },
  { href: "/dorje-ai", label: "DorjeAI", description: "Multi-agent concierge" },
  { href: "/operations-guide", label: "Operations Guide", description: "Setup and product help" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const isStudentEdition = (process.env.NEXT_PUBLIC_APP_TITLE || '').includes('Student');
  const visibleNavigation = navigation.filter((item) => !(isStudentEdition && item.href === '/organizations'));

  return (
    <aside className="hidden w-72 flex-col justify-between border-r border-slate-200 bg-slate-950 p-6 text-white lg:flex">
      <div>
        <div className="mb-10">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">
            Lotus & Dorje
          </p>
          <h2 className="mt-2 text-2xl font-semibold">Student-LAD</h2>
        </div>

        <nav className="space-y-2">
          {visibleNavigation.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-xl border px-4 py-3 transition ${
                  isActive
                    ? "border-sky-400 bg-slate-800"
                    : "border-transparent bg-slate-900/70 hover:border-slate-700 hover:bg-slate-900"
                }`}
              >
                <div className="font-medium">{item.label}</div>
                <div className="text-sm text-slate-400">{item.description}</div>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">
        <p className="font-medium text-white">Connected to FastAPI</p>
        <p className="mt-1">Sync your orgs and reports in real time.</p>
      </div>
    </aside>
  );
}
