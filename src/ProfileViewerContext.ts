import { createContext, useContext } from "react";

// Tiny leaf module so any component (notably AuthorTag in EntityView) can trigger the public
// profile overlay without importing UserProfile/the provider — which would create an import cycle
// (provider → UserProfile → EntityView → here). The provider supplies the real openProfile; the
// default is a no-op so AuthorTag is safe even if rendered outside a provider.
export type ProfileViewerCtx = { openProfile: (userId: string) => void };
export const ProfileViewerContext = createContext<ProfileViewerCtx>({ openProfile: () => {} });
export const useProfileViewer = () => useContext(ProfileViewerContext);
