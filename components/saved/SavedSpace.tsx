"use client";

import { useState } from "react";
import Link from "next/link";
import { SaveButton } from "@/components/SaveButton";

export type SavedEventRow = {
  itemKey: string;
  label: string;
  dateLabel: string | null;
  venueName: string | null;
  available: boolean;
};

export type SavedSimpleRow = {
  itemKey: string;
  label: string;
};

type SavedSpaceProps = {
  events: SavedEventRow[];
  venues: SavedSimpleRow[];
  artists: SavedSimpleRow[];
};

/**
 * The Saved space (PRD 13 / C2): three private, scannable lists — Events, Venues, Artists —
 * with per-list counts, empty states, working links, and inline un-save (reusing C1's SaveButton).
 * Un-saving drops the row optimistically.
 */
export function SavedSpace({ events, venues, artists }: SavedSpaceProps) {
  const [eventRows, setEventRows] = useState(events);
  const [venueRows, setVenueRows] = useState(venues);
  const [artistRows, setArtistRows] = useState(artists);

  return (
    <div className="saved-space">
      <SavedSection
        count={eventRows.length}
        emptyHint="No saved shows yet — tap the bookmark on an event to keep it here."
        title="Events"
      >
        {eventRows.map((row) => (
          <li className="saved-row" key={row.itemKey}>
            <div className="saved-row-main">
              {row.available ? (
                <Link className="saved-row-title" href={`/event/${row.itemKey}`}>
                  {row.label}
                </Link>
              ) : (
                <span className="saved-row-title is-unavailable">{row.label}</span>
              )}
              <span className="saved-row-meta">
                {[row.dateLabel, row.venueName].filter(Boolean).join(" · ") ||
                  (row.available ? "" : "No longer on the board")}
              </span>
            </div>
            <SaveButton
              eventId={row.itemKey}
              initialSaved
              isSignedIn
              itemKey={row.itemKey}
              itemType="event"
              label={row.label}
              onToggle={(saved) => {
                if (!saved) {
                  setEventRows((rows) => rows.filter((entry) => entry.itemKey !== row.itemKey));
                }
              }}
            />
          </li>
        ))}
      </SavedSection>

      <SavedSection
        count={venueRows.length}
        emptyHint="No saved venues yet — tap the bookmark on a venue to keep it here."
        title="Venues"
      >
        {venueRows.map((row) => (
          <SavedSimpleItem
            itemType="venue"
            key={row.itemKey}
            onRemoved={() =>
              setVenueRows((rows) => rows.filter((entry) => entry.itemKey !== row.itemKey))
            }
            row={row}
          />
        ))}
      </SavedSection>

      <SavedSection
        count={artistRows.length}
        emptyHint="No saved artists yet — tap the bookmark on an artist to keep it here."
        title="Artists"
      >
        {artistRows.map((row) => (
          <SavedSimpleItem
            itemType="artist"
            key={row.itemKey}
            onRemoved={() =>
              setArtistRows((rows) => rows.filter((entry) => entry.itemKey !== row.itemKey))
            }
            row={row}
          />
        ))}
      </SavedSection>
    </div>
  );
}

function SavedSection({
  children,
  count,
  emptyHint,
  title,
}: {
  children: React.ReactNode;
  count: number;
  emptyHint: string;
  title: string;
}) {
  return (
    <section className="saved-section" aria-label={title}>
      <header className="saved-section-header">
        <h2>{title}</h2>
        <span className="saved-count">{count}</span>
      </header>
      {count === 0 ? (
        <p className="saved-empty">{emptyHint}</p>
      ) : (
        <ul className="saved-list">{children}</ul>
      )}
    </section>
  );
}

function SavedSimpleItem({
  itemType,
  onRemoved,
  row,
}: {
  itemType: "venue" | "artist";
  onRemoved: () => void;
  row: SavedSimpleRow;
}) {
  return (
    <li className="saved-row">
      <Link className="saved-row-title" href={`/?q=${encodeURIComponent(row.label)}`}>
        {row.label}
      </Link>
      <SaveButton
        initialSaved
        isSignedIn
        itemKey={row.label}
        itemType={itemType}
        label={row.label}
        onToggle={(saved) => {
          if (!saved) {
            onRemoved();
          }
        }}
      />
    </li>
  );
}
