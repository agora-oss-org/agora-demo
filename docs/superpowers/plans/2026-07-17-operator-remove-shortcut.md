# Operator "Remove" Shortcut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give deployment operators a one-click "Remove" button in the demo's Report panel that files the report and removes the content in one shot, preserving the report in moderation history.

**Architecture:** A small raw-fetch helper (`operatorModeration.ts`) files the report via `POST /reports` (reading back the created id, which the SDK hook discards) then removes it via the operator-only `PATCH /reports/:id/resolve` — mirroring the admin app's project-level `actOnReport`. The Report panel gains an operator-gated Remove button; on success one `onRemoved` callback bumps a `refreshKey` keyed onto `EntityProvider`, remounting it so the entity and comment section re-pull and render their existing removed-tombstones.

**Tech Stack:** Vite + React + TypeScript, `@agora-sdk/react-js` hooks, native `fetch`. No test framework — the static gate is `pnpm build` (tsc), verification is manual click-through per repo convention.

## Global Constraints

- **Package manager is pnpm** — never `npm install`. Build/typecheck: `pnpm build` (runs `tsc -b` then `vite build`).
- **No tests, no linter** — `pnpm build` (tsc) is the only static check; everything else is manual click-through.
- **Hook return values are cast `as any`** throughout `EntityView.tsx` — keep this style; the SDK types are incomplete.
- **Operator gate is `isOperatorToken(accessToken)`** (already defined in `src/EntityView.tsx`), the JWT `operator` claim — NOT the profile `UserRole`. Never gate on `user.role`.
- **Analytics:** fire on success only, low-cardinality enums/booleans, **never IDs or free text**; event names must be in the `AnalyticsEvent` union in `src/analytics.ts` or the build fails.
- **`API_BASE_URL` already includes the `/v7` version prefix**; the per-project path segment is `/${PROJECT_ID}` (both exported from `src/config.ts`).

---

### Task 1: `reportAndRemove` helper module

**Files:**
- Create: `src/operatorModeration.ts`

