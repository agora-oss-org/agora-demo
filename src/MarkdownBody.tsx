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
