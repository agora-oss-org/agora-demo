# Sort Controls (A3 + A4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the deprecated `"new"` entity-sort alias with canonical `"createdAt"` in the Feed
tab, and add sort controls (sortBy + direction) to the comment section in `EntityView.tsx`.

**Architecture:** Both changes are pure UI wiring against SDK hooks that already support the
underlying params — no new SDK version, no server changes. A3 is a one-line array edit. A4 adds a
small controlled-input row that reads/writes state the `useCommentSectionData` hook already owns.

**Tech Stack:** React 18 + TypeScript, Vite. No test framework in this repo — verification is
`tsc -b` (via `pnpm build`) plus manual click-through against a locally running Agora server, per
`CLAUDE.md`.

## Global Constraints

- No test suite or linter exists in this repo — do not add one. Verification = `pnpm build`
  (typecheck) + manual UI check.
- Hook return values are cast `as any` throughout the codebase (the SDK's exported types are
  incomplete) — keep this style, don't fight the types.
- Analytics: `track()` is narrowed to the `AnalyticsEvent` union in `src/analytics.ts` — a
  misspelled event name fails the build. Metadata must be low-cardinality enums/booleans only,
  never IDs or free text.
- Styling: reuse existing utility classes (`row`, `muted`, `pill`, etc.) from `src/styles.css` —
  no new CSS framework, no new stylesheet. `button:disabled` styling (opacity 0.5) already exists
  globally, so a plain `disabled` attribute needs no extra CSS.
- Spec of record: `docs/superpowers/specs/2026-07-07-sort-controls-design.md`.

---

### Task 1: Feed entity sort — replace `"new"` with `"createdAt"`

**Files:**
- Modify: `src/Feed.tsx:10`

**Interfaces:**
- Consumes: nothing new — `fetchEntities({}, { sortBy: sort }, ...)` (already defined at
  `src/Feed.tsx:21`) forwards the selected string verbatim.
- Produces: nothing consumed by later tasks (Task 1 and Task 2 are independent).

- [ ] **Step 1: Edit the `SORTS` array**

In `src/Feed.tsx`, change line 10 from:

```ts
const SORTS = ["hot", "top", "new", "controversial", "decay", "gravity", "wilson", "bayesian"];
```

to:

```ts
const SORTS = ["hot", "top", "createdAt", "controversial", "decay", "gravity", "wilson", "bayesian"];
```

No other line in `Feed.tsx` needs to change — `sortBy` state, the `<select>` render, and the
`change_feed_sort` analytics call at line 43 all already work off whatever string is in `SORTS`.

- [ ] **Step 2: Typecheck**

Run: `pnpm build`
Expected: exits 0, no new TypeScript errors (this change is a string literal in an untyped array,
so it cannot introduce a type error — this step is a sanity check that nothing else broke).

- [ ] **Step 3: Manual verification**

With the local Agora server running (`cd ../agora-server/apps/api && npm run dev`) and this app's
dev server up (`pnpm dev`):
1. Open the Feed tab, select `createdAt` from the sort dropdown.
2. Confirm the entity list reorders (compare against `hot` or `top`) and the summary line reads
   `"... sorted by createdAt"`.
3. Confirm `"new"` no longer appears anywhere in the dropdown's options.

- [ ] **Step 4: Commit**

```bash
git add src/Feed.tsx
git commit -m "feat(feed): replace deprecated new sort alias with createdAt"
```

---

### Task 2: Add `change_comment_sort` to the analytics event union

**Files:**
- Modify: `src/analytics.ts:31`

**Interfaces:**
- Produces: `AnalyticsEvent` now includes the literal `"change_comment_sort"`, which Task 3's
  `track("change_comment_sort", { sortBy, sortDir })` call depends on to typecheck.

- [ ] **Step 1: Add the event to the union**

In `src/analytics.ts`, change line 31 from:

```ts
  // comments
  | "post_comment" | "edit_comment" | "delete_comment"
```

to:

```ts
  // comments
  | "post_comment" | "edit_comment" | "delete_comment" | "change_comment_sort"
```

- [ ] **Step 2: Typecheck**

Run: `pnpm build`
Expected: exits 0. (No call site references the new event yet — this step only confirms the union
edit itself is syntactically valid.)

- [ ] **Step 3: Commit**

```bash
git add src/analytics.ts
git commit -m "feat(analytics): add change_comment_sort event"
```

