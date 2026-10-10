import {
  CalendarDays,
  CheckSquare,
  Clapperboard,
  FolderKanban,
  ListMusic,
  MessageSquareText,
  Music2,
  Scissors,
  Settings,
  Tv,
  type LucideIcon,
} from 'lucide-react'
import { MUSIC_PROMPTS_PATH } from '@shared/workspaceCapabilities'

export type TourStep = {
  id: string
  target: string | null
  icon: LucideIcon
  kicker: string
  title: string
  body: string
  note?: string
}

const ACTIONS = '[data-tour="page-actions"]'

function screenTour(
  id: string,
  icon: LucideIcon,
  kicker: string,
  intro: { title: string; body: string },
  action: { title: string; body: string },
): TourStep[] {
  return [
    {
      id: `${id}-intro`,
      target: null,
      icon,
      kicker,
      title: intro.title,
      body: intro.body,
      note: 'Este tutorial aparece uma vez nesta tela. Esc pula.',
    },
    {
      id: `${id}-actions`,
      target: ACTIONS,
      icon,
      kicker,
      title: action.title,
      body: action.body,
    },
  ]
}

export const PAGE_TOURS: Record<string, TourStep[]> = {
  'music-projects': screenTour(
    'music-projects',
    Music2,
    'Música',
    {
      title: 'Projetos musicais',
      body: 'Cada projeto guarda faixas, cortes e a publicação do vídeo. A cor muda; o caminho continua sendo criar, produzir e publicar.',
    },
    {
      title: 'Faixas e projetos',
      body: 'A busca acha um projeto. Faixas abre a biblioteca de cortes. Novo projeto começa outra produção. As abas separam vídeos e músicas.',
    },
  ),
  'music-project': screenTour(
    'music-project',
    FolderKanban,
    'Projeto musical',
    {
      title: 'Faixas deste projeto',
      body: 'O projeto reúne as músicas importadas e, quando houver, o vídeo agendado no canal.',
    },
    {
      title: 'Importar a faixa',
      body: 'Importar música traz o áudio para o Atlas analisar e sugerir cortes. O arquivo original permanece intacto.',
    },
  ),
  'music-tracks': screenTour(
    'music-tracks',
    ListMusic,
    'Cortes',
    {
      title: 'Biblioteca de faixas',
      body: 'Cada música importada pode ser analisada, cortada e exportada em MP3, sem editar o arquivo de origem.',
    },
    {
      title: 'Importar',
      body: 'Importar música abre o fluxo de cortes. Projetos de Música volta para a lista de produções.',
    },
  ),
  'music-editor': screenTour(
    'music-editor',
    Scissors,
    'Editor de cortes',
    {
      title: 'Ouça e recorte',
      body: 'Ajuste os pontos de corte enquanto escuta. O Atlas guarda só os marcadores. O FFmpeg gera os arquivos na exportação.',
    },
    {
      title: 'Reprodução',
      body: 'Play e Pause acompanham a linha do tempo. A tecla Espaço alterna a reprodução. A exportação fica nesta mesma tela.',
    },
  ),
  prompts: screenTour(
    'prompts',
    MessageSquareText,
    'Prompts',
    {
      title: 'Sua biblioteca de prompts',
      body: 'Os prompts ficam em abas livres, como lipsync ou ângulos de câmera. O que você criar ou pedir para a IA guardar aparece aqui.',
    },
    {
      title: 'Organizar e copiar',
      body: 'Crie abas, favorite e copie. O texto copiado sai pronto para usar na produção.',
    },
  ),
  channels: screenTour(
    'channels',
    Tv,
    'Canais',
    {
      title: 'Onde a publicação mora',
      body: 'Cada canal tem calendário, agenda e vídeos publicados. O canal ativo no menu segue essa mesma lista.',
    },
    {
      title: 'Agenda, publicados e cadastro',
      body: 'Agenda mostra os próximos vídeos de todos os canais. Publicados guarda o que já saiu. Novo canal entra no calendário.',
    },
  ),
  'channel-agenda': screenTour(
    'channel-agenda',
    CalendarDays,
    'Agenda',
    {
      title: 'Os próximos vídeos',
      body: 'A agenda junta o que ainda vai ao ar, em todos os canais. Publicado sai daqui e vai para Vídeos publicados.',
    },
    {
      title: 'Abrir o vídeo',
      body: 'Cada card abre o registro no calendário do canal, para título, data, descrição e status.',
    },
  ),
  'channel-published': screenTour(
    'channel-published',
    Tv,
    'Publicados',
    {
      title: 'O que já foi ao ar',
      body: 'Estes vídeos saíram do calendário e da agenda. O registro continua disponível para copiar título e descrição.',
    },
    {
      title: 'Reabrir o registro',
      body: 'Abra o vídeo para consultar o material. Para devolvê-lo ao calendário, mude o status no registro.',
    },
  ),
  'channel-calendar': screenTour(
    'channel-calendar',
    CalendarDays,
    'Calendário',
    {
      title: 'O calendário do canal',
      body: 'Cada dia pode receber um vídeo com título, descrição, thumbnail e status. É o planejamento editorial do canal.',
    },
    {
      title: 'Calendário e publicados',
      body: 'A aba Calendário planeja as datas. A outra aba mostra o que este canal já publicou.',
    },
  ),
  'shorts-projects': screenTour(
    'shorts-projects',
    Clapperboard,
    'Shorts Studio',
    {
      title: 'Do longo para o vertical',
      body: 'Um projeto de Shorts parte de um vídeo completo e vira cortes 9:16, com enquadramento e legenda.',
    },
    {
      title: 'Começar um Shorts',
      body: 'Busque um projeto já feito ou toque em Novo Shorts para importar o vídeo e deixar o Atlas sugerir os trechos.',
    },
  ),
  'shorts-studio': screenTour(
    'shorts-studio',
    Clapperboard,
    'Estúdio de Shorts',
    {
      title: 'Sugerir, ajustar, exportar',
      body: 'Importe o vídeo, revise os trechos sugeridos e exporte cada Short. O corte, o crop e a legenda ficam nesta tela.',
    },
    {
      title: 'Ações do projeto',
      body: 'Renomeie, exclua ou siga a exportação por aqui. Os trechos e o preview aparecem abaixo.',
    },
  ),
  tasks: screenTour(
    'tasks',
    CheckSquare,
    'Tarefas',
    {
      title: 'O que ainda falta fazer',
      body: 'A lista operacional da produção: prazos, prioridades e o vínculo com projeto ou canal.',
    },
    {
      title: 'Filtrar e criar',
      body: 'Busque uma tarefa, filtre por situação e crie a próxima. Marcar como feita tira o item das pendências.',
    },
  ),
  settings: screenTour(
    'settings',
    Settings,
    'Configurações',
    {
      title: 'O estúdio do seu jeito',
      body: 'Conta, inteligência, pastas dos projetos e as áreas que aparecem no menu ficam nesta tela.',
    },
    {
      title: 'Estado da IA',
      body: 'Estes cartões mostram se o Codex e o Antigravity estão prontos. A vinculação e os modelos ficam nos blocos abaixo.',
    },
  ),
}

