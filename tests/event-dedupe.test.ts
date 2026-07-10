import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEventDuplicateAudit,
  FUZZY_START_WINDOW_MINUTES,
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
    eventTime: "10:30 PM",
    id: "mx-thunder-2230",
    startsAt: "2026-06-12T02:30:00.000Z",
  });

  const canonical = getCanonicalEvents([liveMusicAvl, mountainX, nextWeek, laterTime]);
  assert.equal(canonical.length, 3);
  assert.ok(canonical.some((row) => row.id === "mx-thunder-0611"));
  assert.ok(canonical.some((row) => row.id === "mx-thunder-0618"));
  assert.ok(canonical.some((row) => row.id === "mx-thunder-2230"));
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
    eventTime: "9:30 PM",
    id: "rod-2130",
    startsAt: "2026-06-13T01:30:00.000Z",
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

test("merges cross-source copies whose start times differ within the fuzzy window (Spoon case)", () => {
  const orangePeelListing = event({
    avlgoEventId: "op-spoon",
    eventDate: "2026-07-05",
    eventTime: "8:00 PM",
    eventTitle: "Spoon",
    eventUrl: "https://theorangepeel.net/events/spoon/",
    id: "5912f31d-84b4-46b0-b8ed-ac536a5905e9",
    source: "AVLgo live feed: ORANGE_PEEL",
    startsAt: "2026-07-06T00:00:00.000Z",
    venueName: "The Orange Peel",
  });
  const exploreAshevilleListing = event({
    avlgoEventId: "ea-spoon",
    eventDate: "2026-07-05",
    eventTime: "7:00 PM",
    eventTitle: "Spoon",
    eventUrl: "https://www.exploreasheville.com/asheville/events/spoon",
    id: "ac22d18f-a1ca-4f35-bf21-bdb1daeb84b6",
    imageUrl: "https://www.exploreasheville.com/images/events/spoon.png",
    source: "AVLgo live feed: EXPLORE_ASHEVILLE",
    startsAt: "2026-07-05T23:00:00.000Z",
    tags: ["Live Music", "Indie Rock"],
    venueName: "The Orange Peel",
  });

  const canonical = getCanonicalEvents([orangePeelListing, exploreAshevilleListing]);
  assert.equal(canonical.length, 1);
  assert.equal(canonical[0].id, "ac22d18f-a1ca-4f35-bf21-bdb1daeb84b6");
  assert.equal(canonical[0].eventTime, "7:00 PM");

  const audit = buildEventDuplicateAudit([orangePeelListing, exploreAshevilleListing]);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].canonicalId, "ac22d18f-a1ca-4f35-bf21-bdb1daeb84b6");
  assert.deepEqual(audit[0].hiddenIds, ["5912f31d-84b4-46b0-b8ed-ac536a5905e9"]);
  assert.ok(
    audit[0].winnerReasons.includes(
      `merged: start times within ${FUZZY_START_WINDOW_MINUTES} minutes across sources`
    )
  );
});

test("keeps two sets per night separate when the gap exceeds the fuzzy window", () => {
  const earlySet = event({
    eventDate: "2026-07-05",
    eventTime: "7:00 PM",
    eventTitle: "Spoon",
    id: "spoon-early-set",
    startsAt: "2026-07-05T23:00:00.000Z",
  });
  const lateSet = event({
    ...earlySet,
    eventTime: "10:30 PM",
    id: "spoon-late-set",
    startsAt: "2026-07-06T02:30:00.000Z",
  });

  assert.equal(getCanonicalEvents([lateSet, earlySet]).length, 2);
});

test("keeps distinctly titled early/late shows separate regardless of time gap", () => {
  const earlyShow = event({
    eventDate: "2026-07-05",
    eventTime: "7:00 PM",
    eventTitle: "Spoon — Early Show",
    id: "spoon-early-show",
    startsAt: "2026-07-05T23:00:00.000Z",
  });
  const lateShow = event({
    ...earlyShow,
    eventTime: "7:30 PM",
    eventTitle: "Spoon — Late Show",
    id: "spoon-late-show",
    startsAt: "2026-07-05T23:30:00.000Z",
  });

  assert.equal(getCanonicalEvents([earlyShow, lateShow]).length, 2);
});

test("does not chain-collapse a run of shows anchored to the earliest start", () => {
  const seven = event({
    eventDate: "2026-07-05",
    eventTime: "7:00 PM",
    eventTitle: "Spoon",
    id: "spoon-1900",
    startsAt: "2026-07-05T23:00:00.000Z",
  });
  const eightFifteen = event({
    ...seven,
    eventTime: "8:15 PM",
    id: "spoon-2015",
    startsAt: "2026-07-06T00:15:00.000Z",
  });
  const nineThirty = event({
    ...seven,
    eventTime: "9:30 PM",
    id: "spoon-2130",
    startsAt: "2026-07-06T01:30:00.000Z",
  });

  const canonical = getCanonicalEvents([nineThirty, seven, eightFifteen]);
  assert.equal(canonical.length, 2);
  assert.ok(canonical.some((row) => row.id === "spoon-2130"));
});

