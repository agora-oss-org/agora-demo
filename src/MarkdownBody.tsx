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
