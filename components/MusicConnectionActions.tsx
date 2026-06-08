"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SPOTIFY_LIMITED_BETA_CODE } from "@/lib/spotify-limited-access";

type ActionState = {
  kind: "idle" | "success" | "notice" | "error";
  message: string;
};

type MusicConnectionActionsProps = {
  tasteOptedOut: boolean;
};

export function MusicConnectionActions({ tasteOptedOut }: MusicConnectionActionsProps) {
  const router = useRouter();
  const [state, setState] = useState<ActionState>({ kind: "idle", message: "" });
  const [pendingAction, setPendingAction] = useState<"sync" | "toggle" | "delete" | null>(null);

  async function syncSpotify() {
    setPendingAction("sync");
    setState({ kind: "idle", message: "Syncing..." });

    try {
      const response = await fetch("/api/me/music-profile", {
        body: JSON.stringify({ provider: "spotify" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as { code?: string; error?: string };

      if (!response.ok) {
        setState({
          kind: data.code === SPOTIFY_LIMITED_BETA_CODE ? "notice" : "error",
          message: data.error ?? "Could not sync Spotify.",
        });
        return;
      }

      setState({ kind: "success", message: "Spotify taste synced." });
      router.refresh();
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not sync Spotify.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function toggleSpotifyBestMatch() {
    setPendingAction("toggle");
    setState({ kind: "idle", message: tasteOptedOut ? "Resuming..." : "Pausing..." });

    try {
      const response = await fetch("/api/me/music-connections", {
        body: JSON.stringify({ provider: "spotify", tasteOptOut: !tasteOptedOut }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not update Spotify matching.");
      }

      setState({
        kind: "success",
        message: tasteOptedOut ? "Spotify Best Match resumed." : "Spotify Best Match paused.",
      });
      router.refresh();
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not update Spotify matching.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function deleteSpotifyData() {
    setPendingAction("delete");
    setState({ kind: "idle", message: "Deleting Spotify data..." });

    try {
      const response = await fetch("/api/me/music-profile", {
        body: JSON.stringify({ provider: "spotify" }),
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not disconnect Spotify.");
      }

      setState({ kind: "success", message: "Spotify data removed." });
      router.refresh();
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not delete Spotify data.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="music-actions">
      <button disabled={pendingAction === "sync"} onClick={syncSpotify} type="button">
        Sync Spotify
      </button>
      <button disabled={pendingAction === "toggle"} onClick={toggleSpotifyBestMatch} type="button">
        {tasteOptedOut ? "Use for Best Match" : "Pause Best Match"}
      </button>
      <button disabled={pendingAction === "delete"} onClick={deleteSpotifyData} type="button">
        Delete Spotify data
      </button>
      {state.message ? <p className={`form-message ${state.kind}`}>{state.message}</p> : null}
    </div>
  );
}
