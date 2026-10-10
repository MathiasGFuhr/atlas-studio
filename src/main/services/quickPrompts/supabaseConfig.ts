export type SupabaseConfig = {
  url: string
  anonKey: string
}

/** Catálogo de prompts públicos do Atlas. A chave é publishable e pode ir no app. */
const BUILTIN_SUPABASE_URL = 'https://pmtosnlabrmxhpuqqgan.supabase.co'
const BUILTIN_SUPABASE_ANON_KEY = 'sb_publishable_wpX2qzM8WdyIexy00vUq2Q_yqG2-Bt4'

function readViteEnv(name: string): string {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    return env?.[name]?.trim() ?? ''
  } catch {
    return ''
  }
}

function readEnv(name: string): string {
  return process.env[name]?.trim() || readViteEnv(name) || ''
}

/** URL e chave publishable embutidas. Variável de ambiente só substitui em desenvolvimento. */
export function getSupabaseConfig(): SupabaseConfig | null {
  const url = (readEnv('SUPABASE_URL') || readEnv('VITE_SUPABASE_URL') || BUILTIN_SUPABASE_URL).trim()
  const anonKey = (
    readEnv('SUPABASE_ANON_KEY') ||
    readEnv('VITE_SUPABASE_ANON_KEY') ||
    BUILTIN_SUPABASE_ANON_KEY
  ).trim()
  if (!url || !anonKey) return null
  return { url, anonKey }
}