---

### Task 3: Comment section sort controls

**Files:**
- Modify: `src/EntityView.tsx:619-684` (the `Comments` function)

**Interfaces:**
- Consumes: `"change_comment_sort"` from `AnalyticsEvent` (Task 2). `useCommentSectionData`'s
  `sortBy: CommentsSortByOptions | null`, `setSortBy: (s: CommentsSortByOptions) => void`,
  `sortDir: "asc" | "desc"`, `setSortDir: (d: "asc" | "desc") => void` — all already returned by
  the hook at `node_modules/@agora-sdk/core/dist/esm/hooks/comments/useCommentSectionData.d.ts`,
  confirmed present in the installed SDK version.
- Produces: nothing consumed by later tasks — this is the last task in the plan.

- [ ] **Step 1: Destructure the hook's sort state**

In `src/EntityView.tsx`, change line 621 from:

```tsx
  const { comments, newComments, loading, createComment, updateComment, deleteComment, loadMore, hasMore } = cs;
```

to:

```tsx
  const { comments, newComments, loading, createComment, updateComment, deleteComment, loadMore, hasMore, sortBy, setSortBy, sortDir, setSortDir } = cs;
```

- [ ] **Step 2: Add the sort control row**

In `src/EntityView.tsx`, change the render's opening (currently lines 646-648):

```tsx
  return (
    <div className="panel col">
      <strong>Comments {loading ? "…" : `(${all.length})`}</strong>
```

to:

```tsx
  const COMMENT_SORTS = ["createdAt", "top", "controversial"] as const;

  return (
    <div className="panel col">
      <div className="row">
        <strong>Comments {loading ? "…" : `(${all.length})`}</strong>
        <span className="spacer" />
        <label className="muted">sort</label>
        <select
          value={sortBy ?? "createdAt"}
          onChange={(e) => {
            const next = e.target.value as (typeof COMMENT_SORTS)[number];
            setSortBy(next);
            track("change_comment_sort", { sortBy: next, sortDir });
          }}
          style={{ width: "auto" }}
        >
          {COMMENT_SORTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button
          disabled={sortBy !== "createdAt"}
          onClick={() => {
            const next = sortDir === "asc" ? "desc" : "asc";
            setSortDir(next);
            track("change_comment_sort", { sortBy: sortBy ?? "createdAt", sortDir: next });
          }}
        >
          {sortDir === "asc" ? "▲ asc" : "▼ desc"}
        </button>
      </div>
```

Note: `COMMENT_SORTS` is declared just above the `return` (inside the `Comments` function body,
same scope as `all`/`highlightLoaded`) rather than at module scope, since it's only used in this
one render.

- [ ] **Step 3: Typecheck**

Run: `pnpm build`
Expected: exits 0. If TypeScript complains about `e.target.value as (typeof COMMENT_SORTS)[number]`
not being assignable to `setSortBy`'s parameter type, cast the whole call instead:
`setSortBy(next as any)` — consistent with the codebase's existing `as any` convention for SDK
hook values.

- [ ] **Step 4: Manual verification**

With the local Agora server and this app's dev server running:
1. Open any entity with several comments in the Feed tab.
2. Change the sort dropdown to each of `createdAt`, `top`, `controversial` — confirm the comment
   order changes and the direction button disables (greyed out, per the global `button:disabled`
   style) for everything except `createdAt`.
3. With `createdAt` selected, click the direction button and confirm it toggles between `▲ asc`
   and `▼ desc`, and the comment order reverses.
4. Confirm newly-posted comments (the `newComments` overlay) still render above the sorted list
   regardless of the active sort — post a comment while sorted by `top` and confirm it still shows
   at the very top.

- [ ] **Step 5: Commit**

```bash
git add src/EntityView.tsx
git commit -m "feat(comments): add sortBy/direction controls to comment section"
```

---

## Self-Review Notes

- **Spec coverage:** A3 → Task 1. A4 → Tasks 2+3 (analytics event split out as its own task since
  it's an independently reviewable/committable change, per task right-sizing). Both spec sections
  are fully covered; no gaps.
- **Placeholders:** none — every step has literal code and exact line references.
- **Type consistency:** `sortBy`/`setSortBy`/`sortDir`/`setSortDir` names match the hook's actual
  `.d.ts` signatures verified during spec — no renaming across tasks.
