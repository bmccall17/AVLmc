"use client";

import type { ReactNode } from "react";

type TicketIntentLinkProps = {
  children: ReactNode;
  className?: string;
  eventId: string;
  eventTitle: string;
  href: string;
};

export function TicketIntentLink({
  children,
  className,
  eventId,
  eventTitle,
  href,
}: TicketIntentLinkProps) {
  function recordTicketClick() {
    void fetch("/api/community/ticket-intents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, eventTitle }),
    }).catch(() => undefined);
  }

  return (
    <a className={className} href={href} onClick={recordTicketClick} target="_blank">
      {children}
    </a>
  );
}
