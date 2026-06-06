"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ActionState = {
  kind: "idle" | "success" | "error";
  message: string;
};

export function MusicConnectionActions() {
  const router = useRouter();
  const [state, setState] = useState<ActionState>({ kind: "idle", message: "" });
  const [pendingAction, setPendingAction] = useState<"sync" | "disconnect" | null>(null);

  async function syncSpotify() {
    setPendingAction("sync");
    setState({ kind: "idle", message: "Syncing..." });

    try {
      const response = await fetch("/api/me/music-profile", {
        body: JSON.stringify({ provider: "spotify" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not sync Spotify.");
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

  async function disconnectSpotify() {
    setPendingAction("disconnect");
    setState({ kind: "idle", message: "Disconnecting..." });

    try {
      const response = await fetch("/api/me/music-connections", {
        body: JSON.stringify({ provider: "spotify" }),
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not disconnect Spotify.");
      }

      setState({ kind: "success", message: "Spotify profile data removed." });
      router.refresh();
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not disconnect Spotify.",
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
      <button disabled={pendingAction === "disconnect"} onClick={disconnectSpotify} type="button">
        Disconnect
      </button>
      {state.message ? <p className={`form-message ${state.kind}`}>{state.message}</p> : null}
    </div>
  );
}
