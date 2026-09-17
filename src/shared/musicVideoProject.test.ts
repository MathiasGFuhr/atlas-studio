import { describe, expect, it } from 'vitest'
import {
  findUnequivocalMusicProject,
  musicNamesMatchUnequivocally,
  resolveMusicProjectName,
  type MusicProjectMatchCandidate,
} from './musicVideoProject'

function project(
  partial: Partial<MusicProjectMatchCandidate> & Pick<MusicProjectMatchCandidate, 'id' | 'name'>,
): MusicProjectMatchCandidate {
  return {
    channelId: 'ch-falk',
    folderPath: null,
    linkedVideoId: null,
    ...partial,
  }
}

describe('musicVideoProject', () => {
  it('prefere o nome real da música ao título editorial', () => {
    expect(
      resolveMusicProjectName({
        title: 'Diese Worte trafen das ganze Festival | HEILIGE LÜGEN',
        songTitle: 'HEILIGE LÜGEN',
      }),
    ).toBe('HEILIGE LÜGEN')
  })

  it('usa o título do vídeo quando não há songTitle', () => {
    expect(resolveMusicProjectName({ title: '  HEILIGE LÜGEN  ' })).toBe('HEILIGE LÜGEN')
  })

  it('casa nomes iguais ignorando maiúsculas e espaços', () => {
    expect(musicNamesMatchUnequivocally('HEILIGE LÜGEN', 'heilige  lügen')).toBe(true)
    expect(
      musicNamesMatchUnequivocally(
        'HEILIGE LÜGEN',
        'Diese Worte trafen das ganze Festival | HEILIGE LÜGEN',
      ),
    ).toBe(false)
  })

  it('vincula quando há um único projeto do mesmo canal com o mesmo nome', () => {
    const matched = findUnequivocalMusicProject(
      { title: 'HEILIGE LÜGEN', channelId: 'ch-falk' },
      [project({ id: 'p1', name: 'HEILIGE LÜGEN' })],
    )
    expect(matched?.id).toBe('p1')
  })

  it('não cria casamento quando dois projetos do canal têm o mesmo nome', () => {
    const matched = findUnequivocalMusicProject(
      { title: 'HEILIGE LÜGEN', channelId: 'ch-falk' },
      [
        project({ id: 'p1', name: 'HEILIGE LÜGEN' }),
        project({ id: 'p2', name: 'HEILIGE LÜGEN' }),
      ],
    )
    expect(matched).toBeNull()
  })

  it('não casa projeto de outro canal mesmo com o mesmo nome', () => {
    const matched = findUnequivocalMusicProject(
      { title: 'HEILIGE LÜGEN', channelId: 'ch-falk' },
      [project({ id: 'p1', name: 'HEILIGE LÜGEN', channelId: 'ch-other' })],
    )
    expect(matched).toBeNull()
  })

  it('ignora projeto que já possui publicação', () => {
    const matched = findUnequivocalMusicProject(
      { title: 'HEILIGE LÜGEN', channelId: 'ch-falk' },
      [project({ id: 'p1', name: 'HEILIGE LÜGEN', linkedVideoId: 'v-old' })],
    )
    expect(matched).toBeNull()
  })

  it('casa pela pasta física quando o caminho é inequívoco', () => {
    const matched = findUnequivocalMusicProject(
      {
        title: 'Título editorial diferente',
        channelId: 'ch-falk',
        folderPath: 'D:\\Musica\\Heilige Luegen',
      },
      [
        project({
          id: 'p1',
          name: 'HEILIGE LÜGEN',
          folderPath: 'D:/Musica/Heilige Luegen',
        }),
      ],
    )
    expect(matched?.id).toBe('p1')
  })

  it('casa projeto sem canal quando o nome é único', () => {
    const matched = findUnequivocalMusicProject(
      { title: 'HEILIGE LÜGEN', channelId: 'ch-falk' },
      [project({ id: 'p1', name: 'HEILIGE LÜGEN', channelId: null })],
    )
    expect(matched?.id).toBe('p1')
  })
})
