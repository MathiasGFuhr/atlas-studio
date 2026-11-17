/**
 * Contrato de identidade de resultados Flow → Atlas.
 *
 * Regras invariantes:
 * 1. Posição no grid, primeiras imagens encontradas, ordem de conclusão,
 *    texto parecido/mesmo prompt ou mero novo <img>/URL temporária no DOM
 *    (ex.: virtualização do grid ou fechamento do painel de Assets) NÃO comprovam origem.
 * 2. Baseline pré-clique e SHAs/mediaIds conhecidos excluem resultados antigos,
 *    mas não provam sozinhos a origem dos novos.
 * 3. Origem positiva exige:
 *    - Canal A (`rpc_response`): identificadores reais observados em respostas da interação
 *      existente do próprio Flow (workflow/batch/mediaId/URL) correlacionados à submissão; OU
 *    - Canal B (`tracked_progress_slot`): output que materializou dentro de um container/slot
 *      de progresso (`0%..99%` / `progressbar`) nascido após o envio desta tentativa e
 *      carimbado com `attemptId` (excluindo cards pré-existentes de outras gerações); OU
 *    - Seleção explícita do usuário (`explicit_user_selection`) quando a correlação automática
 *      estiver indisponível/incerta.
 */

const RESERVED_PATH_TOKENS = new Set([
  'project',
  'projects',
  'media',
  'assets',
  'asset',
  'image',
  'images',
  'download',
  'preview',
  'thumbnail',
  'thumb',
  'api',
  'v1',
  'v1beta',
  'trpc',
  'fx',
  'flow',
  'storage',
  'public',
  'signed',
])

/**
 * @param {unknown} mediaId
 * @returns {boolean}
 */
export function isSyntheticLocalMediaId(mediaId) {
  const raw = String(mediaId || '').trim()
  if (!raw) return true
  return raw.startsWith('local:') || raw === '_gd' || raw.startsWith('_')
}

/**
 * Identificador estável real observado no DOM, URL de mídia ou resposta RPC do Flow.
 * Exclui sintéticos `local:<sha12>` e marcadores internos `_gd`.
 * @param {unknown} mediaId
 * @returns {boolean}
 */
export function isStableFlowMediaId(mediaId) {
  const raw = String(mediaId || '').trim()
  if (!raw || isSyntheticLocalMediaId(raw)) return false
  if (RESERVED_PATH_TOKENS.has(raw.toLowerCase())) return false
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    return true
  }
  return /^[a-zA-Z0-9_-]{16,160}$/.test(raw)
}

/**
 * Normaliza URL de mídia do Flow removendo parâmetros efêmeros de assinatura/token,
 * preservando host + pathname + query de identidade estável.
 * @param {unknown} rawUrl
 * @returns {string}
 */
export function normalizeFlowMediaSrcKey(rawUrl) {
  const raw = String(rawUrl || '').trim()
  if (!raw || raw.startsWith('data:')) return ''
  try {
    const u = new URL(raw, 'https://flow.google.com')
    if (u.protocol === 'blob:') return raw
    const stableParams = []
    for (const key of ['mediaId', 'media_id', 'assetId', 'asset_id', 'id', 'name']) {
      const val = u.searchParams.get(key)
      if (val && isStableFlowMediaId(val)) {
        stableParams.push(`${key}=${val}`)
      }
    }
    // Remove sufixo de redimensionamento FIFE/googleusercontent (`=w512-h341...`) para chave estável
    const cleanPath = u.pathname.replace(/=w\d+[^/]*$/i, '').replace(/=s\d+[^/]*$/i, '')
    const suffix = stableParams.length > 0 ? `?${stableParams.join('&')}` : ''
    return `${u.origin}${cleanPath}${suffix}`
  } catch {
    return raw.split('?')[0] || raw
  }
}

/**
 * Extrai identificador estável real de mídia a partir da URL observada na página/interação,
 * ignorando o `flowProjectId` do projeto. Sem inventar endpoints ou IDs sintéticos.
 * @param {unknown} rawUrl
 * @param {string|null} [flowProjectId]
 * @returns {string|null}
 */
