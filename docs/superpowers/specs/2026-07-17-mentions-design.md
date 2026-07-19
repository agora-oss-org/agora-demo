# @mention typeahead in composers + clickable mentions on display

> **⚠️ SUPERSEDED** by `2026-07-19-composer-markdown-gif-design.md` (spec) /
> `2026-07-19-composer-markdown-gif.md` (plan), which absorbs this work into a shared `Composer`
> that also carries Markdown and GIPHY GIFs. Retained for the reasoning, not as a work item.
>
> **Correction:** this document states that `useUserMentions` is not re-exported by
> `@agora-sdk/react-js`. That is wrong — `react-js/dist/esm/index.d.ts:2` is
> `export * from "@agora-sdk/core"`, so it is. The "first direct core import" reasoning below is moot.

**Date:** 2026-07-17
**Status:** Approved design

## Problem

The demo is a 1:1 compatibility harness for the Agora SDK, but it doesn't exercise the SDK's
**mention** surface at all. Every composer (`CreateEntity`, the comment box, the inline editor) is a
plain `<textarea>`; nothing produces a `Mention`, so the server's mention-notification path
(`entity-mention` / `comment-mention`, already listed in `NotificationPrefs.tsx`) can never fire from
this app, and `@username` text in posts/comments renders as inert plain text.

The whole stack already supports mentions — SDK hooks (`useUserMentions`, `useFetchUserSuggestions`),
the `mentions?: Mention[]` param on `createComment`/`useCreateEntity`, the `GET /users/suggestions`
route, server-side `sanitizeMentions` + notification fan-out, and a persisted `mentions` array on the
entity/comment shape. This feature wires the **client** layer the demo is missing.

## Scope

Two parts:

1. **Compose:** a `@username` typeahead in **the comment box** and **the new-post form**. (User
   mentions only — no `useSpaceMentions`/`#` this pass. The inline post *editor* stays plain-text
   compose.)
2. **Display:** linkify `@username` in **shown entity and comment bodies** — each known mention is
   clickable and opens the profile overlay.

## SDK contract (already exists)

- **`useUserMentions`** (`@agora-sdk/core`) — headless controller. Props:
  `{ content, setContent, focus, cursorPosition, isSelectionActive, trigger="@", minChars=3,
  debounceDelay=1000, validPattern="[\\w.]+" }`. Returns:
  `{ isMentionActive, loading, mentionSuggestions: User[], handleMentionClick(user), mentions:
  Mention[], addMention, resetMentions }`. It watches the word before the cursor; when it matches
  `@[\w.]+` and is at least `trigger.length + minChars` long, it debounce-calls
  `useFetchUserSuggestions` (→ `GET /:projectId/users/suggestions?query=`). `handleMentionClick`
  rewrites the `@partial` in `content` to `@username ` and appends a `Mention` to `mentions`.
- **`Mention`** = `{ type:"user"; id; foreignId?; username } | { type:"space"; id; slug }`. We only
  produce/consume the `"user"` variant.
- **Create calls accept mentions:** `createComment({ content, mentions })` (from
  `useCommentSectionData`) and `useCreateEntity`'s `createEntity({ content, mentions, … })`. The
  comment path **self-filters** `mentions` to those whose `@username` still appears in the content, so
  typed-then-deleted mentions need no client handling.
- **Persisted on read:** the server returns `mentions: [{ type:"user", id, username, foreignId? }]`
  on entities and comments (`shape.ts`), giving display a `username → id` map with no extra lookup.

### Import path note

`useUserMentions` is exported from `@agora-sdk/core`, **not** re-exported by `@agora-sdk/react-js`
(which is where the demo imports every other hook). The demo already declares `@agora-sdk/core` as a
direct dependency, so `MentionTextarea` imports the hook from `@agora-sdk/core` — the demo's first
direct core import. This is safe: pnpm dedupes to a single `@agora-sdk/core` instance and
`vite.config.ts` dedupes React + aliases both SDK packages to one dist, so the core hook shares the
same `AgoraProvider` context and React instance as the rest of the app.

## Design

### New component: `src/MentionTextarea.tsx` (compose)

A controlled textarea (parent owns `value`/`onChange`) that hides all mention mechanics.

**Props:**
```ts
interface MentionTextareaProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  analyticsTarget: "comment" | "entity"; // for the insert_mention event
}
interface MentionTextareaHandle {
  getMentions: () => any[];   // Mention[]
  reset: () => void;          // clears accumulated mentions (calls resetMentions)
}
```

