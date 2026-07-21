// The one place the demo knows the server's reaction enum (packages/contract REACTION_TYPES,
// validated server-side by reactionSchema — anything else is a 400). Ordered to match the enum.
// Tiny leaf module (no app imports) so any surface can render reactions without pulling in
// EntityView — same convention as ProfileViewerContext/markdown.
export const REACTIONS = [
  { type: "upvote", emoji: "⬆", label: "Upvote" },
  { type: "downvote", emoji: "⬇", label: "Downvote" },
  { type: "like", emoji: "👍", label: "Like" },
  { type: "love", emoji: "❤️", label: "Love" },
  { type: "wow", emoji: "😮", label: "Wow" },
  { type: "sad", emoji: "😢", label: "Sad" },
  { type: "angry", emoji: "😡", label: "Angry" },
  { type: "funny", emoji: "😂", label: "Funny" },
] as const;

export type ReactionMeta = (typeof REACTIONS)[number];

export const reactionEmoji = (type: string) =>
  REACTIONS.find((r) => r.type === type)?.emoji ?? type;

// The compact count row on entity cards (Feed / SpaceView / UserProfile). Always shows ⬆⬇ (they're
// the ranking signal the sort dropdown names), then only the *non-zero* other types — cards stay
// quiet instead of growing eight always-zero pills.
export function ReactionPills({ counts }: { counts: any }) {
  return (
    <>
      {REACTIONS.filter(
        (r) => r.type === "upvote" || r.type === "downvote" || (counts?.[r.type] ?? 0) > 0,
      ).map((r) => (
        <span key={r.type} className="pill" title={r.label}>
          {r.emoji} {counts?.[r.type] ?? 0}
        </span>
      ))}
    </>
  );
}