export function extractMediaIdFromFlowUrl(rawUrl, flowProjectId = null) {
  const raw = String(rawUrl || '').trim()
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return null
  const projectLower = flowProjectId ? String(flowProjectId).trim().toLowerCase() : ''
  try {
    const u = new URL(raw, 'https://flow.google.com')
    for (const key of ['mediaId', 'media_id', 'assetId', 'asset_id', 'generationMediaId', 'id']) {
      const candidate = u.searchParams.get(key)
      if (
        candidate &&
        candidate.toLowerCase() !== projectLower &&
        isStableFlowMediaId(candidate)
      ) {
        return candidate
      }
    }
    const cleanPath = u.pathname.replace(/=w\d+[^/]*$/i, '').replace(/=s\d+[^/]*$/i, '')
    const segments = cleanPath
      .split('/')
      .map((seg) => decodeURIComponent(seg).trim())
      .filter(Boolean)
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      const seg = segments[i].replace(/\.(png|jpe?g|webp|gif|mp4|bin)$/i, '')
      if (!seg || seg.toLowerCase() === projectLower) continue
      if (RESERVED_PATH_TOKENS.has(seg.toLowerCase())) continue
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) {
        return seg
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Determina se a tentativa ainda está gerando.
 * Corrige a falha em que `"0%"` em `card-percent-text` sem `[role="progressbar"]`
 * retornava `busy: false` 44ms–72ms após clicar em Start generation.
 *
 * @param {{
 *   domBusy?: boolean
 *   slotPercents?: number[]|null
 *   generatingCardCount?: number|null
 *   trackedGeneratingSlotCount?: number|null
 * }} input
 */
export function evaluateAttemptBusyState(input = {}) {
  const percents = Array.isArray(input.slotPercents)
    ? input.slotPercents.map((p) => Number(p)).filter((p) => Number.isFinite(p) && p >= 0 && p <= 100)
    : []
  const hasIncompletePercent = percents.some((p) => p < 100)
  const minPercent = percents.length > 0 ? Math.min(...percents) : null
  const trackedSlots = Math.max(0, Number(input.trackedGeneratingSlotCount) || 0)
  const cardCount = Math.max(0, Number(input.generatingCardCount) || 0)
  const domBusy = input.domBusy === true

  const busy =
    domBusy ||
    hasIncompletePercent ||
    trackedSlots > 0 ||
    (cardCount > 0 && percents.length === 0)

  let reason = 'idle'
  if (trackedSlots > 0) reason = 'tracked_slots_generating'
  else if (hasIncompletePercent) reason = `slot_percent_incomplete_${minPercent}`
  else if (domBusy) reason = 'dom_busy_indicator'
  else if (cardCount > 0 && percents.length === 0) reason = 'generating_cards_present'

  return {
    busy,
    hasIncompletePercent,
    minPercent,
    activeSlotCount: Math.max(trackedSlots, hasIncompletePercent ? percents.length : 0, domBusy ? 1 : 0),
    reason,
  }
}

/**
 * @param {...unknown} lists
 * @returns {string[]}
 */
export function mergeIdentityLists(...lists) {
  const out = new Set()
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const raw of list) {
      const value = String(raw || '').trim()
      if (value) out.add(value)
    }
  }
  return [...out]
}

/**
 * Cria/normaliza o estado serializável de correlação de uma tentativa.
 * Pode ser persistido em `chrome.storage.local` e em `flow_attempts.settings_snapshot_json`.
 *
 * @param {Record<string, unknown>} [init]
 */
