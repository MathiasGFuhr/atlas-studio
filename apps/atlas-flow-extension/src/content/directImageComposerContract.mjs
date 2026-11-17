/**
 * Contrato do compositor direto de imagem (sem Agente / Omni / vídeo).
 * pageSensor.js deve espelhar estas regras antes de escrever ou enviar.
 *
 * Evidência 2026-11-14: writePromptText ativou chat do Agente (Aprovar / Omni)
 * com editorTop→0 e "Iniciar geração" permanece DISABLED — texto não entrou
 * no compositor clássico.
 */

import { normalizeControlLabel, isStartGenerationLabel, isAddIngredientsLabel } from './readinessContract.mjs'

/** Intent explícito exigido pela bancada Atlas. */
export const DIRECT_IMAGE_GENERATION_INTENT = 'direct_image_generation'

/**
 * @param {string} label
 */
export function isAgentModeLabel(label) {
  const n = normalizeControlLabel(label)
  if (!n) return false
  if (n === 'agent' || n === 'agente') return true
  if (n === 'apps_spark_2 agent' || n === 'apps_spark_2 agente') return true
  return /^(apps_spark_2\s*)?agente?$/.test(n)
}

/**
 * Placeholder observado do compositor clássico (EN/PT). Não inventar variantes.
 * @param {string} label
 */
export function isDirectComposerPlaceholderLabel(label) {
  const n = normalizeControlLabel(label)
  return n === 'what do you want to create?' || n === 'o que voce quer criar?'
}

/**
 * Campo de instruções do chat do Agente (observado após hijack).
 * @param {string} label
 */
export function isAgentInstructionLabel(label) {
  const n = normalizeControlLabel(label)
  return (
    n === 'instrucoes para o agente' ||
    n === 'instructions for the agent' ||
    n.includes('instrucoes para o agente') ||
    n.includes('instructions for the agent')
  )
}

/**
 * UI de cobrança / proposta do Agente — NÃO conta como geração de imagem aceita.
 * @param {string[]} labels
 */
export function detectAgentApprovalUi(labels) {
  const joined = (labels || []).join(' · ')
  return (
    /pensando\.\.\.|thinking\.\.\.|visualizing the|quer que eu inicie|quero que eu inicie|sempre aprovar no projeto|custa\s+\d+\s+cr[eé]ditos|costs?\s+\d+\s+credits|omni\s*1\.\d|gera[cç][aã]o de v[ií]deo|video generation|iniciar nova sessao|start new session/i.test(
      joined,
    ) ||
    (/\b(aprovar|rejeitar|approve|reject)\b/i.test(joined) &&
      /\b(cr[eé]dito|credit|omni|v[ií]deo|video)\b/i.test(joined))
  )
}

/**
 * @param {{
 *   labels?: string[],
 *   agentPillSelected?: boolean,
 * }} input
 */
export function detectAgentSessionState(input = {}) {
  const labels = Array.isArray(input.labels) ? input.labels : []
  const agentUi = detectAgentApprovalUi(labels)
  const agentPillSelected = input.agentPillSelected === true
  const startListed = labels.some((l) => isStartGenerationLabel(l))
  return {
    active: agentUi || agentPillSelected,
    agentUi,
    agentPillSelected,
    startListed,
    intentRequired: DIRECT_IMAGE_GENERATION_INTENT,
  }
}

/**
 * Pontua editor candidato: menor = melhor. Rejeita topo / Agente / título.
 * @param {{
 *   top: number,
 *   bottom: number,
 *   left: number,
 *   right: number,
 *   aria?: string,
 *   startRects?: Array<{ top: number, bottom: number, left: number, right: number }>,
 *   ingredientRects?: Array<{ top: number, bottom: number, left: number, right: number }>,
 *   placeholderRects?: Array<{ top: number, bottom: number, left: number, right: number }>,
 * }} candidate
 */
