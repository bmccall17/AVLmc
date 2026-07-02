import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import PostgresAdapter from "@auth/pg-adapter";
import { getPool, query } from "@/lib/db";
import { withMultiEmailResolution } from "@/lib/auth-adapter";
import { recordProviderEmail } from "@/lib/account-emails";
import { AUTH_FAILURES, resolveAuthFailure } from "@/lib/auth-failures";
import { checkAccountIntegrity, type AccountSnapshot } from "@/lib/account-integrity";

/**
 * One-identity convergence proof (PRD 44 / Phase 17). Two layers:
 *
 *  1. Always-on stance guards — auth.ts really sets `allowDangerousEmailAccountLinking` on the
 *     Spotify provider (the behavior below assumes it), the `duplicate_account` copy explains the
 *     email-mismatch EDGE (not a blanket no-merge policy), and no "never merge behind your back"
 *     phrasing survives anywhere in the funnel.
 *
 *  2. DB convergence tests (skip without DATABASE_URL, like tests/account-loop.integration.mts) —
 *     the REAL adapter against a real Postgres, driving the exact sequence Auth.js executes with
 *     the flag on: email-first → fresh Spotify sign-in (same email) LINKS onto the existing user;
 *     Spotify-first → later magic link resolves to the same user; a mismatched email resolves to
 *     nobody (the documented edge, handled by the recovery copy).
 *
 * Run: DATABASE_URL=<throwaway> npm run test:one-identity
 */

// ── Layer 1: stance guards (no DB) ──────────────────────────────────────────

test("auth.ts sets allowDangerousEmailAccountLinking on the Spotify provider", () => {
  const source = readFileSync("auth.ts", "utf8");
  const spotifyBlock = source.slice(source.indexOf("Spotify({"));
  assert.ok(
    /allowDangerousEmailAccountLinking:\s*true/.test(spotifyBlock),
    "the Spotify provider must carry the auto-link flag (PRD 44) — without it, a fresh Spotify " +
      "sign-in on an existing email bricks with OAuthAccountNotLinked"
  );
});

test("duplicate_account copy handles the mismatch edge, with the working recovery path", () => {
  const entry = AUTH_FAILURES.duplicate_account;
  assert.match(entry.message, /different email/i, "explains the mismatch edge");
  assert.equal(entry.action.kind, "sign_in_then_link", "recovery: sign in, then connect");
  assert.equal(resolveAuthFailure("OAuthAccountNotLinked").code, "duplicate_account");
});

test("no 'never merge behind your back' phrasing survives in the funnel", () => {
  const funnelFiles = [
    "lib/auth-failures.ts",
    "lib/spotify-limited-access.ts",
    "components/AuthRecovery.tsx",
    "components/SignInChooser.tsx",
    "components/EmailSignInPanel.tsx",
    "components/ListenerProfileButton.tsx",
    "components/SpotifyAccessRequest.tsx",
    "app/auth/signin/page.tsx",
    "app/auth/error/page.tsx",
    "app/spotify-access/page.tsx",
  ];
  for (const file of funnelFiles) {
    const source = readFileSync(file, "utf8").toLowerCase();
    assert.ok(
      !source.includes("never merge") && !source.includes("behind your back"),
      `${file} still carries the pre-PRD-44 no-auto-link stance`
    );
  }
});

// ── Layer 2: adapter-level convergence (throwaway DB only) ──────────────────

const HAS_DB = Boolean(process.env.DATABASE_URL);
const adapter = HAS_DB ? withMultiEmailResolution(PostgresAdapter(getPool())) : null;

const stamp = Date.now();
const sharedEmail = `one+${stamp}@example.com`; // the matching-email convergence case
const spotifyFirstEmail = `first+${stamp}@spotify.com`;
const mismatchEmail = `mismatch+${stamp}@elsewhere.com`;

let emailFirstUserId = "";

test("apply schema (idempotent)", { skip: !HAS_DB }, async () => {
  await query(readFileSync("db/schema.sql", "utf8"));
});

test("email-first: magic link creates the account", { skip: !HAS_DB }, async () => {
  const user = (await adapter!.createUser!({
    email: sharedEmail,
    emailVerified: new Date(),
    name: null,
    image: null,
  } as never)) as { id: number | string };
  emailFirstUserId = String(user.id);

  await adapter!.linkAccount!({
    userId: emailFirstUserId,
    type: "email",
    provider: "resend",
    providerAccountId: sharedEmail,
  } as never);
  await recordProviderEmail(emailFirstUserId, "resend", sharedEmail);

  // Seed owned data to prove convergence preserves it (no reset on the later link).
  await query(
    `insert into public.listener_discovery_preferences (id, user_id, share_activity)
     values ($1, $2, true) on conflict (user_id) do nothing`,
    [`ldp-one-${stamp}`, Number(emailFirstUserId)]
  );
});

