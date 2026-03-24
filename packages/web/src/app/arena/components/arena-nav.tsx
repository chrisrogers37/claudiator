"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/arena", label: "Overview", icon: "\u{1F6E1}", exact: true },
  { href: "/arena/intake", label: "Intake", icon: "\u{1F4DC}" },
  { href: "/arena/battles", label: "Battles", icon: "\u2694" },
  { href: "/arena/rankings", label: "Rankings", icon: "\u{1F3C6}" },
];

export function ArenaNav() {
  const pathname = usePathname();

  return (
    <div className="relative border-b border-gray-800 bg-[#161b22] overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-yellow-500/3 via-transparent to-transparent pointer-events-none" />
      <div className="relative max-w-5xl mx-auto px-6">
        <nav className="flex items-center gap-1">
          {tabs.map((tab) => {
            const isActive = tab.exact
              ? pathname === tab.href
              : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-3 py-2.5 font-mono text-xs transition-all rounded-md my-1 ${
                  isActive
                    ? "bg-yellow-500/10 border border-yellow-500/30 text-yellow-500"
                    : "border border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
                }`}
              >
                <span className="mr-1.5">{tab.icon}</span>
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
