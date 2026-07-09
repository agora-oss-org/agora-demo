# Notification Preferences (B1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-type push opt-out checklist to the demo's `🔔 Push` sub-tab, exercising `useNotificationPreferences`'s read and upsert paths end-to-end.

**Architecture:** A new `src/NotificationPrefs.tsx` renders the 20 `PUSH_EVENT_TYPES` as grouped opt-in checkboxes over a local `draft` set of *disabled* types (mirroring the server's opt-out storage). `Push.tsx` mounts it as a second panel, in **both** the supported and unsupported branches, because the preference is account-level, not device-level. Dirty state is *derived* (`draft` vs the hook's `disabledTypes`), never stored — which is what makes RTK Query's optimistic-patch-and-rollback give correct save-success and save-failure behavior for free.

**Tech Stack:** Vite + React 18 (TypeScript), `@agora-sdk/react-js` (re-exports `@agora-sdk/core`), hand-written `src/styles.css` utility classes, Umami analytics via `src/analytics.ts`.

**Spec:** `docs/superpowers/specs/2026-07-09-notification-preferences-design.md`

## Global Constraints

- **There are no tests and no linter in this repo.** Verification is `pnpm build` (which runs `tsc -b`, the only static check) plus manual click-through. Do **not** add a test framework, a test file, or a linter config. A task's "verify" step means running `pnpm build` and reporting its output.
- **`pnpm` is the package manager.** Never run `npm install` — it would generate a divergent lockfile. `pnpm-lock.yaml` is the single source of truth.
- **SDK hook return values are cast `as any`** throughout this demo — the SDK's exported types are incomplete and the demo deliberately treats them loosely. Match this style; do not fight the types.
- **Analytics:** event names are a flat `snake_case` union in `src/analytics.ts`, so a typo fails the build. Fire events **on success only**, with **low-cardinality enums/booleans only — never IDs, counts, or free text**. Call `track(...)` from `./analytics`; never touch `window.umami` directly.
- **Module-level constants for any array/object** that would otherwise be recreated per render and handed to an SDK hook. This repo hit a live infinite-refetch loop from an inline `include: [...]` literal (commit `01a64b8`); the convention now is to hoist. Mirror the existing `TIME_WINDOWS`/`SORTS` constant style.
- **Styling** uses only the existing `src/styles.css` utility classes: `col`, `row`, `panel`, `card`, `pill`, `msg`, `mine`, `muted`, `spacer`, `prewrap`, `clamp3`, `linklike`, `tabs`, `center`, `error`. No CSS framework, and **do not add new CSS rules** for this feature. Inline `style={{...}}` for one-off spacing is an accepted existing pattern (see `CreateEvent.tsx:117-123`).
- **Checkbox markup** must match the established pattern in `src/CreateEvent.tsx:117-120`:
  `<label className="row" style={{ gap: 6 }}><input type="checkbox" style={{ width: "auto" }} … /><span …>…</span></label>`.
  The `width: "auto"` inline style is required — the global `input` rule stretches inputs to full width otherwise.
- **The server stores an opt-OUT set** (`disabledTypes`; empty = every push type enabled). The UI shows opt-IN checkboxes: **checked means "send me this push."** Local state mirrors the server's shape (a set of *disabled* types) so the PUT body is a direct serialization.
- **`disabledTypes` gates push delivery only.** It has no effect on the in-app inbox (`/app-notifications`) that the `📥 Inbox` tab renders. Do not modify `Notifications.tsx`.
- **No manual `refetch()` after a successful save.** The SDK's `updateNotificationPreferences` mutation optimistically patches the cached read in `onQueryStarted`, undoes that patch on failure, and invalidates the `NotificationPreferences` tag.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/analytics.ts` | Modify | Add the one new `AnalyticsEvent` union member. No new `PATHS` entry — the panel lives inside the existing `🔔 Push` sub-tab, whose `PATHS.push` page view `Me.tsx` already fires. |
| `src/NotificationPrefs.tsx` | Create | The whole feature: reads/writes preferences via `useNotificationPreferences`, owns the `draft` set, the grouping table, and the save/reset controls. Default export. |
| `src/Push.tsx` | Modify | Mount `<NotificationPrefs registered={registered} />` as a second panel, in both the `!SUPPORTED` and normal branches. |