const RULES: Array<{ id: string; test: (path: string) => boolean }> = [
  { id: 'music-editor', test: (path) => /^\/musica\/faixas\/[^/]+$/.test(path) },
  { id: 'music-tracks', test: (path) => path === '/musica/faixas' },
  {
    id: 'prompts',
    test: (path) => path === MUSIC_PROMPTS_PATH || path.startsWith(`${MUSIC_PROMPTS_PATH}/`),
  },
  { id: 'music-project', test: (path) => /^\/musica\/projetos\/[^/]+$/.test(path) },
  { id: 'music-projects', test: (path) => path === '/musica' },
  { id: 'channel-agenda', test: (path) => path === '/canais/agenda' },
  { id: 'channel-published', test: (path) => path === '/canais/publicados' },
  { id: 'channel-calendar', test: (path) => /^\/canais\/[^/]+/.test(path) },
  { id: 'channels', test: (path) => path === '/canais' },
  { id: 'shorts-studio', test: (path) => /^\/shorts\/[^/]+$/.test(path) },
  { id: 'shorts-projects', test: (path) => path === '/shorts' },
  { id: 'tasks', test: (path) => path === '/tarefas' },
  { id: 'settings', test: (path) => path === '/configuracoes' },
]

export function matchPageTour(pathname: string): string | null {
  const path = pathname.split('?')[0] || '/'
  const rule = RULES.find((item) => item.test(path))
  if (!rule || !PAGE_TOURS[rule.id]) return null
  return rule.id
}
