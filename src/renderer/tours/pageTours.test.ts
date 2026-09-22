import { describe, expect, it } from 'vitest'
import { matchPageTour } from './pageTours'

describe('matchPageTour', () => {
  it('reconhece as telas principais', () => {
    expect(matchPageTour('/historia')).toBe('history-projects')
    expect(matchPageTour('/historia/projetos/abc')).toBe('history-project')
    expect(matchPageTour('/historia/criar')).toBe('create-script')
    expect(matchPageTour('/historia/roteiros')).toBe('scripts')
    expect(matchPageTour('/historia/roteiros/abc')).toBe('script-detail')
    expect(matchPageTour('/historia/nichos')).toBe('niches')
    expect(matchPageTour('/musica')).toBe('music-projects')
    expect(matchPageTour('/musica/faixas')).toBe('music-tracks')
    expect(matchPageTour('/musica/faixas/abc')).toBe('music-editor')
    expect(matchPageTour('/musica/prompts')).toBe('prompts')
    expect(matchPageTour('/canais')).toBe('channels')
    expect(matchPageTour('/canais/agenda')).toBe('channel-agenda')
    expect(matchPageTour('/canais/publicados')).toBe('channel-published')
    expect(matchPageTour('/canais/canal-1')).toBe('channel-calendar')
    expect(matchPageTour('/canais/canal-1/videos/video-1')).toBe('channel-calendar')
    expect(matchPageTour('/shorts')).toBe('shorts-projects')
    expect(matchPageTour('/shorts/job-1')).toBe('shorts-studio')
    expect(matchPageTour('/tarefas')).toBe('tasks')
    expect(matchPageTour('/configuracoes')).toBe('settings')
  })

  it('ignora o início e rotas desconhecidas', () => {
    expect(matchPageTour('/')).toBeNull()
    expect(matchPageTour('/chat')).toBeNull()
  })
})
