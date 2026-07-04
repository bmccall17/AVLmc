"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { PlayableTrack } from "@/app/api/events/[id]/playable-tracks/route";
import {
  FADE_IN_MS,
  FADE_OUT_MS,
  HOVER_ARM_MS,
  hoverPlayerReducer,
  initialHoverPlayerState,
  isSafePreviewUrl,
  type HoverPlayerState,
} from "@/lib/hover-player-core";

export type { PlayableTrack } from "@/app/api/events/[id]/playable-tracks/route";

export type HoverPlayer = {
  state: HoverPlayerState;
  /** Pointer/keyboard dwell began over an event's songs chip — start the arm timer. */
  arm: (eventId: string) => void;
  /** Pointer/focus left the chip — fade out if this event was the one engaged. */
  disarm: (eventId: string) => void;
  /** The click on "click ♫ to listen" — a real gesture that unlocks and plays. */
  unlock: (eventId: string) => void;
  /** Hard stop (Escape / explicit stop control). */
  stop: () => void;
};

/**
 * Board hover-listening controller (PRD 46, Story E). One instance drives one shared `<audio>`
 * element for the whole board, so only ever one event plays. Pointer/keyboard events call
 * arm/disarm; a ~700 ms dwell fetches the event's preview playlist (lazily — nothing loads on
 * initial paint), then fades audio in over 2–3 s. Leaving fades out over ~400 ms. Autoplay blocks
 * before any gesture surface a "click ♫ to listen" nudge instead of failing silently; the unlocking
 * click plays and enables hover-play for the rest of the session. All transitions live in the pure
 * reducer (lib/hover-player-core.ts); every side effect (timers, fetch, audio) lives here.
 */
