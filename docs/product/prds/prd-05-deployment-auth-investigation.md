# PRD 05: Deployment and Auth Investigation

## Summary

Investigate the simplest `$0` deployment stack that can support the first build and leave room for future auth options.

This PRD is an investigation deliverable, not an implementation commitment.

## Implementation Status

Documented in [Deployment and Auth Investigation](../deployment-auth-investigation.md). Recommendation: Vercel Hobby plus Aiven Free PostgreSQL for public deployment persistence, anonymous MVP participation, and full auth later only when accounts create clear product value.

## Goals

- Keep initial project costs at `$0`.
- Choose a simple deployment path for the MVP.
- Confirm database and storage options for events and community content.
- Evaluate future auth support for Google, plain email, Spotify, Apple Music, and AVLgo.
- Avoid locking into a stack that makes future auth painful.

## Non-Goals

- No paid provider selection.
- No full user accounts in MVP.
- No production auth implementation during the MVP unless a later decision explicitly adds it.
- No assumption that Spotify, Apple Music, or AVLgo can act as general-purpose identity providers without verification.

## Investigation Questions

### Hosting

- Where can the web app be hosted for `$0`?
- Does the host support the likely framework?
- Does the host support scheduled sync or a zero-cost equivalent?
- What are the free-tier limits?
- What happens if usage exceeds free-tier limits?

### Database

- Where can event records, contributions, and reactions be stored for `$0`?
- Does the database support simple local development?
- Does it support basic rate limiting or enough metadata to implement it?
- Can data be exported or migrated later?

### Storage

- Is `$0` storage realistic for images or voice memos?
- What size and bandwidth limits apply?
- Can voice memos be deferred without blocking core launch?

### Authentication

Evaluate these auth paths:

- Google auth.
- Plain email auth.
- Spotify auth.
- Apple Music auth.
- AVLgo auth, if AVLgo supports any relevant auth flow.

For each path, determine:

- Whether it can be used for user login.
- Whether it is meant only for API authorization.
- Whether it requires paid developer access.
- Whether it works with the selected hosting stack.
- Whether it adds meaningful value before accounts are needed.

## Deliverables

- A short decision memo with the recommended `$0` stack.
- A cost table showing free limits and likely upgrade triggers.
- Auth feasibility table for Google, email, Spotify, Apple Music, and AVLgo.
- Recommendation on whether MVP should stay anonymous.
- Recommendation on when to add accounts.
- Risk list for anything that could create cost or auth complexity.

## Default Recommendation Until Research Is Complete

- MVP remains anonymous.
- Use optional display names only.
- Use session-based reactions.
- Use a single admin password for moderation.
- Defer full auth until a clear need appears.
- Defer voice memos if `$0` storage is not practical.

## Acceptance Criteria

- The team has a documented `$0` stack recommendation before implementation starts.
- The recommendation covers hosting, database, storage, scheduled sync, and admin secrets.
- Auth feasibility is documented for Google, email, Spotify, Apple Music, and AVLgo.
- Any paid requirement is clearly marked as incompatible with the initial constraint.
- The MVP can start without paid services.

## Test Scenarios

- Deploy a minimal app on the recommended host.
- Store and read a test event record.
- Store and read a test contribution.
- Run or simulate a scheduled AVLgo sync.
- Confirm admin secret configuration works.
- Prototype at least one low-cost auth path only if accounts become part of the next phase.
