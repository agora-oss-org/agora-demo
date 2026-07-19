# Shared Composer (Markdown + @mentions + GIPHY) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all four plain-`<textarea>` composers with one shared `Composer` supporting Markdown authoring, `@mention` typeahead, and GIPHY GIF attachment, and render Markdown + clickable mentions + GIFs on the display side.

**Architecture:** The composer stays a plain `<textarea>` — Markdown is authored as text and rendered at display time, which keeps `content` a flat string on the wire and preserves the SDK's `useUserMentions` cursor contract. Three new modules (`Composer.tsx`, `markdown.ts` + `MarkdownBody.tsx`, `GifPicker.tsx`) are consumed by four wiring sites. GIF is scoped to comments and chat messages, the only two SDK models with a `gif` field.

**Tech Stack:** Vite + React 18 + TypeScript, `@agora-sdk/react-js`, `marked` + `dompurify`, `@giphy/react-components` + `@giphy/js-fetch-api`, pnpm.

**Spec:** `docs/superpowers/specs/2026-07-19-composer-markdown-gif-design.md`

## Global Constraints

- **pnpm only.** `pnpm-lock.yaml` is the single source of truth. Never run `npm install`.
- **No test runner, no linter.** `pnpm build` (`tsc -b` + `vite build`) is the only static gate; everything else is a manual click-through. Steps below reflect this — do **not** scaffold a test framework.
- **Hook return values are cast `as any`** throughout this codebase. Match that style; don't fight the SDK's incomplete types.
- **Analytics:** event names must be added to the `AnalyticsEvent` union in `src/analytics.ts` (a typo fails the build). Fire on success only. **Low-cardinality enums/booleans only — never IDs or free text.** The GIPHY search term must never be tracked.
- **GIF is unavailable on entity surfaces.** `Entity` has no `gif` field (verified absent from `core/dist/esm/interfaces/models/Entity.d.ts`). Only `Comment` and `ChatMessage` have it.
- **Import `useUserMentions` from `@agora-sdk/react-js`**, not `@agora-sdk/core` — `react-js/dist/esm/index.d.ts:2` is `export * from "@agora-sdk/core"`.
- **Empty GIPHY key must be a clean no-op** — GIF button hidden, nothing throws.
- **`DOMPurify` `ALLOWED_TAGS` must never include `img` or `script`.** GIFs render as separate attachment elements, never as Markdown `![](url)`.
- Requires a running Agora server (`cd ../agora-server/apps/api && npm run dev`) and a seeded account (e.g. `alice@seed.test`) — **not** a fresh sign-up, since email verification is unavailable locally.

## Deviations from the spec (approved during planning)

1. **No `@types/dompurify`.** The spec's dependency list named it; DOMPurify 3.x ships its own types and the `@types` stub is deprecated for v3. `agora-www` on `^3.4.11` does not install it. Adding it would shadow the real types.
2. **`Composer` gains a `submitOnEnter?: boolean` prop.** `Chat.tsx`'s existing composer is a single-line `<input>` where Enter sends. The spec did not address this; replacing it with a multi-line textarea would silently break that interaction. With `submitOnEnter`, Enter submits and Shift+Enter inserts a newline.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/markdown.ts` | Create | `renderMarkdown(text) → sanitized HTML` |
| `src/MarkdownBody.tsx` | Create | Display: sanitized Markdown + mention linkification + delegated profile-open |
| `src/GifPicker.tsx` | Create | GIPHY search/trending grid; `IGif → GifData` |
| `src/Composer.tsx` | Create | Shared composer: textarea + mention typeahead + GIF button |
| `src/config.ts` | Modify | `GIPHY_API_KEY` + `giphyApiKey` on `Window.__AGORA__` |
| `docker-entrypoint.d/40-agora-config.sh` | Modify | `AGORA_DEMO_GIPHY_API_KEY` → `config.js` |
| `.env.example` | Modify | Document both env slots |
| `src/styles.css` | Modify | `.md` block styles, `.mention`, GIF sizing, bubble margin resets |
| `src/analytics.ts` | Modify | `insert_gif`, `insert_mention` union members |
| `src/EntityView.tsx` | Modify | Entity body, comment body, comment composer, `EntityEditor` |
| `src/Feed.tsx` | Modify | Card body render |
| `src/Chat.tsx` | Modify | Message body render + composer |
| `src/CreateEntity.tsx` | Modify | Composer |
| `CLAUDE.md` | Modify | File/surface table + conventions |

**Task order rationale:** display-side Markdown (Task 2) lands before the composer (Task 4) because it is verifiable immediately using the *existing* textareas. Mention **linkification** (Task 5) lands *after* the composer, because nothing in the database has a populated `mentions` array until the composer can produce one — linkification is untestable before then.

---

### Task 1: Dependencies and GIPHY key configuration

**Files:**
- Modify: `package.json` (via pnpm)
- Modify: `src/config.ts:14-28` (Window declaration), and the export list
- Modify: `docker-entrypoint.d/40-agora-config.sh:11-18`, and the `config.js` heredoc
- Modify: `.env.example` (both sections)

**Interfaces:**
- Consumes: nothing
- Produces: `GIPHY_API_KEY: string` exported from `src/config.ts` (empty string when unset)

- [ ] **Step 1: Install dependencies**

```bash
pnpm add marked@^18.0.5 dompurify@^3.4.11 @giphy/js-fetch-api@^5.8.0 @giphy/react-components@^10.1.2 @giphy/js-types@^5.1.0
```

Do **not** add `@types/dompurify` — DOMPurify 3.x bundles its own types.

- [ ] **Step 2: Add `giphyApiKey` to the `Window.__AGORA__` declaration**

In `src/config.ts`, inside `interface Window { __AGORA__?: { … } }`, add after `emailRedirectTo?: string;`:

```ts
      giphyApiKey?: string;
```

- [ ] **Step 3: Export `GIPHY_API_KEY`**

In `src/config.ts`, after the `UMAMI_DEMO_ID` export, add:

