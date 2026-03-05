"use client";

import { useState, useMemo } from "react";
import {
  GitBranch,
  MessageSquare,
  Key,
  Zap,
  RefreshCw,
} from "lucide-react";

interface ActivityEvent {
  id: string;
  eventType: string;
  userId: string;
  githubUsername: string | null;
  avatarUrl: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

const EVENT_TYPES = [
  "sync",
  "rollback",
  "pin",
  "unpin",
  "publish",
  "feedback",
  "token_generate",
  "token_rotate",
  "version_nudge",
  "feedback_status_change",
];

const EVENT_ICONS: Record<string, typeof Zap> = {
  sync: RefreshCw,
  rollback: RefreshCw,
  pin: GitBranch,
  unpin: GitBranch,
  publish: GitBranch,
  feedback: MessageSquare,
  token_generate: Key,
  token_rotate: Key,
  version_nudge: Zap,
  feedback_status_change: MessageSquare,
};

function eventDescription(event: ActivityEvent): string {
  const user = event.githubUsername ?? "Unknown";
  const d = event.details;
  switch (event.eventType) {
    case "sync":
      return `${user} synced skills`;
    case "rollback":
      return `${user} rolled back ${d.slug ?? "a skill"}`;
    case "pin":
      return `${user} pinned ${d.slug ?? "a skill"} to ${d.pinned_version ?? "a version"}`;
    case "unpin":
      return `${user} unpinned ${d.slug ?? "a skill"}`;
    case "publish":
      return `${d.slug ?? "Skill"} v${d.version ?? "?"} published`;
    case "feedback":
      return `${user} left feedback on ${d.skillSlug ?? "a skill"}`;
    case "token_generate":
      return `${user} generated an API token`;
    case "token_rotate":
      return `${user} rotated their API token`;
    case "version_nudge":
      return `Nudge sent to ${user} for ${d.skillSlug ?? "a skill"}`;
    case "feedback_status_change":
      return `Feedback on ${d.skillSlug ?? "a skill"} marked ${d.newStatus ?? "?"}`;
    default:
      return `${event.eventType} event`;
  }
}

export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  const [filterType, setFilterType] = useState("");

  const filtered = useMemo(() => {
    if (!filterType) return events;
    return events.filter((e) => e.eventType === filterType);
  }, [events, filterType]);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterType("")}
          className={`rounded px-3 py-1 font-mono text-xs ${
            !filterType
              ? "bg-green-900/30 text-green-400"
              : "bg-[#161b22] text-gray-500 hover:text-gray-300"
          }`}
        >
          All
        </button>
        {EVENT_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`rounded px-3 py-1 font-mono text-xs ${
              filterType === type
                ? "bg-green-900/30 text-green-400"
                : "bg-[#161b22] text-gray-500 hover:text-gray-300"
            }`}
          >
            {type.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map((event) => {
          const Icon = EVENT_ICONS[event.eventType] ?? Zap;
          return (
            <div
              key={event.id}
              className="flex items-center gap-3 rounded border border-gray-800 bg-[#161b22] p-3"
            >
              <Icon className="h-4 w-4 flex-shrink-0 text-gray-500" />
              <div className="flex-1">
                <p className="font-mono text-sm text-gray-300">
                  {eventDescription(event)}
                </p>
                <p className="font-mono text-xs text-gray-600">
                  {new Date(event.createdAt).toLocaleString()}
                </p>
              </div>
              {event.avatarUrl && (
                <img
                  src={event.avatarUrl}
                  alt=""
                  className="h-6 w-6 rounded-full"
                />
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center font-mono text-sm text-gray-500">
            No activity events.
          </p>
        )}
      </div>
    </>
  );
}
