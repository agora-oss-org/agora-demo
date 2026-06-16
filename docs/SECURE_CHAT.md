# Secure Chat in the demo — implementation guide + plan

How to wire **end-to-end-encrypted chat** (Agora SDK Plus' `@agora-sdk/secure-chat-*`, MLS / RFC 9420)
into this demo app, full-featured. This is the demo-side counterpart to agora-sdk-plus'
`packages/secure-chat/ROADMAP.md` and agora-server's `docs/SECURE_CHAT.md` (the canonical protocol
spec — read it first if you touch the model).

> **What "full-featured" means here.** Everything the SDK supports *today* (Phase 2), surfaced in the
> UI: device bootstrap + KeyPackage replenishment, 1:1 encrypted DMs over a **blind** server, live
> realtime + offline catch-up, fail-closed message states, **safety-number verification**, **passphrase
> backup/restore**, and **eviction recovery**. Encrypted **groups** and **multi-device** are Phase 3 in
> the SDK and explicitly out of scope (see [Limitations](#limitations)).

---

## 1. The model in one paragraph

The Agora server is a **blind MLS Delivery Service**: it stores and relays opaque base64 blobs
(KeyPackages, Welcomes, Commits, ciphertext, encrypted key-backups) and **never sees plaintext or key
material**. All crypto runs in the browser behind the `SecureChatCrypto` seam. This demo is a pure
*consumer*: it injects the real ts-mls crypto + IndexedDB persistence into `<SecureChatProvider>` and
drives the `useSecure*` hooks. The plaintext chat in `Chat.tsx` (the Replyke `ChatProvider`) is
**unrelated** — secure chat is a separate provider, a separate tab, and a separate server namespace
(`/secure`).

---

## 2. Prerequisites

1. **A running Agora server with secure chat enabled.** The same `VITE_API_BASE_URL` the demo already
   targets, with the secure-chat schema migrated and the `/secure` socket namespace live (server
   Phase 1). Sign-in is unchanged (Supabase-backed identity, Agora tokens) — secure chat reuses the
   demo's existing `useAuth()` access token.
2. **Two users you can sign in as** (two browsers / one normal + one incognito), already **connected**
   to each other — the DM picker reuses `useFetchConnections()` exactly like `Chat.tsx`. Make the
   connection in the 🤝 Connections tab first.
3. **The `@agora-sdk/secure-chat-*` packages.** Published to npm (`0.5.0`), so they install like any
   other dependency — no special wiring needed. A Vite alias to the sibling `agora-sdk-plus` workspace
   is **optional**, only for editing the SDK locally (the same local-fork mechanism `vite.config.ts`
   already uses for `@agora-sdk/core`). See [§3](#3-wire-the-packages-the-linking-question).

---

## 3. Wire the packages (the linking question)

The demo's `package.json` already lists:

```jsonc
"@agora-sdk/secure-chat-core": "^0.5.0",
"@agora-sdk/secure-chat-react-js": "^0.5.0",
```

**Do you also need `@agora-sdk/secure-chat-crypto`?** Your *code* never imports it — `react-js`
re-exports `core` (provider, hooks, all seam types) and adds `createWebSecureChatCrypto`. **But the
runtime does:** `createWebSecureChatCrypto()` reaches into `@agora-sdk/secure-chat-crypto/ts-mls`
internally, and `core` re-exports the seam types from `@agora-sdk/secure-chat-crypto`. So:

- **From the npm registry (default — the packages are published at `0.5.0`):** `crypto` is a normal
  transitive dependency of `core` + `react-js` — it installs automatically. You don't list it, and the
  rest of §3 is unnecessary.
- **From the local workspace (only if you're editing the fork):** alias resolution does **not** follow a
  linked package's own deps, so you must alias **all three packages plus the two subpaths** — including
  `crypto`, `crypto/ts-mls`, and (if you ever use the mock) `crypto/testing`.

### 3a. Build the workspace packages once

```bash
cd ../agora-sdk-plus
pnpm install
pnpm run build-all          # emits dist/esm for every package
```

Rebuild after editing the SDK; restart the demo dev server to pick up newly-present aliases (Vite
reads config at boot).

### 3b. Add the secure-chat alias to `vite.config.ts`

Mirror the existing `@agora-sdk/core` local-fork block. Add **below** the existing `sdkAlias`:

```ts
// Secure-chat SDK (agora-sdk-plus) — unpublished, so resolve from the sibling workspace's dist/esm.
// Alias the packages AND react-js's internal subpaths (crypto/ts-mls), since Vite alias resolution
// doesn't follow a linked package's own deps. OFF automatically when the sibling isn't present
// (Docker/CI build context is the demo dir only → falls back to the npm-installed packages).
const plusRoot = (p: string) =>
  fileURLToPath(new URL(`../agora-sdk-plus/packages/secure-chat/${p}`, import.meta.url));
const secureCoreEsm = plusRoot("core/dist/esm/index.js");
const useLocalSecure = existsSync(secureCoreEsm);
if (useLocalSecure) console.log("[vite] @agora-sdk/secure-chat-* → LOCAL workspace (dist/esm).");
const secureAlias: Record<string, string> = useLocalSecure
  ? {
      "@agora-sdk/secure-chat-core": secureCoreEsm,
      "@agora-sdk/secure-chat-react-js": plusRoot("react-js/dist/esm/index.js"),
      "@agora-sdk/secure-chat-crypto/ts-mls": plusRoot("crypto/dist/esm/ts-mls/index.js"),
      "@agora-sdk/secure-chat-crypto/testing": plusRoot("crypto/dist/esm/testing.js"),
      "@agora-sdk/secure-chat-crypto": plusRoot("crypto/dist/esm/index.js"),
    }
  : {};
```

Then merge it into `resolve.alias`:

```ts
resolve: {
  alias: { ...sdkAlias, ...secureAlias },
  dedupe: ["react", "react-dom", "react-redux", "@reduxjs/toolkit"],
},
```

> Confirmed against the crypto package's `exports` map: `ts-mls` resolves to `…/ts-mls/index.js` (a
> directory with an index) but `testing` resolves to `…/testing.js` (a flat file) — note the asymmetry
> above. The `exports` map is the source of truth; re-check it after a `build-all` if the layout shifts.

### 3c. (If dev pre-bundling complains) optimizeDeps

ts-mls + `@noble/*` are pure ESM. If Vite's dep optimizer chokes on the aliased ESM, either add the
packages to `optimizeDeps.include` or, more reliably for aliased-to-source packages, exclude them:

```ts
optimizeDeps: {
  // …existing include…
  exclude: ["@agora-sdk/secure-chat-core", "@agora-sdk/secure-chat-react-js", "@agora-sdk/secure-chat-crypto"],
},
```

---

## 4. Architecture in the demo

```
App.tsx
└─ ReplykeProvider                     (existing — sets baseUrl, Redux store, auth)
   └─ ChatProvider                     (existing — plaintext chat socket)
      └─ SecureChatGate                (NEW — reads useAuth token, builds crypto+store once)
         └─ SecureChatProvider         (NEW — transport + crypto + IndexedDB, padding="ladder")
            ├─ SecureBootstrap         (NEW — always-mounted: device register, handshake catch-up,
            │                            eviction recovery; renders nothing)
            └─ Shell                    (existing — gains a "🔒 Secure" tab → SecureChat screen)
```

**Why a `SecureChatGate` wrapper, not props on `App`:** the provider needs the live access token
(`useAuth().accessToken`) and a **stable** crypto + store instance. `App` is above the auth context,
so a small child component reads the token and `useMemo`s the singletons.

**Why `SecureBootstrap` is always mounted (not only on the tab):** Welcomes and messages arrive over
`/secure` in realtime. To receive a DM someone starts with you — or messages while you're on another
tab — the device must be registered and `useSecureHandshakes` must be draining the inbox app-wide, not
just when the Secure tab is open.

### Component / file map

| File | Responsibility |
|---|---|
| `src/secure/SecureChatGate.tsx` | Read token, build `createWebSecureChatCrypto()` + `createIndexedDBStore()` once, render `SecureChatProvider`. |
| `src/secure/SecureBootstrap.tsx` | `useSecureDevice` (auto-register), `useSecureHandshakes`, eviction-recovery routing. Renders `null` (or a restore modal). |
| `src/secure/SecureChat.tsx` | The tab: conversation list + `createDirectConversation`, opens a thread. |
| `src/secure/SecureThread.tsx` | `useSecureMessages` — render decrypted messages with fail-closed status, send box. |
| `src/secure/SafetyNumberModal.tsx` | `useSecureSafetyNumber` — show/compare the 60-digit number. |
| `src/secure/BackupPanel.tsx` | `useSecureBackup` — backup / restore / strength meter / `needsBackup`. |
| `src/secure/DevicePanel.tsx` | `useSecureDevice` — device id, KeyPackage count, manual replenish (`checkAndReplenish()` / `publishKeyPackages()`). |

> The Task snippets below destructure only the fields they use; the hooks expose more you may want:
> `useSecureConversations` → `hasMore` / `loadMore`; `useSecureMessages` → `refresh`; `useSecureBackup`
> → `recheckRestore()`; `useSecureSafetyNumber().safetyNumber` → `.digits` (the flat 60-digit string)
> and `.fingerprint`. Check each hook's exported type for the full return shape.

Reuse the demo's existing CSS classes (`panel col row card msg mine muted primary error dot scroll
linklike brand prewrap`). No new global styles required.

---

## 5. Implementation plan (bite-sized tasks)

Each task is independently testable. Check them off as you go.

### Task 1 — Packages build + alias

- [ ] `cd ../agora-sdk-plus && pnpm install && pnpm run build-all`.
- [ ] Verify dist subpaths: `ls packages/secure-chat/crypto/dist/esm` (note the real `ts-mls`/`testing` paths).
- [ ] Add the `secureAlias` block + `optimizeDeps` tweak to `vite.config.ts` (§3b/§3c).
- [ ] `npm run dev`; confirm the console logs `@agora-sdk/secure-chat-* → LOCAL workspace`.

### Task 2 — `SecureChatGate` + provider

- [ ] Create `src/secure/SecureChatGate.tsx`:

```tsx
import { useMemo } from "react";
import { useAuth } from "@agora-sdk/react-js";
import { SecureChatProvider } from "@agora-sdk/secure-chat-react-js";
import { createWebSecureChatCrypto, createIndexedDBStore } from "@agora-sdk/secure-chat-react-js";
import SecureBootstrap from "./SecureBootstrap";

const PROJECT_ID = import.meta.env.VITE_PROJECT_ID;

// Sits inside ReplykeProvider: SecureChatProvider resolves baseUrl/socketUrl from @agora-sdk/core's
// runtime singletons (set by ReplykeProvider). crypto + store are built ONCE (stable identity) so the
// MLS state and IndexedDB handle survive re-renders. The access token is re-passed on every render and
// read lazily per request, so token refresh just works.
export default function SecureChatGate({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth();
  const crypto = useMemo(() => createWebSecureChatCrypto(), []);
  const store = useMemo(() => createIndexedDBStore(), []);

  // Don't mount the secure stack until signed in (no token = nothing to register/drain).
  if (!accessToken) return <>{children}</>;

  return (
    <SecureChatProvider
      crypto={crypto}
      store={store}
      projectId={PROJECT_ID}
      accessToken={accessToken}
      padding="ladder"
    >
      <SecureBootstrap />
      {children}
    </SecureChatProvider>
  );
}
```

- [ ] Wire it in `App.tsx` between `ChatProvider` and `Shell`:

```tsx
<ReplykeProvider projectId={PROJECT_ID} baseUrl={API_BASE_URL}>
  <ChatProvider>
    <SecureChatGate>
      <Shell />
    </SecureChatGate>
  </ChatProvider>
</ReplykeProvider>
```

> If the secure socket doesn't connect (no `secure:*` events arrive), the core singleton socket URL
> may be unset — pass `socketUrl={API_BASE_URL}` (and/or `baseUrl={API_BASE_URL}`) explicitly on
> `SecureChatProvider`. `SecureChatProvider` also accepts `getAccessToken?: () => string | undefined`
> as an alternative to the `accessToken` prop if you'd rather resolve the token lazily yourself.

### Task 3 — `SecureBootstrap` (device + handshakes + eviction recovery)

- [ ] Create `src/secure/SecureBootstrap.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useSecureDevice, useSecureHandshakes, useSecureBackup } from "@agora-sdk/secure-chat-react-js";

// Always-mounted, headless (mostly): brings the device online and keeps the /secure inbox draining so
// Welcomes/messages arrive live and on reload. If this client was evicted/cleared but a backup exists,
// route to a passphrase prompt → restore() INSTEAD of registering a fresh, history-less identity.
export default function SecureBootstrap() {
  const { device, loading, register, keyPackagesAvailable } = useSecureDevice();
  const { needsRestore, checkingRestore, restore, restoring, error } = useSecureBackup();
  const [pass, setPass] = useState("");

  // Auto-register once, but ONLY when this isn't an evicted client with a recoverable backup.
  useEffect(() => {
    if (loading || checkingRestore) return;
    if (device || needsRestore) return;
    register().catch(() => {});
  }, [loading, checkingRestore, device, needsRestore, register]);

  // Drain the handshake inbox for the registered device (Welcomes + Commits, seq-ordered).
  useSecureHandshakes({ deviceId: device?.id });

  if (needsRestore) {
    return (
      <div className="panel col" style={{ position: "fixed", inset: "20% 30%", zIndex: 50 }}>
        <div className="brand">🔑 Restore your encrypted chats</div>
        <div className="muted">
          This browser has no local keys but a backup exists on the server. Enter your backup
          passphrase to recover your secure conversations (otherwise you'd start a fresh identity and
          lose history).
        </div>
        <input type="password" placeholder="backup passphrase" value={pass}
               onChange={(e) => setPass(e.target.value)} />
        {error ? <div className="error">{String((error as Error)?.message ?? error)}</div> : null}
        <button className="primary" disabled={restoring || !pass}
                onClick={() => restore(pass).catch(() => {})}>
          {restoring ? "Restoring…" : "Restore"}
        </button>
      </div>
    );
  }

  // Optional tiny status line; safe to return null instead.
  return (
    <div className="muted" style={{ position: "fixed", bottom: 6, right: 8, fontSize: 11 }}>
      🔒 {device ? `device ${device.id.slice(0, 8)} · ${keyPackagesAvailable ?? "…"} keypkgs` : "starting…"}
    </div>
  );
}
```

> `useSecureDevice()` returns more than this snippet destructures — also `registering`, `error`,
> `publishKeyPackages(count?)`, `refreshKeyPackageCount()`, and `checkAndReplenish()`. The last three
> back the DevicePanel's manual-replenish + KeyPackage-count UI (Task — DevicePanel).

### Task 4 — `SecureChat` tab (conversation list + start DM)

- [ ] Create `src/secure/SecureChat.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useFetchConnections, useUser } from "@agora-sdk/react-js";
import { useSecureConversations } from "@agora-sdk/secure-chat-react-js";
import SecureThread from "./SecureThread";
import BackupPanel from "./BackupPanel";

// Mirrors Chat.tsx's connection-picker pattern, but createDirectConversation runs the MLS handshake
// (claim KeyPackage → createGroup → relay Welcome) under the hood. The list comes from the blind
// server; titles fall back to ids (the demo doesn't resolve secure rosters to handles).
export default function SecureChat() {
  const { conversations, loading, createDirectConversation, refresh, error } = useSecureConversations();
  const fetchConnections = useFetchConnections() as any;
  const { user } = useUser() as any;
  const [contacts, setContacts] = useState<any[]>([]);
  const [target, setTarget] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchConnections({}).then((r: any) => setContacts(r?.data ?? [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startDm = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const convo = await createDirectConversation(target);
      await refresh();
      setActive(convo.id);
      setTarget("");
    } finally { setBusy(false); }
  };

  return (
    <div className="col" style={{ gap: 12 }}>
      <BackupPanel />
      <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
        <div className="panel col" style={{ width: 300 }}>
          <div className="brand">🔒 Secure DMs</div>
          <div className="row">
            <select value={target} onChange={(e) => setTarget(e.target.value)} style={{ flex: 1 }}>
              <option value="">{contacts.length ? "encrypt a DM with…" : "no connections yet"}</option>
              {contacts.map((c: any) => (
                <option key={c.id} value={c.connectedUser?.id}>
                  @{c.connectedUser?.username || c.connectedUser?.id?.slice(0, 8)}
                </option>
              ))}
            </select>
            <button className="primary" disabled={!target || busy} onClick={startDm}>🔐</button>
          </div>
          {error ? <div className="error">{String((error as Error)?.message ?? error)}</div> : null}
          <div className="muted">{loading ? "Loading…" : `${conversations.length} conversations`}</div>
          <div className="scroll col">
            {conversations.map((c) => (
              <div key={c.id} className={"card" + (active === c.id ? " mine" : "")}
                   style={{ cursor: "pointer", marginBottom: 6 }} onClick={() => setActive(c.id)}>
                <strong>🔒 {c.id.slice(0, 8)}</strong>
                <div className="muted">{c.type}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="spacer" style={{ flex: 1 }}>
          {active
            ? <SecureThread key={active} conversationId={active} myUserId={user?.id} />
            : <div className="panel muted">Select or start a secure DM →</div>}
        </div>
      </div>
    </div>
  );
}
```

### Task 5 — `SecureThread` (messages, fail-closed states, send)

- [ ] Create `src/secure/SecureThread.tsx`:

```tsx
import { useState } from "react";
import { useSecureMessages } from "@agora-sdk/secure-chat-react-js";
import SafetyNumberModal from "./SafetyNumberModal";

// Renders decrypted text; messages that fail decryption fail CLOSED — never raw bytes. status:
//   "ok"       → plaintext shown
//   "pending"  → buffered, ahead of our epoch (waiting for a Commit) — show a placeholder
//   "rejected" → MLS refused it (replay/gap/bad-auth/malformed) — show a "couldn't verify" marker
export default function SecureThread({ conversationId, myUserId }: { conversationId: string; myUserId?: string }) {
  const { messages, loading, hasMore, loadMore, sendMessage, error } = useSecureMessages(conversationId);
  const [text, setText] = useState("");
  const [showSafety, setShowSafety] = useState(false);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    setSending(true);
    try { await sendMessage(t); } finally { setSending(false); }
  };

  return (
    <div className="panel col" style={{ height: 480 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>🔒 {conversationId.slice(0, 8)}</strong>
        <button className="linklike" onClick={() => setShowSafety(true)} title="verify identity keys">
          🔢 safety number
        </button>
      </div>
      {showSafety && <SafetyNumberModal conversationId={conversationId} onClose={() => setShowSafety(false)} />}
      {hasMore && <button onClick={() => loadMore()}>Load older</button>}
      {error ? <div className="error">{String((error as Error)?.message ?? error)}</div> : null}
      <div className="scroll col" style={{ flex: 1 }}>
        {/* SDK returns newest-first; reverse for chronological display. */}
        {[...messages].reverse().map((m) => {
          const mine = m.model.senderDeviceId && myUserId ? false : false; // sender is a device id; see note
          return (
            <div key={m.model.id} className={"msg" + (mine ? " mine" : "")}>
              {m.status === "ok" && <div className="prewrap">{m.plaintext}</div>}
              {m.status === "pending" && <div className="muted">⏳ waiting for key update…</div>}
              {m.status === "rejected" && <div className="error">⚠️ couldn't be verified ({m.rejectedReason})</div>}
              <div className="muted">{new Date(m.model.createdAt).toLocaleTimeString()}</div>
            </div>
          );
        })}
      </div>
      <div className="row">
        <input placeholder="encrypted message…" value={text}
               onChange={(e) => setText(e.target.value)}
               onKeyDown={(e) => e.key === "Enter" && submit()} />
        <button className="primary" disabled={sending} onClick={submit}>Send 🔐</button>
      </div>
    </div>
  );
}
```

> **Note on "mine":** secure messages carry a `senderDeviceId` (a device row id), not a `userId`. To
> style your own messages, compare `m.model.senderDeviceId` to your device id from `useSecureDevice().device?.id`
> (thread it in as a prop) rather than to `userId`. The stub above always renders left-aligned; wire
> the device-id compare for sent/received styling.

### Task 6 — `SafetyNumberModal` (key verification)

- [ ] Create `src/secure/SafetyNumberModal.tsx`:

```tsx
import { useSecureSafetyNumber } from "@agora-sdk/secure-chat-react-js";

// Out-of-band verification: both people open this on their own device and confirm the 60 digits match.
// Equal numbers ⇒ you each hold the other's real identity key (the blind-but-untrusted server didn't
// swap a KeyPackage). null ⇒ not a resolvable 1:1 DM yet (e.g. peer hasn't joined).
export default function SafetyNumberModal({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const { safetyNumber, loading, error, refresh } = useSecureSafetyNumber(conversationId);
  return (
    <div className="panel col" style={{ position: "fixed", inset: "25% 30%", zIndex: 50, gap: 12 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>🔢 Safety number</strong>
        <button className="linklike" onClick={onClose}>✕</button>
      </div>
      <div className="muted">Compare these digits with your contact out-of-band. If they match, your chat is verified.</div>
      {loading && <div className="muted">Computing…</div>}
      {error ? <div className="error">{String((error as Error)?.message ?? error)}</div> : null}
      {!loading && !safetyNumber && <div className="muted">Not a verifiable DM yet (waiting for the peer to join).</div>}
      {safetyNumber && (
        <div className="card" style={{ fontFamily: "monospace", fontSize: 18, letterSpacing: 1 }}>
          {/* groups → 12 chunks of 5; render as a 3×4 grid for readability */}
          {safetyNumber.groups.map((g, i) => (
            <span key={i} style={{ display: "inline-block", width: "25%" }}>{g}</span>
          ))}
        </div>
      )}
      <button onClick={refresh}>Recompute</button>
    </div>
  );
}
```

### Task 7 — `BackupPanel` (passphrase backup / restore / strength)

- [ ] Create `src/secure/BackupPanel.tsx`:

```tsx
import { useState } from "react";
import { useSecureBackup } from "@agora-sdk/secure-chat-react-js";

// Backup seals ALL local key material (identity + every group's MLS state) under an argon2id+AEAD
// envelope and uploads the opaque blob to the blind server. needsBackup flips when a group advances
// (you should re-backup). Restore is handled at mount by SecureBootstrap (eviction recovery); this
// panel is the manual "back up now" + "re-backup needed" surface.
export default function BackupPanel() {
  const { backup, backingUp, needsBackup, lastBackupAt, error, estimateStrength } = useSecureBackup();
  const [pass, setPass] = useState("");
  const [open, setOpen] = useState(false);
  const strength = pass ? estimateStrength(pass) : null;

  return (
    <div className="panel col">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>🗝️ Encrypted backup</strong>
        <button className="linklike" onClick={() => setOpen((o) => !o)}>{open ? "hide" : "manage"}</button>
      </div>
      <div className="muted">
        {needsBackup ? "⚠️ chats changed since your last backup — back up again." : (lastBackupAt ? `last backup: ${new Date(lastBackupAt).toLocaleString()}` : "no backup yet")}
      </div>
      {open && (
        <div className="col" style={{ gap: 6 }}>
          <input type="password" placeholder="choose a strong passphrase" value={pass}
                 onChange={(e) => setPass(e.target.value)} />
          {strength && (
            <div className="muted">
              strength: {strength.label} ({strength.score}/4){strength.warning ? ` — ${strength.warning}` : ""}
            </div>
          )}
          {error ? <div className="error">{String((error as Error)?.message ?? error)}</div> : null}
          <button className="primary" disabled={backingUp || !pass}
                  onClick={() => backup(pass).then(() => setPass(""))}>
            {backingUp ? "Sealing…" : "Back up now"}
          </button>
          <div className="muted">
            Lose this passphrase and your chats are unrecoverable — the server only holds ciphertext.
          </div>
        </div>
      )}
    </div>
  );
}
```

> `estimateStrength(pass)` returns `{ score: 0–4, label: string, warning?: string }` — use `label`
> directly (shown above); `score` drives a 5-segment meter if you want a bar.

### Task 8 — Shell tab

- [ ] In `src/Shell.tsx`, add `secure` to `Tab`, `TAB_TO_PATH` (point it at `PATHS.chat` or add a new
      `PATHS.secure`), and the `TABS` array (`{ id: "secure", label: "🔒 Secure" }`), then render it:

```tsx
import SecureChat from "./secure/SecureChat";
// …
{tab === "secure" && <SecureChat />}
```

### Task 9 — Build gate

- [ ] `npm run build` (the demo's only static check is `tsc -b`) — must pass.
- [ ] Click through the manual test plan (§6).

---

## 6. Manual test plan

Two users (A, B), already connected. Use two browsers (or one + incognito).

1. **Bootstrap.** Sign in as each. The 🔒 status line shows `device …· N keypkgs` for both
   (auto-register + KeyPackage publish).
2. **Start a DM.** As A, 🔒 Secure → pick B → 🔐. A new secure conversation appears for A; B receives
   the Welcome over `/secure` and the conversation appears for B (may take a beat / a tab focus).
3. **Send + receive.** A sends "hello". B sees the decrypted plaintext live. B replies; A sees it.
4. **Server-blindness.** In devtools → Network, inspect the `messages` POST/GET: the body carries only
   base64 `ciphertext` — never the plaintext. (Same check the SDK e2e automates.)
5. **Safety number.** Both open 🔢 — the 60 digits **match**. (They're derived from both identity keys,
   sorted, so each side computes the same number.)
6. **Padding.** Send a 2-char message and a 200-char message; both ciphertexts land in size buckets
   (here 32 and 256 — two rungs of the 9-bucket ladder `[32, 64, 128, 256, 512, 1024, 2048, 4096,
   8192]`) — lengths don't track message length 1:1.
7. **Reload survives.** Refresh B. History is still readable (IndexedDB-persisted group state).
8. **Backup + eviction recovery.** As B: 🗝️ → back up with a passphrase. Then DevTools → Application →
   clear IndexedDB (or open a fresh browser) → sign in as B → the restore modal appears → enter the
   passphrase → history decrypts again. A sends a new message; restored B decrypts it.
9. **Fail-closed.** (Optional, dev-only) corrupt a stored ciphertext or replay an old one → the row
   renders "⚠️ couldn't be verified", never raw bytes.

---

## 7. Security notes (honest, for the demo)

- **Plaintext at rest in IndexedDB.** Group state + device keys persist unencrypted in IndexedDB —
  readable by any same-origin script. This is the documented Phase-2 tradeoff; the threat model is a
  *blind server*, and passphrase backup is the recovery path. Don't present the demo as hardened
  client storage.
- **Never logged/sent.** Don't `console.log` decrypted plaintext, the backup passphrase, or any key
  material. The send box clears on submit; keep it that way.
- **Fail closed.** Render `pending`/`rejected` states as shown — never fall back to displaying raw
  decrypted-but-unverified bytes.
- **Padding on by default** (`padding="ladder"`) — leave it on so the demo reflects the shipped
  default. `"none"` is for illustrating the difference only.
- **The token.** Secure chat reuses the demo's `useAuth()` access token; it's re-passed on refresh and
  read lazily per request. No separate auth.

---

## 8. Limitations (Phase 2 scope)

- **1:1 DMs only.** The SDK's `useSecureConversations` exposes `createDirectConversation`; encrypted
  **groups** (membership churn, `removeMember`) are Phase 3 — don't add a secure-group UI yet.
- **One device per user.** Multi-device / device-linking is Phase 3. Signing in as the same user in a
  second browser registers a *second* device, which the current DM flow doesn't fan out to.
- **No router.** Follow the demo's existing tab/`useState` navigation; don't introduce a router.
- **Epoch-conflict hardening pending.** The one Phase-2 item still open in the SDK roadmap is the
  `409 secure-chat/epoch-conflict` rebase-and-retry on membership commits. It's an edge case for 1:1
  DMs (no membership churn), but a concurrent-commit race could surface a transient failure until it
  lands.

---

## 9. Open decisions

1. ~~**Publish vs. keep local-only.**~~ **Resolved** — `@agora-sdk/secure-chat-*` are published to npm
   (`0.5.0`), so the demo installs them normally and the Secure tab works in Docker/CI without the
   sibling. The §3 alias is now optional (local SDK editing only).
2. **Sender attribution.** Secure messages carry `senderDeviceId`, not `userId`. For "you vs them"
   styling, thread the device id from `useSecureDevice()` into `SecureThread` (§Task 5 note). A
   nicer device→user label would need a server/SDK affordance — out of scope.
3. **Where backup lives.** This guide puts `BackupPanel` atop the Secure tab. If you'd rather it live
   under 👤 Me (next to account settings), move it — it only needs to be inside `SecureChatProvider`.
```
