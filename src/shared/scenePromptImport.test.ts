import { describe, expect, it } from 'vitest'
import {
  extractComfyPromptsFromDirectionDoc,
  looksLikeDirectionDoc,
  parseScenePromptsForImport,
} from './scenePromptImport'

const SAMPLE = `
MAGGIE HOLLOWAY — ASK ME AGAIN
16 cenas • 32 prompts

CANTADAS: 12 — cenas 02, 03 e 04.

====================================================================
CENA 01 — O RIFF E A ENTRADA DO PULSO
Categoria: BANDA COMPLETA 1/2 — instrumental.

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
})
