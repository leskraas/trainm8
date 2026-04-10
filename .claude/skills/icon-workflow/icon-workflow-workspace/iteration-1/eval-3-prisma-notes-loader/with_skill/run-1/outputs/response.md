This is a data-layer task, not an icon task.

- Add a composite or single-column index that matches the loader’s `where` +
  `orderBy` (typically `userId` and `createdAt` for a user’s notes).
- Replace `include` with `select` for only fields the route needs.
- Use `take`/`cursor` pagination instead of loading all rows.
- Re-check N+1 patterns if notes pull related entities.

No Sly or `Icon` changes are required unless the loader UI is explicitly in
scope.
