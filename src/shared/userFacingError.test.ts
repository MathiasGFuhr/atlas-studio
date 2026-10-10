import { describe, expect, it } from 'vitest'
import {
  extractErrorMessage,
  stripTechnicalErrorWrappers,
  toUserFacingError,
} from './userFacingError'

describe('toUserFacingError', () => {
  it('remove o wrapper IPC do Electron e mantém a mensagem em português', () => {
    const raw =
      "Error invoking remote method 'settings:setProfilePhoto': Error: A foto deve ter no máximo 8 MB."
    expect(toUserFacingError(raw)).toBe('A foto deve ter no máximo 8 MB.')
    expect(toUserFacingError(new Error(raw))).toBe('A foto deve ter no máximo 8 MB.')
  })

  it('aceita aspas duplas no nome do método IPC', () => {
    const raw =
      'Error invoking remote method "channels:setPhoto": Error: A imagem deve ter no máximo 8 MB.'
    expect(toUserFacingError(raw)).toBe('A imagem deve ter no máximo 8 MB.')
  })

  it('remove prefixos Error: aninhados', () => {
    expect(stripTechnicalErrorWrappers('Error: Error: Pasta não encontrada.')).toBe(
      'Pasta não encontrada.',
    )
  })

  it('descarta stack traces e códigos de sistema', () => {
    expect(
      toUserFacingError('ENOTFOUND github.com\n    at ClientRequest (node:http:1:1)'),
    ).toBe('Algo deu errado. Tente novamente.')
    expect(toUserFacingError('ENOENT: no such file or directory')).toBe(
      'Algo deu errado. Tente novamente.',
    )
  })

  it('usa fallback quando a mensagem está vazia', () => {
    expect(toUserFacingError(null, 'Falha ao salvar.')).toBe('Falha ao salvar.')
    expect(toUserFacingError('', 'Falha ao salvar.')).toBe('Falha ao salvar.')
    expect(extractErrorMessage({ message: 'ok' })).toBe('ok')
  })

  it('limita mensagens muito longas', () => {
    const long = `Arquivo inválido: ${'x'.repeat(220)}`
    const result = toUserFacingError(long)
    expect(result.endsWith('…')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(180)
  })
})
