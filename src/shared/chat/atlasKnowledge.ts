import { MUSIC_LIPSYNC_PATH, MUSIC_PROMPTS_PATH } from '../workspaceCapabilities'
import { foldPersonName } from './teamMessageTarget'

export type AtlasScreen = {
  id: string
  label: string
  path: string
  aliases: string[]
}

export const ATLAS_SCREENS: AtlasScreen[] = [
  { id: 'inicio', label: 'Início', path: '/', aliases: ['home', 'painel', 'dashboard'] },
  { id: 'projetos', label: 'Projetos', path: '/musica', aliases: ['musica', 'música', 'musicas'] },
  { id: 'faixas', label: 'Faixas', path: '/musica/faixas', aliases: ['cortes', 'audio', 'áudio', 'editor'] },
  { id: 'prompts', label: 'Prompts', path: MUSIC_PROMPTS_PATH, aliases: ['meus prompts'] },
  { id: 'lipsync', label: 'Lipsync', path: MUSIC_LIPSYNC_PATH, aliases: ['referencias', 'referências'] },
  { id: 'canais', label: 'Canais', path: '/canais', aliases: ['channels'] },
  { id: 'agenda', label: 'Agenda', path: '/canais/agenda', aliases: ['calendario', 'calendário'] },
  { id: 'publicados', label: 'Publicados', path: '/canais/publicados', aliases: ['publicados'] },
  { id: 'shorts', label: 'Shorts', path: '/shorts', aliases: ['short', 'cortes de video', 'cortes de vídeo'] },
  { id: 'tarefas', label: 'Tarefas', path: '/tarefas', aliases: ['tasks'] },
  { id: 'equipe', label: 'Equipe', path: '/equipe', aliases: ['chat', 'mensagens'] },
  { id: 'configuracoes', label: 'Configurações', path: '/configuracoes', aliases: ['settings', 'ajustes'] },
]

export function resolveAtlasScreen(query: string): AtlasScreen {
  const needle = foldPersonName(query)
  if (!needle) throw new Error('Informe a tela para abrir.')
  const exact = ATLAS_SCREENS.find(
    (screen) =>
      foldPersonName(screen.id) === needle ||
      foldPersonName(screen.label) === needle ||
      screen.aliases.some((alias) => foldPersonName(alias) === needle),
  )
  if (exact) return exact
  const partial = ATLAS_SCREENS.filter(
    (screen) =>
      foldPersonName(screen.label).includes(needle) ||
      screen.aliases.some((alias) => foldPersonName(alias).includes(needle)),
  )
  if (partial.length === 1) return partial[0]
  if (partial.length > 1) {
    throw new Error(`Há mais de uma tela parecida com "${query.trim()}". Escolha: ${partial.map((item) => item.label).join(', ')}.`)
  }
  throw new Error(
    `Não conheço a tela "${query.trim()}". Telas: ${ATLAS_SCREENS.map((item) => item.label).join(', ')}.`,
  )
}

export type BriefItem = { id: string; label: string; detail?: string }

export type WorkspaceBriefing = {
  accountName: string
  projects: BriefItem[]
  channels: BriefItem[]
  tasks: BriefItem[]
  tracks: BriefItem[]
  shorts: BriefItem[]
  videos: BriefItem[]
  lipsync: BriefItem[]
  clocks: BriefItem[]
  omitted: Partial<Record<'projects' | 'channels' | 'tasks' | 'tracks' | 'shorts' | 'videos' | 'lipsync', number>>
}

function line(title: string, items: BriefItem[], omitted = 0): string {
  const total = items.length + omitted
  if (total === 0) return `${title}: nenhum.`
  const body = items
    .map((item) => (item.detail ? `${item.label} (${item.detail}) [${item.id}]` : `${item.label} [${item.id}]`))
    .join('; ')
  const extra = omitted > 0 ? `${body ? '; ' : ''}e mais ${omitted}` : ''
  return `${title} (${total}): ${body}${extra}.`
}

/** Texto curto que o assistente recebe a cada mensagem. */
export function formatWorkspaceBriefing(briefing: WorkspaceBriefing): string {
  const clocks =
    briefing.clocks.length === 0
      ? 'Fusos: nenhum.'
      : `Fusos: ${briefing.clocks.map((item) => `${item.label} ${item.detail ?? ''}`.trim()).join('; ')}.`
  return [
    `Conta: ${briefing.accountName || 'sem nome'}.`,
    line('Projetos', briefing.projects, briefing.omitted.projects),
    line('Canais', briefing.channels, briefing.omitted.channels),
    line('Tarefas pendentes', briefing.tasks, briefing.omitted.tasks),
    line('Faixas', briefing.tracks, briefing.omitted.tracks),
    line('Shorts', briefing.shorts, briefing.omitted.shorts),
    line('Agenda', briefing.videos, briefing.omitted.videos),
    line('Lipsync', briefing.lipsync, briefing.omitted.lipsync),
    clocks,
  ].join('\n')
}

export const ATLAS_SYSTEM_GUIDE = [
  'Você é o assistente do Atlas Studio e opera o workspace de música que está aberto.',
  'O panorama abaixo é o estado real agora. Use esses nomes e ids. Não invente projetos, faixas, canais ou pessoas.',
  'Se o item não aparecer no panorama, chame a ação de lista antes de dizer que não existe.',
  'Você pode criar, editar, abrir, concluir e apagar o que as ações permitem: projetos, canais, tarefas, faixas, shorts, agenda, prompts, lipsync, fusos e mensagens da equipe.',
  'Apagar (delete_*) pede confirmação. Não diga que já apagou antes da confirmação.',
  'Importar áudio ou vídeo sem caminho abre o seletor de arquivo do Windows.',
  'Análise automática e exportação de Shorts rodam na tela do Shorts. Abra o projeto com open_short em vez de fingir que a análise terminou.',
  'Telas: Início, Projetos, Faixas, Prompts, Lipsync, Canais, Agenda, Publicados, Shorts, Tarefas, Equipe, Configurações.',
  'Status de vídeo na agenda: colocando, editando, agendando, publicado.',
].join(' ')
