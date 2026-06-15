# ADR 001: Real-Time Taste Signals and Event State Persistence

## Context
During the implementation of "Personalized Discovery V2", we noticed that the "Remove" event flow was not functioning correctly. Removed events were reappearing upon page reload, and the removal actions were not updating the "Taste Signals" (`preferenceSignals`) in real-time. 

The underlying cause was a discrepancy between the database schema defined in `schema.sql` and the actual tables deployed to the Aiven PostgreSQL production instance. Specifically, four tables (`event_intents`, `event_interaction_events`, `event_person_event_state`, `spotify_event_match_corrections`) were missing.

Additionally, the error handling in `lib/discovery-memory.ts` and `app/api/discovery/event-action/route.ts` was suppressing database write errors (specifically PostgreSQL error `42P01` for undefined tables). Instead of failing, the API returned a mock successful response (`fallbackStateForAction`), misleading the client into believing the state change was persisted.

Furthermore, on the client side (`components/EventBoard.tsx`), the `preferenceSignals` array was a static prop passed from the server. This meant that user actions (like removing or firing an event) did not immediately feedback into the discovery scoring engine, requiring a full page reload for the personalization to take effect.

## Decision
1. **Database Consistency:** Ensure all discovery-related tables defined in `schema.sql` are explicitly migrated to the production database. A dedicated migration script (`migrate-missing-tables.sql`) was provided.
2. **Strict Error Handling:** We will no longer mask database write failures for state-mutating actions (like "fire", "planning", or "remove").
   - `recordDiscoveryEventAction` in `lib/discovery-memory.ts` will allow errors from `writePersonEventState` to propagate.
   - The API route `/api/discovery/event-action` will catch these errors and return a `500 Internal Server Error`, rather than falling back to fake state.
3. **Real-time Client State:** We made the `preferenceSignals` in `EventBoard.tsx` stateful (`localPreferenceSignals`). After any successful interaction (e.g., removing an event), the client will immediately append a new `DiscoveryPreferenceSignal` to its local state. This triggers an immediate recalculation of `scoreDiscoveryEvents`, instantly updating the ranking of similar events without a page reload.
4. **Single Source of Truth for Visibility:** The server will now pass all events to the `EventBoard` component, rather than pre-filtering removed events. The client-side component will solely handle filtering based on its internal `discoveryStates`, ensuring accurate counts and seamless "undo" functionality.

## Consequences
- **Positive:** Users experience immediate feedback when interacting with events. Removing a show instantly down-ranks similar shows. Database errors are now visible, preventing silent failures.
- **Negative:** None expected, assuming the database schema is correctly synchronized. If tables are missing, the app will explicitly fail (HTTP 500) rather than silently ignoring user actions.