export function createAttemptCorrelationSession(init = {}) {
  const excludeSrcs = mergeIdentityLists(init.excludeSrcs).map((s) => normalizeFlowMediaSrcKey(s) || s)
  const excludeMediaIds = mergeIdentityLists(init.excludeMediaIds).filter((id) =>
    isStableFlowMediaId(id),
  )
  const excludeShas = mergeIdentityLists(init.excludeShas)
    .map((s) => s.toLowerCase())
    .filter((s) => s.length >= 16)
  const preExistingSlotKeys = mergeIdentityLists(init.preExistingSlotKeys)
  const rpcWorkflowIds = mergeIdentityLists(init.rpcWorkflowIds)
  const rpcMediaIds = mergeIdentityLists(init.rpcMediaIds).filter(
    (id) => isStableFlowMediaId(id) && !excludeMediaIds.includes(id),
  )
  const rpcSrcs = mergeIdentityLists(init.rpcSrcs)
    .map((s) => normalizeFlowMediaSrcKey(s) || s)
    .filter((s) => Boolean(s) && !excludeSrcs.includes(s))
  const slotLineageMediaIds = mergeIdentityLists(init.slotLineageMediaIds).filter(
    (id) => isStableFlowMediaId(id) && !excludeMediaIds.includes(id),
  )
  const slotLineageSrcs = mergeIdentityLists(init.slotLineageSrcs)
    .map((s) => normalizeFlowMediaSrcKey(s) || s)
    .filter((s) => Boolean(s) && !excludeSrcs.includes(s))

  // Compatibilidade com registros salvos anteriormente (`acceptedSrcs`/`acceptedMediaIds`)
  // somente quando marcados como verificados (`allowlistVerified === true`).
  const legacyVerified = init.allowlistVerified === true
  const acceptedMediaIds = mergeIdentityLists(
    rpcMediaIds,
    slotLineageMediaIds,
    legacyVerified ? init.acceptedMediaIds : [],
  ).filter((id) => !excludeMediaIds.includes(id))
  const acceptedSrcs = mergeIdentityLists(
    rpcSrcs,
    slotLineageSrcs,
    legacyVerified ? init.acceptedSrcs : [],
  ).filter((s) => !excludeSrcs.includes(s))

  const originProofByKey =
    init.originProofByKey && typeof init.originProofByKey === 'object'
      ? { ...init.originProofByKey }
      : {}
  for (const id of slotLineageMediaIds) {
    if (!originProofByKey[`media:${id}`]) originProofByKey[`media:${id}`] = 'tracked_progress_slot'
  }
  for (const s of slotLineageSrcs) {
    if (!originProofByKey[`src:${s}`]) originProofByKey[`src:${s}`] = 'tracked_progress_slot'
  }
  for (const id of rpcMediaIds) {
    originProofByKey[`media:${id}`] = 'rpc_response'
  }
  for (const s of rpcSrcs) {
    originProofByKey[`src:${s}`] = 'rpc_response'
  }

  return {
    schemaVersion: 2,
    attemptId: String(init.attemptId || ''),
    commandId: init.commandId ? String(init.commandId) : null,
    promptText: typeof init.promptText === 'string' ? init.promptText : '',
    submittedAfterMs: Number.isFinite(Number(init.submittedAfterMs))
      ? Number(init.submittedAfterMs)
      : null,
    baselineClosedPanel: init.baselineClosedPanel === true,
    baselineEvidenceCount: Math.max(0, Number(init.baselineEvidenceCount) || 0),
    excludeSrcs,
    excludeMediaIds,
    excludeShas,
    preExistingSlotKeys,
    rpcWorkflowIds,
    rpcMediaIds,
    rpcSrcs,
    slotLineageMediaIds,
    slotLineageSrcs,
    acceptedMediaIds,
    acceptedSrcs,
    allowlistVerified: true,
    sawAcceptedProgress: Boolean(
      init.sawAcceptedProgress ||
        rpcWorkflowIds.length > 0 ||
        rpcMediaIds.length > 0 ||
        slotLineageMediaIds.length > 0 ||
        slotLineageSrcs.length > 0,
    ),
    trackedSlotKeys: mergeIdentityLists(init.trackedSlotKeys),
    originProofByKey,
  }
}

/**
 * Registra resposta observada da própria interação de rede do Flow.
 * Distingue duas tentativas com o MESMO prompt via `workflowId` já vinculado à tentativa
 * ou janela de submissão (`requestStartedAtMs >= submittedAfterMs` sem pertencer a outro workflow).
 *
 * @param {ReturnType<typeof createAttemptCorrelationSession>} session
 * @param {{
 *   workflowId?: string|null
 *   foreignWorkflowIds?: string[]
 *   requestPromptText?: string|null
 *   requestStartedAtMs?: number|null
 *   mediaIds?: string[]
 *   mediaUrls?: string[]
 *   flowProjectId?: string|null
 * }} rpcObs
 */