test("collapses the Watchhouse trio across venue aliases and support-act titles", () => {
  const orangePeelListing = event({
    avlgoEventId: "op-watchhouse",
    eventDate: "2026-07-18",
    eventTime: "6:00 PM",
    eventTitle: "Watchhouse",
    eventUrl:
      "https://theorangepeel.net/events/watchhouse-3/hellbender-by-the-orange-peel/2026-07-18/",
    id: "6d8060c8-op-watchhouse",
    source: "AVLgo live feed: ORANGE_PEEL",
    startsAt: "2026-07-18T22:00:00.000Z",
    venueName: "The Orange Peel",
  });
  const mountainXListing = event({
    avlgoEventId: "mx-watchhouse",
    eventDate: "2026-07-18",
    eventTime: "7:00 PM",
    eventTitle: "Watchhouse w/Fruit Bats",
    eventUrl: "https://mountainx.com/event/watchhouse-w-fruit-bats/2026-07-18/",
    id: "2382fc27-mx-watchhouse",
    source: "AVLgo live feed: MOUNTAIN_X",
    startsAt: "2026-07-18T23:00:00.000Z",
    venueName: "Hellbender",
  });
  const exploreAshevilleListing = event({
    avlgoEventId: "ea-watchhouse",
    eventDate: "2026-07-18",
    eventTime: "6:00 PM",
    eventTitle: "Watchhouse with special guests Fruit Bats and Two Runner",
    eventUrl: "https://www.exploreasheville.com/asheville/events/watchhouse",
    id: "85742a21-ea-watchhouse",
    imageUrl: "https://www.exploreasheville.com/images/events/watchhouse.png",
    source: "AVLgo live feed: EXPLORE_ASHEVILLE",
    startsAt: "2026-07-18T22:00:00.000Z",
    tags: ["Live Music", "Americana", "Outdoor Concert"],
    venueName: "Hellbender",
  });

  const rows = [orangePeelListing, mountainXListing, exploreAshevilleListing];
  const canonical = getCanonicalEvents(rows);
  assert.equal(canonical.length, 1);
  assert.equal(canonical[0].id, "85742a21-ea-watchhouse");

  const audit = buildEventDuplicateAudit(rows);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].canonicalId, "85742a21-ea-watchhouse");
  assert.deepEqual(audit[0].hiddenIds, [
    "6d8060c8-op-watchhouse",
    "2382fc27-mx-watchhouse",
  ]);
  assert.ok(
    audit[0].winnerReasons.includes(
      `merged: start times within ${FUZZY_START_WINDOW_MINUTES} minutes across sources`
    )
  );
});

test("keys titles on the headliner across support-act and promoter phrasings", () => {
  const shared = {
    eventDate: "2026-08-01",
    eventTime: "8:00 PM",
    startsAt: "2026-08-02T00:00:00.000Z",
    venueName: "The Grey Eagle",
  };
  const rows = [
    event({ ...shared, eventTitle: "Big Thief", id: "bt-plain" }),
    event({ ...shared, eventTitle: "Big Thief w/Buck Meek", id: "bt-w-slash" }),
    event({ ...shared, eventTitle: "Big Thief featuring Buck Meek", id: "bt-featuring" }),
    event({
      ...shared,
      eventTitle: "Big Thief with special guests Buck Meek and Twain",
      id: "bt-special-guests",
    }),
    event({ ...shared, eventTitle: "An Evening with Big Thief", id: "bt-evening-with" }),
    event({ ...shared, eventTitle: "AC Entertainment presents Big Thief", id: "bt-presents" }),
  ];

  assert.equal(getCanonicalEvents(rows).length, 1);
});

test("keeps co-bills distinct from solo billings", () => {
  const shared = {
    eventDate: "2026-08-01",
    eventTime: "8:00 PM",
    startsAt: "2026-08-02T00:00:00.000Z",
    venueName: "The Grey Eagle",
  };
  const solo = event({ ...shared, eventTitle: "Band A", id: "band-a-solo" });
  const coBill = event({ ...shared, eventTitle: "Band A & Band B", id: "band-a-and-b" });

  assert.equal(getCanonicalEvents([solo, coBill]).length, 2);
});

