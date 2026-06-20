import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@agora-sdk/react-js";
import {
  SecureChatProvider,
  createWebSecureChatCrypto,
  createIndexedDBStore,
} from "@agora-sdk/secure-chat-react-js";
import * as secureReactJs from "@agora-sdk/secure-chat-react-js";
import SecureBootstrap from "./SecureBootstrap";
import { SecureStoreContext, RETURN_TO_SECURE_TAB_KEY, type SecureStoreApi } from "./SecureStoreContext";
import { track } from "../analytics";

const PROJECT_ID = import.meta.env.VITE_PROJECT_ID;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

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
// sealed at rest (AES-256-GCM under an argon2id-derived key) — but that makes it LOCKED until the user
// unlocks with a password. The provider MUST be unlocked before it mounts (a locked store throws
// StoreLockedError on every op, so SecureBootstrap's register()/drain would fail), so we gate it:
// mount the secure stack only once `unlocked`, and surface unlock/lock/changePassword via context so
// the Chat tab (SecureUnlock / SecureStorePanel) can drive it. SecureBootstrap stays mounted inside the
// provider so Welcomes/messages drain app-wide once unlocked. The access token is re-passed every
// render and read lazily per request, so token refresh just works.
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
        // Remember to land on the Secure Chat tab after the unlock remounts the Shell (below).
        try {
          sessionStorage.setItem(RETURN_TO_SECURE_TAB_KEY, "1");
        } catch {
          /* sessionStorage unavailable (private mode quirks) — just bounce to Feed, harmless */
        }
        setUnlocked(true);
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
      {accessToken && unlocked ? (
        <SecureChatProvider
          crypto={crypto}
          store={store}
          projectId={PROJECT_ID}
          accessToken={accessToken}
          baseUrl={API_BASE_URL}
          socketUrl={socketOrigin}
          padding="ladder"
        >
          <SecureBootstrap />
          {children}
        </SecureChatProvider>
      ) : (
        children
      )}
    </SecureStoreContext.Provider>
  );
}
