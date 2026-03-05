"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, BarChart3, GitBranch, MessageSquare, Activity } from "lucide-react";

const navItems = [
  { href: "/admin/team", label: "Team", icon: Users },
  { href: "/admin/skills", label: "Skills", icon: BarChart3 },
  { href: "/admin/versions", label: "Versions", icon: GitBranch },
  { href: "/admin/feedback", label: "Feedback", icon: MessageSquare },
  { href: "/admin/activity", label: "Activity", icon: Activity },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="w-56 border-r border-gray-800 bg-[#0d1117] p-4">
      <Link
        href="/dashboard"
        className="mb-1 block font-mono text-sm text-green-400"
      >
        claudefather
      </Link>
      <h2 className="mb-6 font-mono text-xs text-gray-500">Admin Dashboard</h2>
      <ul className="space-y-1">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 font-mono text-sm transition-colors ${
                  isActive
                    ? "bg-[#161b22] text-green-400"
                    : "text-gray-400 hover:bg-[#161b22] hover:text-gray-200"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