Two tasks. Task 1 delivers a compiling, self-contained component plus the analytics event it needs (the event is folded in because the component cannot compile without it). Task 2 mounts it and verifies live. A reviewer can meaningfully reject the component while approving the mount, and vice versa.

---

### Task 1: Analytics event + the `NotificationPrefs` component

**Files:**
- Modify: `src/analytics.ts` (the `AnalyticsEvent` union, after the `push_register`/`push_unregister` line)
- Create: `src/NotificationPrefs.tsx`

**Interfaces:**
- Consumes: `useNotificationPreferences`, `PUSH_EVENT_TYPES`, `type PushEventType` — all from `@agora-sdk/react-js`. `track` from `./analytics`.
- Produces: `export default function NotificationPrefs({ registered }: { registered: boolean })` — a `<div className="panel col">`. Task 2 mounts this.

- [ ] **Step 1: Add the analytics event**

In `src/analytics.ts`, find this line (currently line 49):

```ts
  | "push_register" | "push_unregister"
```

Replace it with:

```ts
  | "push_register" | "push_unregister"
  // notification preferences — metadata: { state: "all-on" | "partial" | "all-off" }
  | "set_notification_prefs"
```

Do **not** add anything to `PATHS`.

- [ ] **Step 2: Create `src/NotificationPrefs.tsx`**

Write this file exactly:

