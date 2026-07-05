/**
 * Taste import — pure parsing (no DB / network), unit-tested in tests/taste-import.test.ts.
 *
 * The seat-free taste path (see docs/product/spotify-extended-quota-request.md and the plan behind
 * PRD 46): a listener exports their playlists from Spotify with a third-party tool (Exportify et al.)
 * or Spotify's own "Download your data", and uploads the resulting CSV. We never call the Spotify API
 * for their private data, so no Development-Mode allowlist seat is spent. Exportify's CSV already
 * carries a `spotify:artist:{id}` URI per track, so v1 needs no catalog resolution at all — the file
 * is authoritative for both the canonical artist id AND name.
 *
 * Output feeds `music_profile_items` (item_type "top_artist"), the SAME store the OAuth /me/top sync
 * writes, so discovery's `buildProfileTerms` (lib/discovery.ts) picks imported artists up for
 * `artistAffinity` with zero scoring changes. Frequency across the file → rank (most-played = rank 1).
 */

export type ImportedArtist = {
  /** Canonical Spotify artist id when the export carries a URI; else a stable `import:<slug>` id. */
  spotifyArtistId: string;
  name: string;
  /** Number of tracks in the export that credit this artist — the affinity strength. */
  count: number;
  /** 1-based, most-frequent first. Drives the profile-term weight in discovery. */
  rank: number;
  /** Artist genres pulled from the export's Genres column, if present — feeds genreAffinity. */
  genres: string[];
};

export type TasteImportResult = {
  artists: ImportedArtist[];
  /** Tracks (data rows) seen in the file, for a human-readable summary. */
  trackRows: number;
  /** True when we located an artist column at all — false means "this doesn't look like an export". */
  recognized: boolean;
};

// Guard against pathological uploads. A generous cap on artists kept; discovery floors the weight of
// deep-rank artists anyway (max(18, 46 - rank)), so beyond a couple hundred adds no signal.
const MAX_ARTISTS = 300;
const MAX_ROWS = 100_000;
const MAX_GENRES_PER_ARTIST = 12;
// Current Exportify joins multiple artists with a semicolon — unambiguous, since artist names never
// contain ";" (they DO contain commas: "Tyler, the Creator"). Commas separate genres, and only
// separate artists in older exports that also carry an Artist URI(s) column to confirm the count.
const COMMA_SEPARATOR = /\s*,\s*/;
const SPOTIFY_ARTIST_URI = /spotify:artist:([A-Za-z0-9]+)/;

