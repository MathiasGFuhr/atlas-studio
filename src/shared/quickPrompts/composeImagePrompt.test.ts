import { describe, expect, it } from 'vitest'
import {
  buildAngleVariations,
  composeImagePrompt,
  framingsForSubject,
  lipSyncApplies,
  performancesForSubject,
  resolveImageFraming,
} from './composeImagePrompt'
import { IMAGE_FRAMINGS, IMAGE_SUBJECTS } from './imagePresets'
import { wordCount } from './helpers'
import { STAGE_CONTEXTS } from './stageContext'
import type { ComposeImagePromptInput } from './imageTypes'

const BASE: ComposeImagePromptInput = {
  subjectId: 'singer-acoustic',
  performanceId: 'acoustic-singing',
  framingId: 'mcu-instrument',
  purpose: 'lipsync',
  stageContextId: 'on-stage',
}

/** Vocabulário de vídeo que jamais pode vazar para um prompt de imagem. */
const VIDEO_TERMS = [
  'push-in',
  'pull-back',
  'tracking',
  'follow shot',
  'dolly',
  'camera moves',
  'camera movement',
  'walking speed',
  'lip sync to the provided audio',
  'locked cinematic',
  'animate the reference',
]

describe('composeImagePrompt', () => {
  it('monta um prompt curto e específico de cantor + violão', () => {
    const prompt = composeImagePrompt(BASE)

    expect(prompt).toContain('acoustic guitar')
    expect(prompt).toContain('later lip-sync')
    expect(prompt).not.toContain('highly realistic professional music performance image')
    expect(prompt).not.toContain('Preserve exactly the identity')
    expect(wordCount(prompt)).toBeLessThanOrEqual(130)
  })

  it('nunca inclui movimento de câmera', () => {
    for (const subject of IMAGE_SUBJECTS) {
      const performance = performancesForSubject(subject.id)[0]
      const prompt = composeImagePrompt({
        subjectId: subject.id,
        performanceId: performance.id,
        framingId: 'auto',
        purpose: 'scene',
        stageContextId: 'on-stage',
      }).toLowerCase()

      for (const term of VIDEO_TERMS) {
        expect(prompt).not.toContain(term)
      }
    }
  })

  it('usa expressões neutras de gênero', () => {
    for (const subject of IMAGE_SUBJECTS) {
      expect(subject.text).not.toMatch(/\bhis\b|\bher\b|\bhe\b|\bshe\b/i)
    }
    for (const framing of IMAGE_FRAMINGS) {
      expect(framing.text).not.toMatch(/\bhis\b|\bher\b|\bhe\b|\bshe\b/i)
    }
    for (const stage of STAGE_CONTEXTS) {
      expect(stage.text).not.toMatch(/\bhis\b|\bher\b|\bhe\b|\bshe\b/i)
    }
  })

  it('é determinístico', () => {
    expect(composeImagePrompt(BASE)).toBe(composeImagePrompt(BASE))
  })
})

describe('finalidade lipsync', () => {
  it('adiciona o bloco de rosto visível quando há cantor', () => {
    const prompt = composeImagePrompt({ ...BASE, purpose: 'lipsync' })
    expect(prompt).toContain('later lip-sync')
    expect(prompt.toLowerCase()).toContain('unobstructed')
  })

  it('não adiciona instruções de lipsync em Cena geral', () => {
    const prompt = composeImagePrompt({ ...BASE, purpose: 'scene' })
    expect(prompt).not.toContain('later lip-sync')
    expect(prompt).not.toContain('unobstructed')
  })

  it('ignora lipsync para guitarrista e baterista sem cantor', () => {
    for (const subjectId of ['guitarist-solo', 'drummer-solo', 'band-no-singer'] as const) {
      expect(lipSyncApplies(subjectId, 'lipsync')).toBe(false)
      const prompt = composeImagePrompt({
        subjectId,
        performanceId: performancesForSubject(subjectId)[0].id,
        framingId: 'auto',
        purpose: 'lipsync',
        stageContextId: 'on-stage',
      })
      expect(prompt).not.toContain('lip-sync')
    }
  })

  it('descarta ângulos abertos quando a finalidade é lipsync', () => {
    const framings = framingsForSubject('singer-solo', 'lipsync')
    for (const framing of framings) {
      expect(framing.lipSyncSafe).toBe(true)
    }
    expect(framings.map((f) => f.id)).not.toContain('medium-wide')
  })

  it('libera ângulos mais abertos em Cena geral', () => {
    const scene = framingsForSubject('guitarist-solo', 'scene').map((f) => f.id)
    const lip = framingsForSubject('guitarist-solo', 'scene').length
    expect(scene).toContain('front-full-guitar')
    expect(lip).toBeGreaterThan(0)
  })
})