```ts
// GIPHY SDK key for the composer's GIF picker. Client-side and visible in the browser — NOT a
// secret like AGORA_UMAMI_API_KEY. Runtime-injected (not a build arg) so the published image ships
// keyless and each deployment supplies its own. Empty → the GIF button is hidden and everything
// else still works.
export const GIPHY_API_KEY: string =
  runtime.giphyApiKey || import.meta.env.VITE_GIPHY_API_KEY || "";
```

- [ ] **Step 4: Add the runtime default to the nginx entrypoint**

In `docker-entrypoint.d/40-agora-config.sh`, after the `AGORA_DEMO_UMAMI_ID` default line, add:

```sh
# GIPHY key for the composer's GIF picker (client-side, not a secret). Empty → GIF button hidden.
: "${AGORA_DEMO_GIPHY_API_KEY:=}"
```

Then in the `cat > /usr/share/nginx/html/config.js` heredoc, add after the `emailRedirectTo` line:

```sh
  giphyApiKey: "${AGORA_DEMO_GIPHY_API_KEY}",
```

- [ ] **Step 5: Document both env slots**

In `.env.example`, in the `VITE_*` section near `VITE_AGORA_UMAMI_URL` (line ~38):

```sh
# GIPHY SDK key for the composer's GIF picker (client-side; get one at
# https://developers.giphy.com/dashboard/). Empty → the GIF button is hidden.
VITE_GIPHY_API_KEY=
```

And in the `AGORA_DEMO_*` section near `AGORA_DEMO_ADMIN_URL` (line ~67):

```sh
# GIPHY key read by the prod image's entrypoint at container start (see the VITE_ counterpart).
AGORA_DEMO_GIPHY_API_KEY=
```

- [ ] **Step 6: Verify the build passes**

Run: `pnpm build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 7: Verify the key resolves at runtime**

Set `VITE_GIPHY_API_KEY=test123` in `.env`, run `pnpm dev`, open http://localhost:5175, and in the browser console run:

```js
// Vite inlines this at dev-server start; confirms the fallback path works.
console.log(import.meta.env.VITE_GIPHY_API_KEY)
```

Expected: `test123`. Then blank it again in `.env`.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml src/config.ts docker-entrypoint.d/40-agora-config.sh .env.example
git commit -m "feat(config): add GIPHY key config slot + markdown/giphy deps"
```

---

### Task 2: Markdown rendering and display wiring

**Files:**
- Create: `src/markdown.ts`
- Create: `src/MarkdownBody.tsx`
- Modify: `src/styles.css`
- Modify: `src/EntityView.tsx:318` (entity body), `:614` (comment body)
- Modify: `src/Feed.tsx:59` (card body)
- Modify: `src/Chat.tsx:182` (message body)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `renderMarkdown(text: string): string` from `src/markdown.ts`
  - `MarkdownBody` default export from `src/MarkdownBody.tsx`, props `{ content: string | null | undefined; mentions?: any[]; className?: string }`. The `mentions` prop is **accepted but unused until Task 5** — declared now so call sites don't churn.

- [ ] **Step 1: Create `src/markdown.ts`**

```ts
import { marked } from "marked";
import DOMPurify from "dompurify";

// Entity/comment/message bodies are authored as Markdown and stored as PLAIN TEXT (the server sees
// an ordinary `content` string — no contract change). We render to sanitized HTML at display time.
// Ported from ../agora-www/src/components/comments/markdown.ts so both clients render identically.

marked.setOptions({ breaks: true, gfm: true });

let hooked = false;
function ensureHooks() {
  if (hooked) return;
  hooked = true;
  // Force every link to open safely in a new tab.
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer nofollow");
    }
  });
}

// `img` and `script` are deliberately absent: GIFs render as a separate attachment element, never as
// Markdown `![](url)`. That keeps the sanitizer surface small and means hostile `content` can never
// trigger a remote fetch.
const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "del", "s", "code", "pre", "blockquote",
  "a", "ul", "ol", "li", "h1", "h2", "h3", "h4", "hr", "span",
];
const ALLOWED_ATTR = ["href", "title"];

export function renderMarkdown(text: string): string {
  ensureHooks();
  const raw = marked.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(raw, { ALLOWED_TAGS, ALLOWED_ATTR });
}
```

- [ ] **Step 2: Create `src/MarkdownBody.tsx`**

```tsx
import { useMemo } from "react";
import { renderMarkdown } from "./markdown";

// Shared display component for every Markdown-authored body (entity, comment, chat message).
// Mention linkification is added in a later task; `mentions` is accepted now so call sites are
// already passing it.
export default function MarkdownBody({
  content,
  mentions,
  className,
}: {
  content: string | null | undefined;
  mentions?: any[];
  className?: string;
}) {
  const html = useMemo(() => (content ? renderMarkdown(content) : ""), [content]);
  if (!content) return null;
  return (
    <div
      className={"md" + (className ? " " + className : "")}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

`mentions` is intentionally unreferenced this task; TypeScript does not error on unused props.

- [ ] **Step 3: Add styles to `src/styles.css`**

Append:

```css
/* Rendered Markdown bodies (MarkdownBody). Scoped to .md so these never leak into the rest of the
   app, which is otherwise styled by hand-written utility classes. */
