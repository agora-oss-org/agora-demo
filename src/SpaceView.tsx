import { useEffect, useState } from "react";
import {
  useSpaceList, useEntityList, useUser,
  useCheckMyMembership, useJoinSpace, useLeaveSpace,
  useFetchSpaceMembers, useApproveMember, useDeclineMember,
  useFetchSpaceConversation, ConversationProvider, useConversationContext,
  useFetchDigestConfig, useUpdateDigestConfig,
} from "@agora-sdk/react-js";
import EntityView, { fileImageSrc } from "./EntityView";
import CreateEntity from "./CreateEntity";

// A single space: shows its subspaces (with a create-subspace form) and its entries (with the
// standalone create-entity form). Recurses into subspaces via a nested <SpaceView>, so you can
// drill arbitrarily deep. List ids are keyed by space.id so each level keeps independent state.
export default function SpaceView({ space, onBack }: { space: any; onBack: () => void }) {
  const subs = useSpaceList({ listId: `subspaces-${space.id}` }) as any;
  const ents = useEntityList({ listId: `space-entities-${space.id}` }) as any;
  const { user: me } = useUser() as any;
  const checkMembership = useCheckMyMembership() as any;
  const joinSpace = useJoinSpace() as any;
  const leaveSpace = useLeaveSpace() as any;
  const fetchMembers = useFetchSpaceMembers() as any;
  const approveMember = useApproveMember() as any;
  const declineMember = useDeclineMember() as any;

  const [name, setName] = useState("");
  const [priv, setPriv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [enteredChild, setEnteredChild] = useState<any | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [membership, setMembership] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [showChat, setShowChat] = useState(false);
  const [showDigest, setShowDigest] = useState(false);

  // Visibility/membership derivation. The space owner is always treated as admin (no membership row
  // needed), so OR isOwner into the member/admin/read flags.
  const isOwner = !!(me && space.userId === me.id);
  const isPrivate = !!(space.requireJoinApproval || space.readingPermission === "members");
  const isAdmin = isOwner || !!membership?.permissions?.isAdmin || !!membership?.permissions?.isModerator;
  const isActiveMember = isOwner || membership?.status === "active";
  const isPending = membership?.status === "pending";
  // Reading a members-only space requires active membership (pending/declined don't count); posting
  // requires active membership too (and admin role when postingPermission is "admins").
  const canRead = space.readingPermission !== "members" || isActiveMember;
  const canPost = space.postingPermission === "anyone"
    ? true
    : isActiveMember && (space.postingPermission !== "admins" || isAdmin);

  const refreshSubs = () => subs.fetchSpaces?.({ parentSpaceId: space.id });
  const refreshEnts = () => ents.fetchEntities?.({}, undefined, { spaceId: space.id, limit: 20 });
  const refreshMembership = async () => {
    try {
      const m = await checkMembership({ spaceId: space.id });
      setMembership(m);
      if (isOwner || m?.permissions?.isAdmin || m?.permissions?.isModerator) {
        const res = await fetchMembers({ spaceId: space.id, status: "pending", limit: 50 });
        setRequests(res?.data ?? []);
      } else {
        setRequests([]);
      }
    } catch { /* non-members may get 403 on membership/me for some spaces; ignore */ }
  };

  useEffect(() => {
    refreshSubs();
    refreshEnts();
    refreshMembership();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space.id]);

  const createSubspace = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await subs.createSpace({ name, parentSpaceId: space.id, ...(priv ? { readingPermission: "members", requireJoinApproval: true } : {}) });
      setName("");
      setPriv(false);
      refreshSubs();
    } finally {
      setBusy(false);
    }
  };

  if (enteredChild)
    return <SpaceView space={enteredChild} onBack={() => { setEnteredChild(null); refreshSubs(); }} />;
  if (selectedEntity)
    return <EntityView entityId={selectedEntity} onBack={() => { setSelectedEntity(null); refreshEnts(); }} backLabel={`← back to 🏘️ ${space.name}`} />;
  if (creating)
    return (
      <CreateEntity
        spaceId={space.id}
        spaceName={space.name}
        onCancel={() => setCreating(false)}
        onDone={() => { setCreating(false); refreshEnts(); }}
      />
    );

  return (
    <div className="col">
      <button onClick={onBack}>← back</button>

      <div className="panel col">
        <h3 style={{ margin: 0 }}>🏘️ {space.name}</h3>
        <div className="muted">{space.description || "—"}</div>
        <div className="row" style={{ marginTop: 4 }}>
          <span className="pill">👥 {space.membersCount ?? 0}</span>
          <span className="pill">🗂 {space.childSpacesCount ?? 0} sub</span>
          <span className="pill">{isPrivate ? "🔒 private" : "🌐 public"}</span>
          {typeof space.depth === "number" && <span className="pill">depth {space.depth}</span>}
          <span className="spacer" />
          {isOwner && <span className="muted">you own this</span>}
          {!isOwner && isActiveMember && <span className="muted">member</span>}
          {!isOwner && !isActiveMember && !isPending && (
            <button className="primary" disabled={busy} onClick={async () => { setBusy(true); try { await joinSpace({ spaceId: space.id }); await refreshMembership(); } finally { setBusy(false); } }}>
              {isPrivate ? "Request to join" : "Join"}
            </button>
          )}
          {isPending && (
            <>
              <span className="muted">request pending</span>
              <button disabled={busy} onClick={async () => { await leaveSpace({ spaceId: space.id }); refreshMembership(); }}>Cancel</button>
            </>
          )}
          {!isOwner && isActiveMember && (
            <button disabled={busy} onClick={async () => { await leaveSpace({ spaceId: space.id }); refreshMembership(); }}>Leave</button>
          )}
        </div>
      </div>

      {/* Space chat — a community channel bound to this space. Members only (the server gates +
          auto-joins active space members); mounting the fetch for a non-member would 403. */}
      {isActiveMember && (
        <div className="col">
          <button onClick={() => setShowChat((s) => !s)}>💬 {showChat ? "Hide space chat" : "Space chat"}</button>
          {showChat && <SpaceChat spaceId={space.id} meId={me?.id} />}
        </div>
      )}

      {/* Join requests — admins/owner of a space that gates joining */}
      {isAdmin && (
        <div className="panel col">
          <strong>Join requests — {requests.length}</strong>
          {requests.map((r: any) => (
            <div key={r.membershipId} className="card row">
              <span>@{r.user?.username || r.user?.id?.slice(0, 8)} wants to join</span>
              <span className="spacer" />
              <button className="primary" onClick={async () => { await approveMember({ spaceId: space.id, memberId: r.user.id }); refreshMembership(); }}>Approve</button>
              <button onClick={async () => { await declineMember({ spaceId: space.id, memberId: r.user.id }); refreshMembership(); }}>Decline</button>
            </div>
          ))}
          {requests.length === 0 && <div className="muted">none</div>}
        </div>
      )}

      {/* Digest settings — admin/owner only. Per-space daily roundup: the server POSTs a signed
          space.digest of recent entries to digestWebhookUrl at digestScheduleHour (in digestTimezone). */}
      {isAdmin && (
        <div className="col">
          <button onClick={() => setShowDigest((s) => !s)}>📨 {showDigest ? "Hide digest settings" : "Digest settings"}</button>
          {showDigest && <DigestSettings spaceId={space.id} />}
        </div>
      )}

      {!canRead ? (
        <div className="panel muted">🔒 This is a private space. Request to join to view its subspaces and entries.</div>
      ) : (
      <>
      {/* Subspaces — only an admin/owner of this space may create one */}
      {isAdmin && (
        <div className="panel col">
          <strong>Create a subspace</strong>
          <div className="row">
            <input placeholder="subspace name" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="primary" disabled={busy} onClick={createSubspace}>Create subspace</button>
          </div>
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" style={{ width: "auto" }} checked={priv} onChange={(e) => setPriv(e.target.checked)} />
            <span className="muted">🔒 Private (members-only; joining requires approval)</span>
          </label>
        </div>
      )}
      <div className="muted">{subs.loading ? "Loading…" : `${subs.spaces?.length ?? 0} subspaces`}</div>
      {(subs.spaces ?? []).map((s: any) => (
        <div key={s.id} className="card" onClick={() => setEnteredChild(s)} style={{ cursor: "pointer" }}>
          <h4>🏘️ {s.name}</h4>
          <div className="muted">{s.description || "—"}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="pill">👥 {s.membersCount ?? 0}</span>
            <span className="pill">🗂 {s.childSpacesCount ?? 0} sub</span>
            <span className="pill">{(s.requireJoinApproval || s.readingPermission === "members") ? "🔒" : "🌐"}</span>
            <span className="spacer" />
            <span className="muted">enter →</span>
          </div>
        </div>
      ))}
      {subs.hasMore && <button onClick={() => subs.loadMore()}>Load more subspaces</button>}

      {/* Entries */}
      <div className="row" style={{ marginTop: 12 }}>
        <strong>Entries</strong>
        <span className="spacer" />
        {canPost && <button className="primary" onClick={() => setCreating(true)}>➕ New post here</button>}
      </div>
      <div className="muted">{ents.loading ? "Loading…" : `${ents.entities?.length ?? 0} entries`}</div>
      {(ents.entities ?? []).map((e: any) => (
        <div key={e.id} className="card" onClick={() => setSelectedEntity(e.id)} style={{ cursor: "pointer" }}>
          <h4>{e.title || "(untitled)"}</h4>
          <div className="clamp3">{e.content}</div>
          {(() => {
            const src = (e.files ?? []).map(fileImageSrc).find(Boolean);
            return src ? (
              <img src={src} alt="" style={{ marginTop: 8, maxWidth: "100%", maxHeight: 220, borderRadius: 8, border: "1px solid var(--border)" }} />
            ) : null;
          })()}
          <div className="row" style={{ marginTop: 8 }}>
            <span className="pill">⬆ {e.reactionCounts?.upvote ?? 0}</span>
            <span className="pill">⬇ {e.reactionCounts?.downvote ?? 0}</span>
            <span className="pill">💬 {e.repliesCount ?? 0}</span>
            <span className="spacer" />
            <span className="muted">open →</span>
          </div>
        </div>
      ))}
      {ents.hasMore && <button onClick={() => ents.loadMore()}>Load more entries</button>}
      </>
      )}
    </div>
  );
}