export function scoreDirectComposerEditor(candidate) {
  const er = candidate
  let score = 50_000
  const aria = normalizeControlLabel(candidate.aria || '')

  if (isAgentInstructionLabel(aria)) score += 50_000
  if (/editable text|texto editavel|project name|nome do projeto/.test(aria)) score += 12_000
  if (isDirectComposerPlaceholderLabel(aria) || /prompt|describe|descreva/.test(aria)) {
    score -= 8_000
  }

  for (const ar of candidate.startRects || []) {
    const dist = Math.abs(er.bottom - ar.bottom) * 2 + Math.abs(er.right - ar.left)
    score = Math.min(score, dist)
  }
  for (const ar of candidate.ingredientRects || []) {
    const dist =
      Math.abs(er.left - ar.left) + Math.abs(er.bottom - ar.top) + Math.abs(er.top - ar.top) * 0.25
    if (dist < score) score = dist
  }
  for (const ar of candidate.placeholderRects || []) {
    const dist = Math.abs(er.top - ar.top) + Math.abs(er.left - ar.left)
    score = Math.min(score, dist + 500)
  }

  if (er.top < 160) score += 10_000
  if (er.top >= 400) score -= 2_000
  return score
}

/**
 * Escolhe o editor do compositor direto entre vários, ou bloqueia.
 * @param {Array<{ id: string, top: number, bottom: number, left: number, right: number, aria?: string }>} editors
 * @param {{
 *   startRects?: Array<{ top: number, bottom: number, left: number, right: number }>,
 *   ingredientRects?: Array<{ top: number, bottom: number, left: number, right: number }>,
 *   placeholderRects?: Array<{ top: number, bottom: number, left: number, right: number }>,
 *   agentSessionActive?: boolean,
 * }} context
 */
export function selectDirectComposerEditor(editors, context = {}) {
  if (context.agentSessionActive === true) {
    return {
      ok: false,
      error: 'AGENT_MODE_ACTIVE',
      selectedId: null,
      intent: DIRECT_IMAGE_GENERATION_INTENT,
      note: 'Agente ativo — não selecionar editor nem enviar.',
    }
  }
  const list = Array.isArray(editors) ? editors : []
  if (list.length === 0) {
    return {
      ok: false,
      error: 'PROMPT_EDITOR_NOT_FOUND',
      selectedId: null,
      intent: DIRECT_IMAGE_GENERATION_INTENT,
    }
  }

  const scored = list.map((ed) => ({
    id: ed.id,
    top: ed.top,
    score: scoreDirectComposerEditor({
      ...ed,
      startRects: context.startRects,
      ingredientRects: context.ingredientRects,
      placeholderRects: context.placeholderRects,
    }),
    aria: ed.aria || '',
  }))
  scored.sort((a, b) => a.score - b.score)
  const best = scored[0]

  if (best.top < 140) {
    return {
      ok: false,
      error: 'PROMPT_EDITOR_TOP_SUSPECT',
      selectedId: null,
      ranked: scored.slice(0, 5),
      intent: DIRECT_IMAGE_GENERATION_INTENT,
      note: 'Melhor editor ainda no topo — provável título/Agente, não compositor direto.',
    }
  }
  if (isAgentInstructionLabel(best.aria)) {
    return {
      ok: false,
      error: 'AGENT_EDITOR_SELECTED',
      selectedId: null,
      ranked: scored.slice(0, 5),
      intent: DIRECT_IMAGE_GENERATION_INTENT,
      note: 'Editor de instruções do Agente presente — bloquear.',
    }
  }

  // Exige âncora do compositor clássico (Start listado OU ingredients OU placeholder).
  const hasClassicAnchor =
    (context.startRects && context.startRects.length > 0) ||
    (context.ingredientRects && context.ingredientRects.length > 0) ||
    (context.placeholderRects && context.placeholderRects.length > 0)
  if (!hasClassicAnchor) {
    return {
      ok: false,
      error: 'DIRECT_COMPOSER_ANCHOR_MISSING',
      selectedId: null,
      ranked: scored.slice(0, 5),
      intent: DIRECT_IMAGE_GENERATION_INTENT,
      note: 'Sem Iniciar geração / elementos / placeholder observados — não escrever.',
    }
  }

  return {
    ok: true,
    error: null,
    selectedId: best.id,
    editorTop: best.top,
    ranked: scored.slice(0, 5),
    intent: DIRECT_IMAGE_GENERATION_INTENT,
  }
}

/**
 * Gate pré-escrita / pré-envio do compositor direto de imagem.
 * @param {{
 *   intent?: string,
 *   agentSessionActive?: boolean,
 *   agentPillSelected?: boolean,
 *   labels?: string[],
 *   startListed?: boolean,
 *   startUsableCount?: number,
 *   editorTop?: number | null,
 *   editorAria?: string,
 *   requireStartUsable?: boolean,
 *   phase?: 'before_write' | 'after_write' | 'before_send',
 * }} snap
 */
