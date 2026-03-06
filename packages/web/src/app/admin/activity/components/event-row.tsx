import {
  RefreshCw,
  Undo2,
  Pin,
  PinOff,
  MessageSquare,
  Key,
  RotateCw,
  Upload,
  Bell,
  ArrowRightLeft,
} from "lucide-react";

interface EventRowProps {
  eventType: string;
  skillSlug: string | null;
  details: Record<string, unknown>;
  username: string | null;
  createdAt: Date;
}

const eventConfig: Record<
  string,
  { icon: typeof RefreshCw; color: string; label: string }
> = {
  sync: { icon: RefreshCw, color: "text-green-400", label: "Sync" },
  rollback: { icon: Undo2, color: "text-amber-400", label: "Rollback" },
  pin: { icon: Pin, color: "text-cyan-400", label: "Pin" },
  unpin: { icon: PinOff, color: "text-gray-400", label: "Unpin" },
  feedback: { icon: MessageSquare, color: "text-amber-400", label: "Feedback" },
  token_generate: { icon: Key, color: "text-green-400", label: "Token Generated" },
  token_rotate: { icon: RotateCw, color: "text-cyan-400", label: "Token Rotated" },
  publish: { icon: Upload, color: "text-green-400", label: "Publish" },
  version_nudge: { icon: Bell, color: "text-amber-400", label: "Version Nudge" },
  feedback_status_change: {
    icon: ArrowRightLeft,
    color: "text-cyan-400",
    label: "Status Change",
  },
};

function describeEvent(
  eventType: string,
  details: Record<string, unknown>
): string {
  switch (eventType) {
    case "sync": {
      const synced = details.synced as { slug: string; version: string }[] | undefined;
      if (synced?.length) {
        return synced.map((s) => `${s.slug}@${s.version}`).join(", ");
      }
      return "synced skills";
    }
    case "rollback":
      return `${details.slug} ${details.from_version} -> ${details.to_version}`;
    case "pin":
      return `${details.slug} pinned at ${details.pinned_version}`;
    case "unpin":
      return `${details.slug} unpinned`;
    case "feedback_status_change":
      return `${details.fromStatus} -> ${details.toStatus}`;
    case "version_nudge":
      return `nudged to ${details.latestVersion}`;
    default:
      return JSON.stringify(details).slice(0, 80);
  }
}

export function EventRow({
  eventType,
  skillSlug,
  details,
  username,
  createdAt,
}: EventRowProps) {
  const config = eventConfig[eventType] || {
    icon: RefreshCw,
    color: "text-gray-400",
    label: eventType,
  };
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-[#161b22] transition-colors">
      <Icon className={`w-4 h-4 ${config.color} shrink-0`} />
      <span className={`font-mono text-xs ${config.color} w-28 shrink-0`}>
        {config.label}
      </span>
      <span className="font-mono text-xs text-gray-400 w-24 shrink-0">
        {username || "system"}
      </span>
      {skillSlug && (
        <span className="font-mono text-xs text-cyan-400 w-28 shrink-0">
          {skillSlug}
        </span>
      )}
      <span className="font-mono text-xs text-gray-500 flex-1 truncate">
        {describeEvent(eventType, details)}
      </span>
      <span className="font-mono text-xs text-gray-600 shrink-0">
        {new Date(createdAt).toLocaleString()}
      </span>
    </div>
  );
}
