# PRD 03: Admin Moderation

## Summary

Add a simple moderation surface so a trusted admin can hide inappropriate or spammy community submissions.

This phase keeps anonymous participation viable without introducing full user accounts.

## Implementation Status

Built in `/admin`, `/api/admin/login`, `/api/admin/contributions`, and `components/AdminModeration.tsx`. Production deploys should set `ADMIN_PASSWORD` and `ADMIN_SESSION_TOKEN`.

## Goals

- Protect the public pages from bad submissions.
- Keep moderation simple enough for one trusted person.
- Avoid paid moderation tools.
- Avoid full admin user management in MVP.

## Non-Goals

- No multi-admin roles.
- No moderation queues by default.
- No AI moderation.
- No audit-log product surface beyond basic timestamps.
- No paid auth or admin tooling.

## Requirements

### Admin Access

Path: `/admin`

Access must be protected by a single admin password or equivalent zero-cost secret.

### Admin View

The admin page must show:

- Recent contributions.
- Contribution type.
- Event title.
- Display name when provided.
- Body text or song link summary.
- Created timestamp.
- Current status.

### Moderation Actions

The admin can:

- Hide a visible contribution.
- Unhide a hidden contribution.
- Filter by visible, hidden, and pending status.

Default behavior:

- New song and note submissions appear immediately as `visible`.
- If spam becomes a real problem, the system can switch new submissions to `pending` later.

### Public Behavior

Public pages must:

- Show only `visible` contributions.
- Exclude `hidden` and `pending` contributions from public counts when practical.

## Dependencies

- PRD 02 contribution data model.
- Phase 0 stack decision for secret handling and deployment.

## Risks

- A single password is simple but not robust.
- Immediate visibility may expose bad content briefly.
- Admin tooling must be mobile-usable if moderation happens on the go.

## Acceptance Criteria

- Admin can log in with the configured password.
- Admin can view recent contributions.
- Admin can hide a contribution.
- Admin can unhide a contribution.
- Hidden contributions disappear from public detail pages.
- Public contribution counts do not inflate from hidden content.
- The implementation can run at `$0`.

## Test Scenarios

- Access `/admin` without password and confirm protected state.
- Log in with the admin password.
- Hide a visible song recommendation.
- Hide a visible text note.
- Confirm hidden content is absent from public pages.
- Unhide content and confirm it returns publicly.
