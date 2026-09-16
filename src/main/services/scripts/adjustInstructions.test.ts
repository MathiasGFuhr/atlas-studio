import { describe, expect, it } from 'vitest'
import {
  resolveAdjustInstruction,
  instructionRequestsTitleChange,
  instructionRequestsLanguageChange,
} from '../../../shared/adjustInstructions'
import { assertCanCreateScript, runInScriptFlow } from '../scripts/scriptMutationGuard'

describe('instruções de ajuste', () => {
  it('expande os botões rápidos para revisão, não geração', () => {
    expect(resolveAdjustInstruction('Mais retenção')).toMatch(/aumentar a retenção/)
    expect(resolveAdjustInstruction('Mais emoção')).toMatch(/impacto emocional/)
    expect(resolveAdjustInstruction('Mais curto')).toMatch(/Reduza o roteiro atual/)
    expect(resolveAdjustInstruction('Fortaleça apenas a abertura.')).toBe(
      'Fortaleça apenas a abertura.',
    )
  })

  it('não trata revisão como pedido de título ou idioma', () => {
    expect(instructionRequestsTitleChange('Mais retenção')).toBe(false)
    expect(instructionRequestsLanguageChange('Mais retenção')).toBe(false)
    expect(instructionRequestsTitleChange('Mude o título para Prússia')).toBe(true)
    expect(instructionRequestsLanguageChange('Traduza este roteiro para alemão.')).toBe(true)
  })
})

describe('scriptMutationGuard', () => {
  it('bloqueia createScript durante ajuste', async () => {
    await expect(
      runInScriptFlow('adjust', async () => {
        assertCanCreateScript()
      }),
    ).rejects.toThrow(/não pode criar um novo script/)
  })

  it('permite createScript na geração', async () => {
    await runInScriptFlow('generate', async () => {
      expect(() => assertCanCreateScript()).not.toThrow()
    })
  })
})