test("merges aliased venue labels but keeps unrelated venues separate", () => {
  const hellbender = event({
    eventDate: "2026-07-19",
    eventTime: "7:00 PM",
    eventTitle: "Watchhouse",
    id: "watchhouse-hellbender",
    startsAt: "2026-07-19T23:00:00.000Z",
    venueName: "Hellbender",
  });
  const orangePeelLabel = event({
    ...hellbender,
    id: "watchhouse-orange-peel",
    venueName: "The Orange Peel",
  });
  const fullAlias = event({
    ...hellbender,
    id: "watchhouse-full-alias",
    venueName: "Hellbender by The Orange Peel",
  });

  assert.equal(
    getCanonicalEvents([hellbender, orangePeelLabel, fullAlias]).length,
    1
  );

  const greyEagle = event({
    ...hellbender,
    id: "watchhouse-grey-eagle",
    venueName: "The Grey Eagle",
  });
  const salvage = event({
    ...hellbender,
    id: "watchhouse-salvage",
    venueName: "Salvage Station",
  });

  assert.equal(getCanonicalEvents([greyEagle, salvage]).length, 2);
});

test("collapses the Slow Runner pair despite bare 'with' support phrasing", () => {
  const mountainXListing = event({
    avlgoEventId: "9ccee219-mx-slow-runner",
    eventDate: "2026-07-10",
    eventTime: "7:00 PM",
    eventTitle: "Slow Runner - Album Release Show w/Whym",
    eventUrl: "https://mountainx.com/event/slow-runner-album-release-show-w-whym/",
    id: "9ccee219-mx-slow-runner",
    imageUrl: "https://mountainx.com/wp-content/uploads/2026/05/slow-runner.jpg",
    source: "AVLgo live feed: MOUNTAIN_X",
    startsAt: "2026-07-10T23:00:00.000Z",
    tags: ["Live Music", "Nightlife", "Album Release", "Singer Songwriter"],
    venueName: "AyurPrana Listening Room",
  });
  const avlTodayListing = event({
    avlgoEventId: "2a249adb-at-slow-runner",
    eventDate: "2026-07-10",
    eventTime: "7:00 PM",
    eventTitle: "Slow Runner - Album Release Show - with Whym",
    eventUrl: "https://link.dice.fm/y2d01fc94b2b",
    id: "2a249adb-at-slow-runner",
    imageUrl: "https://citysparkstorage.blob.core.windows.net/portalimages/slow-runner.jpg",
    source: "AVLgo live feed: AVL_TODAY",
    startsAt: "2026-07-10T23:00:00.000Z",
    tags: ["Live Music", "Album Release", "Listening Room"],
    venueName: "AyurPrana Listening Room",
  });

  const canonical = getCanonicalEvents([avlTodayListing, mountainXListing]);
  assert.equal(canonical.length, 1);
  assert.equal(canonical[0].id, "9ccee219-mx-slow-runner");
});

test("collapses the Afro Rhythm trio when sources disagree on the start time", () => {
  const exploreFresh = event({
    avlgoEventId: "af599533-ea-afro-rhythm",
    eventDate: "2026-07-12",
    eventTime: "2:00 PM",
    eventTitle: "Afro Rhythm with Chinobay",
    eventUrl: "https://www.exploreasheville.com/black-mountain/events/afro-rhythm-chinobay",
    id: "af599533-ea-afro-rhythm",
    imageUrl: "https://www.exploreasheville.com/images/afro-rhythm.png",
    source: "AVLgo live feed: EXPLORE_ASHEVILLE",
    startsAt: "2026-07-12T18:00:00.000Z",
    tags: ["Live Music", "Dance", "Afrobeat", "Dance Party"],
    updatedAt: "2026-07-09T10:35:03.823Z",
    venueName: "White Horse Black Mountain",
  });
  const mountainXLaterTime = event({
    avlgoEventId: "e6d26172-mx-afro-rhythm",
    eventDate: "2026-07-12",
    eventTime: "5:00 PM",
    eventTitle: "An Evening of Afro Rhythm with Chinobay",
    eventUrl: "https://mountainx.com/event/an-evening-of-afro-rhythm-with-chinobay/",
    id: "e6d26172-mx-afro-rhythm",
    imageUrl: "https://www.avlgo.com/asheville-default.jpg",
    source: "AVLgo live feed: MOUNTAIN_X",
    startsAt: "2026-07-12T21:00:00.000Z",
    tags: ["Live Music", "Afrobeat", "Danceable Grooves"],
    updatedAt: "2026-07-09T10:35:03.823Z",
    venueName: "White Horse Black Mountain",
  });
  const exploreStale = event({
    avlgoEventId: "54484a7f-ea-afro-rhythm",
    eventDate: "2026-07-12",
    eventTime: "2:00 PM",
    eventTitle: "An Evening of Afro Rhythm with Chinobay",
    eventUrl:
      "https://www.exploreasheville.com/black-mountain/events/evening-afro-rhythm-chinobay",
    id: "54484a7f-ea-afro-rhythm",
    imageUrl: "https://www.exploreasheville.com/images/afro-rhythm.png",
    source: "AVLgo live feed: EXPLORE_ASHEVILLE",
    startsAt: "2026-07-12T18:00:00.000Z",
    tags: ["Live Music", "Dance", "Afrobeats", "Dance Party"],
    updatedAt: "2026-07-05T10:26:28.296Z",
    venueName: "White Horse Black Mountain",
  });

  const rows = [exploreFresh, mountainXLaterTime, exploreStale];
  const canonical = getCanonicalEvents(rows);
  assert.equal(canonical.length, 1);
  assert.equal(canonical[0].id, "af599533-ea-afro-rhythm");

  const audit = buildEventDuplicateAudit(rows);
  assert.equal(audit.length, 1);
  assert.deepEqual(audit[0].hiddenIds, [
    "54484a7f-ea-afro-rhythm",
    "e6d26172-mx-afro-rhythm",
  ]);
  assert.ok(
    audit[0].winnerReasons.includes(
      "merged: sources disagree on the start time for the same listing"
    )
  );
});

