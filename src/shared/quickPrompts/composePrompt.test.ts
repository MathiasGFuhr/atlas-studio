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
import { AUDIENCE_CONTEXTS, STAGE_CONTEXTS } from './stageContext'
import { CAMERAS, LIP_SYNC_BLOCK, PERFORMANCES, REFERENCE_PRESERVATION } from './presets'
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

/** Termos que nenhum prompt gerado pode conter. */
const FORBIDDEN_TERMS = [
  'orbit',
  '360',
  'circling',
  'spinning',
  'circular camera path',
  'whip pan',
]

describe('composePrompt', () => {
  it('monta o prompt com todos os blocos selecionados', () => {
    const prompt = composePrompt(BASE)

    expect(prompt).toContain(REFERENCE_PRESERVATION)
    expect(prompt).toContain('acoustic guitar')
    expect(prompt).toContain('stays in place while singing')
    expect(prompt).toContain('Medium close-up framing')
    expect(prompt).toContain('slow, steady push-in')
    expect(prompt).toContain(LIP_SYNC_BLOCK)
  })

  it('inclui o bloco de lipsync apenas quando ativado', () => {
    expect(composePrompt({ ...BASE, lipSync: true })).toContain('Precise natural lip sync')
    expect(composePrompt({ ...BASE, lipSync: false })).not.toContain('lip sync')
  })

  it('ignora lipsync em performances sem vocal', () => {
    const prompt = composePrompt({
      ...BASE,
      performanceId: 'drummer',
      actionId: 'natural',
      lipSync: true,
    })
    expect(prompt).not.toContain('Precise natural lip sync')
    expect(prompt).toContain('No lip-sync requirement.')
  })

  it('usa o bloco-base específico do Comfy/LTX', () => {
    const generic = composePrompt({ ...BASE, target: 'generic' })
    const comfy = composePrompt({ ...BASE, target: 'comfy-ltx' })

    expect(generic).toContain('Cinematic music video shot')
    expect(comfy).toContain('Image-to-video')
    expect(comfy).toContain('single visual truth')
  })

  it('sempre proíbe explicitamente os movimentos irreais', () => {
    const prompt = composePrompt(BASE)
    expect(prompt).toContain('no 360-degree camera movement')
    expect(prompt).toContain('no orbit or orbiting camera')
    expect(prompt).toContain('no camera circling around the performer')
    expect(prompt).toContain('no duplicated people')
  })

  it('é determinístico: a mesma seleção devolve sempre o mesmo texto', () => {
    expect(composePrompt(BASE)).toBe(composePrompt(BASE))
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
    expect(ids).not.toContain('driving')
    expect(ids).not.toContain('acoustic-guitar')
    expect(ids).not.toContain('electric-guitar')
    expect(ids).not.toContain('band')
    expect(ids).not.toContain('standing')
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
    expect(cameras).not.toContain('controlled-follow')
    expect(resolveCamera('auto', 'driving')?.id).toBe('passenger-side-fixed')
  })

  it('não oferece tracking de caminhada para cenas paradas', () => {
    const cameras = camerasForAction('standing').map((camera) => camera.id)
    expect(cameras).not.toContain('smooth-backward-tracking')
    expect(cameras).not.toContain('controlled-follow')
  })

  it('cai para uma câmera compatível quando a escolhida não serve para a ação', () => {
    // "Smooth backward tracking" é de caminhada: dirigindo, precisa ser trocada.
    const camera = resolveCamera('smooth-backward-tracking', 'driving')
    expect(camera?.compatibleActions).toContain('driving')
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

  it('nenhuma variação gerada propõe movimento proibido', () => {
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
        // O texto do movimento escolhido nunca contém os termos proibidos;
        // eles só aparecem na lista "Avoid:".
        const beforeAvoid = variation.prompt.split('Avoid:')[0].toLowerCase()
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
  'Precise natural lip sync',
  'same person, same face',
  'toward the performer',
  'Keep the face clearly readable',
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

    expect(prompt).toContain('same guitarist, same face')
    expect(prompt).toContain('Preserve exactly the guitarist')
    expect(prompt).toContain('believable instrument-playing motion')
    expect(prompt).toContain('No lip-sync requirement.')
    expect(prompt).toContain('instrument shot')
    expect(prompt).not.toContain(REFERENCE_PRESERVATION)
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

    expect(prompt).toContain('same drummer, same face')
    expect(prompt).toContain('same drum kit')
    expect(prompt).toContain('believable drumming motion')
    expect(prompt).toContain('No lip-sync requirement.')
    expect(prompt).toContain('no extra limbs')
    expect(prompt).not.toContain('mouth clearly')
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

    expect(prompt).toContain('preserve the same musicians')
    expect(prompt).toContain('Do not add a singer or front performer')
    expect(prompt).toContain('No lip-sync requirement.')
    expect(prompt).toContain('band shot')
    expect(prompt).not.toContain('The singer remains the main subject')
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

    expect(prompt).toContain('same audience members')
    expect(prompt).toContain('believable individual behaviour')
    expect(prompt).toContain('No lip-sync requirement.')
    expect(prompt).toContain('crowd shot')
    expect(prompt).toContain('The crowd reacts naturally')
    expect(prompt).toContain('public area of the venue')
    expect(prompt).not.toContain('same person, same face')
    expect(prompt).not.toContain(REFERENCE_PRESERVATION)
    expect(prompt).not.toContain('The performer must be physically positioned')
    expect(prompt).not.toContain('do not invent a singer')
    expect(prompt).not.toContain('do not reframe onto a singer')
    expect(prompt).not.toContain('do not place crowd members')
    for (const leak of SINGER_LEAKS) {
      expect(prompt).not.toContain(leak)
    }
  })

  it('presets de cantor continuam com preservação e lipsync padrão', () => {
    const prompt = composePrompt(BASE)
    expect(prompt).toContain(REFERENCE_PRESERVATION)
    expect(prompt).toContain(LIP_SYNC_BLOCK)
    expect(prompt).toContain('The singer performs while playing the acoustic guitar')
    expect(prompt).toContain('slow, steady push-in toward the performer')
    expect(prompt).not.toContain('No lip-sync requirement.')
  })
})

describe('contexto de palco', () => {
  it('em No palco reforça que o movimento permanece na plataforma', () => {
    const prompt = composePrompt({ ...BASE, stageContextId: 'on-stage', actionId: 'walking' })
    expect(prompt).toContain('physically positioned on the stage platform')
    expect(prompt).toContain('Keep all performance movement on the stage platform')
    expect(prompt).toContain('no walking off the stage')
    expect(prompt).toContain('no movement onto the ground in front of the stage')
  })

  it('em Cantor + banda coloca todos sobre o palco', () => {
    const prompt = composePrompt({
      ...BASE,
      performanceId: 'singer-band',
      actionId: 'band',
      stageContextId: 'on-stage',
    })
    expect(prompt).toContain('All performers must be positioned on the stage platform')
    expect(prompt).toContain('The singer remains the main subject')
  })

  it('em Fora do palco tira o performer da plataforma', () => {
    const prompt = composePrompt({ ...BASE, stageContextId: 'off-stage' })
    expect(prompt).toContain('outside the stage structure')
    expect(prompt).not.toContain('physically positioned on the stage platform')
  })

  it('em Sem palco evita estrutura de palco automática', () => {
    const prompt = composePrompt({ ...BASE, stageContextId: 'no-stage' })
    expect(prompt).toContain('No concert stage structure should appear')
    expect(prompt).not.toContain('Keep all performance movement on the stage platform')
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
    expect(ids).not.toContain('medium-close-up')
    expect(ids).not.toContain('three-quarter-front')
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
    expect(cameras).not.toContain('subtle-diagonal-dolly')
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
    expect(labels).not.toContain('Fora do palco')
    expect(labels).not.toContain('Sem palco / locação livre')
  })

  it('o prompt descreve o contexto escolhido sem empilhar negações de palco', () => {
    const nearStage = composePrompt({ ...AUDIENCE_BASE, stageContextId: 'near-stage' })
    expect(nearStage).toContain('close to the stage edge')
    expect(nearStage).not.toContain('The performer must be physically positioned')
    expect(nearStage).not.toContain('Keep all performance movement on the stage platform')

    const withStage = composePrompt({
      ...AUDIENCE_BASE,
      stageContextId: 'crowd-with-stage-background',
      framingId: 'crowd-stage-background',
    })
    expect(withStage).toContain('Audience in the foreground with the stage visible')
    expect(withStage).not.toContain('do not invent a singer')
  })
})

