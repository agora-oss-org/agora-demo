# Shared Composer: Markdown authoring, @mentions, and GIPHY GIFs

**Date:** 2026-07-19
**Status:** Approved design
**Supersedes:** `2026-07-17-mentions-design.md` + `../plans/2026-07-17-mentions.md`
**Reference implementation:** `../agora-www/src/components/comments/{Composer,GifPicker,markdown}.tsx|ts`

## Problem

Every composer in the demo is a bare `<textarea>`: `CreateEntity.tsx:54`, the comment box and inline
editor in `EntityView.tsx:144,597,716`, and the chat input in `Chat.tsx`. Three consequences:

1. **`gif` is a shipped SDK contract this harness has never exercised.** `GifData` is an exported SDK
   model type, and `gif: GifData | null` is a persisted field on **both** `Comment`
   (`core/dist/esm/interfaces/models/Comment.d.ts:24`) and `ChatMessage`
   (`.../ChatMessage.d.ts:12`). `useSendMessage` accepts `gif` over both its JSON and multipart paths
   (`useSendMessage.js:38,67,84`) and the optimistic socket echo preserves it
   (`chat-context.js:263`); `useEditMessage` accepts it too (`useEditMessage.d.ts:8`). Nothing in this
   demo produces a `gif`, so the server's handling of it is **completely untested from a real client**.
   Per `CLAUDE.md` ("every feature tab exists to exercise one SDK surface end-to-end"), this is a
   genuine coverage hole, not a cosmetic gap.
2. **Mentions are still unexercised.** Documented in the superseded 2026-07-17 spec; never built.
3. **No formatting.** `**bold**`, `_italic_`, `` `code` `` render as literal punctuation, unlike
   `agora-www`, the real client running against the same SDK.

## Scope

One shared `Composer` replacing all four composer sites, plus display-side rendering.

| Surface | File | Markdown | Mentions | GIF |
|---|---|---|---|---|
| Comment box | `EntityView.tsx` | ✅ | ✅ | ✅ |
| Chat input | `Chat.tsx` | ✅ | ✅ | ✅ |
| New post | `CreateEntity.tsx` | ✅ | ✅ | ❌ |
| Inline entity edit | `EntityView.tsx` | ✅ | ✅ | ❌ |

**GIF is unavailable on entity surfaces because `Entity` has no `gif` field** — verified absent from
`core/dist/esm/interfaces/models/Entity.d.ts`. This is an SDK/server constraint, not a choice.

### Out of scope

- **Space chat** (`SpaceView.tsx`). It rides the same socket surface, so it *could* take the composer,
  but it was not selected for this pass. Deliberate follow-up, not an oversight.
- **Secure chat** (`secure/SecureThread.tsx`). Its payloads are E2EE with a separate message shape;
  GIF/markdown there is a distinct design problem.
- **Editing an existing GIF.** `useEditMessage` accepts `gif`, but the edit flows here stay text-only.
- **Space mentions** (`useSpaceMentions`, `#` trigger). User mentions only.

## Key design decision: the textarea stays

We are **not** introducing a rich-text editor (TipTap / Lexical / Slate / contenteditable).

Markdown is **authored as plain text and rendered at display time**, exactly as `agora-www` does.
This matters for a specific reason: the SDK's `useUserMentions` tracks the word before the cursor via
`{ content, setContent, cursorPosition, isSelectionActive }`, driven by a textarea's `selectionStart`
on a flat string. A contenteditable replaces that flat string with a document tree and **breaks the
hook's contract**, forcing a hand-rolled reimplementation of mention tracking against a DOM range.

Keeping the textarea means: `content` stays a plain string on the wire, no server contract changes,
and `useUserMentions` is used exactly as designed. "Upgrading the editor" here means upgrading what
*surrounds* the textarea — typeahead, GIF attachment, formatting hint, display rendering.

## Correction to the superseded spec

`2026-07-17-mentions-design.md` states that `useUserMentions` is *"exported from `@agora-sdk/core`,
**not** re-exported by `@agora-sdk/react-js`"*, and builds a paragraph of reasoning about the demo's
"first direct core import."

