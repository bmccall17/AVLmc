"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  FADE_IN_MS,
  FADE_OUT_MS,
  HOVER_ARM_MS,
  hoverPlayerReducer,
  initialHoverPlayerState,
  type HoverPlayerPhase,
} from "@/lib/hover-player-core";
import { isSafeAudiusStreamUrl, type AudiusPreviewResult } from "@/lib/audius-core";

/** Where the artist-name → Audius lookup is in its lifecycle. */
export type AudiusSearchPhase = "idle" | "searching" | "ready" | "no_match" | "error";

export type AudiusPreview = {
  searchPhase: AudiusSearchPhase;
  result: AudiusPreviewResult | null;
  /** Live playback phase from the shared hover-player state machine. */
  playback: HoverPlayerPhase;
  /** True once a user gesture has unlocked audio for this session (survives later autoplay blocks). */
  unlocked: boolean;
  /** Run the Audius search for an artist name. */
  search: (artistName: string) => Promise<void>;
  /** Begin the delayed-fade-in hover preview (no-op unless a playable match is ready). */
  arm: () => void;
  /** Leaving the card — fade out cleanly. */
  disarm: () => void;
  /** The "click ♫ to listen" gesture that unlocks + plays after an autoplay block. */
  unlock: () => void;
  /** Hard stop. */
  stop: () => void;
};

/**
 * Card FX Lab controller for evaluating Audius as an event-card preview provider. Two concerns:
 *
 *   1. Search — POSTs the event's artist name to the admin Audius route and exposes the match
 *      confidence, chosen track, attribution, source link, and error state for the lab readout.
 *   2. Hover preview — drives the *shipped* board hover contract against the resolved Audius stream:
 *      a ~700 ms dwell before playback, a 2–3 s fade-in, a ~400 ms fade-out on leave, a single shared
 *      `<audio>` element (so only one preview ever plays), and a "click to listen" nudge when the
 *      browser blocks autoplay. Transitions come from the same pure reducer the production board uses
 *      (lib/hover-player-core.ts); only the source (an Audius stream instead of a Spotify preview MP3)
 *      and its sink guard (isSafeAudiusStreamUrl) differ.
 */
export function useAudiusPreview(): AudiusPreview {
  const [searchPhase, setSearchPhase] = useState<AudiusSearchPhase>("idle");
  const [result, setResult] = useState<AudiusPreviewResult | null>(null);
  const [state, dispatch] = useReducer(hoverPlayerReducer, initialHoverPlayerState);

  const stateRef = useRef(state);
  stateRef.current = state;
  const resultRef = useRef(result);
  resultRef.current = result;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dwellTimer = useRef<number | null>(null);
  const fadeRaf = useRef<number | null>(null);
  const searchSeq = useRef(0);

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
      stopAudioImmediate();
      dispatch({ type: "STOP" });
    });
    audioRef.current = el;
    return el;
  }, [stopAudioImmediate]);

  // The current playable stream URL, or null if the last search didn't yield one.
  const currentStreamUrl = useCallback((): string | null => {
    const r = resultRef.current;
    return r && r.status === "ok" && isSafeAudiusStreamUrl(r.streamUrl) ? r.streamUrl : null;
  }, []);

  const play = useCallback(
    async (trackId: string, fadeIn: boolean): Promise<void> => {
      const streamUrl = currentStreamUrl();
      const audio = getAudio();
      if (!streamUrl || !audio) {
        return;
      }
      cancelFade();
      audio.src = streamUrl;
      audio.volume = fadeIn ? 0 : 1;
      try {
        await audio.play();
      } catch (error) {
        if (isNotAllowedError(error)) {
          dispatch({ type: "AUTOPLAY_BLOCKED", eventId: trackId });
        }
        return;
      }
      // The pointer may have left during the play() await — bail without leaving audio running.
      if (stateRef.current.eventId !== trackId) {
        audio.pause();
        return;
      }
      dispatch({ type: "PLAY_CONFIRMED", eventId: trackId });
      if (fadeIn) {
        rampVolume(0, 1, FADE_IN_MS);
      } else {
        audio.volume = 1;
      }
    },
    [cancelFade, currentStreamUrl, getAudio, rampVolume]
  );

  const arm = useCallback(() => {
    const r = resultRef.current;
    if (!r || r.status !== "ok") {
      return;
    }
    const trackId = r.match.track.id;
    const previous = stateRef.current;
    if (previous.eventId === trackId && previous.phase !== "idle") {
      return;
    }
    // Single-player hand-off: silence anything playing before arming this preview.
    stopAudioImmediate();
    clearDwell();
    dispatch({ type: "ARM", eventId: trackId });
    dwellTimer.current = window.setTimeout(() => {
      dwellTimer.current = null;
      if (stateRef.current.eventId !== trackId || stateRef.current.phase !== "arming") {
        return;
      }
      dispatch({ type: "DWELL_COMPLETE", eventId: trackId });
      dispatch({ type: "LOADED", eventId: trackId, trackCount: 1 });
      void play(trackId, true);
    }, HOVER_ARM_MS);
  }, [clearDwell, play, stopAudioImmediate]);

  const disarm = useCallback(() => {
    if (stateRef.current.phase === "idle") {
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
  }, [clearDwell, rampVolume, stopAudioImmediate]);

  const unlock = useCallback(() => {
    const eventId = stateRef.current.eventId;
    if (!eventId) {
      return;
    }
    dispatch({ type: "UNLOCK", eventId });
    void play(eventId, true);
  }, [play]);

  const stop = useCallback(() => {
    clearDwell();
    stopAudioImmediate();
    dispatch({ type: "STOP" });
  }, [clearDwell, stopAudioImmediate]);

  const search = useCallback(
    async (artistName: string): Promise<void> => {
      const query = artistName.trim();
      const seq = ++searchSeq.current;
      stop();
      if (!query) {
        setSearchPhase("idle");
        setResult(null);
        return;
      }
      setSearchPhase("searching");
      try {
        const response = await fetch(
          `/api/admin/audius-preview?artist=${encodeURIComponent(query)}`
        );
        const data = (await response.json().catch(() => null)) as AudiusPreviewResult | null;
        if (seq !== searchSeq.current) {
          return; // a newer search superseded this one
        }
        if (!response.ok || !data) {
          setResult(
            data ?? { status: "error", query, message: `Lookup failed (${response.status}).` }
          );
          setSearchPhase("error");
          return;
        }
        setResult(data);
        setSearchPhase(
          data.status === "ok" ? "ready" : data.status === "no_match" ? "no_match" : "error"
        );
      } catch {
        if (seq !== searchSeq.current) {
          return;
        }
        setResult({ status: "error", query, message: "Could not reach the preview service." });
        setSearchPhase("error");
      }
    },
    [stop]
  );

  // Escape stops playback from anywhere (mirrors the production board).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && stateRef.current.phase !== "idle") {
        stop();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stop]);

  // Teardown: never leave audio playing or a timer armed after unmount.
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

  return {
    searchPhase,
    result,
    playback: state.phase,
    unlocked: state.unlocked,
    search,
    arm,
    disarm,
    unlock,
    stop,
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isNotAllowedError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotAllowedError";
}
