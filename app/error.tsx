"use client";

import Link from "next/link";
import { useEffect } from "react";

// Route-level error boundary. Converts a transient server-side failure (e.g. a database
// connection blip under heavy traffic) into a calm, branded retry screen instead of the raw
// "Application error" overlay. Client component per Next.js App Router requirements.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error boundary:", error);
  }, [error]);

  return (
    <main className="shell" style={{ textAlign: "center", paddingTop: 80 }}>
      <h1>We&apos;re catching our breath</h1>
      <p style={{ maxWidth: 460, margin: "12px auto 24px", lineHeight: 1.5 }}>
        AVL Music Companion hit a brief hiccup loading this page — usually a momentary spike.
        Give it a second and try again.
      </p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <button className="primary-action" onClick={() => reset()} type="button">
          Try again
        </button>
        <Link className="back-link" href="/">
          Back to all shows
        </Link>
      </div>
    </main>
  );
}