.md { overflow-wrap: anywhere; }
.md > :first-child { margin-top: 0; }
.md > :last-child { margin-bottom: 0; }
.md p { margin: 0 0 8px; }
.md ul, .md ol { margin: 0 0 8px; padding-left: 20px; }
.md li { margin: 2px 0; }
.md h1, .md h2, .md h3, .md h4 { margin: 10px 0 6px; line-height: 1.25; }
.md h1 { font-size: 19px; } .md h2 { font-size: 17px; }
.md h3 { font-size: 15px; } .md h4 { font-size: 14px; }
.md code { background: #221d2e; border-radius: 4px; padding: 1px 4px; font-size: 12px; }
.md pre { background: #221d2e; border-radius: 8px; padding: 8px 10px; overflow-x: auto; }
.md pre code { background: transparent; padding: 0; }
.md blockquote { margin: 0 0 8px; padding-left: 10px; border-left: 3px solid var(--border); color: var(--muted); }
.md a { color: var(--accent); }
.md hr { border: 0; border-top: 1px solid var(--border); margin: 10px 0; }
```

- [ ] **Step 4: Render Markdown in the entity body**

In `src/EntityView.tsx`, add to the imports at the top:

```tsx
import MarkdownBody from "./MarkdownBody";
```

Replace line 318 — the entity body, currently:

```tsx
            {/* preserve newlines/whitespace and wrap long unbroken strings so the full body shows */}
            <div className="prewrap">{entity?.content}</div>
```

with:

```tsx
            {/* Markdown-authored body → sanitized HTML (see markdown.ts). `breaks: true` preserves
                single newlines, so this keeps the old prewrap behaviour. */}
            <MarkdownBody content={entity?.content} mentions={entity?.mentions} />
```

- [ ] **Step 5: Render Markdown in the comment body**

In `src/EntityView.tsx`, replace line 614:

```tsx
          <div className="prewrap">{comment.content}</div>
```

with:

```tsx
          <MarkdownBody content={comment.content} mentions={comment.mentions} />
```

- [ ] **Step 6: Render Markdown in feed cards**

In `src/Feed.tsx`, add to the imports:

```tsx
import MarkdownBody from "./MarkdownBody";
```

Replace line 59:

```tsx
          <div className="clamp3">{e.content}</div>
```

with:

```tsx
          <MarkdownBody content={e.content} mentions={e.mentions} className="clamp3" />
```

`clamp3` uses `-webkit-line-clamp`, which needs a block container — `MarkdownBody`'s wrapper `div` is that container, so the clamp applies to the rendered markup.

- [ ] **Step 7: Render Markdown in chat messages**

In `src/Chat.tsx`, add to the imports:

```tsx
import MarkdownBody from "./MarkdownBody";
```

Replace line 182:

```tsx
            {m.content && <div className="prewrap">{m.content}</div>}
```

with:

```tsx
            <MarkdownBody content={m.content} mentions={m.mentions} />
```

`MarkdownBody` returns `null` for empty content, so the `m.content &&` guard is now redundant.

- [ ] **Step 8: Reset block margins inside chat bubbles**

Append to `src/styles.css`:

```css
/* .msg bubbles have their own padding; block children would double it. */
.msg .md > :first-child { margin-top: 0; }
.msg .md > :last-child { margin-bottom: 0; }
```

- [ ] **Step 9: Verify the build passes**

Run: `pnpm build`
Expected: exits 0.

- [ ] **Step 10: Manual verification**

With the Agora server running and signed in as a seeded account, `pnpm dev`, then:

1. Post an entity whose body is exactly:

```text
**bold** _italic_ `code` and a [link](https://example.com)
```

2. Confirm the feed card and the entity detail view render bold, italic, inline code, and a link.
3. Right-click the link → Inspect: confirm `target="_blank"` and `rel="noopener noreferrer nofollow"`.
4. Post a comment with `# heading` and a `- list` — confirm both render.
5. Post an entity body containing `<script>alert(1)</script>` and `<img src=x onerror=alert(1)>` — confirm **nothing executes** and both are stripped from the DOM.
6. Send a chat message with `**bold**` — confirm it renders and the bubble padding still looks right.
7. Confirm a long feed body still clamps to three lines.

- [ ] **Step 11: Commit**

```bash
git add src/markdown.ts src/MarkdownBody.tsx src/styles.css src/EntityView.tsx src/Feed.tsx src/Chat.tsx
git commit -m "feat(display): render entity/comment/message bodies as sanitized Markdown"
```

---

### Task 3: GIF picker

**Files:**
- Create: `src/GifPicker.tsx`

**Interfaces:**
- Consumes: `GIPHY_API_KEY` from `src/config.ts` (Task 1)
- Produces: `GifPicker` default export, props `{ onSelect: (gif: any) => void; onClose: () => void }`. `onSelect` receives a `GifData`-shaped object: `{ id, url, gifUrl, gifPreviewUrl, altText, aspectRatio }`.

- [ ] **Step 1: Create `src/GifPicker.tsx`**

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { GiphyFetch } from "@giphy/js-fetch-api";
import { Grid } from "@giphy/react-components";
import type { IGif } from "@giphy/js-types";
import { GIPHY_API_KEY } from "./config";

// Map a GIPHY result onto the SDK's GifData shape (core/interfaces/models/Comment.d.ts:5) — the
// exact object that gets persisted on Comment.gif / ChatMessage.gif.
function toGifData(gif: IGif) {
  const img = gif.images;
  const w = Number(img.original?.width) || 1;
  const h = Number(img.original?.height) || 1;
  return {
    id: String(gif.id),
    url: img.original.url,
    gifUrl: img.original.url,
    gifPreviewUrl: img.fixed_width_small?.url ?? img.preview_gif?.url ?? img.original.url,
    altText: gif.title || (gif as { alt_text?: string }).alt_text || "GIF",
    aspectRatio: `${w} / ${h}`,
  };
}

export default function GifPicker({
  onSelect,
  onClose,
}: {
  onSelect: (gif: ReturnType<typeof toGifData>) => void;
  onClose: () => void;
}) {
  const gf = useMemo(() => (GIPHY_API_KEY ? new GiphyFetch(GIPHY_API_KEY) : null), []);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [width, setWidth] = useState(320);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Debounce so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 350);
    return () => clearTimeout(t);
  }, [term]);

  // <Grid> requires an explicit pixel width, so track the container.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!gf) return null;

  // A failed fetch (bad key, offline, rate limit) just yields an empty grid — posting is never
  // blocked by a GIPHY outage.
  const fetchGifs = (offset: number) =>
    debounced ? gf.search(debounced, { offset, limit: 12 }) : gf.trending({ offset, limit: 12 });

  return (
    <div className="panel col" style={{ gap: 8 }}>
      <div className="row">
        <input
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search GIPHY…"
          style={{ flex: 1 }}
        />
        <button className="linklike" onClick={onClose}>close</button>
      </div>
      <div ref={wrapRef} className="scroll" style={{ maxHeight: 280 }}>
        <Grid
          key={debounced}
          width={width}
          columns={3}
          gutter={6}
          hideAttribution
          fetchGifs={fetchGifs}
          noLink
          onGifClick={(gif, e) => {
            e.preventDefault();
            onSelect(toGifData(gif));
          }}
        />
      </div>
      {/* GIPHY's API terms require attribution. `hideAttribution` only suppresses the per-tile
          badge, so this line is what satisfies it — it is not optional. */}
      <div className="muted" style={{ textAlign: "center", fontSize: 10, letterSpacing: 1 }}>
        POWERED BY GIPHY
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build passes**

Run: `pnpm build`
Expected: exits 0. (The component is not mounted anywhere yet — Task 4 wires it.)

- [ ] **Step 3: Commit**

```bash
git add src/GifPicker.tsx
git commit -m "feat(gif): add GIPHY picker component"
```

---

### Task 4: Shared Composer, wired to the comment box

**Files:**
- Create: `src/Composer.tsx`
- Modify: `src/analytics.ts:52-57` (union)
- Modify: `src/EntityView.tsx:653-680` (the `Comments` component's `post()` and composer markup)

**Interfaces:**
- Consumes: `GifPicker` (Task 3), `GIPHY_API_KEY` (Task 1)
- Produces: `Composer` default export with props:

```ts
{
  onSubmit: (data: { content: string; mentions: any[]; gif?: any }) => Promise<void> | void;
  initialValue?: string;
  placeholder?: string;
  submitLabel?: string;
  busy?: boolean;
  autoFocus?: boolean;
  onCancel?: () => void;
  allowGif?: boolean;          // default false
  submitOnEnter?: boolean;     // default false — Enter submits, Shift+Enter newlines
  analyticsTarget: "comment" | "entity" | "chat";
  rows?: number;
}
```

- [ ] **Step 1: Add the analytics events**

In `src/analytics.ts`, append to the `AnalyticsEvent` union — change the final line from:

```ts
  | "set_rsvp" | "withdraw_rsvp" | "add_host" | "remove_host" | "add_invite" | "remove_invite";
```

to:

```ts
  | "set_rsvp" | "withdraw_rsvp" | "add_host" | "remove_host" | "add_invite" | "remove_invite"
  // composer — metadata: insert_gif { surface: "comment"|"chat" },
  // insert_mention { target: "comment"|"entity"|"chat" }. The GIPHY search term is free text and
  // is NEVER tracked.
  | "insert_gif" | "insert_mention";
```

- [ ] **Step 2: Create `src/Composer.tsx`**

```tsx
import { lazy, Suspense, useRef, useState } from "react";
import { useUserMentions } from "@agora-sdk/react-js";
import { GIPHY_API_KEY } from "./config";
import { track } from "./analytics";

// @giphy/* is a heavy dependency graph and this repo already moved to a static prod image over page
// weight (see CLAUDE.md), so the picker is fetched on first GIF-button click, not in the initial
// bundle. This is a deliberate divergence from ../agora-www, which imports it statically.
const GifPicker = lazy(() => import("./GifPicker"));

export interface ComposerSubmit {
  content: string;
  mentions: any[];
  gif?: any;
}

// The shared composer for every authoring surface. It stays a plain <textarea> on purpose: the
// SDK's useUserMentions tracks the word before the cursor via selectionStart on a flat string, so a
// contenteditable rich-text editor would break its contract. Markdown is authored as text and
// rendered at display time by MarkdownBody.
export default function Composer({
  onSubmit,
  initialValue = "",
  placeholder = "what's on your mind?",
  submitLabel = "Post",
  busy = false,
  autoFocus = false,
  onCancel,
  allowGif = false,
  submitOnEnter = false,
  analyticsTarget,
  rows = 3,
}: {
  onSubmit: (data: ComposerSubmit) => Promise<void> | void;
  initialValue?: string;
  placeholder?: string;
  submitLabel?: string;
  busy?: boolean;
  autoFocus?: boolean;
  onCancel?: () => void;
  allowGif?: boolean;
  submitOnEnter?: boolean;
  analyticsTarget: "comment" | "entity" | "chat";
  rows?: number;
}) {
  const [value, setValue] = useState(initialValue);
  const [gif, setGif] = useState<any>(null);
  const [showGif, setShowGif] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [isSelectionActive, setIsSelectionActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // minChars/debounceDelay override the SDK defaults (3 / 1000ms), which feel unresponsive.
  const {
    isMentionActive,
    mentionSuggestions,
    handleMentionClick,
    mentions,
    resetMentions,
  } = useUserMentions({
    content: value,
    setContent: setValue,
    focus: () => textareaRef.current?.focus(),
    cursorPosition,
    isSelectionActive,
    trigger: "@",
    minChars: 1,
    debounceDelay: 300,
  }) as any;

  function syncSelection(el: HTMLTextAreaElement) {
    setCursorPosition(el.selectionStart ?? 0);
    setIsSelectionActive((el.selectionStart ?? 0) !== (el.selectionEnd ?? 0));
  }

  // A GIF-only post (no text) is valid where GIFs are allowed.
  const canSubmit = (value.trim().length > 0 || !!gif) && !busy && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({ content: value.trim(), mentions, gif: gif ?? undefined });
      setValue("");
      setGif(null);
      setShowGif(false);
      resetMentions();
    } catch (e: any) {
      // Keep the draft — losing a typed message on a failed post is worse than a stale box.
      // `response.data.error` first: the server sends a real reason there (e.g. the comment path's
      // assertCanReadEntity rejection). Falling back to e.message alone would surface a useless
      // "Request failed with status code 403" instead.
      setError(e?.response?.data?.error || e?.message || "Could not post. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const gifEnabled = allowGif && !!GIPHY_API_KEY;

  return (
    <div className="col" style={{ gap: 4 }}>
      <div style={{ position: "relative" }}>
        <textarea
          ref={textareaRef}
          rows={rows}
          value={value}
          autoFocus={autoFocus}
          disabled={busy}
          placeholder={placeholder}
          onChange={(e) => { setValue(e.target.value); syncSelection(e.target); }}
          onClick={(e) => syncSelection(e.currentTarget)}
          onKeyUp={(e) => syncSelection(e.currentTarget)}
          onKeyDown={(e) => {
            if (submitOnEnter && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
            else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submit(); }
          }}
          style={{ width: "100%" }}
        />
        {isMentionActive && mentionSuggestions?.length > 0 && (
          <div
            className="panel col"
            style={{ position: "absolute", left: 0, right: 0, top: "100%", zIndex: 20, maxHeight: 200, overflowY: "auto", gap: 0 }}
          >
            {mentionSuggestions.map((u: any) => (
              <button
                key={u.id}
                className="linklike"
                style={{ textAlign: "left", padding: "4px 6px" }}
                onClick={() => {
                  handleMentionClick(u);
                  track("insert_mention", { target: analyticsTarget });
                }}
              >
                {u.name || u.username} <span className="muted">@{u.username}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {gif && (
        <div className="row">
          <img
            src={gif.gifPreviewUrl || gif.gifUrl}
            alt={gif.altText}
            style={{ maxHeight: 120, borderRadius: 8, border: "1px solid var(--border)" }}
          />
          <button className="linklike" onClick={() => setGif(null)}>✕ remove gif</button>
        </div>
      )}

      {showGif && gifEnabled && (
        <Suspense fallback={<div className="muted">loading GIFs…</div>}>
          <GifPicker
            onSelect={(g: any) => {
              setGif(g);
              setShowGif(false);
              track("insert_gif", { surface: analyticsTarget === "chat" ? "chat" : "comment" });
            }}
            onClose={() => setShowGif(false)}
          />
        </Suspense>
      )}

      {error && <div className="error">{error}</div>}

      <div className="row">
        {gifEnabled && (
          <button onClick={() => setShowGif((s) => !s)} style={{ padding: "2px 8px", fontSize: 12 }}>GIF</button>
        )}
        <span className="muted" style={{ fontSize: 12 }}>
          **bold** _italic_ `code` · @mention · Markdown
        </span>
        <span className="spacer" />
        {onCancel && <button onClick={onCancel} disabled={busy || submitting}>Cancel</button>}
        <button className="primary" onClick={submit} disabled={!canSubmit}>
          {busy || submitting ? "Posting…" : submitLabel}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire the comment box**

In `src/EntityView.tsx`, add to the imports:

```tsx
import Composer from "./Composer";
```

In the `Comments` component (starting line 653), replace the `post` callback and its `text`/`busy`/`err` state usage. Change `post` (currently around line 667) from:

```tsx
    try { await createComment({ content: text }); track("post_comment"); setText(""); onPosted?.(); }
```

to a new handler that takes the composer payload — replace the whole `post` function with:

```tsx
  const post = async ({ content, mentions, gif }: { content: string; mentions: any[]; gif?: any }) => {
    // The SDK's comment path self-filters `mentions` to those whose @username still appears in the
    // content, so typed-then-deleted mentions need no handling here.
    await createComment({ content: content || undefined, mentions, gif });
    track("post_comment");
    onPosted?.();
  };
```

Note this handler **throws on failure** rather than catching — `Composer` owns the error UI and preserves the draft. The old inline `catch` is deleted, but its behaviour is not lost: `Composer` reads `e?.response?.data?.error` first, so the server's real rejection (e.g. the `assertCanReadEntity` "you may not have access" case) still surfaces.

Then replace the composer markup (currently lines ~715-727):

```tsx
        <textarea
          placeholder="add a comment"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") post(); }}
        />
        <div className="row">
          <span className="muted">⌘/Ctrl + Enter to post</span>
          {err && <span className="error">{err}</span>}
          <span className="spacer" />
          <button className="primary" disabled={busy} onClick={post}>Post</button>
        </div>
```

with:

```tsx
        <Composer
          onSubmit={post}
          placeholder="add a comment"
          submitLabel="Post"
          allowGif
          analyticsTarget="comment"
        />
```

Remove the now-unused `text`, `busy`, and `err` state declarations from `Comments` (the composer owns all three). Leave any other local state alone.

- [ ] **Step 4: Display the GIF on posted comments**

In `src/EntityView.tsx`, in `CommentRow`, immediately after the `MarkdownBody` line added in Task 2 (line ~614):

```tsx
          {comment.gif && (
            <img
              src={comment.gif.gifUrl}
              alt={comment.gif.altText}
              style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 8, marginTop: 4 }}
            />
          )}
```

- [ ] **Step 5: Verify the build passes**

Run: `pnpm build`
Expected: exits 0. If it fails on unused `text`/`busy`/`err`, remove those declarations.

- [ ] **Step 6: Manual verification**

Set a real `VITE_GIPHY_API_KEY` in `.env` (get one at https://developers.giphy.com/dashboard/), restart `pnpm dev`, then on an entity:

1. Type `**hi** @` plus the first letters of a seeded username → confirm the suggestion dropdown appears.
2. Click a suggestion → confirm the textarea now reads `@username ` and the dropdown closes.
3. Click **GIF** → confirm the picker loads (a network request to GIPHY on first click only, proving lazy-loading), search a term, click a GIF → confirm the preview chip appears.
4. Post → confirm the comment shows bold text, the mention, and the GIF.
5. **Reload the page** → confirm all three persist from the server. **If the GIF is missing after reload, the server is dropping `gif` on comment-create — stop and document it as a server bug; do not work around it client-side.**
6. Post a GIF with no text at all → confirm it succeeds.
7. Blank `VITE_GIPHY_API_KEY`, restart → confirm the GIF button is gone and commenting still works.

- [ ] **Step 7: Commit**

```bash
git add src/Composer.tsx src/analytics.ts src/EntityView.tsx
git commit -m "feat(composer): shared Composer with mentions + GIF, wired to comments"
```

---

### Task 5: Mention linkification on display

**Files:**
- Modify: `src/MarkdownBody.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `renderMarkdown` (Task 2), `useProfileViewer` from `src/ProfileViewerContext.ts`, and real `mentions` arrays now produced by Task 4
- Produces: no signature change — `MarkdownBody`'s existing `mentions` prop becomes functional

- [ ] **Step 1: Replace `src/MarkdownBody.tsx` with the linkifying version**

```tsx
import { useMemo } from "react";
import { renderMarkdown } from "./markdown";
import { useProfileViewer } from "./ProfileViewerContext";

// username -> userId, from the `mentions` array the server persists on Entity/Comment/ChatMessage.
// Only "user" mentions are handled; the "space" variant is out of scope.
function userMentionMap(mentions?: any[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of mentions ?? []) {
    if (m?.type === "user" && m.username && m.id) map.set(m.username, m.id);
  }
  return map;
}

// Turn @username into a clickable span — but ONLY for usernames present in the persisted mentions
// array, so arbitrary text can never mint a link.
//
// Order is load-bearing: this runs AFTER DOMPurify. Because it injects only markup we construct
// ourselves from a server-supplied id, `data-user-id` doesn't need to be in ALLOWED_ATTR and no
// untrusted string ever reaches the DOM as markup.
//
// We walk TEXT NODES rather than regexing the HTML string: a regex would happily rewrite the inside
// of an href or a tag name. Descendants of <code>/<pre> are skipped so mentions stay literal in
// code blocks.
function linkifyMentions(html: string, map: Map<string, string>): string {
  if (map.size === 0) return html;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return html;

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.parentElement?.closest("code, pre")) continue;
    if (/@[\w.]+/.test(node.data)) targets.push(node);
  }

  for (const node of targets) {
    const frag = doc.createDocumentFragment();
    const re = /@([\w.]+)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let replaced = false;
    while ((m = re.exec(node.data))) {
      const id = map.get(m[1]);
      if (!id) continue;
      if (m.index > last) frag.appendChild(doc.createTextNode(node.data.slice(last, m.index)));
      const span = doc.createElement("span");
      span.className = "mention";
      span.setAttribute("data-user-id", id);
      span.textContent = m[0];
      frag.appendChild(span);
      last = m.index + m[0].length;
      replaced = true;
    }
    if (!replaced) continue;
    if (last < node.data.length) frag.appendChild(doc.createTextNode(node.data.slice(last)));
    node.parentNode?.replaceChild(frag, node);
  }
  return root.innerHTML;
}

export default function MarkdownBody({
  content,
  mentions,
  className,
}: {
  content: string | null | undefined;
  mentions?: any[];
  className?: string;
}) {
  const { openProfile } = useProfileViewer();
  // Keyed on the mention identities rather than array identity, so a fresh-but-equal array from a
  // refetch doesn't force a re-parse.
  const mentionKey = JSON.stringify((mentions ?? []).map((m: any) => [m?.type, m?.username, m?.id]));
  const html = useMemo(
    () => (content ? linkifyMentions(renderMarkdown(content), userMentionMap(mentions)) : ""),
    [content, mentionKey], // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (!content) return null;
  return (
    <div
      className={"md" + (className ? " " + className : "")}
      // Event delegation — one handler per body rather than one per mention.
      onClick={(e) => {
        const el = (e.target as HTMLElement).closest?.("[data-user-id]");
        const id = el?.getAttribute("data-user-id");
        if (id) openProfile(id);
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

- [ ] **Step 2: Style mentions**

Append to `src/styles.css`:

```css
/* Clickable @mentions inside rendered Markdown bodies. Matches the linklike utility. */
.md .mention { color: var(--accent); cursor: pointer; }
.md .mention:hover { text-decoration: underline; text-underline-offset: 3px; }
```

- [ ] **Step 3: Verify the build passes**

Run: `pnpm build`
Expected: exits 0.

- [ ] **Step 4: Manual verification**

1. Post a comment mentioning a seeded user via the typeahead (so `mentions` is populated).
2. Confirm the `@username` renders in the accent colour, not as plain text.
3. Click it → confirm the profile overlay opens for the right user.
4. Post a comment containing `` `@someone` `` inside backticks → confirm it stays literal and is **not** clickable.
5. Post a comment containing a bare `@notarealuser` typed manually (no typeahead) → confirm it renders as plain text, since it isn't in the `mentions` array.
6. Confirm the mentioned user receives a notification in the Inbox tab (this is the first client to trigger the server's mention fan-out).

- [ ] **Step 5: Commit**

```bash
git add src/MarkdownBody.tsx src/styles.css
git commit -m "feat(display): linkify @mentions to the profile overlay"
```

---

### Task 6: Wire the chat composer

**Files:**
- Modify: `src/Chat.tsx:152-160` (`submit`), `:188-200` (composer markup)

**Interfaces:**
- Consumes: `Composer` (Task 4), `MarkdownBody` (Task 2)
- Produces: nothing new

- [ ] **Step 1: Replace the chat `submit` handler**

In `src/Chat.tsx`, replace the `submit` function (currently lines ~152-160):

```tsx
  const submit = async () => {
    if (!text.trim() && files.length === 0) return;
    const t = text.trim(); const f = files;
    setText(""); setFiles([]);
    // useSendMessage switches to a multipart upload when `files` is present; file-only is allowed.
    await send({ ...(t ? { content: t } : {}), ...(f.length ? { files: f } : {}) });
    track("send_message", { convo: convo?.type === "direct" ? "dm" : (convo?.type ?? "group"), hasFiles: f.length > 0 });
  };
```

with:

```tsx
  const submit = async ({ content, mentions, gif }: { content: string; mentions: any[]; gif?: any }) => {
    const f = files;
    setFiles([]);
    // useSendMessage switches to a multipart upload when `files` is present; file-only is allowed.
    // It carries `gif` and `mentions` over both the JSON and multipart paths.
    await send({
      ...(content ? { content } : {}),
      ...(mentions?.length ? { mentions } : {}),
      ...(gif ? { gif } : {}),
      ...(f.length ? { files: f } : {}),
    });
    track("send_message", {
      convo: convo?.type === "direct" ? "dm" : (convo?.type ?? "group"),
      hasFiles: f.length > 0,
    });
  };
```

- [ ] **Step 2: Replace the chat composer markup**

Add to the imports in `src/Chat.tsx`:

```tsx
import Composer from "./Composer";
```

Replace the composer block (currently lines ~188-200):

```tsx
        <div className="row">
          <input placeholder="message…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          <label title="attach files" style={{ cursor: "pointer", padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 8 }}>
            📎
            <input type="file" multiple style={{ display: "none" }} onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          </label>
          <button className="primary" onClick={submit}>Send</button>
        </div>
```

with:

```tsx
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            {/* submitOnEnter preserves the old single-line input's Enter-to-send; Shift+Enter now
                inserts a newline, which the old <input> couldn't do at all. */}
            <Composer
              onSubmit={submit}
              placeholder="message…"
              submitLabel="Send"
              rows={2}
              allowGif
              submitOnEnter
              analyticsTarget="chat"
            />
          </div>
          <label title="attach files" style={{ cursor: "pointer", padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 8 }}>
            📎
            <input type="file" multiple style={{ display: "none" }} onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          </label>
        </div>
```

Remove the now-unused `text` state declaration from the thread component (`Composer` owns it). Keep `files` — file attachment stays outside the composer.

- [ ] **Step 3: Display the GIF on chat messages**

In `src/Chat.tsx`, immediately after the `MarkdownBody` line added in Task 2 (line ~182):

```tsx
            {m.gif && (
              <img
                src={m.gif.gifUrl}
                alt={m.gif.altText}
                style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 8, marginTop: 4 }}
              />
            )}
