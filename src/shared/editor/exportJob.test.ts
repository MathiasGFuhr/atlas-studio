import { describe, expect, it } from 'vitest'
import {
  applyEditorExportProgress,
  clampExportPercent,
  formatExportBarLabel,
  isExportJobInFlight,
  pickPrimaryExportBarJob,
  type EditorExportJob,
} from './exportJob'

function makeJob(overrides: Partial<EditorExportJob> = {}): EditorExportJob {
  return {
    projectId: 'proj-1',
    projectName: 'Clipe Principal',
    mode: 'single',
    status: 'picking',
    percent: null,
    message: 'Escolhendo destino...',
    outputPath: null,
    error: null,
    updatedAt: 100,
    ...overrides,
  }
}

describe('editor exportJob helpers', () => {
  it('limita porcentagem entre 0 e 100 arredondada', () => {
    expect(clampExportPercent(null)).toBe(0)
    expect(clampExportPercent(-5)).toBe(0)
    expect(clampExportPercent(42.6)).toBe(43)
    expect(clampExportPercent(140)).toBe(100)
  })

  it('ignora eventos do makeShort para não colidir com a exportação principal', () => {
    const initial = { 'proj-1': makeJob({ status: 'rendering', percent: 35 }) }
    const next = applyEditorExportProgress(
      initial,
      {
        projectId: 'proj-1',
        kind: 'short',
        stage: 'rendering',
        percent: 90,
        message: 'Gerando Short... 90%',
      },
      200,
    )
    expect(next).toBe(initial)
  })

  it('transiciona picking -> rendering -> done preservando nome e modo do projeto', () => {
    const initial = { 'proj-1': makeJob({ mode: 'clips', projectName: 'Show Ao Vivo' }) }
    const rendering = applyEditorExportProgress(
      initial,
      {
        projectId: 'proj-1',
        kind: 'clips',
        stage: 'rendering',
        percent: 48,
        message: 'Exportando cena 2 de 4...',
      },
      200,
    )
    expect(rendering['proj-1']).toMatchObject({
      projectName: 'Show Ao Vivo',
      mode: 'clips',
      status: 'rendering',
      percent: 48,
      message: 'Exportando cena 2 de 4...',
    })
    expect(isExportJobInFlight(rendering['proj-1'])).toBe(true)

    const done = applyEditorExportProgress(
      rendering,
      {
        projectId: 'proj-1',
        kind: 'clips',
        stage: 'done',
        percent: 100,
        message: '4 cenas exportadas.',
        outputPath: 'C:/videos/cenas',
      },
      300,
    )
    expect(done['proj-1']).toMatchObject({
      status: 'done',
      percent: 100,
      outputPath: 'C:/videos/cenas',
    })
    expect(isExportJobInFlight(done['proj-1'])).toBe(false)
  })

  it('não regride um job já finalizado com evento atrasado de rendering', () => {
    const initial = { 'proj-1': makeJob({ status: 'done', percent: 100, outputPath: 'C:/out.mp4' }) }
    const next = applyEditorExportProgress(
      initial,
      {
        projectId: 'proj-1',
        kind: 'video',
        stage: 'rendering',
        percent: 99,
        message: 'Exportando... 99%',
      },
      400,
    )
    expect(next).toBe(initial)
  })

  it('prioriza exportações ativas na barra superior e ignora picking', () => {
    const pickingOnly = pickPrimaryExportBarJob({
      'proj-1': makeJob({ status: 'picking' }),
    })
    expect(pickingOnly).toEqual({ primary: null, activeCount: 0 })

    const mixed = pickPrimaryExportBarJob({
      'proj-done': makeJob({ projectId: 'proj-done', status: 'done', percent: 100, updatedAt: 500 }),
      'proj-run-1': makeJob({ projectId: 'proj-run-1', status: 'rendering', percent: 25, updatedAt: 200 }),
      'proj-run-2': makeJob({ projectId: 'proj-run-2', status: 'rendering', percent: 60, updatedAt: 300 }),
    })
    expect(mixed.primary?.projectId).toBe('proj-run-2')
    expect(mixed.activeCount).toBe(2)
  })

  it('gera rótulos claros por status e modo', () => {
    expect(formatExportBarLabel(makeJob({ status: 'rendering', mode: 'single' }))).toBe('Exportando vídeo')
    expect(formatExportBarLabel(makeJob({ status: 'rendering', mode: 'clips' }))).toBe('Exportando cenas')
    expect(formatExportBarLabel(makeJob({ status: 'done', mode: 'single' }))).toBe('Vídeo exportado')
    expect(formatExportBarLabel(makeJob({ status: 'failed', mode: 'clips' }))).toBe('Falha ao exportar cenas')
  })
})

