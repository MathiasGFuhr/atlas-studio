import { mapAtlasAccount, type AtlasAccount, type AtlasAuthInput, type AtlasSession } from '../../../shared/account'
import { settingsRepository } from '../../repositories/settingsRepository'
import { getAtlasSupabase } from '../supabase/atlasSupabase'

function translateAuthError(message: string): string {
  const text = message.toLowerCase()
  if (text.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (text.includes('user already registered') || text.includes('already been registered')) {
    return 'Este e-mail já tem uma conta. Entre com a senha.'
  }
  if (text.includes('password') && text.includes('at least')) {
    return 'A senha precisa ter pelo menos 6 caracteres.'
  }
  if (text.includes('unable to validate email') || text.includes('invalid email')) {
    return 'Informe um e-mail válido.'
  }
  if (text.includes('email not confirmed')) {
    return 'Não foi possível confirmar o e-mail automaticamente. Tente entrar de novo.'
  }
  return message
}

function requireClient() {
  const supabase = getAtlasSupabase()
  if (!supabase) throw new Error('O serviço de conta do Atlas não está disponível.')
  return supabase
}

function persistLocalProfile(account: AtlasAccount) {
  settingsRepository.update({
    accountName: account.name,
    accountEmail: account.email,
  })
}

export const accountService = {
  async getSession(): Promise<AtlasSession> {
    const supabase = getAtlasSupabase()
    if (!supabase) return { user: null }
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) return { user: null }
    const user = mapAtlasAccount(data.user)
    persistLocalProfile(user)
    return { user }
  },

  async signIn(input: AtlasAuthInput): Promise<AtlasSession> {
    const email = input.email.trim().toLowerCase()
    const password = input.password
    if (!email || !password) throw new Error('Informe e-mail e senha.')
    const supabase = requireClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.user) throw new Error(translateAuthError(error?.message || 'Falha ao entrar.'))
    const user = mapAtlasAccount(data.user)
    persistLocalProfile(user)
    return { user }
  },

  async signUp(input: AtlasAuthInput): Promise<AtlasSession> {
    const email = input.email.trim().toLowerCase()
    const password = input.password
    const name = input.name?.trim() || email.split('@')[0] || 'Usuário'
    if (!email || !password) throw new Error('Informe e-mail e senha.')
    if (password.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.')
    const supabase = requireClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })
    if (error) throw new Error(translateAuthError(error.message))
    if (!data.session || !data.user) {
      return this.signIn({ email, password })
    }
    const user = mapAtlasAccount(data.user)
    persistLocalProfile(user)
    return { user }
  },

  async signOut(): Promise<AtlasSession> {
    const supabase = getAtlasSupabase()
    if (supabase) await supabase.auth.signOut()
    return { user: null }
  },

  async updateProfile(name: string): Promise<AtlasSession> {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Informe um nome.')
    const supabase = requireClient()
    const { data, error } = await supabase.auth.updateUser({ data: { name: trimmed } })
    if (error || !data.user) throw new Error(error?.message || 'Não foi possível atualizar o nome.')
    const user = mapAtlasAccount(data.user)
    persistLocalProfile(user)
    return { user }
  },
}
