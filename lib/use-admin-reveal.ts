"use client";

import { useEffect, useState } from "react";

/**
 * Client-side admin probe. Whether the viewer holds an admin session is decided
 * server-side (httpOnly cookie the client can't read), so we ask /api/admin/session
 * once and share the answer across every mounted tick via a module-level cache — no
 * prop-threading, no repeated fetches. Non-admins simply never light up the affordance.
 */
let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;
const subscribers = new Set<(value: boolean) => void>();

function resolveAdmin(): Promise<boolean> {
  if (cached !== null) {
    return Promise.resolve(cached);
  }
  if (!inflight) {
    inflight = fetch("/api/admin/session", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : { admin: false }))
      .then((data: { admin?: boolean }) => Boolean(data?.admin))
      .catch(() => false)
      .then((value) => {
        cached = value;
        subscribers.forEach((notify) => notify(value));
        return value;
      });
  }
  return inflight;
}

export function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState<boolean>(cached ?? false);

  useEffect(() => {
    let active = true;
    if (cached !== null) {
      setIsAdmin(cached);
      return;
    }
    const notify = (value: boolean) => {
      if (active) {
        setIsAdmin(value);
      }
    };
    subscribers.add(notify);
    void resolveAdmin();
    return () => {
      active = false;
      subscribers.delete(notify);
    };
  }, []);

  return isAdmin;
}