```

- [ ] **Step 4: Verify the build passes**

Run: `pnpm build`
Expected: exits 0.

- [ ] **Step 5: Manual verification**

1. Open a DM. Type a message and press **Enter** → confirm it sends (not a newline).
2. Press **Shift+Enter** → confirm it inserts a newline instead of sending.
3. Send `**bold**` → confirm it renders bold in the bubble and padding still looks right.
4. Attach a GIF and send → confirm it appears in the **optimistic** bubble immediately.
5. **Reload** → confirm the GIF survives the round trip. **If it doesn't, that's a server-side `gif` handling bug on the chat path — document it, don't patch around it.**
6. Send a GIF with no text → confirm it works.
7. Send a message with a 📎 file attachment → confirm files still work alongside the new composer.
8. Open the same conversation in a second tab → confirm a GIF sent from one appears live in the other via the socket.

- [ ] **Step 6: Commit**

```bash
git add src/Chat.tsx
git commit -m "feat(chat): shared Composer with markdown, mentions, and GIFs"
```

---

### Task 7: Wire the entity composers (no GIF)

**Files:**
- Modify: `src/CreateEntity.tsx:20-75`
- Modify: `src/EntityView.tsx:338-377` (`EntityEditor`)

**Interfaces:**
- Consumes: `Composer` (Task 4)
- Produces: nothing new

`allowGif` is omitted (defaults `false`) on both — `Entity` has no `gif` field.

- [ ] **Step 1: Wire `CreateEntity`**

In `src/CreateEntity.tsx`, add to the imports:

```tsx
import Composer from "./Composer";
```

Replace the `submit` function with one that accepts the composer payload:

```tsx
  const submit = async ({ content, mentions }: { content: string; mentions: any[] }) => {
    if (!content.trim() && !title.trim() && images.length === 0) return;
    // useCreateEntity switches to a multipart request when `images.files` is present, uploading
    // each image and attaching the resulting file records to the new entity (entity.files).
    await createEntity({
      title: title || undefined,
      content: content || undefined,
      ...(mentions?.length ? { mentions } : {}),
      spaceId,
      ...(images.length ? { images: { files: images } } : {}),
    });
    track("create_entity", { hasImage: images.length > 0, inSpace: !!spaceId });
    onDone();
  };