export function recordCorrelatedRpcObservation(session, rpcObs = {}) {
  const base = createAttemptCorrelationSession(session)
  const wf = rpcObs.workflowId ? String(rpcObs.workflowId).trim() : ''
  const foreignWfs = new Set(mergeIdentityLists(rpcObs.foreignWorkflowIds))
  if (wf && foreignWfs.has(wf)) {
    return { session: base, matched: false, reason: 'FOREIGN_WORKFLOW_ID' }
  }

  const knownWf = wf && base.rpcWorkflowIds.includes(wf)
  let submitMatched = knownWf
  if (!submitMatched) {
    // Se esta sessão JÁ está vinculada a um workflowId específico e veio outro workflowId diferente,
    // não misturar (ex.: segunda tentativa com o mesmo prompt em paralelo / fora de ordem).
    if (wf && base.rpcWorkflowIds.length > 0 && !base.rpcWorkflowIds.includes(wf)) {
      return { session: base, matched: false, reason: 'DIFFERENT_WORKFLOW_ID_FOR_SAME_PROMPT' }
    }
    const reqPrompt = typeof rpcObs.requestPromptText === 'string' ? rpcObs.requestPromptText.trim() : ''
    const expectedPrompt = String(base.promptText || '').trim()
    const promptMatches = Boolean(reqPrompt && expectedPrompt && reqPrompt === expectedPrompt)
    const reqTime = Number(rpcObs.requestStartedAtMs)
    const afterSubmit =
      base.submittedAfterMs == null ||
      !Number.isFinite(reqTime) ||
      reqTime >= base.submittedAfterMs - 250
    submitMatched = promptMatches && afterSubmit
  }

  if (!submitMatched) {
    return { session: base, matched: false, reason: 'RPC_NOT_CORRELATED_TO_ATTEMPT' }
  }

  const discoveredMediaIds = [...mergeIdentityLists(rpcObs.mediaIds)]
  const discoveredSrcs = []
  for (const rawUrl of mergeIdentityLists(rpcObs.mediaUrls)) {
    const key = normalizeFlowMediaSrcKey(rawUrl)
    if (key) discoveredSrcs.push(key)
    const extracted = extractMediaIdFromFlowUrl(rawUrl, rpcObs.flowProjectId || null)
    if (extracted) discoveredMediaIds.push(extracted)
  }

  const next = createAttemptCorrelationSession({
    ...base,
    rpcWorkflowIds: wf ? mergeIdentityLists(base.rpcWorkflowIds, [wf]) : base.rpcWorkflowIds,
    rpcMediaIds: mergeIdentityLists(base.rpcMediaIds, discoveredMediaIds),
    rpcSrcs: mergeIdentityLists(base.rpcSrcs, discoveredSrcs),
    sawAcceptedProgress: true,
  })
  return { session: next, matched: true, reason: 'RPC_CORRELATED' }
}

/**
 * Registra outputs que transicionaram de progresso ativo (`0%..99%` / `progressbar`)
 * para mídia final DENTRO de um container/slot rastreado desta tentativa.
 *
 * Mero aparecimento de `<img>` no DOM (scroll/virtualização do grid ou fechar painel de Assets)
 * tem `transitionedFromProgress = false` ou `slotAttemptId !== session.attemptId` e é REJEITADO.
 *
 * @param {ReturnType<typeof createAttemptCorrelationSession>} session
 * @param {{
 *   slotKey: string
 *   slotAttemptId?: string|null
 *   transitionedFromProgress?: boolean
 *   mediaId?: string|null
 *   src?: string|null
 *   flowProjectId?: string|null
 * }} obs
 */
export function recordTrackedSlotOutput(session, obs) {
  const base = createAttemptCorrelationSession(session)
  const slotKey = String(obs?.slotKey || '').trim()
  if (!slotKey) {
    return { session: base, accepted: false, reason: 'MISSING_SLOT_KEY' }
  }
  if (base.preExistingSlotKeys.includes(slotKey)) {
    return { session: base, accepted: false, reason: 'PRE_EXISTING_PROGRESS_SLOT' }
  }
  if (!obs?.transitionedFromProgress) {
    return { session: base, accepted: false, reason: 'UNTRACKED_DOM_APPEARANCE_OR_VIRTUALIZATION' }
  }
  if (base.attemptId && obs?.slotAttemptId && String(obs.slotAttemptId) !== base.attemptId) {
    return { session: base, accepted: false, reason: 'SLOT_OWNED_BY_OTHER_ATTEMPT' }
  }

  const srcKey = obs?.src ? normalizeFlowMediaSrcKey(obs.src) : ''
  const extractedMediaId =
    obs?.mediaId && isStableFlowMediaId(obs.mediaId)
      ? String(obs.mediaId).trim()
      : extractMediaIdFromFlowUrl(obs?.src || '', obs?.flowProjectId || null)

  if (srcKey && base.excludeSrcs.includes(srcKey)) {
    return { session: base, accepted: false, reason: 'EXCLUDED_BASELINE_SRC' }
  }
  if (extractedMediaId && base.excludeMediaIds.includes(extractedMediaId)) {
    return { session: base, accepted: false, reason: 'EXCLUDED_BASELINE_MEDIA_ID' }
  }
  if (!srcKey && !extractedMediaId) {
    return { session: base, accepted: false, reason: 'NO_STABLE_OUTPUT_IDENTITY' }
  }

  const next = createAttemptCorrelationSession({
    ...base,
    trackedSlotKeys: mergeIdentityLists(base.trackedSlotKeys, [slotKey]),
    slotLineageMediaIds: extractedMediaId
      ? mergeIdentityLists(base.slotLineageMediaIds, [extractedMediaId])
      : base.slotLineageMediaIds,
    slotLineageSrcs: srcKey
      ? mergeIdentityLists(base.slotLineageSrcs, [srcKey])
      : base.slotLineageSrcs,
    sawAcceptedProgress: true,
  })
  return { session: next, accepted: true, reason: 'TRACKED_PROGRESS_SLOT_LINEAGE' }
}

