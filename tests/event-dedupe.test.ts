import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEventDuplicateAudit,
  getCanonicalEvents,
  type CanonicalEventRecord,
} from "../lib/event-dedupe";

function event(
  overrides: Pick<CanonicalEventRecord, "eventTitle" | "id"> &
    Partial<CanonicalEventRecord>
): CanonicalEventRecord {
  const base = {
    avlgoEventId: "",
    eventDate: "2026-06-10",
    eventTime: "6:00 PM",
    eventTitle: "",
    eventUrl: "https://www.avlgo.com/events",
    id: "",
    imageUrl: null,
    source: "AVLgo live feed: LIVE_MUSIC_AVL",
    startsAt: null,
    tags: ["Live Music"],
    updatedAt: "2026-06-07T00:00:00.000Z",
    venueName: "The Orange Peel",
  } satisfies CanonicalEventRecord;

  return {
    ...base,
    ...overrides,
    avlgoEventId: overrides.avlgoEventId ?? overrides.id,
    eventTitle: overrides.eventTitle,
    id: overrides.id,
  };
}

test("collapses exact duplicate events and keeps the best quality row", () => {
  const canonical = event({
    avlgoEventId: "ea-36239",
    eventTitle: "Congress The Band",
    eventUrl: "https://www.exploreasheville.com/asheville/events/congress-band-0",
    id: "explore-congress",
    imageUrl: "https://www.exploreasheville.com/images/congress-the-band.png",
    source: "AVLgo live feed: EXPLORE_ASHEVILLE",
    tags: ["Live Music", "Nightlife", "Indie Rock", "Club Concert"],
  });
  const duplicate = event({
    avlgoEventId: "lma-36239",
    eventTitle: "Congress The Band",
    id: "generic-congress",
  });

  assert.deepEqual(getCanonicalEvents([duplicate, canonical]), [canonical]);

  const audit = buildEventDuplicateAudit([duplicate, canonical]);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].canonicalId, "explore-congress");
  assert.deepEqual(audit[0].hiddenIds, ["generic-congress"]);
  assert.ok(audit[0].winnerReasons.length > 0);
});

test("collapses a five-row duplicate group to one canonical tile", () => {
  const rows = [
    event({
      eventDate: "2026-06-12",
      eventTime: "10:00 PM",
      eventTitle: "Affter Dark A Gothic Dance Experience",
      eventUrl: "https://www.eventbrite.com/e/affter-dark-a-gothic-dance-experience-tickets-1988270829574",
      id: "eventbrite-affter-dark",
      imageUrl: "https://img.evbuc.com/affter-dark-original.jpg",
      source: "AVLgo live feed: EVENTBRITE",
      startsAt: "2026-06-13T02:00:00.000Z",
      tags: ["Dance", "Nightlife", "Live Music", "Goth Dance Party"],
      venueName: "O. Henry's",
    }),
    event({
      eventDate: "2026-06-12",
      eventTime: "10:00 PM",
      eventTitle: "Affter Dark A Gothic Dance Experience",
      id: "affter-dark-copy-1",
      startsAt: "2026-06-13T02:00:00.000Z",
      venueName: "O. Henrys",
    }),
    event({
      eventDate: "2026-06-12",
      eventTime: "10:00 PM",
      eventTitle: "Affter Dark A Gothic Dance Experience Show",
      id: "affter-dark-copy-2",
      startsAt: "2026-06-13T02:00:00.000Z",
      venueName: "O Henry's",
    }),
    event({
      eventDate: "2026-06-12",
      eventTime: "10:00 PM",
      eventTitle: "The Affter Dark A Gothic Dance Experience Event",
      id: "affter-dark-copy-3",
      startsAt: "2026-06-13T02:00:00.000Z",
      venueName: "O. Henry's",
    }),
    event({
      eventDate: "2026-06-12",
      eventTime: "10:00 PM",
      eventTitle: "Affter Dark A Gothic Dance Experience Concert",
      id: "affter-dark-copy-4",
      startsAt: "2026-06-13T02:00:00.000Z",
      venueName: "O. Henry's",
    }),
  ];

  const canonical = getCanonicalEvents(rows);
  assert.equal(canonical.length, 1);
  assert.equal(canonical[0].id, "eventbrite-affter-dark");

  const audit = buildEventDuplicateAudit(rows);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].hiddenIds.length, 4);
});