```

The `busy`/`error` state and the surrounding `try`/`catch`/`finally` move into `Composer` — delete them from this component along with the `content` state.

**Layout note:** the existing Post button is *not* next to the textarea — it sits at the bottom (line ~81-87), below the images block. Since `Composer` owns its own submit button, replacing the textarea in place would strand the Post button above the image picker. So the form is reordered: **title → images → Composer**. Do all three edits:

1. Delete the `<textarea>` block (lines ~54-59).
2. Delete the trailing error div and button row (lines ~80-87):

```tsx
        {error && <div className="error">{error}</div>}
        <div className="row">
          <span className="spacer" />
          <button className="primary" disabled={busy} onClick={submit}>
            {busy ? "Posting…" : "Post"}
          </button>
        </div>
```

3. In their place — i.e. as the last child of the `panel col`, after the images preview block — add:

```tsx
        <Composer
          onSubmit={submit}
          placeholder="what's on your mind?"
          submitLabel="Create"
          rows={4}
          analyticsTarget="entity"
          onCancel={onCancel}
        />
```

The existing `← cancel` button at the top of the form is now redundant with `Composer`'s Cancel; leave it, since it's outside the panel and matches how other create forms in this app look.

- [ ] **Step 2: Wire `EntityEditor`**

In `src/EntityView.tsx`, replace the body of `EntityEditor` (lines ~338-377) with:

```tsx
function EntityEditor({
  entity,
  onSave,
  onCancel,
}: {
  entity: any;
  onSave: (update: { title: string | null; content: string | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState<string>(entity?.title ?? "");

  return (
    <div className="col">
      <strong>Edit entity</strong>
      <input placeholder="title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Composer
        onSubmit={async ({ content }) => {
          await onSave({ title: title.trim() || null, content: content.trim() || null });
        }}
        initialValue={entity?.content ?? ""}
        placeholder="content"
        submitLabel="Save"
        rows={6}
        analyticsTarget="entity"
        onCancel={onCancel}
      />
    </div>
  );
}
```

The `content`, `busy`, and `error` state and the `save` function are all now owned by `Composer` — delete them.

**Note:** `onSave` is called without `mentions`. The entity **update** path is not specified to carry mentions and the existing `onSave` signature takes only `{ title, content }`; changing that is out of scope. Mentions typed here still linkify on display only if they were already in the entity's persisted array.

- [ ] **Step 3: Verify the build passes**

Run: `pnpm build`
Expected: exits 0. Remove any now-unused imports (`useState` may still be needed for `title`).

- [ ] **Step 4: Manual verification**

1. Create a new post with `**bold**` and an `@mention` via typeahead → confirm both work, and confirm **no GIF button** is shown.
2. Confirm the post renders with bold text and a clickable mention.
3. Attach an image to the new post → confirm image upload still works.
4. Cancel out of the create form → confirm it returns to the feed.
5. Edit your own entity inline → confirm the composer prefills with the existing content, that Markdown renders after saving, and that **no GIF button** appears.
6. Confirm a create that the server moderates still triggers the `useModerationRefresh` re-pull ~5s later.

- [ ] **Step 5: Commit**

```bash
git add src/CreateEntity.tsx src/EntityView.tsx
git commit -m "feat(entities): shared Composer for create + inline edit"
```

---

### Task 8: Documentation

**Files:**
- Modify: `CLAUDE.md` (file/surface table + conventions)
- Modify: `docs/superpowers/specs/2026-07-17-mentions-design.md` (header)
- Modify: `docs/superpowers/plans/2026-07-17-mentions.md` (header)

**Interfaces:**
- Consumes: everything above
- Produces: nothing

- [ ] **Step 1: Mark the superseded mentions spec and plan**

At the top of **both** `docs/superpowers/specs/2026-07-17-mentions-design.md` and `docs/superpowers/plans/2026-07-17-mentions.md`, immediately under the `#` title, insert:

```markdown
> **⚠️ SUPERSEDED** by `2026-07-19-composer-markdown-gif-design.md` (spec) /
> `2026-07-19-composer-markdown-gif.md` (plan), which absorbs this work into a shared `Composer`
> that also carries Markdown and GIPHY GIFs. Retained for the reasoning, not as a work item.
>
> **Correction:** this document states that `useUserMentions` is not re-exported by
> `@agora-sdk/react-js`. That is wrong — `react-js/dist/esm/index.d.ts:2` is
> `export * from "@agora-sdk/core"`, so it is. The "first direct core import" reasoning below is moot.
```

- [ ] **Step 2: Add the new files to the `CLAUDE.md` surface table**

In `CLAUDE.md`, in the file→SDK-surface table, add these rows after the `CreateEntity.tsx` row:

```markdown
| `Composer.tsx` | `useUserMentions` (from `@agora-sdk/react-js`) | the shared authoring surface for every composer: Markdown text, `@mention` typeahead, GIPHY GIF attach. Stays a plain `<textarea>` on purpose — `useUserMentions` tracks `selectionStart` on a flat string, which a contenteditable would break |
| `MarkdownBody.tsx` / `markdown.ts` | — (display only) | renders `content` as sanitized Markdown (`marked` + `DOMPurify`, no `img`/`script`) and linkifies `@mentions` from the persisted `mentions` array to the profile overlay |
| `GifPicker.tsx` | `GifData` (SDK model type) | GIPHY search/trending grid; produces the `GifData` persisted on `Comment.gif` / `ChatMessage.gif`. Lazy-loaded; hidden when no API key |
```

- [ ] **Step 3: Add a conventions bullet**

In `CLAUDE.md`'s "Conventions to match when editing" list, append:

```markdown
- **Composers are `Composer.tsx`, bodies are `MarkdownBody.tsx`.** Don't add a bare `<textarea>` for
  new authoring surfaces. `allowGif` is only valid where the SDK model has a `gif` field — `Comment`
  and `ChatMessage` have one, **`Entity` does not**. Markdown is authored as plain text and rendered
  at display time; `content` stays a flat string on the wire, so no server contract changes.
- The GIPHY key follows the same two-slot split as every other runtime value
  (`AGORA_DEMO_GIPHY_API_KEY` at container start → `VITE_GIPHY_API_KEY` baked fallback). It's a
  client-side key, not a secret like `AGORA_UMAMI_API_KEY`, but it stays runtime-injected so the
  published image ships keyless. Empty key → GIF button hidden, everything else works.
```

- [ ] **Step 4: Verify the build still passes**

Run: `pnpm build`
Expected: exits 0 (docs-only change, but confirms nothing was disturbed).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-07-17-mentions-design.md docs/superpowers/plans/2026-07-17-mentions.md
git commit -m "docs: record shared Composer, supersede the mentions spec/plan"
```

---

## Final verification (after all tasks)

Run the spec's full manual checklist against a running server:

1. `pnpm build` passes.
2. Comment: `**bold** _italic_ @<user>` + GIF → reload → all three persist from the server.
3. Chat: same, including a GIF-only message; optimistic echo *and* reloaded copy both show the GIF.
4. New post + inline edit: Markdown and mentions work, **no GIF button**.
5. Clicking a rendered `@mention` opens the profile overlay.
6. Rendered links carry `target="_blank" rel="noopener noreferrer nofollow"`.
7. `<script>` / `<img>` in content is stripped, not executed or fetched.
8. Blank `VITE_GIPHY_API_KEY` → GIF button gone, nothing throws.
9. A tall GIF doesn't blow out a thread; feed `clamp3` still clamps.
10. The mentioned user receives a notification.

**If any server round-trip drops `gif` or `mentions`, that is the finding** — this harness exists to surface server↔SDK contract mismatches. Document it as a server bug; do not work around it client-side.

## Follow-ups (out of scope)

- Port `Composer` into `SpaceView.tsx` space chat.
- Secure chat (`secure/SecureThread.tsx`) — separate message shape, separate design problem.
- Carrying `mentions` through the entity **update** path (`EntityEditor`'s `onSave` signature).
