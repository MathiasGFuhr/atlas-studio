import { describe, expect, it } from 'vitest'
import { normalizeLtxEnvironmentPlan } from './ltxEnvironment'
import { buildLtxMigrationPlan, RUNPOD_NETWORK_VOLUME_USD_PER_GB_MONTH_ESTIMATE } from './ltxMigration'
import { analyzeLtxWorkflow } from './ltxWorkflowAnalysis'

describe('buildLtxMigrationPlan', () => {
  it('estima custo de armazenamento e preserva Pods existentes', () => {
    const plan = normalizeLtxEnvironmentPlan({
      storageStrategy: 'network_volume',
      networkVolumeSizeGb: 100,
      preferredDataCenterId: 'US-KS-2',
    })
    const migration = buildLtxMigrationPlan({
      plan,
      pods: [
        {
          id: 'a',
          name: 'p1',
          status: 'EXITED',
          gpuType: null,
          gpuMemoryGb: null,
          dataCenterId: 'US-KS-2',
          ports: [],
          costPerHr: null,
          cloud: null,
          hasComfyPort: false,
          comfyProxyUrl: null,
          actions: [],
          locked: false,
          image: null,
          networkMounts: [],
        },
      ],
      networkVolumes: [],
      workflowAnalysis: analyzeLtxWorkflow({
        '1': {
          class_type: 'CheckpointLoaderSimple',
          inputs: { ckpt_name: 'ltx-2.3-22b-dev-fp8.safetensors' },
        },
      }),
    })

    expect(migration.dryRun).toBe(true)
    expect(migration.preserveExistingPods).toBe(true)
    expect(migration.existingPodIds).toEqual(['a'])
    expect(migration.storageCost.estimatedStorageUsdPerMonth).toBe(
      Math.round(100 * RUNPOD_NETWORK_VOLUME_USD_PER_GB_MONTH_ESTIMATE * 100) / 100,
    )
    expect(migration.storageCost.requiresExplicitApproval).toBe(true)
    expect(migration.steps.some((step) => step.id === 'create-network-volume' && step.paid)).toBe(true)
    expect(migration.apiCaveats.some((line) => /Migrate/i.test(line))).toBe(true)
  })
})
