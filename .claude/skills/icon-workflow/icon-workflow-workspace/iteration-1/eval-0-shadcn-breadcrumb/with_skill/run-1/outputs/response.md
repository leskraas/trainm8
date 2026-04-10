## Plan

1. Open the generated breadcrumb component under `app/components/ui/` and find `from 'lucide-react'` (shadcn defaults to `iconLibrary: lucide` in `components.json`).
2. Add sprite icons via Sly (Tabler first): e.g. `npx sly add` and pick Tabler, install `chevron-right` and `dots` (or closest Tabler names) into `other/svg-icons`.
3. Replace `<ChevronRight />` / `<MoreHorizontal />` with:

```tsx
import { Icon } from '#app/components/ui/icon.tsx'

<Icon name="chevron-right" aria-hidden="true" />
<Icon name="dots" aria-hidden="true" />
```

(Use the exact basenames of the files Sly wrote, kebab-case.)

4. Run `npm run build` so `vite-plugin-icons-spritesheet` regenerates `app/components/ui/icons/sprite.svg` and icon name types.
5. Remove unused `lucide-react` imports. If anything is still missing from Tabler, add Hugeicons via Sly as fallback, or leave a single Lucide import only as a last resort.
