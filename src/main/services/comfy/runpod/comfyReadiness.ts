import type { ComfyApiWorkflow, ComfyConnectionInfo } from '../../../../shared/comfy'
import {
  evaluateComfyNodeReadiness,
  workflowRequiredClassTypes,
  type ComfyNodeReadiness,
} from '../../../../shared/runpodLtxCompat'
import { ComfyClient } from '../ComfyClient'

export type ComfyReadinessResult = {
  connection: ComfyConnectionInfo
  nodes: ComfyNodeReadiness
}

export async function probeComfyLtxReadiness(
  baseUrl: string,
  workflow: ComfyApiWorkflow | null,
  options?: {
    createClient?: (url: string) => {
      systemStats(): Promise<ComfyConnectionInfo>
      listObjectInfoClassTypes(): Promise<string[]>
    }
  },
): Promise<ComfyReadinessResult> {
  const client = options?.createClient?.(baseUrl) ?? new ComfyClient(baseUrl)
  const connection = await client.systemStats()
  if (!connection.ok) {
    return {
      connection,
      nodes: {
        ok: false,
        present: [],
        missing: workflowRequiredClassTypes(workflow),
        hasLtxMarker: false,
        message: connection.message,
      },
    }
  }

  let classTypes: string[] = []
  try {
    classTypes = await client.listObjectInfoClassTypes()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      connection,
      nodes: {
        ok: false,
        present: [],
        missing: workflowRequiredClassTypes(workflow),
        hasLtxMarker: false,
        message: `ComfyUI respondeu, mas /object_info falhou: ${message}`,
      },
    }
  }

  return {
    connection,
    nodes: evaluateComfyNodeReadiness(classTypes, workflowRequiredClassTypes(workflow)),
  }
}
