import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Drum,
  FileText,
  FolderOpen,
  ImagePlus,
  Loader2,
  Mic,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react'
import type { Channel, Project } from '@shared/types'
import {
  DEFAULT_FLOW_IMAGE_SETTINGS,
  flowImageSettingsStorageKey,
  readStoredFlowImageSettings,
  type FlowImageSettings,
} from '@shared/flowImageSettings'
import { parseFlowPromptsForImport } from '@shared/scenePromptImport'
import { Button } from '../components/Button'
import { ConfirmDialog, Modal } from '../components/Modal'
import { FlowProjectGallery } from '../components/flow/FlowProjectGallery'
import { FlowPromptComposer } from '../components/flow/FlowPromptComposer'
import { FlowResultDownloadMenu } from '../components/flow/FlowResultDownloadMenu'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { useToast } from '../components/Toast'
import { getAtlasApi } from '../lib/api'
import { environmentBreadcrumb } from '../lib/environments'
import { cn } from '../lib/utils'

type BenchSnapshot = {
  atlasProjectId: string
  projectName: string
  link: {
    id: string
    flowProjectId: string | null
    flowProjectUrl: string | null
    linkState: string
    observedTitle: string | null
    lastError?: string | null
  } | null
  references: Array<{
    referenceId: string
    versionId: string
    displayName: string
    alias: string
    useAsCharacter?: boolean
    uploadState: string
    bindingState: string
    attachedState: string
    flowMediaId: string | null
    thumbDataUrl: string | null
  }>
  prompts: Array<{
    promptId: string
    position: number
    draftText: string
    selectedReferenceIds: string[]
    activeAttempt: {
      attemptId: string
      state: string
      executionStage: string | null
      submissionCertainty: string
      failureCode: string | null
      failureDetail?: string | null
      createdAt: string
      expectedOutputs?: number | null
      observedOutputs?: number
      retrievedOutputs?: number
      progressPercent?: number | null
      progressSequence?: number
      progressObservedAt?: string | null
      completionKind?: string | null
      missingCorrelation?: string[]
      recoveryCandidates?: Array<{
        candidateKey: string
        flowMediaId: string | null
        srcKey: string | null
        alt: string | null
        width: number | null
        height: number | null
        inBaseline: boolean
        sha256: string | null
        alreadyBoundElsewhere: boolean
        previewDataUrl: string | null
      }>
      outputSlots?: Array<{
        slotKey: string
        outputIndex: number
        state:
          | 'awaiting'
          | 'preparing_refs'
          | 'generating'
          | 'receiving'
          | 'ready'
          | 'failed'
          | 'recover_pending'
        percent: number | null
        resultBindingId: string | null
        attemptId?: string
        fileReady: boolean
        thumbDataUrl: string | null
        approved: boolean
        lipsyncSent?: boolean
        remotePreviewOnly: boolean
      }>
    } | null
    gallerySlots?: Array<{
      slotKey: string
      outputIndex: number
      state:
        | 'awaiting'
        | 'preparing_refs'
        | 'generating'
        | 'receiving'
        | 'ready'
        | 'failed'
        | 'recover_pending'
      percent: number | null
      resultBindingId: string | null
      attemptId?: string
      fileReady: boolean
      thumbDataUrl: string | null
      approved: boolean
      lipsyncSent?: boolean
      remotePreviewOnly: boolean
    }>
    results: Array<{
      resultBindingId: string
      attemptId: string
      outputIndex: number
      flowMediaId?: string | null
      originProof?: string | null
      automaticCorrelation?: boolean
      sha256: string
      byteSize: number
      mimeType: string
      fileExists: boolean
      retrievalState: string
      thumbDataUrl: string | null
      approved?: boolean
      lipsyncSent?: boolean
      remotePreviewOnly?: boolean
    }>
  }>
  sceneStrip?: {
    cutCount: number
    musicProjectId: string | null
    musicProjectName: string | null
    scenes: Array<{ number: number; sent: boolean; subject?: 'singer' | 'band' }>
  }
  archivedHistory?: Array<{
    promptId: string
    position: number
    archivedAt: string
    promptText: string
    attemptId: string
    attemptCreatedAt: string
    results: Array<{
      resultBindingId: string
      attemptId: string
      outputIndex: number
      flowMediaId?: string | null
      originProof?: string | null
      automaticCorrelation?: boolean
      sha256: string
      byteSize: number
      mimeType: string
      fileExists: boolean
      retrievalState: string
      thumbDataUrl: string | null
      approved?: boolean
      lipsyncSent?: boolean
      remotePreviewOnly?: boolean
    }>
  }>
  coordinator: {
    running: boolean
    endpoint: string | null
    extensionConnected: boolean
    lastExtensionSeenAt: number | null
    lastInstallationId: string | null
    activeExecutorInstallationId?: string | null
    activeExecutorLastSeenAt?: string | null
  }
  session: {
    evidenceStatus: string | null
    href: string | null
    observedAt: string | null
    sessionUsable?: boolean
    loginRequired?: boolean
    accountLabel?: string | null
  }
  connection: {
    phase: string
    label: string
    detail: string | null
    accountLabel: string | null
    sessionUsable: boolean
    loginRequired: boolean
    extensionConnected: boolean
    pairingOfferActive: boolean
    hasPairedInstallation: boolean
    extensionPathHint: string
  }
  note: string
  recentActivity?: Array<{
    at: string
    kind: 'command' | 'event'
    operation?: string | null
    status?: string | null
    eventType?: string | null
    commandId?: string | null
    attemptId?: string | null
    detail?: string | null
  }>
}

/** Lote: poll até a extensão confirmar que a geração já começou. */
const FLOW_BATCH_START_POLL_MS = 700
/**
 * Espera sem avanço: se a tentativa não muda de etapa (fila → preparo → envio → gerando)
 * por esse tempo, o lote pausa. Antes eram 90 s fixos desde o enfileiramento — a linha 11
 * levou 111 s (36 s na fila + 25 s preparo + 49 s escrita/clique) e o lote parou à toa.
 */
const FLOW_BATCH_START_STALL_MS = 150_000
/** Teto absoluto por prompt, mesmo com a extensão avançando. */
const FLOW_BATCH_START_TIMEOUT_MS = 8 * 60_000
/** Tempo para a extensão limpar o composer no Flow antes de montar o próximo. */
const FLOW_BATCH_CLEAR_MS = 1200

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function splitPromptBlocks(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []
  return normalized
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
}

function normalizeAliasToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
}

function extractBracketAliases(text: string): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  const raw = String(text || '')
  for (const match of raw.matchAll(/\[([A-Za-zÀ-ÿ0-9_][^\]\n]{0,78})\]/g)) {
    const normalized = normalizeAliasToken(String(match[1] || ''))
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    found.push(normalized)
  }
  for (const match of raw.matchAll(/(?:^|[\s,.;:!?()[\]])@([A-Za-zÀ-ÿ0-9_][A-Za-zÀ-ÿ0-9_-]{0,77})/g)) {
    const normalized = normalizeAliasToken(String(match[1] || ''))
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    found.push(normalized)
  }
  return found
}

function resolveLineAliases(
  text: string,
  refs: BenchSnapshot['references'],
):
  | { ok: true; aliases: string[]; referenceIds: string[] }
  | { ok: false; error: string; message: string } {
  const aliases = extractBracketAliases(text)
  if (aliases.length < 1) return { ok: true, aliases: [], referenceIds: [] }

  const byAlias = new Map<string, BenchSnapshot['references']>()
  for (const ref of refs) {
    const key = normalizeAliasToken(ref.alias)
    if (!key) continue
    const list = byAlias.get(key) || []
    list.push(ref)
    byAlias.set(key, list)
  }

  const matched: string[] = []
  const ambiguous: string[] = []
  const referenceIds: string[] = []
  const seen = new Set<string>()

  for (const alias of aliases) {
    const hits = byAlias.get(alias) || []
    // [identidade] e [microfone] são texto. Só vira chip o alias que tem imagem.
    if (hits.length === 0) continue
    if (hits.length > 1) {
      ambiguous.push(alias)
      continue
    }
    matched.push(alias)
    const id = hits[0]!.referenceId
    if (!seen.has(id)) {
      seen.add(id)
      referenceIds.push(id)
    }
  }

  if (ambiguous.length > 0) {
    return {
      ok: false,
      error: 'ALIAS_AMBIGUOUS',
      message: `Alias(es) ambíguo(s): ${ambiguous.map((a) => `[${a}]`).join(', ')}.`,
    }
  }
  return { ok: true, aliases: matched, referenceIds }
}

function refMediaIdOnFlow(flowMediaId: string | null | undefined): boolean {
  const id = String(flowMediaId || '').trim()
  if (!id || id === '_gd' || id.startsWith('_') || id.startsWith('local:')) return false
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
    /^[a-zA-Z0-9-]{20,}$/.test(id)
  )
}

function refIsOnFlow(ref: { uploadState: string; flowMediaId: string | null }): boolean {
  return (
    refMediaIdOnFlow(ref.flowMediaId) &&
    (ref.uploadState === 'uploaded_bound' || ref.uploadState === 'character_ready')
  )
}

function refReady(ref: BenchSnapshot['references'][number]): boolean {
  return ref.uploadState === 'character_ready' || refIsOnFlow(ref)
}

function refSelectable(ref: BenchSnapshot['references'][number]): boolean {
  return (
    ref.uploadState === 'staged_local' ||
    ref.uploadState === 'upload_uncertain' ||
    refReady(ref)
  )
}

function refStateLabel(ref: BenchSnapshot['references'][number]): string {
  if (ref.uploadState === 'character_ready') return 'Personagem'
  if (refReady(ref)) return 'Pronta'
  if (ref.uploadState === 'staged_local') return 'Pendente de envio'
  if (ref.uploadState === 'upload_uncertain') return 'Envio incerto'
  return 'Pendente'
}

function isTerminalAttemptState(state: string | null | undefined): boolean {
  return ['completed', 'failed', 'canceled', 'partial', 'submission_uncertain'].includes(
    String(state || ''),
  )
}

function attemptStatus(attempt: BenchSnapshot['prompts'][number]['activeAttempt']): {
  label: string
  tone: 'neutral' | 'running' | 'success' | 'error'
  detail?: string | null
} {
  if (!attempt) return { label: 'Rascunho', tone: 'neutral' }
  const stage = String(attempt.executionStage || '')
  const code = String(attempt.failureCode || '')
  const terminal = isTerminalAttemptState(attempt.state)

  if (attempt.state === 'canceled' || (terminal && code === 'CANCELED_BY_USER')) {
    return { label: 'Cancelada', tone: 'neutral', detail: attempt.failureDetail || code }
  }
  if (attempt.state === 'completed') {
    return { label: 'Concluída', tone: 'success' }
  }
  if (attempt.state === 'submission_uncertain') {
    return {
      label: 'Envio incerto — confira no Flow',
      tone: 'error',
      detail: attempt.failureDetail || code || null,
    }
  }
  if (
    attempt.state === 'partial' ||
    (terminal && (code === 'CAPTURE_INCOMPLETE' || code === 'IDENTITY_UNCERTAIN'))
  ) {
    return {
      label: 'Sincronizando imagens…',
      tone: 'running',
      detail: 'Buscando imagens geradas no Flow…',
    }
  }
  if (
    terminal &&
    (code === 'ATTACH_FAILED' ||
      code === 'ATTACH_TARGET_NOT_IN_PANEL' ||
      code.startsWith('ATTACH_') ||
      code === 'NEED_ATTACHED_ON_PAGE' ||
      code === 'NEED_ATTACHED_REFS')
  ) {
    return {
      label: code === 'ATTACH_TARGET_NOT_IN_PANEL' ? 'Ref não achada no painel' : 'Falha ao anexar',
      tone: 'error',
      detail: attempt.failureDetail || code,
    }
  }
  if (terminal && code === 'CONTROL_NOT_FOUND') {
    return { label: 'Controle não encontrado', tone: 'error', detail: attempt.failureDetail || code }
  }
  if (terminal && (code === 'PROMPT_WRITE_MISMATCH' || code === 'PROMPT_EDITOR_TOP_SUSPECT')) {
    return {
      label: 'Prompt não entrou no composer',
      tone: 'error',
      detail: attempt.failureDetail || code,
    }
  }
  if (terminal && code === 'AGENT_MODE_ACTIVE') {
    return {
      label: 'Agente ativo no Flow',
      tone: 'error',
      detail:
        attempt.failureDetail ||
        'Desligue o Agente no Flow (pill Agente) e use Regenerar. A bancada só faz anexar + prompt + gerar imagem.',
    }
  }
  if (terminal && code === 'START_GENERATION_NOT_READY') {
    return {
      label: 'Botão Gerar indisponível',
      tone: 'error',
      detail:
        attempt.failureDetail ||
        'No Flow, desligue o Agente e confirme que “Iniciar geração” aparece. Depois Regenerar.',
    }
  }
  if (terminal && (code === 'GENERATE_FAILED' || code === 'GENERATE_NO_EFFECT')) {
    return { label: 'Gerar não clicou', tone: 'error', detail: attempt.failureDetail || code }
  }
  if (attempt.state === 'failed' || (terminal && code)) {
    return { label: 'Falhou', tone: 'error', detail: attempt.failureDetail || code }
  }

  if (attempt.state === 'queued' || stage === 'waiting_executor') {
    return { label: 'Na fila', tone: 'running' }
  }
  if (
    attempt.state === 'preparing' ||
    attempt.state === 'attaching' ||
    stage === 'claimed' ||
    stage === 'upload_and_attach' ||
    stage === 'attach_bound' ||
    stage === 'upload_staged'
  ) {
    return {
      label: stage.includes('attach') || stage.includes('upload') ? 'Anexando refs…' : 'Preparando…',
      tone: 'running',
      detail: attempt.failureDetail,
    }
  }
  if (attempt.state === 'submitting' || stage === 'prompt_generate') {
    return { label: 'Enviando prompt…', tone: 'running' }
  }
  if (attempt.state === 'generating' || stage === 'observe' || stage === 'generating') {
    const pct =
      typeof attempt.progressPercent === 'number' && Number.isFinite(attempt.progressPercent)
        ? Math.round(attempt.progressPercent)
        : null
    return {
      label: pct != null ? `Gerando… ${pct}%` : 'Gerando…',
      tone: 'running',
    }
  }
  if (
    attempt.state === 'retrieving' ||
    stage === 'capture_bytes' ||
    stage === 'observe_capture' ||
    stage === 'receiving_image' ||
    stage === 'result_staged'
  ) {
    return { label: 'Recebendo imagens…', tone: 'running' }
  }
  return { label: 'Em andamento', tone: 'running' }
}

