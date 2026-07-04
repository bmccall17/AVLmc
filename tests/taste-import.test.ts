import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv, parseExportedArtists } from "../lib/taste-import-core";

// A representative Exportify export: real header, a quoted multi-artist cell with a parallel URI
// column, an artist name containing a comma (must survive quoting), and a repeat artist for frequency.
const EXPORTIFY_CSV = `"Track URI","Track Name","Artist URI(s)","Artist Name(s)","Album Name"
"spotify:track:1","Song A","spotify:artist:aaa","Radiohead","Album One"
"spotify:track:2","Song B","spotify:artist:aaa","Radiohead","Album Two"
"spotify:track:3","Song C","spotify:artist:bbb, spotify:artist:ccc","Sufjan Stevens, Bon Iver","Split"
"spotify:track:4","Song D","spotify:artist:ddd","Tyler, the Creator","Album Four"
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

test("Exportify CSV → ranked artists with canonical Spotify ids", () => {
  const { artists, trackRows, recognized } = parseExportedArtists(EXPORTIFY_CSV);

  assert.equal(recognized, true);
  assert.equal(trackRows, 4);

  // Radiohead credited on 2 tracks → rank 1, id from the URI.
  assert.equal(artists[0].name, "Radiohead");
  assert.equal(artists[0].spotifyArtistId, "aaa");
  assert.equal(artists[0].count, 2);
  assert.equal(artists[0].rank, 1);

  // The multi-artist cell splits into two, paired with their own URIs.
  const sufjan = artists.find((a) => a.name === "Sufjan Stevens");
  const bon = artists.find((a) => a.name === "Bon Iver");
  assert.equal(sufjan?.spotifyArtistId, "bbb");
  assert.equal(bon?.spotifyArtistId, "ccc");

  // An artist name with a comma must NOT be split (it was a single quoted cell).
  const tyler = artists.find((a) => a.name === "Tyler, the Creator");
  assert.ok(tyler, "comma-in-name artist should survive as one artist");
  assert.equal(tyler?.spotifyArtistId, "ddd");
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
