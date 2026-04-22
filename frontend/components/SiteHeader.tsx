"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoMark } from "@/components/LogoMark";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/copilot", label: "Copilot" },
  { href: "/datasets", label: "Datasets" },
  { href: "/prompts", label: "Prompts" },
  { href: "/runs", label: "Runs" },
  { href: "/compare", label: "Compare" },
  { href: "/settings", label: "Settings" },
];

type SiteHeaderProps = {
  signedIn?: boolean;
  onSignOut?: () => void | Promise<void>;
  isSigningOut?: boolean;
};

export function SiteHeader({ signedIn = false, onSignOut, isSigningOut = false }: SiteHeaderProps) {
  const pathname = usePathname();

  return (
    <header className="mb-8 flex flex-col gap-4 rounded-[28px] border border-black/5 bg-white/80 p-4 shadow-panel backdrop-blur lg:flex-row lg:items-center lg:justify-between">
      <Link href={signedIn ? "/dashboard" : "/"} className="flex items-center gap-3 rounded-2xl px-2 py-1">
        <LogoMark size="sm" />
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Axiom</p>
          <p className="font-display text-2xl leading-none text-ink">Evaluation OS</p>
        </div>
      </Link>
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <nav className="flex flex-wrap gap-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${pathname === item.href ? "btn-chip-active" : "btn-nav"} text-sm`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {signedIn ? (
          <button className="btn-secondary text-sm" type="button" onClick={onSignOut} disabled={isSigningOut}>
            {isSigningOut ? "Signing Out..." : "Sign Out"}
          </button>
        ) : (
          <Link href="/login" className="btn-secondary text-sm">
            Log In
          </Link>
        )}
      </div>
    </header>
  );
}