describe('compatibilidade entre sujeito, performance e ângulo', () => {
  it('não oferece performance de bateria para o cantor sozinho', () => {
    const ids = performancesForSubject('singer-solo').map((p) => p.id)
    expect(ids).not.toContain('drums-playing')
    expect(ids).toContain('singing-mic')
  })

  it('não oferece performance de canto para o baterista', () => {
    const ids = performancesForSubject('drummer-solo').map((p) => p.id)
    expect(ids).not.toContain('singing-mic')
    expect(ids).toContain('drums-playing')
  })

  it('o guitarrista não recebe ângulos de bateria', () => {
    const ids = framingsForSubject('guitarist-solo', 'scene').map((f) => f.id)
    expect(ids).not.toContain('drums-front')
    expect(ids).toContain('mcu-instrument')
  })

  it('o baterista recebe ângulos próprios de bateria', () => {
    const ids = framingsForSubject('drummer-solo', 'scene').map((f) => f.id)
    expect(ids).toContain('drums-front')
    expect(ids).toContain('medium-wide')
  })

  it('a banda recebe composição de palco', () => {
    const ids = framingsForSubject('band-no-singer', 'scene').map((f) => f.id)
    expect(ids).toContain('stage-diagonal')
    expect(ids).toContain('band-behind')
  })

  it('todo sujeito tem performance e ângulo disponíveis', () => {
    for (const subject of IMAGE_SUBJECTS) {
      expect(performancesForSubject(subject.id).length).toBeGreaterThan(0)
      expect(framingsForSubject(subject.id, 'scene').length).toBeGreaterThan(0)
      if (subject.hasSinger) {
        expect(framingsForSubject(subject.id, 'lipsync').length).toBeGreaterThan(0)
      }
    }
  })
})

describe('enquadramento automático de imagem', () => {
  it('escolhe medium close-up para o cantor', () => {
    expect(resolveImageFraming('auto', 'singer-solo', 'lipsync')?.id).toBe('mcu-front')
  })

  it('escolhe um ângulo de bateria para o baterista', () => {
    expect(resolveImageFraming('auto', 'drummer-solo', 'scene')?.id).toBe('drums-front')
  })

  it('destaca o cantor quando há banda', () => {
    expect(resolveImageFraming('auto', 'singer-full-band', 'lipsync')?.id).toBe(
      'singer-foreground',
    )
  })

  it('troca um ângulo aberto por um seguro ao exigir lipsync', () => {
    const framing = resolveImageFraming('medium-wide', 'singer-full-band', 'lipsync')
    expect(framing?.lipSyncSafe).toBe(true)
  })

  it('respeita o ângulo escolhido manualmente', () => {
    expect(resolveImageFraming('close-up-front', 'singer-solo', 'lipsync')?.id).toBe(
      'close-up-front',
    )
  })
})

