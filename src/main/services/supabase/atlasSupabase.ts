import fs from 'node:fs'
import path from 'node:path'
import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js'
import { getUserDataPath } from '../../paths'
import { getSupabaseConfig } from '../quickPrompts/supabaseConfig'

let client: SupabaseClient | null = null

export function getAtlasSupabase(): SupabaseClient | null {
  if (client) return client
  const config = getSupabaseConfig()
  if (!config) return null
  client = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: createFileAuthStorage(path.join(getUserDataPath(), 'supabase-account.json')),
      storageKey: 'atlas-account',
    },
  })
  return client
}

function createFileAuthStorage(filePath: string): SupportedStorage {
  const read = (): Record<string, string> => {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, string>
    } catch {
      return {}
    }
  }
  const write = (data: Record<string, string>) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(data))
  }
  return {
    getItem: (key) => read()[key] ?? null,
    setItem: (key, value) => {
      const next = read()
      next[key] = value
      write(next)
    },
    removeItem: (key) => {
      const next = read()
      delete next[key]
      write(next)
    },
  }
}
