import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@agora-sdk/react-js";
import {
  SecureChatProvider,
  createWebSecureChatCrypto,
  createIndexedDBStore,
} from "@agora-sdk/secure-chat-react-js";
import * as secureReactJs from "@agora-sdk/secure-chat-react-js";
import SecureBootstrap from "./SecureBootstrap";
import { SecureStoreContext, type SecureStoreApi } from "./SecureStoreContext";
import { track } from "../analytics";
import { API_BASE_URL, PROJECT_ID } from "../config";

// `createEncryptedStore` ships in the local fork (the aliased dist) but isn't in the published npm
// types yet — same as the `VERSION` export read loosely in Shell.tsx. Pull it off the namespace and
// cast until the export lands on npm, then switch to a plain named import. Returns an EncryptedStore:
// a SecureChatStore that also exposes unlock/lock/isLocked/changePassword.
const createEncryptedStore = (secureReactJs as any).createEncryptedStore as (base: any) => any;

// Sits inside ReplykeProvider: SecureChatProvider would otherwise resolve baseUrl/socketUrl from
// @agora-sdk/core's runtime singletons (set by ReplykeProvider), but we pass them explicitly (same env
// App.tsx parses) so the /secure REST + socket always have a URL even if the singletons aren't set yet.
// crypto + store are built ONCE (stable identity) so the MLS state and IndexedDB handle survive
// re-renders. The store is wrapped in createEncryptedStore so everything persisted to IndexedDB is
// sealed at rest (AES-256-GCM under an argon2id-derived key) — LOCKED until the user unlocks with a
// password. A locked store throws StoreLockedError on every op, so nothing may touch it before unlock.
//
// Crucially, that "nothing" is the store *consumers* — NOT the provider itself: SecureChatProvider
// only builds the rest/socket/repo and registers a disconnect-on-unmount cleanup; it performs no store
// I/O and the socket doesn't auto-connect (it dials lazily when a hook joins). So we mount the provider
// as soon as we're signed in — even while locked — and instead gate the things that actually read the
// store: SecureBootstrap (register/drain) here, and the SecureChat tab in Shell. This keeps the Shell
// mounted across unlock (the provider is already its ancestor), so entering the password just flips a
// boolean — no remount, no flash, no tab bounce. unlock/lock/changePassword are surfaced via context
// for the Chat tab (SecureUnlock / SecureStorePanel). The access token is re-passed every render and
// read lazily per request, so token refresh just works.
//
// NB: this relies on the provider staying store-inert at mount. If a future SDK version makes it read
// the store eagerly (e.g. an at-mount device load), revert to gating the whole provider on `unlocked`.
export default function SecureChatGate({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth() as any;
  const crypto = useMemo(() => createWebSecureChatCrypto(), []);
  const store = useMemo(() => createEncryptedStore(createIndexedDBStore()), []);
  const [unlocked, setUnlocked] = useState(false);

  // Lock on logout: when the token clears (signOutAll), drop the in-memory key and require a fresh
  // unlock on the next sign-in. Driven by auth state so the Sign-out button needs no secure-chat code.
  useEffect(() => {
    if (!accessToken && unlocked) {
      store.lock();
      setUnlocked(false);
    }
  }, [accessToken, unlocked, store]);

  const api = useMemo<SecureStoreApi>(
    () => ({
      unlocked,
      unlock: async (password: string) => {
        await store.unlock(password); // first run mints the key; later runs unwrap it (or throw)
        track("secure_unlock");
        setUnlocked(true); // flips SecureBootstrap + the SecureChat tab on, in place — no remount
      },
      // Disk-lock + full reload: lock() only re-seals the on-disk data; the reload is what actually
      // purges plaintext already cached in provider/crypto memory for this session.
      lock: () => {
        store.lock();
        track("secure_lock");
        window.location.reload();
      },
      changePassword: (oldPassword: string, newPassword: string) =>
        store.changePassword(oldPassword, newPassword),
    }),
    [unlocked, store],
  );

  // Strip /v7 from baseUrl to get origin for secure-socket connection (SecureChatProvider appends /secure-socket/).
  const socketOrigin = useMemo(() => new URL(API_BASE_URL).origin, []);

  return (
    <SecureStoreContext.Provider value={api}>
      {accessToken ? (
        <SecureChatProvider
          crypto={crypto}
          store={store}
          projectId={PROJECT_ID}
          accessToken={accessToken}
          baseUrl={API_BASE_URL}
          socketUrl={socketOrigin}
          padding="ladder"
        >
          {/* Store consumer — only mount once unlocked so it never hits a locked store. */}
          {unlocked && <SecureBootstrap />}
          {children}
        </SecureChatProvider>
      ) : (
        children
      )}
    </SecureStoreContext.Provider>
  );
}
