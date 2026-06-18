import { defineConfig } from "@playwright/test";

/**
 * Cross-browser harness for the Phase 15 account loop (PRD 38). Runs the real Next app via `next dev`
 * and drives it across multiple engines. Chromium (Blink) + Firefox (Gecko) run here; WebKit/Safari
 * needs system libraries not installable in this sandbox and stays a documented manual cell in
 * `account-signin-linking-reliability-checklist.md`.
 *
 * The DB-free, side-effect-free legs (the PRD 37 failure-recovery surface, anonymous-first guarantee)
 * are exercised automatically here. The OAuth/magic-link legs with live side effects remain the
 * documented manual pass (no live Spotify credentials in this environment).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3100" },
  webServer: {
    command: "npx next dev -p 3100",
    url: "http://localhost:3100/auth/error?code=unknown",
    timeout: 180_000,
    reuseExistingServer: true,
    env: {
      // Dummy values: the recovery route is DB-free and does not initialize auth, but these keep any
      // incidental module init from throwing. No real database or secret is used.
      DATABASE_URL: "postgres://e2e:e2e@localhost:5432/e2e",
      AUTH_SECRET: "e2e-test-secret",
    },
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
  ],
});
