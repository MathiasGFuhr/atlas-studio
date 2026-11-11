import { describe, expect, it } from 'vitest'
import {
  extractComfyPromptsFromDirectionDoc,
  extractFlowPromptsFromDirectionDoc,
  looksLikeDirectionDoc,
  looksLikeFlowDirectionDoc,
  parseFlowPromptsForImport,
  parseScenePromptsForImport,
} from './scenePromptImport'

const SAMPLE = `
MAGGIE HOLLOWAY — ASK ME AGAIN
16 cenas • 32 prompts

CANTADAS: 12 — cenas 02, 03 e 04.

====================================================================
CENA 01 — O RIFF E A ENTRADA DO PULSO
Categoria: BANDA COMPLETA 1/2 — instrumental.
Referências a anexar: B1 + P1.

1. FLOW — IMAGEM
\`\`\`text
One horizontal 16:9 live-concert photograph.
\`\`\`

2. COMFYUI — ANIMAÇÃO INSTRUMENTAL — SEM CANTO
\`\`\`text
Animate this initial band frame as one continuous shot.
Do not generate new audio.
\`\`\`

====================================================================
CENA 02 — COMPOSTURA NA PRIMEIRA FRASE
Categoria: CANTADA 1/12.
Referências a anexar: D1 + B1 + P1 + M1.

1. FLOW — IMAGEM
\`\`\`text
Generate a single 16:9 photograph of the referenced singer.
\`\`\`

2. COMFYUI — ANIMAÇÃO E LIPSYNC
\`\`\`text
Continue the singer's existing performance in one locked medium close-up.
No head turn, zoom, cut.
\`\`\`
`

describe('extractComfyPromptsFromDirectionDoc', () => {
  it('pega só o bloco ComfyUI de cada cena, com o número original', () => {
    expect(extractComfyPromptsFromDirectionDoc(SAMPLE)).toEqual([
      {
        number: 1,
        text: 'Animate this initial band frame as one continuous shot.\nDo not generate new audio.',
      },
      {
        number: 2,
        text: "Continue the singer's existing performance in one locked medium close-up.\nNo head turn, zoom, cut.",
      },
    ])
  })

  it('não usa o prompt Flow no lugar do Comfy', () => {
    const [first] = extractComfyPromptsFromDirectionDoc(SAMPLE)
    expect(first?.text).not.toMatch(/16:9 live-concert photograph/)
  })

  it('lê 16 cenas no mesmo molde do documento Maggie (FLOW + Comfy, títulos mistos)', () => {
    const comfyTitle = (n: number) =>
      [1, 6, 11, 16].includes(n)
        ? '2. COMFYUI — ANIMAÇÃO INSTRUMENTAL — SEM CANTO'
        : '2. COMFYUI — ANIMAÇÃO E LIPSYNC'
    const doc = [
      'CANTADAS: 12 — cenas 02, 03, 04, 05, 07, 08, 09, 10, 12, 13, 14 e 15.',
      ...Array.from({ length: 16 }, (_, i) => {
        const n = String(i + 1).padStart(2, '0')
        return `====================================================================
CENA ${n} — TÍTULO ${n}
1. FLOW — IMAGEM
\`\`\`text
FLOW cena ${i + 1} não deve entrar
\`\`\`

${comfyTitle(i + 1)}
\`\`\`text
COMFY cena ${i + 1} unique-line
\`\`\`
`
      }),
    ].join('\n')
    const extracted = extractComfyPromptsFromDirectionDoc(doc)
    expect(extracted.map((entry) => entry.number)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1))
    expect(extracted.every((entry) => entry.text === `COMFY cena ${entry.number} unique-line`)).toBe(true)
  })
})

const CORTE_SAMPLE = `
DANIEL DE JESUS — ESTUFA
19 cortes | Flow + ComfyUI + Veo 3

CORTE 01 — Abertura falada
Referências: Cantor + rosto.

FLOW — IMAGEM
/closeup /documentary — Photograph Daniel on stage.

COMFYUI — ANIMAÇÃO E SINCRONIZAÇÃO PELO ÁUDIO
Animate this supplied frame as one continuous spoken-address take.
Use the actual speech audio supplied to the audio-conditioned workflow.
No subtitles, captions, on-screen lyrics or added text.

CORTE 02 — Instrumental — violão
Referências: Banda + cenário.

FLOW — IMAGEM
/closeup /softlight — Photograph Caio with acoustic guitar.

VEO 3 — ANIMAÇÃO
One continuous instrumental shot beginning exactly from the supplied image.

CORTE 03 — Primeiro verso
FLOW — IMAGEM
Portrait of Daniel singing.

COMFYUI — ANIMAÇÃO E SINCRONIZAÇÃO PELO ÁUDIO
Continue this exact composition as a single singing take driven by the supplied vocal audio.
Keep his attention on the listener.
No subtitles, captions, on-screen lyrics or added text.
`

