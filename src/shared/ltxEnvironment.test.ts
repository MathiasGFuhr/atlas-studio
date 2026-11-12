import { describe, expect, it } from 'vitest'
import {
  auditLtxWorkflowEvidence,
  buildLtxPrepReadiness,
  evaluateGpuFailover,
  normalizeLtxEnvironmentPlan,
  LTX_IA2V_OFFICIAL_MODEL_ASSETS,
  DEFAULT_LTX_ENVIRONMENT_PLAN,
} from './ltxEnvironment'
import { LTX_MINIMUM_VRAM_GB } from './runpodLtxCompat'

describe('normalizeLtxEnvironmentPlan', () => {
  it('força dryRunOnly e porta 8188', () => {
    const plan = normalizeLtxEnvironmentPlan({
      dryRunOnly: false,
      containerPort: 9000 as never,
      primaryGpuId: 'NVIDIA RTX PRO 4500 Blackwell',
      alternateGpuIds: ['NVIDIA RTX A6000', ''],
      maxUsdPerHour: 1.2,
    })
    expect(plan.dryRunOnly).toBe(true)
    expect(plan.containerPort).toBe(8188)
    expect(plan.primaryGpuId).toBe('NVIDIA RTX PRO 4500 Blackwell')
    expect(plan.alternateGpuIds).toEqual(['NVIDIA RTX A6000', null])
    expect(plan.maxUsdPerHour).toBe(1.2)
    expect(plan.minVramGb).toBe(LTX_MINIMUM_VRAM_GB)
  })

  it('preserva defaults seguros', () => {
    expect(normalizeLtxEnvironmentPlan(null)).toMatchObject({
      dryRunOnly: true,
      storageStrategy: 'undecided',
      templateImage: DEFAULT_LTX_ENVIRONMENT_PLAN.templateImage,
    })
  })
})

describe('auditLtxWorkflowEvidence', () => {
  it('marca arquivo ausente no repo e lista class_types do workflow importado', () => {
    const evidence = auditLtxWorkflowEvidence(
      {
        '1': { class_type: 'LoadImage', inputs: { image: 'a.png' } },
        '2': { class_type: 'TextGenerateLTX2Prompt', inputs: { prompt: 'x' } },
      },
      'video_ltx2_3_ia2v.json',
    )
    expect(evidence.find((item) => item.id === 'workflow-file-in-repo')?.value).toBe('ausente')
    expect(evidence.find((item) => item.id === 'ltx-marker')?.value).toBe('presente')
    expect(evidence.find((item) => item.id === 'native-ltx')?.evidence).toBe('confirmed_official_docs')
  })
})

describe('evaluateGpuFailover', () => {
  it('avalia VRAM e teto de preço', () => {
    const plan = normalizeLtxEnvironmentPlan({
      primaryGpuId: 'NVIDIA RTX PRO 4500 Blackwell',
      alternateGpuIds: ['NVIDIA RTX PRO 4500 Blackwell Server Edition', null],
      minVramGb: 16,
      maxUsdPerHour: 0.5,
      preferredCloud: 'SECURE',
    })
    const rows = evaluateGpuFailover(plan, [
      {
        id: 'NVIDIA RTX PRO 4500 Blackwell',
        name: 'PRO 4500',
        memoryGb: 32,
        securePrice: 0.44,
        communityPrice: 0.3,
        availability: 'HIGH',
      },
      {
        id: 'NVIDIA RTX PRO 4500 Blackwell Server Edition',
        name: 'PRO 4500 SE',
        memoryGb: 32,
        securePrice: 0.7,
        communityPrice: 0.4,
        availability: 'LOW',
      },
    ])
    expect(rows[0].fitsVram).toBe(true)
    expect(rows[0].fitsBudget).toBe(true)
    expect(rows[1].fitsBudget).toBe(false)
  })

  it('troca PRO 4000 / 4090 persistidos pela PRO 4500', () => {
    const plan = normalizeLtxEnvironmentPlan({
      primaryGpuId: 'NVIDIA RTX PRO 4000 Blackwell',
      alternateGpuIds: ['NVIDIA GeForce RTX 4090', null],
    })
    expect(plan.primaryGpuId).toBe('NVIDIA RTX PRO 4500 Blackwell')
    expect(plan.alternateGpuIds[0]).toBe('NVIDIA RTX PRO 4500 Blackwell Server Edition')
  })
})

describe('buildLtxPrepReadiness', () => {
  it('bloqueia sem volume quando a estratégia é network_volume', () => {
    const readiness = buildLtxPrepReadiness({
      plan: normalizeLtxEnvironmentPlan({
        primaryGpuId: 'NVIDIA RTX PRO 4500 Blackwell',
        storageStrategy: 'network_volume',
        templateTagPinned: true,
        templateImage: 'registry.example/comfy:sha-abc',
      }),
      accountHasNetworkVolume: false,
      workflowPresent: true,
      gpuFailover: [
        {
          priority: 1,
          gpuId: 'NVIDIA RTX PRO 4500 Blackwell',
          memoryGb: 32,
          priceUsd: 0.72,
          availability: 'HIGH',
          fitsBudget: true,
          fitsVram: true,
          dataCenterCompatible: null,
          reasons: [],
        },
        {
          priority: 2,
          gpuId: null,
          memoryGb: null,
          priceUsd: null,
          availability: null,
          fitsBudget: null,
          fitsVram: null,
          dataCenterCompatible: null,
          reasons: [],
        },
        {
          priority: 3,
          gpuId: null,
          memoryGb: null,
          priceUsd: null,
          availability: null,
          fitsBudget: null,
          fitsVram: null,
          dataCenterCompatible: null,
          reasons: [],
        },
      ],
      templatePinned: true,
    })
    expect(readiness.level).toBe('planned')
    expect(readiness.blockers.some((line) => /Network Volume/i.test(line))).toBe(true)
  })
})

describe('LTX_IA2V_OFFICIAL_MODEL_ASSETS', () => {
  it('lista os cinco assets oficiais IA2V', () => {
    expect(LTX_IA2V_OFFICIAL_MODEL_ASSETS).toHaveLength(5)
    expect(LTX_IA2V_OFFICIAL_MODEL_ASSETS.every((asset) => asset.evidence === 'confirmed_official_docs')).toBe(
      true,
    )
  })
})
