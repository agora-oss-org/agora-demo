# Push Registration (A2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up web push notification device registration in the demo — a service worker to
receive pushes, a boot-time registration for it, and a new Me sub-tab exercising
`usePushRegistration`/`webPushTokenAdapter` end-to-end against the server's already-shipped
`/devices` routes.

**Architecture:** A hand-written `public/sw.js` (not bundled by Vite — served as a static file,
same as `public/config.js`) backs `webPushTokenAdapter`, which needs an active service worker
before it can subscribe. `main.tsx` registers it once at boot. A new `src/Push.tsx` panel wires
the SDK's `usePushRegistration` hook to Register/Unregister buttons, tracking registered-status
in `localStorage` since neither the hook nor the server expose a read-back query. It's added as a
4th sub-tab of `Me.tsx`.

**Tech Stack:** React 18 + TypeScript, Vite. No test framework in this repo — verification is
`tsc -b` (via `pnpm build`) plus manual click-through against a locally running Agora server, per
`CLAUDE.md`.

## Global Constraints

- No test suite or linter exists in this repo — do not add one. Verification = `pnpm build`
  (typecheck) + manual UI/browser check.
- Hook return values are cast `as any` throughout the codebase (the SDK's exported types are
  incomplete) — keep this style, don't fight the types.
- Analytics: `track()` is narrowed to the `AnalyticsEvent` union in `src/analytics.ts` — a
  misspelled event name fails the build. Metadata must be low-cardinality enums/booleans only,
  never IDs or free text. `push_register`/`push_unregister` need no metadata (zero-argument
  success events).
- Styling: reuse existing utility classes (`panel`, `col`, `row`, `muted`, `pill`, `pill.success`,
  `pill.danger`) from `src/styles.css` — no new CSS framework, no new stylesheet.
  `button:disabled` styling (opacity 0.5) already exists globally.
- The server's push payload shape (confirmed against
  `../agora-server/apps/api/src/lib/push/provider.ts`) is `{ title: string; body: string; data?:
  Record<string,string>; url?: string }` — the service worker's `push` handler must match this
  exactly, not a guessed shape.
- `public/sw.js` is plain browser JS (no imports, no TypeScript, no bundling) — it runs in the
  service worker global scope (`self`), not the page.
- Spec of record: `docs/superpowers/specs/2026-07-07-push-registration-design.md`.

---

### Task 1: Service worker + boot-time registration

**Files:**
- Create: `public/sw.js`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (first task).
- Produces: an active service worker at scope `/`, reachable via
  `navigator.serviceWorker.ready` — this is the precondition `webPushTokenAdapter` (used in
  Task 3) needs to succeed. Nothing else in this task is consumed by name by later tasks.

- [ ] **Step 1: Create the service worker file**

Create `public/sw.js`:

```js
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "Agora", {
      body: data.body || "",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || "/"));
});
```

- [ ] **Step 2: Register the service worker at boot**

In `src/main.tsx`, change:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { loadUmami } from "./analytics";
import "./styles.css";

// Inject the Umami tracker before render. auto-track logs the initial pageview; explicit
// events (login/logout, …) go through track() in analytics.ts.
loadUmami();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

to:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { loadUmami } from "./analytics";
import "./styles.css";

// Inject the Umami tracker before render. auto-track logs the initial pageview; explicit
// events (login/logout, …) go through track() in analytics.ts.
loadUmami();

// Register the service worker backing web push (webPushTokenAdapter awaits
// navigator.serviceWorker.ready but never registers one itself — see Push.tsx). Fire-and-forget;
// requires no permission and doesn't prompt the user (only Notification.requestPermission(),
// triggered later by the Push tab's Register button, does that).
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 3: Typecheck**

Run: `pnpm build`
Expected: exits 0.

- [ ] **Step 4: Manual verification**

With `pnpm dev` running:
1. Open the app in a browser, open devtools → Application tab → Service Workers.
2. Confirm a worker registered at `sw.js`, scope matching the site root, status "activated and is
   running".
