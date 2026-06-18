"use client";

import { useEffect, useState } from "react";

type AdminSpotifyAccessRequest = {
  id: string;
  status: "pending" | "slot_added" | "approved" | "rejected";
  spotifyEmail: string;
  accountEmail: string | null;
  requestedAt: string | null;
};

/**
 * Admin Spotify tester-slot access review (PRD 36 / Phase 15). Lists the open request queue with
 * each listener's Spotify email and a one-click "mark slot-added" once they've been added in the
 * Spotify Developer Dashboard (the slot add is an external action — this only tracks it). Admin-cookie
 * gated by the API. Mirrors CuratorAdminPanel.
 */
export function SpotifyAccessSection() {
  const [requests, setRequests] = useState<AdminSpotifyAccessRequest[]>([]);
  const [message, setMessage] = useState<string>("");

  async function refresh() {
    const response = await fetch("/api/admin/spotify-access", { cache: "no-store" });
    if (response.ok) {
      const data = (await response.json()) as { requests?: AdminSpotifyAccessRequest[] };
      setRequests(data.requests ?? []);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function setStatus(id: string, status: AdminSpotifyAccessRequest["status"]) {
    setMessage("Updating…");
    const response = await fetch("/api/admin/spotify-access", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const data = (await response.json()) as { error?: string };
    setMessage(response.ok ? "Updated." : data.error ?? "Could not update.");
    void refresh();
  }

  return (
    <section className="admin-curators">
      <h2>Spotify tester access</h2>
      <p>
        Spotify is in Development Mode — a hard 25-user allowlist. To approve a request, add the
        listener&apos;s Spotify email under <strong>User Management</strong> in the{" "}
        <a
          href="https://developer.spotify.com/dashboard"
          rel="noreferrer noopener"
          target="_blank"
        >
          Spotify Developer Dashboard
        </a>{" "}
        (≤25 users), or apply for <strong>Extended Quota</strong> to lift the cap. Then mark it
        slot-added so the listener knows to retry.
      </p>
      {message ? <p className="admin-curators-message">{message}</p> : null}

      <h3>Open requests ({requests.length})</h3>
      <ul className="admin-curators-list">
        {requests.map((request) => (
          <li key={request.id}>
            <span>
              <strong>{request.spotifyEmail}</strong>{" "}
              <small>
                {request.status === "slot_added" ? "slot added — awaiting retry" : "pending"}
                {request.accountEmail ? ` · account ${request.accountEmail}` : ""}
              </small>
            </span>
            <span className="admin-curators-actions">
              {request.status === "pending" ? (
                <button onClick={() => void setStatus(request.id, "slot_added")} type="button">
                  Mark slot-added
                </button>
              ) : null}
              <button onClick={() => void setStatus(request.id, "approved")} type="button">
                Approve
              </button>
              <button onClick={() => void setStatus(request.id, "rejected")} type="button">
                Reject
              </button>
            </span>
          </li>
        ))}
        {requests.length === 0 ? <li className="empty-copy">No open access requests.</li> : null}
      </ul>
    </section>
  );
}
