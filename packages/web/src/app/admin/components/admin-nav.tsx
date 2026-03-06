"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Users,
  Puzzle,
  GitBranch,
  MessageSquare,
  Activity,
} from "lucide-react";

const tabs = [
  { href: "/admin/team", label: "Team", icon: Users },
  { href: "/admin/skills", label: "Skills", icon: Puzzle },
  { href: "/admin/versions", label: "Versions", icon: GitBranch },
  { href: "/admin/feedback", label: "Feedback", icon: MessageSquare },
  { href: "/admin/activity", label: "Activity", icon: Activity },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <div className="border-b border-gray-800 bg-[#161b22]">
      <div className="max-w-7xl mx-auto px-6">
        <nav className="flex items-center gap-1">
          {tabs.map((tab) => {
            const isActive = pathname.startsWith(tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-1.5 px-3 py-2.5 font-mono text-xs transition-colors border-b-2 ${
                  isActive
                    ? "border-cyan-400 text-cyan-400"
                    : "border-transparent text-gray-500 hover:text-gray-300"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
