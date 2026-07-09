import { useEffect, useMemo, useState } from "react";
import { useNotificationPreferences, PUSH_EVENT_TYPES } from "@agora-sdk/react-js";
import type { PushEventType } from "@agora-sdk/react-js";
import { track } from "./analytics";

// Per-type push opt-out via useNotificationPreferences (→ GET/PUT /:pid/push-notifications/
// preferences). The server stores an opt-OUT set (empty = all types enabled); this UI shows opt-IN
// checkboxes, inverting only at the render/serialize boundary. Local `draft` mirrors the server's
// shape (a set of DISABLED types) so the PUT body is a direct serialization.
//
// These preferences are account-level (keyed projectId+userId), NOT per-device, and they gate push
// DELIVERY only — they have no effect on the in-app inbox in the 📥 Inbox tab. That's why this
// panel renders even when the current browser can't do web push.

// Module-level constants (never recreated per render) — same convention as Events.tsx's
// TIME_WINDOWS/SORTS and the EVENT_INCLUDE hoist.
const GROUPS: { label: string; types: PushEventType[] }[] = [
  {
    label: "Content",
    types: ["entity-comment", "comment-reply", "entity-mention", "comment-mention"],
  },
  {
    label: "Reactions & milestones",
    types: [
      "entity-upvote",
      "comment-upvote",
      "entity-reaction",
      "comment-reaction",
      "entity-reaction-milestone-specific",
      "entity-reaction-milestone-total",
      "comment-reaction-milestone-specific",
      "comment-reaction-milestone-total",
    ],
  },
  { label: "Social", types: ["new-follow", "connection-request", "connection-accepted"] },
  {
    label: "Spaces & events",
    types: ["space-membership-approved", "event-invite", "event-updated", "event-cancelled"],
  },
  { label: "Chat", types: ["message"] },
];

// Deliberately Record<string, string>, not Record<PushEventType, string>: an exact record would
// turn a future 21st server type into a build error, which would defeat the OTHER bucket below.
// Unlabelled types fall back to their raw wire name.
const LABELS: Record<string, string> = {
  "entity-comment": "Comments on my posts",
  "comment-reply": "Replies to my comments",
  "entity-mention": "Mentions of me in a post",
  "comment-mention": "Mentions of me in a comment",
  "entity-upvote": "Upvotes on my posts",
  "comment-upvote": "Upvotes on my comments",
  "entity-reaction": "Reactions to my posts",
  "comment-reaction": "Reactions to my comments",
  "entity-reaction-milestone-specific": "My post hits a milestone for one reaction",
  "entity-reaction-milestone-total": "My post hits a total-reaction milestone",
  "comment-reaction-milestone-specific": "My comment hits a milestone for one reaction",
  "comment-reaction-milestone-total": "My comment hits a total-reaction milestone",
  "new-follow": "Someone follows me",
  "connection-request": "Someone requests a connection",
  "connection-accepted": "Someone accepts my connection request",
  "space-membership-approved": "My space membership is approved",
  "event-invite": "I'm invited to an event",
  "event-updated": "An event I'm attending changes",
  "event-cancelled": "An event I'm attending is cancelled",
  message: "Direct and group chat messages",
};

// Safety valve: any push type the SDK knows about but GROUPS doesn't name still gets a checkbox,
// rather than being silently swallowed by a stale grouping table.
const GROUPED = new Set<string>(GROUPS.flatMap((g) => g.types));
const OTHER = PUSH_EVENT_TYPES.filter((t) => !GROUPED.has(t));

const sortedKey = (types: Iterable<string>) => [...types].sort().join("|");

export default function NotificationPrefs({ registered }: { registered: boolean }) {
  const { disabledTypes, error, updating, refetch, updatePreferences } =
    useNotificationPreferences() as any;

  // The set of DISABLED types the user is editing. null = not yet seeded from the server read.
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Seed ONCE, on first resolve. After that this effect is inert (the `draft === null` guard), so a
  // failed save's optimistic rollback can revert `disabledTypes` without clobbering the user's
  // in-progress edits. It also cannot re-fire into a refetch loop: it writes state at most once.
  useEffect(() => {
    if (draft === null && disabledTypes) setDraft(new Set<string>(disabledTypes));
  }, [draft, disabledTypes]);

  // Derived, never stored. On save success the optimistic patch makes disabledTypes === draft, so
  // this goes false on its own. On save failure the rollback makes them differ again, so Save
  // re-enables — the checkboxes never move, since they render from `draft`, not disabledTypes.
  const dirty = useMemo(() => {
    if (!draft || !disabledTypes) return false;
    return sortedKey(draft) !== sortedKey(disabledTypes);
  }, [draft, disabledTypes]);

  const toggle = (t: string) =>
    setDraft((prev) => {
      const next = new Set<string>(prev ?? []);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const save = async () => {
    if (!draft) return;
    setSaveError(null);
    try {
      await updatePreferences([...draft]);
      track("set_notification_prefs", {
        state:
          draft.size === 0
            ? "all-on"
            : draft.size === PUSH_EVENT_TYPES.length
            ? "all-off"
            : "partial",
      });
    } catch {
      setSaveError("Couldn't save — see console for details.");
    }
  };

  const reset = () => {
    setSaveError(null);
    setDraft(new Set<string>(disabledTypes ?? []));
  };

  // Read failed and we have nothing to show. (A save failure leaves disabledTypes populated, so it
  // falls through to the normal render with an inline saveError instead.)
  if (error && !disabledTypes) {
    return (
      <div className="panel col">
        <strong>Notification preferences</strong>
        <span className="muted">Couldn't load your preferences.</span>
        <div className="row">
          <button onClick={() => refetch()}>Retry</button>
        </div>
      </div>
    );
  }

  // Never render checkboxes before the read resolves — unchecked defaults would falsely read as
  // "all pushes are off".
  if (!draft) {
    return (
      <div className="panel col">
        <strong>Notification preferences</strong>
        <span className="muted">Loading…</span>
      </div>
    );
  }

  const row = (t: string) => (
    <label key={t} className="row" style={{ gap: 6 }}>
      <input
        type="checkbox"
        style={{ width: "auto" }}
        checked={!draft.has(t)}
        onChange={() => toggle(t)}
      />
      <span>{LABELS[t] ?? t}</span>
      <span className="muted">{t}</span>
    </label>
  );

  return (
    <div className="panel col">
      <strong>Notification preferences</strong>
      <span className="muted">
        Which pushes you receive, across all your registered devices. Unchecking a type never hides
        it from the 📥 Inbox tab — it only stops the push.
      </span>
      {!registered && (
        <span className="muted">This browser isn't registered for push, but these still apply to your other devices.</span>
      )}

      {GROUPS.map((g) => (
        <div key={g.label} className="col">
          <strong>{g.label}</strong>
          {g.types.map(row)}
          {g.label === "Chat" && (
            <span className="muted">Push-only — chat messages have no in-app Inbox entry.</span>
          )}
        </div>
      ))}

      {OTHER.length > 0 && (
        <div className="col">
          <strong>Other</strong>
          <span className="muted">Push types this build doesn't have a label for yet.</span>
          {OTHER.map(row)}
        </div>
      )}

      <div className="row">
        <button disabled={!dirty || updating} onClick={save}>
          {updating ? "Saving…" : "Save"}
        </button>
        <button disabled={!dirty || updating} onClick={reset}>
          Reset
        </button>
      </div>
      {saveError && <span className="muted">{saveError}</span>}
    </div>
  );
}