test("keeps series episodes with disjoint featured artists separate", () => {
  const shared = {
    eventDate: "2026-07-20",
    eventTime: "7:00 PM",
    source: "AVLgo live feed: EXPLORE_ASHEVILLE",
    startsAt: "2026-07-20T23:00:00.000Z",
    venueName: "White Horse Black Mountain",
  };
  const caryFridley = event({
    ...shared,
    eventTitle: "Local Live with Cary Fridley",
    id: "local-live-cary",
  });
  const jennyBradley = event({
    ...shared,
    eventTitle: "Local Live with Jenny Bradley",
    id: "local-live-jenny",
  });
  const jayBrown = event({
    ...shared,
    eventTitle: "Local Live with Jay Brown",
    id: "local-live-jay",
  });

  assert.equal(getCanonicalEvents([caryFridley, jennyBradley, jayBrown]).length, 3);
});

test("merges relistings whose guest lists overlap even when one names extra acts", () => {
  const shared = {
    eventDate: "2026-07-06",
    eventTime: "7:00 PM",
    startsAt: "2026-07-06T23:00:00.000Z",
    venueName: "White Horse Black Mountain",
  };
  const short = event({
    ...shared,
    eventTitle: "Local Live w/ Jay Brown",
    id: "local-live-jay-short",
    source: "AVLgo live feed: EXPLORE_ASHEVILLE",
  });
  const long = event({
    ...shared,
    eventTitle: "Local Live with Jay Brown with guests Pilar, and Kelley Jane & Kevin Wayne",
    id: "local-live-jay-long",
    source: "AVLgo live feed: LIVE_MUSIC_AVL",
  });

  assert.equal(getCanonicalEvents([short, long]).length, 1);
});

test("still splits a multi-set night when one source lists conflicting times", () => {
  const sameSourceEarly = event({
    eventDate: "2026-07-12",
    eventTime: "2:00 PM",
    eventTitle: "Afro Rhythm with Chinobay",
    id: "afro-same-source-early",
    source: "AVLgo live feed: MOUNTAIN_X",
    startsAt: "2026-07-12T18:00:00.000Z",
    venueName: "White Horse Black Mountain",
  });
  const sameSourceLate = event({
    ...sameSourceEarly,
    eventTime: "5:00 PM",
    id: "afro-same-source-late",
    startsAt: "2026-07-12T21:00:00.000Z",
  });

  assert.equal(getCanonicalEvents([sameSourceEarly, sameSourceLate]).length, 2);
});

test("merges a tba copy into the group's single timed cluster and keeps tba-only pairs merged", () => {
  const timed = event({
    eventDate: "2026-07-05",
    eventTime: "8:00 PM",
    eventTitle: "Spoon",
    eventUrl: "https://theorangepeel.net/events/spoon/",
    id: "spoon-timed",
    startsAt: "2026-07-06T00:00:00.000Z",
  });
  const tbaCopy = event({
    ...timed,
    eventTime: null,
    eventUrl: "https://www.avlgo.com/events",
    id: "spoon-tba-copy",
    startsAt: null,
  });

  assert.deepEqual(getCanonicalEvents([tbaCopy, timed]), [timed]);

  const firstTbaOnly = event({
    eventDate: "2026-07-08",
    eventTime: null,
    eventTitle: "Mystery Residency",
    id: "mystery-tba-1",
    startsAt: null,
  });
  const secondTbaOnly = event({
    ...firstTbaOnly,
    id: "mystery-tba-2",
  });

  assert.equal(getCanonicalEvents([firstTbaOnly, secondTbaOnly]).length, 1);
});
