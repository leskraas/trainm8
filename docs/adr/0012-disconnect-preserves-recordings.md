# Disconnect preserves Recordings; source-side delete follows the same rule

Trainm8 ingests activities from external training services (Strava first,
Garmin/Polar later) into an inbox of **Activity Imports**, some of which the
athlete promotes to **Recordings** attached to a **Workout Session**. Recordings
carry a **TSS** that contributes to the **Training Load** time series the
**Coach card** reads. When an athlete disconnects an **Account Connection**, or
when the source provider emits a `delete` event for a previously imported
activity, we must decide whether to remove the data from trainm8.

## Decision

Disconnect and source-side `delete` remove only **non-promoted** Activity
Imports. Promoted **Recordings** survive along with their TSS contributions to
Training Load. The athlete's training history is treated as truthful and
immutable to source-side changes.

Source-side `update` events follow the same asymmetry: non-promoted Activity
Imports refresh to the new snapshot; promoted Recordings are immutable to
source-side mutations.

A source-initiated `status: revoked` does not immediately remove anything — the
athlete is given the chance to re-authorize. Only explicit athlete-initiated
disconnect (or a long quiet timeout, to be calibrated later) triggers cleanup
of non-promoted imports.

Full deletion of historical data (right-to-be-forgotten) is a separate,
explicit athlete operation, not part of disconnect.

## Considered options

- **Delete all imports and orphan the Workout Sessions on disconnect**:
  Rejected — silently re-writes the athlete's Training Load history. CTL/ATL/TSB
  shift retroactively, Coach card lies about yesterday's form, and Session Logs
  remain attached to phantom sessions with no telemetry. For a self-coaching
  athlete whose primary instrument is their own load history, this is the worst
  possible default.
- **Keep everything, never clean up**: Rejected — non-promoted imports
  accumulate forever for athletes who experiment with multiple providers, and
  no longer represent a viable promotion target once the source connection is
  gone.
- **Athlete chooses at disconnect time** ("keep my imports?"): Rejected for
  V1 — adds a modal to a path that should be a clean exit, and the "keep
  Recordings, drop inbox" default is the right one for almost every athlete.

## Consequences

- `disconnectAccountConnection()` runs in a transaction:
  set `status = revoked` or hard-delete the Account Connection row,
  cascade-delete Activity Imports where `promotedSessionId IS NULL` and
  `accountConnectionId` matches; leave promoted imports and their Recordings
  intact. (The promoted import row stays so Recording telemetry remains
  resolvable.)
- Strava webhook `delete` events for non-promoted imports cascade-delete the
  import. `delete` events for promoted imports are a no-op against the
  Recording but may log a marker for audit.
- Strava webhook `update` events refresh non-promoted imports in place;
  promoted imports ignore the update.
- The disconnect UI explains the rule plainly: "Your Strava activities that
  have become part of your training history will stay. Items in your import
  inbox will be removed."
- A separate "Delete all my Strava data" affordance covers the
  right-to-be-forgotten path and removes Recordings and Workout Sessions too —
  with a clear warning that Training Load history will change.
