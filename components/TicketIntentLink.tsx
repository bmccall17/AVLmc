"use client";

import type { ReactNode } from "react";

type TicketIntentLinkProps = {
  ariaDescribedBy?: string;
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
  eventId: string;
  eventTitle: string;
  href: string;
  /** Hover tooltip explaining where the link goes. */
  title?: string;
};

export function TicketIntentLink({
  ariaDescribedBy,
  ariaLabel,
  children,
  className,
  eventId,
  eventTitle,
  href,
  title,
}: TicketIntentLinkProps) {
  function recordTicketClick() {
    void fetch("/api/community/ticket-intents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, eventTitle }),
    }).catch(() => undefined);
  }

  return (
    <a
      aria-describedby={ariaDescribedBy}
      aria-label={ariaLabel}
      className={className}
      href={href}
      onClick={recordTicketClick}
      rel="noreferrer noopener"
      target="_blank"
      title={title}
    >
      {children}
    </a>
  );
}