```tsx
import { useEffect, useMemo, useState } from "react";
import { useNotificationPreferences, PUSH_EVENT_TYPES } from "@agora-sdk/react-js";
import type { PushEventType } from "@agora-sdk/react-js";
import { track } from "./analytics";

// Per-type push opt-out via useNotificationPreferences (→ GET/PUT /:pid/push-notifications/
// preferences). The server stores an opt-OUT set (empty = all types enabled); this UI shows opt-IN
// checkboxes, inverting only at the render/serialize boundary. Local `draft` mirrors the server's
// shape (a set of DISABLED types) so the PUT body is a direct serialization.
//
// These preferences are account-level (keyed projectId+userId), NOT per-device, and they gate push
// DELIVERY only — they have no effect on the in-app inbox in the 📥 Inbox tab. That's why this
// panel renders even when the current browser can't do web push.

// Module-level constants (never recreated per render) — same convention as Events.tsx's
// TIME_WINDOWS/SORTS and the EVENT_INCLUDE hoist.
const GROUPS: { label: string; types: PushEventType[] }[] = [
  {
    label: "Content",
    types: ["entity-comment", "comment-reply", "entity-mention", "comment-mention"],
  },
  {
    label: "Reactions & milestones",
    types: [
      "entity-upvote",
      "comment-upvote",
      "entity-reaction",
      "comment-reaction",
      "entity-reaction-milestone-specific",
      "entity-reaction-milestone-total",
      "comment-reaction-milestone-specific",
      "comment-reaction-milestone-total",
    ],
  },
  { label: "Social", types: ["new-follow", "connection-request", "connection-accepted"] },
  {
    label: "Spaces & events",
    types: ["space-membership-approved", "event-invite", "event-updated", "event-cancelled"],
  },
  { label: "Chat", types: ["message"] },
];

// Deliberately Record<string, string>, not Record<PushEventType, string>: an exact record would
// turn a future 21st server type into a build error, which would defeat the OTHER bucket below.
// Unlabelled types fall back to their raw wire name.
const LABELS: Record<string, string> = {
  "entity-comment": "Comments on my posts",
  "comment-reply": "Replies to my comments",
  "entity-mention": "Mentions of me in a post",
  "comment-mention": "Mentions of me in a comment",
  "entity-upvote": "Upvotes on my posts",
  "comment-upvote": "Upvotes on my comments",
  "entity-reaction": "Reactions to my posts",
  "comment-reaction": "Reactions to my comments",
  "entity-reaction-milestone-specific": "My post hits a milestone for one reaction",
  "entity-reaction-milestone-total": "My post hits a total-reaction milestone",
  "comment-reaction-milestone-specific": "My comment hits a milestone for one reaction",
  "comment-reaction-milestone-total": "My comment hits a total-reaction milestone",
  "new-follow": "Someone follows me",
  "connection-request": "Someone requests a connection",
  "connection-accepted": "Someone accepts my connection request",
  "space-membership-approved": "My space membership is approved",
  "event-invite": "I'm invited to an event",
  "event-updated": "An event I'm attending changes",
  "event-cancelled": "An event I'm attending is cancelled",
  message: "Direct and group chat messages",
};

// Safety valve: any push type the SDK knows about but GROUPS doesn't name still gets a checkbox,
// rather than being silently swallowed by a stale grouping table.
const GROUPED = new Set<string>(GROUPS.flatMap((g) => g.types));
const OTHER = PUSH_EVENT_TYPES.filter((t) => !GROUPED.has(t));

const sortedKey = (types: Iterable<string>) => [...types].sort().join("|");

export default function NotificationPrefs({ registered }: { registered: boolean }) {
  const { disabledTypes, error, updating, refetch, updatePreferences } =
    useNotificationPreferences() as any;

  // The set of DISABLED types the user is editing. null = not yet seeded from the server read.
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Seed ONCE, on first resolve. After that this effect is inert (the `draft === null` guard), so a
  // failed save's optimistic rollback can revert `disabledTypes` without clobbering the user's
  // in-progress edits. It also cannot re-fire into a refetch loop: it writes state at most once.
  useEffect(() => {
    if (draft === null && disabledTypes) setDraft(new Set<string>(disabledTypes));
  }, [draft, disabledTypes]);

  // Derived, never stored. On save success the optimistic patch makes disabledTypes === draft, so
  // this goes false on its own. On save failure the rollback makes them differ again, so Save
  // re-enables — the checkboxes never move, since they render from `draft`, not disabledTypes.
  const dirty = useMemo(() => {
    if (!draft || !disabledTypes) return false;
    return sortedKey(draft) !== sortedKey(disabledTypes);
  }, [draft, disabledTypes]);

  const toggle = (t: string) =>
    setDraft((prev) => {
      const next = new Set<string>(prev ?? []);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const save = async () => {
    if (!draft) return;
    setSaveError(null);
    try {
      await updatePreferences([...draft]);
      track("set_notification_prefs", {
        state:
          draft.size === 0
            ? "all-on"
            : draft.size === PUSH_EVENT_TYPES.length
            ? "all-off"
            : "partial",
      });
    } catch {
      setSaveError("Couldn't save — see console for details.");
    }
  };

  const reset = () => {
    setSaveError(null);
    setDraft(new Set<string>(disabledTypes ?? []));
  };

  // Read failed and we have nothing to show. (A save failure leaves disabledTypes populated, so it
  // falls through to the normal render with an inline saveError instead.)
  if (error && !disabledTypes) {
    return (
      <div className="panel col">
        <strong>Notification preferences</strong>
        <span className="muted">Couldn't load your preferences.</span>
        <div className="row">
          <button onClick={() => refetch()}>Retry</button>
        </div>
      </div>
    );
  }

  // Never render checkboxes before the read resolves — unchecked defaults would falsely read as
  // "all pushes are off".
  if (!draft) {
    return (
      <div className="panel col">
        <strong>Notification preferences</strong>
        <span className="muted">Loading…</span>
      </div>
    );
  }

  const row = (t: string) => (
    <label key={t} className="row" style={{ gap: 6 }}>
      <input
        type="checkbox"
        style={{ width: "auto" }}
        checked={!draft.has(t)}
        onChange={() => toggle(t)}
      />
      <span>{LABELS[t] ?? t}</span>
      <span className="muted">{t}</span>
    </label>
  );

  return (
    <div className="panel col">
      <strong>Notification preferences</strong>
      <span className="muted">
        Which pushes you receive, across all your registered devices. Unchecking a type never hides
        it from the 📥 Inbox tab — it only stops the push.
      </span>
      {!registered && (
        <span className="muted">This browser isn't registered for push, but these still apply to your other devices.</span>
      )}

      {GROUPS.map((g) => (
        <div key={g.label} className="col">
          <strong>{g.label}</strong>
          {g.types.map(row)}
          {g.label === "Chat" && (
            <span className="muted">Push-only — chat messages have no in-app Inbox entry.</span>
          )}
        </div>
      ))}

      {OTHER.length > 0 && (
        <div className="col">
          <strong>Other</strong>
          <span className="muted">Push types this build doesn't have a label for yet.</span>
          {OTHER.map(row)}
        </div>
      )}

      <div className="row">
        <button disabled={!dirty || updating} onClick={save}>
          {updating ? "Saving…" : "Save"}
        </button>
        <button disabled={!dirty || updating} onClick={reset}>
          Reset
        </button>
      </div>
      {saveError && <span className="muted">{saveError}</span>}
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm build`

