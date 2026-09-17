import { describe, expect, it } from 'vitest'
import {
  actionsForPerformance,
  buildCameraVariations,
  camerasForAction,
  composePrompt,
  framingsForLipSync,
  resolveCamera,
  resolveFraming,
} from './composePrompt'
import { wordCount } from './helpers'
import { AUDIENCE_CONTEXTS, STAGE_CONTEXTS } from './stageContext'
import { CAMERAS, PERFORMANCES } from './presets'
import type { ComposePromptInput } from './types'

const BASE: ComposePromptInput = {
  performanceId: 'singer-acoustic',
  actionId: 'standing',
  framingId: 'medium-close-up',
  cameraId: 'auto',
  lipSync: true,
  target: 'generic',
  stageContextId: 'on-stage',
}

const FORBIDDEN_TERMS = [
  'orbit',
  '360',
  'circling',
  'spinning',
  'circular camera path',
  'whip pan',
]

function constraintFree(prompt: string): string {
  return prompt.replace(/\s*No [^.]*\.\s*$/i, '')
}

function countCameraMoveKinds(prompt: string): number {
  const text = constraintFree(prompt).toLowerCase()
  const kinds = [
    /push-in/.test(text),
    /pull-back/.test(text),
    /lateral/.test(text),
    /backward tracking/.test(text),
    /forward tracking/.test(text),
    /handheld/.test(text),
    /diagonal/.test(text),
  ]
  return kinds.filter(Boolean).length
}

describe('composePrompt', () => {
  it('monta um prompt curto e específico de cantor + violão', () => {
    const prompt = composePrompt(BASE)

    expect(prompt).toContain('acoustic guitar')
    expect(prompt).toMatch(/precise lip sync/i)
    expect(prompt).toContain('Medium close-up framing')
    expect(prompt).toContain('slow professional push-in')
    expect(prompt).not.toContain('Create a highly realistic')
    expect(wordCount(prompt)).toBeLessThanOrEqual(140)
  })

  it('inclui o bloco de lipsync apenas quando ativado', () => {
    expect(composePrompt({ ...BASE, lipSync: true })).toMatch(/precise lip sync/i)
    expect(composePrompt({ ...BASE, lipSync: false })).not.toMatch(/precise lip sync/i)
  })

  it('ignora lipsync em performances sem vocal', () => {
    const prompt = composePrompt({
      ...BASE,
      performanceId: 'drummer',
      actionId: 'natural',
      lipSync: true,
    })
    expect(prompt).not.toContain('precise lip sync')
    expect(prompt.toLowerCase()).toContain('no lip sync')
  })

  it('usa só um prefixo mínimo no Comfy/LTX', () => {
    const generic = composePrompt({ ...BASE, target: 'generic' })
    const comfy = composePrompt({ ...BASE, target: 'comfy-ltx' })

    expect(generic).not.toContain('Image-to-video')
    expect(comfy.startsWith('Image-to-video.')).toBe(true)
    expect(comfy).not.toContain('single visual truth')
  })

  it('proíbe orbit e 360 sem lista gigante', () => {
    const prompt = composePrompt(BASE)
    expect(prompt.toLowerCase()).toContain('no orbit')
    expect(prompt.toLowerCase()).toContain('360')
    expect(prompt).not.toContain('no aggressive whip pans')
    expect(prompt).not.toContain('no impossible floating camera')
  })

  it('é determinístico: a mesma seleção devolve sempre o mesmo texto', () => {
    expect(composePrompt(BASE)).toBe(composePrompt(BASE))
  })

  it('escolhe apenas um movimento no automático profissional', () => {
    expect(countCameraMoveKinds(composePrompt({ ...BASE, cameraId: 'auto' }))).toBe(1)
    expect(
      countCameraMoveKinds(
        composePrompt({
          ...BASE,
          performanceId: 'singer-solo',
          actionId: 'walking',
          cameraId: 'auto',
        }),
      ),
    ).toBe(1)
  })
})