3. Reload the page; confirm no new registration is created (same worker, no errors in console).

- [ ] **Step 5: Commit**

```bash
git add public/sw.js src/main.tsx
git commit -m "feat(push): add service worker and boot-time registration"
```

---

### Task 2: Analytics events + page-view path

**Files:**
- Modify: `src/analytics.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `AnalyticsEvent` now includes `"push_register"` and `"push_unregister"` — Task 3's
  `track("push_register")`/`track("push_unregister")` calls depend on these to typecheck.
  `PATHS.push = "/push"` — Task 3's `Me.tsx` edit depends on this to typecheck.

- [ ] **Step 1: Add the two events to the union**

In `src/analytics.ts`, change:

```ts
  // social graph (read-only lenses) — metadata: { lens: "weather"|"constellation"|"neighborhood" } or { on: boolean }
  | "social_lens_rendered" | "social_interactions_toggled" | "social_refreshed";
```

to:

```ts
  // social graph (read-only lenses) — metadata: { lens: "weather"|"constellation"|"neighborhood" } or { on: boolean }
  | "social_lens_rendered" | "social_interactions_toggled" | "social_refreshed"
  // push notifications — no metadata, zero-argument success events
  | "push_register" | "push_unregister";
```

- [ ] **Step 2: Add the page-view path**

In `src/analytics.ts`, change:

```ts
export const PATHS = {
  feed: "/feed",
  spaces: "/spaces",
  search: "/search",
  chat: "/chat",
  secure: "/secure",
  social: "/social",
  connections: "/connections",
  follows: "/follows",
  inbox: "/inbox",
  me: "/me",
  entity: "/entity",
  space: "/space",
  conversation: "/conversation",
  user: "/user",
} as const;
```

to:

```ts
export const PATHS = {
  feed: "/feed",
  spaces: "/spaces",
  search: "/search",
  chat: "/chat",
  secure: "/secure",
  social: "/social",
  connections: "/connections",
  follows: "/follows",
  push: "/push",
  inbox: "/inbox",
  me: "/me",
  entity: "/entity",
  space: "/space",
  conversation: "/conversation",
  user: "/user",
} as const;
```

- [ ] **Step 3: Typecheck**

Run: `pnpm build`
Expected: exits 0. (No call site references either addition yet — this step only confirms the
edits themselves are syntactically valid.)

- [ ] **Step 4: Commit**

```bash
git add src/analytics.ts
git commit -m "feat(analytics): add push_register/push_unregister events and push path"
```

---

### Task 3: Push registration panel + Me sub-tab

**Files:**
- Create: `src/Push.tsx`
- Modify: `src/Me.tsx`

**Interfaces:**
- Consumes: `"push_register"` / `"push_unregister"` from `AnalyticsEvent` (Task 2), `PATHS.push`
  (Task 2), the active service worker from Task 1 (runtime precondition, not a code dependency).
  From the SDK: `usePushRegistration(adapter: PushTokenAdapter): { register: () => Promise<boolean>;
  unregister: () => Promise<void>; registering: boolean; unregistering: boolean }` and
  `webPushTokenAdapter: PushTokenAdapter`, both exported from `@agora-sdk/react-js` (confirmed in
  `node_modules/@agora-sdk/react-js/dist/esm/index.d.ts` and
  `node_modules/@agora-sdk/core/dist/esm/hooks/push/usePushRegistration.d.ts`).
- Produces: nothing consumed by later tasks — this is the last task in the plan.

- [ ] **Step 1: Create `src/Push.tsx`**

```tsx
import { useState } from "react";
import { usePushRegistration, webPushTokenAdapter } from "@agora-sdk/react-js";
import { track } from "./analytics";

const STORAGE_KEY = "agora_push_registered";
const SUPPORTED =
  typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof PushManager !== "undefined";

