import { describe, expect, it } from 'vitest'
import { analyzeMusic, autoCutMusic } from '../musicAnalysis'
import {
  candidateEdgeTrims,
  candidateSplits,
  candidateWindows,
  firstAudible,
  lastAudible,
  summarizeMusicAnalysis,
} from './audioAnalysisService'
import {
  adviseCutsLocally,
  buildCodexCutPrompt,
  buildMusicAdviseRequest,
  cutsFromAdvice,
  localSelectCandidates,
  parseCodexCutAdvice,
} from './audioCutAdvisor'

function tone(sampleRate: number, seconds: number, freq: number, amp: number) {
  const length = Math.floor(sampleRate * seconds)
  const samples = new Float32Array(length)
  for (let i = 0; i < length; i += 1) {
    samples[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate) * amp
  }
  return samples
}

function concat(parts: Float32Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Float32Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

describe('análise e Codex advisor', () => {
  const sampleRate = 22050
  const samples = concat([
    tone(sampleRate, 1.2, 0, 0),
    tone(sampleRate, 8, 220, 0.28),
    tone(sampleRate, 1, 0, 0),
    tone(sampleRate, 16, 440, 0.55),
    tone(sampleRate, 6, 180, 0.24),
    tone(sampleRate, 1.5, 0, 0),
  ])
  const analysis = analyzeMusic(samples, sampleRate)
  const { enriched, summary } = summarizeMusicAnalysis(analysis, samples)

  it('só as pontas remove extremidades silenciosas e preserva o meio', () => {
    const cuts = autoCutMusic(analysis, 'silencio')
    expect(cuts).toHaveLength(1)
    expect(firstAudible(analysis)).toBeGreaterThan(0.6)
    expect(lastAudible(analysis)).toBeLessThan(analysis.duration - 0.6)
    expect(cuts[0].start).toBeGreaterThanOrEqual(0.6)
    expect(cuts[0].start).toBeLessThan(3)
    expect(cuts[0].end).toBeLessThan(analysis.duration - 0.4)
    expect(cuts[0].end - cuts[0].start).toBeGreaterThan(20)
    expect(cuts[0].start).toBeLessThan(9)
    expect(cuts[0].end).toBeGreaterThan(27)
  })

  it('gancho 15 escolhe uma janela contínua forte, não só o começo', () => {
    const windows = candidateWindows(analysis, enriched, 15)
    const request = buildMusicAdviseRequest(summary, windows, 'gancho15')
    const [hook] = adviseCutsLocally(request).cuts
    expect(hook.end - hook.start).toBeLessThanOrEqual(15.2)
    expect(hook.start).toBeGreaterThan(6)
    expect(hook.end - hook.start).toBeGreaterThan(10)
  })

  it('gancho 30 escolhe uma janela de cerca de 30s', () => {
    const windows = candidateWindows(analysis, enriched, 30)
    const request = buildMusicAdviseRequest(summary, windows, 'gancho30')
    const [hook] = adviseCutsLocally(request).cuts
    expect(hook.end - hook.start).toBeGreaterThan(20)
    expect(hook.end - hook.start).toBeLessThanOrEqual(30.2)
  })

  it('IA automática escolhe só candidatos reais', () => {
    const candidates = candidateSplits(analysis, enriched, 'completo')
    const request = buildMusicAdviseRequest(summary, candidates, 'completo')
    const invented = parseCodexCutAdvice(
      JSON.stringify({ cuts: [{ time: 3.14159, reason: 'invented' }, { id: 'C1', confidence: 0.91, reason: 'ok' }] }),
      candidates,
    )
    expect(invented.every((choice) => candidates.some((candidate) => candidate.id === choice.id))).toBe(true)
    expect(invented.some((choice) => Math.abs(choice.time - 3.14159) < 0.0001 && !candidates.some((c) => Math.abs(c.time - 3.14159) < 0.05))).toBe(false)

    const local = adviseCutsLocally(request)
    expect(local.usedCodex).toBe(false)
    expect(local.message).toMatch(/não está conectado/i)
    expect(local.cuts.length).toBeGreaterThan(0)
    expect(local.cuts.every((cut) => cut.end - cut.start >= 6.5)).toBe(true)
    for (let i = 1; i < local.cuts.length; i += 1) {
      expect(local.cuts[i].start).toBeGreaterThanOrEqual(local.cuts[i - 1].end - 0.05)
    }
    const prompt = buildCodexCutPrompt(request)
    expect(prompt).toMatch(/fim de frase/i)
    expect(prompt).toMatch(/minSegmentSec/)
  })

  it('não empilha cortes próximos mesmo se o Codex escolher demais', () => {
    const candidates = candidateSplits(analysis, enriched, 'completo')
    const request = buildMusicAdviseRequest(summary, candidates, 'completo')
    const flood = parseCodexCutAdvice(
      JSON.stringify({ cuts: candidates.map((candidate) => ({ id: candidate.id, confidence: 0.9 })) }),
      candidates,
    )
    const cuts = cutsFromAdvice(request, flood, 'codex')
    expect(cuts.length).toBeGreaterThan(0)
    expect(cuts.length).toBeLessThanOrEqual(8)
    expect(cuts.every((cut) => cut.end - cut.start >= 6.5)).toBe(true)
  })

  it('Codex indisponível cai na heurística local', () => {
    const candidates = candidateEdgeTrims(analysis)
    const request = buildMusicAdviseRequest(summary, candidates, 'silencio')
    const selected = localSelectCandidates(request)
    const cuts = cutsFromAdvice(request, selected, 'auto')
    expect(cuts).toHaveLength(1)
    expect(cuts[0].start).toBeLessThan(cuts[0].end)
  })

  it('estrutura gera candidatos de seção', () => {
    const candidates = candidateSplits(analysis, enriched, 'estrutura')
    expect(candidates.length).toBeGreaterThan(0)
    const request = buildMusicAdviseRequest(summary, candidates, 'estrutura')
    const result = adviseCutsLocally(request)
    expect(result.cuts.length).toBeGreaterThan(0)
    expect(result.cuts.length).toBeLessThanOrEqual(8)
    expect(result.cuts.every((cut) => cut.end - cut.start >= 8)).toBe(true)
  })

  it('completa os cortes até o fim da faixa longa', () => {
    const parts: Float32Array[] = []
    for (let i = 0; i < 8; i += 1) {
      parts.push(tone(sampleRate, 10, 180 + i * 30, 0.32))
      parts.push(tone(sampleRate, 0.7, 0, 0))
    }
    const longAnalysis = analyzeMusic(concat(parts), sampleRate)
    const long = summarizeMusicAnalysis(longAnalysis, concat(parts))
    const candidates = candidateSplits(longAnalysis, long.enriched, 'completo')
    expect(candidates.some((candidate) => candidate.time > longAnalysis.duration * 0.55)).toBe(true)
    const request = buildMusicAdviseRequest(long.summary, candidates, 'completo')
    const onlyStart = parseCodexCutAdvice(
      JSON.stringify({
        cuts: candidates
          .filter((candidate) => candidate.time < 40)
          .map((candidate) => ({ id: candidate.id, confidence: 0.95 })),
      }),
      candidates,
    )
    const cuts = cutsFromAdvice(request, onlyStart, 'codex')
    const last = cuts[cuts.length - 1]
    expect(last.end).toBeCloseTo(longAnalysis.duration, 2)
    expect(cuts[0].start).toBe(0)
    expect(last.end - last.start).toBeLessThan(40)
    for (let i = 1; i < cuts.length; i += 1) {
      expect(Math.abs(cuts[i].start - cuts[i - 1].end)).toBeLessThan(0.05)
    }
  })
})
