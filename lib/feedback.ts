import "server-only";
import { query } from "@/lib/db";
import { validateFeedback } from "@/lib/feedback-core";

/**
 * Listener feedback — data service (404 detour + general). Persists a short note (optionally with an
 * email + the path the listener came from + their user id when signed in). Public write, private to
 * the admin. `42P01`-tolerant on the insert so the form NEVER errors the listener even if the table
 * hasn't been provisioned yet — a missing table just drops the note (logged) instead of 500-ing.
 */
export async function submitFeedback(input: {
  message: string | null | undefined;
  email?: string | null | undefined;
  path?: string | null | undefined;
  userId?: number | string | null | undefined;
}): Promise<void> {
  // Throws FeedbackValidationError (mapped to 400 by the route) on a missing/oversized message.
  const { message, email } = validateFeedback({ message: input.message, email: input.email });
  const path = typeof input.path === "string" ? input.path.slice(0, 512) : null;
  const userIdNum = Number(input.userId);
  const userId = Number.isInteger(userIdNum) && userIdNum > 0 ? userIdNum : null;

  try {
    await query(
      `insert into public.feedback (message, email, path, user_id) values ($1, $2, $3, $4)`,
      [message, email, path, userId]
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "42P01"
    ) {
      // Table not provisioned yet — never block the listener; drop the note (logged).
      console.error("feedback table missing; dropping submission (non-fatal).");
      return;
    }
    throw error;
  }
}
