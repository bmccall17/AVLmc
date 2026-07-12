import assert from "node:assert/strict";
import test from "node:test";
import { assertCronRequest, isAuthorizedCronRequest } from "../lib/cron-auth";

/**
 * PRD 50 / ADR 003 §1: the shared bearer gate on /api/sync/*. Vercel injects
 * `Authorization: Bearer ${CRON_SECRET}` on cron invocations; everything else is a 401.
 * Runs via tsx from the repo root (like tests/system-registry.test.ts).
 */

const SECRET = "test-cron-secret-value";

function requestWithAuth(header?: string) {
  return new Request("https://avlmc.vercel.app/api/sync/cleanup", {
    headers: header ? { authorization: header } : undefined,
  });
}

test("missing Authorization header is rejected", () => {
  assert.equal(isAuthorizedCronRequest(null, SECRET), false);
});

test("wrong token is rejected", () => {
  assert.equal(isAuthorizedCronRequest("Bearer not-the-secret", SECRET), false);
});

test("non-bearer scheme carrying the secret is rejected", () => {
  assert.equal(isAuthorizedCronRequest(SECRET, SECRET), false);
});

test("correct bearer token passes", () => {
  assert.equal(isAuthorizedCronRequest(`Bearer ${SECRET}`, SECRET), true);
});

test("fails closed: no CRON_SECRET configured authorizes nothing", () => {
  assert.equal(isAuthorizedCronRequest("Bearer anything", undefined), false);
  assert.equal(isAuthorizedCronRequest("Bearer ", ""), false);
  assert.equal(isAuthorizedCronRequest("Bearer  ", "  "), false);
});

test("assertCronRequest returns 401 without the bearer and null with it", async () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = SECRET;

  try {
    const unauthorized = assertCronRequest(requestWithAuth());
    assert.ok(unauthorized instanceof Response);
    assert.equal(unauthorized.status, 401);
    assert.deepEqual(await unauthorized.json(), { error: "Unauthorized" });

    const wrongToken = assertCronRequest(requestWithAuth("Bearer nope"));
    assert.equal(wrongToken?.status, 401);

    assert.equal(assertCronRequest(requestWithAuth(`Bearer ${SECRET}`)), null);
  } finally {
    if (previous === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = previous;
    }
  }
});

test("assertCronRequest is 401 for every caller when CRON_SECRET is unset", () => {
  const previous = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;

  try {
    const response = assertCronRequest(requestWithAuth("Bearer anything"));
    assert.equal(response?.status, 401);
  } finally {
    if (previous !== undefined) {
      process.env.CRON_SECRET = previous;
    }
  }
});
