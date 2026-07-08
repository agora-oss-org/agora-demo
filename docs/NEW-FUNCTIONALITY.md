# New SDK functionality to add to the demo

Compiled from `../agora-server/docs/SDK-V7.6.2-SERVER-SPEC.md` and
`SDK-V7.8.2-SERVER-SPEC.md`, cross-checked against what `src/` actually wires up today
(installed SDK: `@agora-sdk/core` `1.8.0`). Nothing below currently has any UI in this demo —
verified by grepping `src/` for the relevant hooks/params and finding zero hits.

## Group A — server already implements this (v7.6.2), just missing from the demo

These are "free" — no server work needed, purely wiring up existing hooks in this repo.

| # | Feature | SDK hook(s) | Notes / where it'd live |
|---|---|---|---|
| ~~A1~~ | ~~Events~~ (full feature) | `useCreateEvent`, `useFetchManyEvents`, `useFetchEvent`, `useUpdateEvent`, `useDeleteEvent`, `useCancelEvent`, `useSetRsvp`/`useWithdrawRsvp`, `useFetchEventRsvps`, `useAddInvite`/`useRemoveInvite`/`useFetchInvitees`, `useAddHost`/`useRemoveHost` | **Done** (2026-07-08, `docs/superpowers/specs/2026-07-08-events-design.md` + `docs/superpowers/plans/2026-07-08-events.md`) — new `🎉 Events` top-level tab (`src/Events.tsx`, `src/CreateEvent.tsx`, `src/EventView.tsx`, `src/EventGuests.tsx`): browse/filter, create with cover+gallery upload, RSVP, host-only edit/cancel/delete, co-host + invite management, guest lists. Manual live-verified against a running local server: RSVP, edit, cancel, delete, co-host/invite add-remove, filters, and non-host/invite-only visibility all confirmed working. Caught and fixed a critical infinite-refetch loop (unstable `include` array identity feeding `useFetchManyEventsWrapper`) during verification. **Known non-demo gap**: the server's `buildEventResponse` only implements `include=user`/`userRsvp` — `include=space`/`include=files` are silently ignored, so cover/gallery images upload successfully but never render, and space pills never show on events; would need an `agora-server` fix, out of scope for this repo |
| ~~A2~~ | ~~Push device registration~~ | `usePushRegistration`, `webPushTokenAdapter` | **Done** (2026-07-07, `docs/superpowers/specs/2026-07-07-push-registration-design.md`) — new `src/Push.tsx` panel under a `Me.tsx` "🔔 Push" sub-tab; `public/sw.js` service worker + boot-time registration in `main.tsx` (required since `webPushTokenAdapter` awaits `navigator.serviceWorker.ready`, and the demo had no SW infra) |
| ~~A3~~ | ~~Entity `createdAt` sort~~ | `sortBy=createdAt` on `useEntityList` | **Done** (2026-07-07, `docs/superpowers/specs/2026-07-07-sort-controls-design.md`) — `Feed.tsx` `SORTS` now offers canonical `createdAt` instead of the deprecated `new` alias |
| ~~A4~~ | ~~Comment sort controls~~ | `sortBy`/`sortDir` on `useCommentSectionData` | **Done** (2026-07-07, same spec) — `EntityView.tsx`'s comment section now has a sort dropdown (`createdAt`/`top`/`controversial`) + direction toggle |
| ~~A5~~ | ~~Live conversation list~~ | `useFetchConversationPreview`, `conversation:created` socket event | **No demo work needed** — investigated 2026-07-08 by reading the SDK source directly: `ChatProvider` (already wrapping the app in `App.tsx`) listens for `conversation:created` itself (`context/chat-context.js:359`) and dispatches `insertConversationPreview` into the same Redux slice (`store/slices/chatSlice.js:133`) that `useConversations` reads via `selectConversationList` (`hooks/chat/conversations/useConversations.js:11`). `Chat.tsx` already uses both `ChatProvider` and `useConversations` — the live-list behavior is automatic, no explicit wiring required. (Note: the socket handler inserts unconditionally, ignoring the `types` filter passed to `useConversations` — but `Chat.tsx` already requests all three existing types (`direct`/`group`/`space`), so this never surfaces as a bug here. Not live-tested with two clients, but the source trace is unambiguous.) |

## Group B — needs server work first (v7.8.2, server-side is currently TODO)

Per the spec's recommended order (small/mechanical first): **1 → 3 → 4 → 2 → 7, then 6 and 5.**
Demo work on any of these should follow, not precede, the corresponding server merge — the doc
notes it's safe to build these incrementally since an old server + new SDK degrades gracefully
(hook errors or empty result).

| # | Feature | SDK hook(s) | Server effort | Notes |
|---|---|---|---|---|
| B1 | **Notification preferences** | `useNotificationPreferences` (read/upsert) | S | Per-type push opt-out (20 `PushEventType` values) — UI: checklist in `Me.tsx`/`Notifications.tsx` |
| B2 | **Space visibility** | `visibility` field on space create/update + responses | S | `public`/`unlisted`/`private` — add a field to space create/edit forms in `Spaces.tsx`/`SpaceView.tsx` |
| B3 | **Follows/connections search** | `query`/`searchFields` params on `useFetchFollowers`/`useFetchFollowing`/`useFetchConnections(ByUserId)` | S | Add a search box to `Follows.tsx` and `Connections.tsx` |
| B4 | **Conversation mute** | `useMuteConversation` (`8h`/`24h`/`1w`/`forever`/`null`) | S–M | Per-conversation mute button in `Chat.tsx` thread header; reads `mutedUntil`/`mutedForever` off the viewer's own member row |
| B5 | **Search `includeChildSpaces`** | flag on `useSearchContent`/`useAskContent` bodies | S | Checkbox in `Search.tsx` when a space scope is selected |
| B6 | **Space-reputation enrichment** | `spaceReputation: { spaceId, includeDescendants? }` param on many GETs | L (deferrable) | Large — server doesn't have space-scoped reputation yet. Once server ships even the `"none"`-alias stub, surface it as a badge next to `AuthorTag`/profile displays |
| B7 | **User matching** | `useMatchUsers` (`POST /match/users`) | L (deferrable) | Large AI/vector feature. Server doc recommends a stub (`{results: []}`) until the real matching engine lands. Natural home: a new tab or a sub-view under `Search.tsx`/`Social.tsx` ("find users like me") |

## Suggested demo build order

1. ~~A3, A4~~ — done
2. ~~A5~~ — investigated, no demo work needed (already works via existing `ChatProvider`/`useConversations` usage)
3. ~~A2 (Push registration)~~ — done
4. ~~A1 (Events)~~ — done
5. Group B items **as their server-side lands**, in the spec's recommended order (B1 → B2 → B3 → B4 → B5, then B6/B7) — up next

## Confirmed against installed SDK (1.8.0)

`node_modules/@agora-sdk/core/dist/esm/hooks/comments/useCommentSectionData.d.ts` already exposes
`sortBy`/`setSortBy`/`sortDir`/`setSortDir` (`defaultSortBy`/`defaultSortDir` as props) — A4 is
purely a UI wiring task, no SDK upgrade needed.
