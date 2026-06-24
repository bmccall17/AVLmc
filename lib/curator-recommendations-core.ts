/**
 * "Recommend a curator" — pure logic (parked backlog item, Reported Jun 18, 2026). No DB/network
 * imports, so field validation and the status lifecycle are unit-tested in isolation
 * (tests/curator-recommendations.test.ts) and reused by the service + routes. It only validates and
 * classifies; it never reads/writes the recommendation or decides admin authorization.
 *
 * A recommendation is distinct from a curator APPLICATION: here a signed-in listener nominates
 * someone ELSE ("I know someone who should curate"). The nominee is free text (they may not be a
 * user yet), so only `nomineeName` is required. Lifecycle: a listener submits `pending` → the admin
 * works the queue and marks it `reviewed` or `dismissed` (both terminal, stamping `resolved_at`).
 */

export type CuratorRecommendationStatus = "pending" | "reviewed" | "dismissed";

/** Statuses an admin may set from the review queue. A listener can only ever create `pending`. */
export const ADMIN_SETTABLE_RECOMMENDATION_STATUSES: readonly CuratorRecommendationStatus[] = [
  "reviewed",
  "dismissed",
];

export function isAdminSettableRecommendationStatus(
  status: string
): status is CuratorRecommendationStatus {
  return (ADMIN_SETTABLE_RECOMMENDATION_STATUSES as readonly string[]).includes(status);
}

export const RECOMMENDATION_NAME_MAX = 120;
export const RECOMMENDATION_LINK_MAX = 500;
export const RECOMMENDATION_REASON_MAX = 600;

/** Raised when a submitted recommendation is missing/malformed. Mapped to a 400 by the route. */
export class CuratorRecommendationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CuratorRecommendationValidationError";
  }
}

/**
 * Validate + normalize a listener-submitted curator recommendation. Throws
 * CuratorRecommendationValidationError on anything unusable so the caller never stores junk.
 * `nomineeName` is required; `nomineeLink` and `reason` are optional, trimmed, and capped.
 */
export function validateCuratorRecommendation(input: {
  nomineeName?: unknown;
  nomineeLink?: unknown;
  reason?: unknown;
}): { nomineeName: string; nomineeLink: string | null; reason: string | null } {
  const nomineeName = typeof input.nomineeName === "string" ? input.nomineeName.trim() : "";
  if (!nomineeName) {
    throw new CuratorRecommendationValidationError("Who would you like to recommend?");
  }
  if (nomineeName.length > RECOMMENDATION_NAME_MAX) {
    throw new CuratorRecommendationValidationError(
      `Keep the name under ${RECOMMENDATION_NAME_MAX} characters.`
    );
  }

  const nomineeLink = typeof input.nomineeLink === "string" ? input.nomineeLink.trim() : "";
  if (nomineeLink.length > RECOMMENDATION_LINK_MAX) {
    throw new CuratorRecommendationValidationError(
      `Keep the link under ${RECOMMENDATION_LINK_MAX} characters.`
    );
  }

  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length > RECOMMENDATION_REASON_MAX) {
    throw new CuratorRecommendationValidationError(
      `Keep the note under ${RECOMMENDATION_REASON_MAX} characters.`
    );
  }

  return { nomineeName, nomineeLink: nomineeLink || null, reason: reason || null };
}
