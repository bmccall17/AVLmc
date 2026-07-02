"use client";

import { useEffect, useState } from "react";

type TesterRequest = {
  id: string;
  email: string;
  note: string | null;
  source: string;
  status: "pending" | "approved" | "declined" | "invited";
  updatedAt: string | null;
};

type SeatBudget = { used: number; budget: number; warnAt: number };

/**
 * Admin tester-request review (PRD 42 / Phase 17): the anonymous email-keyed queue from
 * /spotify-access, with the seat counter spanning both request stores. Approve enforces the order —
 * allowlist the email in the Spotify Developer Dashboard FIRST, then approve here (which sends the
 * "you're in" invite). Rendered on /admin/spotify-access beside the signed-in queue (PRD 36).
 */
export function TesterRequestsSection() {
  const [requests, setRequests] = useState<TesterRequest[]>([]);
  const [seats, setSeats] = useState<SeatBudget | null>(null);
  const [message, setMessage] = useState<string>("");
  const [loadError, setLoadError] = useState<string | null>(null);

  async function refresh() {
    try {
      const response = await fetch("/api/admin/tester-requests", { cache: "no-store" });
      if (!response.ok) {
        setLoadError(`Couldn't load tester requests (HTTP ${response.status}). The queue may be incomplete.`);
        return;
      }
      const data = (await response.json()) as { requests?: TesterRequest[]; seats?: SeatBudget };
      setRequests(data.requests ?? []);
      setSeats(data.seats ?? null);
      setLoadError(null);
    } catch {
      setLoadError("Couldn't reach the tester-requests API. Check your connection and retry.");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function act(id: string, action: "approve" | "decline" | "reopen") {
    if (
      action === "approve" &&
      !window.confirm(
        "Order matters: add this email under User Management in the Spotify Developer Dashboard FIRST — otherwise their sign-in still hits Spotify's 403. Added it? Approving sends the \"you're in\" invite email."
      )
    ) {
      return;
    }
    setMessage("Updating…");
    const response = await fetch("/api/admin/tester-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const data = (await response.json()) as { error?: string; inviteSent?: boolean };
    if (!response.ok) {
      setMessage(data.error ?? "Could not update.");
    } else if (action === "approve") {
      setMessage(
        data.inviteSent
          ? "Approved — invite email sent."
          : "Approved, but the invite email failed to send. Approve again to retry the send."
      );
    } else {
      setMessage("Updated.");
    }
    void refresh();
  }

  const seatsFull = seats ? seats.used >= seats.budget : false;
  const seatsWarn = seats ? seats.used >= seats.warnAt : false;

  return (
    <section className="admin-curators">
      <h2>Tester requests (email list)</h2>
      <p>
        Anonymous requests from the public <strong>/spotify-access</strong> form — people we caught
        before Spotify&apos;s 403 could strand them. Approving here assumes you already added the
        email in the Spotify Developer Dashboard; approval sends the &ldquo;you&apos;re in&rdquo;
        invite email.
      </p>
      {seats ? (
        <p className={seatsWarn ? "admin-curators-error" : "admin-curators-message"}>
          Development Mode seats: <strong>{seats.used} / {seats.budget}</strong> used
          {seatsFull
            ? " — the allowlist is full; free a seat in the Spotify dashboard before approving more."
            : seatsWarn
              ? " — nearly full."
              : "."}
        </p>
      ) : null}
      {message ? <p className="admin-curators-message">{message}</p> : null}
      {loadError ? (
        <p className="admin-curators-error">
          {loadError}
          <button onClick={() => void refresh()} type="button">
            Retry
          </button>
        </p>
      ) : null}

      <h3>Requests{loadError ? "" : ` (${requests.length})`}</h3>
      <ul className="admin-curators-list">
        {requests.map((request) => (
          <li key={request.id}>
            <span>
              <strong>{request.email}</strong>{" "}
              <small>
                {request.status}
                {request.source !== "direct" ? ` · via ${request.source}` : ""}
                {request.note ? ` · “${request.note}”` : ""}
              </small>
            </span>
            <span className="admin-curators-actions">
              {request.status === "pending" ? (
                <>
                  <button onClick={() => void act(request.id, "approve")} type="button">
                    Approve + invite
                  </button>
                  <button onClick={() => void act(request.id, "decline")} type="button">
                    Decline
                  </button>
                </>
              ) : null}
              {request.status === "approved" ? (
                <button onClick={() => void act(request.id, "approve")} type="button">
                  Resend invite
                </button>
              ) : null}
              {request.status === "declined" ? (
                <button onClick={() => void act(request.id, "reopen")} type="button">
                  Re-open
                </button>
              ) : null}
            </span>
          </li>
        ))}
        {requests.length === 0 && !loadError ? (
          <li className="empty-copy">No tester requests yet.</li>
        ) : null}
      </ul>
    </section>
  );
}
