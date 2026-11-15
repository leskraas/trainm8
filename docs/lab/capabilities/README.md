# Lab Engine — the contract

Every Lab App reads and changes data only through these capabilities. Three
documents describe them in full:

- [reads.md](reads.md): who the athlete is, today, a week, the plan, a session,
  history, progress, proposals, zones, exercises, recordings.
- [setup.md](setup.md): getting started, goal, plan preview and accept,
  connections and uploads, settings, export, delete.
- [sessions.md](sessions.md): done, skip, move, swap, shorten, ease, add,
  delete, link a recording, feeling, strength logging, proposals, undo.

## How to call

- Server (loader/action): `runCapability(request, name, input)` from
  `#app/lab/engine/registry.server.ts` →
  `{ ok: true, value } | { ok: false, code, message }`.
- Browser: `useCapability(name).call(input)` from `#app/lab/engine/client.ts`
  (revalidates the page's loaders after a successful write), or
  `uploadToCapability(name, formData)` for file uploads. Reads also answer
  `GET /lab/api/<name>?input=<json>`.
- Types:
  `import type { … } from '#app/lab/engine/{reads,setup,sessions}.types.ts'`.
- `message` on a failure is Norwegian and safe to show as it is.

## The journey, job by job

| Job (product brief)   | Capabilities                                                                                                                                                                                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Komme i gang        | `athlete` (its `setup` says first open or returning, and what is next), `get_setup`, `set_sports`, `set_experience_level`, `set_current_volume`, `set_availability`, `set_strength`, `set_session_preferences`, `set_timezone`, `search_places`, `set_home_place`                                                      |
| 2 Koble på klokka     | `connections`, `connect_intervals_icu`, `upload_activity_files`, `sync_sources`, `import_status`, `recordings`                                                                                                                                                                                                         |
| 3 Sette et mål        | `goal`, `set_goal`, `apply_goal_to_plan`, `update_goal`, `remove_goal`, `undo_goal_change`                                                                                                                                                                                                                             |
| 4 Få en plan          | `start_options`, `plan_preview`, `accept_plan` (this completes getting started), `plan`                                                                                                                                                                                                                                |
| 5 Vite hva i dag      | `today`, `session`                                                                                                                                                                                                                                                                                                     |
| 6 Gjøre og registrere | `mark_done`, `link_options`, `link_recording`, `unlink_recording`, `strength_session`, `start_strength_session`, `log_strength_set`, `remove_strength_set`, `finish_strength_session`, `log_strength_as_planned`, `plates_for`, `exercises`, `exercise`                                                                |
| 7 Hvordan det kjentes | `rate_session`, `note_session`                                                                                                                                                                                                                                                                                         |
| 8 Når livet skjer     | `move_session`, `swap_sessions`, `skip_session`, `shorten_session`, `ease_session`, `ease_week`, `add_session`, `delete_session`, `release_session`, `set_counts_toward_plan`, `proposals`, `answer_proposal`, `accept_round`, `accept_all_proposals`, `undo_change`, `undo_all_changes`, `refresh_adaptation`, `undo` |
| 9 Hvordan det gikk    | `session` (planned vs actual and its verdict), `week`                                                                                                                                                                                                                                                                  |
| 10 Fremgang           | `progress`, `week`, `plan`                                                                                                                                                                                                                                                                                             |
| 11 Endre ting         | `zones`, `thresholds`, `set_thresholds`, `set_availability`, `set_preferences`, `set_display_name`, goal capabilities, `connections`, `disconnect_source`, `export_data`, `delete_account`                                                                                                                             |

## Things that span two documents

- **Numbers** are `{ value: number | null, why: string | null }` in the reads;
  when `value` is null, show `why` (or your app's way of saying "unknown"),
  never 0.
- **Strength:** log from `strength_session` (sessions.md). Its sets carry the
  `setIndex` that `log_strength_set` and `remove_strength_set` take. The
  `session` read's strength sets are for showing, not for logging.
- **Undo** is always the token a write returned, passed to `undo`. There is no
  undo by session id. A write that cannot be undone says why in `noUndoBecause`;
  confirm before calling it (`delete_session`, `delete_account`, `accept_plan`).
- **`session.can`** (reads) is a hint for what to offer; the write has the last
  word and answers with a `code` and a `message` when it refuses.
- **Proposals:** read them with `proposals`, answer them with `answer_proposal`
  / `accept_round` / `accept_all_proposals`; changes the plan made on its own
  are listed there too and undone with `undo_change` / `undo_all_changes`.
- **Demo data** only when you pass `demo: true` to a read, and it comes back
  with `source: 'demo'`. Say so on screen.
