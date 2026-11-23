/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** web (default) | itch | ios — see docs/DISTRIBUTION.md */
  readonly VITE_DIST_TARGET?: string;
  /** Legacy alias for VITE_DIST_TARGET=itch. */
  readonly VITE_ITCH_BUILD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** `version` from package.json, injected by vite.config.ts. */
declare const __APP_VERSION__: string;
