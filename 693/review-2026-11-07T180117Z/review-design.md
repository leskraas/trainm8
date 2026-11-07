# Design review (codebase-design): PR #693

- **`PlanGuardNotices({ season })`** (`app/routes/training/__season-notices.tsx`) is a deep module: one prop (the loader's `season`) in front of the ramp derivation, the three fit/band reads, the ordering, the empty case (`null`, no wrapper) and the three dismissible notices. Deletion test: removing it would put the derivation back in each caller (it lived in `BlocksReading` before), so it earns its keep. Making `RampGuardNotice`, `AvailabilityFitNotice`, `BandFitNotice` and `DismissibleNotice` module-private turns "each notice once" from a convention into a structural fact: locality for the guards in one file.
- **Seam**: the `notices?: ReactNode` slot on `PlanLeadCard` is a thin layout slot, not a seam that varies; it is justified because the card already has `children` for in-card actions (#673) and the notices must sit outside `PlanCard`. Keying by `season.outlineId` at the caller is part of `PlanGuardNotices`' interface (documented in its JSDoc); acceptable, since the key is a mount-identity concern of the page.
- **Testability**: tests cross the same seam a caller does (render the route, read `[data-plan-lead]`); no test reaches past the interface.
- `BlocksReading` shrank to one reason to change (the phases); good.

Findings: none.