describe('variações de ângulo', () => {
  it('gera até 20 variações distintas para o cantor em lipsync', () => {
    const variations = buildAngleVariations({
      subjectId: 'singer-solo',
      performanceId: 'singing-mic',
      purpose: 'lipsync',
      stageContextId: 'on-stage',
    })

    expect(variations.length).toBe(20)
    expect(new Set(variations.map((v) => v.id)).size).toBe(20)
  })

  it('coloca primeiro os ângulos mais úteis para lipsync', () => {
    const ids = buildAngleVariations({
      subjectId: 'singer-solo',
      performanceId: 'singing-mic',
      purpose: 'lipsync',
      stageContextId: 'on-stage',
    }).map((v) => v.framingId)

    expect(ids.slice(0, 8)).toEqual(
      expect.arrayContaining(['tight-cu-front', 'close-up-front', 'mcu-front']),
    )
    expect(ids).toContain('close-up-tq-left')
    expect(ids).toContain('low-angle-slight')
    expect(ids).not.toContain('medium-wide')
  })

  it('não devolve assinaturas visuais duplicadas', () => {
    const variations = buildAngleVariations({
      subjectId: 'singer-acoustic',
      performanceId: 'acoustic-singing',
      purpose: 'lipsync',
      stageContextId: 'on-stage',
    })
    const signatures = variations.map((variation) => {
      const framing = IMAGE_FRAMINGS.find((item) => item.id === variation.framingId)
      return `${framing?.distance}|${framing?.direction}|${framing?.height}|${framing?.composition}`
    })
    expect(new Set(signatures).size).toBe(signatures.length)
  })

  it('mistura distâncias, direções e alturas', () => {
    const variations = buildAngleVariations({
      subjectId: 'singer-solo',
      performanceId: 'singing-mic',
      purpose: 'lipsync',
      stageContextId: 'on-stage',
    })
    const framings = variations.map(
      (variation) => IMAGE_FRAMINGS.find((item) => item.id === variation.framingId)!,
    )
    expect(new Set(framings.map((item) => item.distance)).size).toBeGreaterThanOrEqual(3)
    expect(new Set(framings.map((item) => item.direction)).size).toBe(3)
    expect(new Set(framings.map((item) => item.height)).size).toBeGreaterThanOrEqual(2)
  })

  it('inclui instrumento nas variações de cantor + violão', () => {
    const labels = buildAngleVariations({
      subjectId: 'singer-acoustic',
      performanceId: 'acoustic-singing',
      purpose: 'lipsync',
      stageContextId: 'on-stage',
    }).map((v) => v.label.toLowerCase())
    expect(labels.some((label) => label.includes('instrumento') || label.includes('braço'))).toBe(
      true,
    )
  })

  it('mantém o cantor dominante nas variações com banda', () => {
    const ids = buildAngleVariations({
      subjectId: 'singer-full-band',
      performanceId: 'natural-with-band',
      purpose: 'lipsync',
      stageContextId: 'on-stage',
    }).map((v) => v.framingId)
    expect(ids).toContain('singer-foreground')
    expect(ids).not.toContain('band-centered')
  })

  it('usa ângulos específicos de guitarrista', () => {
    const ids = buildAngleVariations({
      subjectId: 'guitarist-solo',
      performanceId: 'guitar-playing',
      purpose: 'scene',
      stageContextId: 'on-stage',
    }).map((v) => v.framingId)
    expect(ids.length).toBeGreaterThanOrEqual(16)
    expect(ids).toContain('guitar-picking')
    expect(ids).toContain('guitar-fretboard')
    expect(ids).toContain('mcu-instrument')
    expect(ids).not.toContain('drums-front')
  })

  it('usa ângulos específicos de baterista', () => {
    const ids = buildAngleVariations({
      subjectId: 'drummer-solo',
      performanceId: 'drums-playing',
      purpose: 'scene',
      stageContextId: 'on-stage',
    }).map((v) => v.framingId)
    expect(ids.length).toBeGreaterThanOrEqual(16)
    expect(ids).toContain('drums-front')
    expect(ids).toContain('drums-tq-left')
    expect(ids).toContain('drums-kick-snare')
  })

  it('usa apenas ângulos compatíveis com o sujeito', () => {
    const variations = buildAngleVariations({
      subjectId: 'drummer-solo',
      performanceId: 'drums-playing',
      purpose: 'scene',
      stageContextId: 'on-stage',
    })
    const allowed = framingsForSubject('drummer-solo', 'scene', 'drums-playing').map((f) => f.id)
    for (const variation of variations) {
      expect(allowed).toContain(variation.framingId)
    }
  })

  it('mantém todos os ângulos seguros quando a finalidade é lipsync', () => {
    const variations = buildAngleVariations({
      subjectId: 'singer-acoustic',
      performanceId: 'acoustic-singing',
      purpose: 'lipsync',
      stageContextId: 'on-stage',
    })
    expect(variations.length).toBeGreaterThan(8)
    for (const variation of variations) {
      const framing = IMAGE_FRAMINGS.find((f) => f.id === variation.framingId)
      expect(framing?.lipSyncSafe).toBe(true)
    }
  })

  it('começa pelo ângulo atualmente selecionado', () => {
    const variations = buildAngleVariations({
      subjectId: 'singer-solo',
      performanceId: 'singing-mic',
      framingId: 'close-up-front',
      purpose: 'lipsync',
      stageContextId: 'on-stage',
    })
    expect(variations[0].framingId).toBe('close-up-front')
  })

  it('é determinístico', () => {
    const input = {
      subjectId: 'singer-electric',
      performanceId: 'electric-singing',
      purpose: 'lipsync',
      stageContextId: 'on-stage',
    } as const
    expect(buildAngleVariations(input)).toEqual(buildAngleVariations(input))
  })

  it('não inclui vocabulário de vídeo nas variações', () => {
    const variations = buildAngleVariations({
      subjectId: 'singer-solo',
      performanceId: 'singing-mic',
      purpose: 'lipsync',
      stageContextId: 'on-stage',
    })
    for (const variation of variations) {
      const text = variation.prompt.toLowerCase()
      for (const term of VIDEO_TERMS) {
        expect(text).not.toContain(term)
      }
    }
  })
})

