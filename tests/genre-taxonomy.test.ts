import assert from "node:assert/strict";
import test from "node:test";
import {
  bestRelationStrength,
  genreRelationStrength,
  isGenericGenreTerm,
  resolveGenres,
} from "../lib/genre-taxonomy";

test("alias resolution maps synonyms to canonical genres", () => {
  assert.deepEqual(resolveGenres("rnb"), ["soul"]);
  assert.deepEqual(resolveGenres("r&b"), ["soul"]);
  assert.deepEqual(resolveGenres("singer-songwriter"), ["folk"]);
  assert.deepEqual(resolveGenres("EDM"), ["electronic"]);
  assert.deepEqual(resolveGenres("hip hop"), ["hiphop"]);
});

test("resolveGenres accepts tag arrays and dedupes/orders canonically", () => {
  const genres = resolveGenres(["funk", "soul", "neo soul"]);
  assert.deepEqual(genres, ["funk", "soul"]);
});

test("whole-token matching avoids false positives", () => {
  // "rockwell" should not resolve to rock.
  assert.deepEqual(resolveGenres("rockwell tribute"), []);
  // but a standalone token does.
  assert.deepEqual(resolveGenres("rock night"), ["rock"]);
});

test("generic-only text produces no genre", () => {
  assert.deepEqual(resolveGenres("live music concert"), []);
  assert.ok(isGenericGenreTerm("live"));
  assert.ok(isGenericGenreTerm("concert"));
  assert.ok(!isGenericGenreTerm("jazz"));
});

test("relationship strength: identical, related, unrelated", () => {
  assert.equal(genreRelationStrength("funk", "funk"), 1);
  assert.equal(genreRelationStrength("funk", "soul"), 0.8);
  assert.equal(genreRelationStrength("soul", "funk"), 0.8, "relations are symmetric");
  assert.equal(genreRelationStrength("metal", "bluegrass"), 0);
});

test("bestRelationStrength picks the strongest adjacency in a set", () => {
  assert.equal(bestRelationStrength("funk", ["bluegrass", "soul", "country"]), 0.8);
  assert.equal(bestRelationStrength("metal", ["bluegrass", "country"]), 0);
});

test("unknown terms pass through as neutral (no throw, empty result)", () => {
  assert.deepEqual(resolveGenres("avant-garde noisecore xyz"), []);
  assert.deepEqual(resolveGenres(""), []);
});
