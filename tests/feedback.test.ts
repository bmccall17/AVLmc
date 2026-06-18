import assert from "node:assert/strict";
import test from "node:test";
import {
  FEEDBACK_MAX_LENGTH,
  FeedbackValidationError,
  validateFeedback,
} from "../lib/feedback-core";

test("a plain message validates; whitespace is trimmed and email is optional", () => {
  assert.deepEqual(validateFeedback({ message: "  the artist link 404'd  " }), {
    message: "the artist link 404'd",
    email: null,
  });
});

test("a valid email is normalized (trim + lowercase)", () => {
  assert.deepEqual(validateFeedback({ message: "hi", email: "  Me@Example.COM " }), {
    message: "hi",
    email: "me@example.com",
  });
});

test("an empty/whitespace message is rejected", () => {
  assert.throws(() => validateFeedback({ message: "   " }), FeedbackValidationError);
  assert.throws(() => validateFeedback({ message: undefined }), FeedbackValidationError);
});

test("an oversized message is rejected", () => {
  assert.throws(
    () => validateFeedback({ message: "x".repeat(FEEDBACK_MAX_LENGTH + 1) }),
    FeedbackValidationError
  );
});

test("a malformed email is rejected (but blank is fine)", () => {
  assert.throws(() => validateFeedback({ message: "hi", email: "not-an-email" }), FeedbackValidationError);
  assert.deepEqual(validateFeedback({ message: "hi", email: "   " }), { message: "hi", email: null });
});
