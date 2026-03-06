import { Card } from "@/components/ui/card";
import { RatingStars } from "@/components/ui/rating-stars";

interface FeedbackEntry {
  id: string;
  userId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
}

interface FeedbackListProps {
  entries: FeedbackEntry[];
}

export function FeedbackList({ entries }: FeedbackListProps) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-gray-600">
        <p className="font-mono text-sm">No feedback yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <Card key={entry.id} variant="dashed">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <RatingStars rating={entry.rating} size="sm" />
              <span className="text-xs font-mono text-gray-600">
                {entry.userId.slice(0, 8)}
              </span>
            </div>
            <span className="text-xs text-gray-600">
              {entry.createdAt.toLocaleDateString()}
            </span>
          </div>
          {entry.comment && (
            <p className="mt-2 text-sm text-gray-400">{entry.comment}</p>
          )}
        </Card>
      ))}
    </div>
  );
}