/**
 * Diagnóstico honesto e auditável do que falta quando a correlação automática não se fecha.
 * @param {Partial<ReturnType<typeof createAttemptCorrelationSession>>|null|undefined} session
 * @returns {string[]}
 */
export function diagnoseMissingCorrelation(session) {
  const missing = []
  if (!session || typeof session !== 'object') {
    return [
      'no_persisted_correlation_session',
      'no_pre_submit_baseline',
      'no_rpc_generation_correlation',
      'no_tracked_progress_slot_lineage',
    ]
  }
  const norm = createAttemptCorrelationSession(session)
  if (!norm.baselineClosedPanel && norm.excludeSrcs.length === 0 && norm.excludeMediaIds.length === 0) {
    missing.push('pre_submit_baseline_with_closed_panel_missing')
  }
  if (!norm.sawAcceptedProgress) {
    missing.push('accepted_generation_progress_not_observed')
  }
  const hasAnyPositiveOutput =
    norm.acceptedMediaIds.length > 0 ||
    norm.acceptedSrcs.length > 0 ||
    norm.rpcMediaIds.length > 0 ||
    norm.rpcSrcs.length > 0 ||
    norm.slotLineageMediaIds.length > 0 ||
    norm.slotLineageSrcs.length > 0
  if (!hasAnyPositiveOutput) {
    if (norm.rpcMediaIds.length === 0 && norm.rpcSrcs.length === 0) {
      missing.push('flow_rpc_output_ids_not_observed')
    }
    if (norm.slotLineageMediaIds.length === 0 && norm.slotLineageSrcs.length === 0) {
      missing.push('tracked_progress_slot_to_image_lineage_not_observed')
    }
  }
  return missing
}

/**
 * Avalia vínculo de SHA + flowMediaId estável no banco de dados.
 * - Mesma tentativa + mesmo SHA (ou mesmo flowMediaId real) → idempotente!
 * - Outra tentativa já possui o mesmo SHA ou o mesmo flowMediaId real → bloqueia!
 *
 * @param {{
 *   sha256: string
 *   flowMediaId?: string|null
 *   attemptId: string
 *   knownBindings: Array<{
 *     id?: string
 *     sha256: string
 *     flowMediaId?: string|null
 *     outputIndex?: number
 *     attemptId: string
 *     retrievalState?: string
 *     errorCode?: string|null
 *   }>
 *   allowKnownSha?: boolean
 * }} input
 */