describe('contexto de palco', () => {
  it('em No palco usa uma frase curta', () => {
    const prompt = composeImagePrompt({ ...BASE, stageContextId: 'on-stage' })
    expect(prompt).toContain('on the existing stage')
    expect(prompt).not.toContain('The performer remains on the stage platform')
    expect(prompt).not.toContain('not in front of the stage')
  })

  it('em Cantor + banda mantém o cantor como assunto no palco', () => {
    const prompt = composeImagePrompt({
      subjectId: 'singer-full-band',
      performanceId: 'natural-with-band',
      framingId: 'auto',
      purpose: 'lipsync',
      stageContextId: 'on-stage',
    })
    expect(prompt).toContain('large in the foreground')
    expect(prompt).toMatch(/clear visual separation between the singer and the band/i)
    expect(prompt).not.toContain('The performer remains on the stage platform')
  })

  it('em Fora do palco tira o performer da plataforma', () => {
    const prompt = composeImagePrompt({ ...BASE, stageContextId: 'off-stage' })
    expect(prompt).toContain('outside the stage structure')
    expect(prompt).not.toContain('The performer remains on the stage platform.')
  })

  it('em Sem palco evita estrutura de palco automática', () => {
    const prompt = composeImagePrompt({ ...BASE, stageContextId: 'no-stage' })
    expect(prompt).toContain('No concert stage structure')
    expect(prompt).not.toContain('The performer remains on the stage platform.')
  })

  it('vale para guitarrista e baterista sozinhos', () => {
    const guitar = composeImagePrompt({
      subjectId: 'guitarist-solo',
      performanceId: 'guitar-playing',
      framingId: 'auto',
      purpose: 'scene',
      stageContextId: 'on-stage',
    })
    const drums = composeImagePrompt({
      subjectId: 'drummer-solo',
      performanceId: 'drums-playing',
      framingId: 'auto',
      purpose: 'scene',
      stageContextId: 'on-stage',
    })
    expect(guitar).toContain('on the existing stage')
    expect(drums).toContain('on the existing stage')
    expect(guitar).toContain('fretboard')
    expect(drums).toContain('snare')
    expect(guitar).not.toContain('The guitarist remains on the stage platform')
    expect(drums).not.toContain('The drummer and the drum kit remain')
  })
})

describe('identidade própria e plateia', () => {
  it('cantor sozinho não é cantor + violão com uma frase extra', () => {
    const solo = composeImagePrompt({
      subjectId: 'singer-solo',
      performanceId: 'singing-mic',
      framingId: 'auto',
      purpose: 'scene',
      stageContextId: 'on-stage',
    })
    const acoustic = composeImagePrompt({ ...BASE, purpose: 'scene' })
    expect(solo).not.toBe(acoustic)
    expect(solo).not.toContain('acoustic guitar')
    expect(acoustic).toContain('acoustic guitar')
  })

  it('plateia é só plateia', () => {
    const prompt = composeImagePrompt({
      subjectId: 'audience',
      performanceId: 'crowd-watching',
      framingId: 'auto',
      purpose: 'scene',
      stageContextId: 'audience-area',
    })
    expect(prompt).toContain('Keep the audience as the only subject')
    expect(prompt.toLowerCase()).toContain('no singer')
    expect(prompt).not.toContain('The singer from the reference')
    expect(lipSyncApplies('audience', 'lipsync')).toBe(false)
  })

  it('banda sem cantor não usa ângulo de cantor no automático', () => {
    expect(resolveImageFraming('auto', 'band-no-singer', 'scene')?.id).not.toBe(
      'singer-foreground',
    )
  })
})
