import {
  BookOpen,
  CalendarDays,
  CheckSquare,
  Clapperboard,
  FileText,
  FolderKanban,
  ListMusic,
  MessageSquareText,
  Music2,
  Scissors,
  Settings,
  Sparkles,
  Tag,
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
  'history-projects': screenTour(
    'history-projects',
    BookOpen,
    'História',
    {
      title: 'Projetos de roteiro',
      body: 'Cada projeto reúne os roteiros de um tema. Daqui você abre um trabalho em andamento ou começa o próximo.',
    },
    {
      title: 'Buscar e criar',
      body: 'A busca localiza um projeto. Roteiros e Nichos são os atalhos do ambiente. Novo projeto abre o cadastro. As abas separam o que está em produção do que já foi publicado.',
    },
  ),
  'history-project': screenTour(
    'history-project',
    FolderKanban,
    'Projeto',
    {
      title: 'O projeto de História',
      body: 'Aqui ficam os roteiros deste tema. Abra um existente ou gere o próximo sem sair do projeto.',
    },
    {
      title: 'Criar o roteiro',
      body: 'Criar roteiro leva ao formulário de nicho, idioma e tema. O texto gerado volta para esta lista.',
    },
  ),
  'create-script': screenTour(
    'create-script',
    Sparkles,
    'Roteiro',
    {
      title: 'Como o roteiro nasce',
      body: 'O nicho escolhe a skill de escrita. O idioma define a saída. O tema é o pedido. O Atlas pesquisa, escreve e devolve o roteiro no projeto.',
    },
    {
      title: 'Gerar',
      body: 'Preencha o tema e toque em Gerar roteiro. A geração segue quando o nicho tem uma skill associada na biblioteca.',
    },
  ),
  scripts: screenTour(
    'scripts',
    FileText,
    'Roteiros',
    {
      title: 'A biblioteca de roteiros',
      body: 'Todos os roteiros gerados ficam aqui, para abrir, continuar ou filtrar sem procurar projeto por projeto.',
    },
    {
      title: 'Filtrar e criar',
      body: 'Busque pelo título, filtre por nicho e idioma, ou comece um roteiro novo. A lista abaixo abre o texto pronto.',
    },
  ),
  'script-detail': screenTour(
    'script-detail',
    FileText,
    'Roteiro pronto',
    {
      title: 'Ler e levar o texto',
      body: 'Esta tela é o roteiro fechado: título, nicho, idioma, duração e o texto para revisar.',
    },
    {
      title: 'Copiar, exportar, versionar',
      body: 'Copie tudo, exporte em TXT ou Markdown, gere de novo ou salve uma versão. O texto fica logo abaixo destes botões.',
    },
  ),
  niches: screenTour(
    'niches',
    Tag,
    'Nichos',
    {
      title: 'O jeito de escrever',
      body: 'O nicho aponta para uma skill da biblioteca. É ele que o Atlas usa na hora de gerar o roteiro.',
    },
    {
      title: 'Skills e nichos',
      body: 'Busque um nicho, rescaneie a pasta de skills ou crie um nicho novo e associe a skill correspondente.',
    },
  ),
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
      body: 'A lista operacional da produção: prazos, prioridades e o vínculo com projeto, roteiro ou canal.',
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
  { id: 'create-script', test: (path) => path === '/historia/criar' },
  { id: 'scripts', test: (path) => path === '/historia/roteiros' },
  { id: 'script-detail', test: (path) => /^\/historia\/roteiros\/[^/]+$/.test(path) },
  { id: 'niches', test: (path) => path === '/historia/nichos' },
  { id: 'history-project', test: (path) => /^\/historia\/projetos\/[^/]+$/.test(path) },
  { id: 'history-projects', test: (path) => path === '/historia' },
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
