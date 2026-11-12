import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { normalizeLtxEnvironmentPlan } from '../../../../shared/ltxEnvironment'
import { RunpodClientV2 } from './RunpodClientV2'
import { validateLtxPhase4 } from './ltxPhase4Service'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('validateLtxPhase4', () => {
  it('exporta workflow real, inventaria com mock e não muta a API RunPod', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-ltx4-'))
    const methods: string[] = []
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      methods.push(method)
      const url = String(input)
      if (url.includes('/v2/pods')) {
        return jsonResponse({
          pods: [
            {
              id: 'pod1',
              name: 'ComfyUI LTX',
              status: 'EXITED',
              ports: ['8188/http'],
              gpu: { id: 'NVIDIA GeForce RTX 4090', memory: 24 },
              dataCenterId: 'US-KS-2',
              cost: 0.44,
              actions: ['start'],
            },
          ],
          pagination: { nextCursor: null, hasNextPage: false },
        })
      }
      if (url.includes('/v2/catalog/gpus')) {
        return jsonResponse({
          gpus: [
            {
              id: 'NVIDIA GeForce RTX 4090',
              name: 'RTX 4090',
              memory: 24,
              price: { secure: 0.44 },
              availability: 'HIGH',
            },
            {
              id: 'NVIDIA RTX A5000',
              name: 'A5000',
              memory: 24,
              price: { secure: 0.36 },
              availability: 'HIGH',
            },
          ],
        })
      }
      if (url.includes('/v2/network-volumes')) {
        return jsonResponse({ networkVolumes: [], pagination: { nextCursor: null, hasNextPage: false } })
      }
      return jsonResponse({}, 404)
    })

    const workflow = {
      '269': { class_type: 'LoadImage', inputs: { image: 'a.png' } },
      '340:317': {
        class_type: 'CheckpointLoaderSimple',
        inputs: { ckpt_name: 'ltx-2.3-22b-dev-fp8.safetensors' },
      },
      '340:319': { class_type: 'TextGenerateLTX2Prompt', inputs: { value: 'x' } },
    }

    const status = await validateLtxPhase4({
      getApiKey: () => 'test-key',
      getPlan: () =>
        normalizeLtxEnvironmentPlan({
          primaryGpuId: 'NVIDIA GeForce RTX 4090',
          alternateGpuIds: ['NVIDIA RTX A5000', null],
          storageStrategy: 'network_volume',
          networkVolumeSizeGb: 80,
          maxUsdPerHour: 1,
          preferredDataCenterId: 'US-KS-2',
        }),
      getWorkflowName: () => 'video_ltx2_3_ia2v.json',
      getWorkflow: () => workflow,
      getComfyBaseUrl: () => 'https://example.runpod.net',
      getPreferredPodId: () => 'pod1',
      resourcesDir: dir,
      writeExportFiles: true,
      createClient: (apiKey) =>
        new RunpodClientV2({ apiKey, fetchFn: fetchFn as unknown as typeof fetch, maxRetries: 0 }),
      inspectInventory: async () => ({
        dryRun: true,
        mutationCalls: 0,
        accessible: false,
        baseUrl: 'https://example.runpod.net',
        pendingChecks: ['Pod inacessível no mock'],
        system: {
          comfyuiVersion: null,
          pytorchVersion: null,
          pythonVersion: null,
          os: null,
          gpuName: null,
          vramTotalGb: null,
        },
        classTypes: {
          availableCount: 0,
          requiredPresent: [],
          requiredMissing: [],
          hasLtxMarker: false,
          message: 'mock offline',
        },
        models: [],
        modelFoldersAvailable: [],
        notes: ['mock'],
      }),
    })

    expect(status.phase).toBe(4)
    expect(status.dryRun).toBe(true)
    expect(status.mutationCalls).toBe(0)
    expect(status.advancedToPhase5).toBe(false)
    expect(methods.every((method) => method === 'GET')).toBe(true)
    expect(status.workflowExport.ok).toBe(true)
    expect(status.workflowExport.nodeCount).toBe(3)
    expect(fs.existsSync(path.join(dir, 'exported-workflow-from-sqlite.json'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'Dockerfile'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'requirements.manifest.txt'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'template.manifest.json'))).toBe(true)
    expect(status.controlledLipsyncTest.status).toBe('blocked_until_approval')
    expect(status.controlledLipsyncTest.enabled).toBe(false)
    expect(status.paidActionsRequiringApproval.length).toBeGreaterThan(0)
    expect(status.migration.preserveExistingPods).toBe(true)
    expect(status.inventory.accessible).toBe(false)
  })
})