// Space chat: get-or-create the space's conversation (useFetchSpaceConversation → the server
// auto-joins the caller as a member), then drive it with the standard ConversationProvider +
// useConversationContext — the same realtime chat surface used for DMs and groups.
function SpaceChat({ spaceId, meId }: { spaceId: string; meId?: string }) {
  const { conversation, loading } = useFetchSpaceConversation({ spaceId }) as any;
  if (!conversation) return <div className="panel muted">{loading ? "Loading space chat…" : "Space chat unavailable."}</div>;
  return (
    <ConversationProvider key={conversation.id} conversationId={conversation.id}>
      <SpaceThread
        meId={meId}
        postingPermission={conversation.postingPermission}
        myRole={conversation.currentMember?.role}
      />
    </ConversationProvider>
  );
}

function SpaceThread({
  meId, postingPermission, myRole,
}: {
  meId?: string; postingPermission?: string | null; myRole?: string;
}) {
  const { messages, send, loadOlder, hasMore, mark } = useConversationContext() as any;
  const [text, setText] = useState("");
  // postingPermission "admins" → only conversation admins may post (server enforces this too).
  const canPost = postingPermission !== "admins" || myRole === "admin";

  useEffect(() => {
    const newest = messages?.[messages.length - 1];
    if (newest?.id) mark?.({ messageId: newest.id });
  }, [messages?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    await send({ content: t });
  };

  return (
    <div className="panel col" style={{ height: 360 }}>
      <strong>💬 Space chat</strong>
      {hasMore && <button onClick={() => loadOlder()}>Load older</button>}
      <div className="scroll col" style={{ flex: 1 }}>
        {[...(messages ?? [])].reverse().map((m: any) => (
          <div key={m.id} className={"msg" + (m.userId === meId ? " mine" : "")}>
            {m.content && <div className="prewrap">{m.content}</div>}
            <div className="muted">{m.userId === meId ? "you" : (m.userId?.slice(0, 8) || "system")} · {new Date(m.createdAt).toLocaleTimeString()}</div>
          </div>
        ))}
        {(messages?.length ?? 0) === 0 && <div className="muted">No messages yet — say hi to the space 👋</div>}
      </div>
      {canPost ? (
        <div className="row">
          <input placeholder="message the space…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          <button className="primary" onClick={submit}>Send</button>
        </div>
      ) : (
        <div className="muted">Only space admins can post in this channel.</div>
      )}
    </div>
  );
}

// Admin-only digest config editor (GET/PATCH /spaces/:id/digest-config — both admin-gated server-side).
// The server masks the secret on read ("••••••••"), so we never receive it back in cleartext: we only
// track whether one is SET and only send digestWebhookSecret on save when the admin types a new value
// (a blank field leaves the stored secret untouched — sending the mask would corrupt it).
const HOURS = Array.from({ length: 24 }, (_, h) => h);
// Intl.supportedValuesOf is widely available; fall back to a tiny common set if not.
const TIMEZONES: string[] = (() => {
  const sov = (Intl as any).supportedValuesOf;
  const list: string[] = typeof sov === "function" ? sov("timeZone") : ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Tokyo"];
  return list.includes("UTC") ? list : ["UTC", ...list];
})();

function DigestSettings({ spaceId }: { spaceId: string }) {
  const fetchDigestConfig = useFetchDigestConfig() as any;
  const updateDigestConfig = useUpdateDigestConfig() as any;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err" | "info"; msg: string } | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState("");
  const [hour, setHour] = useState(9);
  const [tz, setTz] = useState("UTC");
  const [secret, setSecret] = useState("");      // new secret only; blank = keep the stored one
  const [secretSet, setSecretSet] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setStatus(null);
    fetchDigestConfig({ spaceId })
      .then((cfg: any) => {
        if (!alive) return;
        setEnabled(!!cfg.digestEnabled);
        setUrl(cfg.digestWebhookUrl ?? "");
        setHour(cfg.digestScheduleHour ?? 9);
        setTz(cfg.digestTimezone ?? "UTC");
        setSecretSet(!!cfg.digestWebhookSecret);
      })
      .catch((e: any) => { if (alive) setStatus({ kind: "err", msg: `Couldn't load config: ${e?.message ?? "error"}` }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId]);

  // Client-side only, user-triggered: fill the field with a fresh random secret to copy + save.
  const generate = () => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    setSecret(Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(""));
    setStatus({ kind: "info", msg: "Generated a secret — copy it somewhere safe, then Save. It won't be shown again." });
  };

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const update: any = {
        digestEnabled: enabled,
        digestWebhookUrl: url.trim() || null,
        digestScheduleHour: hour,
        digestTimezone: tz || "UTC",
      };
      if (secret.trim()) update.digestWebhookSecret = secret.trim();
      const res = await updateDigestConfig({ spaceId, update });
      setSecretSet(!!res?.digestWebhookSecret);
      setSecret(""); // clear the input; the stored value is masked on read
      setStatus({ kind: "ok", msg: "Saved ✓" });
    } catch (e: any) {
      setStatus({ kind: "err", msg: `Save failed: ${e?.message ?? "error"}` });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="panel muted">Loading digest config…</div>;

  // Gentle nudge: digests only fire when enabled AND fully configured (server's isDue() check).
  const missing = enabled && (!url.trim() || (!secretSet && !secret.trim()));

  return (
    <div className="panel col">
      <strong>📨 Digest settings</strong>
      <div className="muted">A signed daily roundup of this space's recent entries, POSTed to your webhook at the scheduled hour.</div>

      <label className="row" style={{ gap: 6 }}>
        <input type="checkbox" style={{ width: "auto" }} checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span>Enabled</span>
      </label>

      <label className="col" style={{ gap: 4 }}>
        <span className="muted">Webhook URL</span>
        <input placeholder="https://your-receiver.example.com/agora-digest" value={url} onChange={(e) => setUrl(e.target.value)} />
      </label>

      <div className="row">
        <label className="col" style={{ gap: 4, flex: 1 }}>
          <span className="muted">Schedule hour</span>
          <select value={hour} onChange={(e) => setHour(Number(e.target.value))}>
            {HOURS.map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
            ))}
          </select>
        </label>
        <label className="col" style={{ gap: 4, flex: 2 }}>
          <span className="muted">Timezone</span>
          <select value={tz} onChange={(e) => setTz(e.target.value)}>
            {TIMEZONES.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="col" style={{ gap: 4 }}>
        <span className="muted">Webhook secret {secretSet ? "(set — leave blank to keep)" : "(none set)"}</span>
        <div className="row">
          <input type="password" autoComplete="new-password" placeholder={secretSet ? "•••••••• keep existing" : "paste or generate a secret"} value={secret} onChange={(e) => setSecret(e.target.value)} />
          <button type="button" onClick={generate} title="Generate a random secret (client-side)">🎲 Generate</button>
        </div>
        <span className="muted">Used to HMAC-sign the digest (X-Signature). Your receiver verifies with the same value.</span>
      </label>

      {missing && <div className="muted">⚠️ Won't fire until a webhook URL and secret are both set.</div>}
      {status && <div className={status.kind === "err" ? "" : "muted"} style={status.kind === "err" ? { color: "#ff6b6b" } : undefined}>{status.msg}</div>}

      <div className="row">
        <button className="primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save digest settings"}</button>
      </div>
    </div>
  );
}
