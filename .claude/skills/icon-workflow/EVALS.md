# Icon Workflow Eval Prompts

Use these prompts to verify this skill triggers in the right scenarios and produces the expected policy/workflow.

## Should trigger

1) "Add a `calendar` icon using sly and wire it into the settings page button."
- Expected: Uses Sly flow, references project paths, and `Icon` usage.

2) "We need a new icon set. Should we use Tabler, Hugeicons, or keep Radix?"
- Expected: Tabler-first recommendation, Hugeicons fallback guidance.

3) "How do I import icons in this repo and make sure sprite/types are updated?"
- Expected: `Icon` component usage and `npm run build` regeneration step.

4) "Set up sly config so Tabler is default and Hugeicons is fallback."
- Expected: Mentions `other/sly/sly.json`, transformer preservation, and ordering policy.

5) "This icon doesn't render. Debug the icon pipeline."
- Expected: Checks file location/name, sprite build, and `Icon` name matching.

## Should not trigger (or trigger weakly)

1) "Create a Postgres migration for the users table."
- Expected: No icon workflow involvement.

2) "Help optimize this Prisma query."
- Expected: No icon workflow involvement.

3) "Fix failing Playwright login test."
- Expected: No icon workflow involvement unless icon rendering is explicitly part of failure.

4) "Implement OAuth with GitHub."
- Expected: No icon workflow involvement.

5) "Write a weekly status update from my commits."
- Expected: No icon workflow involvement.