export function evaluateResultShaBinding(input) {
  const sha = String(input.sha256 || '').toLowerCase()
  const attemptId = String(input.attemptId || '')
  const rawMediaId = input.flowMediaId ? String(input.flowMediaId).trim() : ''
  const stableMediaId = isStableFlowMediaId(rawMediaId) ? rawMediaId : null

  if (!sha || sha.length < 16 || !attemptId) {
    return { ok: false, error: 'RESULT_SHA_INVALID' }
  }

  const sameAttempt = input.knownBindings.find(
    (b) =>
      b.attemptId === attemptId &&
      (String(b.sha256 || '').toLowerCase() === sha ||
        (stableMediaId &&
          isStableFlowMediaId(b.flowMediaId) &&
          String(b.flowMediaId).trim() === stableMediaId)),
  )
  if (sameAttempt) {
    if (
      sameAttempt.retrievalState === 'misattributed' ||
      sameAttempt.errorCode === 'MISATTRIBUTED_CAPTURE'
    ) {
      if (input.allowKnownSha !== true) {
        return { ok: false, error: 'RESULT_SHA_MISATTRIBUTED', existingAttemptId: attemptId }
      }
    }
    return {
      ok: true,
      idempotent: true,
      resultBindingId: sameAttempt.id || null,
      outputIndex: typeof sameAttempt.outputIndex === 'number' ? sameAttempt.outputIndex : undefined,
    }
  }

  // Bloqueia colisão de flowMediaId estável entre tentativas distintas (ex.: duas tentativas mesmo prompt).
  if (stableMediaId) {
    const otherByMedia = input.knownBindings.find(
      (b) =>
        b.attemptId !== attemptId &&
        b.retrievalState !== 'misattributed' &&
        isStableFlowMediaId(b.flowMediaId) &&
        String(b.flowMediaId).trim() === stableMediaId,
    )
    if (otherByMedia && input.allowKnownSha !== true) {
      return {
        ok: false,
        error: 'RESULT_MEDIA_ID_ALREADY_BOUND',
        existingAttemptId: otherByMedia.attemptId,
      }
    }
  }

  const other = input.knownBindings.find(
    (b) =>
      String(b.sha256 || '').toLowerCase() === sha &&
      b.attemptId !== attemptId &&
      // Se em outra tentativa já foi auditado como misattributed e aqui há allowKnownSha, permite recuperar;
      // caso contrário bloqueia qualquer SHA já visto no projeto.
      true,
  )
  if (other && input.allowKnownSha !== true) {
    // Aponta preferencialmente para o dono `retrieved` se existir.
    const retrievedOwner = input.knownBindings.find(
      (b) =>
        String(b.sha256 || '').toLowerCase() === sha &&
        b.attemptId !== attemptId &&
        b.retrievalState === 'retrieved',
    )
    return {
      ok: false,
      error: 'RESULT_SHA_ALREADY_BOUND',
      existingAttemptId: (retrievedOwner || other).attemptId,
    }
  }

  return { ok: true, idempotent: false }
}

/**
 * Escolhe o vínculo legítimo quando um mesmo SHA apareceu em múltiplas tentativas.
 * Se houver metadados de prova positiva (`originProof` verificado) prioriza quem comprovou origem;
 * caso contrário usa o `createdAt` mais antigo.
 *
 * @param {Array<{ id: string, attemptId: string, createdAt: string, hasVerifiedOrigin?: boolean }>} bindings
 */
export function pickLegitimateOwner(bindings) {
  if (!Array.isArray(bindings) || bindings.length === 0) return null
  const sorted = [...bindings].sort((a, b) => {
    const va = a.hasVerifiedOrigin === true ? 1 : 0
    const vb = b.hasVerifiedOrigin === true ? 1 : 0
    if (vb !== va) return vb - va
    return String(a.createdAt).localeCompare(String(b.createdAt))
  })
  const keep = sorted[0]
  return {
    keepBindingId: keep.id,
    keepAttemptId: keep.attemptId,
    victimBindingIds: sorted.slice(1).map((b) => b.id),
    victimAttemptIds: [...new Set(sorted.slice(1).map((b) => b.attemptId))],
  }
}

/**
 * Baseline pré-clique + SHAs/mediaIds do projeto: exclusão necessária, mas insuficiente sozinha.
 * @param {{
 *   excludeSrcs: string[]
 *   excludeShas: string[]
 *   excludeMediaIds?: string[]
 *   candidateSha?: string|null
 *   candidateSrc?: string|null
 *   candidateMediaId?: string|null
 * }} input
 */
export function isCandidateExcludedByBaseline(input) {
  const sha = String(input.candidateSha || '').toLowerCase()
  const rawSrc = input.candidateSrc ? String(input.candidateSrc) : ''
  const normSrc = rawSrc ? normalizeFlowMediaSrcKey(rawSrc) : ''
  const mediaId = input.candidateMediaId ? String(input.candidateMediaId).trim() : ''

  if (sha && (input.excludeShas || []).map((s) => String(s).toLowerCase()).includes(sha)) {
    return true
  }
  const excludedSrcList = (input.excludeSrcs || []).map((s) => String(s))
  const excludedNormSrcs = new Set(
    excludedSrcList.flatMap((s) => [s, normalizeFlowMediaSrcKey(s)]).filter(Boolean),
  )
  if ((rawSrc && excludedNormSrcs.has(rawSrc)) || (normSrc && excludedNormSrcs.has(normSrc))) {
    return true
  }
  if (
    mediaId &&
    !isSyntheticLocalMediaId(mediaId) &&
    (input.excludeMediaIds || []).map((id) => String(id).trim()).includes(mediaId)
  ) {
    return true
  }
  return false
}

