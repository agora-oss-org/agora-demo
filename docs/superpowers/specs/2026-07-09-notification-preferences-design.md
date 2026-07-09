# Notification Preferences (B1) — Design

**Date:** 2026-07-09
**Gap-list item:** B1 in `docs/NEW-FUNCTIONALITY.md`
**SDK surface:** `useNotificationPreferences` + `PUSH_EVENT_TYPES` (both re-exported from
`@agora-sdk/react-js` via `export * from "@agora-sdk/core"`)
**Server routes:** `GET` / `PUT /:projectId/push-notifications/preferences`

## Goal

Give the demo a UI for the acting user's per-type push opt-out set, exercising
`useNotificationPreferences`'s read and upsert paths end-to-end against a live server.

## What these preferences actually control

`disabledTypes` is consumed server-side **only** by `apps/api/src/lib/push/index.ts` (via
`loadDisabledTypes` / `isTypeDisabled` in `lib/notification-prefs.ts`). It gates **push delivery
only**. It has no effect on the in-app inbox served by `/app-notifications`, which the demo's
📥 Inbox tab (`Notifications.tsx`) renders.

Consequence: a user who disables `entity-comment` still sees comment notifications in the Inbox
tab; they simply stop receiving a push for them. This is why the UI does **not** live in
`Notifications.tsx`, despite the gap list originally suggesting it as a candidate — placing an
opt-out control next to a list it provably does not filter would actively mislead.

The preference row is keyed `(projectId, userId)`. It is **account-level, not device-level** — it
applies to every device the user has registered.

## Placement

New file `src/NotificationPrefs.tsx`, default-exported, rendered by `Push.tsx` as a second panel
beneath the existing registration panel.

A separate file rather than growing `Push.tsx`: each file keeps one responsibility, matching how
`Me.tsx` hosts its sub-views. `Push.tsx` remains the device-registration surface; the new file is
the account-preference surface. They are co-located because the preferences only matter if at
least one device is registered — the causal story is visible in one screen.

**The panel mounts outside `Push.tsx`'s existing `if (!SUPPORTED)` early return.** Because the
preferences are account-level, a user sitting at a browser that cannot do web push may still have
other registered devices whose delivery this controls. Concretely, `Push.tsx` becomes:

- `!SUPPORTED` → the "not supported in this browser" registration notice, **then** `<NotificationPrefs />`
- otherwise → the registration panel, **then** `<NotificationPrefs />`

When this browser is not registered (`registered === false`, already tracked in `Push.tsx`'s
`localStorage`-backed state), `NotificationPrefs` shows a muted hint: these settings apply to your
registered devices, and this browser isn't one of them. The hint is informational; the controls
stay fully enabled.

## Opt-in UI over an opt-out store

The server stores an **opt-out** set (`disabledTypes`; empty set = every push type enabled, which
is also the default when no row exists). The UI presents **opt-in** checkboxes: *checked means
"send me this push."*

The inversion happens only at the render and serialize boundaries. Local state mirrors the
server's shape — a set of *disabled* types — so the PUT body is a direct serialization with no
translation step that could drift.

## State and data flow

`useNotificationPreferences()` returns
`{ disabledTypes, loading, updating, error, refetch, updatePreferences }`.

Local state is a single `draft: Set<PushEventType> | null`, holding *disabled* types.

- An effect seeds `draft` from `disabledTypes` **once**, when the read first resolves:
  `if (draft === null && disabledTypes) setDraft(new Set(disabledTypes))`. `draft === null` means
  "not yet seeded." After that first seed the effect is inert, and `draft` is owned solely by the
  user's toggles and by Reset.
- A checkbox for type `t` renders `checked={!draft.has(t)}`; toggling it adds/removes `t` from a
  new `Set` (never mutating the existing one).
- `dirty` is computed by comparing the sorted arrays of `draft` and `disabledTypes`.
- **Save** calls `updatePreferences([...draft])`.
- **Reset** re-seeds `draft` from `disabledTypes`, discarding local edits.
- Both buttons are disabled when `!dirty` or `updating`.

While `disabledTypes === undefined` (read unresolved), render a loading placeholder rather than
checkboxes. Rendering unchecked boxes as a default would falsely read as "all pushes are off."

**No manual `refetch()` after a save.** The SDK's `updateNotificationPreferences` mutation
optimistically patches the cached `getNotificationPreferences` read in `onQueryStarted`, undoes
that patch on failure, and additionally invalidates the `NotificationPreferences` tag.

This is what makes `dirty` self-clearing without any post-save bookkeeping, and it is worth being
explicit about, since the interaction is the crux of the design:

- **On save success**, the optimistic patch sets `disabledTypes` to exactly the set we sent, which
  already equals `draft`. `dirty` therefore goes false on its own. The later tag-invalidated refetch
  returns the same value, a no-op.