**This is factually wrong.** `react-js/dist/esm/index.d.ts:2` is `export * from "@agora-sdk/core"`, so
`useUserMentions` *is* available from `@agora-sdk/react-js` — which is how `agora-www`'s Composer
imports it. This design imports it from `@agora-sdk/react-js`, consistent with every other hook in the
demo. No direct `core` import is needed and the dedupe reasoning is moot.

## Architecture

### New modules

| File | Responsibility | Depends on |
|---|---|---|
| `src/Composer.tsx` | Textarea + mention typeahead + GIF button + selected-GIF preview + formatting hint. Parent owns submit. | `useUserMentions`, `GifPicker` |
| `src/markdown.ts` | `renderMarkdown(text) → sanitized HTML` | `marked`, `dompurify` |
| `src/MarkdownBody.tsx` | Display component: sanitized markdown + mention linkification + delegated profile-open click | `markdown.ts`, `useProfileViewer` |
| `src/GifPicker.tsx` | GIPHY search/trending grid; maps `IGif → GifData` | `@giphy/*` |

### `Composer.tsx`

```ts
interface ComposerSubmit {
  content: string;
  mentions: Mention[];
  gif?: GifData;
}

interface ComposerProps {
  onSubmit: (data: ComposerSubmit) => Promise<void> | void;
  initialValue?: string;
  placeholder?: string;
  submitLabel?: string;
  busy?: boolean;
  autoFocus?: boolean;
  onCancel?: () => void;
  allowGif?: boolean;                              // false where Entity has no gif field
  analyticsTarget: "comment" | "entity" | "chat";  // low-cardinality event metadata
  compact?: boolean;
}
```

Internal state: `value`, `gif`, `showGif`, `error`, `cursorPosition`, `isSelectionActive`,
`submitting`; a `textareaRef`. A `syncSelection(el)` helper writes `cursorPosition` /
`isSelectionActive` from `selectionStart`/`selectionEnd` on `onChange`, `onClick`, and `onKeyUp`.

`useUserMentions` is configured `{ trigger: "@", minChars: 1, debounceDelay: 300 }`, matching
`agora-www` (the SDK defaults of `minChars: 3` / `debounceDelay: 1000` feel unresponsive).

Submit is enabled when `value.trim()` is non-empty **or** a GIF is selected — a GIF-only message is
valid. On success the composer clears `value`, `gif`, and calls `resetMentions()`. On throw it
surfaces the message inline and preserves the draft.

The mention dropdown renders `mentionSuggestions` when `isMentionActive`, absolutely positioned under
the textarea, each row calling `handleMentionClick(user)`.

Chat keeps its existing file-attachment control; `Composer` does not absorb file upload.

### `markdown.ts`

Ported near-verbatim from `agora-www`:

- `marked.setOptions({ breaks: true, gfm: true })`
- `DOMPurify.sanitize(raw, { ALLOWED_TAGS, ALLOWED_ATTR })`
- `ALLOWED_TAGS = ['p','br','strong','em','del','s','code','pre','blockquote','a','ul','ol','li','h1','h2','h3','h4','hr','span']`
- `ALLOWED_ATTR = ['href','title']`
- An idempotent (`hooked` flag) `afterSanitizeAttributes` hook forcing
  `target="_blank" rel="noopener noreferrer nofollow"` on every `<a>`

**`img` is deliberately excluded.** GIFs render as a separate attachment element, never as markdown
`![](url)`. This keeps the sanitizer's attack surface small and means a hostile `content` string
cannot cause a remote fetch.

### `GifPicker.tsx`

A `GiphyFetch(GIPHY_API_KEY)` instance driving `@giphy/react-components`' `<Grid>`: `trending()` with
no term, `search(term)` otherwise, `limit: 12`, `columns: 3`, `noLink`, `hideAttribution`, keyed on
the debounced term so a new search remounts the grid. Search input debounced 350ms. A
`ResizeObserver` tracks container width because `<Grid>` requires an explicit pixel width. Returns
`null` when no API key.

`onGifClick` calls `e.preventDefault()` then maps `IGif → GifData`:

```ts
{ id, url: original.url, gifUrl: original.url,
  gifPreviewUrl: fixed_width_small?.url ?? preview_gif?.url ?? original.url,
  altText: gif.title || gif.alt_text || 'GIF',
  aspectRatio: `${w} / ${h}` }
```

