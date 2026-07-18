# Operator "Remove" shortcut in the Report panel

**Date:** 2026-07-17
**Status:** Approved design

## Problem

Today an operator who spots bad content in the demo has to: (1) file a report from the post's
Report panel, then (2) open the separate admin app, find the report in the queue, and click Remove.
That's an extra app-switch for something the operator is already authorized to do inline.

We want a one-click **Remove** in the demo's own Report panel that files the report *and* removes the
content, while still preserving the report in moderation history (so the audit trail is identical to
doing it the long way through the admin app).

## Who this is for

Deployment **operators** only — gated on the JWT `operator` claim via the existing
`isOperatorToken(accessToken)` helper (`src/EntityView.tsx`), the same gate used for the Admin button
(`Shell.tsx`) and the moderation status pills. This is the *deployment-operator god-view*, NOT the
profile `UserRole` "admin"/"moderator". Normal users never see the button.

Applies to **both** posts (entities) and individual comments — the `ReportButton` component is shared
between the two, so both get the shortcut.

## The server contract (already exists)

The admin app's report → remove lives in `apps/admin/src/lib/moderation.ts` → `actOnReport()`. For a
**project-level** report (no `spaceId`) it makes a single operator-only call:

```
PATCH /reports/:id/resolve   { action: "removed", reason }
```

The server route (`apps/api/src/routes/reports.ts:89`, `requireProjectAdmin`) both **moderates the
target** (sets `moderationStatus:"removed"`, `moderationReason`, `moderatedAt`, `moderatedById`) and
**resolves the report** (`resolvedAt`, `resolvedById`) in one transaction. Because operators have the
project-wide god-view, this one endpoint covers reports with or without a `spaceId` — the demo does
**not** need the space-scoped two-call path that the admin uses for non-operator moderators.

Result: the report lands in the `/reports/moderated` queue = preserved in moderation history, and the
target carries the removed status + the operator's note. Identical outcome to the admin app.

## Why a raw fetch is needed

The SDK's `useCreateReport` (`@agora-sdk/core`) does `POST /reports` but **discards the response**, so
it can't hand back the created report's `id` — which we need for the resolve call. So the Remove flow
bypasses the hook and makes its own authenticated `POST /reports` to read the id back, then chains the
resolve.

The demo has no raw HTTP client today (everything goes through SDK hooks), so this adds a small,
isolated one used only by this operator action.

## Design

### New module: `src/operatorModeration.ts`

A ~20-line helper. Reads `API_BASE_URL` + `PROJECT_ID` from `src/config.ts`; takes the `accessToken`
as an argument (the caller pulls it from `useAuth()`).

```ts
import { API_BASE_URL, PROJECT_ID } from "./config";

async function authed(path: string, accessToken: string, init: RequestInit) {
  const res = await fetch(`${API_BASE_URL}/${PROJECT_ID}${path}`, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

// File the report (returns it, incl. id), then resolve it as "removed" — mirrors the admin's
// project-level actOnReport. Operator-only; the server enforces requireProjectAdmin on resolve.
export async function reportAndRemove(opts: {
  targetType: "entity" | "comment";
  targetId: string;
  reason: string;
  details?: string;
  accessToken: string;
}) {
  const { targetType, targetId, reason, details, accessToken } = opts;
  const report = await authed(`/reports`, accessToken, {
    method: "POST",
    body: JSON.stringify({ targetType, targetId, reason, details: details?.trim() || undefined }),
  });
  await authed(`/reports/${report.id}/resolve`, accessToken, {
    method: "PATCH",
    body: JSON.stringify({ action: "removed", reason: details?.trim() || undefined }),
  });
  return report;
}
```

Path shape matches the SDK/admin (`${API_BASE_URL}/${PROJECT_ID}/reports...`, where `API_BASE_URL`
already includes the `/v7` version prefix). The moderation `reason` is the operator's free-text
`details` note (shows in the tombstone's "📝 Reason:"); omitted when blank.

**401 handling:** unlike the SDK's axios client, this raw fetch does not auto-refresh on 401. In
practice `useTokenRefresh()` in `Shell` keeps the access token fresh proactively, so a 401 is
unlikely; if one happens, the error surfaces in the panel and the operator retries. Acceptable for a
manual test harness.

### `ReportButton` changes (`src/EntityView.tsx`)

- Add `const { accessToken } = useAuth() as any;` (hook already imported/used elsewhere in the file).
- Add an optional prop `onRemoved?: () => void`.
- In the panel footer, when `isOperatorToken(accessToken)`, render a `className="danger"` **🚫 Remove**
  button to the left of "Submit report". Tooltip: "Files this report, then removes the content — kept
  in moderation history".
- Handler: fires immediately (no confirm — the operator already filled the panel and clicked a
  clearly-labelled danger button), calling
  `reportAndRemove({ targetType, targetId, reason, details, accessToken })`, then `track("moderate_remove",
  { target: targetType })`, close the panel, and call `onRemoved?.()`. Reuse the existing `busy`/`err`
  state for the in-flight/error UI. On error, surface `err` in the panel (no `onRemoved`).

### Refresh so the tombstone shows immediately (`src/EntityView.tsx`)

- In the outer `EntityView` component, add `const [refreshKey, setRefreshKey] = useState(0)` and key the
  `EntityProvider` with it (`key={refreshKey}`). The bump callback lives here (parent of the provider),
  so it survives the remount.
- Thread one `onRemoved={() => setRefreshKey(k => k + 1)}` callback down to both `ReportButton` sites:
  `EntityView` → `Inner` → `Reactions` → post `ReportButton`; and `Inner` → `Comments` → `CommentRow`
  → comment `ReportButton`.
- On any successful operator-remove, the bump remounts `EntityProvider` → re-pulls the entity **and**
  the comment section from the server. Operators still receive removed content, so the existing
  tombstone branches render it: entity tombstone at `EntityView.tsx:245`/`:261`, comment tombstone at
  `:516`. One callback covers both post and comment removals because the remount re-pulls everything.

### Analytics (`src/analytics.ts`)

Add `moderate_remove` to the `AnalyticsEvent` union. Fire it on success with `{ target: "entity" |
"comment" }` — low-cardinality enum only, no ids or free text, per the existing convention.

## Out of scope (YAGNI)

- No approve / keep / dismiss buttons — removal is the one action requested.
- No space-scoped two-call moderation path — the operator `/reports/:id/resolve` endpoint covers
  removal project-wide.
- No auto-refresh/retry client for the raw fetch beyond surfacing the error.

## Verification (manual, per the repo's convention)

1. Signed in as an operator (`@demoadmin`), open a post → Report panel shows **🚫 Remove** beside
   Submit report; signed in as a non-operator, it does not.
2. Fill a reason + details, click Remove → the post re-renders with the 🚫 removed tombstone
   and the details as the reason.
3. Same on a comment → the comment shows its removed tombstone.
4. In the admin app, the report appears in the **moderated** queue (not pending), decision "removed".
5. `pnpm build` (tsc) passes.
