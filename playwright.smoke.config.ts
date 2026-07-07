import { defineConfig } from "@playwright/test";

/**
 * Readability & integrity smoke harness (PRD 41, Phase 16 C3). Separate from `test:e2e` (the PRD 38
 * account-loop harness) so the two never share a server or a database posture.
 *
 * This harness runs `next dev` with **no `DATABASE_URL`** (forced empty) to exercise the PRD 41
 * missing-local-DB **degrade** path: every DB read resolves to empty and the app must still render
 * readably. That makes the sweep deterministic and `$0` — no live database, no secrets. The dev
 * admin-session fallback token (`local-admin-session`) lets the sweep reach the authed admin shells.
 */
export default defineConfig({
  testDir: "./e2e-smoke",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3101" },
  webServer: {
    command: "npx next dev -p 3101",
    url: "http://localhost:3101/auth/error?code=unknown",
    timeout: 180_000,
    reuseExistingServer: true,
    env: {
      // Force the PRD 41 degrade path regardless of the shell: empty string is "not configured".
      DATABASE_URL: "",
      AUTH_SECRET: "smoke-test-secret",
    },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
