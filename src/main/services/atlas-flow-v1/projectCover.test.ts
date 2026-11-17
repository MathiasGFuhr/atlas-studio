import { describe, expect, it } from 'vitest'
import { pickLatestExistingCover } from './projectCover'

describe('pickLatestExistingCover', () => {
  it('escolhe a imagem gerada mais recente de cada projeto', () => {
    const covers = pickLatestExistingCover(
      [
        { atlasProjectId: 'a', absPath: 'a-old.webp', createdAt: '2026-11-15T10:00:00.000Z' },
        { atlasProjectId: 'a', absPath: 'a-new.webp', createdAt: '2026-11-16T10:00:00.000Z' },
        { atlasProjectId: 'b', absPath: 'b.webp', createdAt: '2026-11-16T09:00:00.000Z' },
      ],
      () => true,
    )
    expect(covers.get('a')).toBe('a-new.webp')
    expect(covers.get('b')).toBe('b.webp')
  })

  it('pula arquivo ausente e ignora projeto sem imagem', () => {
    const covers = pickLatestExistingCover(
      [
        { atlasProjectId: 'a', absPath: 'sumiu.webp', createdAt: '2026-11-16T12:00:00.000Z' },
        { atlasProjectId: 'a', absPath: 'ainda.webp', createdAt: '2026-11-16T11:00:00.000Z' },
        { atlasProjectId: 'vazio', absPath: '   ', createdAt: '2026-11-16T13:00:00.000Z' },
      ],
      (absPath) => absPath === 'ainda.webp',
    )
    expect(covers.get('a')).toBe('ainda.webp')
    expect(covers.has('vazio')).toBe(false)
  })
})
