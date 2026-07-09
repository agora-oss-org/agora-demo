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

## Group B — server work is DONE; these are now pure demo wiring

**Re-verified 2026-07-09** against the running local server and the `agora-server` source: **all
seven server-side features have landed.** The old "server-side is currently TODO" framing, and the
build order that was sequenced around *server* effort, are both obsolete — re-order by demo value.

The installed SDK (`@agora-sdk/core` `1.8.0`) already exports every hook below, so **none of these
need an SDK upgrade** — each is a UI wiring task in this repo, the same shape as the Group A work.

Verification note: `.env`'s `VITE_API_BASE_URL=http://localhost/v7` reaches the API only through
the Caddy proxy on `:80` (the server itself listens on `:4000`), and routes mount under
`/v7/:projectId/` — so a bare `GET /v7/entities` 404s. Probe
`http://localhost/v7/<projectId>/entities` instead.

| # | Feature | SDK hook(s) | Server | Notes |
|---|---|---|---|---|
| ~~B1~~ | ~~**Notification preferences**~~ | `useNotificationPreferences` (read/upsert) | ✅ `GET`/`PUT /push-notifications/preferences` | **Done** (2026-07-09, `docs/superpowers/specs/2026-07-09-notification-preferences-design.md` + `docs/superpowers/plans/2026-07-09-notification-preferences.md`) — new `src/NotificationPrefs.tsx`, a 20-type opt-in checklist mounted as a second panel in the `🔔 Push` sub-tab. **Not** in `Notifications.tsx` as originally guessed here: `disabledTypes` is consumed only by the server's push sender, so it provably does not filter the in-app `📥 Inbox`; putting an opt-out next to a list it doesn't filter would mislead. Preferences are account-level (keyed `projectId`+`userId`), so the panel also renders on browsers where web push is unsupported. Live-verified against a running local server (all 8 checklist items), including the optimistic-rollback path: a failed save keeps the user's edits and re-enables Save |
| B2 | **Space visibility** | `visibility` field on space create/update + responses | ✅ handled on space create + update | `public`/`unlisted`/`private` — add a field to space create/edit forms in `Spaces.tsx`/`SpaceView.tsx` |
| B3 | **Follows/connections search** | `query`/`searchFields` params on `useFetchFollowers`/`useFetchFollowing`/`useFetchConnections(ByUserId)` | ✅ both params wired | Add a search box to `Follows.tsx` and `Connections.tsx` |
| B4 | **Conversation mute** | `useMuteConversation` (`8h`/`24h`/`1w`/`forever`/`null`) | ✅ `POST /chat/conversations/:id/mute` | Per-conversation mute button in `Chat.tsx` thread header; reads `mutedUntil`/`mutedForever` off the viewer's own member row |
| B5 | **Search `includeChildSpaces`** | flag on `useSearchContent`/`useAskContent` bodies | ✅ resolves the subtree via a recursive CTE | Checkbox in `Search.tsx` when a space scope is selected |
| B6 | **Space-reputation enrichment** | flat `spaceReputationId` / `spaceReputationDescendants` query params on many GETs | ✅ real implementation (not the `"none"`-alias stub); enriches 9 route files | No longer "L (deferrable)" — that sizing was server-side. Surface as a badge next to `AuthorTag`/profile displays. **Note:** this doc previously described a *nested* `spaceReputation: { spaceId, includeDescendants }` param; the wire shape is the two flat params, and the SDK already sends them that way — no contract mismatch |
| B7 | **User matching** | `useMatchUsers` (`POST /match/users`) | ✅ route live | No longer "L (deferrable)" — that sizing was server-side. Natural home: a new tab or a sub-view under `Search.tsx`/`Social.tsx` ("find users like me") |

## Suggested demo build order

1. ~~A3, A4~~ — done
2. ~~A5~~ — investigated, no demo work needed (already works via existing `ChatProvider`/`useConversations` usage)
3. ~~A2 (Push registration)~~ — done
4. ~~A1 (Events)~~ — done
5. Group B items — **no longer gated on server work** (all seven landed; re-verified 2026-07-09).
   - ~~B1 (Notification preferences)~~ — done
   - B2–B7 remain; re-order by demo value

## Confirmed against installed SDK (1.8.0)

`node_modules/@agora-sdk/core/dist/esm/hooks/comments/useCommentSectionData.d.ts` already exposes
`sortBy`/`setSortBy`/`sortDir`/`setSortDir` (`defaultSortBy`/`defaultSortDir` as props) — A4 is
purely a UI wiring task, no SDK upgrade needed.