A **"Powered by GIPHY"** attribution line renders under the grid. GIPHY's API terms require
attribution; `hideAttribution` on `<Grid>` suppresses only the per-tile badge, so this line is what
satisfies it. It is not optional.

### Lazy loading

`GifPicker` is `React.lazy()` behind `<Suspense>`, loaded on first GIF-button click. `@giphy/*` is
substantial, and `CLAUDE.md` records that page weight already forced this repo onto a static prod
image. This is a deliberate divergence from `agora-www`'s static import.

## Display side

All three render through the shared `MarkdownBody` component (below) rather than calling
`renderMarkdown` inline:

- **Comment bodies** (`EntityView.tsx`) — `<MarkdownBody content={comment.content} mentions={comment.mentions} />`,
  then `comment.gif && <img src={comment.gif.gifUrl} alt={comment.gif.altText}>`.
- **Entity bodies** (`EntityView.tsx`, `Feed.tsx` cards) — `MarkdownBody`, no GIF.
- **Chat messages** (`Chat.tsx`) — `MarkdownBody` + `message.gif`, in both the server list and the
  optimistic socket echo.

`renderMarkdown` is called on `content` which is `string | null` on both models — the call sites must
guard for null.

### Mention linkification (divergence from `agora-www`)

`agora-www` does **not** linkify mentions on display — `@username` renders as inert text there. This
design *does*, because the superseded spec promised "clickable mentions" and dropping it silently
would be a regression against an already-approved plan.

Both models persist a `mentions: Mention[]` array, giving a `username → id` map with no extra lookup.
A shared `MarkdownBody` component owns the whole render:

```ts
function MarkdownBody({ content, mentions }: { content: string | null; mentions?: Mention[] })
```

**Order is load-bearing: sanitize first, linkify second.** `renderMarkdown` produces sanitized HTML;
that HTML is then parsed and its **text nodes** walked, replacing `@username` with
`<span class="mention" data-user-id="…">` — but only for usernames present in the `mentions` array.
Because the transform runs *after* `DOMPurify` and injects only markup we construct ourselves from a
server-supplied id, `data-user-id` does not need to be in `ALLOWED_ATTR` and no untrusted string
reaches the DOM as markup.

Walking text nodes (rather than regexing the HTML string) is what keeps the replacement from
corrupting `href` attributes or tag internals. Descendants of `<code>` and `<pre>` are **skipped** —
a mention inside a code block stays literal.

Click handling is **event delegation** on the wrapper: a click landing on `[data-user-id]` calls
`useProfileViewer().openProfile(id)`, reusing the existing overlay convention rather than attaching a
handler per mention.

### CSS work (`styles.css`)

Rendered markup lands inside layouts built for raw text:

- `.msg` / `.mine` chat bubbles: block `<p>` margins will break bubble padding. Needs
  `.msg p:first-child { margin-top: 0 }` / `:last-child { margin-bottom: 0 }`.
- `Feed.tsx`'s `clamp3`: `-webkit-line-clamp` needs a block wrapper around the rendered HTML.
- New styles for `pre`/`code`/`blockquote`/`ul` scoped to `MarkdownBody`'s wrapper class so they
  don't leak into the rest of the app.
- `.mention` — styled like the existing `linklike` utility, with `cursor: pointer`.
- GIF images need `max-width: 100%` and a `max-height` cap so a tall GIF can't blow out a thread.

`Mention[]` is present on all three models — `Entity.d.ts:26`, `Comment.d.ts:25`,
`ChatMessage.d.ts:13` — so `MarkdownBody` takes the same props on every surface.

## Configuration

The GIPHY key follows this repo's existing two-slot runtime/build split — **not** `agora-www`'s
build-arg approach. `CLAUDE.md`: *"real deployment values must never be Docker build-args; they're
`AGORA_DEMO_*` container env instead,"* because `vite build` inlines `VITE_*` into the static bundle
permanently.

- `docker-entrypoint.d/40-agora-config.sh` — `: "${AGORA_DEMO_GIPHY_API_KEY:=}"`, emitted as
  `giphyApiKey` in the `window.__AGORA__` heredoc
- `src/config.ts` — `giphyApiKey?: string` on the `Window.__AGORA__` declaration, plus
  `export const GIPHY_API_KEY: string = runtime.giphyApiKey || import.meta.env.VITE_GIPHY_API_KEY || ""`
