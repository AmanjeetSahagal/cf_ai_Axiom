import Link from "next/link";
import { ReactNode } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/datasets", label: "Datasets" },
  { href: "/prompts", label: "Prompts" },
  { href: "/runs", label: "Runs" },
  { href: "/compare", label: "Compare" },
];

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-col gap-6 rounded-[32px] border border-black/5 bg-white/70 p-6 shadow-panel backdrop-blur lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.28em] text-ember">Axiom</p>
          <h1 className="mt-2 font-display text-5xl text-ink">Evaluate LLM systems with evidence.</h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Run datasets against prompt and model variants, score behavior, and inspect regressions without turning evaluation into ad hoc spreadsheet work.
          </p>
        </div>
        <nav className="flex flex-wrap gap-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="btn-nav text-sm"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
