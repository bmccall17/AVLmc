import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getSystemRegistry, IMPLEMENTATION_NOTE_KIND_LABELS } from "@/lib/system-registry";
import { renderSystemMapMarkdown } from "@/lib/admin/system-map-markdown";

/**
 * Registry drift guard (PRD 06 / C1).
 *
 * Keeps the hand-authored System Registry honest: every node must point at a real file or table,
 * every edge must reference real nodes, and the checked-in generated Markdown must match what the
 * registry renders today. If any of these fail, the canonical architecture model has drifted from
 * the actual code — regenerate (`npm run generate:system-map`) or fix the registry.
 */

const root = process.cwd();
const { nodes, edges } = getSystemRegistry();
const schemaSql = readFileSync(join(root, "db/schema.sql"), "utf8");

test("node ids are unique", () => {
  const ids = new Set<string>();
  for (const node of nodes) {
    assert.ok(!ids.has(node.id), `Duplicate node id: ${node.id}`);
    ids.add(node.id);
  }
});

test("file-backed nodes point at files that exist", () => {
  const fileNodes = nodes.filter(
    (node) => node.kind !== "datastore" && !node.sourceOfTruth.startsWith("http")
  );
  for (const node of fileNodes) {
    assert.ok(
      existsSync(join(root, node.sourceOfTruth)),
      `Node "${node.id}" sourceOfTruth missing on disk: ${node.sourceOfTruth}`
    );
  }
});

test("datastore nodes map to a table in db/schema.sql", () => {
  const tableNodes = nodes.filter((node) => node.kind === "datastore");
  for (const node of tableNodes) {
    const declaration = `create table if not exists public.${node.sourceOfTruth}`;
    assert.ok(
      schemaSql.includes(declaration),
      `Datastore node "${node.id}" has no matching table in schema.sql: ${node.sourceOfTruth}`
    );
  }
});

test("every edge references real nodes", () => {
  const ids = new Set(nodes.map((node) => node.id));
  for (const edge of edges) {
    assert.ok(ids.has(edge.from), `Edge from unknown node: ${edge.from}`);
    assert.ok(ids.has(edge.to), `Edge to unknown node: ${edge.to}`);
  }
});

test("nodes declaring a countKey are datastores (counts resolve to a table)", () => {
  for (const node of nodes) {
    if (node.countKey) {
      assert.equal(
        node.kind,
        "datastore",
        `Node "${node.id}" declares countKey but is not a datastore`
      );
    }
  }
});

test("implementation notes use a known kind", () => {
  for (const node of nodes) {
    for (const note of node.implementationNotes ?? []) {
      assert.ok(
        note.kind in IMPLEMENTATION_NOTE_KIND_LABELS,
        `Node "${node.id}" has an implementation note with an unknown kind: ${note.kind}`
      );
      assert.ok(
        note.detail.trim().length > 0,
        `Node "${node.id}" has an empty implementation-note detail`
      );
    }
  }
});

test("generated system map markdown is in sync with the registry", () => {
  const expected = renderSystemMapMarkdown(getSystemRegistry());
  const actual = readFileSync(join(root, "docs/product/system-map.generated.md"), "utf8");
  assert.equal(
    actual,
    expected,
    "docs/product/system-map.generated.md is stale — run `npm run generate:system-map`"
  );
});
