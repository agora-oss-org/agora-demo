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
