import { describe, expect, it } from 'vitest'
import { sceneNumberFromComfyPath } from './editorComfyIngest'

describe('sceneNumberFromComfyPath', () => {
  it('lê o número do arquivo', () => {
    expect(sceneNumberFromComfyPath('C:/lipsync/3.mp4', 9)).toBe(3)
  })

  it('usa o fallback quando o nome não é só número', () => {
    expect(sceneNumberFromComfyPath('C:/lipsync/cena.mp4', 4)).toBe(4)
  })

  it('usa o fallback para nomes com sufixo de colisão (4 1.mp4)', () => {
    expect(sceneNumberFromComfyPath('C:/lipsync/4 1.mp4', 4)).toBe(4)
  })
})