describe('compatibilidade entre performance e ação', () => {
  it('não oferece "dirigindo e cantando" para o guitarrista sozinho', () => {
    const ids = actionsForPerformance('guitarist').map((action) => action.id)
    expect(ids).not.toContain('driving')
  })

  it('não oferece "caminhando e cantando" para o baterista', () => {
    const ids = actionsForPerformance('drummer').map((action) => action.id)
    expect(ids).not.toContain('walking')
  })

  it('oferece caminhar e dirigir para o cantor sozinho', () => {
    const ids = actionsForPerformance('singer-solo').map((action) => action.id)
    expect(ids).toContain('walking')
    expect(ids).toContain('driving')
  })

  it('toda performance tem ao menos uma ação disponível', () => {
    for (const performance of PERFORMANCES) {
      expect(actionsForPerformance(performance.id).length).toBeGreaterThan(0)
    }
  })

  it('plateia oferece só ações de público, nunca de cantor', () => {
    const ids = actionsForPerformance('audience').map((action) => action.id)
    expect(ids).toEqual([
      'audience-reaction',
      'audience-clapping',
      'audience-singing-along',
      'audience-arms-raised',
      'audience-emotional',
      'audience-high-energy',
      'audience-watching',
    ])
    expect(ids).not.toContain('natural')
    expect(ids).not.toContain('walking')
  })
})

describe('câmera automática profissional', () => {
  it('escolhe um movimento fixo para cena parada', () => {
    expect(resolveCamera('auto', 'standing')?.id).toBe('slow-push-in')
  })

  it('prefere tracking quando o cantor caminha, nunca câmera fixa', () => {
    const camera = resolveCamera('auto', 'walking')
    expect(camera?.id).toBe('smooth-backward-tracking')
    expect(camera?.id).not.toBe('locked-cinematic')
  })

  it('usa somente câmeras de veículo quando o cantor dirige', () => {
    const cameras = camerasForAction('driving').map((camera) => camera.id)
    expect(cameras).toEqual(
      expect.arrayContaining([
        'passenger-side-fixed',
        'dashboard-mounted',
        'passenger-three-quarter',
        'exterior-vehicle-tracking',
      ]),
    )
    expect(cameras).not.toContain('smooth-backward-tracking')
    expect(resolveCamera('auto', 'driving')?.id).toBe('passenger-side-fixed')
  })

  it('não oferece tracking de caminhada para cenas paradas', () => {
    const cameras = camerasForAction('standing').map((camera) => camera.id)
    expect(cameras).not.toContain('smooth-backward-tracking')
    expect(cameras).not.toContain('controlled-follow')
  })

  it('cai para uma câmera compatível quando a escolhida não serve para a ação', () => {
    const camera = resolveCamera('smooth-backward-tracking', 'driving')
    expect(camera?.compatibleActions).toContain('driving')
  })

  it('escolhe lateral para banda', () => {
    expect(resolveCamera('auto', 'band')?.id).toBe('lateral-tracking-left')
    expect(resolveCamera('auto', 'band', 'band-no-singer')?.id).toBe('lateral-tracking-left')
  })

  it('escolhe lateral para guitarrista', () => {
    expect(resolveCamera('auto', 'electric-guitar', 'guitarist')?.id).toBe('lateral-tracking-left')
  })
})

describe('enquadramento automático profissional', () => {
  it('fecha o quadro no rosto quando o cantor está parado', () => {
    expect(resolveFraming('auto', 'standing', true)?.id).toBe('medium-close-up')
  })

  it('abre o quadro para mostrar a caminhada', () => {
    expect(resolveFraming('auto', 'walking', true)?.id).toBe('medium-shot')
  })

  it('abre o quadro para caber a banda', () => {
    expect(resolveFraming('auto', 'band', true)?.id).toBe('medium-shot')
  })

  it('mostra as mãos quando há instrumento', () => {
    expect(resolveFraming('auto', 'acoustic-guitar', true)?.id).toBe('medium-shot')
    expect(resolveFraming('auto', 'electric-guitar', true)?.id).toBe('medium-shot')
  })

  it('respeita o enquadramento escolhido manualmente', () => {
    expect(resolveFraming('close-up', 'walking', true)?.id).toBe('close-up')
  })

  it('nunca escolhe perfil quando o lipsync está ligado', () => {
    for (const action of [
      'standing',
      'seated',
      'walking',
      'driving',
      'acoustic-guitar',
      'electric-guitar',
      'band',
      'natural',
    ] as const) {
      const framing = resolveFraming('auto', action, true)
      expect(framing?.lipSyncFriendly).toBe(true)
    }
  })

  it('troca um perfil por um enquadramento válido ao ligar o lipsync', () => {
    expect(resolveFraming('profile-left', 'standing', false)?.id).toBe('profile-left')
    expect(resolveFraming('profile-left', 'standing', true)?.lipSyncFriendly).toBe(true)
  })

  it('compõe o prompt usando o enquadramento resolvido', () => {
    const prompt = composePrompt({ ...BASE, framingId: 'auto', actionId: 'walking' })
    expect(prompt).toContain('Medium shot framing')
  })

  it('é determinístico', () => {
    expect(resolveFraming('auto', 'driving', true)?.id).toBe(
      resolveFraming('auto', 'driving', true)?.id,
    )
  })
})

