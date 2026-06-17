/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_PROJECT_ID: string;
  readonly VITE_DEMO_EMAIL: string;
  readonly VITE_DEMO_PASSWORD: string;
  readonly VITE_APP_VERSION: string;
  readonly VITE_AGORA_SECURE_CHAT_DEBUG: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
