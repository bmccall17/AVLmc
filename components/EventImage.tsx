"use client";

import { useState } from "react";

type EventImageProps = {
  src: string | null;
  alt?: string;
  className: string;
  fallbackLabel?: string;
  loading?: "eager" | "lazy";
};

export function EventImage({
  src,
  alt = "",
  className,
  fallbackLabel = "Live music",
  loading = "lazy"
}: EventImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className={`${className} event-image-empty`} aria-hidden="true">
        <span>{fallbackLabel}</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