describe('parseScenePromptsForImport', () => {
  it('reconhece o documento de direção', () => {
    expect(looksLikeDirectionDoc(SAMPLE)).toBe(true)
    expect(parseScenePromptsForImport(SAMPLE)).toHaveLength(2)
  })

  it('continua aceitando a lista 1- 2- 3-', () => {
    expect(
      parseScenePromptsForImport('1- prompt um\n\n3- prompt três'),
    ).toEqual([
      { number: 1, text: 'prompt um' },
      { number: 3, text: 'prompt três' },
    ])
  })

  it('lê documento com cabeçalhos "1- CENA 01" e extrai somente os blocos ComfyUI', () => {
    const doc = [
      'DANIEL DE JESUS — SHOW DE CINCO MÚSICAS',
      'Flow: imagem inicial | ComfyUI: animação de todos os cortes',
      ...Array.from({ length: 15 }, (_, index) => {
        const number = index + 1
        const padded = String(number).padStart(2, '0')
        return `${number}- CENA ${padded} — Direção do corte ${padded}
Direção: texto que não deve entrar no campo.
Referências: [cantor] [banda] [cenario]

FLOW — IMAGEM
\`\`\`
FLOW cena ${number} não deve entrar
\`\`\`

ComfyUI
\`\`\`
LIPSYNC cena ${number} deve entrar sozinho
\`\`\``
      }),
    ].join('\n\n')

    const parsed = parseScenePromptsForImport(doc)
    expect(parsed).toHaveLength(15)
    expect(parsed.map((entry) => entry.number)).toEqual(
      Array.from({ length: 15 }, (_, index) => index + 1),
    )
    expect(parsed.every((entry) => entry.text === `LIPSYNC cena ${entry.number} deve entrar sozinho`)).toBe(
      true,
    )
    expect(parsed.some((entry) => /FLOW|Direção:|Referências:/i.test(entry.text))).toBe(false)
  })

  it('lê documento CORTE sem fence, ignora FLOW e usa Veo no corte sem Comfy', () => {
    expect(looksLikeDirectionDoc(CORTE_SAMPLE)).toBe(true)
    const extracted = extractComfyPromptsFromDirectionDoc(CORTE_SAMPLE)
    expect(extracted.map((entry) => entry.number)).toEqual([1, 3])
    const parsed = parseScenePromptsForImport(CORTE_SAMPLE)
    expect(parsed.map((entry) => entry.number)).toEqual([1, 2, 3])
    expect(parsed[0]?.text).toBe(
      [
        'Animate this supplied frame as one continuous spoken-address take.',
        'Use the actual speech audio supplied to the audio-conditioned workflow.',
        'No subtitles, captions, on-screen lyrics or added text.',
      ].join('\n'),
    )
    expect(parsed[0]?.text).not.toMatch(/Photograph Daniel on stage/)
    expect(parsed[0]?.text).not.toMatch(/^(?:COMFYUI|FLOW|VEO)\b/im)
    expect(parsed[1]?.text).toBe(
      'One continuous instrumental shot beginning exactly from the supplied image.',
    )
    expect(parsed[1]?.text).not.toMatch(/Photograph Caio/)
    expect(parsed[2]?.text).toContain('Continue this exact composition as a single singing take')
  })

  it('prefere Comfy e só cai no Veo quando o corte é de banda ou instrumental', () => {
    const doc = `
CORTE 01 — Canto
COMFYUI — ANIMAÇÃO E LIPSYNC
Sing this line.
VEO 3 — ANIMAÇÃO
Do not use this veo line.

CORTE 02 — Instrumental — banda
FLOW — IMAGEM
Photograph the guitarist.
VEO 3 — ANIMAÇÃO
Band plays the instrumental passage.
`
    const parsed = parseScenePromptsForImport(doc)
    expect(parsed).toEqual([
      { number: 1, text: 'Sing this line.' },
      { number: 2, text: 'Band plays the instrumental passage.' },
    ])
  })

  it('aceita SCENE/CUT e bloco Comfy sem numeração 1./2.', () => {
    const doc = `
SCENE 04 — Verse
FLOW — IMAGEM
/closeup — singer portrait

COMFYUI — ANIMAÇÃO E SINCRONIZAÇÃO PELO ÁUDIO
Sing with the supplied vocal audio.

CUT 05 — Bridge
COMFY UI — LIPSYNC
Keep the mouth locked to the recording.
`
    expect(parseScenePromptsForImport(doc).map((entry) => entry.number)).toEqual([4, 5])
    expect(parseScenePromptsForImport(doc)[0]?.text).toBe('Sing with the supplied vocal audio.')
    expect(parseScenePromptsForImport(doc)[1]?.text).toBe('Keep the mouth locked to the recording.')
  })
})

