import assert from "node:assert/strict";
import test from "node:test";
import {
  circleBadgeCount,
  shapeCircleActivity,
  summarizeCircleLabel,
  type CircleActivityRow,
} from "../lib/social-activity-core";

function row(partial: Partial<CircleActivityRow> & { eventId: string; userId: string }): CircleActivityRow {
  return {
    displayName: partial.displayName ?? `User ${partial.userId}`,
    going: partial.going ?? false,
    firing: partial.firing ?? false,
    ...partial,
  };
}

test("shapeCircleActivity buckets going/firing per event and dedupes people", () => {
  const activity = shapeCircleActivity([
    row({ eventId: "e1", userId: "2", displayName: "Maya", going: true }),
    row({ eventId: "e1", userId: "3", displayName: "Theo", firing: true }),
    // Same person appears twice for the same event (e.g. both flags) → counted once in people.
    row({ eventId: "e1", userId: "3", displayName: "Theo", going: true }),
  ]);

  assert.equal(activity.e1.goingCount, 2);
  assert.equal(activity.e1.fireCount, 1);
  assert.equal(activity.e1.people.length, 2);
});

test("shapeCircleActivity drops rows with neither going nor firing", () => {
  const activity = shapeCircleActivity([
    row({ eventId: "e1", userId: "2", going: false, firing: false }),
  ]);
  // The whole point: a followee with no current state contributes nothing.
  assert.equal(activity.e1, undefined);
});

test("shapeCircleActivity falls back to a private-safe name when display name is blank", () => {
  const activity = shapeCircleActivity([
    row({ eventId: "e1", userId: "2", displayName: "  ", going: true }),
  ]);
  assert.equal(activity.e1.people[0].displayName, "Someone you follow");
});

test("summarizeCircleLabel renders truthful counts, or null when empty", () => {
  assert.equal(
    summarizeCircleLabel({ eventId: "e1", goingCount: 3, fireCount: 1, people: [] }),
    "3 people you follow are going · 1 firing"
  );
  assert.equal(
    summarizeCircleLabel({ eventId: "e1", goingCount: 1, fireCount: 0, people: [] }),
    "1 person you follow is going"
  );
  assert.equal(
    summarizeCircleLabel({ eventId: "e1", goingCount: 0, fireCount: 0, people: [] }),
    null
  );
  assert.equal(summarizeCircleLabel(null), null);
});

test("circleBadgeCount reflects distinct people, never under-counts when names truncated", () => {
  assert.equal(circleBadgeCount({ eventId: "e1", goingCount: 12, fireCount: 2, people: [] }), 12);
  assert.equal(circleBadgeCount(null), 0);
});
