import { test, expect } from "@playwright/test";
import { AUTH_FAILURES, type AuthFailureCode } from "../lib/auth-failures";

/**
 * Cross-browser proof of the PRD 37 recovery surface (Phase 15 / PRD 38 capstone). Drives the real
 * `app/auth/error` route in each engine and asserts every failure state renders accurate copy + a
 * recoverable action — never a blank dead-end. Copy is asserted against the single taxonomy source
 * (`lib/auth-failures.ts`) so the test can't drift from the app.
 */

const NAMED_CODES: AuthFailureCode[] = [
  "spotify_limited_beta",
  "access_denied",
  "duplicate_account",
  "redirect_loop",
  "stale_session",
  "browser_fallback",
];

for (const code of NAMED_CODES) {
  test(`recovery page renders "${code}" with its title + primary recoverable action`, async ({
    page,
  }) => {
    const entry = AUTH_FAILURES[code];
    await page.goto(`/auth/error?code=${code}`);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(entry.title);
    await expect(page.getByText(entry.message, { exact: false })).toBeVisible();
    // The single primary action is present and actionable (a button or a link).
    await expect(page.getByText(entry.action.label, { exact: true }).first()).toBeVisible();
  });
}

test("Auth.js OAuthAccountNotLinked maps to the duplicate-account recovery (sign-in-then-link, no merge)", async ({
  page,
}) => {
  await page.goto(`/auth/error?error=OAuthAccountNotLinked`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    AUTH_FAILURES.duplicate_account.title
  );
  // The reassurance copy may say "we never merge", but there must be no merge ACTION/shortcut.
  await expect(page.getByRole("button", { name: /merge/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /merge/i })).toHaveCount(0);
  // The one offered action routes to authenticated linking.
  await expect(
    page.getByText(AUTH_FAILURES.duplicate_account.action.label, { exact: true }).first()
  ).toBeVisible();
});

test("an unknown/missing error degrades to a recoverable page, never a blank dead-end", async ({
  page,
}) => {
  await page.goto(`/auth/error?error=SomethingUnexpected`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(AUTH_FAILURES.unknown.title);
  await expect(page.locator(".auth-recovery-actions")).toBeVisible();
});