**Behavior:**
- Owns a `textareaRef`; tracks `cursorPosition` (number) and `isSelectionActive` (boolean) by reading
  `selectionStart`/`selectionEnd` on `onSelect`/`onKeyUp`/`onClick`/`onChange`.
- Calls `useUserMentions({ content: value, setContent: onChange, focus: () =>
  textareaRef.current?.focus(), cursorPosition, isSelectionActive, minChars: 2 })`. `debounceDelay`
  left at the SDK default (1000ms). Cast the hook return `as any` per repo convention.
- Renders the textarea; wraps it in a `position: relative` container so the dropdown can absolutely
  position beneath the field.
- When `isMentionActive`: render a dropdown listing `mentionSuggestions` — each row an avatar (when
  `user.avatar`) + `@username` + `name`, calling `handleMentionClick(user)` on click (which also fires
  `track("insert_mention", { target: analyticsTarget })`). Show a muted "searching…" row while
  `loading` and the list is empty.
- Exposes `{ getMentions, reset }` via `forwardRef` + `useImperativeHandle` (`getMentions` returns the
  hook's `mentions`; `reset` calls `resetMentions()`).

**Wiring:**
- **Comment box** (`EntityView.tsx`, the `Comments` composer): replace the `<textarea>` with
  `<MentionTextarea ref={mentionRef} analyticsTarget="comment" …>`; in `post()`, pass
  `mentions: mentionRef.current?.getMentions()` to `createComment`; after a successful post call
  `mentionRef.current?.reset()` alongside `setText("")`.
- **New-post form** (`CreateEntity.tsx`): replace the content `<textarea>` with
  `<MentionTextarea ref={mentionRef} analyticsTarget="entity" …>`; pass
  `mentions: mentionRef.current?.getMentions()` into the `createEntity({ … })` call; `reset()` after
  success (with the existing field clears).

### New component: `src/MentionText.tsx` (display)

`<MentionText className="prewrap" content={content} mentions={mentions} />`

- Splits `content` on the `@([\w.]+)` token pattern. Builds a case-sensitive `username → mention` map
  from the `mentions` prop (`type === "user"` only).
- Renders the same container the current code uses (`<div className={className}>`), so
  `prewrap` still preserves newlines/whitespace. Text between tokens renders as plain string children
  (newlines intact). A token whose username is in the map renders as a `<span className="linklike">`
  that calls `useProfileViewer().openProfile(mention.id)`. An unknown `@token` renders as plain text.
- Empty/missing `content` renders nothing (matches current behavior).

**Wiring:** replace the two plain content renders with `MentionText`:
- Entity body: `EntityView.tsx:318` `<div className="prewrap">{entity?.content}</div>` →
  `<MentionText className="prewrap" content={entity?.content} mentions={entity?.mentions} />`.
- Comment body: `EntityView.tsx:614` `<div className="prewrap">{comment.content}</div>` →
  `<MentionText className="prewrap" content={comment.content} mentions={comment.mentions} />`.

### Analytics (`src/analytics.ts`)

Add `insert_mention` to the `AnalyticsEvent` union. Fired when a suggestion is picked, with
`{ target: "comment" | "entity" }` — low-cardinality, no ids or free text.

## Judgment calls (baked in)

- **`minChars: 2`** (suggestions after `@` + 2 chars) rather than the SDK default of 3 — more
  responsive for a demo.
- **Debounce at the SDK default (1000ms)** — avoids hammering `/users/suggestions`.
- **Dropdown under the field**, not caret-anchored — matches the demo's deliberately-plain styling.
- A `@token` with a trailing dot (usernames may contain `.`) is matched greedily by `[\w.]+`; if the
  exact match isn't in the `mentions` map it falls back to plain text. Acceptable for the harness.

## Out of scope (YAGNI)

- Space mentions (`useSpaceMentions`, `#` trigger).
- Mention typeahead in the inline entity *editor* (`updateEntity`) — compose stays plain there; its
  displayed body still linkifies via `MentionText`.
- Caret-precise dropdown positioning; keyboard arrow-key navigation of the dropdown (click-to-select
  only).

## Verification (manual, per repo convention)

1. `pnpm build` (tsc) passes.
2. In the comment box, type `@` + ≥2 chars of a seeded user (e.g. `alice`) → a suggestion dropdown
   appears; clicking a suggestion inserts `@username ` and posting the comment sends a `mentions`
   array (check the POST body / that the mentioned user gets a `comment-mention` notification).
3. Same in the new-post content field → the created entity carries the mention.
4. The posted comment/post body shows `@username` as a clickable link that opens the profile overlay
   for the right user; an unknown `@handle` stays plain text.
5. `insert_mention` fires once per picked suggestion with the correct `target`.
