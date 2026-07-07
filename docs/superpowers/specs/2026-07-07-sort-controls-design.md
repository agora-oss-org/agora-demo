# Design: entity + comment sort controls (A3 + A4)

**Status:** approved, ready for implementation plan
**Source:** `docs/NEW-FUNCTIONALITY.md` items A3 and A4 (server-side already ships both; this is
UI-only wiring in the demo)

## Context

The demo exists to exercise SDK/server contract surfaces 1:1. Two sort-related surfaces are
already fully supported server-side but not exposed in the demo's UI:

- **A3 — entity list sort.** `Feed.tsx`'s sort dropdown only offers the deprecated `"new"` alias,
  never the canonical `"createdAt"` value the server also accepts.
- **A4 — comment sort.** `EntityView.tsx`'s comment section has no sort control at all, even
  though the installed SDK (`@agora-sdk/core` 1.8.0)'s `useCommentSectionData` hook already
  exposes `sortBy`/`setSortBy`/`sortDir`/`setSortDir` — confirmed by reading
  `node_modules/@agora-sdk/core/dist/esm/hooks/comments/useCommentSectionData.d.ts` directly.

Both are small, mechanical, and require no SDK upgrade or server changes — pure demo-side UI
additions.

## A3 — Feed entity sort: replace `"new"` with `"createdAt"`

The server treats `"new"` as a deprecated directional alias for `"createdAt"` DESC (RFC 8594
deprecation header). Rather than exercise both aliases side by side, we're standardizing the demo
on the canonical value and dropping the deprecated one from the UI.

**Change:** in `src/Feed.tsx`, the `SORTS` array (line 10) —
```
["hot", "top", "new", "controversial", "decay", "gravity", "wilson", "bayesian"]
```
→
```
["hot", "top", "createdAt", "controversial", "decay", "gravity", "wilson", "bayesian"]
```

No other code changes. `fetchEntities({}, { sortBy: sort }, ...)` already forwards whatever string
is selected verbatim to the SDK, so `"createdAt"` flows through unchanged. The existing
`change_feed_sort` analytics event (in `src/analytics.ts`) fires exactly as it does today, now
reporting `"createdAt"` as its metadata value instead of `"new"`.

## A4 — Comment section: sortBy + direction controls

**UI:** add a small control row above the comment list in `EntityView.tsx`, alongside wherever the
comment count/heading currently renders:
- A `<select>` for `sortBy` with three canonical options: `createdAt`, `top`, `controversial`.
  (`"new"`/`"old"` are deprecated aliases for `createdAt` desc/asc and are intentionally excluded,
  consistent with the A3 decision.)
- A direction toggle (asc/desc) that is **enabled only when `sortBy === "createdAt"`** — `top` and
  `controversial` aren't directional in the SDK's own model, so the toggle should be visibly
  disabled/greyed out for those two values rather than silently ignored.

**Wiring:** `useCommentSectionData({ entityId, limit: 20 })` (currently called with no sort input
at `EntityView.tsx:620`) already returns `sortBy`, `setSortBy`, `sortDir`, `setSortDir`. The new
controls call these setters directly — no local component state duplicating the hook's own state.

**Analytics:** add `"change_comment_sort"` to the `AnalyticsEvent` union in `src/analytics.ts`
(comments section of the union, alongside `post_comment`/`edit_comment`/`delete_comment`). Fire it
on every sort or direction change with `{ sortBy, sortDir }` metadata — both are low-cardinality
enums, consistent with the existing "never IDs or free text" analytics convention.

**Interaction with existing comment behavior:** none. The `newComments`-on-top-of-`comments` merge
(documented inline in `EntityView.tsx`) is independent of sort order — optimistic comments still
render above the server-ordered list regardless of which `sortBy`/`sortDir` is active.

## Out of scope

- Group B items (notification preferences, space visibility, conversation mute, etc.) — blocked on
  server-side work per `docs/NEW-FUNCTIONALITY.md`, not part of this spec.
- A1 (Events), A2 (push registration), A5 (live conversation list) — separate specs, to be
  brainstormed after this one per the agreed sequencing (quick wins → A5 investigation → A2 → A1).

## Testing

No test suite exists in this repo (manual verification only, per `CLAUDE.md`). Verification is:
click through both dropdowns against a locally running Agora server, confirm the entity list
reorders on `createdAt` change and comments reorder on each `sortBy`/`sortDir` combination,
including the disabled-toggle state for `top`/`controversial`.