export function assertDirectImageComposer(snap = {}) {
  const intent = snap.intent || DIRECT_IMAGE_GENERATION_INTENT
  const labels = Array.isArray(snap.labels) ? snap.labels : []
  const session = detectAgentSessionState({
    labels,
    agentPillSelected: snap.agentPillSelected === true || snap.agentSessionActive === true,
  })
  const phase = snap.phase || 'before_write'
  const startListed =
    snap.startListed === true || labels.some((l) => isStartGenerationLabel(l))
  const startUsableCount = Number(snap.startUsableCount || 0)
  const editorTop = typeof snap.editorTop === 'number' ? snap.editorTop : null
  const editorAria = snap.editorAria || ''

  if (intent !== DIRECT_IMAGE_GENERATION_INTENT) {
    return {
      ok: false,
      error: 'INTENT_NOT_DIRECT_IMAGE',
      intent,
      phase,
      session,
      note: 'Tentativa deve declarar direct_image_generation.',
    }
  }
  if (session.active || snap.agentSessionActive === true) {
    return {
      ok: false,
      error: 'AGENT_MODE_ACTIVE',
      intent,
      phase,
      session,
      note: 'Agente/Omni/aprovação detectados — bloquear escrita e envio.',
    }
  }
  if (isAgentInstructionLabel(editorAria)) {
    return {
      ok: false,
      error: 'AGENT_EDITOR_SELECTED',
      intent,
      phase,
      session,
    }
  }
  if (editorTop != null && editorTop < 140) {
    return {
      ok: false,
      error: 'PROMPT_EDITOR_TOP_SUSPECT',
      intent,
      phase,
      editorTop,
      session,
    }
  }
  if (!startListed && !labels.some((l) => isAddIngredientsLabel(l))) {
    return {
      ok: false,
      error: 'DIRECT_COMPOSER_NOT_CONFIRMED',
      intent,
      phase,
      session,
      note: 'Sem âncoras do compositor clássico (Iniciar geração / elementos).',
    }
  }
  if (
    (phase === 'before_send' || snap.requireStartUsable === true) &&
    startUsableCount < 1
  ) {
    return {
      ok: false,
      error: 'START_GENERATION_NOT_READY',
      intent,
      phase,
      startUsableCount,
      session,
      note: 'Botão Iniciar geração do compositor direto não está utilizável.',
    }
  }

  // Após escrever: se Start continua disabled E labels de agente surgiram, já coberto por session.
  // Após escrever: exigir que o editor continue fora do topo.
  if (phase === 'after_write' && editorTop != null && editorTop < 140) {
    return {
      ok: false,
      error: 'PROMPT_EDITOR_TOP_SUSPECT',
      intent,
      phase,
      editorTop,
      session,
      note: 'Após write o editor foi para o topo — Agente hijack.',
    }
  }

  return {
    ok: true,
    error: null,
    intent,
    phase,
    startListed,
    startUsableCount,
    editorTop,
    session,
    note: 'Compositor direto de imagem confirmado (sem Agente).',
  }
}

/**
 * Aceitação de geração de imagem: chat/aprovação do Agente NÃO conta.
 * @param {{
 *   agentSessionActive?: boolean,
 *   labels?: string[],
 *   startBecameBusy?: boolean,
 *   promptCleared?: boolean,
 *   sceneGrowth?: boolean,
 *   progressVisible?: boolean,
 * }} signal
 */
export function isAcceptedDirectImageGeneration(signal = {}) {
  const labels = Array.isArray(signal.labels) ? signal.labels : []
  if (signal.agentSessionActive === true || detectAgentApprovalUi(labels)) {
    return {
      accepted: false,
      certainty: 'rejected_agent_ui',
      error: 'AGENT_MODE_ACTIVE',
      note: 'Mensagem no chat / Aprovar créditos não é geração de imagem aceita.',
    }
  }
  if (
    signal.startBecameBusy === true ||
    signal.promptCleared === true ||
    signal.sceneGrowth === true ||
    signal.progressVisible === true
  ) {
    return {
      accepted: true,
      certainty: 'accepted_start_signal',
      error: null,
      note: 'Sinal clássico de geração (busy/progress/prompt limpo/cena).',
    }
  }
  return {
    accepted: false,
    certainty: 'no_effect',
    error: 'GENERATE_NO_EFFECT',
    note: 'Sem sinal de geração clássica.',
  }
}
