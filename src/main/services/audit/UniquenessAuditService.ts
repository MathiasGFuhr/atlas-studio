import type { UniquenessAuditResult } from '../../../shared/types'

export interface ComparableScript {
  title: string
  topic?: string
  content: string
}

const SECTION_RE = /^(#{1,3}\s+.+|\d+\.\s+.+|\[[^\]]+\])/gm

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2)
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const setA = new Set(a)
  const setB = new Set(b)
  let inter = 0
  for (const token of setA) if (setB.has(token)) inter += 1
  const union = setA.size + setB.size - inter
  return union === 0 ? 0 : inter / union
}

function ngrams(tokens: string[], n: number): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i <= tokens.length - n; i++) {
    out.add(tokens.slice(i, i + n).join(' '))
  }
  return out
}

function setOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const item of a) if (b.has(item)) inter += 1
  return inter / Math.min(a.size, b.size)
}

function paragraphs(content: string): string[] {
  return content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 40 && !/^#/.test(p) && !/^\[/.test(p))
}

function sections(content: string): string[] {
  const matches = content.match(SECTION_RE) ?? []
  return matches.map((m) => normalize(m.replace(/^#+\s*/, '').replace(/^\d+\.\s*/, '').replace(/^\[|\]$/g, '')))
}

function firstMeaningfulParagraph(content: string): string {
  return paragraphs(content)[0] ?? content.slice(0, 400)
}

function lastMeaningfulParagraph(content: string): string {
  const pars = paragraphs(content)
  return pars[pars.length - 1] ?? content.slice(-400)
}

function detectOpeningType(hook: string): string {
  const h = normalize(hook)
  if (/\d+|%|mil|tausend|thousand|jahr|ano|ano de/.test(h) && h.length < 500) return 'estatistica'
  if (/\?|wer |was |why |como |por que|warum /.test(h)) return 'pergunta'
  if (/^\d{1,2}[./]\d{1,2}|em \d{4}|im jahr|am \d/.test(h)) return 'data_cena'
  if (/cidade|stadt|rua|strasse|fabrica|werk|porto|hafen/.test(h)) return 'lugar_cena'
  return 'narrativa'
}

function detectEndingType(ending: string): string {
  const e = normalize(ending)
  if (/\?/.test(e)) return 'pergunta'
  if (/abandon|ruina|ruins|leere|vazio|still/.test(e)) return 'lugar_abandonado'
  if (/hoje|today|heute|ainda|noch immer/.test(e)) return 'presente_eco'
  if (/custo|preis|consequence|folg/.test(e)) return 'consequencia'
  return 'reflexao'
}

function detectArchitecture(content: string): string {
  const secs = sections(content)
  if (secs.length >= 8) return 'episodica_longa'
  if (secs.length >= 5) return 'capitulos_medios'
  if (/presente|hoje|heute/.test(normalize(content.slice(0, 800))) && /passado|damals|fruher/.test(normalize(content))) {
    return 'presente_passado_presente'
  }
  return secs.length > 0 ? `secoes_${secs.length}` : 'bloco_continuo'
}

function stripProperNounsAndDates(content: string): string {
  return content
    .replace(/\b\d{1,2}[./]\d{1,2}([./]\d{2,4})?\b/g, 'DATE')
    .replace(/\b(19|20)\d{2}\b/g, 'YEAR')
    .replace(/\b[A-ZÄÖÜ][a-zäöüß]{2,}(?:\s+[A-ZÄÖÜ][a-zäöüß]{2,}){0,3}\b/g, 'NAME')
    .replace(/\b\d+([.,]\d+)?%?\b/g, 'NUM')
}

function structuralSignature(content: string): string[] {
  const secs = sections(content)
  const opening = detectOpeningType(firstMeaningfulParagraph(content))
  const ending = detectEndingType(lastMeaningfulParagraph(content))
  const arch = detectArchitecture(content)
  const progression = secs.slice(0, 8)
  return [opening, ending, arch, `sec_count_${secs.length}`, ...progression]
}

/**
 * Auditoria editorial de unicidade — compara apenas dentro do mesmo nicho.
 * Heurística determinística (sem inventar scores de ML).
 */
export function auditUniqueness(
  candidate: ComparableScript,
  previous: ComparableScript[],
): UniquenessAuditResult {
  if (previous.length === 0) {
    return {
      passed: true,
      originalityScore: 100,
      structuralSimilarity: 0,
      lexicalSimilarity: 0,
      hookSimilarity: 0,
      endingSimilarity: 0,
      issues: [],
      closestEpisodeTitle: null,
      themeSwapRisk: false,
      genericTemplateRisk: false,
    }
  }

  const candHook = firstMeaningfulParagraph(candidate.content)
  const candEnding = lastMeaningfulParagraph(candidate.content)
  const candTokens = tokenize(candidate.content)
  const candSig = structuralSignature(candidate.content)
  const candStripped = tokenize(stripProperNounsAndDates(candidate.content))
  const candTri = ngrams(candTokens, 4)

  let worst = {
    title: previous[0].title,
    structural: 0,
    lexical: 0,
    hook: 0,
    ending: 0,
    themeSwap: 0,
  }

  for (const prev of previous) {
    const prevTokens = tokenize(prev.content)
    const prevHook = firstMeaningfulParagraph(prev.content)
    const prevEnding = lastMeaningfulParagraph(prev.content)
    const prevSig = structuralSignature(prev.content)
    const prevStripped = tokenize(stripProperNounsAndDates(prev.content))
    const prevTri = ngrams(prevTokens, 4)

    const structural = setOverlap(new Set(candSig), new Set(prevSig))
    const lexical = Math.max(jaccard(candTokens, prevTokens), setOverlap(candTri, prevTri))
    const hook = jaccard(tokenize(candHook), tokenize(prevHook))
    const ending = jaccard(tokenize(candEnding), tokenize(prevEnding))
    const themeSwap = jaccard(candStripped, prevStripped)

    const score =
      structural * 0.35 + lexical * 0.2 + hook * 0.2 + ending * 0.15 + themeSwap * 0.1
    const worstScore =
      worst.structural * 0.35 +
      worst.lexical * 0.2 +
      worst.hook * 0.2 +
      worst.ending * 0.15 +
      worst.themeSwap * 0.1

    if (score > worstScore) {
      worst = {
        title: prev.title,
        structural,
        lexical,
        hook,
        ending,
        themeSwap,
      }
    }
  }

  const issues: string[] = []
  if (worst.hook >= 0.55) {
    issues.push(`Hook semelhante ao episódio "${worst.title}".`)
  }
  if (worst.ending >= 0.55) {
    issues.push(`Encerramento semelhante ao episódio "${worst.title}".`)
  }
  if (worst.structural >= 0.6) {
    issues.push(`Arquitetura/progressão excessivamente próxima de "${worst.title}".`)
  }
  if (worst.lexical >= 0.45) {
    issues.push(`Sobreposição lexical elevada com "${worst.title}".`)
  }

  const themeSwapRisk = worst.themeSwap >= 0.55 && worst.structural >= 0.45
  if (themeSwapRisk) {
    issues.push(
      'Risco estrutural: sem nomes/datas, o roteiro ainda se parece demais com um episódio anterior.',
    )
  }

  const genericTemplateRisk =
    detectOpeningType(candHook) === 'estatistica' &&
    detectArchitecture(candidate.content) === 'presente_passado_presente' &&
    detectEndingType(candEnding) === 'lugar_abandonado'

  if (genericTemplateRisk) {
    issues.push(
      'Risco de genericidade: o roteiro parece reutilizável para outro tema só trocando nomes e datas.',
    )
  }

  const maxSim = Math.max(worst.structural, worst.lexical, worst.hook, worst.ending, worst.themeSwap)
  const originalityScore = Math.round((1 - maxSim) * 100)
  const passed =
    issues.length === 0 &&
    worst.structural < 0.6 &&
    worst.hook < 0.55 &&
    worst.ending < 0.55 &&
    !themeSwapRisk &&
    !genericTemplateRisk

  return {
    passed,
    originalityScore,
    structuralSimilarity: Math.round(worst.structural * 100),
    lexicalSimilarity: Math.round(worst.lexical * 100),
    hookSimilarity: Math.round(worst.hook * 100),
    endingSimilarity: Math.round(worst.ending * 100),
    issues,
    closestEpisodeTitle: worst.title,
    themeSwapRisk,
    genericTemplateRisk,
  }
}

export function extractEditorialFingerprint(content: string, title: string, topic: string) {
  const hook = firstMeaningfulParagraph(content)
  const ending = lastMeaningfulParagraph(content)
  const secs = sections(content)
  return {
    title,
    topic,
    hook: hook.slice(0, 280),
    openingType: detectOpeningType(hook),
    architecture: detectArchitecture(content),
    throughLine: secs[1] ?? secs[0] ?? '',
    retentionDevice: secs.length >= 4 ? 'mudanca_estado_por_secao' : 'arco_unico',
    climax: secs[Math.floor(secs.length * 0.7)] ?? '',
    endingType: detectEndingType(ending),
    notablePhrases: paragraphs(content)
      .slice(0, 3)
      .map((p) => p.split(/[.!?]/)[0]?.trim())
      .filter(Boolean)
      .slice(0, 5) as string[],
    avoidNext: [
      `não repetir abertura do tipo ${detectOpeningType(hook)}`,
      `não repetir encerramento do tipo ${detectEndingType(ending)}`,
      `evitar arquitetura ${detectArchitecture(content)}`,
    ],
  }
}

export function buildReconstructionPrompt(input: {
  closestTitle: string
  issues: string[]
  language: string
}): string {
  return `Este roteiro apresenta proximidade estrutural excessiva com o episódio "${input.closestTitle}".

Problemas detectados:
${input.issues.map((i) => `- ${i}`).join('\n')}

Reconstrua a narrativa preservando os fatos, mas alterando:
- ponto de entrada
- arquitetura
- progressão
- mecanismo de retenção
- clímax
- encerramento

Não troque apenas palavras. Mude a forma.
Idioma final: ${input.language}
Entregue somente o roteiro completo reconstruído.`
}

export const UniquenessAuditService = {
  auditUniqueness,
  extractEditorialFingerprint,
  buildReconstructionPrompt,
  detectOpeningType,
  detectEndingType,
  detectArchitecture,
  firstMeaningfulParagraph,
  lastMeaningfulParagraph,
  stripProperNounsAndDates,
}
