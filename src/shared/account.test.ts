import { describe, expect, it } from 'vitest'
import { mapAtlasAccount } from './account'

describe('mapAtlasAccount', () => {
  it('usa o nome gravado no cadastro', () => {
    expect(
      mapAtlasAccount({
        id: 'u1',
        email: 'ana@studio.test',
        user_metadata: { name: 'Ana' },
      }),
    ).toEqual({
      id: 'u1',
      email: 'ana@studio.test',
      name: 'Ana',
    })
  })

  it('cai no e-mail quando não há nome', () => {
    expect(
      mapAtlasAccount({
        id: 'u2',
        email: 'joao@studio.test',
        user_metadata: {},
      }),
    ).toEqual({
      id: 'u2',
      email: 'joao@studio.test',
      name: 'joao',
    })
  })
})