describe('movimentos proibidos', () => {
  it('nenhum preset de câmera descreve orbit, giro 360 ou câmera circulando', () => {
    for (const camera of CAMERAS) {
      const text = camera.text.toLowerCase()
      for (const term of FORBIDDEN_TERMS) {
        expect(text).not.toContain(term)
      }
    }
  })

  it('nenhuma variação gerada propõe movimento proibido no corpo', () => {
    for (const action of ['standing', 'walking', 'driving', 'band'] as const) {
      const variations = buildCameraVariations({
        performanceId: 'singer-solo',
        actionId: action === 'band' ? 'natural' : action,
        framingId: 'medium-close-up',
        lipSync: true,
        target: 'generic',
        stageContextId: 'on-stage',
      })
      for (const variation of variations) {
        const beforeAvoid = constraintFree(variation.prompt).toLowerCase()
        for (const term of FORBIDDEN_TERMS) {
          expect(beforeAvoid).not.toContain(term)
        }
      }
    }
  })
})

describe('variações de câmera', () => {
  it('gera até 8 combinações distintas', () => {
    const variations = buildCameraVariations({
      performanceId: 'singer-solo',
      actionId: 'standing',
      framingId: 'three-quarter-front',
      lipSync: true,
      target: 'generic',
      stageContextId: 'on-stage',
    })

    expect(variations).toHaveLength(8)
    expect(new Set(variations.map((v) => v.id)).size).toBe(8)
    expect(variations[0].framingId).toBe('three-quarter-front')
  })

  it('prioriza tracking e follow quando o cantor caminha', () => {
    const variations = buildCameraVariations({
      performanceId: 'singer-solo',
      actionId: 'walking',
      framingId: 'medium-close-up',
      lipSync: true,
      target: 'generic',
      stageContextId: 'on-stage',
    })

    const cameraIds = new Set(variations.map((v) => v.cameraId))
    for (const id of cameraIds) {
      expect([
        'smooth-backward-tracking',
        'smooth-forward-tracking',
        'parallel-tracking',
        'controlled-follow',
        'three-quarter-tracking',
        'lateral-tracking-left',
        'lateral-tracking-right',
      ]).toContain(id)
    }
  })

  it('usa apenas câmeras de veículo quando o cantor dirige', () => {
    const variations = buildCameraVariations({
      performanceId: 'singer-solo',
      actionId: 'driving',
      framingId: 'medium-close-up',
      lipSync: true,
      target: 'generic',
      stageContextId: 'on-stage',
    })

    expect(variations.length).toBeGreaterThan(0)
    for (const variation of variations) {
      expect([
        'passenger-side-fixed',
        'dashboard-mounted',
        'passenger-three-quarter',
        'exterior-vehicle-tracking',
        'parallel-tracking',
        'locked-cinematic',
      ]).toContain(variation.cameraId)
    }
  })

  it('evita perfil fechado quando o lipsync está ligado', () => {
    const withLipSync = buildCameraVariations({
      performanceId: 'singer-solo',
      actionId: 'standing',
      framingId: 'medium-close-up',
      lipSync: true,
      target: 'generic',
      stageContextId: 'on-stage',
    })
    const framings = withLipSync.map((v) => v.framingId)
    expect(framings).not.toContain('profile-left')
    expect(framings).not.toContain('profile-right')
  })

  it('é determinístico entre execuções', () => {
    const input = {
      performanceId: 'singer-band',
      actionId: 'band',
      framingId: 'medium-shot',
      lipSync: true,
      target: 'generic',
      stageContextId: 'on-stage',
    } as const
    expect(buildCameraVariations(input)).toEqual(buildCameraVariations(input))
  })
})

const SINGER_LEAKS = [
  'precise lip sync',
  'The singer continues',
  'the singer remains',
  'The singer performs',
]

