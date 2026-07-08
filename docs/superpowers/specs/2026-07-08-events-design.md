# Design: Events feature (A1)

**Status:** approved, ready for implementation plan
**Source:** `docs/NEW-FUNCTIONALITY.md` item A1 (server already ships this; UI-only wiring in the demo
— the single biggest net-new surface in the gap list)

## Context

The server has implemented full event support (create/update/delete/cancel, RSVP, invites,
co-hosts) since v7.6.2. The installed SDK (`@agora-sdk/core`/`react-js` 1.8.0) exports the entire
surface — confirmed real by reading the actual `.d.ts` files (not guessed):
`useCreateEvent`, `useFetchEvent`, `useFetchManyEvents`, `useFetchManyEventsWrapper`,
`useUpdateEvent`, `useDeleteEvent`, `useCancelEvent`, `useSetRsvp`, `useWithdrawRsvp`,
`useAddHost`/`useRemoveHost`, `useAddInvite`/`useRemoveInvite`, `useFetchInvitees`,
`useFetchEventRsvps`, `EventProvider`/`useEvent`/`useEventData`, plus the `Event`/`EventRsvp`/
`EventInvite` model types — all re-exported through `@agora-sdk/react-js`'s
`export * from "@agora-sdk/core"`, same resolution path confirmed for A2's
`webPushTokenAdapter`/`usePushRegistration`.

Nothing in this demo currently references any of these — confirmed by grep, zero hits.