function isAttemptInflight(
  attempt: BenchSnapshot['prompts'][number]['activeAttempt'],
): boolean {
  if (!attempt) return false
  if (isTerminalAttemptState(attempt.state)) return false
  if (attempt.failureCode) return false
  return true
}

/**
 * Linha já enviada ao Flow (geração aceita ou com imagem salva): sai da lista de números
 * e o lote não a manda de novo — a seta retoma só o que falta, sem gastar crédito duas vezes.
 * Linhas que falharam antes do envio (not_sent) continuam pendentes.
 */
function lineAlreadySent(line: BenchSnapshot['prompts'][number]): boolean {
  const attempt = line.activeAttempt
  if (attempt) {
    if (attempt.submissionCertainty === 'accepted') return true
    if (attempt.submissionCertainty === 'may_have_sent') return true
    if (attempt.state === 'submission_uncertain') return true
  }
  return line.results.some((result) => result.retrievalState === 'retrieved')
}

function inferPromptSceneSubject(rawText: string | null | undefined): 'singer' | 'band' | null {
  const text = String(rawText || '').trim()
  if (!text) return null
  if (
    /\[cantor\]|@cantor|\[microfone\]|@microfone|\b(singer|vocalist|lead\s+vocal|cantor|cantora)\b/i.test(
      text,
    ) &&
    !/\b(without\s+sing|no\s+singer|sem\s+cantor|sem\s+cantar)\b/i.test(text)
  ) {
    return 'singer'
  }
  if (
    /\[banda\]|@banda|\[cenario\]|@cenario|\b(band|banda|drummer|bateria|trumpeter|trompete|guitarist|guitarra|bassist|baixo|pianist|piano|violin|violino|orchestra|orquestra|instrumental)\b/i.test(
      text,
    )
  ) {
    return 'band'
  }
  return null
}

/**
 * Bancada Atlas Flow v1 — gera via Coordinator + extensão (adaptador existente).
 * Design igual ao Google Flow: fundo preto, galeria de imagens acima, barra de prompt abaixo.
 */