/**
 * Origem positiva: o candidato precisa estar correlacionado positivamente à tentativa
 * (via resposta RPC ou slot de progresso rastreado) OU selecionado explicitamente pelo usuário.
 *
 * @param {{
 *   candidateKey?: string|null
 *   candidateSrc?: string|null
 *   candidateMediaId?: string|null
 *   allowSrcs?: string[]
 *   allowMediaIds?: string[]
 *   explicitSelectionKeys?: string[]
 *   originProofByKey?: Record<string, string>
 *   requireAllowlist?: boolean
 *   correlationSession?: Record<string, unknown>|null
 * }} input
 */
export function evaluatePositiveOrigin(input) {
  const explicitKeys = Array.isArray(input.explicitSelectionKeys)
    ? input.explicitSelectionKeys.map((k) => String(k || '').trim()).filter(Boolean)
    : []
  const rawSrc = input.candidateSrc ? String(input.candidateSrc) : ''
  const normSrc = rawSrc ? normalizeFlowMediaSrcKey(rawSrc) : ''
  const mediaId =
    input.candidateMediaId && !isSyntheticLocalMediaId(input.candidateMediaId)
      ? String(input.candidateMediaId).trim()
      : ''
  const candidateKey = input.candidateKey ? String(input.candidateKey).trim() : ''

  // Modo de recuperação explícita pelo usuário: não afirma correlação automática!
  if (explicitKeys.length > 0) {
    const matchedExplicit =
      (candidateKey && explicitKeys.includes(candidateKey)) ||
      (mediaId && explicitKeys.includes(mediaId)) ||
      (rawSrc && explicitKeys.includes(rawSrc)) ||
      (normSrc && explicitKeys.includes(normSrc))
    if (matchedExplicit) {
      return {
        ok: true,
        reason: 'explicit_user_selection',
        originProof: 'explicit_user_selection',
        automaticCorrelation: false,
        correlationUncertain: false,
      }
    }
    return {
      ok: false,
      reason: 'NOT_IN_EXPLICIT_SELECTION',
      originProof: null,
      automaticCorrelation: false,
      correlationUncertain: false,
    }
  }

  const allowSrcsRaw = Array.isArray(input.allowSrcs) ? input.allowSrcs.filter(Boolean) : []
  const allowSrcSet = new Set(
    allowSrcsRaw.flatMap((s) => [String(s), normalizeFlowMediaSrcKey(s)]).filter(Boolean),
  )
  const allowMediaIds = Array.isArray(input.allowMediaIds)
    ? input.allowMediaIds
        .map((id) => String(id || '').trim())
        .filter((id) => Boolean(id) && !isSyntheticLocalMediaId(id))
    : []
  const hasAllowlist = allowSrcSet.size > 0 || allowMediaIds.length > 0
  const requireAllowlist = input.requireAllowlist === true
  const proofMap =
    input.originProofByKey && typeof input.originProofByKey === 'object'
      ? input.originProofByKey
      : {}

  if (!hasAllowlist) {
    if (requireAllowlist) {
      return {
        ok: false,
        reason: 'ALLOWLIST_EMPTY',
        originProof: null,
        automaticCorrelation: false,
        correlationUncertain: true,
        missingCorrelation: diagnoseMissingCorrelation(input.correlationSession),
      }
    }
    return {
      ok: true,
      reason: 'allowlist_not_required',
      originProof: 'unverified_diagnostic',
      automaticCorrelation: false,
      correlationUncertain: false,
    }
  }

  if (mediaId && allowMediaIds.includes(mediaId)) {
    return {
      ok: true,
      reason: 'media_id_allowlist',
      originProof: proofMap[`media:${mediaId}`] || 'correlated_media_id',
      automaticCorrelation: true,
      correlationUncertain: false,
    }
  }
  if ((normSrc && allowSrcSet.has(normSrc)) || (rawSrc && allowSrcSet.has(rawSrc))) {
    return {
      ok: true,
      reason: 'src_allowlist',
      originProof:
        proofMap[`src:${normSrc}`] || proofMap[`src:${rawSrc}`] || 'tracked_progress_slot',
      automaticCorrelation: true,
      correlationUncertain: false,
    }
  }
  return {
    ok: false,
    reason: 'NOT_IN_POST_ACCEPT_ALLOWLIST',
    originProof: null,
    automaticCorrelation: false,
    correlationUncertain: true,
  }
}

