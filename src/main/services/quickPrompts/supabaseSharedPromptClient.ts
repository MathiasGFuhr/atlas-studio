import { getAtlasSupabase } from '../supabase/atlasSupabase'
import {
  mapSharedPromptRow,
  type SharedPromptClient,
  type SharedPromptRow,
} from './sharedPromptCatalog'
import type { SupabaseConfig } from './supabaseConfig'

export function createSupabaseSharedPromptClient(_config: SupabaseConfig): SharedPromptClient {
  const supabase = getAtlasSupabase()
  if (!supabase) {
    throw new Error('O catálogo público do Atlas não está disponível.')
  }

  return {
    async ensureUser() {
      const existing = await supabase.auth.getUser()
      if (existing.data.user) return { id: existing.data.user.id }
      throw new Error('Entre com e-mail e senha para publicar prompts.')
    },

    async list() {
      const { data, error } = await supabase
        .from('shared_prompts')
        .select('*')
        .order('updated_at', { ascending: false })
      if (error) throw new Error(error.message)
      return ((data ?? []) as SharedPromptRow[]).map(mapSharedPromptRow)
    },

    async findByLocalPromptId(authorId, localPromptId) {
      const { data, error } = await supabase
        .from('shared_prompts')
        .select('*')
        .eq('author_id', authorId)
        .eq('local_prompt_id', localPromptId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data ? mapSharedPromptRow(data as SharedPromptRow) : null
    },

    async insert(row) {
      const { data, error } = await supabase.from('shared_prompts').insert(row).select().single()
      if (error || !data) throw new Error(error?.message || 'Não foi possível publicar o prompt.')
      return mapSharedPromptRow(data as SharedPromptRow)
    },

    async update(id, patch) {
      const { data, error } = await supabase
        .from('shared_prompts')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error || !data) throw new Error(error?.message || 'Não foi possível atualizar o prompt público.')
      return mapSharedPromptRow(data as SharedPromptRow)
    },

    async removeByLocalPromptId(authorId, localPromptId) {
      const { error } = await supabase
        .from('shared_prompts')
        .delete()
        .eq('author_id', authorId)
        .eq('local_prompt_id', localPromptId)
      if (error) throw new Error(error.message)
    },
  }
}