**Interfaces:**
- Consumes: `API_BASE_URL`, `PROJECT_ID` from `src/config.ts`.
- Produces: `reportAndRemove(opts: { targetType: "entity" | "comment"; targetId: string; reason: string; details?: string; accessToken: string }): Promise<any>` — files a report then resolves it as removed; returns the created report. Throws `Error` (message from the server's `error` field or `HTTP <status>`) on any non-2xx.

- [ ] **Step 1: Create the helper module**

Create `src/operatorModeration.ts`:

```ts
// Operator-only "report → remove" shortcut. Mirrors the admin app's project-level actOnReport
// (apps/admin/src/lib/moderation.ts): file the report, then resolve it as "removed" via the
// operator-only endpoint, which moderates the target AND resolves the report in one server call —
// so the report is preserved in the moderated queue (moderation history).
//
// This is the demo's ONLY raw HTTP call — everything else goes through SDK hooks. It exists because
// the SDK's useCreateReport discards the POST response, so it can't hand back the new report's id
// (needed for the resolve call). Unlike the SDK's axios client this does NOT auto-refresh on 401;
// useTokenRefresh() in Shell keeps the token fresh proactively, so in practice it won't 401 — if it
// does, the caller surfaces the error and the operator retries. Fine for a manual test harness.
import { API_BASE_URL, PROJECT_ID } from "./config";

async function authed(path: string, accessToken: string, init: RequestInit): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/${PROJECT_ID}${path}`, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export async function reportAndRemove(opts: {
  targetType: "entity" | "comment";
  targetId: string;
  reason: string;
  details?: string;
  accessToken: string;
}): Promise<any> {
  const { targetType, targetId, reason, details, accessToken } = opts;
  const note = details?.trim() || undefined;
  // 1. File the report (returns it, incl. id).
  const report = await authed(`/reports`, accessToken, {
    method: "POST",
    body: JSON.stringify({ targetType, targetId, reason, details: note }),
  });
  // 2. Resolve as "removed" — moderates the target + resolves the report (operator god-view).
  await authed(`/reports/${report.id}/resolve`, accessToken, {
    method: "PATCH",
    body: JSON.stringify({ action: "removed", reason: note }),
  });
  return report;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm build`
Expected: PASS (no type errors; the new export is unused for now, which tsc allows for exported members).

- [ ] **Step 3: Commit**

```bash
git add src/operatorModeration.ts
git commit -m "feat(moderation): add operator reportAndRemove helper"
```

---

### Task 2: Operator Remove button in the Report panel

**Files:**
- Modify: `src/analytics.ts:33` (add `moderate_remove` to the `AnalyticsEvent` union)
- Modify: `src/EntityView.tsx` (`ReportButton`, lines ~30-143)

**Interfaces:**
- Consumes: `reportAndRemove` (Task 1); `isOperatorToken` (already in `src/EntityView.tsx:406`, in scope, no import); `useAuth` (already imported at `src/EntityView.tsx:7`).
- Produces: `ReportButton` gains an optional prop `onRemoved?: () => void`, called after a successful operator remove. Consumed by Task 3.

- [ ] **Step 1: Add the analytics event**

In `src/analytics.ts`, change line 33 from:

```ts
  | "add_reaction" | "remove_reaction" | "submit_report"
```

to:

```ts
  | "add_reaction" | "remove_reaction" | "submit_report" | "moderate_remove"
```

- [ ] **Step 2: Add `onRemoved` prop + `accessToken` to `ReportButton`**

In `src/EntityView.tsx`, change the `ReportButton` signature (lines 30-37) from:

```tsx
function ReportButton({
  targetType, targetId, ownerId, disabled,
}: {
  targetType: "entity" | "comment";
  targetId: string;
  ownerId?: string;
  disabled?: boolean;
}) {
  const { user } = useUser() as any;
```

to:

```tsx
function ReportButton({
  targetType, targetId, ownerId, disabled, onRemoved,
}: {
  targetType: "entity" | "comment";
  targetId: string;
  ownerId?: string;
  disabled?: boolean;
  onRemoved?: () => void;
}) {
  const { user } = useUser() as any;
  const { accessToken } = useAuth() as any;
```

- [ ] **Step 3: Add the operator remove handler**

In `src/EntityView.tsx`, immediately after the existing `submit` function (ends at line 96, the closing `};` of `submit`), add:

```tsx
  // Operator-only shortcut: file THIS report as filled in, then remove the content in one go
  // (reportAndRemove → the admin's project-level report-resolve). Preserved in moderation history.
  // No confirm: the operator already filled the panel and clicked a labelled danger button.
  const removeNow = async () => {
    setBusy(true); setErr(null);
    try {
      await reportAndRemove({ targetType, targetId, reason, details, accessToken });
      track("moderate_remove", { target: targetType });
      setDone(true); setOpen(false);
      setReason("spam"); setDetails("");
      onRemoved?.();
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || "Couldn't remove this content");
    } finally { setBusy(false); }
  };
```

- [ ] **Step 4: Render the Remove button in the panel footer**

In `src/EntityView.tsx`, change the footer row (lines 133-136) from:

```tsx
            <div className="row">
              <span className="spacer" />
              <button className="primary" disabled={busy} onClick={submit}>{busy ? "Submitting…" : "Submit report"}</button>
            </div>
```

to:

```tsx
            <div className="row">
              <span className="spacer" />
              {isOperatorToken(accessToken) && (
                <button
                  className="danger"
                  disabled={busy}
                  onClick={removeNow}
                  title="Files this report, then removes the content — kept in moderation history"
                >{busy ? "Working…" : "🚫 Remove"}</button>
              )}
              <button className="primary" disabled={busy} onClick={submit}>{busy ? "Submitting…" : "Submit report"}</button>
            </div>
```

- [ ] **Step 5: Add the `reportAndRemove` import**

In `src/EntityView.tsx`, after the existing import block (the `@agora-sdk/react-js` import ending at line 9), add:

```tsx
import { reportAndRemove } from "./operatorModeration";
```

- [ ] **Step 6: Typecheck**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 7: Manual verification (server-side)**

Start the stack if not running (`pnpm dev`, with the Agora server + seeded operator per CLAUDE.md). Then:
1. Signed in as an operator (`@demoadmin`), open any post's Report panel (🚩) → a red **🚫 Remove** button appears left of "Submit report".
2. Sign in as a non-operator seed account (e.g. `alice@seed.test`) → the Remove button is **absent**; only "Submit report" shows.
3. Back as operator, pick a reason + details, click **🚫 Remove** → panel closes, shows "✓ Reported". (The post view does NOT refresh to a tombstone yet — that's Task 3.)
4. In the admin app's Moderation → **moderated** queue, the report appears with decision "removed" (not in pending).

- [ ] **Step 8: Commit**

```bash
git add src/analytics.ts src/EntityView.tsx
git commit -m "feat(moderation): operator Remove button in the report panel"
```

---

### Task 3: Remount to show the tombstone immediately

**Files:**
- Modify: `src/EntityView.tsx` (`EntityView` outer ~145-170, `Inner` ~173/280-300, `Reactions` ~457/485, `Comments` ~619/697-705, `CommentRow` ~493/610)

**Interfaces:**
- Consumes: `ReportButton`'s `onRemoved?` prop (Task 2).
- Produces: none (terminal feature wiring).

- [ ] **Step 1: Add `refreshKey` and key the `EntityProvider`**

In `src/EntityView.tsx`, the outer `EntityView` component currently ends (lines 164-170) with:

```tsx
  useEffect(() => { trackPageView(PATHS.entity); }, []);
  const providerProps = { entityId, include: ["user"] } as any;
  return (
    <EntityProvider {...providerProps}>
      <Inner onBack={onBack} entityId={entityId} backLabel={backLabel} highlightCommentId={highlightCommentId} highlightEntity={highlightEntity} />
    </EntityProvider>
  );
}
```

Change it to:

```tsx
  useEffect(() => { trackPageView(PATHS.entity); }, []);
  const providerProps = { entityId, include: ["user"] } as any;
  // After an operator removes the entity/a comment, remount the provider so it re-pulls the entity
  // and comment section from the server — operators still receive removed content, so the existing
  // tombstone branches render it. This callback lives ABOVE the provider, so it survives the remount.
  const [refreshKey, setRefreshKey] = useState(0);
  const onRemoved = () => setRefreshKey((k) => k + 1);
  return (
    <EntityProvider key={refreshKey} {...providerProps}>
      <Inner onBack={onBack} entityId={entityId} backLabel={backLabel} highlightCommentId={highlightCommentId} highlightEntity={highlightEntity} onRemoved={onRemoved} />
    </EntityProvider>
  );
}
```

- [ ] **Step 2: Thread `onRemoved` through `Inner`**

In `src/EntityView.tsx`, change the `Inner` signature (line 173) from:

```tsx
function Inner({ entityId, onBack, backLabel, highlightCommentId, highlightEntity }: { entityId: string; onBack: () => void; backLabel: string; highlightCommentId?: string; highlightEntity?: boolean }) {
```

to:

```tsx
function Inner({ entityId, onBack, backLabel, highlightCommentId, highlightEntity, onRemoved }: { entityId: string; onBack: () => void; backLabel: string; highlightCommentId?: string; highlightEntity?: boolean; onRemoved?: () => void }) {
```

- [ ] **Step 3: Pass `onRemoved` from `Inner` into `Reactions` and `Comments`**

In `src/EntityView.tsx`, change the `Reactions` render (line 288) from:

```tsx
            {entity && <Reactions entityId={entityId} entity={entity} />}
```

to:

```tsx
            {entity && <Reactions entityId={entityId} entity={entity} onRemoved={onRemoved} />}
```

Then change the `Comments` render (lines 292-297) from:

```tsx
        <Comments
          key={commentsKey}
          entityId={entityId}
          highlightCommentId={highlightCommentId}
          onPosted={() => scheduleModerationRefresh(() => setCommentsKey((k) => k + 1))}
        />
```

to:

```tsx
        <Comments
          key={commentsKey}
          entityId={entityId}
          highlightCommentId={highlightCommentId}
          onPosted={() => scheduleModerationRefresh(() => setCommentsKey((k) => k + 1))}
          onRemoved={onRemoved}
        />
```

- [ ] **Step 4: Pass `onRemoved` through `Reactions` to its `ReportButton`**

In `src/EntityView.tsx`, change the `Reactions` signature (line 457) from:

```tsx
function Reactions({ entityId, entity }: { entityId: string; entity: any }) {
```

to:

```tsx
function Reactions({ entityId, entity, onRemoved }: { entityId: string; entity: any; onRemoved?: () => void }) {
```

Then change its `ReportButton` (line 485) from:

```tsx
      <ReportButton targetType="entity" targetId={entityId} ownerId={entity.userId} />
```

to:

```tsx
      <ReportButton targetType="entity" targetId={entityId} ownerId={entity.userId} onRemoved={onRemoved} />
```

- [ ] **Step 5: Thread `onRemoved` through `Comments` to each `CommentRow`**

In `src/EntityView.tsx`, change the `Comments` signature (line 619) from:

```tsx
function Comments({ entityId, highlightCommentId, onPosted }: { entityId: string; highlightCommentId?: string; onPosted?: () => void }) {
```

to:

```tsx
function Comments({ entityId, highlightCommentId, onPosted, onRemoved }: { entityId: string; highlightCommentId?: string; onPosted?: () => void; onRemoved?: () => void }) {
```

Then change the `CommentRow` render (lines 698-704) from:

```tsx
          <CommentRow
            key={c.id}
            comment={c}
            highlighted={!!highlightCommentId && c.id === highlightCommentId}
            currentUserId={user?.id}
            onUpdate={updateComment}
            onDelete={deleteComment}
          />
```

to:

```tsx
          <CommentRow
            key={c.id}
            comment={c}
            highlighted={!!highlightCommentId && c.id === highlightCommentId}
            currentUserId={user?.id}
            onUpdate={updateComment}
            onDelete={deleteComment}
            onRemoved={onRemoved}
          />
```

- [ ] **Step 6: Pass `onRemoved` through `CommentRow` to its `ReportButton`**

In `src/EntityView.tsx`, change the `CommentRow` signature (lines 493-501) from:

```tsx
function CommentRow({
  comment, highlighted, currentUserId, onUpdate, onDelete,
}: {
  comment: any;
  highlighted?: boolean;
  currentUserId?: string;
  onUpdate: (p: { commentId: string; content: string }) => Promise<void>;
  onDelete: (p: { commentId: string }) => Promise<void>;
}) {
```

to:

```tsx
function CommentRow({
  comment, highlighted, currentUserId, onUpdate, onDelete, onRemoved,
}: {
  comment: any;
  highlighted?: boolean;
  currentUserId?: string;
  onUpdate: (p: { commentId: string; content: string }) => Promise<void>;
  onDelete: (p: { commentId: string }) => Promise<void>;
  onRemoved?: () => void;
}) {
```

Then change its `ReportButton` (line 610) from:

```tsx
          <ReportButton targetType="comment" targetId={comment.id} ownerId={comment.userId} disabled={!isReal} />
```

to:

```tsx
          <ReportButton targetType="comment" targetId={comment.id} ownerId={comment.userId} disabled={!isReal} onRemoved={onRemoved} />
```

- [ ] **Step 7: Typecheck**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 8: Manual verification (full flow)**

With the stack running, signed in as an operator:
1. Open a post → Report panel → reason + details → **🚫 Remove** → the post immediately re-renders with the 🚫 removed tombstone banner and your details as the "📝 Reason:".
2. Open a post with comments → on a comment, 🚩 → **🚫 Remove** → the comment re-renders with its removed tombstone. (If the removed comment vanishes entirely instead of showing a tombstone, the server list endpoint isn't returning removed comments to operators — note it; the entity path is the primary ask.)
3. Confirm in the admin **moderated** queue that both reports show decision "removed".

- [ ] **Step 9: Commit**

```bash
git add src/EntityView.tsx
git commit -m "feat(moderation): remount entity view after operator remove to show tombstone"
```

---

## Self-Review

**Spec coverage:**
- Operator-gated Remove button on posts + comments → Task 2 (button, `isOperatorToken` gate) + Task 3 (comment threading). ✅
- File report + resolve as removed via `PATCH /reports/:id/resolve`, preserved in history → Task 1 (`reportAndRemove`). ✅
- Raw authed fetch (SDK hook discards id) → Task 1. ✅
- Immediate tombstone via `EntityProvider` remount → Task 3. ✅
- `moderate_remove` analytics event → Task 2 Step 1. ✅
- No confirm → Task 2 Step 3 (`removeNow` fires directly). ✅
- Out of scope (approve/keep/dismiss, space-scoped path) → not implemented, correct. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✅

**Type consistency:** `onRemoved?: () => void` used identically across `ReportButton`, `Inner`, `Reactions`, `Comments`, `CommentRow`. `reportAndRemove` signature matches Task 1's definition and Task 2's call site (`{ targetType, targetId, reason, details, accessToken }`). `moderate_remove` fired with `{ target: targetType }` where `targetType` is `"entity" | "comment"`. ✅
