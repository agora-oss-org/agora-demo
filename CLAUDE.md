# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A standalone Vite + React (TypeScript) app that drives the **real Agora SDK hooks**
(`@agora-sdk/react-js` + `@agora-sdk/core`) against a running Agora server. It is a **1:1
compatibility proof / manual test harness** for the SDK, not a product. Every feature tab exists to
exercise one SDK surface end-to-end (auth, profile editing, feed + image uploads, comments,
reactions, inline entity edit, nested spaces, semantic search, live socket.io chat + DMs,
connections, notifications).

When something breaks here it usually means a server↔SDK contract mismatch, not an app bug (e.g.
GET-vs-POST shape mismatches, `null` optional fields rejected by create endpoints, `sourceId=null`
treated as a literal filter) — check the server route against what the SDK actually sends.

## Commands

```bash
pnpm dev          # Vite dev server → http://localhost:5175
pnpm build        # tsc -b (typecheck) + vite build
pnpm preview      # serve the production build
```

**pnpm is the package manager** — `pnpm-lock.yaml` is the single source of truth (there is no
`package-lock.json`; don't run `npm install`, it would generate a divergent one). The pinned version
lives in `package.json`'s `packageManager` field; `corepack enable` activates it.

There are **no tests and no linter** — verification is manual, by clicking through the tabs. The
build's `tsc -b` is the only static check.

### Local stack (the demo needs an Agora server running)

```bash
cd ../agora-server/apps/api && npm run dev                       # 1. boot Agora server (separate terminal)
cd ../agora-server/apps/api && node scripts/seed-demo-user.mjs   # 2. seed demo user (once)
pnpm install && pnpm dev                                # 3. run this demo
```

Env lives in one **gitignored** `.env` (← the committed `.env.example` template), read NATIVELY by
Vite — no hand-loading. It has two sections, and the split is deliberate:

- **`VITE_*`** — read LIVE by Vite at dev-server-start (`pnpm dev`, `docker compose up` dev target).
  `VITE_API_BASE_URL` (defaults to a local server `http://localhost:4000/v7`; set
  `https://agora.recoverysky.net/v7` to test the deployed one), `VITE_DEMO_EMAIL`/`VITE_DEMO_PASSWORD`,
  `VITE_ADMIN_URL`, the Umami tracker vars, `VITE_AGORA_SECURE_CHAT_DEBUG`, and
  `VITE_AGORA_EMAIL_REDIRECT_TO` (see below). Changing these takes effect on the next start, no
  rebuild — fine to leave blank.
- **`AGORA_DEMO_*`** — read by the **published `prod` image's** nginx entrypoint
  (`docker-entrypoint.d/40-agora-config.sh`) at **container start**, written into `/config.js`
  (`window.__AGORA__`), which `src/config.ts` reads before ever falling back to a baked `VITE_*`
  value. This is what actually configures anything deployed — `vite build` inlines `VITE_*` into the
  static bundle forever, so real deployment values must never be Docker build-args; they're
  `AGORA_DEMO_*` container env instead.
- `AGORA_UMAMI_API_KEY` is the one true secret (not `VITE_`-prefixed — server-side Umami *reporting*
  key; the browser tracker never needs it, so it has no `AGORA_DEMO_*` runtime counterpart).

`AGORA_DEMO_EMAIL_REDIRECT_TO` / `VITE_AGORA_EMAIL_REDIRECT_TO` feed `@agora-sdk/core`'s
`emailRedirectTo` (divergence #6) — the origin stamped into sign-up / password-reset /
verification-email links so they return to *this* front-end. The SDK has no provider prop for it
(unlike `baseUrl`); it reads `import.meta.env.VITE_AGORA_EMAIL_REDIRECT_TO` (or
`window.__vite_env`, checked first — see `src/config.ts`) → falls back to `window.location.origin`.
`src/config.ts` bridges a runtime `AGORA_DEMO_EMAIL_REDIRECT_TO` value into `window.__vite_env` so
the prod image can carry this without baking a real origin into the bundle. The entrypoint defaults
it to the public demo's own origin (`https://demo.agora-oss.org`) — same convention as
`AGORA_DEMO_API_BASE_URL` defaulting to its backend.

### Docker

```bash
docker compose up --build     # Vite dev container (HMR, target: dev) → http://localhost:5175
docker build -t agora-demo .  # production image (target: prod, the default last stage) → nginx :80
```

The `Dockerfile` is **multi-stage** with two shipping targets off a shared pnpm deps layer (`base`):

- **`prod`** (default/last stage, what `docker-publish.yml` builds and what gets **deployed**):
  `vite build` → `nginx:alpine` serving the static `dist/` on **:80** (config in `nginx.conf`). This
  is the one to deploy publicly — the dev server serves every ES module out of `node_modules` over
  HTTP, which fans a page load into hundreds of requests and gets **rate-limited (429)** behind a
  public proxy (worsened by the secure-chat MLS/crypto dep graph). The built bundle is ~a dozen
  hashed assets, no `node_modules` over HTTP. `VITE_*` are inlined at **build time** here, so the CI
  passes them as build args.
- **`dev`** (used by `docker compose`, `build.target: dev`): the Vite dev server with HMR on
  **:5175**, with a source bind mount. `VITE_*` are read at **dev-server start** (overridable via
  `-e` / compose `environment:`, no rebuild). Use
  `VITE_API_BASE_URL=http://host.docker.internal:4000/v7` to reach a server on the host. **Never
  deploy this stage.**

The build is self-contained because the SDK comes from npm (below) — no sibling dir in the build
context.

## How the SDK is consumed (critical to understand)

The SDK is the **published npm packages** `@agora-sdk/core` + `@agora-sdk/react-js` (normal
`dependencies`). Source imports them by their real names. `vite.config.ts` **dedupes** `react`,
`react-dom`, `react-redux`, `@reduxjs/toolkit` so the SDK shares the app's single React/Redux
instance (otherwise hooks break).

**Automatic local-fork override:** `vite.config.ts` checks whether the sibling
`../agora-sdk/packages/{core,react-js}/dist/esm/index.js` exist on disk. If they do (you have the
fork checked out next to the demo **and built**), it aliases the package names at that dist so local
SDK edits take effect without republishing — it logs `[vite] @agora-sdk → LOCAL fork` at boot.
**Rebuild the fork (`pnpm build-all` in `../agora-sdk`) after editing it, and restart this dev server
to pick up a newly-present alias** (Vite reads config only at boot). **When you change the *contents*
of an already-aliased dist (not add a new one), also clear Vite's pre-bundle —
`rm -rf node_modules/.vite` (or `pnpm run dev --force`) — then restart; `optimizeDeps` fingerprints
the cache on package version, not the aliased file's bytes, so a plain restart keeps serving the
stale bundle.** The check is on-disk, so the
alias is automatically **off in the Docker build context / CI** (build context is the demo dir only —
no sibling — so the registry-installed packages are used), keeping the image self-contained. To force
the registry packages even locally, remove/rename the fork's `dist`, or temporarily blank the alias.

The SDK takes its server URL from the `baseUrl` prop on `AgoraProvider` (parsed from
`VITE_API_BASE_URL` in `App.tsx`); the SDK no longer sniffs env directly.

## Architecture

`main.tsx` → `App.tsx` (`AgoraProvider` projectId+baseUrl, then `ChatProvider` for the socket.io
connection — still used by **space chat** in `SpaceView.tsx` — then `SecureChatGate` for the E2EE
secure-chat stack) → `Shell.tsx`.

`Shell.tsx` is the auth gate and tab router: `@agora-sdk/auth-react-js`'s `useAuthStatus()` gives the
canonical `'initializing' | 'authenticated' | 'unauthenticated'` signal; until authed it renders
`Login.tsx`, otherwise a simple `useState` tab switch across the feature panels
(Feed, Spaces, Search, Chat, Secure Chat, Inbox, Me). There are **two** chat tabs: the **💬 Chat**
tab is the non-encrypted socket.io DM/group surface (`Chat.tsx`), and the **🔒 Secure Chat** tab is
the E2EE **secure chat** — `SecureChat` under `src/secure/`. Both ride the same `ChatProvider` socket
(secure chat additionally uses the `/secure` namespace); the non-encrypted stack also powers
space-scoped chat inside `SpaceView.tsx`. There is no
router library — tabs, and drill-downs within a
tab (entity detail, space detail, create forms), are all conditional renders swapped via local state.
**Connections is no longer a top-level tab** — it lives, with Follows and Profile, as a sub-tab under
**Me** (`Me.tsx`). Shell also owns three cross-cutting concerns:

- **Deep links.** A `?entity=<id>[&comment=<id>]` URL (the admin app links moderators straight to
  reported content) is captured synchronously on mount, then stripped from the URL; the Notifications
  tab feeds the same `DeepLink` state on click. A deep link renders one `EntityView` full-bleed over
  the tabs, with a back-target that remembers where you came from.
- **Profile overlay.** Everything is wrapped in `ProfileViewerProvider` so any `AuthorTag` anywhere
  can call `openProfile(userId)` — see the overlay convention below.
- **Session.** `useTokenRefresh()` proactively rotates the access token before its TTL;
  `useAuthSelfHeal()` (also `@agora-sdk/auth-react-js`) prunes a dead active account once on mount so
  a stale-only session doesn't get stuck on a silent 401; sign-out uses
  `useSignOutEverywhere().signOutEverywhere` (clears **all** persisted accounts), **not**
  `useAuth().signOut()` (which switches to a remaining account instead of ending the session).
- **Auth email links.** The server emails `{origin}/auth/verify-email` and
  `{origin}/auth/reset-password` links (signup confirmation, forgot-password). Since there's no
  router, `Shell.tsx` hand-matches `window.location.pathname` for those two suffixes (same spirit as
  the `?entity=` deep link) and renders `@agora-sdk/auth-react-js`'s `EmailVerificationHandler` /
  `PasswordResetHandler` full-bleed instead of the normal gate/tab UI — before the loading/login
  check, since both can land while signed out. These are the **only** two URLs in the app that get a
  real full-page browser navigation at a non-root depth (every other "route" is client-side tab
  state) — see the `base: "./"` comment in `vite.config.ts` for why that used to break asset loading
  there, and `index.html`'s `<base href>` for the fix.

Each feature file maps to one SDK surface (and the server route it hits, noted in each file's
header comment):

| File | SDK hook(s) / provider | Exercises |
|------|------------------------|-----------|
| `Login.tsx` | `useAuth` (`signInWithEmailAndPassword`, `signUpWithEmailAndPassword`), `useRequestPasswordReset`; `@agora-sdk/auth-react-js`'s `ResendVerificationButton` | `/auth`; email/password only (no OAuth) — the email-confirmation sign-up flow + forgot-password request |
| `Me.tsx` | — (sub-tab host) | the current user's area: switches between `Profile` / `Connections` / `Follows` sub-views |
| `Profile.tsx` | `useUser().updateUser` | edit own username/name/bio/avatar (PATCH `/users/:id`) — landing sub-view of Me |
| `Follows.tsx` | `useFetchFollowing`, `useFetchFollowers`, `useUnfollowByFollowId` | one-way follows (no accept step); distinct from Connections — Me sub-view |
| `UserProfile.tsx` / `ProfileViewer.tsx` / `ProfileViewerContext.ts` | `useFetchUser`, `useEntityList`, `useFollowManager`, `useRequestConnection` | read-only public profile of any user, shown in an app-wide portal overlay opened by `AuthorTag` |
| `Feed.tsx` | `useEntityList` | list entities; routes to `CreateEntity` / `EntityView` |
| `CreateEntity.tsx` | `useCreateEntity` | create an entity, optional `spaceId` + multipart image upload |
| `EntityView.tsx` | `EntityProvider` + `useEntity`, `useReactionToggle`, `useCommentSectionData` | one entity: image display, owner inline edit, reactions, comments (with per-comment upvotes) |
| `Spaces.tsx` / `SpaceView.tsx` | `useSpaceList`, `useEntityList`; `useFetchSpaceConversation`, `ConversationProvider` + `useConversationContext` | top-level spaces, then recurse into subspaces + space-scoped entries; **space chat** is a space-scoped instance of the same socket.io chat surface as `Chat.tsx` |
| `Chat.tsx` | `useConversations`, `ConversationProvider` + `useConversationContext`, `useChatContext`, `useCreateDirectConversation`, `useConversationMembers` | the **💬 Chat** tab: non-encrypted realtime socket.io chat — groups + DMs, image/file attachments, group member management |
| `Search.tsx` | `useSearchContent` | semantic search (POST `/search/content`); entity hits open in `EntityView` |
| `secure/SecureChat.tsx` (+ `SecureChatGate`, `SecureStoreContext`, `SecureUnlock`, `SecureStorePanel`, `SecureBootstrap`, `SecureThread`, `DevicePanel`, `SafetyNumberModal`) | `@agora-sdk/secure-chat-react-js`: `useSecureConversations`, `useSecureMessages`, `useSecureDevice`, `useSecureHandshakes`, `useSecureSafetyNumber`; `createEncryptedStore` | the **🔒 Secure Chat** tab: E2EE (MLS) secure DMs — device bootstrap/handshake drain, per-conversation decrypt, safety-number verification, **at-rest encryption** (password-gated `EncryptedStore`) |
| `Social.tsx` | `SocialProvider` + `useSocialWeather`, `useSocialConstellation`, `useSocialNeighborhood`, `useSocialTransparency` (from `@agora-sdk/social-*`) | the **☀️ Social** tab: the read-only social-graph "commons" — Weather / Constellation / Neighborhood / Transparency lenses, each rendered as the SDK's drop-in component beside a raw-debug column (`GET /social/*`) |
| `Connections.tsx` | `useFetchConnections`/`…SentPending…`/`…ReceivedPending…`, `useRequestConnection`, `useAcceptConnection`, `useSearchUsers` | connections: typeahead request, sent/received pending, accept/decline/cancel |
| `Notifications.tsx` | `useAppNotifications` | in-app inbox |

### Conventions to match when editing

- Hook return values are cast `as any` throughout — the SDK's exported types are incomplete, so the
  demo deliberately treats them loosely. Keep this style rather than fighting the types.
- Comment-section rendering merges `newComments` (optimistic, just-posted) **on top of** `comments`
  (server) until a refetch folds them together — see the comment in `EntityView.tsx`. Mirror this
  pattern for any other optimistic list.
- Non-encrypted chat messages (`Chat.tsx` and space chat in `SpaceView.tsx`) come newest-first from
  the SDK; the thread reverses them for
  display and compares `m.userId === user?.id` to style "mine". The open thread is wrapped in
  `ConversationProvider` (keyed by id so switching re-joins the socket room). Secure chat
  (`secure/SecureThread.tsx`) mirrors this but decides "mine" via `senderUserId === myUserId` and
  fails decryption **closed**.
- Secure chat is **encrypted at rest**: `SecureChatGate` wraps the IndexedDB store in
  `createEncryptedStore(...)`, which is **locked** until the user enters a password. A locked store
  throws `StoreLockedError` on every op, so nothing may read it before unlock — but that's the store
  *consumers*, not `SecureChatProvider` itself (it only builds rest/socket/repo and never touches the
  store at mount; the socket dials lazily). So the gate mounts the provider as soon as you're **signed
  in** (even while locked) and gates only the consumers: `SecureBootstrap` (register/drain) and the
  **Secure Chat tab** (which shows `SecureUnlock` until `unlocked`). Because the provider is already the
  Shell's ancestor, unlocking just flips a boolean **in place — no remount, no tab bounce** (other tabs
  are unaffected — lazy gate). Unlock/lock/changePassword are exposed via the `SecureStoreContext` leaf
  (default no-ops, like `ProfileViewerContext`). Lock-on-logout is automatic (an `accessToken` effect in
  the gate). `lock()` is a **disk-lock**, not a memory purge — the manual "Lock store" button reloads to
  actually clear cached plaintext. The old passphrase→server backup/restore UI was removed (deprecated;
  cross-device recovery is moving to device-to-device), so an evicted/fresh browser auto-registers a new
  identity.
- Images: uploaded entity files render via the exported `fileImageSrc(file)` helper in
  `EntityView.tsx` (picks medium → original variant). Reuse it for any new image display.
- Connections aren't realtime (the socket layer is chat-only), so `Connections.tsx` polls on an
  interval to surface accepted/incoming requests. `Follows.tsx` polls the same way for the same
  reason. **Follows ≠ Connections**: follows are one-way and need no accept step (`useFollowManager`
  toggle / `useUnfollowByFollowId`); connections are bidirectional friend requests with
  request→accept (`useRequestConnection`/`useAcceptConnection`).
- The public-profile overlay is opened via `useProfileViewer().openProfile(userId)` from any
  `AuthorTag`. `ProfileViewerContext.ts` is a deliberately tiny leaf module (default no-op
  `openProfile`) so `AuthorTag` can import it without creating the cycle
  provider → `UserProfile` → `EntityView` → context. The overlay is a `createPortal` on top of the
  app (so closing preserves feed/thread scroll), keyed by `userId` so author→author navigation
  remounts cleanly.
- Server moderation is **asynchronous** — a create can be accepted now and hidden ~seconds later.
  After a successful create, call the `schedule(refresh)` from `useModerationRefresh()` to re-pull the
  list once (~5s out) so the censored state surfaces. Rapid posts collapse to one refresh; pending
  timers clear on unmount.
- Token rotation is handled centrally by `useTokenRefresh()` in `Shell` (proactive, scheduled before
  `exp`); the SDK's reactive 401-interceptor is the backstop. Don't add per-feature refresh logic.
- Styling is one hand-written `styles.css` with utility-ish classes (`col`, `row`, `panel`, `card`,
  `pill`, `msg`, `mine`, `muted`, `spacer`, `prewrap`, `clamp3`, `linklike`). No CSS framework.
- Analytics is Umami, centralized in `src/analytics.ts` — call `track(event, data?)` /
  `trackPageView(path)` (never touch `window.umami` directly; the script is injected once via
  `loadUmami()` in `main.tsx`). Event names are a flat `snake_case` `AnalyticsEvent` union, so a
  typo fails the build. Navigation is page views (`PATHS.*`, this no-router SPA records them
  explicitly per tab + detail); product actions are events, fired **on success** with
  low-cardinality enums/booleans only — **never IDs or free text**. The reporting API key stays
  server-side (see the env split above).
