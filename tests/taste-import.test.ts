import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv, parseExportedArtists } from "../lib/taste-import-core";

// Current Exportify export (the real format the app targets): NO Artist URI column, multiple artists
// joined by ";", a Genres column, an artist name containing a comma, and repeats for frequency.
const EXPORTIFY_CSV = `Track URI,Track Name,Album Name,Artist Name(s),Genres,Record Label
spotify:track:1,Song A,Album One,Andrew Bird,"baroque pop,indie folk",Label
spotify:track:2,Song B,Album Two,Andrew Bird,"baroque pop,indie folk",Label
spotify:track:3,Song C,Split,The Swell Season;Glen Hansard,folk,Label
spotify:track:4,Song D,Album Four,"Tyler, the Creator",hip hop,Label
`;

// Older Exportify export: comma-separated artists WITH a parallel Artist URI(s) column to disambiguate.
const LEGACY_URI_CSV = `"Track URI","Track Name","Artist URI(s)","Artist Name(s)","Album Name"
"spotify:track:1","Song A","spotify:artist:aaa","Radiohead","Album One"
"spotify:track:2","Song B","spotify:artist:bbb, spotify:artist:ccc","Sufjan Stevens, Bon Iver","Split"
`;

test("parseCsv handles quoted fields, embedded commas, and CRLF", () => {
  const rows = parseCsv('"a","b, c"\r\n"d","e"\n');
  assert.deepEqual(rows, [
    ["a", "b, c"],
    ["d", "e"],
  ]);
});

test("parseCsv unescapes doubled quotes", () => {
  const rows = parseCsv('"he said ""hi""","x"');
  assert.deepEqual(rows, [['he said "hi"', "x"]]);
});

test("current Exportify CSV → semicolon split, genres, comma-in-name preserved", () => {
  const { artists, trackRows, recognized } = parseExportedArtists(EXPORTIFY_CSV);

  assert.equal(recognized, true);
  assert.equal(trackRows, 4);

  // Andrew Bird on 2 tracks → rank 1, slug id (no URI column), genres captured + deduped.
  assert.equal(artists[0].name, "Andrew Bird");
  assert.equal(artists[0].spotifyArtistId, "import:andrew-bird");
  assert.equal(artists[0].count, 2);
  assert.equal(artists[0].rank, 1);
  assert.deepEqual(artists[0].genres, ["baroque pop", "indie folk"]);

  // Semicolon-separated cell splits into two distinct artists.
  assert.ok(artists.find((a) => a.name === "The Swell Season"), "should split on ;");
  assert.ok(artists.find((a) => a.name === "Glen Hansard"), "should split on ;");

  // A comma inside a single artist name must NOT be split.
  const tyler = artists.find((a) => a.name === "Tyler, the Creator");
  assert.ok(tyler, "comma-in-name artist should survive as one artist");
});

test("legacy Exportify CSV with Artist URI(s) → comma split by canonical ids", () => {
  const { artists } = parseExportedArtists(LEGACY_URI_CSV);

  assert.equal(artists.find((a) => a.name === "Radiohead")?.spotifyArtistId, "aaa");
  assert.equal(artists.find((a) => a.name === "Sufjan Stevens")?.spotifyArtistId, "bbb");
  assert.equal(artists.find((a) => a.name === "Bon Iver")?.spotifyArtistId, "ccc");
});

test("generic CSV without URIs falls back to name-slug ids", () => {
  const csv = `Artist,Track\nWilco,Song\nWilco,Another\nThe National,Third\n`;
  const { artists, recognized } = parseExportedArtists(csv);

  assert.equal(recognized, true);
  assert.equal(artists[0].name, "Wilco");
  assert.equal(artists[0].count, 2);
  assert.equal(artists[0].spotifyArtistId, "import:wilco");
  assert.equal(artists.find((a) => a.name === "The National")?.spotifyArtistId, "import:the-national");
});

test("unrecognized file (no artist column) is flagged, not thrown", () => {
  const { recognized, artists } = parseExportedArtists("foo,bar\n1,2\n");
  assert.equal(recognized, false);
  assert.equal(artists.length, 0);
});
