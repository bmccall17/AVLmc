import assert from "node:assert/strict";
import test from "node:test";
import {
  hoverPlayerReducer,
  initialHoverPlayerState,
  isArmed,
  isPlaying,
  isSafePreviewUrl,
  type HoverPlayerAction,
  type HoverPlayerState,
} from "../lib/hover-player-core";

function run(state: HoverPlayerState, actions: HoverPlayerAction[]): HoverPlayerState {
  return actions.reduce(hoverPlayerReducer, state);
}

test("ARM enters the arming phase and shows the pre-play indicator", () => {
  const state = hoverPlayerReducer(initialHoverPlayerState, { type: "ARM", eventId: "a" });
  assert.equal(state.phase, "arming");
  assert.equal(state.eventId, "a");
  assert.ok(isArmed(state));
});

test("arming a second event hands playback off (single player)", () => {
  const state = run(initialHoverPlayerState, [
    { type: "ARM", eventId: "a" },
    { type: "DWELL_COMPLETE", eventId: "a" },
    { type: "LOADED", eventId: "a", trackCount: 3 },
    { type: "PLAY_CONFIRMED", eventId: "a" },
    { type: "ARM", eventId: "b" },
  ]);
  assert.equal(state.eventId, "b");
  assert.equal(state.phase, "arming");
  assert.equal(state.trackIndex, 0);
  assert.ok(isPlaying(state, "a") === false);
});

test("a dwell that never completes never reaches playback; stale timers are ignored", () => {
  // Leave before the dwell fires: DISARM, then a late DWELL_COMPLETE for "a" is a no-op.
  const state = run(initialHoverPlayerState, [
    { type: "ARM", eventId: "a" },
    { type: "DISARM" },
    { type: "DWELL_COMPLETE", eventId: "a" },
  ]);
  assert.equal(state.phase, "idle");
  assert.equal(state.eventId, null);
});

test("DWELL_COMPLETE moves arming → loading only for the current event", () => {
  const armed = hoverPlayerReducer(initialHoverPlayerState, { type: "ARM", eventId: "a" });
  const loading = hoverPlayerReducer(armed, { type: "DWELL_COMPLETE", eventId: "a" });
  assert.equal(loading.phase, "loading");
  // A dwell for a different event does nothing.
  const unchanged = hoverPlayerReducer(armed, { type: "DWELL_COMPLETE", eventId: "z" });
  assert.equal(unchanged.phase, "arming");
});

test("LOADED with no playable tracks drops to idle (open-to-listen fallback)", () => {
  const state = run(initialHoverPlayerState, [
    { type: "ARM", eventId: "a" },
    { type: "DWELL_COMPLETE", eventId: "a" },
    { type: "LOADED", eventId: "a", trackCount: 0 },
  ]);
  assert.equal(state.phase, "idle");
  assert.equal(state.eventId, null);
});

test("autoplay block then unlock reaches playing and marks the session unlocked", () => {
  const blocked = run(initialHoverPlayerState, [
    { type: "ARM", eventId: "a" },
    { type: "DWELL_COMPLETE", eventId: "a" },
    { type: "LOADED", eventId: "a", trackCount: 2 },
    { type: "AUTOPLAY_BLOCKED", eventId: "a" },
  ]);
  assert.equal(blocked.phase, "blocked");
  assert.equal(blocked.unlocked, false);

  const unlocked = hoverPlayerReducer(blocked, { type: "UNLOCK", eventId: "a" });
  assert.equal(unlocked.phase, "playing");
  assert.equal(unlocked.unlocked, true);
});

test("PLAY_CONFIRMED plays and unlocks; ADVANCE walks and stops at the end", () => {
  let state = run(initialHoverPlayerState, [
    { type: "ARM", eventId: "a" },
    { type: "DWELL_COMPLETE", eventId: "a" },
    { type: "LOADED", eventId: "a", trackCount: 2 },
    { type: "PLAY_CONFIRMED", eventId: "a" },
  ]);
  assert.equal(state.phase, "playing");
  assert.ok(isPlaying(state, "a"));

  state = hoverPlayerReducer(state, { type: "ADVANCE", eventId: "a", trackCount: 2 });
  assert.equal(state.trackIndex, 1);
  assert.equal(state.phase, "playing");

  // Advancing past the last track stops cleanly.
  state = hoverPlayerReducer(state, { type: "ADVANCE", eventId: "a", trackCount: 2 });
  assert.equal(state.phase, "idle");
  assert.equal(state.eventId, null);
});

test("DISARM and STOP return to idle from any active phase", () => {
  const playing = run(initialHoverPlayerState, [
    { type: "ARM", eventId: "a" },
    { type: "DWELL_COMPLETE", eventId: "a" },
    { type: "LOADED", eventId: "a", trackCount: 1 },
    { type: "PLAY_CONFIRMED", eventId: "a" },
  ]);
  assert.equal(hoverPlayerReducer(playing, { type: "DISARM" }).phase, "idle");
  assert.equal(hoverPlayerReducer(playing, { type: "STOP" }).phase, "idle");
});

test("isSafePreviewUrl only accepts https scdn.co URLs", () => {
  assert.ok(isSafePreviewUrl("https://p.scdn.co/mp3-preview/abc123"));
  assert.ok(isSafePreviewUrl("http://p.scdn.co/mp3-preview/abc123") === false);
  assert.ok(isSafePreviewUrl("https://evil.example.com/x.mp3") === false);
  assert.ok(isSafePreviewUrl("https://scdn.co.evil.com/x.mp3") === false);
  assert.ok(isSafePreviewUrl(null) === false);
  assert.ok(isSafePreviewUrl("not a url") === false);
});
