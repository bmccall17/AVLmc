/**
 * Genre taxonomy (PRD 15 / C4, Track B) — the in-code source of truth for genre understanding.
 *
 * Replaces discovery's hardcoded 15-term genre list with canonical genres, alias/synonym maps,
 * and parent/child (adjacency) relationships. `scoreGenreMatch` consumes this for relationship-
 * aware, explainable matching that benefits everyone (anonymous included), and it is the
 * vocabulary that Spotify artist genres (C5) map onto.
 *
 * This module is pure and dependency-free (no `server-only`, no DB) so it can be reused on the
 * client (board quick filters) and is safe to drift-check in code. It keeps its own local
 * `normalize` (identical in behavior to discovery's `normalizeText`) to avoid a circular import.
 */

export type CanonicalGenre =
  | "americana"
  | "bluegrass"
  | "country"
  | "folk"
  | "funk"
  | "soul"
  | "jazz"
  | "blues"
  | "rock"
  | "indie"
  | "punk"
  | "metal"
  | "hiphop"
  | "electronic"
  | "dance"
  | "world"
  | "latin"
  | "reggae"
  | "gospel"
  | "pop";

export const CANONICAL_GENRES: readonly CanonicalGenre[] = [
  "americana",
  "bluegrass",
  "country",
  "folk",
  "funk",
  "soul",
  "jazz",
  "blues",
  "rock",
  "indie",
  "punk",
  "metal",
  "hiphop",
  "electronic",
  "dance",
  "world",
  "latin",
  "reggae",
  "gospel",
  "pop",
];

/** Human-facing display label for a canonical genre (used in reasons). */
export const GENRE_LABELS: Record<CanonicalGenre, string> = {
  americana: "americana",
  bluegrass: "bluegrass",
  country: "country",
  folk: "folk",
  funk: "funk",
  soul: "soul",
  jazz: "jazz",
  blues: "blues",
  rock: "rock",
  indie: "indie",
  punk: "punk",
  metal: "metal",
  hiphop: "hip hop",
  electronic: "electronic",
  dance: "dance",
  world: "world",
  latin: "latin",
  reggae: "reggae",
  gospel: "gospel",
  pop: "pop",
};

/**
 * Alias/synonym map: normalized phrase → canonical genre. Includes canonical identities so a raw
 * canonical term resolves to itself. Conservative on purpose — ambiguous words are omitted.
 */
const GENRE_ALIASES: Record<string, CanonicalGenre> = {
  // canonical identities
  americana: "americana",
  bluegrass: "bluegrass",
  country: "country",
  folk: "folk",
  funk: "funk",
  soul: "soul",
  jazz: "jazz",
  blues: "blues",
  rock: "rock",
  indie: "indie",
  punk: "punk",
  metal: "metal",
  electronic: "electronic",
  dance: "dance",
  world: "world",
  latin: "latin",
  reggae: "reggae",
  gospel: "gospel",
  pop: "pop",
  // soul / r&b
  "r b": "soul",
  rnb: "soul",
  "r and b": "soul",
  "rhythm and blues": "soul",
  "neo soul": "soul",
  motown: "soul",
  // folk / singer-songwriter
  "singer songwriter": "folk",
  songwriter: "folk",
  acoustic: "folk",
  // americana / roots
  roots: "americana",
  "alt country": "americana",
  "alternative country": "americana",
  // electronic / dance
  edm: "electronic",
  house: "electronic",
  techno: "electronic",
  trance: "electronic",
  electronica: "electronic",
  dubstep: "electronic",
  dnb: "electronic",
  "drum and bass": "electronic",
  dj: "electronic",
  // hip hop
  "hip hop": "hiphop",
  hiphop: "hiphop",
  rap: "hiphop",
  trap: "hiphop",
  // rock family
  "classic rock": "rock",
  "hard rock": "rock",
  "garage rock": "rock",
  "indie rock": "indie",
  "indie pop": "indie",
  alternative: "indie",
  // punk / metal
  "punk rock": "punk",
  hardcore: "punk",
  "post punk": "punk",
  "heavy metal": "metal",
  "death metal": "metal",
  "black metal": "metal",
  metalcore: "metal",
  // world / latin / reggae
  afrobeat: "world",
  salsa: "latin",
  cumbia: "latin",
  ska: "reggae",
  dub: "reggae",
};

/** Multi-word aliases checked first (longest phrases win) so "hip hop" beats nothing spurious. */
const ALIAS_ENTRIES: Array<[string, CanonicalGenre]> = Object.entries(GENRE_ALIASES).sort(
  (a, b) => b[0].length - a[0].length
);

/**
 * Symmetric adjacency: how strongly two canonical genres relate (0..1). A pair not listed is
 * unrelated (0). Same genre is 1 (handled in `genreRelationStrength`).
 */
const GENRE_RELATIONS: Partial<Record<CanonicalGenre, Partial<Record<CanonicalGenre, number>>>> = {
  americana: { folk: 0.7, country: 0.7, bluegrass: 0.6 },
  bluegrass: { folk: 0.6, country: 0.6 },
  folk: { country: 0.5 },
  funk: { soul: 0.8, jazz: 0.5 },
  soul: { blues: 0.5, gospel: 0.5, hiphop: 0.4 },
  jazz: { blues: 0.6 },
  blues: { rock: 0.4 },
  rock: { indie: 0.7, punk: 0.6, metal: 0.6 },
  indie: { pop: 0.4 },
  punk: { metal: 0.5 },
  electronic: { dance: 0.8, hiphop: 0.4 },
  world: { latin: 0.6, reggae: 0.4 },
  latin: { reggae: 0.4 },
};

const GENERIC_TERMS = new Set(["live", "music", "band", "show", "concert", "local"]);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Whether a normalized term is a generic, non-genre filler word. */
export function isGenericGenreTerm(value: string): boolean {
  return GENERIC_TERMS.has(value);
}

/**
 * Resolve free text and/or tags into the set of canonical genres they mention, via the alias map.
 * Matches on whole-token boundaries so "rock" does not match "rockwell"; multi-word aliases like
 * "hip hop" are matched as phrases. Unknown terms simply contribute nothing (neutral pass-through).
 */
export function resolveGenres(input: string | string[]): CanonicalGenre[] {
  const texts = Array.isArray(input) ? input : [input];
  const haystack = ` ${texts.map(normalize).filter(Boolean).join(" ")} `;

  if (haystack.trim().length === 0) {
    return [];
  }

  const found = new Set<CanonicalGenre>();
  for (const [alias, canonical] of ALIAS_ENTRIES) {
    if (haystack.includes(` ${alias} `)) {
      found.add(canonical);
    }
  }

  // Preserve canonical declaration order for stable, readable reasons.
  return CANONICAL_GENRES.filter((genre) => found.has(genre));
}

/** Relationship strength between two canonical genres: 1 if identical, adjacency weight, else 0. */
export function genreRelationStrength(a: CanonicalGenre, b: CanonicalGenre): number {
  if (a === b) {
    return 1;
  }
  return GENRE_RELATIONS[a]?.[b] ?? GENRE_RELATIONS[b]?.[a] ?? 0;
}

/** Best relationship strength between a genre and any genre in a set (0 if none relate). */
export function bestRelationStrength(genre: CanonicalGenre, against: CanonicalGenre[]): number {
  return against.reduce((best, other) => Math.max(best, genreRelationStrength(genre, other)), 0);
}
