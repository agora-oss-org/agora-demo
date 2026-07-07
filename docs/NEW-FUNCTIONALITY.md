# New SDK functionality to add to the demo

Compiled from `../agora-server/docs/SDK-V7.6.2-SERVER-SPEC.md` and
`SDK-V7.8.2-SERVER-SPEC.md`, cross-checked against what `src/` actually wires up today
(installed SDK: `@agora-sdk/core` `1.8.0`). Nothing below currently has any UI in this demo —
verified by grepping `src/` for the relevant hooks/params and finding zero hits.

## Group A — server already implements this (v7.6.2), just missing from the demo

These are "free" — no server work needed, purely wiring up existing hooks in this repo.

| # | Feature | SDK hook(s) | Notes / where it'd live |
|---|---|---|---|
| A1 | **Events** (full feature) | `useCreateEvent`, `useFetchManyEvents`, `useFetchEvent`, `useUpdateEvent`, `useDeleteEvent`, `useCancelEvent`, `useSetRsvp`/`useWithdrawRsvp`, `useFetchEventRsvps`, `useAddInvite`/`useRemoveInvite`/`useFetchInvitees`, `useAddHost`/`useRemoveHost` | Biggest gap — no `Events.tsx` at all. Needs its own top-level tab (list/create/detail, RSVP, invites, co-hosts, inline cover/gallery image upload like `CreateEntity.tsx`/`EntityView.tsx` already do) |
| A2 | **Push device registration** | `usePushRegistration`, `webPushTokenAdapter` | No push registration anywhere in the demo. Natural home: a settings-ish corner of `Me.tsx`/`Notifications.tsx` — register this browser for web push, show registration status |
| A3 | **Entity `createdAt` sort** | `sortBy=createdAt` on `useEntityList` | `Feed.tsx` `SORTS` list (`src/Feed.tsx:10`) only has `"new"` (the deprecated directional alias) — add canonical `"createdAt"` alongside/instead |
| A4 | **Comment sort controls** | `sortBy`/`sortDir` on `useCommentSectionData` | `EntityView.tsx` calls `useCommentSectionData({ entityId, limit: 20 })` with no sort control at all — add a sort dropdown (`createdAt`/`top`/`controversial`) + asc/desc toggle to the comment section |
| A5 | **Live conversation list** | `useFetchConversationPreview`, `conversation:created` socket event | `Chat.tsx` has no reference to conversation preview/live-insert — verify whether `ChatProvider`'s existing list already reacts to `conversation:created` under the hood, or whether the list needs an explicit wire-up to insert a new conversation row without a full re-fetch |

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

1. **A3, A4** — trivial, just extend existing sort UI (`Feed.tsx`, `EntityView.tsx`)
2. **A1 (Events)** — the single biggest net-new surface; needs a new tab + create/detail flow
3. **A2 (Push registration)** — moderate, new hook + browser permission flow
4. **A5 (Live conversation list)** — verify current behavior first, may be partially free
5. Group B items **as their server-side lands**, in the spec's recommended order (B1 → B2 → B3 → B4 → B5, then B6/B7)

## Confirmed against installed SDK (1.8.0)

`node_modules/@agora-sdk/core/dist/esm/hooks/comments/useCommentSectionData.d.ts` already exposes
`sortBy`/`setSortBy`/`sortDir`/`setSortDir` (`defaultSortBy`/`defaultSortDir` as props) — A4 is
purely a UI wiring task, no SDK upgrade needed.