export function useHoverPlayer(): HoverPlayer {
  const [state, dispatch] = useReducer(hoverPlayerReducer, initialHoverPlayerState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dwellTimer = useRef<number | null>(null);
  const fadeRaf = useRef<number | null>(null);
  const playlists = useRef<Map<string, PlayableTrack[]>>(new Map());

  const clearDwell = useCallback(() => {
    if (dwellTimer.current !== null) {
      window.clearTimeout(dwellTimer.current);
      dwellTimer.current = null;
    }
  }, []);

  const cancelFade = useCallback(() => {
    if (fadeRaf.current !== null) {
      cancelAnimationFrame(fadeRaf.current);
      fadeRaf.current = null;
    }
  }, []);

  const rampVolume = useCallback(
    (from: number, to: number, durationMs: number, onDone?: () => void) => {
      cancelFade();
      const audio = audioRef.current;
      if (!audio) {
        return;
      }
      audio.volume = clamp01(from);
      const start = performance.now();
      const step = (now: number) => {
        const t = durationMs <= 0 ? 1 : Math.min(1, (now - start) / durationMs);
        audio.volume = clamp01(from + (to - from) * t);
        if (t < 1) {
          fadeRaf.current = requestAnimationFrame(step);
        } else {
          fadeRaf.current = null;
          onDone?.();
        }
      };
      fadeRaf.current = requestAnimationFrame(step);
    },
    [cancelFade]
  );

  const stopAudioImmediate = useCallback(() => {
    cancelFade();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.volume = 0;
    }
  }, [cancelFade]);

  const getAudio = useCallback((): HTMLAudioElement | null => {
    if (audioRef.current) {
      return audioRef.current;
    }
    if (typeof Audio === "undefined") {
      return null;
    }
    const el = new Audio();
    el.preload = "none";
    el.volume = 0;
    el.addEventListener("ended", () => {
      const current = stateRef.current;
      if (!current.eventId) {
        return;
      }
      const list = playlists.current.get(current.eventId) ?? [];
      const next = current.trackIndex + 1;
      if (next >= list.length) {
        stopAudioImmediate();
        dispatch({ type: "STOP" });
        return;
      }
      dispatch({ type: "ADVANCE", eventId: current.eventId, trackCount: list.length });
      void playTrack(current.eventId, next, false);
    });
    audioRef.current = el;
    return el;
    // playTrack is declared below and stable via ref pattern; eslint disable to avoid a cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopAudioImmediate]);

  const fetchPlaylist = useCallback(async (eventId: string): Promise<PlayableTrack[]> => {
    const cached = playlists.current.get(eventId);
    if (cached) {
      return cached;
    }
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/playable-tracks`);
      if (!response.ok) {
        return [];
      }
      const data = (await response.json()) as { tracks?: PlayableTrack[] };
      const tracks = (data.tracks ?? []).filter((track) => isSafePreviewUrl(track.previewUrl));
      playlists.current.set(eventId, tracks);
      return tracks;
    } catch {
      return [];
    }
  }, []);

  // Play a specific track. `fadeIn` ramps 0→1 (first track); otherwise it jumps to full volume.
  const playTrack = useCallback(
    async (eventId: string, index: number, fadeIn: boolean): Promise<void> => {
      const list = playlists.current.get(eventId) ?? [];
      const track = list[index];
      const audio = getAudio();
      if (!track || !audio || !isSafePreviewUrl(track.previewUrl)) {
        return;
      }
      cancelFade();
      audio.src = track.previewUrl;
      audio.volume = fadeIn ? 0 : 1;
      try {
        await audio.play();
      } catch (error) {
        if (isNotAllowedError(error)) {
          dispatch({ type: "AUTOPLAY_BLOCKED", eventId });
        }
        return;
      }
      // The pointer may have left during the play() await — bail without leaving audio running.
      if (stateRef.current.eventId !== eventId) {
        audio.pause();
        return;
      }
      dispatch({ type: "PLAY_CONFIRMED", eventId });
      if (fadeIn) {
        rampVolume(0, 1, FADE_IN_MS);
      } else {
        audio.volume = 1;
      }
    },
    [cancelFade, getAudio, rampVolume]
  );

  const beginPlayback = useCallback(
    async (eventId: string): Promise<void> => {
      const list = await fetchPlaylist(eventId);
      if (stateRef.current.eventId !== eventId) {
        return; // left the chip during the fetch
      }
      dispatch({ type: "LOADED", eventId, trackCount: list.length });
      if (list.length === 0) {
        return;
      }
      await playTrack(eventId, 0, true);
    },
    [fetchPlaylist, playTrack]
  );

  const arm = useCallback(
    (eventId: string) => {
      const previous = stateRef.current;
      if (previous.eventId === eventId && previous.phase !== "idle") {
        return;
      }
      // Single-player hand-off: silence whatever was playing before arming the new chip.
      stopAudioImmediate();
      clearDwell();
      dispatch({ type: "ARM", eventId });
      dwellTimer.current = window.setTimeout(() => {
        dwellTimer.current = null;
        dispatch({ type: "DWELL_COMPLETE", eventId });
        void beginPlayback(eventId);
      }, HOVER_ARM_MS);
    },
    [beginPlayback, clearDwell, stopAudioImmediate]
  );

  const disarm = useCallback(
    (eventId: string) => {
      if (stateRef.current.eventId !== eventId) {
        return;
      }
      clearDwell();
      const audio = audioRef.current;
      if (audio && !audio.paused) {
        rampVolume(audio.volume, 0, FADE_OUT_MS, () => audio.pause());
      } else {
        stopAudioImmediate();
      }
      dispatch({ type: "DISARM" });
    },
    [clearDwell, rampVolume, stopAudioImmediate]
  );

  const unlock = useCallback(
    (eventId: string) => {
      dispatch({ type: "UNLOCK", eventId });
      void (async () => {
        const list = await fetchPlaylist(eventId);
        if (stateRef.current.eventId !== eventId || list.length === 0) {
          return;
        }
        await playTrack(eventId, Math.min(stateRef.current.trackIndex, list.length - 1), true);
      })();
    },
    [fetchPlaylist, playTrack]
  );

  const stop = useCallback(() => {
    clearDwell();
    stopAudioImmediate();
    dispatch({ type: "STOP" });
  }, [clearDwell, stopAudioImmediate]);

  // Escape stops playback from anywhere (PRD accessibility requirement).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && stateRef.current.phase !== "idle") {
        stop();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stop]);

  // Teardown: never leave audio playing or a timer armed after unmount/navigation.
  useEffect(() => {
    return () => {
      clearDwell();
      cancelFade();
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = "";
      }
    };
  }, [cancelFade, clearDwell]);

  return { state, arm, disarm, unlock, stop };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isNotAllowedError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotAllowedError";
}