**Scope decision (user-approved):** build the **full surface** — every hook above gets wired up,
not a trimmed MVP — because leaving `useAddInvite`/`useRemoveInvite`/`useFetchInvitees`/
`useAddHost`/`useRemoveHost` unwired would be a real gap against this demo's stated purpose as a
1:1 SDK/server compatibility harness. Space-scoped browsing (an "Events" sub-view inside
`SpaceView.tsx`, mirroring how it already shows a space's entries) is explicitly **deferred** — see
Out of scope.

## Components

### 1. `src/Events.tsx` (new) — top-level tab

Browse/filter/sort list via `useFetchManyEventsWrapper` (self-contained paginated hook — no manual
`fetchEntities`-style call needed, unlike `useEntityList`), routing to create or detail. Mirrors
`Feed.tsx`'s list/creating/selected local-state shape.

- **Filters:** timeWindow segmented control (`upcoming`/`ongoing`/`past`/`all`, default
  `upcoming`), sortBy dropdown (`startTime`/`going`, default `startTime`) + asc/desc toggle
  (default `asc` — soonest first), and a "🎤 hosted by me" checkbox that sets `hostId` to the
  current user's id. Every filter change calls `track("change_event_filter", { timeWindow,
  sortBy, sortDir })`.
- **List fetch:** `include: ["user", "space", "files", "userRsvp"]` so cards can show author,
  space name, cover thumbnail, and the viewer's own RSVP state without a second round-trip.
- **Card:** title; type icon (💻 `online` / 📍 `physical` / 🌐 `hybrid`); formatted start time;
  venue/url snippet; RSVP-count pills (`rsvpCounts.going`/`.maybe`/`.not_going`); a `pill danger`
  "🚫 Cancelled" badge when `status === "cancelled"`; a space-name pill when `spaceId` is set;
  cover thumbnail (via `fileImageSrc` matched against `coverImageId`) — click opens `EventView`.
- **Create button** → `CreateEvent`; `onDone` refreshes the list (`refresh()` from the wrapper
  hook), same handoff shape as `Feed`'s `CreateEntity`.
- Not built here: title/description/location text search (that's `Search.tsx`'s job) and no
  map/radius filter UI.

### 2. `src/CreateEvent.tsx` (new) — create form

Calls `useCreateEvent()`. Mirrors `CreateEntity.tsx`'s multipart pattern, extended with two
distinct image uploads (cover vs gallery are separate concepts in `CreateEventProps`).

Fields:
- `title` (required), `description` (textarea)
- `startTime`/`endTime` — `<input type="datetime-local">`, converted to/from ISO via helpers
  exported from `EventView.tsx` (`eventDateTimeToInputValue`/`inputValueToEventDateTime`)
- `timezone` — freeform text input, placeholder `"e.g. America/New_York (optional)"`; no timezone
  picker component
- `type` (`online`/`physical`/`hybrid` select) — toggles which fields render: `url` for
  online/hybrid, `venueName` + `address` for physical/hybrid
- `visibility` (`public`/`members`/`invite` select, default `public`)
- `capacity` (optional number input)
- `allowMaybe`/`guestListVisible` checkboxes, both default checked
- optional space picker: a `<select>` populated from the first page of the user's accessible
  spaces (`useSpaceList` reused, no parent filter, no search/typeahead — just the first page)
- cover image: single file input with a thumbnail preview + clear button
- gallery images: multi file input, reusing `CreateEntity.tsx`'s preview-thumbnails-with-clear
  pattern verbatim

Not included at create: `hostIds` (the creator is auto-added as host per the hook's own doc
comment — co-hosts are added afterward via `EventGuests`), `metadata`, and any lat/long geo input.

On success: `track("create_event", { type, visibility, hasCover: boolean, hasGallery: boolean,
hasSpace: boolean })`.

### 3. `src/EventView.tsx` (new) — detail view

Structure mirrors `EntityView.tsx`: a thin default-export wrapper mounting `EventProvider` (via
`useEventData`'s `{ eventId, include: ["user", "space", "files", "userRsvp"] }` props) around an
`Inner` component that calls `useEvent()` for `{ event, updateEvent, deleteEvent, cancelEvent,
setRsvp, withdrawRsvp }`.

- **Availability gate:** same fail-closed grace-window pattern as `EntityView.tsx` — `event` stays
  `undefined` while loading and while a 403 (invite-only, not invited) is silently rejected, so a
  5-second grace timer distinguishes "still loading" from "unavailable," rendering the same
  "🔒 not available" panel shape.
- **Header:** title; type + visibility pills; a cancelled banner when `status === "cancelled"`;
  space pill (linking nowhere — just informational, since space-scoped browsing is deferred);
  `AuthorTag` (reused from `EntityView.tsx`) for the creator (`event.user`).
- **Body:** cover + gallery images via `fileImageSrc` (reused from `EntityView.tsx`, matching
  `coverImageId` against `files` to separate cover from gallery); formatted date range (using the
  same helpers as `CreateEvent.tsx`); location block (`venueName`/`address` and/or `url` depending
  on `type`).
- **RSVP row:** Going/Maybe/Not-going buttons (Maybe hidden when `!allowMaybe`) calling `setRsvp`;
  a "clear RSVP" button when `userRsvp` is set, calling `withdrawRsvp`. Hidden entirely when
  `status === "cancelled"`. `track("set_rsvp", { status })` / `track("withdraw_rsvp")` on success;
  a rejection leaves the UI unchanged and shows an inline error string (these hooks aren't
  optimistic like `useReactionToggle`, so there's nothing to revert).
- **Host-only row** (`isHost = event.hostIds.includes(user.id)`): ✏️ Edit (toggles an inline
  `EventEditor`, same field set as `CreateEvent` plus a `removeImageIds` checkbox per existing
  image), 🚫 Cancel (confirm dialog → `cancelEvent`, `track("cancel_event")`), 🗑️ Delete (confirm
  dialog → `deleteEvent`, `track("delete_event")`, then `onBack()`) — mirrors `EntityView.tsx`'s
  owner actions exactly. `isHost` also mounts `<EventGuests eventId={eventId} hostIds={...} />`
  below the body.
- `EventEditor` on save: `track("edit_event")` (no metadata, matching `edit_entity`).

Exports `eventDateTimeToInputValue`/`inputValueToEventDateTime` (datetime-local ⇄ ISO conversion)
and a `formatEventWhen(event)` human-readable range formatter, for `CreateEvent.tsx` and
`Events.tsx` to import — same "detail file exports shared helpers" convention as `EntityView.tsx`
exporting `fileImageSrc`/`AuthorTag`/`isModeratedOut`.

### 4. `src/EventGuests.tsx` (new) — host-only guest management panel

Rendered only when `EventView`'s `Inner` has `isHost === true`.

- **Hosts:** resolves each id in `event.hostIds` via `useFetchUser({ userId })` (one call per id)
  and renders each with `AuthorTag`. A user-typeahead — a verbatim adaptation of
  `Connections.tsx`'s debounced `useSearchUsers` pattern (not extracted into a shared component;
  this avoids an unrelated refactor of `Connections.tsx`) — picks a user to `useAddHost({ eventId,
  userId })`, `track("add_host")`. Each host row has a remove button (`useRemoveHost`,
  `track("remove_host")`) disabled when `hostIds.length === 1` (cheap client-side guard against
  the server's "can't remove the last host" rejection — the server is still the real enforcement,
  so a rejection still surfaces inline if it somehow gets through).
- **Invites:** same typeahead pattern → `useAddInvite({ eventId, userId })`,
  `track("add_invite")`. List rendered from `useFetchInvitees({ eventId, limit: 50 })` (single
  page, no "load more" — demo-scale invitee lists don't need it), each row removable via
  `useRemoveInvite({ eventId, userId })`, `track("remove_invite")`.
- **Guest list (RSVP list):** `useFetchEventRsvps({ eventId, limit: 50 })` with a status filter
  (`all`/`going`/`maybe`/`not_going`) — single page, no "load more", same reasoning as invitees.
- Inline error string per action on rejection (create/host/invite errors all follow the same
  try/catch → `error` state shape used throughout the codebase).

## Data flow

1. **Browse:** `Events.tsx` mounts, calls the wrapper hook's implicit initial fetch with the
   default filter set (`upcoming`/`startTime`/`asc`). Changing any filter control re-triggers the
   hook's internal refetch (its own `setSortBy`/`setSortDir` plus a `refresh()` call after a filter
   object change, matching how `Feed.tsx` re-fetches on `sortBy` change via a `useEffect`).
2. **Create:** `CreateEvent` collects fields, converts `startTime`/`endTime` to ISO, attaches
   `cover`/`gallery` multipart configs when files are chosen, calls `useCreateEvent()`. On success,
   `onDone()` returns to `Events.tsx`, which calls the wrapper's `refresh()`.
3. **Detail:** clicking a card passes its `eventId` into `EventView`, which mounts `EventProvider`
   and fetches with the full `include` list. RSVP/edit/cancel/delete all go through
   `useEventData`'s returned functions, which — per the hook's own contract — return the updated
   `Event` and the caller is expected to re-render from that returned value (mirrored into local
   state the same way `EntityView.tsx`'s `updateEntity` flow works).
4. **Guest management:** `EventGuests` fires its own independent fetches
   (`useFetchInvitees`/`useFetchEventRsvps`) and action hooks, refreshing its own local lists after
   each successful add/remove — it does not share state with `EventView`'s `Inner` beyond the
   `eventId`/`hostIds` props it's given.

## Error handling

- **Create/edit:** try/catch around the hook call, inline `error` state rendered above the submit
  row — identical to `CreateEntity.tsx`/`EntityEditor`'s pattern. Multipart upload failures
  (cover/gallery) surface the same way; no separate retry UI.
- **Cancel/Delete:** `window.confirm(...)` guard, then the same try/catch-alert-on-failure pattern
  as `EntityView.tsx`'s `removeEntity`.
- **RSVP/withdraw:** best-effort — `setRsvp`/`withdrawRsvp` return the updated `Event` rather than
  optimistically updating client state, so a rejection just leaves the UI unchanged and shows an
  inline error string, same shape as `Reactions`' `err` state in `EntityView.tsx`.
- **Host/invite add/remove:** inline error string per action, surfacing the server's actual
  rejection message (e.g. "can't remove the last host") rather than a generic string, since the
  client-side guard already prevents the common case client-side.
- **Read/visibility:** invite-only events a viewer can't see hit the same grace-window
  "unavailable" panel as `EntityView.tsx` — no bespoke 403 handling.

## Out of scope

- **Space-scoped browsing inside `SpaceView.tsx`** (a per-space "Events" sub-view, mirroring how
  it already shows entries) — deferred by explicit user decision. `SpaceView.tsx` is not touched;
  `spaceId` is only a create-time tag + a top-level list filter.
- **Non-host guest-list visibility:** `guestListVisible` is a real server field, but this demo only
  ever shows the named RSVP/invitee lists to hosts (via `EventGuests`); a non-host viewer sees only
  the aggregate `rsvpCounts` already on the card/header, even when the event's `guestListVisible`
  is `true`. A deliberate trim, not a gap.
- **Geo/location:** no lat/long input, no map picker, no `locationFilters` radius search — the
  `location` field is never set by this demo's forms.
- **Search integration:** no title/description filters in `Events.tsx`'s own list (that's already
  `Search.tsx`'s domain), and events are not added to `Search.tsx`'s content-type coverage.
- **Pagination on guest/invitee lists:** single page (`limit: 50`), no "load more" — demo-scale
  lists don't need it.
- **Space picker search:** the `CreateEvent.tsx` space dropdown shows only the first page of the
  user's accessible spaces — no search/typeahead.
- **Timezone picker:** freeform text field, no IANA-zone autocomplete/picker component.

## Testing

No test suite in this repo (manual verification only, per `CLAUDE.md`). Verification plan:
1. Create an event of each `type` (online/physical/hybrid) with a cover + gallery image, confirm
   it appears in the list and the detail view renders both image sets correctly.
2. RSVP as a second seeded account: going → maybe → not_going → withdraw; confirm `rsvpCounts`
   update on the card and detail header each time.
3. As host: edit fields (including replacing the cover + removing a gallery image via
   `removeImageIds`), confirm changes persist after a refetch.
4. As host: add a co-host, confirm the co-host account can now edit/cancel the event; add + remove
   an invite; view the RSVP/invitee guest lists.
5. Cancel an event, confirm the "🚫 Cancelled" badge appears everywhere (list card, detail header)
   and RSVP buttons are hidden; then delete a separate event and confirm it's gone from the list.
6. Create an `invite`-visibility event, confirm a non-invited second account gets the
   "unavailable" panel instead of the detail view.
7. Filters: toggle timeWindow/sort/"hosted by me" and confirm the list re-fetches with the right
   params.
