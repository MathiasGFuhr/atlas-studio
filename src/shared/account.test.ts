import { describe, expect, it } from 'vitest'
import { mapAtlasAccount, peersWhoJoined } from './account'

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

describe('peersWhoJoined', () => {
  it('ignora quem já estava e a própria conta', () => {
    expect(
      peersWhoJoined(
        [{ id: 'me', name: 'Eu', email: '' }, { id: 'a', name: 'Ana', email: '' }],
        [
          { id: 'me', name: 'Eu', email: '' },
          { id: 'a', name: 'Ana', email: '' },
          { id: 'b', name: 'Bia', email: '' },
        ],
        'me',
      ),
    ).toEqual([{ id: 'b', name: 'Bia', email: '' }])
  })

  it('com lista anterior vazia, só os outros contam como entrada', () => {
    expect(
      peersWhoJoined([], [{ id: 'me', name: 'Eu', email: '' }, { id: 'a', name: 'Ana', email: '' }], 'me'),
    ).toEqual([{ id: 'a', name: 'Ana', email: '' }])
  })
})
