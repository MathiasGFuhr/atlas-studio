export type ScriptStatus = 'pronto' | 'em_revisao' | 'rascunho' | 'erro'
export type ChannelVideoStatus = 'colocando' | 'editando' | 'agendando' | 'publicado'
/** Ambiente de produção ao qual um projeto pertence. */
export type ProjectType = 'history' | 'music'
/** Classificação opcional de canais por ambiente. */
export type ChannelType = ProjectType
export type AntigravityAuthState =
  | 'initializing'
  | 'not_found'
  | 'not_authenticated'
  | 'authenticating'
  | 'connected'
  | 'error'
export type OutputStyle = 'original' | 'profissional' | 'alta_retencao'
export type ResearchMode = 'automatica' | 'sempre' | 'nunca'
export type DurationOption = '10' | '15' | '20' | '30' | 'custom'

export type SkillValidationStatus = 'valid' | 'invalid' | 'warning'

export const PROJECT_TYPES: ProjectType[] = ['history', 'music']

export function isProjectType(value: unknown): value is ProjectType {
  return value === 'history' || value === 'music'
}

/** Rótulo do ambiente exibido na interface. */
export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  history: 'História',
  music: 'Música',
}

export interface Project {
  id: string
  name: string
  description: string
  projectType: ProjectType
  /** Canal opcional vinculado ao projeto. `null` quando o usuário cria sem canal. */
  channelId: string | null
  /** Nome do canal no momento da leitura. Calculado na leitura. */
  channelName?: string | null
  /** Caminho absoluto da pasta física vinculada. `null` enquanto não houver vínculo. */
  projectFolderPath: string | null
  /** Indica se a pasta vinculada ainda existe no disco. Calculado na leitura. */
  folderExists?: boolean
  /** Quantidade de roteiros vinculados (projetos de História). Calculado na leitura. */
  scriptCount?: number
  /** Quantidade de faixas vinculadas (projetos de Música). Calculado na leitura. */
  trackCount?: number
  /** Publicação do calendário vinculada a este projeto. Calculado na leitura. */
  scheduledVideoId?: string | null
  /** Canal da publicação vinculada. Calculado na leitura. */
  scheduledVideoChannelId?: string | null
  scheduledDate?: string | null
  scheduledVideoStatus?: ChannelVideoStatus | null
  scheduledVideoTitle?: string | null
  scheduledVideoDescription?: string | null
  scheduledVideoThumbnailDataUrl?: string | null
  /** Nome do canal da publicação vinculada. Calculado na leitura. */
  scheduledVideoChannelName?: string | null
  createdAt: string
  updatedAt: string
}

