import { describe, expect, it } from 'vitest'
import {
  readSavedInstrumentalChoices,
  writeSavedInstrumentalChoice,
  writeSavedInstrumentalChoices,
  type StorageLike,
} from './instrumentalChoices'

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
  }
}

describe('instrumentalChoices storage', () => {
  it('salva e restaura marcações por projeto e por pasta', () => {
    const storage = createMemoryStorage()
    writeSavedInstrumentalChoice(
      { projectId: 'proj-1', folderPath: 'D:\\Musicas\\Minha Música\\' },
      1,
      { presetIds: ['violao', 'guitarra'], custom: '' },
      storage,
    )
    writeSavedInstrumentalChoice(
      { projectId: 'proj-1', folderPath: 'D:\\Musicas\\Minha Música\\' },
      2,
      { presetIds: ['banda'], custom: 'sanfona' },
      storage,
    )

    expect(
      readSavedInstrumentalChoices(
        { projectId: 'proj-1', numbers: [1, 2, 3] },
        storage,
      ),
    ).toEqual({
      1: { presetIds: ['violao', 'guitarra'], custom: '' },
      2: { presetIds: ['banda'], custom: 'sanfona' },
    })

    // Mesma pasta com barra/caixa diferentes também recupera as marcações.
    expect(
      readSavedInstrumentalChoices(
        { folderPath: 'd:/musicas/minha música', numbers: [1, 2] },
        storage,
      ),
    ).toEqual({
      1: { presetIds: ['violao', 'guitarra'], custom: '' },
      2: { presetIds: ['banda'], custom: 'sanfona' },
    })
  })

  it('remove a marcação quando a escolha fica vazia', () => {
    const storage = createMemoryStorage()
    writeSavedInstrumentalChoices(
      { projectId: 'proj-1', folderPath: 'C:/Musicas/A' },
      {
        1: { presetIds: ['piano'], custom: '' },
        2: { presetIds: ['baixo'], custom: '' },
      },
      storage,
    )
    writeSavedInstrumentalChoice(
      { projectId: 'proj-1', folderPath: 'C:/Musicas/A' },
      1,
      { presetIds: [], custom: '' },
      storage,
    )

    expect(readSavedInstrumentalChoices({ projectId: 'proj-1' }, storage)).toEqual({
      2: { presetIds: ['baixo'], custom: '' },
    })
  })
})
