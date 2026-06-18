/**
 * Account no-reset data-integrity assertions — pure logic (PRD 38 / Phase 15, capstone). No
 * DB/network imports, so the "one human = one account, nothing lost" invariants are unit-tested in
 * isolation (tests/account-integrity.test.ts) and reused by the cross-browser reliability pass to
 * check — not assume — that linking + reconnection never fork an identity or orphan data.
 *
 * The caller takes a snapshot of the relevant rows for one listener (after linking, after
 * reconnection) and runs `checkAccountIntegrity`. It returns the list of violations; an empty list
 * is the green state the C4 runbook asserts. See `account-signin-linking-reliability-checklist.md`.
 */

export type SnapshotUser = { id: string };
/** An Auth.js `accounts` row (provider only — never tokens). */
export type SnapshotAccount = { userId: string; provider: string };
export type SnapshotEmail = { userId: string; email: string; isPrimary: boolean };
/** Any `user_id`-keyed row across the data tables (music_connections, follows, saved items, …). */
export type SnapshotOwnedRow = { table: string; userId: string };

export type AccountSnapshot = {
  users: SnapshotUser[];
  accounts: SnapshotAccount[];
  userEmails: SnapshotEmail[];
  ownedData: SnapshotOwnedRow[];
};

export type IntegrityExpectation = {
  /** The single surviving identity everything must hang off of. */
  userId: string;
  /** Provider names that must be linked to the account (e.g. ["spotify", "resend"]). */
  providers: string[];
  /** Emails (any case) that must be associated with the account (magic-link + each platform's). */
  emails: string[];
};

export type IntegrityResult = { ok: boolean; violations: string[] };

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Assert the no-reset guarantee for one listener's snapshot against what the loop should have
 * produced. Catches a forked identity, a re-keyed/orphaned row, a missing linked provider or email,
 * a duplicate `lower(email)`, or a broken one-primary-per-account rule.
 */
export function checkAccountIntegrity(
  snapshot: AccountSnapshot,
  expectation: IntegrityExpectation
): IntegrityResult {
  const violations: string[] = [];
  const { userId } = expectation;

  // 1. Exactly one users row, and it is the expected identity (no duplicate/forked account).
  const distinctUserIds = new Set(snapshot.users.map((u) => u.id));
  if (snapshot.users.length !== 1 || !distinctUserIds.has(userId)) {
    violations.push(
      `expected exactly one users row (${userId}); found [${[...distinctUserIds].join(", ") || "none"}]`
    );
  }

  // 2. Every accounts row hangs off the expected id, and all expected providers are linked.
  for (const account of snapshot.accounts) {
    if (account.userId !== userId) {
      violations.push(
        `accounts row for provider "${account.provider}" is attached to ${account.userId}, not ${userId}`
      );
    }
  }
  const linkedProviders = new Set(
    snapshot.accounts.filter((a) => a.userId === userId).map((a) => a.provider)
  );
  for (const provider of expectation.providers) {
    if (!linkedProviders.has(provider)) {
      violations.push(`expected provider "${provider}" is not linked to the account`);
    }
  }

  // 3. Emails: all on the expected id, exactly one primary, no duplicate lower(email), all expected
  //    emails present (so signing in with the secondary/Spotify email still resolves here).
  const emailsForUser = snapshot.userEmails.filter((e) => e.userId === userId);
  for (const email of snapshot.userEmails) {
    if (email.userId !== userId) {
      violations.push(`email "${email.email}" is attached to ${email.userId}, not ${userId}`);
    }
  }
  const primaryCount = emailsForUser.filter((e) => e.isPrimary).length;
  if (primaryCount !== 1) {
    violations.push(`expected exactly one primary email; found ${primaryCount}`);
  }
  const seen = new Set<string>();
  for (const email of snapshot.userEmails) {
    const key = normalize(email.email);
    if (seen.has(key)) {
      violations.push(`duplicate lower(email) "${key}" — an email must resolve to one account only`);
    }
    seen.add(key);
  }
  const presentEmails = new Set(emailsForUser.map((e) => normalize(e.email)));
  for (const email of expectation.emails) {
    if (!presentEmails.has(normalize(email))) {
      violations.push(`expected email "${normalize(email)}" is not associated with the account`);
    }
  }

  // 4. No orphaned / re-keyed owned data — every user_id-keyed row stays on the surviving id.
  for (const row of snapshot.ownedData) {
    if (row.userId !== userId) {
      violations.push(`${row.table} row is attached to ${row.userId}, not ${userId} (re-keyed/orphaned)`);
    }
  }

  return { ok: violations.length === 0, violations };
}
