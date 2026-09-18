import { describe, expect, it } from 'vitest'
import {
  assignSubjectFromClick,
  buildFramingExportFilter,
  buildFramingPlan,
  buildFramingPreviewFrame,
  detectSubjectsInRgb,
  interpolateFraming,
  maxVerticalCrop,
  planFramingSampleTimes,
  subjectsFitTogether,
  trackSubjects,
  type ShortsFramingSettings,
  type ShortsTrackedSubject,
} from './shortsFraming'

function skinFrame(width: number, height: number, blobs: Array<{ x: number; y: number; w: number; h: number }>) {
  const frame = new Uint8Array(width * height * 3)
  for (let i = 0; i < frame.length; i += 3) {
    frame[i] = 30
    frame[i + 1] = 40
    frame[i + 2] = 70
  }
  for (const blob of blobs) {
    const x0 = Math.round((blob.x - blob.w / 2) * width)
    const y0 = Math.round((blob.y - blob.h / 2) * height)
    const x1 = Math.round((blob.x + blob.w / 2) * width)
    const y1 = Math.round((blob.y + blob.h / 2) * height)
    for (let y = Math.max(0, y0); y < Math.min(height, y1); y += 1) {
      for (let x = Math.max(0, x0); x < Math.min(width, x1); x += 1) {
        const i = (y * width + x) * 3
        frame[i] = 210
        frame[i + 1] = 150
        frame[i + 2] = 120
      }
    }
  }
  return frame
}

function subject(id: string, x: number, y = 0.42, extras: Partial<ShortsTrackedSubject> = {}): ShortsTrackedSubject {
  return { id, x, y, width: 0.12, height: 0.22, confidence: 0.8, vocalActivity: 0.6, ...extras }
}

const settings = (patch: Partial<ShortsFramingSettings> = {}): ShortsFramingSettings => ({
  lockLead: false,
  preferSplit: false,
  preventFocusSwitch: false,
  leadSubjectId: null,
  subject1Id: null,
  subject2Id: null,
  manualAnchors: [],
  picking: null,
  ...patch,
})

