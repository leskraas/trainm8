# Migrate from notes app to training app

Trainm8 was bootstrapped from the Epic Stack (a notes app). The notes domain has
no relationship to training and splits the app's identity. We remove it entirely
and restructure around training: dashboard on `/` for logged-in users,
`SessionLog` model (text + RPE) replaces `Note`/`NoteImage`, user profiles and
user listing removed, persistent app navigation (bottom tabs mobile, top nav
desktop).

## Considered options

- **Keep notes alongside training**: Rejected — splits the app's identity and
  forces context-switching between unrelated features.
- **Repurpose the Note model for session logs**: Rejected — Note and SessionLog
  are different domain concepts with different relationships. A clean model
  avoids inheriting irrelevant schema.
- **Keep user profiles for future social features**: Rejected — the app targets
  self-coaching athletes with no current social use case. Profiles can be
  rebuilt with training context when needed.

## Consequences

- Prisma migration removes Note/NoteImage tables, adds SessionLog table.
- All notes-related routes, components, and tests are deleted.
- `/users` and `/users/$username` routes are deleted; `/me` redirects to `/`.
- Root layout gains persistent navigation (Home, Training, Settings).
- All "Epic Notes" branding replaced with "Trainm8".
