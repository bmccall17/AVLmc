import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import PostgresAdapter from "@auth/pg-adapter";
import { getPool, query } from "@/lib/db";
import { withMultiEmailResolution } from "@/lib/auth-adapter";
import { recordProviderEmail } from "@/lib/account-emails";
import {
  checkAccountIntegrity,
  type AccountSnapshot,
} from "@/lib/account-integrity";

/**
 * Account-loop integration proof (PRD 38 / Phase 15) — runs the REAL adapter + services against a
 * real Postgres, driving the exact sequence Auth.js executes (createUser → linkAccount →
 * getUserByEmail resolution → second-provider link), then asserts the no-reset invariants with
 * `checkAccountIntegrity`. This proves "one human = one account, many emails, no duplicate identity,
 * no lost data" in actual SQL — not a mock. Requires a throwaway DATABASE_URL; skipped otherwise so
 * the normal suite stays DB-free.
 *
 * Run: DATABASE_URL=... node --import tsx --conditions=react-server --test tests/account-loop.integration.ts
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);
const adapter = HAS_DB ? withMultiEmailResolution(PostgresAdapter(getPool())) : null;

// Unique per run so reruns never collide (the throwaway DB is fresh anyway).
const stamp = Date.now();
const magicEmail = `fan+${stamp}@example.com`;
const spotifyEmail = `fan+${stamp}@spotify.com`;

test("apply schema (idempotent)", { skip: !HAS_DB }, async () => {
  await query(readFileSync("db/schema.sql", "utf8"));
});

let userId = "";

test("magic-link sign-in: create the account + record its primary email", { skip: !HAS_DB }, async () => {
  assert.equal(await adapter!.getUserByEmail!(magicEmail), null, "email is unknown before sign-in");

  // Auth.js: createUser → linkAccount → events.signIn(recordProviderEmail).
  const user = (await adapter!.createUser!({
    email: magicEmail,
    emailVerified: new Date(),
    name: null,
    image: null,
  } as never)) as { id: number | string };
  userId = String(user.id);

  await adapter!.linkAccount!({
    userId,
    type: "email",
    provider: "resend",
    providerAccountId: magicEmail,
  } as never);
  await recordProviderEmail(userId, "resend", magicEmail);

  // Seed user_id-keyed data BEFORE linking, to later prove the no-reset guarantee.
  await query(
    `insert into public.listener_discovery_preferences (id, user_id, share_activity)
     values ($1, $2, true) on conflict (user_id) do nothing`,
    [`ldp-${stamp}`, Number(userId)]
  );

  const found = (await adapter!.getUserByEmail!(magicEmail)) as { id: number | string } | null;
  assert.equal(String(found?.id), userId, "magic-link email resolves to the account");
});

test("connect Spotify while signed in: links onto the SAME account, no new user", { skip: !HAS_DB }, async () => {
  const spotifyAccountId = `spot_${stamp}`;

  // Auth.js: getUserByAccount miss → user is signed in → linkAccount onto the session user.
  assert.equal(
    await adapter!.getUserByAccount!({ provider: "spotify", providerAccountId: spotifyAccountId }),
    null,
    "spotify account not yet linked"
  );
  await adapter!.linkAccount!({
    userId,
    type: "oauth",
    provider: "spotify",
    providerAccountId: spotifyAccountId,
  } as never);
  await recordProviderEmail(userId, "spotify", spotifyEmail);

  // KEY PROOF: signing in with the Spotify-sourced (secondary) email resolves to the one account.
  const bySecondary = (await adapter!.getUserByEmail!(spotifyEmail)) as { id: number | string } | null;
  assert.equal(String(bySecondary?.id), userId, "secondary email resolves to the same account");
});

test("no-reset data-integrity assertions hold in real SQL", { skip: !HAS_DB }, async () => {
  const owners = await query<{ user_id: number }>(
    `select distinct user_id from public.user_emails where lower(email) in (lower($1), lower($2))`,
    [magicEmail, spotifyEmail]
  );
  // Both emails are owned by exactly one account — no fork.
  assert.deepEqual([...new Set(owners.rows.map((r) => String(r.user_id)))], [userId]);

  const [users, accounts, emails, owned] = await Promise.all([
    query<{ id: number }>(`select id from public.users where id = $1`, [Number(userId)]),
    query<{ userId: number; provider: string }>(
      `select "userId", provider from public.accounts where "userId" = $1`,
      [Number(userId)]
    ),
    query<{ user_id: number; email: string; is_primary: boolean }>(
      `select user_id, email, is_primary from public.user_emails where user_id = $1`,
      [Number(userId)]
    ),
    query<{ user_id: number }>(
      `select user_id from public.listener_discovery_preferences where user_id = $1`,
      [Number(userId)]
    ),
  ]);

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

  const result = checkAccountIntegrity(snapshot, {
    userId,
    providers: ["resend", "spotify"],
    emails: [magicEmail, spotifyEmail],
  });
  assert.deepEqual(result, { ok: true, violations: [] });
});

test("not-signed-in collision: a recorded email is detected (routes to recovery, never a fork)", { skip: !HAS_DB }, async () => {
  // A different Spotify identity whose email already belongs to the account, with NO active session.
  assert.equal(
    await adapter!.getUserByAccount!({ provider: "spotify", providerAccountId: `spot_other_${stamp}` }),
    null
  );
  // Auth.js then consults getUserByEmail; our wrapper finds the owner -> OAuthAccountNotLinked ->
  // the PRD 37 duplicate_account recovery. We assert the owner is found (no silent createUser/fork).
  const owner = (await adapter!.getUserByEmail!(spotifyEmail)) as { id: number | string } | null;
  assert.equal(String(owner?.id), userId, "collision detected: resolves to the existing owner");
});

test("close the pool", { skip: !HAS_DB }, async () => {
  await getPool().end();
});