export function FlowPromptsPage() {
  const api = getAtlasApi()
  const { push, pushError } = useToast()
  const [snap, setSnap] = useState<BenchSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [benchOpen, setBenchOpen] = useState(false)
  const [galleryGroupId, setGalleryGroupId] = useState<string | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [diagOpen, setDiagOpen] = useState(false)
  const [previewResult, setPreviewResult] = useState<BenchSnapshot['prompts'][number]['results'][number] | null>(
    null,
  )
  const [downloadingResultId, setDownloadingResultId] = useState<string | null>(null)
  const [sendingLipSyncId, setSendingLipSyncId] = useState<string | null>(null)
  const [deletingSlotKey, setDeletingSlotKey] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<
    | {
        kind: 'image'
        slotKey: string
        resultBindingId?: string | null
        attemptId?: string | null
        outputIndex?: number | null
        hasImage: boolean
      }
    | { kind: 'reference'; referenceId: string; name: string }
    | { kind: 'prompt'; promptId: string; position: number }
    | { kind: 'prompts-all'; count: number }
    | null
  >(null)
  const [composerLineId, setComposerLineId] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [linkingProject, setLinkingProject] = useState(false)
  const [creatingProject, setCreatingProject] = useState(false)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [busyPromptId, setBusyPromptId] = useState<string | null>(null)
  const [uploadingRefIds, setUploadingRefIds] = useState<string[]>([])
  const uploadingRefIdsRef = useRef<string[]>([])
  uploadingRefIdsRef.current = uploadingRefIds
  const ensureStartedForRef = useRef<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [selectedByPrompt, setSelectedByPrompt] = useState<Record<string, string[]>>({})
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null)
  const [renameAliasId, setRenameAliasId] = useState<string | null>(null)
  const [renameAliasValue, setRenameAliasValue] = useState('')
  const [historyPromptId, setHistoryPromptId] = useState<string | null>(null)
  const [archivedHistoryOpen, setArchivedHistoryOpen] = useState(true)
  const [explicitModalAttemptId, setExplicitModalAttemptId] = useState<string | null>(null)
  const [explicitSelectedKeys, setExplicitSelectedKeys] = useState<string[]>([])
  const [listingCandidates, setListingCandidates] = useState(false)
  const [reconnectHint, setReconnectHint] = useState(false)
  const lastProgressSeqRef = useRef<Record<string, number>>({})

  function logUi(message: string, level: 'info' | 'ok' | 'warn' | 'error' = 'info') {
    if (level === 'error') console.error('[atlas-flow]', message)
    else if (level === 'warn') console.warn('[atlas-flow]', message)
    else console.log('[atlas-flow]', message)
  }
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [imageSettings, setImageSettings] = useState<FlowImageSettings>(DEFAULT_FLOW_IMAGE_SETTINGS)
  const imageSettingsRef = useRef(imageSettings)
  imageSettingsRef.current = imageSettings
  const [atlasProjectId, setAtlasProjectId] = useState('')
  const editingPromptIdRef = useRef<string | null>(null)
  editingPromptIdRef.current = editingPromptId
  const draftsRef = useRef(drafts)
  draftsRef.current = drafts
  const selectedByPromptRef = useRef(selectedByPrompt)
  selectedByPromptRef.current = selectedByPrompt
  const dirtyPromptIdsRef = useRef<Set<string>>(new Set())
  const batchRef = useRef<{
    ids: string[]
    attemptByPrompt: Map<string, string>
    active: boolean
  } | null>(null)
  const batchPumpingRef = useRef(false)
  const [batchActive, setBatchActive] = useState(false)
  const [cancelingBatch, setCancelingBatch] = useState(false)
  const benchRefreshTimerRef = useRef<number | null>(null)

  const refresh = useCallback(async (opts?: { force?: boolean }) => {
    if (!opts?.force && editingPromptIdRef.current) {
      return
    }
    try {
      const next = (await api.atlasFlowV1.getBenchSnapshot(
        atlasProjectId || undefined,
      )) as BenchSnapshot
      setSnap(next)
      const dirty = dirtyPromptIdsRef.current
      setDrafts((prev) => {
        let changed = false
        const merged = { ...prev }
        const alive = new Set(next.prompts.map((line) => line.promptId))
        for (const line of next.prompts) {
          if (dirty.has(line.promptId)) continue
          if (merged[line.promptId] !== line.draftText) {
            merged[line.promptId] = line.draftText
            changed = true
          }
        }
        for (const id of Object.keys(merged)) {
          if (!alive.has(id)) {
            delete merged[id]
            changed = true
          }
        }
        return changed ? merged : prev
      })
      setSelectedByPrompt((prev) => {
        let changed = false
        const merged = { ...prev }
        const available = next.references.filter(refSelectable)
        for (const line of next.prompts) {
          if (dirty.has(line.promptId)) continue
          const aliasPick = resolveLineAliases(line.draftText, next.references || [])
          const fromAliases =
            aliasPick.ok && aliasPick.referenceIds.length > 0
              ? aliasPick.referenceIds.filter((id) => available.some((r) => r.referenceId === id))
              : []
          const fromSnap = line.selectedReferenceIds.filter((id) =>
            available.some((r) => r.referenceId === id),
          )
          // Só o que o prompt pede nos []. Sem colchete, mantém o snapshot da linha.
          const nextIds = fromAliases.length > 0 ? fromAliases : fromSnap
          const cur = merged[line.promptId] || []
          const same =
            cur.length === nextIds.length && cur.every((id, index) => id === nextIds[index])
          if (!same) {
            merged[line.promptId] = nextIds
            changed = true
          }
        }
        return changed ? merged : prev
      })
    } catch (error) {
      console.error('[atlas-flow] snapshot', error)
    } finally {
      setLoading(false)
    }
  }, [api, atlasProjectId])

  useEffect(() => {
    if (!atlasProjectId) return
    setImageSettings(
      readStoredFlowImageSettings(
        window.localStorage.getItem(flowImageSettingsStorageKey(atlasProjectId)),
      ),
    )
  }, [atlasProjectId])

  useEffect(() => {
    const ids = (snap?.prompts || []).map((line) => line.promptId)
    if (ids.length === 0) return
    if (!composerLineId || !ids.includes(composerLineId)) {
      setComposerLineId(ids[ids.length - 1])
    }
  }, [snap?.prompts, composerLineId])

  function updateImageSettings(next: FlowImageSettings) {
    imageSettingsRef.current = next
    setImageSettings(next)
    if (!atlasProjectId) return
    try {
      window.localStorage.setItem(flowImageSettingsStorageKey(atlasProjectId), JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const [list, channelList] = await Promise.all([
          api.projects.list({ projectType: 'music', workspace: 'flow' }) as Promise<Project[]>,
          api.channels.list({ channelType: 'music' }) as Promise<Channel[]>,
        ])
        setProjects(list || [])
        setChannels((channelList || []).filter((channel) => channel.active !== false))
      } catch (error) {
        console.error('[atlas-flow] falha ao listar projetos', error)
        setProjects([])
      }
    })()
  }, [api])

  const hasInflightAttempt = (snap?.prompts || []).some((line) =>
    isAttemptInflight(line.activeAttempt),
  )

  useEffect(() => {
    if (!benchOpen) return
    void refresh({ force: true })
  }, [refresh, benchOpen])

  useEffect(() => {
    if (!benchOpen) return
    const phase = snap?.connection?.phase
    const fastPoll =
      phase === 'connecting' ||
      phase === 'awaiting_login' ||
      connecting ||
      hasInflightAttempt
    const id = window.setInterval(() => {
      if (editingPromptIdRef.current) return
      void refresh()
    }, fastPoll ? 2500 : 5000)
    return () => window.clearInterval(id)
  }, [refresh, snap?.connection?.phase, connecting, hasInflightAttempt, benchOpen])

  useEffect(() => {
    const apiAny = api.atlasFlowV1 as {
      onBenchUpdate?: (cb: (event: Record<string, unknown>) => void) => () => void
    }
    if (typeof apiAny.onBenchUpdate !== 'function') return
    const unsubscribe = apiAny.onBenchUpdate((event) => {
      if (event.kind === 'flow-project-removed' && typeof event.atlasProjectId === 'string') {
        const removedId = event.atlasProjectId
        setProjects((prev) => (prev || []).filter((item) => item.id !== removedId))
        if (atlasProjectId === removedId) leaveBench()
        return
      }
      if (editingPromptIdRef.current) return
      const attemptId = typeof event.attemptId === 'string' ? event.attemptId : null
      const sequence = typeof event.sequence === 'number' ? event.sequence : 0
      if (attemptId) {
        const prev = lastProgressSeqRef.current[attemptId] || 0
        if (sequence > 0 && sequence < prev) return
        if (sequence > 0) lastProgressSeqRef.current[attemptId] = sequence
      }
      if (benchRefreshTimerRef.current != null) {
        window.clearTimeout(benchRefreshTimerRef.current)
      }
      benchRefreshTimerRef.current = window.setTimeout(() => {
        benchRefreshTimerRef.current = null
        if (editingPromptIdRef.current) return
        void refresh()
      }, 200)
    })
    return () => {
      unsubscribe()
      if (benchRefreshTimerRef.current != null) {
        window.clearTimeout(benchRefreshTimerRef.current)
        benchRefreshTimerRef.current = null
      }
    }
  }, [api, refresh, atlasProjectId])

  useEffect(() => {
    const connected = snap?.coordinator?.extensionConnected === true
    if (!connected && hasInflightAttempt) {
      setReconnectHint(true)
      return
    }
    if (connected) setReconnectHint(false)
  }, [snap?.coordinator?.extensionConnected, hasInflightAttempt])

  const projectLinked = Boolean(snap?.link?.flowProjectId)
  const flowReady =
    snap?.connection?.phase === 'connected' &&
    snap?.connection?.sessionUsable === true &&
    snap?.coordinator.extensionConnected === true
  const canUseBench = Boolean(atlasProjectId && projectLinked && flowReady)
  const autoRecoveredAttemptsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!canUseBench || !snap?.prompts) return
    for (const line of snap.prompts) {
      const att = line.activeAttempt
      if (!att) continue
      const needsAutoRecover =
        (att.state === 'partial' ||
          att.failureCode === 'IDENTITY_UNCERTAIN' ||
          att.failureCode === 'CAPTURE_INCOMPLETE') &&
        (att.retrievedOutputs ?? 0) === 0
      if (!needsAutoRecover) continue
      if (autoRecoveredAttemptsRef.current.has(att.attemptId)) continue
      autoRecoveredAttemptsRef.current.add(att.attemptId)
      void api.atlasFlowV1.enqueueRecover(att.attemptId).then(() => {
        void refresh()
      })
      break
    }
  }, [canUseBench, snap?.prompts, api, refresh])

  const canGenerate = useMemo(() => {
    if (!canUseBench || !snap) return false
    return snap.references.some(refSelectable)
  }, [canUseBench, snap])

  const stagedCount = useMemo(
    () => (snap?.references || []).filter((r) => !refIsOnFlow(r)).length,
    [snap],
  )

  const connection = snap?.connection
  const connectPhase = connection?.phase || 'idle'
  const showReconnect =
    connectPhase === 'browser_unavailable' ||
    connectPhase === 'extension_missing' ||
    (connectPhase === 'idle' && connection?.hasPairedInstallation === true)

  useEffect(() => {
    if (!benchOpen || !atlasProjectId || !flowReady || projectLinked || linkingProject) return
    if (ensureStartedForRef.current === atlasProjectId) return
    ensureStartedForRef.current = atlasProjectId
    void (async () => {
      setLinkingProject(true)
      logUi(`Vinculando projeto Atlas ${atlasProjectId.slice(0, 8)}… no Flow`)
      try {
        const ok = await waitForProjectLink(atlasProjectId)
        if (ok) {
          push('Projeto vinculado ao Flow. Agora adicione referências e prompts.', 'success')
        }
      } finally {
        setLinkingProject(false)
      }
    })()
  }, [atlasProjectId, flowReady, projectLinked, linkingProject, benchOpen])

  async function onConnectGoogleFlow() {
    setConnecting(true)
    try {
      await api.atlasFlowV1.connectGoogleFlow()
      await refresh()
    } catch (error) {
      pushError(error, 'Não foi possível iniciar a conexão com o Google Flow.')
    } finally {
      setConnecting(false)
    }
  }

  async function ensureDefaultPrompt() {
    if (!snap?.link?.flowProjectId) return
    if (snap.prompts.length > 0) return
    await api.atlasFlowV1.createPromptLine({
      atlasProjectId: snap.atlasProjectId,
      text: '',
      selectedReferenceIds: [],
    })
    await refresh()
  }

  useEffect(() => {
    if (!loading && snap?.link?.flowProjectId && snap.prompts.length === 0) {
      void ensureDefaultPrompt()
    }
  }, [loading, snap?.link?.flowProjectId, snap?.prompts.length])

  async function saveDraft(promptId: string) {
    if (!snap) return
    const text = draftsRef.current[promptId] ?? ''
    const selected = selectedByPrompt[promptId] || []
    const result = await api.atlasFlowV1.updatePromptDraft({
      promptId,
      text,
      selectedReferenceIds: selected,
    })
    if (!result?.ok) {
      push(
        result?.error === 'PROMPT_LOCKED_BY_ATTEMPT'
          ? 'Prompt bloqueado enquanto a geração corre.'
          : 'Não foi possível salvar o rascunho.',
      )
      return
    }
    dirtyPromptIdsRef.current.delete(promptId)
    await refresh({ force: true })
  }

  async function waitForProjectLink(projectId: string): Promise<boolean> {
    let linked = Boolean(snap?.link?.flowProjectId)
    if (linked) {
      logUi(`Projeto já vinculado: ${snap?.link?.flowProjectId}`, 'ok')
      return true
    }
    logUi(`project.ensure para ${projectId}…`)
    const ensured = await api.atlasFlowV1.ensureProject({
      atlasProjectId: projectId,
      requestedTitle: snap?.projectName || (projects || []).find((p) => p.id === projectId)?.name,
    })
    logUi(
      `ensureProject → ok=${String(ensured?.ok)} cmd=${ensured?.commandId || 'já-vinculado'} err=${ensured?.error || '—'}`,
      ensured?.ok ? 'ok' : 'error',
    )
    if (!ensured?.ok) {
      push(String(ensured?.error || 'Não foi possível vincular o projeto no Flow.'))
      return false
    }
    const cmdId = ensured?.commandId || null
    for (let i = 0; i < 24; i += 1) {
      await new Promise((r) => setTimeout(r, 1500))
      const next = (await api.atlasFlowV1.getBenchSnapshot(projectId)) as BenchSnapshot
      setSnap(next)
      if (next.link?.flowProjectId) {
        logUi(`Vínculo confirmado: ${next.link.flowProjectId}`, 'ok')
        return true
      }
      const related = (next.recentActivity || []).filter(
        (a) =>
          (a.kind === 'command' && a.operation === 'project.ensure') ||
          (a.kind === 'event' && String(a.eventType || '').includes('project')),
      )
      const failedCmd = related.find(
        (a) =>
          a.kind === 'command' &&
          a.status === 'failed' &&
          (!cmdId || a.commandId === cmdId || !a.commandId),
      )
      const linkFailed =
        next.link?.linkState === 'failed' || next.link?.linkState === 'uncertain'
      if (failedCmd || linkFailed) {
        const detail =
          next.link?.lastError ||
          failedCmd?.detail ||
          'project_ensure_failed'
        logUi(`project.ensure falhou: ${detail}`, 'error')
        const detailText = String(detail)
        push(
          detailText.includes('CONTROL_NOT_FOUND') || detailText.includes('HOME_NAV')
            ? 'Não achei “+ Novo projeto” na home do Flow. Abra flow.google.com (página inicial, não um projeto antigo) e tente Vincular de novo.'
            : `Falha ao criar projeto no Flow: ${detailText.slice(0, 280)}`,
        )
        return false
      }
      const last = related[0]
      logUi(
        `Aguardando vínculo… (${i + 1}/24) cmd=${last?.status || last?.eventType || '—'} ${last?.detail || ''}`,
      )
    }
    push('Aguardando vínculo do projeto no Flow. Tente de novo em instantes.')
    logUi('Timeout aguardando flowProjectId', 'error')
    return false
  }

  async function onGenerate(promptId: string, mode: 'line' | 'single' = 'line') {
    if (!snap) return
    if (connectPhase !== 'connected') {
      push('Conecte o Google Flow antes de gerar.')
      return
    }
    if (!atlasProjectId) {
      push('Selecione um projeto Atlas.')
      return
    }
    const line = (snap.prompts || []).find((item) => item.promptId === promptId)
    const text = drafts[promptId] ?? line?.draftText ?? ''
    const aliasResolved = resolveLineAliases(text, snap.references || [])
    if (!aliasResolved.ok) {
      push(aliasResolved.message)
      logUi(`aliases → ${aliasResolved.error}: ${aliasResolved.message}`, 'error')
      return
    }

    let selected =
      aliasResolved.aliases.length > 0
        ? aliasResolved.referenceIds
        : selectedByPrompt[promptId] || line?.selectedReferenceIds || []
    if (selected.length < 1) {
      push(
        aliasResolved.aliases.length > 0
          ? 'Os aliases do prompt não resolveram referências utilizáveis.'
          : 'Selecione referências nesta linha ou use [alias] no texto.',
      )
      return
    }
    const notSelectable = selected.filter((id) => {
      const ref = (snap.references || []).find((r) => r.referenceId === id)
      return !ref || !refSelectable(ref)
    })
    if (notSelectable.length > 0) {
      push('Há referência selecionada que ainda não pode ser enviada.')
      return
    }
    setSelectedByPrompt((prev) => ({ ...prev, [promptId]: selected }))
    logUi(
      `Gerar linha ${promptId.slice(0, 8)}… refs=${selected.length} aliases=[${aliasResolved.aliases.join(',') || '—'}] textLen=${text.trim().length}`,
    )
    setBusyPromptId(promptId)
    try {
      if (!(await waitForProjectLink(atlasProjectId))) return

      const draftResult = await api.atlasFlowV1.updatePromptDraft({
        promptId,
        text,
        selectedReferenceIds: selected,
      })
      logUi(
        `updatePromptDraft → ok=${String(draftResult?.ok)} err=${draftResult?.error || '—'}`,
        draftResult?.ok ? 'ok' : 'error',
      )
      if (!draftResult?.ok) {
        push(
          draftResult?.error === 'PROMPT_LOCKED_BY_ATTEMPT'
            ? 'Prompt bloqueado enquanto a geração corre.'
            : 'Não foi possível salvar o rascunho.',
        )
        return
      }

      const result = await api.atlasFlowV1.enqueueGenerate({
        promptId,
        imageSettings:
          mode === 'single'
            ? { ...imageSettingsRef.current, outputs: 1 }
            : imageSettingsRef.current,
      })
      logUi(
        `enqueueGenerate → ok=${String(result?.ok)} attempt=${result?.attemptId || '—'} cmd=${result?.commandId || '—'} err=${result?.error || '—'}`,
        result?.ok ? 'ok' : 'error',
      )
      if (!result?.ok) {
        push(
          result?.error === 'ATTEMPT_ALREADY_ACTIVE'
            ? 'Já existe uma geração ativa nesta linha.'
            : result?.error === 'PROJECT_NOT_LINKED'
              ? 'Vínculo do Flow ainda não entrou na bancada. Clique Vincular de novo (ou reinicie o Atlas) e tente Gerar.'
              : result?.error === 'REFERENCES_REQUIRED'
                ? 'Selecione referências nesta linha ou use [alias] no texto.'
                : result?.error === 'ALIAS_NOT_FOUND' || result?.error === 'ALIAS_AMBIGUOUS'
                  ? String(result?.message || result?.error)
                  : String(result?.error || 'Falha ao iniciar a geração.'),
        )
        return
      }
      if (Array.isArray(result.selectedReferenceIds) && result.selectedReferenceIds.length > 0) {
        setSelectedByPrompt((prev) => ({
          ...prev,
          [promptId]: result.selectedReferenceIds as string[],
        }))
      }
      push(
        mode === 'single'
          ? 'Gerando só esta imagem.'
          : 'Geração iniciada. A extensão executa com o popup fechado.',
        'success',
      )
      editingPromptIdRef.current = null
      setEditingPromptId(null)
      await refresh({ force: true })
    } catch (error) {
      logUi(`Exceção no Gerar: ${error instanceof Error ? error.message : String(error)}`, 'error')
      pushError(error, 'Falha ao gerar.')
    } finally {
      setBusyPromptId(null)
    }
  }

  async function onUploadStaged(onlyIds?: string[]) {
    if (!snap) return
    if (connectPhase !== 'connected') {
      await onConnectGoogleFlow()
    }
    if (!atlasProjectId) {
      push('Selecione um projeto Atlas.')
      return
    }
    const wanted = (onlyIds || []).filter(Boolean)
    const already = uploadingRefIdsRef.current
    const staged = snap.references.filter(
      (r) =>
        !refIsOnFlow(r) &&
        !already.includes(r.referenceId) &&
        (wanted.length === 0 || wanted.includes(r.referenceId)),
    )
    const stagedIds = staged.map((r) => r.referenceId)
    if (stagedIds.length === 0) {
      push('Não há referências pendentes de envio.')
      return
    }
    uploadingRefIdsRef.current = [...new Set([...already, ...stagedIds])]
    setUploadingRefIds(uploadingRefIdsRef.current)
    logUi(
      `Enviar staged: ${staged.map((r) => `${r.displayName}(${r.referenceId.slice(0, 8)})`).join(', ')}`,
    )
    logUi(
      `ext=${String(snap.coordinator.extensionConnected)} executor=${snap.coordinator.activeExecutorInstallationId || '—'} link=${snap.link?.flowProjectId || 'não'}`,
    )
    try {
      if (!(await waitForProjectLink(atlasProjectId))) return
      const result = await api.atlasFlowV1.enqueueUploadStaged({
        atlasProjectId,
        referenceIds: stagedIds,
      })
      logUi(
        `enqueueUploadStaged → ok=${String(result?.ok)} cmd=${result?.commandId || '—'} err=${result?.error || '—'}`,
        result?.ok ? 'ok' : 'error',
      )
      if (!result?.ok) {
        push(String(result?.error || 'Falha ao enviar referências.'))
        return
      }
      push('Envio iniciado no Flow. Aguarde o status mudar para Pronta.', 'success')
      for (let i = 0; i < 75; i += 1) {
        await new Promise((r) => setTimeout(r, 2000))
        const next = (await api.atlasFlowV1.getBenchSnapshot(atlasProjectId)) as BenchSnapshot
        setSnap(next)
        const tracked = next.references.filter((r) => stagedIds.includes(r.referenceId))
        const pending = tracked.filter((r) => !refIsOnFlow(r) && r.uploadState !== 'character_ready')
        const lastCmd = (next.recentActivity || []).find(
          (a) => a.kind === 'command' && a.operation === 'references.upload',
        )
        logUi(
          `poll ${i + 1}/75: pending=${pending.length} states=[${tracked
            .map((r) => `${r.alias}:${r.uploadState}`)
            .join(', ')}] cmd=${lastCmd?.status || '—'} dig=${lastCmd?.detail || '—'}`,
        )
        if (pending.length === 0) {
          const ready = tracked.filter((r) => refReady(r))
          const uncertain = tracked.filter((r) => r.uploadState === 'upload_uncertain')
          if (ready.length > 0) {
            logUi(`${ready.length} referência(s) Pronta no Flow`, 'ok')
            push(`${ready.length} referência(s) pronta(s) no Flow.`, 'success')
          } else {
            logUi(
              `Envio saiu de staged sem bound. uncertain=${uncertain.length} activity=${JSON.stringify(
                (next.recentActivity || []).slice(0, 4),
              )}`,
              'warn',
            )
            push(
              'Envio concluído com estado incerto — veja o log e use Gerar para reconciliar.',
              'error',
            )
          }
          return
        }
      }
      logUi('Timeout: ainda staged_local após ~48s', 'warn')
      push('Envio ainda em andamento. Confira o log abaixo.')
    } catch (error) {
      logUi(`Exceção no envio: ${error instanceof Error ? error.message : String(error)}`, 'error')
      pushError(error, 'Falha ao enviar referências.')
    } finally {
      uploadingRefIdsRef.current = uploadingRefIdsRef.current.filter((id) => !stagedIds.includes(id))
      setUploadingRefIds(uploadingRefIdsRef.current)
    }
  }

  async function onCancelAttempt(attemptId: string) {
    setBusyPromptId(attemptId)
    try {
      const result = await api.atlasFlowV1.cancelAttempt(attemptId)
      logUi(
        `cancelAttempt → ok=${String(result?.ok)} cmds=${result?.canceledCommands ?? '—'} err=${result?.error || '—'}`,
        result?.ok ? 'ok' : 'error',
      )
      if (!result?.ok) {
        push(String(result?.error || 'Não foi possível cancelar.'))
        return
      }
      try {
        const cleared = await api.atlasFlowV1.enqueueClearComposer()
        logUi(
          `clearComposer → ok=${String(cleared?.ok)} cmd=${cleared?.commandId || '—'}`,
          cleared?.ok ? 'ok' : 'error',
        )
      } catch {
        /* cancelamento já valeu; limpar anexos é melhor esforço */
      }
      push('Geração cancelada. Removendo os prompts anexados no Flow…', 'success')
      await refresh()
    } catch (error) {
      pushError(error, 'Falha ao cancelar.')
    } finally {
      setBusyPromptId(null)
    }
  }

  async function onRecover(attemptId: string) {
    setBusyPromptId(attemptId)
    try {
      const result = await api.atlasFlowV1.enqueueRecover(attemptId)
      if (!result?.ok) {
        push(String(result?.error || 'Recuperação indisponível.'))
        return
      }
      push('Recuperação automática solicitada (somente com origem comprovada).', 'success')
      await refresh()
    } catch (error) {
      pushError(error, 'Falha ao recuperar.')
    } finally {
      setBusyPromptId(null)
    }
  }

  async function onOpenExplicitSelection(attemptId: string) {
    setExplicitModalAttemptId(attemptId)
    setExplicitSelectedKeys([])
    setListingCandidates(true)
    try {
      const res = await api.atlasFlowV1.listRecoveryCandidates(attemptId)
      if (!res?.ok) {
        push(String(res?.error || 'Não foi possível solicitar candidatos da página do Flow.'))
      } else {
        push('Inspecionando resultados visíveis no Flow (sem gerar novamente)…', 'success')
      }
      await refresh({ force: true })
    } catch (error) {
      pushError(error, 'Falha ao listar candidatos no Flow.')
    } finally {
      setListingCandidates(false)
    }
  }

  async function onConfirmExplicitSelection(attemptId: string) {
    if (explicitSelectedKeys.length === 0) {
      push('Selecione ao menos uma imagem observada no Flow.')
      return
    }
    setBusyPromptId(attemptId)
    try {
      const res = await api.atlasFlowV1.recoverExplicitSelection({
        attemptId,
        candidateKeys: explicitSelectedKeys,
        allowKnownSha: true,
      })
      if (!res?.ok) {
        push(String(res?.error || 'Falha ao enviar seleção explícita.'))
        return
      }
      push(
        `Recuperando ${explicitSelectedKeys.length} imagem(ns) por seleção explícita (sem regenerar).`,
        'success',
      )
      setExplicitModalAttemptId(null)
      setExplicitSelectedKeys([])
      await refresh({ force: true })
    } catch (error) {
      pushError(error, 'Falha na recuperação por seleção explícita.')
    } finally {
      setBusyPromptId(null)
    }
  }

  const parsedDocument = useMemo(() => {
    const fromDoc = parseFlowPromptsForImport(importText)
    if (fromDoc.length > 0) return fromDoc
    return splitPromptBlocks(importText).map((text, index) => ({ number: index + 1, text }))
  }, [importText])

  async function onPickDirectionDocument() {
    try {
      const picked = await api.atlasFlowV1.pickDirectionDocument()
      if (!picked?.text) return
      setImportText(picked.text)
      setImportOpen(true)
    } catch (error) {
      pushError(error, 'Não foi possível abrir o documento.')
    }
  }

  async function onImport() {
    if (!snap) return
    if (!canUseBench) {
      push('Vincule o projeto ao Flow antes de importar prompts.')
      return
    }
    if (parsedDocument.length === 0) {
      push('Nenhum prompt FLOW encontrado. Use o documento com CENA e o bloco FLOW, ou uma lista 1- 2- 3-.')
      return
    }
    // Os [] de cada bloco FLOW definem as refs. Sem colchete, a linha fica sem vínculo.
    const result = await api.atlasFlowV1.importPromptBlocks({
      atlasProjectId: snap.atlasProjectId,
      numbered: parsedDocument,
      selectedReferenceIds: [],
    })
    setImportText('')
    setImportOpen(false)
    dirtyPromptIdsRef.current.clear()
    setDrafts({})
    setSelectedByPrompt({})
    const created = Number(result?.created || 0)
    const updated = Number(result?.updated || 0)
    push(
      updated > 0
        ? `${parsedDocument.length} prompts FLOW. ${created} novos, ${updated} atualizados.`
        : `${parsedDocument.length} prompts FLOW do documento.`,
      'success',
    )
    await refresh({ force: true })
  }

  async function enqueueBatchPrompt(
    promptId: string,
    snapshot: BenchSnapshot,
  ): Promise<{ ok: boolean; attemptId?: string }> {
    const line = snapshot.prompts.find((item) => item.promptId === promptId)
    if (!line) return { ok: false }
    if (isAttemptInflight(line.activeAttempt)) {
      return { ok: true, attemptId: line.activeAttempt?.attemptId }
    }
    const text = (draftsRef.current[promptId] ?? line.draftText).trim()
    if (!text) return { ok: false }
    const aliasResolved = resolveLineAliases(text, snapshot.references || [])
    if (!aliasResolved.ok) {
      push(aliasResolved.message)
      return { ok: false }
    }
    let selected =
      aliasResolved.aliases.length > 0
        ? aliasResolved.referenceIds
        : selectedByPromptRef.current[promptId] || line.selectedReferenceIds || []
    if (selected.length < 1) {
      push(
        `O prompt ${line.position} precisa de [alias] no texto (ex.: [cenario] [banda] [cantor] [microfone]).`,
      )
      return { ok: false }
    }
    const draftResult = await api.atlasFlowV1.updatePromptDraft({
      promptId,
      text,
      selectedReferenceIds: selected,
    })
    if (!draftResult?.ok) {
      push(
        draftResult?.error === 'PROMPT_LOCKED_BY_ATTEMPT'
          ? `Prompt ${line.position} ainda está gerando.`
          : `Não foi possível salvar o prompt ${line.position}.`,
      )
      return { ok: false }
    }
    dirtyPromptIdsRef.current.delete(promptId)
    const result = await api.atlasFlowV1.enqueueGenerate({
      promptId,
      imageSettings: imageSettingsRef.current,
    })
    if (!result?.ok) {
      push(
        result?.error === 'ATTEMPT_ALREADY_ACTIVE'
          ? `Prompt ${line.position} já está na fila.`
          : `Não foi possível gerar o prompt ${line.position}.`,
      )
      return {
        ok: result?.error === 'ATTEMPT_ALREADY_ACTIVE',
        attemptId: result?.attemptId,
      }
    }
    return { ok: true, attemptId: result.attemptId }
  }

  function batchAttemptSettled(
    job: { attemptByPrompt: Map<string, string> },
    line: BenchSnapshot['prompts'][number] | undefined,
    promptId: string,
  ): boolean {
    const expected = job.attemptByPrompt.get(promptId)
    const attempt = line?.activeAttempt
    if (!expected || !attempt || attempt.attemptId !== expected) return false
    if (attempt.state === 'submission_uncertain') return false
    return isTerminalAttemptState(attempt.state) || Boolean(attempt.failureCode)
  }

  /** Extensão já clicou Gerar e entrou em observe/generating (ou já terminou/falhou). */
  function batchGenerationStarted(
    attempt: BenchSnapshot['prompts'][number]['activeAttempt'] | undefined,
    expectedAttemptId: string,
  ): boolean {
    if (!attempt || attempt.attemptId !== expectedAttemptId) return false
    if (attempt.failureCode || isTerminalAttemptState(attempt.state)) return true
    if (attempt.state === 'submission_uncertain') return true
    const stage = String(attempt.executionStage || '')
    if (
      attempt.state === 'generating' ||
      attempt.state === 'retrieving' ||
      attempt.state === 'partial' ||
      stage === 'observe' ||
      stage === 'generating' ||
      stage === 'capture_bytes' ||
      stage === 'observe_capture' ||
      stage === 'receiving_image' ||
      stage === 'result_staged'
    ) {
      return true
    }
    return false
  }

  async function clearComposerForBatch(reason: string) {
    let commandId: string | undefined
    try {
      const cleared = await api.atlasFlowV1.enqueueClearComposer()
      commandId = cleared?.commandId
      logUi(
        `clearComposer (${reason}) → ok=${String(cleared?.ok)} cmd=${commandId || '—'}`,
        cleared?.ok ? 'ok' : 'error',
      )
    } catch (error) {
      logUi(
        `clearComposer (${reason}) → ${error instanceof Error ? error.message : String(error)}`,
        'error',
      )
    }
    if (commandId && atlasProjectId) {
      const deadline = Date.now() + 6_000
      while (Date.now() < deadline) {
        await sleep(FLOW_BATCH_CLEAR_MS)
        const next = (await api.atlasFlowV1.getBenchSnapshot(atlasProjectId)) as BenchSnapshot | null
        const cmd = next?.recentActivity?.find(
          (item) => item.kind === 'command' && item.commandId === commandId,
        )
        if (cmd && (cmd.status === 'completed' || cmd.status === 'failed')) {
          break
        }
      }
    } else {
      await sleep(FLOW_BATCH_CLEAR_MS)
    }
  }

  /**
   * Espera a extensão confirmar que a geração do attempt já começou.
   * O próximo prompt só sai da fila depois desse sinal — não espera a imagem terminar.
   */
  async function waitForBatchGenerationStarted(
    atlasProjectId: string,
    promptId: string,
    attemptId: string,
    currentSnap: BenchSnapshot,
  ): Promise<{ started: boolean; snap: BenchSnapshot; uncertain?: boolean }> {
    let latest = currentSnap
    const deadline = Date.now() + FLOW_BATCH_START_TIMEOUT_MS
    let lastProgressKey = ''
    let lastProgressAt = Date.now()
    while (Date.now() < deadline && Date.now() - lastProgressAt < FLOW_BATCH_START_STALL_MS) {
      const job = batchRef.current
      if (!job?.active) return { started: false, snap: latest }

      const next = (await api.atlasFlowV1.getBenchSnapshot(atlasProjectId)) as BenchSnapshot | null
      if (next) {
        latest = next
        setSnap(next)
        const line = next.prompts.find((item) => item.promptId === promptId)
        const attempt = line?.activeAttempt
        if (attempt?.attemptId === attemptId && attempt.state === 'submission_uncertain') {
          return { started: false, snap: latest, uncertain: true }
        }
        if (batchGenerationStarted(attempt, attemptId)) {
          return { started: true, snap: latest }
        }
        const progressKey = `${attempt?.state || ''}|${attempt?.executionStage || ''}`
        if (progressKey !== lastProgressKey) {
          lastProgressKey = progressKey
          lastProgressAt = Date.now()
        }
        const status = attemptStatus(attempt ?? null)
        logUi(
          `lote aguarda início → attempt=${attemptId.slice(0, 8)} state=${attempt?.state || '—'} stage=${attempt?.executionStage || '—'} (${status.label})`,
        )
      }
      await sleep(FLOW_BATCH_START_POLL_MS)
    }
    return { started: false, snap: latest }
  }

  /**
   * Lote sequencial: limpa → gera → espera a extensão iniciar a geração → próximo na fila.
   * Não espera a imagem terminar.
   */
  async function runBatchSequential(snapshot: BenchSnapshot) {
    const job = batchRef.current
    if (!job?.active || batchPumpingRef.current) return
    batchPumpingRef.current = true
    try {
      let currentSnap = snapshot
      for (let index = 0; index < job.ids.length; index += 1) {
        if (!job.active) break
        const id = job.ids[index]
        if (job.attemptByPrompt.has(id)) continue
        // Número da linha (o mesmo da barra), não a posição dentro do lote retomado.
        const linePos =
          currentSnap.prompts.find((item) => item.promptId === id)?.position ?? index + 1

        setComposerLineId(id)
        if (!job.active) break

        const refreshed = (await api.atlasFlowV1.getBenchSnapshot(
          currentSnap.atlasProjectId,
        )) as BenchSnapshot | null
        if (refreshed) currentSnap = refreshed

        const queued = await enqueueBatchPrompt(id, currentSnap)
        if (!job.active) {
          if (queued.attemptId) await api.atlasFlowV1.cancelAttempt(queued.attemptId)
          break
        }
        if (!queued.ok || !queued.attemptId) {
          job.active = false
          setBatchActive(false)
          push(`Lote interrompido na linha ${linePos}. Clique na seta para continuar de onde parou.`)
          break
        }
        job.attemptByPrompt.set(id, queued.attemptId)
        logUi(`lote → linha ${linePos} (${index + 1}/${job.ids.length}) enfileirada`, 'ok')

        const hasMore = job.ids.slice(index + 1).some((nextId) => !job.attemptByPrompt.has(nextId))
        if (hasMore && job.active) {
          push(
            `Linha ${linePos} na extensão. Próxima fica na fila até a geração iniciar…`,
          )
          const waited = await waitForBatchGenerationStarted(
            currentSnap.atlasProjectId,
            id,
            queued.attemptId,
            currentSnap,
          )
          currentSnap = waited.snap
          if (!job.active) break
          if (waited.uncertain) {
            job.active = false
            setBatchActive(false)
            push(
              `Lote pausado: envio da linha ${linePos} ficou incerto. Confira no Flow; a seta continua a partir da próxima.`,
            )
            break
          }
          if (!waited.started) {
            job.active = false
            setBatchActive(false)
            push(
              `Lote pausado na linha ${linePos}: a extensão ficou sem avançar. Clique na seta para continuar de onde parou.`,
            )
            break
          }
          logUi(
            `lote → geração iniciada na linha ${linePos}; liberando próxima`,
            'ok',
          )
        }
      }

      if (!job.active) return

      // Todos os cliques de gerar já foram; limpa o composer e acompanha o término.
      await clearComposerForBatch('fim do lote')
      const finalSnap = (await api.atlasFlowV1.getBenchSnapshot(
        currentSnap.atlasProjectId,
      )) as BenchSnapshot | null
      if (finalSnap) {
        setSnap(finalSnap)
        const lines = new Map(finalSnap.prompts.map((line) => [line.promptId, line]))
        const stillRunning = [...job.attemptByPrompt.keys()].some(
          (id) => !batchAttemptSettled(job, lines.get(id), id),
        )
        if (!stillRunning) {
          job.active = false
          setBatchActive(false)
          push('Lote concluído.', 'success')
        }
      }
    } finally {
      batchPumpingRef.current = false
    }
  }

  async function onGenerateBatch() {
    if (!snap) return
    if (!canUseBench) {
      push('Vincule o projeto ao Flow antes de gerar o lote.')
      return
    }
    if (connectPhase !== 'connected') {
      push('Conecte o Google Flow antes de gerar o lote.')
      return
    }
    if (!(await waitForProjectLink(snap.atlasProjectId))) return
    const ordered = [...snap.prompts].sort((a, b) => a.position - b.position)
    const withText = ordered.filter((line) =>
      (draftsRef.current[line.promptId] ?? line.draftText).trim(),
    )
    // Retoma de onde parou: linhas já enviadas ao Flow não entram de novo.
    const ids = withText.filter((line) => !lineAlreadySent(line)).map((line) => line.promptId)
    if (ids.length === 0) {
      push(
        withText.length > 0
          ? 'Todas as linhas já foram enviadas ao Flow. Use “Gerar de novo” no cartão para refazer uma imagem.'
          : 'Não há prompts para gerar. Coloque o documento primeiro.',
      )
      return
    }
    const attemptByPrompt = new Map<string, string>()
    batchRef.current = { ids, attemptByPrompt, active: true }
    setBatchActive(true)
    const skipped = withText.length - ids.length
    push(
      `${skipped > 0 ? `Continuando de onde parou (${skipped} já enviadas). ` : ''}Lote de ${ids.length} prompts. Um por vez: o próximo só sai da fila quando a extensão já tiver iniciado a geração.`,
      'success',
    )
    await runBatchSequential(snap)
    await refresh({ force: true })
  }

  async function stopBatch() {
    const job = batchRef.current
    if (job) job.active = false
    setBatchActive(false)
    const ids = job ? [...new Set(job.attemptByPrompt.values())] : []
    setCancelingBatch(true)
    try {
      let failed = 0
      for (const attemptId of ids) {
        try {
          const result = await api.atlasFlowV1.cancelAttempt(attemptId)
          logUi(
            `cancelBatch → ${attemptId.slice(0, 8)} ok=${String(result?.ok)} cmds=${result?.canceledCommands ?? '—'}`,
            result?.ok ? 'ok' : 'error',
          )
          if (!result?.ok) failed += 1
        } catch (error) {
          failed += 1
          logUi(
            `cancelBatch → ${attemptId.slice(0, 8)} ${error instanceof Error ? error.message : String(error)}`,
            'error',
          )
        }
      }
      const late = job
        ? [...job.attemptByPrompt.values()].filter((id) => !ids.includes(id))
        : []
      for (const attemptId of late) {
        await api.atlasFlowV1.cancelAttempt(attemptId)
      }
      await clearComposerForBatch('cancelar lote')
      push(
        failed > 0
          ? 'Lote interrompido. Uma geração não confirmou o cancelamento.'
          : 'Lote cancelado. Campo do Flow limpo.',
        failed > 0 ? 'error' : 'success',
      )
      await refresh({ force: true })
    } catch (error) {
      pushError(error, 'Falha ao cancelar o lote.')
    } finally {
      setCancelingBatch(false)
    }
  }

  useEffect(() => {
    const job = batchRef.current
    if (!job?.active || !snap || batchPumpingRef.current) return
    const lines = new Map(snap.prompts.map((line) => [line.promptId, line]))
    for (const [promptId, attemptId] of job.attemptByPrompt) {
      const attempt = lines.get(promptId)?.activeAttempt
      if (attempt?.attemptId === attemptId && attempt.state === 'submission_uncertain') {
        job.active = false
        setBatchActive(false)
        push('Lote pausado: um envio ficou incerto. Confira essa linha antes de continuar.')
        return
      }
    }
    const pending = job.ids.some((id) => !job.attemptByPrompt.has(id))
    if (pending) return
    const stillRunning = [...job.attemptByPrompt.keys()].some(
      (id) => !batchAttemptSettled(job, lines.get(id), id),
    )
    if (!stillRunning) {
      job.active = false
      setBatchActive(false)
      push('Lote concluído.', 'success')
    }
  }, [snap])

  async function onAddPrompt() {
    if (!snap) return
    if (!canUseBench) {
      push('Vincule o projeto ao Flow antes de criar linhas.')
      return
    }
    await api.atlasFlowV1.createPromptLine({
      atlasProjectId: snap.atlasProjectId,
      text: '',
      selectedReferenceIds: [],
    })
    await refresh()
  }

  async function onAddReferences() {
    if (!snap) return
    if (!canUseBench) {
      push('Vincule o projeto ao Flow antes de adicionar referências.')
      return
    }
    const picked = await api.atlasFlowV1.pickReferenceFiles()
    const paths = picked?.paths || []
    if (paths.length === 0) return
    for (const filePath of paths) {
      await api.atlasFlowV1.addReferenceFromPath({
        atlasProjectId: snap.atlasProjectId,
        filePath,
      })
    }
    logUi(`Referências adicionadas ao projeto ${snap.atlasProjectId.slice(0, 8)}: ${paths.length}`)
    push(`${paths.length} referência(s) adicionada(s) neste projeto.`, 'success')
    await refresh()
  }

  function openFlowProject(project: Project) {
    setGalleryGroupId(project.channelId || '__outros__')
    setAtlasProjectId(project.id)
    dirtyPromptIdsRef.current.clear()
    editingPromptIdRef.current = null
    setEditingPromptId(null)
    setDrafts({})
    setSelectedByPrompt({})
    ensureStartedForRef.current = null
    setSnap(null)
    setLoading(true)
    setBenchOpen(true)
    try {
      window.localStorage.setItem('atlas-flow-v1.activeProjectId', project.id)
    } catch {
      /* ignore */
    }
  }

  function leaveBench() {
    setBenchOpen(false)
    setLinkingProject(false)
  }

  async function onCreateAtlasProject(input?: { name: string; channelId: string; folderPath?: string }) {
    const name = (input?.name || newProjectName).trim()
    const channelFromGallery =
      galleryGroupId && galleryGroupId !== '__outros__' ? galleryGroupId : null
    const channelId = input?.channelId?.trim() || channelFromGallery
    if (!name) {
      push('Informe o nome do projeto.')
      return
    }
    setCreatingProject(true)
    logUi(`Criando projeto Atlas “${name}”…`)
    try {
      const created = (await api.projects.create({
        name,
        projectType: 'music',
        channelId,
        workspace: 'flow',
        projectFolderPath: input?.folderPath?.trim() || null,
      })) as Project
      if (!created?.id) {
        push('Não foi possível criar o projeto.')
        logUi('projects.create sem id', 'error')
        return
      }
      setProjects((prev) => [...(prev || []), created])
      setNewProjectOpen(false)
      setNewProjectName('')
      logUi(`Projeto Atlas criado: ${created.name} (${created.id.slice(0, 8)})`, 'ok')
      push('Projeto criado. Vinculando ao Flow…', 'success')
      openFlowProject(created)
    } catch (error) {
      logUi(`Falha ao criar projeto: ${error instanceof Error ? error.message : String(error)}`, 'error')
      pushError(error, 'Falha ao criar projeto.')
    } finally {
      setCreatingProject(false)
    }
  }

  async function onDeleteFlowProject(project: Project) {
    setCreatingProject(true)
    try {
      await api.projects.remove(project.id, {
        alsoRemovePublication: Boolean(project.scheduledVideoId),
      })
      setProjects((prev) => (prev || []).filter((item) => item.id !== project.id))
      if (atlasProjectId === project.id) leaveBench()
      push('Projeto removido do Atlas e do Google Flow.', 'success')
    } catch (error) {
      pushError(error, 'Falha ao excluir o projeto')
    } finally {
      setCreatingProject(false)
    }
  }

  async function onDeleteFlowProjects(targets: Project[]) {
    setCreatingProject(true)
    try {
      for (const project of targets) {
        await api.projects.remove(project.id, {
          alsoRemovePublication: Boolean(project.scheduledVideoId),
        })
      }
      const removed = new Set(targets.map((item) => item.id))
      setProjects((prev) => (prev || []).filter((item) => !removed.has(item.id)))
      if (atlasProjectId && removed.has(atlasProjectId)) leaveBench()
      push(
        targets.length === 1 ? 'Projeto removido.' : `${targets.length} projetos removidos.`,
        'success',
      )
    } catch (error) {
      pushError(error, 'Falha ao excluir os projetos')
    } finally {
      setCreatingProject(false)
    }
  }

  async function onRenameAliasSubmit() {
    if (!renameAliasId) return
    const next = renameAliasValue.trim()
    if (!next) {
      push('Informe um nome curto.')
      return
    }
    const result = await api.atlasFlowV1.updateReferenceAlias({
      referenceId: renameAliasId,
      alias: next,
    })
    if (!result?.ok) {
      push(
        result?.error === 'ALIAS_AMBIGUOUS'
          ? `O alias “[${normalizeAliasToken(next)}]” já existe neste projeto.`
          : String(result?.error || 'Nome inválido.'),
      )
      return
    }
    setRenameAliasId(null)
    setRenameAliasValue('')
    await refresh()
  }

  async function onSetReferenceRole(referenceId: string, useAsCharacter: boolean) {
    try {
      const result = await api.atlasFlowV1.updateReferenceRole({ referenceId, useAsCharacter })
      if (!result?.ok) {
        push(
          result?.error === 'ROLE_COLUMN_MISSING'
            ? 'Reinicie o Atlas para gravar se a imagem é personagem ou referência.'
            : String(result?.error || 'Não foi possível salvar o tipo.'),
        )
        return
      }
      await refresh({ force: true })
    } catch (error) {
      pushError(error, 'Reinicie o Atlas para gravar se a imagem é personagem ou referência.')
    }
  }

  async function onSendToLipSync(resultBindingId: string, sceneNumber: number) {
    setSendingLipSyncId(resultBindingId)
    try {
      const result = await api.atlasFlowV1.sendResultToLipSync({ resultBindingId })
      if (!result?.ok) {
        const message =
          result?.error === 'MUSIC_PROJECT_NOT_FOUND'
            ? 'Não achei o projeto de música com o mesmo nome para enviar ao LipSync.'
            : result?.error === 'RESULT_FILE_NOT_READY' || result?.error === 'FILE_MISSING'
              ? 'A imagem ainda não está pronta no Atlas.'
              : String(result?.error || 'Não foi possível enviar ao LipSync.')
        push(message)
        return
      }
      push(`Cena ${result.sceneNumber ?? sceneNumber} enviada ao LipSync.`, 'success')
      await refresh({ force: true })
    } catch (error) {
      pushError(error, 'Falha ao enviar a imagem ao LipSync.')
    } finally {
      setSendingLipSyncId(null)
    }
  }

  async function onDownloadResult(resultBindingId: string, resolution: '1k' | '2k' | '4k') {
    const label =
      resolution === '1k' ? '1K, tamanho original' : resolution === '2k' ? '2K aprimorada' : '4K aprimorada'
    setDownloadingResultId(resultBindingId)
    try {
      const result = await api.atlasFlowV1.downloadResult({ resultBindingId, resolution })
      if (result?.savedPath && resolution === '1k') {
        push(`Imagem salva em ${result.savedPath}`, 'success')
        return
      }
      if (result?.savedPath) {
        push(`Cópia salva em ${result.savedPath}`, 'success')
      } else if (result?.folderError === 'FOLDER_MISSING') {
        push('Este projeto não tem pasta de destino. As imagens baixadas precisam dessa pasta.')
      }
      if (result?.ok && result.pending) {
        push(
          `Download ${label} pedido no Google Flow. O arquivo entra nas transferências do Chrome.`,
          'success',
        )
        return
      }
      if (!result?.ok) {
        if (resolution === '1k' && result?.error === 'FLOW_MEDIA_MISSING') {
          await api.atlasFlowV1.openResultFile(resultBindingId)
          push('Abri o arquivo original salvo no Atlas.', 'success')
          return
        }
        const message =
          result?.error === 'IMAGE_NOT_ON_PAGE'
            ? 'Não achei essa imagem aberta no projeto do Flow.'
            : result?.error === 'DOWNLOAD_MENU_MISSING'
              ? 'O menu de download não abriu no Flow. Deixe o projeto aberto e tente de novo.'
              : result?.error === 'RESOLUTION_MISSING'
                ? `O Flow não mostrou a opção ${label}.`
                : result?.error === 'FLOW_MEDIA_MISSING'
                  ? 'Essa imagem ainda não está vinculada a uma mídia do Flow.'
                  : String(result?.error || 'Não foi possível baixar no Flow.')
        push(message)
        return
      }
      push(
        resolution === '1k'
          ? 'Download 1K, tamanho original, iniciado no Google Flow.'
          : `Download ${label} iniciado no Google Flow. A versão aprimorada pode levar um momento antes do arquivo aparecer.`,
        'success',
      )
    } catch (error) {
      pushError(error, 'Falha ao baixar a imagem.')
    } finally {
      setDownloadingResultId(null)
    }
  }

  function onDeleteImage(input: {
    slotKey: string
    resultBindingId?: string | null
    attemptId?: string | null
    outputIndex?: number | null
    hasImage: boolean
  }) {
    setPendingDelete({ kind: 'image', ...input })
  }

  async function runDeleteImage(input: {
    slotKey: string
    resultBindingId?: string | null
    attemptId?: string | null
    outputIndex?: number | null
    hasImage: boolean
  }) {
    setDeletingSlotKey(input.slotKey)
    try {
      const result = await api.atlasFlowV1.deleteResult({
        resultBindingId: input.resultBindingId,
        attemptId: input.attemptId,
        outputIndex: input.outputIndex,
      })
      if (!result?.ok) {
        const message =
          result?.error === 'IMAGE_NOT_ON_PAGE'
            ? 'Não achei essa imagem no projeto do Flow. Ela continua no Atlas.'
            : result?.error === 'TRASH_MENU_MISSING'
              ? 'O menu da imagem não abriu no Flow. Deixe o projeto aberto e tente de novo.'
              : result?.error === 'TRASH_NOT_CONFIRMED'
                ? 'O Flow não confirmou a lixeira. A imagem continua no Atlas.'
                : result?.error === 'DELETE_PENDING'
                  ? 'A extensão ainda não concluiu a exclusão no Flow.'
                  : String(result?.error || 'Não foi possível excluir.')
        push(message)
        return
      }
      if (previewResult?.resultBindingId && previewResult.resultBindingId === input.resultBindingId) {
        setPreviewResult(null)
      }
      push(
        result.flowDeleted
          ? 'Imagem excluída no Atlas e movida para a lixeira no Flow.'
          : result.flowMissing
            ? 'Imagem removida do Atlas. Ela já não estava no projeto do Flow.'
            : 'Cartão removido da bancada.',
        'success',
      )
      await refresh({ force: true })
    } catch (error) {
      pushError(error, 'Falha ao excluir a imagem.')
    } finally {
      setDeletingSlotKey(null)
    }
  }

  function onDeleteReference(referenceId: string, name: string) {
    setPendingDelete({ kind: 'reference', referenceId, name })
  }

  async function runDeleteReference(referenceId: string) {
    setDeletingId(referenceId)
    try {
      const result = await api.atlasFlowV1.archiveReference(referenceId)
      if (!result?.ok) {
        push(String(result?.error || 'Não foi possível remover a referência.'))
        return
      }
      setSelectedByPrompt((prev) => {
        const next: Record<string, string[]> = {}
        for (const [promptId, ids] of Object.entries(prev)) {
          next[promptId] = ids.filter((id) => id !== referenceId)
        }
        return next
      })
      push('Referência removida.', 'success')
      await refresh()
    } catch (error) {
      pushError(error, 'Falha ao remover referência.')
    } finally {
      setDeletingId(null)
    }
  }

  function onDeletePrompt(promptId: string, position: number) {
    setPendingDelete({ kind: 'prompt', promptId, position })
  }

  function onClearAllPrompts() {
    const count = (snap?.prompts || []).length
    if (count < 1) return
    setPendingDelete({ kind: 'prompts-all', count })
  }

  async function runClearAllPrompts() {
    const lines = [...(snap?.prompts || [])]
    if (lines.length === 0) return
    setDeletingId('all-prompts')
    let removed = 0
    let locked = 0
    try {
      for (const line of lines) {
        if (isAttemptInflight(line.activeAttempt)) {
          locked += 1
          continue
        }
        const result = await api.atlasFlowV1.archivePromptLine(line.promptId)
        if (!result?.ok) {
          if (result?.error === 'PROMPT_LOCKED_BY_ATTEMPT') locked += 1
          continue
        }
        removed += 1
        setDrafts((prev) => {
          const next = { ...prev }
          delete next[line.promptId]
          return next
        })
        setSelectedByPrompt((prev) => {
          const next = { ...prev }
          delete next[line.promptId]
          return next
        })
      }
      setComposerLineId(null)
      if (removed > 0) {
        push(
          locked > 0
            ? `${removed} linha(s) removida(s). ${locked} ficaram porque a geração ainda está em andamento.`
            : `${removed} linha(s) removida(s).`,
          'success',
        )
      } else if (locked > 0) {
        push('Nenhuma linha removida: há gerações em andamento.')
      }
      // Sem criar linha aqui: o ensureDefaultPrompt abre uma linha vazia, sem chips.
      await refresh()
    } catch (error) {
      pushError(error, 'Falha ao limpar as linhas.')
    } finally {
      setDeletingId(null)
    }
  }

  async function runDeletePrompt(promptId: string) {
    setDeletingId(promptId)
    try {
      const result = await api.atlasFlowV1.archivePromptLine(promptId)
      if (!result?.ok) {
        push(
          result?.error === 'PROMPT_LOCKED_BY_ATTEMPT'
            ? 'Não é possível remover enquanto a geração está em andamento.'
            : String(result?.error || 'Não foi possível remover a linha.'),
        )
        return
      }
      setDrafts((prev) => {
        const next: Record<string, string> = {}
        for (const [k, v] of Object.entries(prev)) {
          if (k !== promptId) next[k] = v
        }
        return next
      })
      setSelectedByPrompt((prev) => {
        const next: Record<string, string[]> = {}
        for (const [k, v] of Object.entries(prev)) {
          if (k !== promptId) next[k] = v
        }
        return next
      })
      const remaining = (snap?.prompts || []).filter((line) => line.promptId !== promptId)
      if (composerLineId === promptId) {
        setComposerLineId(remaining[remaining.length - 1]?.promptId || null)
      }
      push('Linha removida.', 'success')
      // Sem criar linha aqui: se sobrar zero, o ensureDefaultPrompt cria uma vazia.
      await refresh()
    } catch (error) {
      pushError(error, 'Falha ao remover linha.')
    } finally {
      setDeletingId(null)
    }
  }

  if (!benchOpen) {
    return (
      <PageShell>
        <FlowProjectGallery
          projects={projects}
          channels={channels}
          groupId={galleryGroupId}
          onGroupId={setGalleryGroupId}
          busy={creatingProject}
          onOpenProject={openFlowProject}
          onCreate={(input) => onCreateAtlasProject(input)}
          onDeleteProject={onDeleteFlowProject}
          onDeleteProjects={onDeleteFlowProjects}
        />
      </PageShell>
    )
  }

  if (loading && !snap) {
    return (
      <PageShell className="flex min-h-0 flex-col">
        <PageHeader
          breadcrumb={environmentBreadcrumb('music', 'Flow')}
          title="Flow"
          subtitle="Geração com Google Flow"
        />
        <div className="flex flex-1 items-center justify-center text-sm text-muted">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando…
        </div>
      </PageShell>
    )
  }

  /* ── JSX principal (design Google Flow) ─────────────────────────────── */
  return (
    <PageShell className="flex min-h-0 flex-col !p-0" scroll={false}>
      {/* Cabeçalho */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 px-3 py-2 bg-black/80 backdrop-blur-sm border-b border-white/5">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-8 rounded-full p-0 !px-0 text-xs"
            icon={<ArrowLeft className="h-3 w-3" />}
            onClick={leaveBench}
          />
          <h1 className="truncate text-sm font-medium text-text">{snap?.projectName || 'Flow'}</h1>
        </div>
        <div className="mx-2 flex min-w-0 flex-1 items-center justify-center gap-1.5 overflow-x-auto py-0.5">
          {(snap?.sceneStrip?.scenes || []).length > 0 ? (
            <>
              <span className="shrink-0 self-end pb-1 text-[10px] uppercase tracking-wide text-muted">
                {snap?.sceneStrip?.cutCount || 0} cenas
              </span>
              {(snap?.sceneStrip?.scenes || []).map((scene) => {
                const matchingLine = (snap?.prompts || []).find((p) => p.position === scene.number)
                const liveText = matchingLine
                  ? (drafts[matchingLine.promptId] ?? matchingLine.draftText)
                  : null
                const subject: 'singer' | 'band' =
                  inferPromptSceneSubject(liveText) ?? scene.subject ?? 'singer'
                const isBand = subject === 'band'
                return (
                  <span
                    key={scene.number}
                    title={
                      scene.sent
                        ? `Cena ${scene.number} (${isBand ? 'Banda' : 'Cantor'}) — já enviada ao LipSync`
                        : `Cena ${scene.number} (${isBand ? 'Banda' : 'Cantor'}) — ainda sem imagem no LipSync`
                    }
                    className="inline-flex shrink-0 flex-col items-center gap-0.5"
                  >
                    {isBand ? (
                      <Drum
                        className={cn(
                          'h-3 w-3 transition-colors',
                          scene.sent ? 'text-emerald-400/90' : 'text-amber-300/80',
                        )}
                      />
                    ) : (
                      <Mic
                        className={cn(
                          'h-3 w-3 transition-colors',
                          scene.sent ? 'text-emerald-400/90' : 'text-sky-300/80',
                        )}
                      />
                    )}
                    <span
                      className={cn(
                        'inline-flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full border px-1.5 text-[11px] font-semibold',
                        scene.sent
                          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                          : 'border-white/10 bg-white/5 text-muted',
                      )}
                    >
                      {scene.sent ? <Check className="h-3 w-3" /> : null}
                      {scene.number}
                    </span>
                  </span>
                )
              })}
            </>
          ) : (
            <span className="text-[10px] text-muted">Sem cenas neste projeto</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {connectPhase === 'connected' ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>{connection?.accountLabel || 'Conectado'}</span>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className="h-8 px-2.5 text-xs"
              disabled={connecting}
              icon={
                connecting || connectPhase === 'connecting' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : undefined
              }
              onClick={() => void onConnectGoogleFlow()}
            >
              {connecting || connectPhase === 'connecting' ? 'Conectando…' : 'Conectar Flow'}
            </Button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
      <aside className="flex w-[248px] shrink-0 flex-col border-r border-white/10 bg-[#0c0c0c]">
        <div className="flex items-center justify-between gap-2 px-3 py-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-white/55">
            Referências
          </h2>
          <button
            type="button"
            title="Subir imagens"
            disabled={!canUseBench}
            onClick={() => void onAddReferences()}
            className="grid h-8 w-8 place-items-center rounded-full border border-white/15 text-white hover:bg-white/10 disabled:opacity-40"
          >
            <ImagePlus className="h-4 w-4" />
          </button>
        </div>
        {stagedCount > 0 ? (
          <div className="px-3 pb-2">
            <button
              type="button"
              disabled={
                (snap?.references || [])
                  .filter((ref) => !refIsOnFlow(ref))
                  .every((ref) => uploadingRefIds.includes(ref.referenceId))
              }
              onClick={() => void onUploadStaged()}
              className="flex h-8 w-full items-center justify-center gap-1.5 rounded-full bg-white/10 text-[12px] text-white hover:bg-white/15 disabled:opacity-40"
            >
              {(snap?.references || [])
                .filter((ref) => !refIsOnFlow(ref))
                .every((ref) => uploadingRefIds.includes(ref.referenceId)) ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {(snap?.references || [])
                .filter((ref) => !refIsOnFlow(ref))
                .every((ref) => uploadingRefIds.includes(ref.referenceId))
                ? 'Enviando…'
                : stagedCount > 1
                  ? 'Enviar todas'
                  : 'Enviar'}
            </button>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-3">
          {(snap?.references || []).map((ref) => {
            const isCharacter =
              ref.useAsCharacter === true ||
              (ref.useAsCharacter == null && ref.alias.trim().toLowerCase() === 'cantor')
            const sendingThis = uploadingRefIds.includes(ref.referenceId)
            const canSendThis = !refIsOnFlow(ref)
            return (
              <div key={ref.referenceId} className="rounded-xl bg-[#161616] p-1.5">
                {ref.thumbDataUrl ? (
                  <img src={ref.thumbDataUrl} alt="" className="aspect-video w-full rounded-lg object-cover" />
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-black">
                    <ImagePlus className="h-4 w-4 text-white/30" />
                  </div>
                )}
                <div className="mt-1.5 flex items-start justify-between gap-1 px-1">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] text-white">{ref.displayName}</p>
                    {renameAliasId === ref.referenceId ? (
                      <form
                        className="mt-1 flex items-center gap-1"
                        onSubmit={(event) => {
                          event.preventDefault()
                          void onRenameAliasSubmit()
                        }}
                      >
                        <input
                          autoFocus
                          value={renameAliasValue}
                          onChange={(event) => setRenameAliasValue(event.target.value)}
                          className="w-full rounded border border-white/15 bg-black px-1.5 py-0.5 text-[11px] text-white focus:border-white/40 focus:outline-none"
                        />
                        <button type="submit" className="text-[11px] text-emerald-300">
                          Ok
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="truncate text-[11px] text-white/45 hover:text-white"
                        title="Nome usado no prompt, entre colchetes"
                        onClick={() => {
                          setRenameAliasId(ref.referenceId)
                          setRenameAliasValue(ref.alias)
                        }}
                      >
                        [{ref.alias}]
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    title="Remover referência"
                    disabled={deletingId === ref.referenceId}
                    onClick={() => void onDeleteReference(ref.referenceId, ref.displayName)}
                    className="rounded p-1 text-white/35 hover:bg-red-500/20 hover:text-red-300"
                  >
                    {deletingId === ref.referenceId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-1 p-1">
                  <button
                    type="button"
                    onClick={() => void onSetReferenceRole(ref.referenceId, true)}
                    className={cn(
                      'h-7 rounded-full text-[11px]',
                      isCharacter ? 'bg-amber-300 text-black' : 'bg-white/5 text-white/70 hover:bg-white/10',
                    )}
                  >
                    Personagem
                  </button>
                  <button
                    type="button"
                    onClick={() => void onSetReferenceRole(ref.referenceId, false)}
                    className={cn(
                      'h-7 rounded-full text-[11px]',
                      !isCharacter ? 'bg-white text-black' : 'bg-white/5 text-white/70 hover:bg-white/10',
                    )}
                  >
                    Referência
                  </button>
                </div>
                {canSendThis ? (
                  <button
                    type="button"
                    disabled={sendingThis}
                    onClick={() => void onUploadStaged([ref.referenceId])}
                    className="mx-1 mb-1 flex h-7 items-center justify-center gap-1 rounded-full bg-white/10 text-[11px] text-white hover:bg-white/15 disabled:opacity-40"
                  >
                    {sendingThis ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                    {sendingThis ? 'Enviando…' : 'Enviar esta'}
                  </button>
                ) : null}
              </div>
            )
          })}
          {(snap?.references || []).length === 0 ? (
            <button
              type="button"
              disabled={!canUseBench}
              onClick={() => void onAddReferences()}
              className="flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-white/15 px-3 py-8 text-center text-[12px] text-white/45 hover:border-white/30 hover:text-white disabled:opacity-40"
            >
              <ImagePlus className="mb-2 h-5 w-5" />
              Subir imagens
            </button>
          ) : null}
        </div>
      </aside>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <div className="h-full overflow-y-auto px-2 pb-48 pt-2">
        {/* Barra de status / conectividade */}
        {!projectLinked ? (
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>Vincule este projeto ao Flow para começar.</span>
            <Button
              type="button"
              variant="secondary"
              className="h-8 px-3 text-xs"
              disabled={linkingProject}
              onClick={() => {
                void (async () => {
                  ensureStartedForRef.current = atlasProjectId
                  setLinkingProject(true)
                  try {
                    const ok = await waitForProjectLink(atlasProjectId)
                    if (ok) {
                      push('Projeto vinculado ao Flow.', 'success')
                    }
                  } finally {
                    setLinkingProject(false)
                  }
                })()
              }}
            >
              {linkingProject ? 'Vinculando…' : 'Vincular ao Flow'}
            </Button>
          </div>
        ) : null}

        {/* Prompts (área principal) */}
        <div>
          {reconnectHint ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
              Reconectando à extensão… o estado da geração é preservado.
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {(snap?.prompts || []).map((line) => {
            const draftText = drafts[line.promptId] ?? line.draftText
            const aliasPick = resolveLineAliases(draftText, snap?.references || [])
            const selected =
              aliasPick.ok && aliasPick.aliases.length > 0
                ? aliasPick.referenceIds
                : selectedByPrompt[line.promptId] || line.selectedReferenceIds || []
            const inflight = isAttemptInflight(line.activeAttempt)
            const status = attemptStatus(line.activeAttempt)
            const canRegen =
              !inflight &&
              (!line.activeAttempt ||
                isTerminalAttemptState(line.activeAttempt.state) ||
                Boolean(line.activeAttempt.failureCode))
            const selectableRefs = (snap?.references || []).filter(refSelectable)

            return (
              <article key={line.promptId} className="contents">
                {/* Output slots (imagens geradas) */}
                {(() => {
                  const slots =
                    line.gallerySlots && line.gallerySlots.length > 0
                      ? line.gallerySlots
                      : line.activeAttempt?.outputSlots || []
                  const shownResultIds = new Set(
                    slots.map((slot) => slot.resultBindingId).filter((id): id is string => Boolean(id)),
                  )
                  const priorResults = (line.results || []).filter(
                    (r) =>
                      r.retrievalState === 'retrieved' &&
                      Boolean(r.fileExists) &&
                      !shownResultIds.has(r.resultBindingId),
                  )
                  const showHistory = historyPromptId === line.promptId

                  return (
                    <>
                      {line.activeAttempt ? (
                        <div className="contents">
                          {slots.length > 0 ? (
                            <div className="contents">
                              {slots.map((slot) => {
                                // Galeria mistura tentativas antigas e a atual: casar pelo
                                // attemptId do slot, nunca só pelo activeAttempt (senão a
                                // imagem some e fica "Concluído 100%" preto ao regenerar).
                                const result = slot.resultBindingId
                                  ? line.results.find(
                                      (r) =>
                                        r.resultBindingId === slot.resultBindingId &&
                                        (!slot.attemptId || r.attemptId === slot.attemptId) &&
                                        r.retrievalState === 'retrieved',
                                    )
                                  : null
                                const thumbSrc = slot.thumbDataUrl || result?.thumbDataUrl || null
                                const showPreviewThumb = Boolean(thumbSrc)
                                const indeterminate =
                                  !showPreviewThumb &&
                                  slot.percent == null &&
                                  (slot.state === 'generating' ||
                                    slot.state === 'receiving' ||
                                    slot.state === 'preparing_refs' ||
                                    slot.state === 'awaiting' ||
                                    slot.state === 'recover_pending')
                                const statusText = (() => {
                                  switch (slot.state) {
                                    case 'awaiting': return 'Aguardando'
                                    case 'preparing_refs': return 'Preparando refs…'
                                    case 'generating': return 'Gerando…'
                                    case 'receiving': return 'Recebendo…'
                                    case 'ready': return 'Concluído'
                                    case 'failed': return 'Falhou'
                                    case 'recover_pending': return 'Sincronizando imagem…'
                                    default: return slot.state
                                  }
                                })()
                                return (
                                  <div
                                    key={slot.slotKey}
                                    className="group relative overflow-hidden rounded-xl bg-[#111]"
                                  >
                                    <span className="absolute left-1.5 top-1.5 z-10 grid h-6 min-w-6 place-items-center rounded-full bg-black/75 px-1.5 text-[11px] font-semibold text-white">
                                      {line.position}
                                    </span>
                                    <button
                                      type="button"
                                      disabled={!showPreviewThumb}
                                      onClick={() => {
                                        if (result && slot.fileReady) setPreviewResult(result)
                                      }}
                                      className="relative block w-full text-left disabled:opacity-90"
                                      title={showPreviewThumb ? 'Ampliar' : statusText}
                                    >
                                      {showPreviewThumb ? (
                                        <img
                                          src={thumbSrc!}
                                          alt=""
                                          className="aspect-video w-full object-cover"
                                        />
                                      ) : (
                                        <div className="relative flex aspect-video flex-col items-center justify-center bg-[#111] px-2 text-center">
                                          {indeterminate ? (
                                            <Loader2 className="h-5 w-5 animate-spin text-emerald-400/90" />
                                          ) : null}
                                          <span className="text-[10px] text-muted">{statusText}</span>
                                          {slot.percent != null ? (
                                            <span className="text-[11px] font-medium text-emerald-400">
                                              {Math.round(slot.percent)}%
                                            </span>
                                          ) : null}
                                        </div>
                                      )}
                                      {slot.percent != null && !showPreviewThumb ? (
                                        <span className="absolute right-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[10px] text-white">
                                          {Math.round(slot.percent)}%
                                        </span>
                                      ) : null}
                                    </button>
                                    <div
                                      className={cn(
                                        'absolute bottom-2 left-2 z-10 flex flex-wrap items-center gap-1 rounded-lg bg-black/75 px-1.5 py-1 transition',
                                        slot.state === 'failed' || slot.state === 'recover_pending'
                                          ? 'opacity-100'
                                          : 'opacity-0 group-hover:opacity-100',
                                      )}
                                    >
                                      {slot.state === 'recover_pending' && !showPreviewThumb ? (
                                        <button
                                          type="button"
                                          className="text-[9px] text-emerald-300 hover:text-emerald-200 disabled:opacity-40"
                                          disabled={
                                            busyPromptId ===
                                            (slot.attemptId || line.activeAttempt?.attemptId)
                                          }
                                          onClick={() => {
                                            const targetAttemptId =
                                              slot.attemptId || line.activeAttempt?.attemptId
                                            if (targetAttemptId) void onRecover(targetAttemptId)
                                          }}
                                        >
                                          Sincronizar
                                        </button>
                                      ) : null}
                                      <button
                                        type="button"
                                        className="text-[9px] text-white hover:text-emerald-300 disabled:opacity-40"
                                        disabled={inflight || busyPromptId === line.promptId}
                                        onClick={() => void onGenerate(line.promptId, 'single')}
                                      >
                                        Gerar de novo
                                      </button>
                                      <button
                                        type="button"
                                        className="text-[9px] text-rose-300 hover:text-rose-200 disabled:opacity-40"
                                        disabled={
                                          deletingSlotKey === slot.slotKey ||
                                          slot.state === 'generating' ||
                                          slot.state === 'receiving' ||
                                          slot.state === 'preparing_refs' ||
                                          slot.state === 'awaiting'
                                        }
                                        onClick={() =>
                                          void onDeleteImage({
                                            slotKey: slot.slotKey,
                                            resultBindingId: slot.resultBindingId,
                                            attemptId: slot.attemptId,
                                            outputIndex: slot.outputIndex,
                                            hasImage: Boolean(slot.fileReady),
                                          })
                                        }
                                      >
                                        Excluir
                                      </button>
                                      <span
                                        className={cn(
                                          'flex items-center gap-1',
                                          slot.state === 'failed' && 'hidden group-hover:flex',
                                        )}
                                      >
                                      <FlowResultDownloadMenu
                                        disabled={!slot.fileReady || !slot.resultBindingId}
                                        busy={downloadingResultId === slot.resultBindingId}
                                        onPick={(resolution) => {
                                          if (slot.resultBindingId) {
                                            void onDownloadResult(slot.resultBindingId, resolution)
                                          }
                                        }}
                                      />
                                      <button
                                        type="button"
                                        className="text-[9px] text-muted hover:text-emerald-400 disabled:opacity-40"
                                        disabled={!slot.fileReady}
                                        onClick={() => {
                                          if (result) setPreviewResult(result)
                                        }}
                                      >
                                        Ampliar
                                      </button>
                                      <button
                                        type="button"
                                        className={cn(
                                          'text-[9px] disabled:opacity-40',
                                          slot.approved
                                            ? 'text-emerald-400'
                                            : 'text-muted hover:text-text',
                                        )}
                                        disabled={!slot.fileReady || !slot.resultBindingId}
                                        onClick={() => {
                                          if (!slot.resultBindingId) return
                                          void (
                                            api.atlasFlowV1 as {
                                              approveResult?: (input: {
                                                resultBindingId: string
                                                approved?: boolean
                                              }) => Promise<unknown>
                                            }
                                          )
                                            .approveResult?.({
                                              resultBindingId: slot.resultBindingId,
                                              approved: !slot.approved,
                                            })
                                            .then(() => void refresh())
                                        }}
                                      >
                                        {slot.approved ? 'Aprovada' : 'Aprovar'}
                                      </button>
                                      <button
                                        type="button"
                                        className={cn(
                                          'text-[9px] disabled:opacity-40',
                                          slot.lipsyncSent
                                            ? 'text-emerald-400'
                                            : 'text-muted hover:text-emerald-300',
                                        )}
                                        disabled={
                                          !slot.fileReady ||
                                          !slot.resultBindingId ||
                                          sendingLipSyncId === slot.resultBindingId
                                        }
                                        onClick={() => {
                                          if (!slot.resultBindingId) return
                                          void onSendToLipSync(slot.resultBindingId, line.position)
                                        }}
                                      >
                                        {sendingLipSyncId === slot.resultBindingId
                                          ? 'Enviando…'
                                          : slot.lipsyncSent
                                            ? 'No LipSync ✓'
                                            : 'LipSync'}
                                      </button>
                                      </span>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {priorResults.map((result) => (
                        <div
                          key={result.resultBindingId}
                          className="group relative overflow-hidden rounded-xl bg-[#111]"
                        >
                          <span className="absolute left-1.5 top-1.5 z-10 grid h-6 min-w-6 place-items-center rounded-full bg-black/75 px-1.5 text-[11px] font-semibold text-white">
                            {line.position}
                          </span>
                          <button
                            type="button"
                            disabled={!result.fileExists || result.retrievalState !== 'retrieved'}
                            onClick={() => setPreviewResult(result)}
                            className="block w-full text-left disabled:opacity-40"
                          >
                            {result.thumbDataUrl ? (
                              <img
                                src={result.thumbDataUrl}
                                alt=""
                                className="aspect-video w-full object-cover"
                              />
                            ) : (
                              <div className="flex aspect-video items-center justify-center text-[9px] text-muted">
                                anterior
                              </div>
                            )}
                          </button>
                          <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1 rounded-lg bg-black/75 px-1.5 py-1 opacity-0 transition group-hover:opacity-100">
                            <button
                              type="button"
                              className="text-[9px] text-white hover:text-emerald-300 disabled:opacity-40"
                              disabled={inflight || busyPromptId === line.promptId}
                              onClick={() => void onGenerate(line.promptId, 'single')}
                            >
                              Gerar de novo
                            </button>
                            <button
                              type="button"
                              className="text-[9px] text-rose-300 hover:text-rose-200 disabled:opacity-40"
                              disabled={deletingSlotKey === result.resultBindingId}
                              onClick={() =>
                                void onDeleteImage({
                                  slotKey: result.resultBindingId,
                                  resultBindingId: result.resultBindingId,
                                  attemptId: result.attemptId,
                                  outputIndex: result.outputIndex,
                                  hasImage: true,
                                })
                              }
                            >
                              Excluir
                            </button>
                            <FlowResultDownloadMenu
                              disabled={!result.fileExists}
                              busy={downloadingResultId === result.resultBindingId}
                              onPick={(resolution) =>
                                void onDownloadResult(result.resultBindingId, resolution)
                              }
                            />
                            <button
                              type="button"
                              className={cn(
                                'text-[9px] disabled:opacity-40',
                                result.lipsyncSent
                                  ? 'text-emerald-400'
                                  : 'text-muted hover:text-emerald-300',
                              )}
                              disabled={
                                !result.fileExists ||
                                sendingLipSyncId === result.resultBindingId
                              }
                              onClick={() =>
                                void onSendToLipSync(result.resultBindingId, line.position)
                              }
                            >
                              {sendingLipSyncId === result.resultBindingId
                                ? 'Enviando…'
                                : result.lipsyncSent
                                  ? 'No LipSync ✓'
                                  : 'LipSync'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </>
                  )
                })()}
              </article>
            )
          })}
          </div>

          {/* Histórico arquivado */}
          {snap?.archivedHistory && snap.archivedHistory.length > 0 ? (
            <div className="mt-3 rounded-xl border border-white/5 bg-[#0a0a0a] p-3">
              <button
                type="button"
                className="flex w-full items-center justify-between text-left text-[11px] font-medium text-muted hover:text-text"
                onClick={() => setArchivedHistoryOpen((v) => !v)}
              >
                <span>
                  Histórico preservado ({snap.archivedHistory.length} tentativa(s))
                </span>
                {archivedHistoryOpen ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>
              {archivedHistoryOpen ? (
                <div className="mt-2 space-y-1.5">
                  {snap.archivedHistory.map((arch) => (
                    <div
                      key={`${arch.promptId}:${arch.attemptId}`}
                      className="rounded-lg border border-white/5 bg-[#0f0f0f] p-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1 text-[10px]">
                        <span className="font-medium text-text">
                          Linha #{String(arch.position).padStart(2, '0')} · {arch.promptText}
                        </span>
                        <span className="text-muted">#{arch.attemptId.slice(0, 6)}</span>
                      </div>
                      <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-3">
                        {arch.results.map((result) => (
                          <div
                            key={result.resultBindingId}
                            className="overflow-hidden rounded-lg border border-white/5 bg-[#0a0a0a]"
                          >
                            <button
                              type="button"
                              disabled={!result.fileExists}
                              onClick={() => setPreviewResult(result)}
                              className="block w-full text-left disabled:opacity-40"
                            >
                              {result.thumbDataUrl ? (
                                <img
                                  src={result.thumbDataUrl}
                                  alt=""
                                  className="aspect-video w-full object-cover"
                                />
                              ) : (
                                <div className="flex aspect-video items-center justify-center text-[9px] text-muted">
                                  histórico
                                </div>
                              )}
                            </button>
                            <div className="flex items-center gap-1 px-1 py-0.5">
                              <button
                                type="button"
                                className="text-[9px] text-rose-300 hover:text-rose-200 disabled:opacity-40"
                                disabled={deletingSlotKey === result.resultBindingId}
                                onClick={() =>
                                  void onDeleteImage({
                                    slotKey: result.resultBindingId,
                                    resultBindingId: result.resultBindingId,
                                    attemptId: result.attemptId,
                                    outputIndex: result.outputIndex,
                                    hasImage: true,
                                  })
                                }
                              >
                                Excluir
                              </button>
                              <FlowResultDownloadMenu
                                disabled={!result.fileExists}
                                busy={downloadingResultId === result.resultBindingId}
                                onPick={(resolution) =>
                                  void onDownloadResult(result.resultBindingId, resolution)
                                }
                              />
                              <span className="ml-auto text-[9px] text-muted-2">
                                {result.sha256.slice(0, 8)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">
        <div className="pointer-events-auto w-[min(720px,100%)]">
          {batchActive ? (
            <p className="mb-2 text-center text-[11px] text-white/70">
              Lote em andamento. Próximo fica na fila até a extensão iniciar a geração atual.
            </p>
          ) : null}
          {(() => {
            const prompts = snap?.prompts || []
            // Números das linhas já enviadas saem da barra; ficam só as que faltam.
            const pendingPrompts = prompts.filter((item) => !lineAlreadySent(item))
            const current = prompts.find((item) => item.promptId === composerLineId)
            const line =
              (current && (batchActive || !lineAlreadySent(current)) ? current : null) ||
              pendingPrompts[0] ||
              current ||
              prompts[prompts.length - 1]
            if (!line) return null
            const draftText = drafts[line.promptId] ?? line.draftText
            const aliasPick = resolveLineAliases(draftText, snap?.references || [])
            const selected =
              aliasPick.ok && aliasPick.aliases.length > 0
                ? aliasPick.referenceIds
                : selectedByPrompt[line.promptId] || line.selectedReferenceIds || []
            const inflight = isAttemptInflight(line.activeAttempt)
            const attempt = line.activeAttempt
            const canRecover =
              Boolean(attempt) &&
              isTerminalAttemptState(attempt?.state) &&
              (attempt?.state === 'partial' ||
                attempt?.state === 'submission_uncertain' ||
                attempt?.failureCode === 'CAPTURE_INCOMPLETE' ||
                attempt?.failureCode === 'IDENTITY_UNCERTAIN')
            const chips = (snap?.references || []).filter((ref) =>
              selected.includes(ref.referenceId),
            )
            return (
              <>
                <div className="mb-2 flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-white/60">
                  {prompts.length > 1 && pendingPrompts.length > 0
                    ? pendingPrompts.map((item, index) => (
                        <button
                          key={item.promptId}
                          type="button"
                          onClick={() => setComposerLineId(item.promptId)}
                          className={cn(
                            'h-6 min-w-6 rounded-full px-2',
                            item.promptId === line.promptId
                              ? 'bg-white text-black'
                              : 'bg-white/10 text-white/70 hover:bg-white/20',
                          )}
                        >
                          {item.position}
                        </button>
                      ))
                    : null}
                  <button
                    type="button"
                    className="rounded-full px-2 py-1 hover:bg-white/10"
                    onClick={() => void onAddPrompt()}
                  >
                    Nova linha
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-white/70 hover:bg-red-500/20 hover:text-red-200 disabled:opacity-40"
                    title="Remover esta linha de prompt"
                    disabled={deletingId === line.promptId || deletingId === 'all-prompts' || inflight}
                    onClick={() => onDeletePrompt(line.promptId, line.position)}
                  >
                    {deletingId === line.promptId ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    Remover linha
                  </button>
                  {prompts.length > 1 ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-white/55 hover:bg-red-500/15 hover:text-red-200 disabled:opacity-40"
                      title="Remover todas as linhas de prompt"
                      disabled={deletingId === 'all-prompts' || batchActive}
                      onClick={() => onClearAllPrompts()}
                    >
                      {deletingId === 'all-prompts' ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                      {deletingId === 'all-prompts' ? 'Removendo…' : 'Remover todas'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full px-2 py-1 hover:bg-white/10"
                    onClick={() => setImportOpen(true)}
                  >
                    <FileText className="h-3 w-3" />
                    Documento
                  </button>
                  {batchActive ? (
                    <button
                      type="button"
                      className="rounded-full px-2 py-1 text-amber-200 hover:bg-white/10 disabled:opacity-40"
                      disabled={cancelingBatch}
                      onClick={() => void stopBatch()}
                    >
                      {cancelingBatch ? 'Cancelando…' : 'Cancelar lote'}
                    </button>
                  ) : null}
                  {inflight && attempt ? (
                    <button
                      type="button"
                      className="rounded-full px-2 py-1 text-amber-200 hover:bg-white/10"
                      disabled={busyPromptId === attempt.attemptId}
                      onClick={() => void onCancelAttempt(attempt.attemptId)}
                    >
                      Cancelar
                    </button>
                  ) : null}
                  {canRecover && attempt ? (
                    <button
                      type="button"
                      className="rounded-full px-2 py-1 text-amber-200 hover:bg-white/10"
                      disabled={busyPromptId === attempt.attemptId}
                      onClick={() => void onRecover(attempt.attemptId)}
                    >
                      Recuperar
                    </button>
                  ) : null}
                </div>
                <FlowPromptComposer
                  value={draftText}
                  settings={imageSettings}
                  onSettings={updateImageSettings}
                  onChange={(text) => {
                    dirtyPromptIdsRef.current.add(line.promptId)
                    setDrafts((prev) => ({ ...prev, [line.promptId]: text }))
                  }}
                  onFocus={() => {
                    editingPromptIdRef.current = line.promptId
                    setEditingPromptId(line.promptId)
                  }}
                  onBlur={() => {
                    editingPromptIdRef.current = null
                    setEditingPromptId(null)
                    void saveDraft(line.promptId)
                  }}
                  onSubmit={() => void onGenerateBatch()}
                  onAdd={() => void onAddReferences()}
                  submitDisabled={!canGenerate || batchActive}
                  submitting={batchActive}
                >
                  {chips.map((ref) => (
                    <span
                      key={ref.referenceId}
                      className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white"
                    >
                      {ref.thumbDataUrl ? (
                        <img src={ref.thumbDataUrl} alt="" className="h-4 w-4 rounded object-cover" />
                      ) : null}
                      {ref.alias || ref.displayName}
                    </span>
                  ))}
                </FlowPromptComposer>
              </>
            )
          })()}
        </div>
      </div>

      {/* Diagnóstico (overlay) */}
      {advancedOpen ? (
        <section className="absolute bottom-[80px] left-1/2 -translate-x-1/2 z-40 w-[420px] rounded-xl border border-white/5 bg-[#0a0a0a] p-2">
          <button
            type="button"
            className="flex items-center gap-1 text-[10px] text-muted hover:text-text mb-1"
            onClick={() => setDiagOpen((v) => !v)}
          >
            {diagOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Diagnóstico
          </button>
          {diagOpen ? (
            <div className="mt-1 space-y-0.5 rounded-lg border border-white/5 bg-[#0f0f0f] p-1.5 font-mono text-[9px] text-muted-2">
              <p>phase: {connectPhase}</p>
              <p>endpoint: {snap?.coordinator.endpoint || '—'}</p>
              <p>extensionConnected: {String(snap?.coordinator.extensionConnected ?? false)}</p>
              <p>
                installationId:{' '}
                {snap?.coordinator.activeExecutorInstallationId ||
                  snap?.coordinator.lastInstallationId ||
                  '—'}
              </p>
              <p>session.href: {snap?.session.href || '—'}</p>
              <p>
                sessionUsable: {String(connection?.sessionUsable ?? false)} ·
                loginRequired: {String(connection?.loginRequired ?? false)}
              </p>
              <div className="flex flex-wrap gap-1 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-7 px-2 text-[10px]"
                  icon={<RefreshCw className="h-3 w-3" />}
                  onClick={() => void refresh({ force: true })}
                >
                  Atualizar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-7 px-2 text-[10px]"
                  icon={<FolderOpen className="h-3 w-3" />}
                  onClick={() => void api.atlasFlowV1.openExtensionFolder()}
                >
                  Pasta da extensão
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Modal: seleção explícita de recuperação */}
      {explicitModalAttemptId ? (() => {
        const modalLine = snap?.prompts.find(
          (l) => l.activeAttempt?.attemptId === explicitModalAttemptId,
        )
        const modalAttempt = modalLine?.activeAttempt
        const candidates = modalAttempt?.recoveryCandidates || []
        const missing = modalAttempt?.missingCorrelation || []
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
            role="dialog"
            aria-modal="true"
            onClick={() => setExplicitModalAttemptId(null)}
          >
            <div
              className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl border border-white/10 bg-[#0a0a0a] p-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-text">
                    Recuperação por seleção explícita (sem regenerar)
                  </h3>
                  <p className="mt-0.5 text-[10px] text-muted">
                    Tentativa #{explicitModalAttemptId.slice(0, 8)} · O vínculo será gravado como{' '}
                    <code className="text-amber-400">explicit_user_selection</code>, sem correlação automática.
                  </p>
                  {missing.length > 0 ? (
                    <p className="mt-0.5 text-[10px] text-amber-400/90">
                      O que faltou na correlação automática: {missing.join(', ')}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-7 px-2 text-[10px]"
                  icon={<RefreshCw className={cn('h-3 w-3', listingCandidates && 'animate-spin')} />}
                  onClick={() => void onOpenExplicitSelection(explicitModalAttemptId)}
                >
                  Atualizar candidatos
                </Button>
              </div>
              {candidates.length === 0 ? (
                <div className="my-3 rounded-lg border border-white/5 bg-[#0f0f0f] p-3 text-center text-[10px] text-muted">
                  {listingCandidates
                    ? 'Aguardando leitura dos tiles visíveis na aba do Google Flow…'
                    : 'Nenhum candidato carregado ainda. Mantenha o projeto aberto no Flow e clique em Atualizar candidatos.'}
                </div>
              ) : (
                <div className="my-1 grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4">
                  {candidates.map((cand) => {
                    const checked = explicitSelectedKeys.includes(cand.candidateKey)
                    return (
                      <button
                        key={cand.candidateKey}
                        type="button"
                        onClick={() => {
                          setExplicitSelectedKeys((prev) =>
                            prev.includes(cand.candidateKey)
                              ? prev.filter((k) => k !== cand.candidateKey)
                              : [...prev, cand.candidateKey],
                          )
                        }}
                        className={cn(
                          'overflow-hidden rounded-lg border text-left transition-colors',
                          checked
                            ? 'border-emerald-500 bg-emerald-500/10'
                            : 'border-white/10 bg-[#0f0f0f] hover:border-white/30',
                        )}
                      >
                        {cand.previewDataUrl ? (
                          <img
                            src={cand.previewDataUrl}
                            alt={cand.alt || ''}
                            className="aspect-video w-full object-cover"
                          />
                        ) : (
                          <div className="flex aspect-video items-center justify-center bg-[#111] text-[9px] text-muted">
                            {cand.width && cand.height ? `${cand.width}×${cand.height}` : 'Tile Flow'}
                          </div>
                        )}
                        <div className="space-y-0.5 p-1 text-[9px]">
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate font-medium text-text">
                              {cand.flowMediaId
                                ? `ID: ${cand.flowMediaId.slice(0, 12)}…`
                                : cand.sha256
                                  ? `SHA: ${cand.sha256.slice(0, 12)}`
                                  : cand.candidateKey.slice(0, 20)}
                            </span>
                            {checked ? <Check className="h-3 w-3 text-emerald-500" /> : null}
                          </div>
                          {cand.alt ? (
                            <p className="truncate text-muted">{cand.alt}</p>
                          ) : null}
                          {cand.alreadyBoundElsewhere ? (
                            <p className="text-amber-400/80">Já registrado em outra tentativa</p>
                          ) : null}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
              <div className="flex items-center justify-end gap-1 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-7 px-3 text-[10px]"
                  onClick={() => setExplicitModalAttemptId(null)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  className="h-7 px-3 text-[10px]"
                  disabled={explicitSelectedKeys.length === 0 || busyPromptId === explicitModalAttemptId}
                  onClick={() => void onConfirmExplicitSelection(explicitModalAttemptId)}
                >
                  Vincular selecionados ({explicitSelectedKeys.length})
                </Button>
              </div>
            </div>
          </div>
        )
      })() : null}

      <Modal
        open={importOpen}
        title="Documento de prompts"
        size="lg"
        onClose={() => setImportOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setImportOpen(false)}>
              Cancelar
            </Button>
            <Button variant="secondary" onClick={() => void onPickDirectionDocument()}>
              Abrir arquivo
            </Button>
            <Button disabled={parsedDocument.length === 0} onClick={() => void onImport()}>
              {parsedDocument.length === 1
                ? 'Colocar o prompt 1'
                : `Colocar ${parsedDocument.length} prompts`}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            Cole o mesmo documento do Comfy. Entram só os blocos{' '}
            <span className="font-medium text-text">FLOW</span> de cada{' '}
            <span className="font-medium text-text">CENA</span> /{' '}
            <span className="font-medium text-text">CORTE</span>, numerados 1, 2, 3, 4. Uma lista{' '}
            <span className="font-medium text-text">1- 2- 3-</span> também vale.
          </p>
          <textarea
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder={'CENA 01\nFLOW — IMAGEM\n```\nprompt da cena 1\n```\n\nCENA 02\nFLOW — IMAGEM\n```\nprompt da cena 2\n```'}
            spellCheck={false}
            className="h-56 w-full resize-none overflow-y-auto rounded-xl border border-border bg-input px-3 py-2 font-mono text-[13px] leading-relaxed text-text placeholder:text-muted-2 focus:border-accent/60 focus:outline-none"
          />
          <p className="text-xs text-muted">
            {parsedDocument.length === 0
              ? 'Nenhum prompt reconhecido ainda.'
              : parsedDocument.length === 1
                ? `1 prompt, número ${parsedDocument[0].number}.`
                : `${parsedDocument.length} prompts, do ${parsedDocument[0].number} ao ${parsedDocument[parsedDocument.length - 1].number}.`}
          </p>
        </div>
      </Modal>

      {/* Modal: preview da imagem */}
      {previewResult ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setPreviewResult(null)}
        >
          <div
            className="max-h-[90vh] max-w-5xl overflow-auto rounded-xl border border-white/10 bg-[#0a0a0a] p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {previewResult.thumbDataUrl ? (
              <img
                src={previewResult.thumbDataUrl}
                alt=""
                className="max-h-[75vh] w-auto max-w-full rounded-lg object-contain"
              />
            ) : (
              <p className="p-8 text-sm text-muted">Arquivo sem preview embutido.</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <FlowResultDownloadMenu
                compact={false}
                disabled={!previewResult.fileExists}
                busy={downloadingResultId === previewResult.resultBindingId}
                onPick={(resolution) =>
                  void onDownloadResult(previewResult.resultBindingId, resolution)
                }
              />
              <Button
                type="button"
                variant="ghost"
                className="h-7 px-3 text-[10px] text-rose-300"
                disabled={deletingSlotKey === previewResult.resultBindingId}
                onClick={() =>
                  void onDeleteImage({
                    slotKey: previewResult.resultBindingId,
                    resultBindingId: previewResult.resultBindingId,
                    attemptId: previewResult.attemptId,
                    outputIndex: previewResult.outputIndex,
                    hasImage: true,
                  })
                }
              >
                Excluir
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  'h-7 px-3 text-[10px]',
                  previewResult.lipsyncSent ? 'text-emerald-400' : undefined,
                )}
                disabled={
                  !previewResult.fileExists ||
                  sendingLipSyncId === previewResult.resultBindingId
                }
                onClick={() => {
                  const line = (snap?.prompts || []).find((entry) =>
                    entry.results.some((r) => r.resultBindingId === previewResult.resultBindingId),
                  )
                  const sceneNumber =
                    line?.position ||
                    (snap?.archivedHistory || []).find((arch) =>
                      arch.results.some((r) => r.resultBindingId === previewResult.resultBindingId),
                    )?.position ||
                    0
                  if (!sceneNumber) {
                    push('Não achei o número da cena desta imagem.')
                    return
                  }
                  void onSendToLipSync(previewResult.resultBindingId, sceneNumber)
                }}
              >
                {sendingLipSyncId === previewResult.resultBindingId
                  ? 'Enviando…'
                  : previewResult.lipsyncSent
                    ? 'No LipSync ✓'
                    : 'LipSync'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-7 px-3 text-[10px]"
                onClick={() => setPreviewResult(null)}
              >
                Fechar
              </Button>
              <span className="ml-auto text-[10px] text-muted">
                {previewResult.byteSize.toLocaleString('pt-BR')} bytes · {previewResult.mimeType}
              </span>
            </div>
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={pendingDelete != null}
        title={
          pendingDelete?.kind === 'image'
            ? pendingDelete.hasImage
              ? 'Excluir imagem?'
              : 'Remover cartão?'
            : pendingDelete?.kind === 'reference'
              ? 'Remover referência?'
              : pendingDelete?.kind === 'prompt'
                ? 'Remover linha?'
                : pendingDelete?.kind === 'prompts-all'
                  ? 'Remover todas as linhas?'
                  : ''
        }
        message={
          pendingDelete?.kind === 'image'
            ? pendingDelete.hasImage
              ? 'A imagem sai da bancada e vai para a lixeira do Google Flow.'
              : 'Este cartão não tem imagem no Flow. Ele só sai da bancada.'
            : pendingDelete?.kind === 'reference'
              ? `“${pendingDelete.name}” deixa de aparecer nas linhas deste projeto.`
              : pendingDelete?.kind === 'prompt'
                ? `A linha ${String(pendingDelete.position).padStart(2, '0')} sai da bancada. As imagens já salvas continuam no histórico.`
                : pendingDelete?.kind === 'prompts-all'
                  ? `${pendingDelete.count} linha(s) saem da bancada. As imagens já salvas continuam no histórico. Linhas com geração em andamento ficam.`
                  : ''
        }
        confirmLabel={
          pendingDelete?.kind === 'image' && pendingDelete.hasImage
            ? 'Excluir'
            : pendingDelete?.kind === 'prompts-all'
              ? 'Remover todas'
              : 'Remover'
        }
        tone="danger"
        confirmOnEnter
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          const pending = pendingDelete
          setPendingDelete(null)
          if (!pending) return
          if (pending.kind === 'image') void runDeleteImage(pending)
          else if (pending.kind === 'reference') void runDeleteReference(pending.referenceId)
          else if (pending.kind === 'prompts-all') void runClearAllPrompts()
          else void runDeletePrompt(pending.promptId)
        }}
      />
      </div>
      </div>
    </PageShell>
  )
}