test("collapses Thunder Thursday title variants only when date, time, and venue match", () => {
  const mountainX = event({
    eventDate: "2026-06-11",
    eventTime: "8:30 PM",
    eventTitle: "Thunder Thursday",
    eventUrl: "https://mountainx.com/event/thunder-thursday/2026-06-11/",
    id: "mx-thunder-0611",
    source: "AVLgo live feed: MOUNTAIN_X",
    startsAt: "2026-06-12T00:30:00.000Z",
    tags: ["Live Music", "Nightlife", "Thursday Residency", "Local Collaboration"],
    venueName: "One World Brewing West",
  });
  const liveMusicAvl = event({
    eventDate: "2026-06-11",
    eventTime: "8:30 PM",
    eventTitle: "Thunder Thursdays Band",
    eventUrl: "https://livemusicasheville.com/calendar/thunder-thursdays-band/2026-06-11/",
    id: "lma-thunder-0611",
    imageUrl: "/one_world_west.avif",
    source: "AVLgo live feed: LIVE_MUSIC_AVL",
    startsAt: "2026-06-12T00:30:00.000Z",
    tags: ["Live Music", "Nightlife", "Brewery Taproom", "Late Night Set"],
    venueName: "One World Brewing - West",
  });
  const nextWeek = event({
    ...mountainX,
    eventDate: "2026-06-18",
    id: "mx-thunder-0618",
    startsAt: "2026-06-19T00:30:00.000Z",
  });
  const laterTime = event({
    ...mountainX,
    eventTime: "9:30 PM",
    id: "mx-thunder-2130",
    startsAt: "2026-06-12T01:30:00.000Z",
  });

  const canonical = getCanonicalEvents([liveMusicAvl, mountainX, nextWeek, laterTime]);
  assert.equal(canonical.length, 3);
  assert.ok(canonical.some((row) => row.id === "mx-thunder-0611"));
  assert.ok(canonical.some((row) => row.id === "mx-thunder-0618"));
  assert.ok(canonical.some((row) => row.id === "mx-thunder-2130"));
});

test("keeps same artist events on different dates or different times separate", () => {
  const june12 = event({
    eventDate: "2026-06-12",
    eventTime: "7:30 PM",
    eventTitle: "Rod Abernethy",
    id: "rod-0612",
    startsAt: "2026-06-12T23:30:00.000Z",
    venueName: "White Horse Black Mountain",
  });
  const june13 = event({
    ...june12,
    eventDate: "2026-06-13",
    id: "rod-0613",
    startsAt: "2026-06-13T23:30:00.000Z",
  });
  const laterTime = event({
    ...june12,
    eventTime: "8:30 PM",
    id: "rod-2030",
    startsAt: "2026-06-13T00:30:00.000Z",
  });

  assert.equal(getCanonicalEvents([june12, june13, laterTime]).length, 3);
});

test("keeps meaningfully different titles at the same venue, date, and time separate", () => {
  const rod = event({
    eventDate: "2026-06-12",
    eventTime: "7:30 PM",
    eventTitle: "Rod Abernethy",
    id: "rod-abernethy",
    startsAt: "2026-06-12T23:30:00.000Z",
    venueName: "White Horse Black Mountain",
  });
  const readingSeries = event({
    ...rod,
    eventTitle: "Juniper Bends Reading Series | Spring '26, Vol. II",
    id: "juniper-bends",
  });

  assert.equal(getCanonicalEvents([rod, readingSeries]).length, 2);
});

test("dedupes persisted database-style rows even when source ids differ", () => {
  const firstStoredRow = event({
    avlgoEventId: "ea-38018",
    eventDate: "2026-06-13",
    eventTime: "10:00 PM",
    eventTitle: "Emo Night Brooklyn",
    eventUrl: "https://www.exploreasheville.com/asheville/events/emo-night-brooklyn-1",
    id: "explore-emo-night",
    imageUrl: "https://www.exploreasheville.com/images/emo-night-brooklyn.png",
    source: "AVLgo live feed: EXPLORE_ASHEVILLE",
    startsAt: "2026-06-14T02:00:00.000Z",
    tags: ["Nightlife", "Live Music", "Emo Hits", "DJ Dance Party"],
    updatedAt: "2026-06-07T00:05:10.033Z",
    venueName: "Revival Asheville",
  });
  const secondStoredRow = event({
    avlgoEventId: "lma-emo-night",
    eventDate: "2026-06-13",
    eventTime: "10:00 PM",
    eventTitle: "Emo Night Brooklyn Show",
    id: "lma-emo-night",
    startsAt: "2026-06-14T02:00:00.000Z",
    updatedAt: "2026-06-06T00:05:10.033Z",
    venueName: "Revival Asheville",
  });

  assert.deepEqual(getCanonicalEvents([secondStoredRow, firstStoredRow]), [
    firstStoredRow,
  ]);
});