- **On save failure**, RTK undoes the patch, so `disabledTypes` reverts to the last server-known
  set while `draft` — untouched, because the seeding effect is inert after its first run — still
  holds the user's edits. `dirty` goes back to true and Save is immediately clickable again.

Both behaviors fall out of `dirty` being derived (`draft` vs `disabledTypes`) rather than stored.

### Refetch-loop safety

`useNotificationPreferences()` takes no props at all, so it is not exposed to the unstable-object
dependency bug that caused the infinite refetch loop in `Events.tsx` (see
`docs/superpowers/plans/2026-07-08-events.md` and the `EVENT_INCLUDE` hoist in commit `01a64b8`).
The one effect this component owns is the seed, and its `draft === null` guard means it writes state
at most once per mount — it cannot re-fire into a loop.

## Grouping the 20 types

`PUSH_EVENT_TYPES` is a 20-element ordered tuple mirroring the server's `PUSH_EVENT_TYPES`
exactly. A hand-written table in `NotificationPrefs.tsx` maps them into five labelled sections,
preserving server order within each section:

| Section | Types |
|---|---|
| Content | `entity-comment`, `comment-reply`, `entity-mention`, `comment-mention` |
| Reactions & milestones | `entity-upvote`, `comment-upvote`, `entity-reaction`, `comment-reaction`, `entity-reaction-milestone-specific`, `entity-reaction-milestone-total`, `comment-reaction-milestone-specific`, `comment-reaction-milestone-total` |
| Social | `new-follow`, `connection-request`, `connection-accepted` |
| Spaces & events | `space-membership-approved`, `event-invite`, `event-updated`, `event-cancelled` |
| Chat | `message` |

That accounts for all 20 (4 + 8 + 3 + 4 + 1).

**Other bucket.** Any member of `PUSH_EVENT_TYPES` not named in the table is collected into a
derived "Other" section, rendered only when non-empty. This is the safety valve: when the server
and SDK add a 21st push type, it appears in the UI as a real, toggleable checkbox instead of being
silently swallowed by a stale grouping table. The bucket is computed, not hand-maintained.

Each type renders with a short human label (e.g. `entity-comment` → "Comments on my posts"). The
raw type name is shown as muted secondary text, because this is a compatibility harness and the
wire value is the thing under test.

`message` carries a one-line note: it is push-only and has no in-app Inbox counterpart.

## Error handling

- **Read failure** (`error` truthy, `disabledTypes` undefined): muted error text plus a Retry
  button calling `refetch()`. No checkboxes render.
- **Save failure**: `updatePreferences` rethrows after the SDK's `handleError`. Catch it, show an
  inline muted message. RTK Query's `onQueryStarted` has already undone the optimistic patch, so
  `disabledTypes` reverts and the checkboxes snap back to the last server-known state; `draft`
  retains the user's edits and stays `dirty`, so Save can simply be clicked again.
- **Signed out**: the hook self-skips when there is no `user`. Unreachable in practice — the Me
  tab is behind `Shell.tsx`'s auth gate.

## Analytics

One new member of the flat `AnalyticsEvent` union in `src/analytics.ts`:

```
"set_notification_prefs"
```

Fired **on successful save only**, with low-cardinality metadata:

```ts
track("set_notification_prefs", {
  state: draft.size === 0 ? "all-on" : draft.size === PUSH_EVENT_TYPES.length ? "all-off" : "partial",
});
```

No type names, no counts, no IDs — honoring the repo's "low-cardinality enums/booleans only" rule.

No new `PATHS` entry: the panel lives inside the existing `🔔 Push` sub-tab, whose `PATHS.push`
page view `Me.tsx` already fires.

## Verification

Manual, per repo convention — there are no tests and no linter; `pnpm build`'s `tsc -b` is the only
static check. Checklist, against a running local server:

1. Fresh account: read returns `[]`; all 20 checkboxes render checked; Save and Reset are disabled.
2. Uncheck two types → Save enables → click Save → the PUT body carries exactly those two type
   names → reload the tab → they are still unchecked.
3. Uncheck a type, click Reset → the checkbox re-checks and Save disables, with no network request.
4. Stop the server, toggle a type, click Save → an inline error appears, the checkbox reverts to
   its server state, and Save remains enabled for a retry.
5. Check every box (empty `disabledTypes`) → Save → analytics fires `state: "all-on"`.
   Uncheck every box → Save → `state: "all-off"`.
6. The panel renders and is usable in a browser context where web push is unsupported
   (verify the `!SUPPORTED` branch still mounts it).

## Out of scope

- Per-group "toggle all" controls (considered; deferred as YAGNI for a compatibility harness).
- Any change to `Notifications.tsx` / the in-app inbox — `disabledTypes` provably does not affect it.
- Per-device preferences. The server has no such concept; the row is `(projectId, userId)`.
