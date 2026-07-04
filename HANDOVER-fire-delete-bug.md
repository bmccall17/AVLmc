# Handover: "Could not save discovery action" on un-fire / un-going

**For:** Claude Code CLI (has Neon + Vercel MCPs connected)
**Repo:** AVLmc (Next.js 15 app, Postgres via `pg`)
**Date:** 2026-07-04

## TL;DR
De-clicking **Fire** (and un-Going) returns HTTP 500 with the client banner
"Could not save discovery action." Root cause: **the app's Postgres role can INSERT/UPDATE/SELECT
but cannot DELETE.** Every reaction/intent removal issues a `DELETE`, which fails with
(almost certainly) `permission denied for table …`. The durable fix is a one-time `GRANT DELETE`
on the schema. A secondary code fix stops the route from masking the real error.

## Evidence (reproduced live against avlmc.vercel.app)
Firing an event repeatedly produced a deterministic alternation:

| Action | Result |
|---|---|
| `fire` toggle **ON** (INSERT into `public.reactions`) | 200 every time |
| `fire` toggle **OFF** (DELETE from `public.reactions`) | 500, empty body, every time |
| `planning` toggle **ON** (INSERT into `public.event_intents`) | 200 |
| `planning` toggle **OFF** (DELETE from `public.event_intents`) | 500, empty body |

Two different tables, same failure → not table-specific, it's **DELETE privilege**.
Every INSERT/UPDATE/SELECT path works. Empty 500 body = unhandled exception (no JSON error).

Note: the durable per-event *state* upsert (setting `fire_at = null`) succeeds **before** the
count DELETE throws, so a user's personal fire silently toggles off while the public count never
drops and they see an error — inconsistent state. Fixing the grant resolves both.

(Unrelated: a cold homepage load once showed the "catching our breath" error boundary — that's the
`max:1` pool on a small connection cap hitting a cold-start blip, not this bug. Ignore for this task.)

## Relevant code
- `lib/community.ts`
  - `deleteLegacyReaction()` — `DELETE FROM public.reactions …` (un-fire). No try/catch.
  - `removeEventIntent()` — `DELETE FROM public.event_intents …` (un-going). Try/catch only
    swallows *missing-relation* errors; a permission error rethrows → 500.
- `app/api/discovery/event-action/route.ts`
  - `recordCountAction()` is called at **lines ~97–106 without a try/catch**, so a DB error there
    escapes as a raw 500 with an empty body.
- `components/EventBoard.tsx:~805` — client `catch` always shows the generic
  "Could not save discovery action." message, hiding the server error.
- `lib/db.ts` — pool config (`max:1`), and `DATABASE_URL` is the connection string whose role
  needs the grant.

## Tasks

### 1. Identify the app role (Neon MCP)
- Read the role from the connection string the deployment uses. Preferred: pull
  `DATABASE_URL` from **Vercel** env (Production) via the Vercel MCP, parse the username =
  `<app_role>`. Cross-check against Neon's roles for the project/branch.
- Confirm current grants, e.g.:
  ```sql
  select grantee, privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name in ('reactions','event_intents')
  order by table_name, privilege_type;
  ```
  Expect to see SELECT/INSERT/UPDATE but **no DELETE** for `<app_role>`.

### 2. Apply the grant (Neon MCP, run SQL)
```sql
GRANT DELETE ON ALL TABLES IN SCHEMA public TO <app_role>;
-- so future tables inherit it too:
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT DELETE ON TABLES TO <app_role>;
```
- If Neon uses a separate owner role for `ALTER DEFAULT PRIVILEGES`, run that statement as the
  object owner (the role that created the tables).
- If there's a Neon **dev/preview branch**, apply to that branch first, verify, then production.

### 3. Verify at the DB level
Re-run the grants query from step 1 — DELETE should now appear. Optionally, as `<app_role>`:
```sql
begin;
delete from public.reactions where false;   -- must NOT raise "permission denied"
rollback;
```

### 4. Verify end-to-end
- On the deployed site (or `next dev` against the same DB), Fire an event then un-Fire it:
  the button should clear, the Fire count should drop by 1, no error banner.
- Un-Going should behave the same.
- Quick API check (browser devtools console on the site):
  ```js
  // eventId = any id from the board; fire twice, second call must be 200
  const eventId = '<REAL_EVENT_ID>';
  const fire = () => fetch('/api/discovery/event-action', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ action:'fire', eventId, surface:'debug' })
  }).then(r => r.status);
  await fire(); await fire(); // expect 200 then 200 (was 200 then 500)
  ```

### 5. Code hardening (separate commit, recommended)
So a future DB error never again shows an empty 500 / generic banner:
- Wrap the `recordCountAction(...)` call in `app/api/discovery/event-action/route.ts` in try/catch;
  on failure `console.error` and return
  `NextResponse.json({ error: "Could not update community counts." }, { status: 500 })`
  (mirrors the existing `recordDiscoveryEventAction` catch above it).
- Optional: in `components/EventBoard.tsx` catch, surface `err.message` when present instead of the
  hardcoded string.
- Run existing tests: `npm run test:feedback`, `npm run typecheck`, `npm run lint`.

## Safety / rollback
- The grant is additive and low-risk. Rollback if ever needed:
  ```sql
  REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM <app_role>;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE DELETE ON TABLES FROM <app_role>;
  ```
- No app redeploy is required for the grant to take effect. The code hardening in step 5 does
  require a deploy.

## Done when
- `<app_role>` confirmed and shown to have DELETE on `public.*`.
- Un-Fire and un-Going both return 200 and decrement counts on the live site.
- (If done) route returns a JSON error on count-write failure instead of an empty 500.
