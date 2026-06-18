/**
 * Listener feedback — pure validation (404 detour + general). No DB/network imports, so the rules
 * are unit-tested in isolation (tests/feedback.test.ts) and reused by the submit service + route.
 */

export class FeedbackValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedbackValidationError";
  }
}

export const FEEDBACK_MAX_LENGTH = 2000;

/** Validate + normalize a feedback submission. Throws FeedbackValidationError on anything unusable. */
export function validateFeedback(input: { message?: unknown; email?: unknown }): {
  message: string;
  email: string | null;
} {
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (!message) {
    throw new FeedbackValidationError("Add a short note before sending.");
  }
  if (message.length > FEEDBACK_MAX_LENGTH) {
    throw new FeedbackValidationError(`Keep it under ${FEEDBACK_MAX_LENGTH} characters.`);
  }

  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (email && (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new FeedbackValidationError("That email doesn't look right — leave it blank or fix it.");
  }

  return { message, email: email || null };
}
