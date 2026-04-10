1. Prefer Tabler: run `npx sly add`, select the Tabler library, add the `calendar` icon into `other/svg-icons` (or use `npx sly add <tabler-library> calendar` if the registry name is known).
2. Run `npm run build` to refresh the SVG sprite and generated icon name types.
3. In the schedule button: `import { Icon } from '#app/components/ui/icon.tsx'` and `<Icon name="calendar" title="Schedule" />` (or `aria-hidden` if decorative next to visible text).
