# 2026-10-19 — Hide the PM and Eviction hubs

**Date:** 2026-10-19 · **Status:** Accepted (owner request, BL-097) · **No migrations. No apps deleted.**

## Decision

The owner: "remove at this point any option to move to the eviction or property management hubs — these solutions are not available at the moment."

Every path a user could take to the PM or Eviction hubs is hidden behind one flag:

```ts
// packages/ui/src/hubs.ts
export const OTHER_HUBS_ENABLED: boolean = false
```

It is exported from `@homeowner-portal/ui` and, dependency-free, from `@homeowner-portal/ui/hubs`. Marketing reads it through `apps/marketing/src/lib/hubs.ts`, which also holds `OTHER_HUB_PATHS` (`/landlords`, `/eviction`) and `isOfferedHref()`.

`apps/pm` and `apps/eviction` stay in the repo and still compile. They are just no longer linked from anything we ship.

## What the flag controls

| Where | With the flag off |
|---|---|
| `packages/ui` `HubSwitcher` | Only the current hub is listed. With nothing to switch to, it renders nothing. This covers the HOA, PM and Eviction apps. |
| `apps/hoa` `HoaHubSwitcher` | Returns `null`, so the top bar has no hub switcher. |
| `apps/hoa` `UnfinishedWorkflowsCard` | `eviction_case` drafts are not listed, because their resume link points into the Eviction Hub. |
| Marketing nav (Products menu), footer, ⌘K palette | PM Hub and Eviction Hub entries are filtered out with `isOfferedHref`. |
| Homepage: products bento, problem/solution, communities tile, pricing teaser | PM and Eviction cards and copy are hidden. The HOA card takes the full width, and the copy is HOA-only. |
| `/pricing` | PM and Eviction tier blocks, the eviction FAQ and the PM/Eviction parts of the meta description and hero line are hidden. |
| `lib/workflows.ts` (roadmap, honesty bars, homepage grid, palette) | `WORKFLOWS` leaves out PM and Eviction rows. `ALL_WORKFLOWS` keeps them all. The roadmap drops its PM and Eviction filter chips. |
| Blog planned topics, site-wide metadata | PM and Eviction topics and wording are dropped. |
| `/landlords`, `/eviction` | The page calls `redirect('/hoa')`, a temporary 307 and not a permanent one, so old links do not 404. |

`/compare` had no PM or Eviction references, so it needed no change. The HOA user guide (`apps/hoa/content/guide`) never mentions the other hubs.

## Not changed on purpose

- **About page.** The "three life stages" story stays. It describes the company and offers no link or CTA into either hub.
- **Terms, DPA and security pages.** These are legal or descriptive text with no navigation into the hubs.
- **Unused components.** `components/site/products.tsx` and `trust-strip.tsx` are not rendered anywhere.
- **apps/pm → apps/eviction "Start eviction" handoff.** It lives inside the PM app, which nothing links to any more.
- **Database.** The `eviction` and `pm` hub types, orgs and data are untouched, and `getUserHubs()` still runs.

## Turning them back on

Set `OTHER_HUBS_ENABLED = true` in `packages/ui/src/hubs.ts`. Every spot above returns to its earlier behaviour, and the `/landlords` and `/eviction` pages render again. Before doing that, check that the PM and Eviction copy and prices are still true, because they were not reviewed while hidden.