describe('shortsFraming', () => {
  it('detecta dois sujeitos afastados em um frame sintético', () => {
    const frame = skinFrame(160, 90, [
      { x: 0.22, y: 0.38, w: 0.16, h: 0.28 },
      { x: 0.78, y: 0.4, w: 0.16, h: 0.28 },
    ])
    const boxes = detectSubjectsInRgb(frame, 160, 90)
    expect(boxes.length).toBeGreaterThanOrEqual(2)
    const xs = boxes.map((item) => item.x).sort((a, b) => a - b)
    expect(xs[0]).toBeLessThan(0.4)
    expect(xs[xs.length - 1]).toBeGreaterThan(0.6)
  })

  it('rastreia o mesmo sujeito com id estável entre frames', () => {
    const samples = trackSubjects([
      { time: 0, boxes: [{ x: 0.3, y: 0.4, width: 0.12, height: 0.2, confidence: 0.8 }] },
      { time: 0.5, boxes: [{ x: 0.33, y: 0.41, width: 0.12, height: 0.2, confidence: 0.82 }] },
      { time: 1, boxes: [{ x: 0.36, y: 0.4, width: 0.12, height: 0.2, confidence: 0.79 }] },
    ])
    expect(samples[0]?.subjects[0]?.id).toBe(samples[2]?.subjects[0]?.id)
  })

  it('foca o cantor principal com pan suave e sem pular para o outro lado', () => {
    const track = [0, 0.5, 1, 1.5, 2].map((time) => ({
      time,
      subjects: [subject('lead', 0.28 + time * 0.03), subject('other', 0.82, 0.4, { confidence: 0.5 })],
    }))
    const plan = buildFramingPlan({
      width: 1920,
      height: 1080,
      mode: 'lead_singer',
      settings: settings({ leadSubjectId: 'lead', lockLead: true }),
      track,
      clipStart: 0,
      clipEnd: 2,
    })
    const first = interpolateFraming(plan, 0)!
    const last = interpolateFraming(plan, 2)!
    expect(first.layout).toBe('crop')
    expect(first.cropX).toBeLessThan(1920 / 2)
    expect(last.cropX).toBeGreaterThan(first.cropX)
    expect(last.cropX - first.cropX).toBeLessThan(400)
    expect(plan.usedFallback).toBe(false)
  })

  it('não troca o sujeito ativo por um pico curto', () => {
    const track = [
      { time: 0, subjects: [subject('a', 0.3, 0.4, { vocalActivity: 0.9 }), subject('b', 0.7, 0.4, { vocalActivity: 0.2 })] },
      { time: 0.4, subjects: [subject('a', 0.3, 0.4, { vocalActivity: 0.4 }), subject('b', 0.7, 0.4, { vocalActivity: 0.95 })] },
      { time: 0.8, subjects: [subject('a', 0.3, 0.4, { vocalActivity: 0.85 }), subject('b', 0.7, 0.4, { vocalActivity: 0.3 })] },
    ]
    const plan = buildFramingPlan({
      width: 1920,
      height: 1080,
      mode: 'active_subject',
      settings: settings({ preventFocusSwitch: true, leadSubjectId: 'a' }),
      track,
      clipStart: 0,
      clipEnd: 0.8,
    })
    for (const frame of plan.keyframes) {
      expect(frame.subjectIds).toEqual(['a'])
    }
  })

  it('mantém dois sujeitos no mesmo 9:16 quando estão perto', () => {
    const a = subject('a', 0.46)
    const b = subject('b', 0.54)
    const crop = maxVerticalCrop(1920, 1080)
    expect(subjectsFitTogether(a, b, crop.cropWidth, 1920)).toBe(true)
    const plan = buildFramingPlan({
      width: 1920,
      height: 1080,
      mode: 'two_subjects',
      settings: settings({ subject1Id: 'a', subject2Id: 'b' }),
      track: [{ time: 1, subjects: [a, b] }],
      clipStart: 0,
      clipEnd: 2,
    })
    expect(plan.keyframes[0]?.layout).toBe('crop')
    expect(plan.keyframes[0]?.subjectIds).toEqual(expect.arrayContaining(['a', 'b']))
  })

  it('usa tela dividida quando os dois sujeitos estão afastados', () => {
    const a = subject('a', 0.18)
    const b = subject('b', 0.84)
    const crop = maxVerticalCrop(1920, 1080)
    expect(subjectsFitTogether(a, b, crop.cropWidth, 1920)).toBe(false)
    const plan = buildFramingPlan({
      width: 1920,
      height: 1080,
      mode: 'split_screen',
      settings: settings({ subject1Id: 'a', subject2Id: 'b' }),
      track: [{ time: 0, subjects: [a, b] }, { time: 2, subjects: [a, b] }],
      clipStart: 0,
      clipEnd: 2,
    })
    expect(plan.keyframes[0]?.layout).toBe('split')
    expect(plan.keyframes[0]?.top).toBeTruthy()
    expect(plan.keyframes[0]?.bottom).toBeTruthy()
    const filter = buildFramingExportFilter(plan, 0)
    expect(filter.filterComplex).toContain('vstack')
    expect(filter.filterComplex).toContain('scale=1080:960')
    const preview = buildFramingPreviewFrame(plan, 1)
    expect(preview.layout).toBe('split')
    expect(preview.top).toBeTruthy()
    expect(preview.bottom).toBeTruthy()
  })

  it('sem detecção confiável cai no crop central', () => {
    const plan = buildFramingPlan({
      width: 1920,
      height: 1080,
      mode: 'lead_singer',
      settings: settings(),
      track: [{ time: 0, subjects: [] }],
      clipStart: 0,
      clipEnd: 3,
    })
    const center = maxVerticalCrop(1920, 1080)
    expect(plan.usedFallback).toBe(true)
    expect(plan.keyframes[0]?.cropX).toBe(center.cropX)
    expect(plan.keyframes[0]?.focusStrategy).toBe('center')
  })

  it('clique manual define o cantor principal', () => {
    const next = assignSubjectFromClick({
      settings: settings({ picking: 'lead' }),
      track: [{ time: 1, subjects: [subject('s1', 0.3), subject('s2', 0.75)] }],
      time: 1,
      x: 0.32,
      y: 0.4,
      role: 'lead',
    })
    expect(next.leadSubjectId).toBe('s1')
    expect(next.picking).toBeNull()
  })

  it('automático escolhe split quando há dois núcleos distantes', () => {
    const plan = buildFramingPlan({
      width: 1920,
      height: 1080,
      mode: 'auto',
      settings: settings(),
      track: [{ time: 0, subjects: [subject('a', 0.16), subject('b', 0.86)] }],
      clipStart: 0,
      clipEnd: 1,
    })
    expect(plan.keyframes[0]?.layout).toBe('split')
  })

  it('amostra o vídeo em poucos pontos, sem um frame por segundo', () => {
    const times = planFramingSampleTimes(180)
    expect(times[0]).toBe(0)
    expect(times.at(-1)).toBe(180)
    expect(times.length).toBeGreaterThan(8)
    expect(times.length).toBeLessThanOrEqual(48)
  })
})