- `.env.example` — documented in **both** the `VITE_*` and `AGORA_DEMO_*` sections
- **No `Dockerfile` ARG and no CI build arg.**

**Empty key is a clean no-op**: GIF button hidden, everything else works — the same graceful
degradation as `ADMIN_URL` and the Umami vars.

This is a client-side key, visible in the browser regardless; it is **not** in the same class as
`AGORA_UMAMI_API_KEY` (the one true server-side secret). Runtime injection means the published image
ships keyless and each deployment supplies its own.

## Analytics

Two new members on the `AnalyticsEvent` union in `src/analytics.ts` (a typo fails the build, so they
must be declared there), fired on success:

- `insert_gif` — `{ surface: "comment" | "chat" }`
- `insert_mention` — `{ target: "comment" | "entity" | "chat" }`

**The GIPHY search term must never be tracked.** It is free text, and `CLAUDE.md` mandates
"low-cardinality enums/booleans only — never IDs or free text."

Existing `post_comment` / `send_message` / `create_entity` events gain no new fields.

## Dependencies

`marked`, `dompurify`, `@types/dompurify` (dev), `@giphy/js-fetch-api`, `@giphy/react-components`,
`@giphy/js-types`. Versions matched to `agora-www`'s `package.json`. Installed with **pnpm** —
`pnpm-lock.yaml` is the single source of truth; never `npm install`.

## Error handling

- **Composer submit throws** → inline message, draft preserved, `submitting` released in `finally`.
- **GIPHY fetch fails** (bad key, offline, rate limit) → the grid renders empty; the composer stays
  fully usable. A GIPHY outage must never block posting.
- **Server rejects `gif`** → surfaced by the composer's own error path. See Risks.
- **Malicious `content`** → DOMPurify with a fixed allowlist; no `img`, no `script`, no raw HTML.

## Risks

1. **Server-side `gif` acceptance is unverified from this client.** The SDK sends it; whether the
   server persists it on comment-create and message-send has never been exercised. If it 400s or
   silently drops the field, **that is the finding** — exactly the server↔SDK contract mismatch this
   harness exists to surface (`CLAUDE.md`). It gets documented as a server bug, **not** worked around
   client-side.
2. **CSS integration is the fiddliest part**, not the SDK wiring. Rendered HTML inside chat bubbles
   and line-clamped feed cards will need iteration.
3. **`<Grid>` width inside the demo's narrower panels** may need different `columns`/`gutter` than
   `agora-www`'s layout; re-check rather than copy.
4. **Mention notifications** (`comment-mention`, `entity-mention`) fan out server-side once real
   `mentions` arrays start arriving. Already listed in `NotificationPrefs.tsx`, but this is the first
   client that will actually trigger them — expect previously-dormant paths to run for the first time.

## Verification

No tests, no linter (`CLAUDE.md`) — `pnpm build` (`tsc -b`) plus a manual click-through is the gate.
Requires a running Agora server and a seeded user; use a seeded account (e.g. `alice@seed.test`)
rather than fresh sign-up, since email verification is unavailable locally.

1. `pnpm build` passes.
2. **Comment:** post `**bold** _italic_ @<user>` + a GIF → renders correctly → **reload** → all three
   persist from the server (not just optimistically).
3. **Chat:** same, including a GIF-only message with no text. Confirm the optimistic echo *and* the
   reloaded server copy both show the GIF.
4. **New post + inline edit:** markdown and mentions work; **no GIF button**.
5. Clicking a rendered `@mention` opens the profile overlay.
6. Rendered links carry `target="_blank" rel="noopener noreferrer nofollow"`.
7. A `<script>` or `<img>` in content is stripped, not executed or fetched.
8. Blank `VITE_GIPHY_API_KEY` → GIF button gone, nothing throws.
9. Long/tall GIF doesn't blow out the thread; feed `clamp3` still clamps.
10. The recipient of a mention receives a notification.

## Follow-ups

- Port `Composer` into `SpaceView.tsx` space chat.
- Mark `2026-07-17-mentions-design.md` and its plan **Superseded by this document** (retain, don't
  delete — the reasoning stays in the record).
- Fix or annotate the `useUserMentions` import claim in that spec so it doesn't mislead later.
