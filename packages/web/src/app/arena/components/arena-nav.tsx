"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/arena/intake", label: "Intake" },
  { href: "/arena/battles", label: "Battles" },
  { href: "/arena/leaderboard", label: "Leaderboard" },
];

export function ArenaNav() {
  const pathname = usePathname();

  return (
    <div className="relative border-b border-gray-800 bg-[#161b22] overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-yellow-500/3 via-transparent to-transparent pointer-events-none" />
      <div className="relative max-w-5xl mx-auto px-6">
        <nav className="flex items-center gap-1">
          {tabs.map((tab) => {
            const isActive = pathname.startsWith(tab.href);
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
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