describe('cenas sem cantor não herdam blocos de vocal', () => {
  it('guitarrista sozinho anima a guitarra, sem singer/lipsync', () => {
    const prompt = composePrompt({
      ...BASE,
      performanceId: 'guitarist',
      actionId: 'electric-guitar',
      framingId: 'auto',
      cameraId: 'auto',
      lipSync: true,
      target: 'comfy-ltx',
    })

    expect(prompt).toContain('Animate the guitarist on the existing stage')
    expect(prompt).toContain('fretboard')
    expect(prompt).not.toContain('precise lip sync')
    expect(prompt).toContain('No vocal performance')
    for (const leak of SINGER_LEAKS) {
      expect(prompt).not.toContain(leak)
    }
  })

  it('baterista anima a bateria, sem singer/lipsync nem mouth rules', () => {
    const prompt = composePrompt({
      ...BASE,
      performanceId: 'drummer',
      actionId: 'natural',
      framingId: 'auto',
      cameraId: 'auto',
      lipSync: true,
      target: 'comfy-ltx',
    })

    expect(prompt).toContain('Animate the drummer at the existing kit')
    expect(prompt).toContain('snare and cymbals')
    expect(prompt).toContain('extra limbs')
    expect(prompt).not.toContain('mouth clearly')
    expect(prompt).not.toContain('precise lip sync')
    for (const leak of SINGER_LEAKS) {
      expect(prompt).not.toContain(leak)
    }
  })

  it('banda sem cantor não cria vocalista nem usa lipsync', () => {
    const prompt = composePrompt({
      ...BASE,
      performanceId: 'band-no-singer',
      actionId: 'band',
      framingId: 'auto',
      cameraId: 'auto',
      lipSync: true,
      target: 'comfy-ltx',
    })

    expect(prompt).toContain('Animate the instrumental band in place')
    expect(prompt).toMatch(/No singer/i)
    expect(prompt).not.toContain('The singer remains the main subject')
    expect(prompt).not.toContain('precise lip sync')
    for (const leak of SINGER_LEAKS) {
      expect(prompt).not.toContain(leak)
    }
  })

  it('plateia usa crowd shot, sem same person/same face nem lipsync', () => {
    const prompt = composePrompt({
      ...BASE,
      performanceId: 'audience',
      actionId: 'audience-reaction',
      framingId: 'auto',
      cameraId: 'auto',
      lipSync: true,
      target: 'comfy-ltx',
      stageContextId: 'audience-area',
    })

    expect(prompt).toContain('Animate only the crowd from the reference')
    expect(prompt).toContain('locked cinematic crowd shot')
    expect(prompt).toContain('public area of the venue')
    expect(prompt).toContain('Subtle varied reactions')
    expect(prompt).not.toContain('The performer remains on the stage platform')
    expect(prompt).not.toContain('precise lip sync')
    for (const leak of SINGER_LEAKS) {
      expect(prompt).not.toContain(leak)
    }
  })

  it('presets de cantor continuam com lipsync e identidade própria', () => {
    const prompt = composePrompt(BASE)
    expect(prompt).toContain('still playing the acoustic guitar')
    expect(prompt).toMatch(/precise lip sync/i)
    expect(prompt).toContain('slow professional push-in')
    expect(prompt).not.toContain('Animate the guitarist on the existing stage')
  })
})

describe('contexto de palco', () => {
  it('em No palco usa uma frase curta', () => {
    const prompt = composePrompt({ ...BASE, stageContextId: 'on-stage', actionId: 'walking' })
    expect(prompt).toContain('on the existing stage')
    expect(prompt).not.toContain('The performer remains on the stage platform')
    expect(prompt).not.toContain('not in front of the stage')
    expect(prompt).not.toContain('no walking off the stage')
  })

  it('em Cantor + banda mantém o cantor como assunto no palco', () => {
    const prompt = composePrompt({
      ...BASE,
      performanceId: 'singer-band',
      actionId: 'band',
      stageContextId: 'on-stage',
    })
    expect(prompt).toContain('Keep the singer dominant in the foreground')
    expect(prompt).toContain('independent musician movement in depth')
  })

  it('em Fora do palco tira o performer da plataforma', () => {
    const prompt = composePrompt({ ...BASE, stageContextId: 'off-stage' })
    expect(prompt).toContain('outside the stage structure')
    expect(prompt).not.toContain('The performer remains on the stage platform.')
  })

  it('em Sem palco evita estrutura de palco automática', () => {
    const prompt = composePrompt({ ...BASE, stageContextId: 'no-stage' })
    expect(prompt).toContain('No concert stage structure')
    expect(prompt).not.toContain('The performer remains on the stage platform.')
  })
})

