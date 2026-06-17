"use client";

import { useEffect, useState } from "react";

type AdminCurator = {
  id: string;
  userId: string;
  handle: string;
  displayName: string;
  bio: string | null;
  status: "active" | "hidden" | "pending" | "rejected";
};

type CuratorApplication = {
  id: string;
  userId: string;
  handle: string;
  displayName: string;
  bio: string | null;
  note: string | null;
  createdAt: string | null;
};

type NotActivatedCurator = {
  id: string;
  userId: string;
  handle: string;
  displayName: string;
};

type Gate = {
  open: boolean;
  activeCurators: number;
  users: number;
  maxCurators: number;
  maxUsers: number;
};

/**
 * Admin curators management (PRD 25 / C3) + self-serve oversight (PRD 33 / C5). Promote a user,
 * toggle visibility, review the self-serve pending queue (approve/reject), and read curator-growth
 * vs. the gate + the not-activated set. Admin-cookie gated by the API; no pay-to-play path.
 */
export function CuratorAdminPanel() {
  const [curators, setCurators] = useState<AdminCurator[]>([]);
  const [applications, setApplications] = useState<CuratorApplication[]>([]);
  const [notActivated, setNotActivated] = useState<NotActivatedCurator[]>([]);
  const [gate, setGate] = useState<Gate | null>(null);
  const [message, setMessage] = useState<string>("");
  const [userId, setUserId] = useState("");
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");

  async function refresh() {
    const response = await fetch("/api/admin/curators", { cache: "no-store" });
    if (response.ok) {
      const data = (await response.json()) as {
        curators?: AdminCurator[];
        applications?: CuratorApplication[];
        notActivated?: NotActivatedCurator[];
        gate?: Gate;
      };
      setCurators(data.curators ?? []);
      setApplications(data.applications ?? []);
      setNotActivated(data.notActivated ?? []);
      setGate(data.gate ?? null);
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

  async function setStatus(id: string, status: AdminCurator["status"]) {
    await fetch("/api/admin/curators", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    void refresh();
  }

  async function toggleStatus(curator: AdminCurator) {
    await setStatus(curator.id, curator.status === "active" ? "hidden" : "active");
  }

  return (
    <section className="admin-curators">
      <h2>Curators</h2>
      <p>Promote a listener to a public curator persona. No pay-to-play.</p>

      {gate ? (
        <p className="admin-curators-gate">
          Self-serve is <strong>{gate.open ? "instant" : "admin-reviewed"}</strong> — {gate.activeCurators}/
          {gate.maxCurators} active curators, {gate.users}/{gate.maxUsers} users. New applications{" "}
          {gate.open ? "go live immediately" : "land in the pending queue below"}.
        </p>
      ) : null}

      <div className="admin-curators-form">
        <input onChange={(e) => setUserId(e.target.value)} placeholder="User id" value={userId} />
        <input onChange={(e) => setHandle(e.target.value)} placeholder="handle (a-z0-9-_)" value={handle} />
        <input onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" value={displayName} />
        <input onChange={(e) => setBio(e.target.value)} placeholder="Bio (optional)" value={bio} />
        <button onClick={() => void promote()} type="button">Promote</button>
      </div>
      {message ? <p className="admin-curators-message">{message}</p> : null}

      <h3>Pending applications ({applications.length})</h3>
      <ul className="admin-curators-list">
        {applications.map((application) => (
          <li key={application.id}>
            <span>
              <strong>{application.displayName}</strong> <small>@{application.handle}</small>
              {application.note ? <small className="admin-curators-note">“{application.note}”</small> : null}
            </span>
            <span className="admin-curators-actions">
              <button onClick={() => void setStatus(application.id, "active")} type="button">
                Approve
              </button>
              <button onClick={() => void setStatus(application.id, "rejected")} type="button">
                Reject
              </button>
            </span>
          </li>
        ))}
        {applications.length === 0 ? <li className="empty-copy">No pending applications.</li> : null}
      </ul>

      <h3>Not activated ({notActivated.length})</h3>
      <p className="admin-curators-subtle">Active curators with no visible picks yet — weak directory entries.</p>
      <ul className="admin-curators-list">
        {notActivated.map((curator) => (
          <li key={curator.id}>
            <span>
              <strong>{curator.displayName}</strong> <small>@{curator.handle}</small>
            </span>
            <button onClick={() => void setStatus(curator.id, "hidden")} type="button">
              Hide
            </button>
          </li>
        ))}
        {notActivated.length === 0 ? <li className="empty-copy">All curators have picks.</li> : null}
      </ul>

      <h3>All curators</h3>
      <ul className="admin-curators-list">
        {curators.map((curator) => (
          <li key={curator.id}>
            <span>
              <strong>{curator.displayName}</strong> <small>@{curator.handle} · {curator.status}</small>
            </span>
            {curator.status === "active" || curator.status === "hidden" ? (
              <button onClick={() => void toggleStatus(curator)} type="button">
                {curator.status === "active" ? "Hide" : "Show"}
              </button>
            ) : null}
          </li>
        ))}
        {curators.length === 0 ? <li className="empty-copy">No curators yet.</li> : null}
      </ul>
    </section>
  );
}
