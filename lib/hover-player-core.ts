// Pure state machine for board hover listening (PRD 46, Story E). No React, DOM, or timers here so
// it stays unit-testable in isolation (tests/hover-player.test.ts). The `useHoverPlayer` hook drives
// this reducer from pointer events, dwell timers, the playlist fetch, and the shared <audio>
// element's play() promise; every side effect lives in the hook, every transition lives here.
//
// Guarantees this encodes:
//   - Only ONE event ever plays: arming a second event hands playback off from the first.
//   - Dwell gating: a short hover that leaves before the dwell completes never reaches playback.
//   - Autoplay honesty: a blocked first play lands in `blocked` (UI shows "click ♫ to listen");
//     the unlocking click transitions to `playing` and marks the session unlocked for later hovers.
//   - Stale timers/loads for an event we've since left are ignored (guarded by eventId + phase).

export type HoverPlayerPhase =
  | "idle" // nothing armed
  | "arming" // pointer is dwelling on a chip; pre-play indicator shows
  | "loading" // dwell completed; fetching the playlist and/or attempting play()
  | "playing" // audio is fading in / playing
  | "blocked"; // autoplay denied before any user gesture — show the click-to-listen nudge

export type HoverPlayerState = {
  phase: HoverPlayerPhase;
  /** Which event is currently armed/playing (null when idle). */
  eventId: string | null;
  /** Index into the event's preview playlist. */
  trackIndex: number;
  /** True once a user gesture has unlocked unmuted playback for this page session. */
  unlocked: boolean;
};

export type HoverPlayerAction =
  | { type: "ARM"; eventId: string }
  | { type: "DWELL_COMPLETE"; eventId: string }
  | { type: "LOADED"; eventId: string; trackCount: number }
  | { type: "PLAY_CONFIRMED"; eventId: string }
  | { type: "AUTOPLAY_BLOCKED"; eventId: string }
  | { type: "UNLOCK"; eventId: string }
  | { type: "ADVANCE"; eventId: string; trackCount: number }
  | { type: "DISARM" }
  | { type: "STOP" };

/** Pointer dwell over the chip before playback arms (PRD: ~700 ms). */
export const HOVER_ARM_MS = 700;
/** Volume ramp 0 → 1 on fade-in (PRD: 2–3 s). */
export const FADE_IN_MS = 2500;
/** Volume ramp to 0 on mouse-leave (PRD: ~400 ms). */
export const FADE_OUT_MS = 400;

export const initialHoverPlayerState: HoverPlayerState = {
  phase: "idle",
  eventId: null,
  trackIndex: 0,
  unlocked: false,
};

/**
 * Sink guard for a preview MP3 before it is assigned to `<audio>.src` (PRD 46/17 discipline: audio
 * src built at the sink from validated URLs only). Spotify serves 30-second previews from its
 * `scdn.co` CDN over https — anything else is refused so no tainted value reaches the media sink.
 */
export function isSafePreviewUrl(url: string | null | undefined): url is string {
  if (typeof url !== "string" || url.length === 0) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && /(^|\.)scdn\.co$/.test(parsed.hostname);
  } catch {
    return false;
  }
}

/** Whether the pre-play indicator (pulsing ♫ / filling ring) should show for this state. */
export function isArmed(state: HoverPlayerState): boolean {
  return state.phase === "arming" || state.phase === "loading";
}

/** Whether audio is (or is about to be) playing for this event. */
export function isPlaying(state: HoverPlayerState, eventId: string): boolean {
  return state.eventId === eventId && state.phase === "playing";
}

export function hoverPlayerReducer(
  state: HoverPlayerState,
  action: HoverPlayerAction
): HoverPlayerState {
  switch (action.type) {
    case "ARM": {
      // Already engaged with this exact event — no-op (keeps the indicator/audio steady).
      if (state.eventId === action.eventId && state.phase !== "idle") {
        return state;
      }
      // Single-player hand-off: switching to any other event resets the track cursor and re-arms.
      return { ...state, phase: "arming", eventId: action.eventId, trackIndex: 0 };
    }

    case "DWELL_COMPLETE": {
      // Ignore a dwell timer that fired for an event we've already left (or already advanced past).
      if (state.eventId !== action.eventId || state.phase !== "arming") {
        return state;
      }
      return { ...state, phase: "loading" };
    }

    case "LOADED": {
      if (state.eventId !== action.eventId || state.phase !== "loading") {
        return state;
      }
      // Nothing playable (no preview URLs) — drop to idle; the UI shows the "open to listen" nudge.
      if (action.trackCount <= 0) {
        return { ...state, phase: "idle", eventId: null, trackIndex: 0 };
      }
      // Tracks are ready; the hook now attempts play() and reports back via PLAY_CONFIRMED /
      // AUTOPLAY_BLOCKED. Stay in `loading` until it does.
      return state;
    }

    case "PLAY_CONFIRMED": {
      if (state.eventId !== action.eventId) {
        return state;
      }
      return { ...state, phase: "playing", unlocked: true };
    }

    case "AUTOPLAY_BLOCKED": {
      if (state.eventId !== action.eventId) {
        return state;
      }
      return { ...state, phase: "blocked" };
    }

    case "UNLOCK": {
      // The click that unlocks IS a user gesture — it plays and enables hover-play for the session.
      if (state.eventId !== action.eventId) {
        return state;
      }
      return { ...state, phase: "playing", unlocked: true };
    }

    case "ADVANCE": {
      if (state.eventId !== action.eventId || state.phase !== "playing") {
        return state;
      }
      const next = state.trackIndex + 1;
      // Ran off the end of the playlist — stop cleanly.
      if (next >= action.trackCount) {
        return { ...state, phase: "idle", eventId: null, trackIndex: 0 };
      }
      return { ...state, trackIndex: next };
    }

    case "DISARM":
    case "STOP": {
      if (state.phase === "idle") {
        return state;
      }
      return { ...state, phase: "idle", eventId: null, trackIndex: 0 };
    }

    default:
      return state;
  }
}
