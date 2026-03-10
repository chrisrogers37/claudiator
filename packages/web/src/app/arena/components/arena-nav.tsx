"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/arena", label: "Overview", exact: true },
  { href: "/arena/intake", label: "Intake" },
  { href: "/arena/rankings", label: "Rankings" },
];

export function ArenaNav() {
  const pathname = usePathname();

  return (
    <div className="border-b border-gray-800 bg-[#161b22]">
      <div className="max-w-5xl mx-auto px-6">
        <nav className="flex items-center gap-1">
          {tabs.map((tab) => {
            const isActive = tab.exact
              ? pathname === tab.href
              : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-3 py-2.5 font-mono text-xs transition-colors border-b-2 ${
                  isActive
                    ? "border-yellow-500 text-yellow-500"
                    : "border-transparent text-gray-500 hover:text-gray-300"
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