/**
 * Parse RFC 4180-ish CSV into rows of string cells. Handles quoted fields, embedded commas/quotes
 * (doubled `""`), and both `\n` and `\r\n` newlines. Tolerant of a trailing newline.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  // Strip a UTF-8 BOM if present so the first header cell matches cleanly.
  if (text.charCodeAt(0) === 0xfeff) {
    i = 1;
  }

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      endField();
      i += 1;
      continue;
    }
    if (char === "\r") {
      // Swallow CRLF as a single row break; a lone CR also ends the row.
      if (text[i + 1] === "\n") {
        i += 1;
      }
      endRow();
      i += 1;
      continue;
    }
    if (char === "\n") {
      endRow();
      i += 1;
      continue;
    }

    field += char;
    i += 1;
    if (rows.length > MAX_ROWS) {
      break;
    }
  }

  // Flush the final field/row unless the file ended on a clean newline (no dangling empty row).
  if (field.length > 0 || row.length > 0) {
    endRow();
  }

  return rows;
}

/** Locate the first header column whose name matches `pattern` (case-insensitive, trimmed). */
function findColumn(header: string[], pattern: RegExp): number {
  return header.findIndex((cell) => pattern.test(cell.trim()));
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Extract ranked artists from an exported playlist CSV (Exportify, Chosic, TuneMyMusic, Soundiiz,
 * or Spotify's own export re-saved as CSV). Detects the artist column by header, splits multi-artist
 * cells, pairs each name with its `spotify:artist:{id}` URI when a parallel URI column exists, and
 * tallies by frequency. Returns `recognized: false` when no artist column is found.
 */
export function parseExportedArtists(csvText: string): TasteImportResult {
  const rows = parseCsv(csvText).filter((row) => row.some((cell) => cell.trim().length > 0));
  if (rows.length < 2) {
    return { artists: [], trackRows: 0, recognized: false };
  }

  const header = rows[0];
  // "Artist Name(s)" (Exportify), "Artist Name" (Chosic/others), "Artist" (generic).
  const nameCol = findColumn(header, /^artist name/i) >= 0
    ? findColumn(header, /^artist name/i)
    : findColumn(header, /^artist$/i);
  const uriCol = findColumn(header, /^artist uri/i);
  const genreCol = findColumn(header, /^genres?$/i);

  if (nameCol < 0) {
    return { artists: [], trackRows: 0, recognized: false };
  }

  // Aggregate by a stable key: the canonical Spotify id when present, else a name slug.
  const tally = new Map<
    string,
    { spotifyArtistId: string; name: string; count: number; genres: Set<string> }
  >();
  let trackRows = 0;

  for (let r = 1; r < rows.length; r += 1) {
    const cells = rows[r];
    const rawNames = (cells[nameCol] ?? "").trim();
    if (!rawNames) {
      continue;
    }
    trackRows += 1;

    const uriIds = uriCol >= 0
      ? (cells[uriCol] ?? "")
          .split(COMMA_SEPARATOR)
          .map((v) => v.trim().match(SPOTIFY_ARTIST_URI)?.[1])
          .filter((v): v is string => Boolean(v))
      : [];
    const rowGenres = genreCol >= 0
      ? (cells[genreCol] ?? "").split(COMMA_SEPARATOR).map((v) => v.trim()).filter(Boolean)
      : [];

    const entries = resolveRowArtists(rawNames, uriIds);
    for (const { name, id } of entries) {
      const existing = tally.get(id);
      if (existing) {
        existing.count += 1;
        for (const genre of rowGenres) {
          existing.genres.add(genre);
        }
      } else {
        tally.set(id, { spotifyArtistId: id, name, count: 1, genres: new Set(rowGenres) });
      }
    }
  }

  const artists = Array.from(tally.values())
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, MAX_ARTISTS)
    .map((entry, index) => ({
      spotifyArtistId: entry.spotifyArtistId,
      name: entry.name,
      count: entry.count,
      rank: index + 1,
      genres: Array.from(entry.genres).slice(0, MAX_GENRES_PER_ARTIST),
    }));

  return { artists, trackRows, recognized: true };
}

/**
 * Split one track's artist cell into individual artists, pairing each with a canonical id when the
 * export carries URIs. Semicolons are the unambiguous multi-artist separator (current Exportify);
 * commas only split when a parallel URI list confirms the count — otherwise the cell is one artist
 * whose name happens to contain a comma.
 */
function resolveRowArtists(rawNames: string, uriIds: string[]): Array<{ name: string; id: string }> {
  if (rawNames.includes(";")) {
    const tokens = rawNames.split(";").map((v) => v.trim()).filter(Boolean);
    return tokens.map((name, index) => ({ name, id: uriIds[index] ?? `import:${slugify(name)}` }));
  }

  if (uriIds.length > 1) {
    const tokens = rawNames.split(COMMA_SEPARATOR).map((v) => v.trim()).filter(Boolean);
    if (tokens.length === uriIds.length) {
      return tokens.map((name, index) => ({ name, id: uriIds[index] }));
    }
    // Count disagrees — a name contains a comma; trust the URIs and keep the cell as one label.
    return [{ name: rawNames, id: uriIds[0] }];
  }

  // Single artist (or a comma-in-name we won't risk splitting without URIs to confirm).
  return [{ name: rawNames, id: uriIds[0] ?? `import:${slugify(rawNames)}` }];
}
