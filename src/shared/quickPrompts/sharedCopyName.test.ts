import { describe, expect, it } from 'vitest'
import { nextSharedCopyName } from './sharedCopyName'

describe('nextSharedCopyName', () => {
  it('mantém o nome quando ninguém usa', () => {
    expect(nextSharedCopyName('Cantor praia', ['Outro'])).toBe('Cantor praia')
  })

  it('acrescenta (cópia) na primeira colisão', () => {
    expect(nextSharedCopyName('Cantor praia', ['Cantor praia'])).toBe('Cantor praia (cópia)')
  })

  it('numera cópias seguintes', () => {
    expect(
      nextSharedCopyName('Cantor praia', ['Cantor praia', 'Cantor praia (cópia)']),
    ).toBe('Cantor praia (cópia 2)')
  })

  it('usa Prompt quando o nome vem vazio', () => {
    expect(nextSharedCopyName('   ', [])).toBe('Prompt')
  })
})
