import {
  AUTO_IMAGE_FRAMING_BY_GROUP,
  IMAGE_CONSTRAINTS,
  IMAGE_FRAMINGS,
  IMAGE_INTRO,
  IMAGE_LIPSYNC_BLOCK,
  IMAGE_LIPSYNC_CONSTRAINTS,
  IMAGE_PERFORMANCE_BY_ID,
  IMAGE_PERFORMANCES,
  IMAGE_PRESERVATION,
  IMAGE_QUALITY,
  IMAGE_SUBJECT_BY_ID,
  SINGER_LIPSYNC_VARIATIONS,
} from './imagePresets'
import { composeStageContextText, stageContextConstraints } from './stageContext'
import type {
  ComposeImagePromptInput,
  ImageAngleVariation,
  ImageComposition,
  ImageDirection,
  ImageDistance,
  ImageFramingId,
  ImageFramingPreset,
  ImageHeight,
  ImagePerformanceId,
  ImagePerformancePreset,
  ImagePurpose,
  ImageSubjectId,
  ImageSubjectPreset,
} from './imageTypes'

/**
 * Composição dos prompts de "Criar imagem".
 *
 * Funções puras, independentes de React e de Electron. Imagem estática:
 * nenhum bloco descreve movimento de câmera. Nenhuma IA participa.
 */

export const MAX_IMAGE_VARIATIONS = 20

const DIRECTION_ORDER: ImageDirection[] = ['front', 'tq-left', 'tq-right']
const DISTANCE_ORDER: ImageDistance[] = [
  'tight-close',
  'close-up',
  'mcu',
  'medium',
  'medium-wide',
]
const HEIGHT_ORDER: ImageHeight[] = ['eye', 'low', 'high']
const COMPOSITION_ORDER: ImageComposition[] = [
  'centered',
  'portrait',
  'instrument',
  'over-mic',
  'hero',
  'off-center',
  'band-context',
  'layered',
  'kit',
  'diagonal',
]

/** Assinatura visual: duas variações com a mesma chave são equivalentes. */
export function framingSignature(framing: ImageFramingPreset): string {
  return `${framing.distance}|${framing.direction}|${framing.height}|${framing.composition}`
}

/** Performances oferecidas para um "quem aparece". */
export function performancesForSubject(subjectId: ImageSubjectId): ImagePerformancePreset[] {
  const subject = IMAGE_SUBJECT_BY_ID.get(subjectId)
  if (!subject) return []
  return IMAGE_PERFORMANCES.filter((item) => subject.compatiblePerformances.includes(item.id))
}

/**
 * Enquadramentos válidos para o sujeito. Em Lipsync, os ângulos abertos e os
 * que escondem o rosto saem da lista. Performance incompatível também sai.
 */
export function framingsForSubject(
  subjectId: ImageSubjectId,
  purpose: ImagePurpose,
  performanceId?: ImagePerformanceId,
): ImageFramingPreset[] {
  const subject = IMAGE_SUBJECT_BY_ID.get(subjectId)
  if (!subject) return []
  return IMAGE_FRAMINGS.filter((framing) => {
    if (!framing.groups.includes(subject.framingGroup)) return false
    if (lipSyncApplies(subjectId, purpose) && !framing.lipSyncSafe) return false
    if (framing.purposes && !framing.purposes.includes(purpose)) return false
    if (
      performanceId &&
      framing.compatiblePerformances &&
      !framing.compatiblePerformances.includes(performanceId)
    ) {
      return false
    }
    return true
  })
}

/** Lipsync só faz sentido quando existe cantor em cena. */
export function lipSyncApplies(subjectId: ImageSubjectId, purpose: ImagePurpose): boolean {
  const subject = IMAGE_SUBJECT_BY_ID.get(subjectId)
  return purpose === 'lipsync' && (subject?.hasSinger ?? false)
}

/**
 * Resolve o enquadramento automático pelas regras do grupo.
 * Determinístico: a primeira opção compatível da lista sempre vence.
 */
export function resolveImageFraming(
  framingId: ImageFramingId,
  subjectId: ImageSubjectId,
  purpose: ImagePurpose,
  performanceId?: ImagePerformanceId,
): ImageFramingPreset | null {
  const pool = framingsForSubject(subjectId, purpose, performanceId)
  if (framingId !== 'auto') {
    const explicit = pool.find((framing) => framing.id === framingId)
    if (explicit) return explicit
  }
  const subject = IMAGE_SUBJECT_BY_ID.get(subjectId)
  const priority = subject ? AUTO_IMAGE_FRAMING_BY_GROUP[subject.framingGroup] : []
  for (const id of priority) {
    const found = pool.find((framing) => framing.id === id)
    if (found) return found
  }
  return pool[0] ?? null
}

/**
 * Monta o prompt final de imagem. Retorna apenas a string.
 *
 * Ordem: base + quem aparece + performance + enquadramento + contexto de palco
 * + finalidade + restrições.
 */
