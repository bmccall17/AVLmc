"use client";

import { useEffect, useState } from "react";

type AdminCurator = {
  id: string;
  userId: string;
  handle: string;
  displayName: string;
  bio: string | null;
  status: "active" | "hidden";
};

/**
 * Admin curators management (PRD 25 / C3). Promote a user to curator, toggle visibility, and add a
 * pick to an event. Admin-cookie gated by the API it calls; no self-serve, no pay-to-play path.
 */
export function CuratorAdminPanel() {
  const [curators, setCurators] = useState<AdminCurator[]>([]);
  const [message, setMessage] = useState<string>("");
  const [userId, setUserId] = useState("");
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");

  async function refresh() {
    const response = await fetch("/api/admin/curators", { cache: "no-store" });
    if (response.ok) {
      const data = (await response.json()) as { curators?: AdminCurator[] };
      setCurators(data.curators ?? []);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function promote() {
    setMessage("Promoting…");
    const response = await fetch("/api/admin/curators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: Number(userId), handle, displayName, bio }),
    });
    const data = (await response.json()) as { error?: string };
    if (response.ok) {
      setMessage(`Promoted @${handle}.`);
      setUserId("");
      setHandle("");
      setDisplayName("");
      setBio("");
      void refresh();
    } else {
      setMessage(data.error ?? "Could not promote.");
    }
  }

  async function toggleStatus(curator: AdminCurator) {
    const nextStatus = curator.status === "active" ? "hidden" : "active";
    await fetch("/api/admin/curators", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: curator.id, status: nextStatus }),
    });
    void refresh();
  }

  return (
    <section className="admin-curators">
      <h2>Curators</h2>
      <p>Promote a listener to a public curator persona. Admin-only — no self-serve, no pay-to-play.</p>

      <div className="admin-curators-form">
        <input onChange={(e) => setUserId(e.target.value)} placeholder="User id" value={userId} />
        <input onChange={(e) => setHandle(e.target.value)} placeholder="handle (a-z0-9-_)" value={handle} />
        <input onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" value={displayName} />
        <input onChange={(e) => setBio(e.target.value)} placeholder="Bio (optional)" value={bio} />
        <button onClick={() => void promote()} type="button">Promote</button>
      </div>
      {message ? <p className="admin-curators-message">{message}</p> : null}

      <ul className="admin-curators-list">
        {curators.map((curator) => (
          <li key={curator.id}>
            <span>
              <strong>{curator.displayName}</strong> <small>@{curator.handle} · {curator.status}</small>
            </span>
            <button onClick={() => void toggleStatus(curator)} type="button">
              {curator.status === "active" ? "Hide" : "Show"}
            </button>
          </li>
        ))}
        {curators.length === 0 ? <li className="empty-copy">No curators yet.</li> : null}
      </ul>
    </section>
  );
}