/**
 * Decisão final de captura de candidato: exclusão de baseline + origem positiva.
 * @param {{
 *   candidateSha: string
 *   candidateKey?: string|null
 *   candidateSrc?: string|null
 *   candidateMediaId?: string|null
 *   excludeSrcs?: string[]
 *   excludeShas?: string[]
 *   excludeMediaIds?: string[]
 *   allowSrcs?: string[]
 *   allowMediaIds?: string[]
 *   explicitSelectionKeys?: string[]
 *   originProofByKey?: Record<string, string>
 *   requireAllowlist?: boolean
 *   correlationSession?: Record<string, unknown>|null
 * }} input
 */
export function evaluateCaptureCandidateIdentity(input) {
  // Se o usuário selecionou explicitamente um tile específico na UI de recuperação,
  // ainda bloqueamos SHAs já vinculados como `retrieved` em outra tentativa no servidor,
  // mas na captura automática a exclusão de baseline vale integralmente.
  const hasExplicitSelection =
    Array.isArray(input.explicitSelectionKeys) && input.explicitSelectionKeys.length > 0
  if (
    !hasExplicitSelection &&
    isCandidateExcludedByBaseline({
      excludeSrcs: input.excludeSrcs || [],
      excludeShas: input.excludeShas || [],
      excludeMediaIds: input.excludeMediaIds || [],
      candidateSha: input.candidateSha,
      candidateSrc: input.candidateSrc,
      candidateMediaId: input.candidateMediaId,
    })
  ) {
    return {
      ok: false,
      reason: 'EXCLUDED_BY_BASELINE',
      originProof: null,
      automaticCorrelation: false,
      correlationUncertain: false,
    }
  }
  return evaluatePositiveOrigin({
    candidateKey: input.candidateKey,
    candidateSrc: input.candidateSrc,
    candidateMediaId: input.candidateMediaId,
    allowSrcs: input.allowSrcs,
    allowMediaIds: input.allowMediaIds,
    explicitSelectionKeys: input.explicitSelectionKeys,
    originProofByKey: input.originProofByKey,
    requireAllowlist: input.requireAllowlist,
    correlationSession: input.correlationSession,
  })
}

const SCENE_ALIASES = {
  navio: ['navio', 'ship', 'boat', 'vessel'],
  mar: ['mar', 'sea', 'ocean'],
  luxoso: ['luxoso', 'luxury', 'luxurious'],
  gospel: ['gospel'],
  praia: ['praia', 'beach', 'shore'],
  mata: ['mata', 'woods', 'forest'],
  floresta: ['floresta', 'forest', 'woods'],
}

/**
 * Evidência auxiliar de prompt: Flow pode rotular em EN enquanto o Atlas envia PT.
 * ATENÇÃO: Usada APENAS como diagnóstico auxiliar — NUNCA comprova origem sozinha.
 * @param {string} promptFingerprint
 * @param {string[]} labels
 */
export function matchPromptEvidenceLabels(promptFingerprint, labels) {
  const fingerprint = String(promptFingerprint || '').trim()
  if (!fingerprint) return { matched: true, mode: 'not_required' }
  const exact = fingerprint.slice(0, 80).toLowerCase()
  const exactHit = (labels || []).find((l) => String(l || '').toLowerCase().includes(exact))
  if (exactHit) return { matched: true, mode: 'exact_substr', label: exactHit }
  const stop = new Set([
    'cantor',
    'singer',
    'no',
    'na',
    'do',
    'da',
    'de',
    'em',
    'um',
    'uma',
    'foco',
    'meio',
  ])
  const tokens = fingerprint
    .toLowerCase()
    .replace(/[\[\].,;:!?]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !stop.has(t))
  const needles = new Set()
  for (const t of tokens) {
    needles.add(t)
    for (const a of SCENE_ALIASES[t] || []) needles.add(a)
  }
  let best = null
  let bestScore = 0
  for (const label of labels || []) {
    const low = String(label || '').toLowerCase()
    const score = [...needles].filter((n) => low.includes(n)).length
    if (score > bestScore) {
      bestScore = score
      best = label
    }
  }
  if (best && bestScore >= 2) {
    return { matched: true, mode: 'scene_token_overlap', label: best, score: bestScore }
  }
  return { matched: false, mode: 'unmatched', score: bestScore }
}
