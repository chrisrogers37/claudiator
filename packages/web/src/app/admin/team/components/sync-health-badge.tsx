import { Badge } from "@/components/ui/badge";

type SyncHealth = "current" | "stale" | "critical" | "never";

interface SyncHealthBadgeProps {
  lastSyncAt: Date | null;
}

function getSyncHealth(lastSyncAt: Date | null): SyncHealth {
  if (!lastSyncAt) return "never";
  const daysSince =
    (Date.now() - new Date(lastSyncAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince < 7) return "current";
  if (daysSince < 30) return "stale";
  return "critical";
}

function relativeDate(date: Date | null): string {
  if (!date) return "never";
  const d = new Date(date);
  const days = Math.floor(
    (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const healthVariant: Record<SyncHealth, "green" | "amber" | "red" | "muted"> =
  {
    current: "green",
    stale: "amber",
    critical: "red",
    never: "muted",
  };

export function SyncHealthBadge({ lastSyncAt }: SyncHealthBadgeProps) {
  const health = getSyncHealth(lastSyncAt);
  return (
    <Badge
      label={relativeDate(lastSyncAt)}
      variant={healthVariant[health]}
    />
  );
}