test("fresh Spotify sign-in (same email, signed OUT) converges: links, never forks or bricks", { skip: !HAS_DB }, async () => {
  const spotifyAccountId = `spot_one_${stamp}`;

  // The exact sequence Auth.js runs for an OAuth sign-in with no matching `accounts` row:
  assert.equal(
    await adapter!.getUserByAccount!({ provider: "spotify", providerAccountId: spotifyAccountId }),
    null,
    "no spotify account row yet"
  );
  const found = (await adapter!.getUserByEmail!(sharedEmail)) as { id: number | string } | null;
  assert.equal(
    String(found?.id),
    emailFirstUserId,
    "the Spotify-supplied email resolves to the existing email-first account"
  );
  // With allowDangerousEmailAccountLinking: true (guarded above), Auth.js now links — the July 2
  // failure (OAuthAccountNotLinked on this exact path) is structurally unreachable.
  await adapter!.linkAccount!({
    userId: String(found!.id),
    type: "oauth",
    provider: "spotify",
    providerAccountId: spotifyAccountId,
  } as never);
  await recordProviderEmail(String(found!.id), "spotify", sharedEmail);

  // One user, two doors, owned data intact.
  const users = await query<{ id: number }>(
    `select u.id from public.users u
      join public.user_emails ue on ue.user_id = u.id
     where lower(ue.email) = lower($1)`,
    [sharedEmail]
  );
  assert.deepEqual([...new Set(users.rows.map((r) => String(r.id)))], [emailFirstUserId]);

  const accounts = await query<{ userId: number; provider: string }>(
    `select "userId", provider from public.accounts where "userId" = $1`,
    [Number(emailFirstUserId)]
  );
  const emails = await query<{ user_id: number; email: string; is_primary: boolean }>(
    `select user_id, email, is_primary from public.user_emails where user_id = $1`,
    [Number(emailFirstUserId)]
  );
  const owned = await query<{ user_id: number }>(
    `select user_id from public.listener_discovery_preferences where user_id = $1`,
    [Number(emailFirstUserId)]
  );
  const snapshot: AccountSnapshot = {
    users: users.rows.map((r) => ({ id: String(r.id) })),
    accounts: accounts.rows.map((r) => ({ userId: String(r.userId), provider: r.provider })),
    userEmails: emails.rows.map((r) => ({
      userId: String(r.user_id),
      email: r.email,
      isPrimary: r.is_primary,
    })),
    ownedData: owned.rows.map((r) => ({
      table: "listener_discovery_preferences",
      userId: String(r.user_id),
    })),
  };
  assert.deepEqual(
    checkAccountIntegrity(snapshot, {
      userId: emailFirstUserId,
      providers: ["resend", "spotify"],
      emails: [sharedEmail],
    }),
    { ok: true, violations: [] }
  );
});

test("Spotify-first → later magic link (same email) resolves to the SAME user", { skip: !HAS_DB }, async () => {
  const user = (await adapter!.createUser!({
    email: spotifyFirstEmail,
    emailVerified: new Date(),
    name: null,
    image: null,
  } as never)) as { id: number | string };
  const spotifyFirstUserId = String(user.id);
  await adapter!.linkAccount!({
    userId: spotifyFirstUserId,
    type: "oauth",
    provider: "spotify",
    providerAccountId: `spot_first_${stamp}`,
  } as never);
  await recordProviderEmail(spotifyFirstUserId, "spotify", spotifyFirstEmail);

  // The magic-link flow starts with getUserByEmail — it must find this user, not mint a new one.
  const found = (await adapter!.getUserByEmail!(spotifyFirstEmail)) as { id: number | string } | null;
  assert.equal(String(found?.id), spotifyFirstUserId, "magic link lands on the Spotify-first account");
});

test("mismatched email resolves to nobody — the documented edge, handled by recovery copy", { skip: !HAS_DB }, async () => {
  // A Spotify account with an email we've never seen: Auth.js would create a NEW user. The
  // recovery path for a human who meant an existing account is the duplicate_account instruction
  // (sign in with your email, then connect from the profile — the link path proven above).
  assert.equal(await adapter!.getUserByEmail!(mismatchEmail), null);
});

test("close the pool", { skip: !HAS_DB }, async () => {
  await getPool().end();
});
