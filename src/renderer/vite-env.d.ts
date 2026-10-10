import type { AtlasApi } from '../preload/index'

declare global {
  interface Window {
    atlas: AtlasApi
  }
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

export {}