// Web push device registration via usePushRegistration + webPushTokenAdapter (→ POST/DELETE
// /:pid/push-notifications/devices). Registration is explicit/button-triggered per the hook's own
// contract (requesting OS/browser permission should never happen silently on mount). Neither the
// hook nor the server expose a read-back query for "is this browser registered", so status is
// tracked locally via localStorage, set/cleared on successful register()/unregister().
export default function Push() {
  const { register, unregister, registering, unregistering } = usePushRegistration(webPushTokenAdapter) as any;
  const [registered, setRegistered] = useState(() => localStorage.getItem(STORAGE_KEY) === "true");
  const [error, setError] = useState<string | null>(null);

  const permission = typeof Notification !== "undefined" ? Notification.permission : "denied";

  const handleRegister = async () => {
    setError(null);
    try {
      const ok = await register();
      if (ok) {
        localStorage.setItem(STORAGE_KEY, "true");
        setRegistered(true);
        track("push_register");
      } else {
        setError(
          permission === "denied"
            ? "Permission denied — enable notifications for this site in your browser settings."
            : "Registration failed — this browser/adapter couldn't produce a push subscription."
        );
      }
    } catch {
      setError("Registration failed — see console for details.");
    }
  };

  const handleUnregister = async () => {
    setError(null);
    try {
      await unregister();
      localStorage.removeItem(STORAGE_KEY);
      setRegistered(false);
      track("push_unregister");
    } catch {
      setError("Unregister failed — see console for details.");
    }
  };

  if (!SUPPORTED) {
    return (
      <div className="panel col">
        <strong>Push notifications</strong>
        <span className="muted">Push notifications aren't supported in this browser.</span>
      </div>
    );
  }

  return (
    <div className="panel col">
      <strong>Push notifications</strong>
      <div className="row">
        <span className={`pill ${registered ? "success" : "danger"}`}>
          {registered ? "Registered" : "Not registered"}
        </span>
        <span className="muted">browser permission: {permission}</span>
      </div>
      <div className="row">
        <button disabled={registered || registering} onClick={handleRegister}>
          {registering ? "Registering…" : "Register"}
        </button>
        <button disabled={!registered || unregistering} onClick={handleUnregister}>
          {unregistering ? "Unregistering…" : "Unregister"}
        </button>
      </div>
      {error && <span className="muted">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Wire the new sub-tab into `Me.tsx`**

Change:

```tsx
import { useState } from "react";
import { trackPageView, PATHS } from "./analytics";
import Profile from "./Profile";
import Connections from "./Connections";
import Follows from "./Follows";

// The "Me" tab: the current user's own area. Profile editing is the landing sub-view; Connections
// (friend requests) is folded in here as a sub-category rather than its own top-level tab. No router,
// so it's a local sub-tab switch — mirrors how Shell swaps top-level tabs.
type Sub = "profile" | "connections" | "follows";
const SUBS: { id: Sub; label: string }[] = [
  { id: "profile", label: "✏️ Profile" },
  { id: "connections", label: "🤝 Connections" },
  { id: "follows", label: "❤️ Follows" },
];

export default function Me() {
  const [sub, setSub] = useState<Sub>("profile");

  // Each sub-view is still its own virtual page view (Shell fires /me on entering the tab, which
  // covers the default Profile sub-view; switching sub-tabs records /me ↔ /connections here).
  const select = (next: Sub) => {
    if (next === sub) return;
    setSub(next);
    trackPageView(next === "connections" ? PATHS.connections : next === "follows" ? PATHS.follows : PATHS.me);
  };

  return (
    <div className="col">
      <div className="tabs">
        {SUBS.map((s) => (
          <button key={s.id} className={sub === s.id ? "active" : ""} onClick={() => select(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      {sub === "profile" && <Profile />}
      {sub === "connections" && <Connections />}
      {sub === "follows" && <Follows />}
    </div>
  );
}
```

to:

```tsx
import { useState } from "react";
import { trackPageView, PATHS } from "./analytics";
import Profile from "./Profile";
import Connections from "./Connections";
import Follows from "./Follows";
import Push from "./Push";

// The "Me" tab: the current user's own area. Profile editing is the landing sub-view; Connections
// (friend requests) is folded in here as a sub-category rather than its own top-level tab. No router,
// so it's a local sub-tab switch — mirrors how Shell swaps top-level tabs.
type Sub = "profile" | "connections" | "follows" | "push";
const SUBS: { id: Sub; label: string }[] = [
  { id: "profile", label: "✏️ Profile" },
  { id: "connections", label: "🤝 Connections" },
  { id: "follows", label: "❤️ Follows" },
  { id: "push", label: "🔔 Push" },
];

export default function Me() {
  const [sub, setSub] = useState<Sub>("profile");

  // Each sub-view is still its own virtual page view (Shell fires /me on entering the tab, which
  // covers the default Profile sub-view; switching sub-tabs records /me ↔ /connections here).
  const select = (next: Sub) => {
    if (next === sub) return;
    setSub(next);
    trackPageView(
      next === "connections"
        ? PATHS.connections
        : next === "follows"
        ? PATHS.follows
        : next === "push"
        ? PATHS.push
        : PATHS.me
    );
  };

  return (
    <div className="col">
      <div className="tabs">
        {SUBS.map((s) => (
          <button key={s.id} className={sub === s.id ? "active" : ""} onClick={() => select(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      {sub === "profile" && <Profile />}
      {sub === "connections" && <Connections />}
      {sub === "follows" && <Follows />}
      {sub === "push" && <Push />}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm build`
Expected: exits 0. If TypeScript complains that `usePushRegistration`/`webPushTokenAdapter` aren't
exported from `@agora-sdk/react-js`'s type declarations, cast the import site instead — e.g.
`import * as sdk from "@agora-sdk/react-js"; const { register, unregister, registering,
unregistering } = (sdk as any).usePushRegistration((sdk as any).webPushTokenAdapter);` — consistent
with the codebase's existing `as any` convention for incomplete SDK types.

- [ ] **Step 4: Manual verification**

With a local Agora server (`cd ../agora-server/apps/api && npm run dev`) and this app's dev server
running (confirm Task 1's service worker is active first):
1. Sign in, open Me → 🔔 Push. Confirm it shows "Not registered" and the current browser
   permission (`default` on a fresh profile).
2. Click Register, grant the browser's permission prompt. Confirm the pill flips to "Registered"
   and stays disabled-appropriately (Register now disabled, Unregister enabled).
3. Reload the page. Confirm the tab still shows "Registered" (localStorage persisted).
4. Click Unregister. Confirm the pill flips back to "Not registered", Register re-enables.
5. Reload again. Confirm it still shows "Not registered".
6. Deny the permission prompt on a fresh browser profile (or block notifications for the site in
   browser settings) and click Register — confirm the inline "Permission denied…" message appears
   instead of a silent failure or a thrown error in the console.
7. With the Push tab re-registered, trigger a push-eligible event from a second account (e.g.
   comment on an entity owned by the registered user) while this tab is backgrounded, and confirm
   an OS-level notification appears; click it and confirm the app window opens/focuses.

- [ ] **Step 5: Commit**

```bash
git add src/Push.tsx src/Me.tsx
git commit -m "feat(push): add push registration panel to Me tab"
```

---

## Self-Review Notes

- **Spec coverage:** every component in the spec (`public/sw.js`, boot registration, `Push.tsx`,
  `Me.tsx` wiring, `analytics.ts` additions) maps to a task. Out-of-scope items from the spec
  (preferences, native adapters, cross-account flag scoping, synthetic test-push trigger) have no
  task, as intended.
- **Placeholders:** none — every step has literal code, exact file paths, and exact commands.
- **Type consistency:** `registered`/`registering`/`unregistering`/`error`/`permission` names are
  used consistently within Task 3 (the only task that defines and consumes them). `STORAGE_KEY`
  value (`"agora_push_registered"`) matches the spec exactly. `push_register`/`push_unregister`
  event names match between Task 2 (union) and Task 3 (call sites) verbatim.
