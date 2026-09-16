import type {
  QuickPromptAnalysis,
  QuickPromptIssue,
  QuickPromptIssueCategory,
  QuickPromptIssueSeverity,
  QuickPromptOkItem,
} from '../types'

const CATEGORIES: QuickPromptIssueCategory[] = [
  'coherence',
  'lipsync',
  'camera',
  'preservation',
  'redundancy',
  'contradiction',
  'other',
]

const SEVERITIES: QuickPromptIssueSeverity[] = ['warning', 'error']

function clampScore(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

function asTrimmed(value: unknown): string {
  return String(value ?? '').trim()
}

export function qualityLabelForScore(score: number): string {
  if (score >= 90) return 'Excelente'
  if (score >= 75) return 'Bom'
  if (score >= 60) return 'Precisa ajustes'
  return 'Problemático'
}

function asCategory(value: unknown): QuickPromptIssueCategory {
  const raw = asTrimmed(value)
  return CATEGORIES.includes(raw as QuickPromptIssueCategory)
    ? (raw as QuickPromptIssueCategory)
    : 'other'
}

function asSeverity(value: unknown): QuickPromptIssueSeverity {
  const raw = asTrimmed(value)
  return SEVERITIES.includes(raw as QuickPromptIssueSeverity)
    ? (raw as QuickPromptIssueSeverity)
    : 'warning'
}

function asOkItems(value: unknown): QuickPromptOkItem[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') {
        const title = item.trim()
        return title ? { title } : null
      }
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      const title = asTrimmed(record.title) || asTrimmed(record.label)
      if (!title) return null
      const detail = asTrimmed(record.detail)
      return detail ? { title, detail } : { title }
    })
    .filter((item): item is QuickPromptOkItem => Boolean(item))
    .slice(0, 8)
}

function asIssues(value: unknown): QuickPromptIssue[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      const title = asTrimmed(record.title)
      const detail = asTrimmed(record.detail)
      if (!title && !detail) return null
      return {
        category: asCategory(record.category),
        severity: asSeverity(record.severity),
        title: title || 'Problema',
        detail,
      }
    })
    .filter((item): item is QuickPromptIssue => Boolean(item))
    .slice(0, 12)
}

export function normalizeQuickPromptAnalysis(
  raw: Record<string, unknown>,
  originalPrompt: string,
): QuickPromptAnalysis {
  const score = clampScore(raw.score)
  const original = originalPrompt.trim()
  const corrected = asTrimmed(raw.correctedPrompt) || original
  const cleaned = asTrimmed(raw.cleanedPrompt) || corrected
  return {
    score,
    verdict: asTrimmed(raw.verdict) || qualityLabelForScore(score),
    okItems: asOkItems(raw.okItems ?? raw.strengths),
    issues: asIssues(raw.issues ?? raw.weaknesses),
    correctedPrompt: corrected,
    cleanedPrompt: cleaned,
  }
}

export const QUICK_PROMPT_ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    score: {
      type: 'integer',
      description: 'Nota 0-100 da coerência do conjunto. Problemas específicos importam mais que a nota.',
    },
    verdict: { type: 'string', description: 'Frase curta em português (Excelente, Bom, Precisa ajustes ou Problemático)' },
    okItems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
        },
        required: ['title'],
      },
    },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: CATEGORIES,
          },
          severity: { type: 'string', enum: SEVERITIES },
          title: { type: 'string' },
          detail: { type: 'string' },
        },
        required: ['category', 'severity', 'title', 'detail'],
      },
    },
    correctedPrompt: {
      type: 'string',
      description: 'Prompt otimizado: corrige incoerências e redundâncias sem inventar cena nova.',
    },
    cleanedPrompt: {
      type: 'string',
      description: 'Mesmo prompt só com redundâncias removidas e restrições equivalentes unidas.',
    },
  },
  required: ['score', 'verdict', 'okItems', 'issues', 'correctedPrompt', 'cleanedPrompt'],
}