Expected: exits 0. `tsc -b` reports no errors, and Vite writes `dist/`. The component is not yet mounted anywhere, so this only proves it typechecks — that is the whole deliverable of this task.

If `tsc` complains that `PushEventType` or `PUSH_EVENT_TYPES` is not exported from `@agora-sdk/react-js`, do **not** switch the import to `@agora-sdk/core`. Both are re-exported (`react-js`'s `index.d.ts` line 2 is `export * from "@agora-sdk/core"`), and the demo imports SDK symbols from `react-js` by convention. Report the error instead.

- [ ] **Step 4: Commit**

```bash
git add src/analytics.ts src/NotificationPrefs.tsx
git commit -m "feat(prefs): add per-type push notification preferences panel"
```

---

### Task 2: Mount the panel in `Push.tsx` and verify live

**Files:**
- Modify: `src/Push.tsx` (import, plus both return branches)

**Interfaces:**
- Consumes: `NotificationPrefs` from `./NotificationPrefs`, whose sole prop is `registered: boolean`. `Push.tsx` already holds exactly that state (`const [registered, setRegistered] = useState(...)`, line 16).
- Produces: nothing — this is the last task.

- [ ] **Step 1: Import the component**

In `src/Push.tsx`, after the existing `import { track } from "./analytics";` line, add:

```tsx
import NotificationPrefs from "./NotificationPrefs";
```

- [ ] **Step 2: Mount it in the `!SUPPORTED` branch**

This is the branch that matters most, and the easiest one to get wrong. The preferences are
account-level, so a browser that cannot do web push must still show them.

Find this block:

```tsx
  if (!SUPPORTED) {
    return (
      <div className="panel col">
        <strong>Push notifications</strong>
        <span className="muted">Push notifications aren't supported in this browser.</span>
      </div>
    );
  }
```

Replace it with:

```tsx
  if (!SUPPORTED) {
    return (
      <div className="col">
        <div className="panel col">
          <strong>Push notifications</strong>
          <span className="muted">Push notifications aren't supported in this browser.</span>
        </div>
        <NotificationPrefs registered={false} />
      </div>
    );
  }
```

Note the new wrapping `<div className="col">` — the branch now returns two sibling panels, so it needs a single parent.

- [ ] **Step 3: Mount it in the normal branch**

Find the final `return` block and its closing tags:

```tsx
  return (
    <div className="panel col">
      <strong>Push notifications</strong>
      <div className="row">
        <span className={`pill ${registered ? "success" : "danger"}`}>
          {registered ? "Registered" : "Not registered"}
        </span>
        <span className="muted">browser permission: {permission}</span>
      </div>
      <div className="row">
        <button disabled={registered || registering} onClick={handleRegister}>
          {registering ? "Registering…" : "Register"}
        </button>
        <button disabled={!registered || unregistering} onClick={handleUnregister}>
          {unregistering ? "Unregistering…" : "Unregister"}
        </button>
      </div>
      {error && <span className="muted">{error}</span>}
    </div>
  );
```

Replace it with:

```tsx
  return (
    <div className="col">
      <div className="panel col">
        <strong>Push notifications</strong>
        <div className="row">
          <span className={`pill ${registered ? "success" : "danger"}`}>
            {registered ? "Registered" : "Not registered"}
          </span>
          <span className="muted">browser permission: {permission}</span>
        </div>
        <div className="row">
          <button disabled={registered || registering} onClick={handleRegister}>
            {registering ? "Registering…" : "Register"}
          </button>
          <button disabled={!registered || unregistering} onClick={handleUnregister}>
            {unregistering ? "Unregistering…" : "Unregister"}
          </button>
        </div>
        {error && <span className="muted">{error}</span>}
      </div>
      <NotificationPrefs registered={registered} />
    </div>
  );
```

- [ ] **Step 4: Verify it compiles**

Run: `pnpm build`

Expected: exits 0, no `tsc` errors.

- [ ] **Step 5: Commit**

```bash
git add src/Push.tsx
git commit -m "feat(prefs): mount notification preferences in the Push sub-tab"
```

- [ ] **Step 6: Manual verification against a live server**

The local stack must be running. The demo's `.env` points at `http://localhost/v7`, which reaches
the API **only through the Caddy proxy on :80** (the server itself listens on :4000). Confirm the
proxy container is up before starting. Then `pnpm dev` → <http://localhost:5175>, sign in with
`VITE_DEMO_EMAIL` / `VITE_DEMO_PASSWORD` from `.env`, and open **Me → 🔔 Push**.

Work through this checklist, recording the actual result of each:

1. **Fresh read.** The panel lists 20 checkboxes across five sections (Content 4, Reactions &
   milestones 8, Social 3, Spaces & events 4, Chat 1). No "Other" section appears. On an account
   with no saved preference, every box is **checked**, and Save/Reset are both **disabled**.
2. **Save.** Uncheck two types → Save and Reset enable → click Save. In devtools Network, the
   `PUT …/push-notifications/preferences` request body is `{"disabledTypes":[…]}` containing
   **exactly those two wire names**. After it resolves, Save/Reset disable again.
3. **Persistence.** Switch to another tab and back (or reload the page). The same two boxes are
   still unchecked.
4. **Reset.** Uncheck a third type → click Reset → it re-checks, Save/Reset disable, and **no
   network request fires**.
5. **Save failure.** Stop the API server (or the proxy). Uncheck a type → click Save → an inline
   "Couldn't save" message appears, the checkbox **keeps the user's edit** (it renders from `draft`,
   which the rollback does not touch), and Save stays **enabled** so it can be retried. Restart the
   server and click Save again → it succeeds, and Save/Reset disable.
