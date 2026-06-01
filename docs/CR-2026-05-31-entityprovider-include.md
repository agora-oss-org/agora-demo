# Change Request: support `include` on `EntityProvider` / `useEntityData`

| | |
|---|---|
| **Date** | 2026-05-31 |
| **Requested by** | Jenova Marie |
| **Affected package** | `@agora-sdk/core` (re-exported by `@agora-sdk/react-js`) |
| **Observed version** | 1.2.1 |
| **Type** | Enhancement (small, additive, backward-compatible) |
| **Priority** | Medium — blocks a common UI need; trivial fix |
| **Status** | Implemented in the local fork (2026-05-31); pending publish to npm |

## Summary

`EntityProvider` (via `useEntityData` → `useEntity`) fetches a single entity **without** an
`include` parameter, and `UseEntityDataProps` exposes no way to set one. As a result, consumers
cannot request related data — most importantly the entity's **author** (`include=user`) — on a
single-entity/detail view. This is inconsistent with the rest of the SDK: the entity-list and
comment-section hooks both support includes, and the server's `GET /entities/:id` already honors
`?include=`. The three underlying fetch hooks already accept `include` too — `useEntityData` simply
doesn't pass it through. The fix is to thread `include` from `UseEntityDataProps` into those
existing calls.

## Motivating use case

Rendering the **poster's name/avatar** on an entity detail screen. With the list hook we can fetch
authors for the feed (`config.include`), and the comment section already returns comment authors,
but the single-entity detail view (the canonical `EntityProvider` use) cannot — so the same screen
shows author info for comments but not for the post itself.

## Current behavior (evidence)

All three single-entity fetch hooks **already accept and forward `include`**:

- `packages/core/src/hooks/entities/useFetchEntity.tsx:6-8` — `FetchEntityProps { entityId; include?: EntityIncludeParam }`, and it sends `params.include` to `GET /entities/:id` (lines 25-27).
- `packages/core/src/hooks/entities/useFetchEntityByForeignId.tsx:6-9,30` — same, with `include`.
- `packages/core/src/hooks/entities/useFetchEntityByShortId.tsx` — same shape.

But `useEntityData` calls them **without** `include`, and its props type omits it:

- `packages/core/src/hooks/entities/useEntityData.tsx:117-128` — the three calls pass only
  `{ entityId }` / `{ foreignId, createIfNotFound }` / `{ shortId }`.
- `packages/core/src/hooks/entities/useEntityData.tsx:12+` — `UseEntityDataProps` has no `include`
  field (only `entity` | `entityId` | `foreignId` | `shortId` | `createIfNotFound`).
- `EntityProvider` (`packages/core/src/context/entity-context.tsx`) takes
  `EntityContextProps = UseEntityDataProps & { children }`, so it inherits the same gap.

**Precedent within the SDK (the inconsistency):**

- Comment section hardcodes author fetching: `packages/core/src/hooks/comments/useCommentSectionData.tsx:149` → `include: "user"` (and `:407` → `["user", "parent"]`).
- Entity-list config supports includes: `store/slices/entityListsSlice` → `EntityListConfig.include?: EntityIncludeParam`.
- Valid includes already defined: `interfaces/models/Entity.ts:61` →
  `EntityInclude = "space" | "user" | "topComment" | "saved" | "files"`.

**Server already supports it** (no server change required) — `GET /entities/:id` honors
`?include=`:

- `apps/api/src/routes/entities.ts` (single-entity shaper) → `parseInclude(c)` then
  `if (include.has("user")) { … loadUsers(…) }`, mirroring the list handler (`:107`) and the comment
  handlers (`:69`, `:152`). Verified end-to-end: `GET /entities?include=user` returns
  `user: { username: … }`; without `include`, the `user` key is absent.

## Proposed change

Thread an optional `include` through `useEntityData` into the existing fetch calls. ~4 lines.

**1. `packages/core/src/hooks/entities/useEntityData.tsx`** — add `include?: EntityIncludeParam` to
the `entityId` / `foreignId` / `shortId` variants of `UseEntityDataProps`, destructure it, and
forward it:

```ts
fetchEntity({ entityId, include });
fetchEntityByForeignId({ foreignId, createIfNotFound, include });
fetchEntityByShortId({ shortId, include });
```

Fold `include` into the fetch effect's dependency array / cache key so a changed `include` (same id)
re-fetches rather than returning a cached no-`include` entity. Normalization
(`Array.isArray(include) ? include.join(",") : include`) already lives in the fetch hooks, so
`useEntityData` can pass the raw `EntityIncludeParam` straight through.

**2. `EntityProvider`** picks this up automatically since
`EntityContextProps = UseEntityDataProps & { children }` — no separate change needed.

### Consumer API after the change

```tsx
<EntityProvider entityId={id} include={["user"]}>
  {/* useEntity().entity.user is now populated */}
</EntityProvider>
```

## Backward compatibility

Fully backward-compatible and additive:
- `include` is optional; omitting it preserves today's exact behavior (no `include` param sent).
- No change to return types (`Entity.user` is already `user?: User | null`).
- No server change (the endpoint already honors the param).

## Acceptance criteria

1. `<EntityProvider entityId include={["user"]}>` → `useEntity().entity.user` is populated.
2. The same works for the `foreignId` and `shortId` provider variants.
3. Omitting `include` issues a request **without** an `include` param and behaves exactly as in 1.2.1.
4. Changing `include` (and/or the id) re-fetches (cache key includes `include`).
5. Types: `include?: EntityIncludeParam` accepted on `EntityProvider` and `useEntityData`.

## Related (suggest bundling into the same release)

- **Token-refresh status-code fix.** `packages/core/src/config/useAxiosPrivate.ts` triggered the
  reactive token refresh on HTTP **403**, but the server returns **401** for an expired/invalid
  access token (`apps/api/src/middleware/auth.ts` → `requireAuth` → `Errors.unauthorized()` = 401;
  403 is reserved for authorization denials such as members-only spaces). This caused refresh to
  never fire mid-session. Fixed locally to `status === 401`; please confirm it lands upstream and
  ships in the same version so CI/published consumers get it. (Rationale: 401 is the correct code
  per RFC 9110 / RFC 6750; switching the server to 403 would collide with genuine authorization
  denials, which the SDK cannot disambiguate.)

## References

- `@agora-sdk/core` (fork): `packages/core/src/hooks/entities/useEntityData.tsx`,
  `useFetchEntity.tsx`, `useFetchEntityByForeignId.tsx`, `useFetchEntityByShortId.tsx`,
  `hooks/comments/useCommentSectionData.tsx`, `context/entity-context.tsx`,
  `interfaces/models/Entity.ts`, `config/useAxiosPrivate.ts`.
- Server: `apps/api/src/routes/entities.ts`, `routes/comments.ts`, `lib/shape.ts`,
  `middleware/auth.ts`.
