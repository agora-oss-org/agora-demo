# Design: push notification device registration (A2)

**Status:** approved, ready for implementation plan
**Source:** `docs/NEW-FUNCTIONALITY.md` item A2 (server already ships this; UI-only wiring in the demo)

## Context

The server has implemented push device registration since v7.6.2 (PR #29, confirmed against
`../agora-server/docs/SDK-V7.6.2-SERVER-SPEC.md` §2): `POST`/`DELETE …/push-notifications/devices`
plus an unauthenticated VAPID public-key route. The installed SDK (`@agora-sdk/core`/`react-js`
1.8.0) exposes `usePushRegistration(adapter)` + `webPushTokenAdapter`, but nothing in this demo
calls either — confirmed by grep, zero hits.

Push *preferences* (per-event-type opt-out, `useNotificationPreferences`) are a separate, still
server-TODO item (B1, v7.8.2) — explicitly out of scope here.

**Critical implementation detail discovered while reading the adapter source**
(`node_modules/@agora-sdk/react-js/dist/esm/PushTokenAdapter.js`): `webPushTokenAdapter.
getDeviceIdentifier()` calls `await navigator.serviceWorker.ready` — it waits for a service worker
to be active but never registers one itself. This demo currently has **zero** service-worker
infrastructure, so registration would hang/fail without one. This is new territory for the app, not
just a hook-wiring task.

## Components

### 1. `public/sw.js` (new)

A minimal, hand-written service worker — not bundled by Vite, served as a static file (matches how
`public/config.js` is already served as-is). Confirmed against the server's actual push payload
shape (`apps/api/src/lib/push/provider.ts`'s `PushPayload`: `{ title, body, data?, url? }`):

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

### 2. Registration at boot (`main.tsx`)

```js
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}
```

Fire-and-forget, same spirit as the existing `loadUmami()` call. Runs once per page load
regardless of auth state (registering the worker itself requires no permission and doesn't
prompt the user — only `Notification.requestPermission()`, triggered later by the register button,
does that).

### 3. `src/Push.tsx` (new)

Calls `usePushRegistration(webPushTokenAdapter)` (both imported from `@agora-sdk/react-js`).

- **Feature detection:** if `!("serviceWorker" in navigator) || !("PushManager" in window)`, render
  "Push notifications aren't supported in this browser" and disable both buttons.
- **Permission display:** read `Notification.permission` (`"default" | "granted" | "denied"`) on
  render — informational only, not stored in state (re-read is cheap and always current).
- **Registered-status display:** driven by a `localStorage.getItem("agora_push_registered")`
  flag (`"true"` or absent), read into local component state on mount.
- **Register button:** disabled while `registering` or already registered. `onClick`:
  ```ts
  try {
    const ok = await register();
    if (ok) {
      localStorage.setItem("agora_push_registered", "true");
      setRegistered(true);
      track("push_register");
    } else {
      setError(
        Notification.permission === "denied"
          ? "Permission denied — enable notifications for this site in your browser settings."
          : "Registration failed — this browser/adapter couldn't produce a push subscription."
      );
    }
  } catch (e) {
    setError("Registration failed — see console for details.");
  }
  ```
- **Unregister button:** disabled while `unregistering` or not registered. `onClick`:
  ```ts
  try {
    await unregister();
    localStorage.removeItem("agora_push_registered");
    setRegistered(false);
    track("push_unregister");
  } catch (e) {
    setError("Unregister failed — see console for details.");
  }
  ```

### 4. `Me.tsx`

Add `"push"` to the `Sub` union and `SUBS` array (label `"🔔 Push"`), render `<Push />` for that
sub-tab — same pattern as the existing `profile`/`connections`/`follows` entries.

### 5. `analytics.ts`

Add `"push_register" | "push_unregister"` to the `AnalyticsEvent` union (no metadata — both are
zero-argument success events, nothing low-cardinality-relevant to attach). Add `PATHS.push = "/push"`
to the `PATHS` object, following the `connections`/`follows` convention (`Me.tsx`'s sub-tab switch
fires it the same way it fires the existing sub-tab page views).

## Data flow

1. User clicks **Register**. `register()` (inside the SDK hook) calls
   `adapter.requestPermission()` → browser's native permission prompt.
2. If granted, `adapter.getDeviceIdentifier({ projectId })` fetches the VAPID public key
   (unauthenticated `GET /:pid/push-notifications/vapid-public-key`), awaits
   `navigator.serviceWorker.ready` (now resolvable because of step 2's boot-time registration),
   and calls `pushManager.subscribe(...)`.
3. The hook POSTs `{ projectId, platform: "web", subscription }` to `/devices` and resolves `true`.
4. UI sets the `localStorage` flag and fires `track("push_register")`.
5. **Unregister** re-derives the same subscription (browsers return the existing subscription from
   a repeat `subscribe()` call with the same key, rather than creating a new one) and sends
   `DELETE /devices` with it; UI clears the flag and fires `track("push_unregister")`.

## Error handling

- `register()` resolving `false` (no throw) — the hook's own doc comment marks this as an
  *expected* outcome (permission denied, or the adapter can't produce an identifier e.g.
  unsupported browser). UI shows an inline message, distinguishing the two cases via
  `Notification.permission === "denied"`.
- `register()`/`unregister()` throwing (actual API failure) — caught in the UI, shown as a generic
  inline error. The hook already calls the SDK's internal `handleError` before rethrowing, so no
  duplicate console-log needed.
- Feature-unsupported browsers never reach either call — buttons are disabled at render time.

## Out of scope

- Per-type notification preferences (B1) — server doesn't implement `GET`/`PUT
  …/push-notifications/preferences` yet.
- Native/Expo push adapters — this is a web-only demo.
- Cross-account flag scoping — the `localStorage` flag isn't keyed per user/account. If a browser
  session logs out and back in as a different user without unregistering first, the flag can show
  a stale "Registered" state. Acceptable for a single-seeded-demo-user harness (per `CLAUDE.md`);
  not worth the complexity of scoping it.
- Actually receiving a real push end-to-end requires a second signed-in session (or the server) to
  trigger a push-eligible event (e.g. someone commenting on your entity, or a chat `message`) while
  this tab is backgrounded — there's no "send yourself a test push" button in this design, matching
  the demo's philosophy of exercising real server-triggered flows rather than adding synthetic
  triggers.

## Testing

No test suite in this repo (manual verification only, per `CLAUDE.md`). Verification is:
1. Load the app, confirm `navigator.serviceWorker.getRegistration()` resolves to the `/sw.js`
   registration (devtools Application tab or console).
2. Open the new Push sub-tab under Me, click Register, grant the browser permission prompt,
   confirm the status flips to "Registered" and persists across a reload.
3. Click Unregister, confirm status flips back and persists across a reload.
4. With a local Agora server, trigger a push-eligible event from a second account (e.g. comment on
   an entity owned by the registered user) while the tab is backgrounded, and confirm an OS-level
   notification appears (service worker's `push` handler fired) and clicking it opens/focuses the
   app.
5. Deny the permission prompt (or use a browser profile with notifications blocked) and confirm the
   inline "permission denied" message appears instead of a silent failure.