describe('plateia usa lógica própria de público', () => {
  const AUDIENCE_BASE: ComposePromptInput = {
    ...BASE,
    performanceId: 'audience',
    actionId: 'audience-reaction',
    framingId: 'auto',
    cameraId: 'auto',
    lipSync: false,
    stageContextId: 'audience-area',
  }

  it('oferece só enquadramentos de crowd shot', () => {
    const ids = framingsForLipSync(false, 'audience').map((item) => item.id)
    expect(ids).toEqual([
      'crowd-medium-shot',
      'crowd-medium-wide',
      'front-row-reaction',
      'audience-section',
      'side-crowd-view',
      'close-reaction-group',
      'diagonal-crowd',
      'crowd-stage-background',
    ])
    expect(ids).not.toContain('close-up')
  })

  it('escolhe câmera automática de crowd, nunca push-in de cantor', () => {
    expect(resolveCamera('auto', 'audience-reaction', 'audience')?.id).toBe(
      'locked-cinematic-crowd',
    )
    const cameras = camerasForAction('audience-reaction', 'audience').map((item) => item.id)
    expect(cameras).toEqual([
      'locked-cinematic-crowd',
      'very-slow-push-in-crowd',
      'gentle-lateral-crowd',
      'stable-crowd',
      'subtle-handheld-crowd',
      'slow-controlled-pull-back-crowd',
    ])
    expect(cameras).not.toContain('slow-push-in')
  })

  it('enquadramento automático é crowd medium shot', () => {
    expect(resolveFraming('auto', 'audience-reaction', false, 'audience')?.id).toBe(
      'crowd-medium-shot',
    )
  })

  it('contextos de plateia não incluem No palco', () => {
    const labels = AUDIENCE_CONTEXTS.map((item) => item.label)
    expect(labels).toEqual([
      'Na área do público',
      'Perto do palco',
      'Plateia frontal',
      'Plateia lateral',
      'Plateia com palco ao fundo',
      'Plateia sem palco visível',
    ])
    expect(STAGE_CONTEXTS.map((item) => item.label)).toContain('No palco')
    expect(labels).not.toContain('No palco')
  })

  it('o prompt descreve o contexto escolhido sem empilhar negações de palco', () => {
    const nearStage = composePrompt({ ...AUDIENCE_BASE, stageContextId: 'near-stage' })
    expect(nearStage).toContain('close to the stage edge')
    expect(nearStage).not.toContain('The performer remains on the stage platform')

    const withStage = composePrompt({
      ...AUDIENCE_BASE,
      stageContextId: 'crowd-with-stage-background',
      framingId: 'crowd-stage-background',
    })
    expect(withStage).toContain('Audience in the foreground with the stage visible')
  })
})

describe('identidade própria por preset', () => {
  it('cantor sozinho não é o mesmo texto de cantor + violão', () => {
    const solo = composePrompt({ ...BASE, performanceId: 'singer-solo', actionId: 'standing' })
    const acoustic = composePrompt(BASE)
    expect(solo).not.toBe(acoustic)
    expect(solo).not.toContain('acoustic guitar')
    expect(acoustic).toContain('acoustic guitar')
  })

  it('ações de plateia mudam o texto de verdade', () => {
    const reaction = composePrompt({
      ...BASE,
      performanceId: 'audience',
      actionId: 'audience-reaction',
      stageContextId: 'audience-area',
    })
    const clapping = composePrompt({
      ...BASE,
      performanceId: 'audience',
      actionId: 'audience-clapping',
      stageContextId: 'audience-area',
    })
    const singing = composePrompt({
      ...BASE,
      performanceId: 'audience',
      actionId: 'audience-singing-along',
      stageContextId: 'audience-area',
    })
    const arms = composePrompt({
      ...BASE,
      performanceId: 'audience',
      actionId: 'audience-arms-raised',
      stageContextId: 'audience-area',
    })
    expect(reaction).toContain('Subtle varied reactions')
    expect(clapping).toContain('Irregular natural clapping')
    expect(singing).toContain('Believable group singing along')
    expect(arms).toContain('Scattered raised arms')
    expect(new Set([reaction, clapping, singing, arms]).size).toBe(4)
  })
})