describe('extractFlowPromptsFromDirectionDoc', () => {
  it('pega só o bloco FLOW de cada cena, com o número original', () => {
    expect(extractFlowPromptsFromDirectionDoc(SAMPLE)).toEqual([
      {
        number: 1,
        text: 'One horizontal 16:9 live-concert photograph.',
      },
      {
        number: 2,
        text: 'Generate a single 16:9 photograph of the referenced singer.',
      },
    ])
  })

  it('não usa o prompt Comfy no lugar do Flow', () => {
    const [first] = extractFlowPromptsFromDirectionDoc(SAMPLE)
    expect(first?.text).not.toMatch(/Animate this initial band frame/)
  })

  it('lê documento CORTE sem fence e ignora Comfy/VEO', () => {
    expect(looksLikeFlowDirectionDoc(CORTE_SAMPLE)).toBe(true)
    const extracted = extractFlowPromptsFromDirectionDoc(CORTE_SAMPLE)
    expect(extracted.map((entry) => entry.number)).toEqual([1, 2, 3])
    expect(extracted[0]?.text).toBe('/closeup /documentary — Photograph Daniel on stage.')
    expect(extracted[1]?.text).toBe('/closeup /softlight — Photograph Caio with acoustic guitar.')
    expect(extracted[2]?.text).toBe('Portrait of Daniel singing.')
    expect(extracted.every((entry) => !/^(?:COMFYUI|VEO)\b/im.test(entry.text))).toBe(true)
    expect(extracted.some((entry) => entry.text.includes('Animate this supplied frame'))).toBe(false)
    expect(extracted.some((entry) => entry.text.includes('instrumental shot'))).toBe(false)
  })
})

describe('parseFlowPromptsForImport', () => {
  it('reconhece o documento de direção Flow', () => {
    expect(looksLikeFlowDirectionDoc(SAMPLE)).toBe(true)
    expect(parseFlowPromptsForImport(SAMPLE)).toHaveLength(2)
  })

  it('aceita lista 1- 2- 3-', () => {
    expect(parseFlowPromptsForImport('1- prompt flow um\n\n2- prompt flow dois')).toEqual([
      { number: 1, text: 'prompt flow um' },
      { number: 2, text: 'prompt flow dois' },
    ])
  })

  it('aceita CORTE/SCENE/CUT e markdown no cabeçalho', () => {
    const doc = `
## CORTE 01 — Abertura
FLOW — IMAGEM
/closeup /documentary — singer at the mic.

COMFYUI — ANIMAÇÃO
Animate with audio.

**SCENE 02** — Guitar
1. FLOW - IMAGE
Seated guitarist, sunburst acoustic.

VEO 3 — ANIMAÇÃO
Instrumental take.

# CUT #03 — Wide
Google Flow — IMAGEM
Wide conservatory stage with the full band.
`
    const parsed = parseFlowPromptsForImport(doc)
    expect(parsed.map((entry) => entry.number)).toEqual([1, 2, 3])
    expect(parsed[0]?.text).toBe('/closeup /documentary — singer at the mic.')
    expect(parsed[1]?.text).toBe('Seated guitarist, sunburst acoustic.')
    expect(parsed[2]?.text).toBe('Wide conservatory stage with the full band.')
  })
})
