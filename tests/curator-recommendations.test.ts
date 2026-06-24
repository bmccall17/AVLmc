import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_SETTABLE_RECOMMENDATION_STATUSES,
  CuratorRecommendationValidationError,
  RECOMMENDATION_NAME_MAX,
  RECOMMENDATION_REASON_MAX,
  isAdminSettableRecommendationStatus,
  validateCuratorRecommendation,
} from "../lib/curator-recommendations-core";

test("a nominee name validates; whitespace is trimmed and link/reason are optional", () => {
  assert.deepEqual(validateCuratorRecommendation({ nomineeName: "  DJ Nyla  " }), {
    nomineeName: "DJ Nyla",
    nomineeLink: null,
    reason: null,
  });
});

test("link and reason are trimmed and kept when present", () => {
  assert.deepEqual(
    validateCuratorRecommendation({
      nomineeName: "DJ Nyla",
      nomineeLink: "  https://instagram.com/djnyla  ",
      reason: "  best techno ear in town  ",
    }),
    {
      nomineeName: "DJ Nyla",
      nomineeLink: "https://instagram.com/djnyla",
      reason: "best techno ear in town",
    }
  );
});

test("an empty/whitespace nominee name is rejected", () => {
  assert.throws(() => validateCuratorRecommendation({ nomineeName: "   " }), CuratorRecommendationValidationError);
  assert.throws(() => validateCuratorRecommendation({ nomineeName: undefined }), CuratorRecommendationValidationError);
});

test("an oversized name or reason is rejected", () => {
  assert.throws(
    () => validateCuratorRecommendation({ nomineeName: "x".repeat(RECOMMENDATION_NAME_MAX + 1) }),
    CuratorRecommendationValidationError
  );
  assert.throws(
    () =>
      validateCuratorRecommendation({
        nomineeName: "ok",
        reason: "x".repeat(RECOMMENDATION_REASON_MAX + 1),
      }),
    CuratorRecommendationValidationError
  );
});

test("only reviewed/dismissed are admin-settable; pending is not", () => {
  assert.deepEqual([...ADMIN_SETTABLE_RECOMMENDATION_STATUSES], ["reviewed", "dismissed"]);
  assert.ok(isAdminSettableRecommendationStatus("reviewed"));
  assert.ok(isAdminSettableRecommendationStatus("dismissed"));
  assert.ok(!isAdminSettableRecommendationStatus("pending"));
  assert.ok(!isAdminSettableRecommendationStatus("bogus"));
});
