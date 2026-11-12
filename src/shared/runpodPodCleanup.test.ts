import { describe, expect, it } from 'vitest'
import {
  findSupersededRunpodPods,
  isMigrationPodName,
  runpodPodBaseName,
} from './runpodPodCleanup'
import type { RunpodPodSummary } from './runpod'

function pod(partial: Partial<RunpodPodSummary> & Pick<RunpodPodSummary, 'id' | 'name'>): RunpodPodSummary {
  return {
    status: 'EXITED',
    gpuType: 'NVIDIA RTX PRO 4500 Blackwell',
    gpuMemoryGb: 32,
    dataCenterId: 'EU-RO-1',
    ports: ['8188/http'],
    costPerHr: 0.72,
    cloud: 'SECURE',
    hasComfyPort: true,
    comfyProxyUrl: null,
    actions: ['start', 'terminate'],
    locked: false,
    image: 'comfy',
    networkMounts: [],
    ...partial,
  }
}

describe('runpodPodCleanup', () => {
  it('extrai base e detecta migration', () => {
    expect(runpodPodBaseName('exotic_beige_junglefowl-migration')).toBe('exotic_beige_junglefowl')
    expect(isMigrationPodName('exotic_beige_junglefowl-migration')).toBe(true)
    expect(isMigrationPodName('exotic_beige_junglefowl')).toBe(false)
  })

  it('marca o Pod antigo quando existe *-migration', () => {
    const rows = findSupersededRunpodPods(
      [
        pod({ id: 'old', name: 'exotic_beige_junglefowl' }),
        pod({ id: 'mig', name: 'exotic_beige_junglefowl-migration' }),
      ],
      'mig',
    )
    expect(rows.map((row) => row.id)).toEqual(['old'])
  })

  it('não remove o Pod mantido nem RUNNING', () => {
    const rows = findSupersededRunpodPods(
      [
        pod({ id: 'old', name: 'exotic_beige_junglefowl', status: 'RUNNING' }),
        pod({ id: 'mig', name: 'exotic_beige_junglefowl-migration' }),
      ],
      'old',
    )
    expect(rows).toHaveLength(0)
  })
})
