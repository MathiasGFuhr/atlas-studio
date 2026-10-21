import { describe, expect, it } from 'vitest'
import { matchNamedTarget, teamChatPath } from './teamMessageTarget'

const people = [
  { id: '1', name: 'Rodnei Silva', aliases: ['rodnei@studio.com'] },
  { id: '2', name: 'Rodnei' },
  { id: '3', name: 'Ana Costa', aliases: ['ana@studio.com'] },
  { id: '4', name: 'João Pedro' },
]

describe('matchNamedTarget', () => {
  it('prefere o nome exato quando o primeiro nome também existe', () => {
    expect(matchNamedTarget(people, 'Rodnei', 'pessoa').id).toBe('2')
  })

  it('acha pelo primeiro nome quando só existe um', () => {
    const only = people.filter((person) => person.id !== '2')
    expect(matchNamedTarget(only, 'rodnei', 'pessoa').id).toBe('1')
  })

  it('ignora acento', () => {
    expect(matchNamedTarget(people, 'joao', 'pessoa').id).toBe('4')
  })

  it('acha pelo e-mail', () => {
    expect(matchNamedTarget(people, 'ana@studio.com', 'pessoa').id).toBe('3')
  })

  it('pede escolha quando dois primeiros nomes empatam', () => {
    const twins = [
      { id: 'a', name: 'Rodnei Silva' },
      { id: 'b', name: 'Rodnei Souza' },
    ]
    expect(() => matchNamedTarget(twins, 'Rodnei', 'pessoa')).toThrow(/mais de uma pessoa/)
  })

  it('explica quando ninguém corresponde', () => {
    expect(() => matchNamedTarget(people, 'Carla', 'pessoa')).toThrow(/Não encontrei ninguém/)
  })
})

describe('teamChatPath', () => {
  it('abre a sala pedida', () => {
    expect(teamChatPath('abc 1')).toBe('/equipe?sala=abc%201')
  })
})
