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
  hasOtherContent = false,
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
  // Some callers hold content outside this component — Chat.tsx's 📎 file picker holds attachment
  // state, CreateEntity.tsx holds a title + images — so an otherwise-empty box can still be a valid,
  // non-empty submission. The composer has no way to see that on its own — the caller must tell it.
  hasOtherContent?: boolean;
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

  // A GIF-only post (no text) is valid where GIFs are allowed; a submission with no text/gif is
  // still valid wherever the caller reports other non-empty content via hasOtherContent.
  const canSubmit = (value.trim().length > 0 || !!gif || hasOtherContent) && !busy && !submitting;

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
          // Also disabled while `submitting`: the success path clears the box, so text typed
          // during an in-flight request would be destroyed the moment the response lands.
          disabled={busy || submitting}
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
                  // handleMentionClick rewrites `content` and refocuses the textarea
                  // programmatically — none of onChange/onClick/onKeyUp fire for that, so
                  // cursorPosition/isSelectionActive would keep their stale pre-insert values and
                  // useUserMentions would keep matching a partial mention word forever, wedging
                  // the dropdown open over the action row (GIF/Post become unclickable). The new
                  // caret isn't on the DOM yet in this same handler (React hasn't committed the
                  // content update or moved focus), so defer one frame and re-sync from the real
                  // textarea once it has.
                  requestAnimationFrame(() => {
                    if (textareaRef.current) syncSelection(textareaRef.current);
                  });
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
          {/* Derived from submitLabel so the verb matches the surface — a hardcoded "Posting…"
              was wrong on Send/Save/Create. */}
          {busy || submitting ? `${submitLabel}…` : submitLabel}
        </button>
      </div>
    </div>
  );
}
