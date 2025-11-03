declare interface ImportMetaEnv {
  readonly VITE_CHATKIT_API_URL?: string;
  readonly VITE_CHATKIT_API_DOMAIN_KEY?: string;
  readonly VITE_FACTS_API_URL?: string;
  readonly VITE_ARC_API_URL?: string;
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv;
}