6. **Analytics payloads.** With every box checked, Save fires `set_notification_prefs` with
   `{ state: "all-on" }`. With every box unchecked, `{ state: "all-off" }`. With some unchecked,
   `{ state: "partial" }`. Verify by watching the Umami request, or by breakpointing `track`.
7. **Unsupported-browser branch.** Confirm the panel still renders when `SUPPORTED` is false. The
   cheapest way: temporarily edit `SUPPORTED` in `src/Push.tsx` to `const SUPPORTED = false;`,
   observe both panels render and the preferences remain usable, then **revert the edit**.
8. **Console is clean.** No errors, and no sign of a refetch loop — the preferences endpoint should
   be hit once on mount, not repeatedly. Leave the tab open ~10s and confirm the request count for
   `push-notifications/preferences` is stable.

Report the outcome of every numbered item. If any fails, report it rather than silently fixing —
several of these encode the spec's core claims about optimistic rollback, and a failure there means
the design's central assumption is wrong.

---

## Notes for the reviewer

Two things in this plan are load-bearing and easy to "simplify" into bugs:

1. **The `draft === null` guard on the seeding effect.** It looks like a redundant first-run check.
   It is not: without it, a failed save's optimistic rollback re-fires the effect and destroys the
   user's edits, and the spec's error-handling contract (item 5 of the manual checklist) breaks.
   Note the effect's dep array is `[draft, disabledTypes]`, which *looks* like it should loop —
   it doesn't, because the guard makes the write happen at most once per mount.
2. **`dirty` being derived rather than stored.** Storing it would require post-save bookkeeping to
   clear it, and would not survive the rollback path.

`OTHER` will be an empty array against the currently installed SDK (`@agora-sdk/core` 1.8.0), so
the "Other" section will not render. That is expected — it is a forward-compatibility valve, not
dead code, and item 1 of the checklist asserts its absence today.