export interface Niche {
  id: string
  name: string
  defaultLanguage: string
  description: string
  /** Caminho absoluto da pasta da skill (com SKILL.md). Referência externa — nunca copiada. */
  skillPath: string
  /** Caminho absoluto opcional da pasta de roteiros do projeto (ex.: .../roteiros). */
  scriptsPath: string
  memoryPath: string
  thumbnail?: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface DiscoveredSkill {
  name: string
  path: string
  skillMdPath: string
  modifiedAt: string | null
  hasReferences: boolean
  hasScripts: boolean
  hasTemplates: boolean
  hasTests: boolean
  hasAgents: boolean
  references: string[]
  scripts: string[]
  templates: string[]
  tests: string[]
  agents: string[]
  validationStatus: SkillValidationStatus
  validationMessage: string | null
}

export interface SkillValidationResult {
  status: SkillValidationStatus
  path: string
  issues: string[]
  warnings: string[]
}

export interface SkillRecord {
  id: string
  name: string
  path: string
  modifiedAt: string | null
  hasReferences: boolean
  hasScripts: boolean
  hasTemplates: boolean
  hasTests: boolean
  hasAgents: boolean
  validationStatus: SkillValidationStatus
  validationMessage: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface SkillScanIgnoredDirectory {
  path: string
  reason: string
}

export interface SkillScanFilesystemError {
  path: string
  error: string
}

export interface SkillScanReport {
  libraryRoot: string
  visitedDirectories: string[]
  skillMdFound: string[]
  ignoredDirectories: SkillScanIgnoredDirectory[]
  filesystemErrors: SkillScanFilesystemError[]
}

export interface SkillRescanResult {
  libraryRoot: string
  total: number
  added: number
  updated: number
  removed: number
  skills: DiscoveredSkill[]
  report: SkillScanReport
  nichesCreated?: number
}

export interface Channel {
  id: string
  name: string
  description: string
  avatarPath: string
  /** Data URL gerada na leitura — não persistir. */
  avatarDataUrl?: string | null
  nicheId: string | null
  nicheName?: string | null
  youtubeUrl: string
  color: string
  /** Ambiente ao qual o canal está associado. Canais antigos assumem 'history'. */
  channelType: ChannelType
  active: boolean
  videoCount?: number
  createdAt: string
  updatedAt: string
}

export type TitleAnalysisProfile = 'music' | 'history' | 'general'
export type TitleAlternativeStrategy = 'original_refined' | 'hook_first' | 'compact'

export interface TitleAnalysisMetrics {
  hook: number
  clarity: number
  curiosity: number
  specificity: number
  emotion: number
  naturalness: number
  mobile: number
  channelFit: number
  originality: number
  musicIdentity?: number | null
  narrativePromise?: number | null
}

export interface TitleAlternative {
  strategy: TitleAlternativeStrategy
  title: string
  reason: string
}

export interface TitleAnalysisLocalFacts {
  charCount: number
  wordCount: number
  first45: string
  first60: string
  hasSeparator: boolean
  repeatedWords: string[]
}

export interface TitleChannelContext {
  name: string
  type?: TitleAnalysisProfile
  language?: string
}

export interface TitlePerformanceDatum {
  title: string
  views?: number
  ctr?: number
}

export interface TitleAnalysisPayload {
  projectType: TitleAnalysisProfile
  language?: string
  country?: string
  channel?: TitleChannelContext
  currentTitle: string
  songTitle?: string
  artistName?: string
  eventName?: string
  videoFormat?: string
  videoContext?: string
  thumbnailText?: string
  recentChannelTitles?: string[]
  performanceDataIfAvailable?: TitlePerformanceDatum[]
  localFacts?: TitleAnalysisLocalFacts
}

export interface TitleStrengthAnalysis {
  score: number
  verdict: string
  profile: TitleAnalysisProfile
  metrics: TitleAnalysisMetrics
  strengths: string[]
  weaknesses: string[]
  alternatives: TitleAlternative[]
  localFacts: TitleAnalysisLocalFacts
}

export interface AnalyzeTitleRequest {
  title: string
  videoId?: string
  channelId?: string
  channelName?: string
  description?: string
  projectType?: TitleAnalysisProfile
  language?: string
  country?: string
  songTitle?: string
  artistName?: string
  eventName?: string
  videoFormat?: string
  videoContext?: string
  thumbnailText?: string
  recentChannelTitles?: string[]
  performanceDataIfAvailable?: TitlePerformanceDatum[]
}

export interface AnalyzeTitleResult {
  analysis: TitleStrengthAnalysis
  video: ChannelVideo | null
}

export interface AntigravityStatus {
  connected: boolean
  authenticated: boolean
  authState: AntigravityAuthState
  version: string | null
  runtimePath: string | null
  message: string
  lastCheckedAt: string
}

export interface AntigravityLoginStartResult {
  loginId: string
}

export type QuickPromptKind = 'image' | 'animation'
export type QuickPromptAuditIntent = 'audit' | 'clean'
export type QuickPromptIssueCategory =
  | 'coherence'
  | 'lipsync'
  | 'camera'
  | 'preservation'
  | 'redundancy'
  | 'contradiction'
  | 'other'
export type QuickPromptIssueSeverity = 'warning' | 'error'

export interface AnalyzeQuickPromptRequest {
  prompt: string
  kind: QuickPromptKind
  /** audit = análise completa; clean = prioriza enxugar redundâncias. */
  intent?: QuickPromptAuditIntent
  performance: string
  action?: string
  framing?: string
  camera?: string
  context?: string
  lipSync: boolean
  target?: string
  purpose?: string
}

export interface QuickPromptOkItem {
  title: string
  detail?: string
}

export interface QuickPromptIssue {
  category: QuickPromptIssueCategory
  severity: QuickPromptIssueSeverity
  title: string
  detail: string
}

export interface QuickPromptAnalysis {
  score: number
  verdict: string
  okItems: QuickPromptOkItem[]
  issues: QuickPromptIssue[]
  correctedPrompt: string
  cleanedPrompt: string
}

export interface AnalyzeQuickPromptResult {
  analysis: QuickPromptAnalysis
}

export interface ChannelVideo {
  id: string
  channelId: string
  title: string
  description: string
  thumbnailPath: string
  /** Data URL gerada na leitura — não persistir. */
  thumbnailDataUrl?: string | null
  scheduledDate: string
  status: ChannelVideoStatus
  scriptId: string | null
  /**
   * Projeto vinculado a esta publicação.
   * Obrigatório para vídeos de canais de Música (`projectType: 'music'`).
   * História continua podendo ficar `null`.
   */
  projectId: string | null
  /** Nome do projeto no momento da leitura. Calculado na leitura. */
  projectName?: string | null
  /** Pasta física do projeto de edição vinculada a este vídeo. */
  projectFolderPath: string | null
  /** Calculado na leitura — não persistir. */
  folderExists?: boolean
  titleScore?: number | null
  titleAnalysis?: TitleStrengthAnalysis | null
  titleAnalyzedAt?: string | null
  createdAt: string
  updatedAt: string
  /** Nome do canal no momento da leitura. Calculado na leitura. */
  channelName?: string | null
  /** Tipo do canal no momento da leitura. Calculado na leitura. */
  channelType?: ChannelType | null
  /** Cor do canal no momento da leitura. Calculado na leitura. */
  channelColor?: string | null
}

/** Entrada de criação/atualização de vídeo do calendário. */
export interface ChannelVideoWriteInput {
  channelId: string
  title: string
  description?: string
  thumbnailPath?: string
  scheduledDate: string
  status: ChannelVideoStatus
  scriptId?: string | null
  projectFolderPath?: string | null
  /** Projeto de Música existente. Ignorado em canais de História. */
  projectId?: string | null
  /** Nome real da música — só usado para nomear o projeto criado automaticamente. */
  songTitle?: string | null
}

export const MUSIC_PROJECT_HAS_PUBLICATION_ERROR =
  'Este projeto possui uma publicação agendada. Exclua o projeto e a publicação juntos, ou cancele.'

export interface RemoveProjectOptions {
  /** Quando o projeto de Música tem publicação, também remove o vídeo do calendário. */
  alsoRemovePublication?: boolean
}

export interface VideoListFilters {
  channelId?: string
  projectId?: string
  from?: string
  to?: string
  limit?: number
  /** Só vídeos com este status editorial. */
  status?: ChannelVideoStatus
  /** Exclui vídeos com este status (ex.: tirar `publicado` da agenda). */
  excludeStatus?: ChannelVideoStatus
}

export interface ChannelPrompt {
  id: string
  channelId: string
  channelName?: string | null
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

export interface ScriptRecord {
  id: string
  nicheId: string
  nicheName?: string
  /** Projeto de História dono deste roteiro. */
  projectId?: string | null
  projectName?: string | null
  title: string
  topic: string
  language: string
  content: string
  status: ScriptStatus
  durationMinutes?: number | null
  outputStyle?: OutputStyle | null
  originalityScore?: number | null
  retentionScore?: number | null
  naturalnessScore?: number | null
  similarityScore?: number | null
  folderPath?: string | null
  createdAt: string
  updatedAt: string
}

export interface ScriptVersion {
  id: string
  scriptId: string
  versionNumber: number
  content: string
  adjustmentPrompt?: string | null
  createdAt: string
}

export interface AppSettings {
  accountName: string
  accountRole: string
  accountEmail: string
  /** Caminho absoluto da foto de perfil copiada para o app. */
  accountPhotoPath: string
  /** Data URL gerada na leitura — não persistir. */
  accountPhotoDataUrl?: string | null
  workspacePath: string
  /** Raiz onde o Atlas cria as pastas físicas dos projetos (Historia/ e Musica/). */
  projectsRoot: string
  /** @deprecated Preferir skillLibraryRoot — mantido por compatibilidade. */
  skillsPath: string
  /** Raiz da biblioteca externa de skills (ex.: Documents/ChatGPT). */
  skillLibraryRoot: string
  scriptsPath: string
  defaultLanguage: string
  defaultNicheId: string | null
  defaultOutputStyle: OutputStyle
  defaultDuration: DurationOption
  finalAuditEnabled: boolean
  /** @deprecated Preferir defaultCodexModel — mantido por compatibilidade. */
  codexModel: string
  defaultCodexModel: string
  defaultCodexEffort: string
  defaultAntigravityModel: string
  defaultAntigravityEffort: string
  /** Consentimento explícito para enviar o proxy de vídeo ao provedor de IA. */
  allowExternalVideoAnalysis: boolean
  autoApproval: boolean
  backupEnabled: boolean
  /** Em produção, verifica atualizações alguns segundos após abrir. */
  autoCheckUpdates: boolean
  /** Caminho opcional do executável Codex salvo pelo usuário. */
  codexBinaryPath: string
  /** Caminho opcional do executável Antigravity (`agy`) salvo pelo usuário. */
  antigravityBinaryPath: string
  /** Onboarding de vínculo com Codex já foi descartado. */
  codexOnboardingDismissed: boolean
  /** Chaves estáveis de notificações já lidas (ex.: task-overdue:<id>:<dueDate>). */
  notificationReadKeys: string[]
  /** Quando true, História/Música aparecem conforme canais e projetos existentes. */
  contentAreasAutoDetect: boolean
  /** Usado só com detecção automática desligada. */
  contentAreasHistoryEnabled: boolean
  /** Usado só com detecção automática desligada. */
  contentAreasMusicEnabled: boolean
  /** Largura persistida do painel flutuante de Chat (px). */
  chatPanelWidth: number
  /** Altura persistida do painel flutuante de Chat (px). */
  chatPanelHeight: number
  /** Última pasta usada para exportar cortes de música. */
  musicExportFolder: string
}

export type CodexAuthState =
  | 'initializing'
  | 'not_found'
  | 'not_authenticated'
  | 'authenticating'
  | 'connected'
  | 'error'

export interface CodexAccountInfo {
  email?: string | null
  name?: string | null
  loginType?: string | null
}

export interface CodexRuntimeInfo {
  binaryPath: string | null
  version: string | null
  appServerRunning: boolean
  locatedVia: 'path' | 'settings' | 'known' | 'env' | null
}

export interface CodexStatus {
  connected: boolean
  authenticated: boolean
  authState: CodexAuthState
  account: CodexAccountInfo | null
  model: string | null
  message: string
  lastCheckedAt: string
  runtimePath?: string | null
  codexVersion?: string | null
  appServerRunning?: boolean
}

export interface CodexLoginStartResult {
  loginId: string
  authUrl?: string
  userCode?: string
  verificationUrl?: string
}

export interface CodexDeviceCodeInfo {
  userCode: string
  verificationUrl: string
}

export type GenerationStepId =
  | 'prepare'
  | 'skill'
  | 'memory'
  | 'research'
  | 'structure'
  | 'writing'
  | 'review'
  | 'audit'
  | 'saving'
  | 'done'

export type GenerationStepState = 'pending' | 'running' | 'done' | 'error' | 'cancelled'

export interface GenerationStep {
  id: GenerationStepId
  label: string
  state: GenerationStepState
}

export interface GenerateScriptRequest {
  nicheId: string
  language: string
  topic: string
  durationMinutes?: number
  outputStyle?: OutputStyle
  researchMode?: ResearchMode
  /** Projeto de História que receberá o roteiro. Ausente = projeto criado automaticamente. */
  projectId?: string | null
}

export interface AdjustScriptRequest {
  scriptId: string
  instruction: string
  /** Versão de origem. Se omitida, usa a mais recente do script. */
  versionId?: string
}

export interface GenerationProgressEvent {
  runId: string
  steps: GenerationStep[]
  message?: string
  elapsedMs?: number
  cancellable?: boolean
  phase?: string
}

export interface GenerationResult {
  runId: string
  script: ScriptRecord
  version: ScriptVersion
}

export interface UniquenessAuditResult {
  passed: boolean
  originalityScore: number | null
  structuralSimilarity: number
  lexicalSimilarity: number
  hookSimilarity: number
  endingSimilarity: number
  issues: string[]
  closestEpisodeTitle?: string | null
  themeSwapRisk: boolean
  genericTemplateRisk: boolean
}

export interface EditorialEpisodeMemory {
  scriptId?: string
  title: string
  topic: string
  hook: string
  openingType: string
  architecture: string
  throughLine: string
  retentionDevice: string
  climax: string
  endingType: string
  notablePhrases: string[]
  avoidNext: string[]
  recordedAt: string
}

export interface NicheEditorialMemory {
  nicheId: string
  nicheName: string
  episodes: EditorialEpisodeMemory[]
  doNotRepeat: string[]
  updatedAt: string
}

export interface InterruptedRun {
  id: string
  nicheId: string | null
  startedAt: string
  errorMessage?: string | null
}

export type TaskStatus = 'pending' | 'completed'
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'
export type TaskCategory =
  | 'general'
  | 'channel'
  | 'history'
  | 'music'
  | 'script'
  | 'audio'
  | 'publishing'
export type TaskRelatedType = 'history' | 'music' | 'channel'
export type TaskFilter = 'all' | 'today' | 'pending' | 'completed'

export interface AtlasTask {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  category: TaskCategory
  /** Data no formato YYYY-MM-DD. Sem horário nesta versão. */
  dueDate: string | null
  relatedType: TaskRelatedType | null
  relatedId: string | null
  /** Nome do projeto ou canal no momento da leitura. */
  relatedName?: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export type TaskWriteInput = {
  title: string
  description?: string
  priority?: TaskPriority
  category?: TaskCategory
  dueDate?: string | null
  relatedType?: TaskRelatedType | null
  relatedId?: string | null
}

export const GENERATION_STEPS: Array<{ id: GenerationStepId; label: string }> = [
  { id: 'prepare', label: 'Preparando...' },
  { id: 'skill', label: 'Carregando skill...' },
  { id: 'memory', label: 'Analisando roteiros anteriores...' },
  { id: 'research', label: 'Pesquisando...' },
  { id: 'structure', label: 'Estruturando...' },
  { id: 'writing', label: 'Escrevendo...' },
  { id: 'review', label: 'Revisando...' },
  { id: 'audit', label: 'Auditando...' },
  { id: 'saving', label: 'Salvando...' },
  { id: 'done', label: 'Concluído.' },
]

export const IPC = {
  projects: {
    list: 'projects:list',
    get: 'projects:get',
    create: 'projects:create',
    update: 'projects:update',
    remove: 'projects:remove',
    createFolder: 'projects:createFolder',
    linkFolder: 'projects:linkFolder',
    openFolder: 'projects:openFolder',
  },
  niches: {
    list: 'niches:list',
    get: 'niches:get',
    create: 'niches:create',
    update: 'niches:update',
  },
  channels: {
    list: 'channels:list',
    get: 'channels:get',
    create: 'channels:create',
    update: 'channels:update',
    remove: 'channels:remove',
    setAvatar: 'channels:setAvatar',
  },
  tasks: {
    list: 'tasks:list',
    get: 'tasks:get',
    create: 'tasks:create',
    update: 'tasks:update',
    setStatus: 'tasks:setStatus',
    remove: 'tasks:remove',
    pendingCount: 'tasks:pendingCount',
  },
  videos: {
    list: 'videos:list',
    get: 'videos:get',
    create: 'videos:create',
    update: 'videos:update',
    remove: 'videos:remove',
    setThumbnail: 'videos:setThumbnail',
    analyzeTitle: 'videos:analyzeTitle',
  },
  quickPrompts: {
    list: 'quickPrompts:list',
    create: 'quickPrompts:create',
    update: 'quickPrompts:update',
    remove: 'quickPrompts:remove',
    listFavorites: 'quickPrompts:listFavorites',
    setFavorite: 'quickPrompts:setFavorite',
  },
  prompts: {
    list: 'prompts:list',
    get: 'prompts:get',
    create: 'prompts:create',
    update: 'prompts:update',
    remove: 'prompts:remove',
  },
  antigravity: {
    status: 'antigravity:status',
    healthCheck: 'antigravity:healthCheck',
    loginStart: 'antigravity:loginStart',
    loginCancel: 'antigravity:loginCancel',
    loginConfirm: 'antigravity:loginConfirm',
    logout: 'antigravity:logout',
    authStateChanged: 'antigravity:authStateChanged',
    analyzeQuickPrompt: 'antigravity:analyzeQuickPrompt',
  },
  music: {
    list: 'music:list',
    get: 'music:get',
    import: 'music:import',
    update: 'music:update',
    remove: 'music:remove',
    preview: 'music:preview',
    previewUrl: 'music:previewUrl',
    export: 'music:export',
    exportAll: 'music:exportAll',
    chooseExportFolder: 'music:chooseExportFolder',
    adviseCuts: 'music:adviseCuts',
  },
  shorts: {
    list: 'shorts:list',
    get: 'shorts:get',
    import: 'shorts:import',
    createFromSourceVideo: 'shorts:createFromSourceVideo',
    analyze: 'shorts:analyze',
    getAnalysisPlan: 'shorts:getAnalysisPlan',
    updateClip: 'shorts:updateClip',
    removeClip: 'shorts:removeClip',
    regenerateCopy: 'shorts:regenerateCopy',
    updateSettings: 'shorts:updateSettings',
    export: 'shorts:export',
    remove: 'shorts:remove',
    mediaUrl: 'shorts:mediaUrl',
    thumbnailUrl: 'shorts:thumbnailUrl',
    relink: 'shorts:relink',
    openExportsFolder: 'shorts:openExportsFolder',
    progress: 'shorts:progress',
  },
  skills: {
    list: 'skills:list',
    rescan: 'skills:rescan',
    validate: 'skills:validate',
  },
  scripts: {
    list: 'scripts:list',
    get: 'scripts:get',
    recent: 'scripts:recent',
    summary: 'scripts:summary',
    export: 'scripts:export',
    saveVersion: 'scripts:saveVersion',
    versions: 'scripts:versions',
  },
  settings: {
    get: 'settings:get',
    update: 'settings:update',
    setProfilePhoto: 'settings:setProfilePhoto',
    clearProfilePhoto: 'settings:clearProfilePhoto',
  },
  workspace: {
    capabilities: 'workspace:capabilities',
  },
  codex: {
    status: 'codex:status',
    connect: 'codex:connect',
    disconnect: 'codex:disconnect',
    accountRead: 'codex:accountRead',
    loginStart: 'codex:loginStart',
    loginCancel: 'codex:loginCancel',
    logout: 'codex:logout',
    healthCheck: 'codex:healthCheck',
    authStateChanged: 'codex:authStateChanged',
    loginUrl: 'codex:loginUrl',
    listModels: 'codex:listModels',
    onboardingDismissed: 'codex:onboardingDismissed',
    isOnboardingDismissed: 'codex:isOnboardingDismissed',
  },
  agents: {
    getCapabilities: 'agents:getCapabilities',
    refreshModels: 'agents:refreshModels',
    setDefaultModel: 'agents:setDefaultModel',
    setReasoningEffort: 'agents:setReasoningEffort',
    capabilitiesChanged: 'agents:capabilitiesChanged',
  },
  generation: {
    start: 'generation:start',
    adjust: 'generation:adjust',
    cancel: 'generation:cancel',
    progress: 'generation:progress',
    interrupted: 'generation:interrupted',
  },
  chat: {
    listConversations: 'chat:listConversations',
    getConversation: 'chat:getConversation',
    createConversation: 'chat:createConversation',
    renameConversation: 'chat:renameConversation',
    setContext: 'chat:setContext',
    removeConversation: 'chat:removeConversation',
    sendMessage: 'chat:sendMessage',
    confirmActions: 'chat:confirmActions',
    agentStatus: 'chat:agentStatus',
    prepareAttachments: 'chat:prepareAttachments',
    progress: 'chat:progress',
  },
  dialog: {
    selectFolder: 'dialog:selectFolder',
    selectImage: 'dialog:selectImage',
    selectFiles: 'dialog:selectFiles',
    selectExecutable: 'dialog:selectExecutable',
  },
  system: {
    copyText: 'system:copyText',
    openPath: 'system:openPath',
  },
  updates: {
    status: 'updates:status',
    check: 'updates:check',
    download: 'updates:download',
    install: 'updates:install',
    changed: 'updates:changed',
  },
} as const
