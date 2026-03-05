"use client";

import { SortableTable } from "@/components/admin/sortable-table";
import { SyncStatusBadge } from "@/components/admin/sync-status-badge";

interface UserRow {
  id: string;
  githubUsername: string;
  avatarUrl: string | null;
  createdAt: string;
  lastSyncAt: string | null;
  lastActiveAt: string | null;
  skillCount: number;
  totalInvocations: number;
  syncStatus: string;
  onboardingComplete: boolean;
  hasToken: boolean;
}

const columns = [
  {
    key: "githubUsername",
    label: "User",
    sortable: false,
    render: (user: UserRow) => (
      <div className="flex items-center gap-2">
        {user.avatarUrl && (
          <img
            src={user.avatarUrl}
            alt=""
            className="h-6 w-6 rounded-full"
          />
        )}
        <span className="text-gray-200">{user.githubUsername}</span>
      </div>
    ),
  },
  {
    key: "syncStatus",
    label: "Sync",
    sortable: false,
    render: (user: UserRow) => (
      <SyncStatusBadge status={user.syncStatus} date={user.lastSyncAt} />
    ),
  },
  { key: "skillCount", label: "Skills", sortable: true },
  { key: "totalInvocations", label: "Invocations", sortable: true },
  {
    key: "lastActiveAt",
    label: "Last Active",
    sortable: true,
    render: (user: UserRow) =>
      user.lastActiveAt
        ? new Date(user.lastActiveAt).toLocaleDateString()
        : "Never",
  },
];

export function TeamTable({ users }: { users: UserRow[] }) {
  return (
    <SortableTable
      data={users}
      columns={columns}
      defaultSort="totalInvocations"
      defaultDir="desc"
    />
  );
}
