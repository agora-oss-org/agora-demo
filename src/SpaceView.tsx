import { useEffect, useState } from "react";
import {
  useSpaceList, useEntityList, useUser,
  useCheckMyMembership, useJoinSpace, useLeaveSpace,
  useFetchSpaceMembers, useApproveMember, useDeclineMember,
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