export function composeImagePrompt(input: ComposeImagePromptInput): string {
  const subject = IMAGE_SUBJECT_BY_ID.get(input.subjectId)
  const performance = IMAGE_PERFORMANCE_BY_ID.get(input.performanceId)
  const framing = resolveImageFraming(
    input.framingId,
    input.subjectId,
    input.purpose,
    input.performanceId,
  )
  const lipSync = lipSyncApplies(input.subjectId, input.purpose)
  const ensemble = subject?.framingGroup === 'band'
  const stageOptions = {
    stageContextId: input.stageContextId,
    ensemble,
    keepLeadSinger: Boolean(subject?.hasSinger && ensemble),
    sceneKind: imageSceneKind(subject?.framingGroup, subject?.hasSinger),
  }

  const sections: string[] = [
    IMAGE_INTRO,
    subject?.text ?? '',
    performance?.text ?? '',
    framing?.text ?? '',
    composeStageContextText(stageOptions),
  ]

  if (lipSync) sections.push(IMAGE_LIPSYNC_BLOCK)

  sections.push(IMAGE_PRESERVATION, IMAGE_QUALITY)

  const negatives = [
    ...IMAGE_CONSTRAINTS,
    ...(lipSync ? IMAGE_LIPSYNC_CONSTRAINTS : []),
    ...stageContextConstraints(stageOptions),
  ]
  sections.push(`Avoid: ${negatives.join(', ')}.`)

  return sections
    .map((section) => section.trim())
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Gera até 20 variações de ângulo realmente distintas.
 * Determinístico e sem IA: filtra, remove equivalentes, cobre eixos de
 * variedade e preenche o restante por prioridade.
 */
export function buildAngleVariations(
  input: Omit<ComposeImagePromptInput, 'framingId'> & { framingId?: ImageFramingId },
  limit = MAX_IMAGE_VARIATIONS,
): ImageAngleVariation[] {
  const pool = framingsForSubject(input.subjectId, input.purpose, input.performanceId)
  if (pool.length === 0) return []

  const ordered = selectDiverseFramings(pool, {
    subjectId: input.subjectId,
    purpose: input.purpose,
    selectedId: input.framingId ?? 'auto',
    limit,
  })

  return ordered.map((framing) => ({
    id: framing.id,
    framingId: framing.id,
    label: framing.label,
    prompt: composeImagePrompt({
      subjectId: input.subjectId,
      performanceId: input.performanceId,
      framingId: framing.id,
      purpose: input.purpose,
      stageContextId: input.stageContextId,
    }),
  }))
}

/** Mantém só o ângulo de maior prioridade para cada assinatura visual. */
function dedupeBySignature(pool: ImageFramingPreset[]): ImageFramingPreset[] {
  const best = new Map<string, ImageFramingPreset>()
  for (const framing of pool) {
    const key = framingSignature(framing)
    const current = best.get(key)
    if (!current || framing.priority > current.priority) best.set(key, framing)
  }
  return [...best.values()]
}

function compareFramings(
  a: ImageFramingPreset,
  b: ImageFramingPreset,
  purpose: ImagePurpose,
  subjectId: ImageSubjectId,
): number {
  if (lipSyncApplies(subjectId, purpose)) {
    if (a.lipSyncSafe !== b.lipSyncSafe) return a.lipSyncSafe ? -1 : 1
    const rankA = SINGER_LIPSYNC_VARIATIONS.indexOf(a.id)
    const rankB = SINGER_LIPSYNC_VARIATIONS.indexOf(b.id)
    if (rankA !== rankB) {
      if (rankA < 0) return 1
      if (rankB < 0) return -1
      return rankA - rankB
    }
  }
  if (b.priority !== a.priority) return b.priority - a.priority
  return a.label.localeCompare(b.label, 'pt')
}

function selectDiverseFramings(
  pool: ImageFramingPreset[],
  input: {
    subjectId: ImageSubjectId
    purpose: ImagePurpose
    selectedId: ImageFramingId
    limit: number
  },
): ImageFramingPreset[] {
  const unique = dedupeBySignature(pool).sort((a, b) =>
    compareFramings(a, b, input.purpose, input.subjectId),
  )

  const selected: ImageFramingPreset[] = []
  const taken = new Set<string>()

  const take = (framing: ImageFramingPreset | undefined) => {
    if (!framing || taken.has(framing.id) || selected.length >= input.limit) return
    taken.add(framing.id)
    selected.push(framing)
  }

  if (input.selectedId !== 'auto') {
    take(unique.find((framing) => framing.id === input.selectedId))
  }

  const unused = () => unique.filter((framing) => !taken.has(framing.id))

  for (const direction of DIRECTION_ORDER) {
    take(unused().find((framing) => framing.direction === direction))
  }
  for (const distance of DISTANCE_ORDER) {
    take(unused().find((framing) => framing.distance === distance))
  }
  for (const height of HEIGHT_ORDER) {
    take(unused().find((framing) => framing.height === height))
  }
  for (const composition of COMPOSITION_ORDER) {
    take(unused().find((framing) => framing.composition === composition))
  }
  for (const framing of unused()) take(framing)

  return selected
}

/** Primeira performance válida — usada ao trocar de sujeito na UI. */
export function defaultImagePerformanceFor(subjectId: ImageSubjectId) {
  return performancesForSubject(subjectId)[0]?.id ?? 'natural'
}

function imageSceneKind(
  framingGroup: ImageSubjectPreset['framingGroup'] | undefined,
  hasSinger: boolean | undefined,
): 'singer' | 'guitarist' | 'drummer' | 'band-no-singer' {
  if (framingGroup === 'guitarist') return 'guitarist'
  if (framingGroup === 'drummer') return 'drummer'
  if (framingGroup === 'band' && !hasSinger) return 'band-no-singer'
  return 'singer'
}
