# Changelog

All notable changes to this demo app are documented here. The format loosely follows
[Keep a Changelog](https://keepachangelog.com/); each release corresponds to a `vX.Y.Z` git tag.

## [0.3.0] — 2026-06-16

### Added

- **End-to-end-encrypted secure chat** (`@agora-sdk/secure-chat-*`, MLS / RFC 9420) behind a new
  **🔒 Secure** tab. The demo now exercises the full Phase-2 secure-chat SDK surface against a
  **blind** Delivery Service (the server relays opaque base64 blobs and never sees plaintext):
  - Device bootstrap + automatic KeyPackage replenishment, plus a manual device / KeyPackage panel.
  - 1:1 encrypted DMs started from your connections (`createDirectConversation` runs the MLS
    handshake — claim KeyPackage → build group locally → relay targeted Welcomes).
  - Live realtime delivery + offline catch-up over the `/secure` socket namespace.
  - Fail-closed message states (`ok` / `pending` / `rejected`) — unverified messages never render
    raw bytes.
  - Out-of-band **safety-number** verification (60-digit identity-key check).
  - Passphrase **backup / restore** (argon2id + AEAD envelope) and **eviction recovery** on a
    cleared/fresh browser.
  - Size-bucket message **padding** (`"ladder"`) on by default.
- **One-way follows**: a **❤️ Follows** sub-tab under **Me** (following / followers, with unfollow),
  and **Follow** + **Connect** actions on public user profiles.

### Changed

- `vite.config.ts` gains a local-fork alias for `@agora-sdk/secure-chat-*`, mirroring the existing
  `@agora-sdk/core` fork override (auto-off in the Docker/CI build context, where the published npm
  packages are used instead).
- Expanded `CLAUDE.md` architecture notes (Me sub-tabs, deep links, profile overlay, session/token
  handling).

### Docs

- New `docs/SECURE_CHAT.md` implementation guide, plus an accuracy pass confirming the
  `@agora-sdk/secure-chat-*` packages are published to npm at `0.5.0`.

## [0.2.2] — 2026-06-08

### Fixed / Changed

- Version bookkeeping and demo-version surfacing in the header.

## [0.2.0] — 2026-06-05

### Added

- Open + highlight a notification's entity/comment on click.
- Auto-refresh feed + comments after posting, to catch asynchronous moderation.
- Public user-profile page reachable from author names.

### Fixed

- Flag removed entries in search results.

## [0.1.0] — 2026-05-31

Initial tagged release of the SDK test harness: auth, profile editing, feed + image uploads,
comments, reactions, inline entity edit, nested spaces, semantic search, realtime chat + DMs,
connections, notifications, and moderation (redaction, reporting, operator-gated UI) with Umami
analytics.
