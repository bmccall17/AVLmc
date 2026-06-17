import { Users } from "lucide-react";
import {
  summarizeCircleLabel,
  type CircleEventActivity,
} from "@/lib/social-activity-core";

type CirclePresenceProps = {
  activity: CircleEventActivity | null | undefined;
};

/**
 * "People you follow" strip for the event detail page (PRD 24 / C2). Shows what followed-and-opted-in
 * people are going to / firing — counts plus in-circle names — visually distinct from the anonymous
 * community-heat counts ("your people," not "the crowd"). Server-rendered; renders nothing when the
 * viewer has no entitled activity (so anonymous and empty cases show nothing at all).
 */
export function CirclePresence({ activity }: CirclePresenceProps) {
  const label = summarizeCircleLabel(activity);

  if (!activity || !label) {
    return null;
  }

  const names = activity.people.map((person) => person.displayName);
  const shown = names.slice(0, 5);
  const extra = Math.max(0, Math.max(activity.goingCount, activity.fireCount) - shown.length);

  return (
    <section className="circle-presence" aria-label="People you follow">
      <Users aria-hidden="true" size={16} strokeWidth={2.4} />
      <div className="circle-presence-copy">
        <strong>{label}</strong>
        {shown.length > 0 ? (
          <small>
            {shown.join(", ")}
            {extra > 0 ? ` +${extra} more` : ""}
          </small>
        ) : null}
      </div>
    </section>
  );
}
