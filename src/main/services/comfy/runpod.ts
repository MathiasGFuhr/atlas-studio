import {
  COMFY_RUNPOD_PORT,
  comfyRunpodProxyUrl,
  pickRunpodComfyPod,
  podIdFromComfyUrl,
  type RunpodPodCandidate,
} from '../../../shared/comfy'

const GRAPHQL_URL = 'https://api.runpod.io/graphql'
const REST_PODS_URL = 'https://rest.runpod.io/v1/pods?desiredStatus=RUNNING'
const PODS_QUERY = `{ myself { pods { id name desiredStatus runtime { ports { privatePort type } } } } }`

type GraphQlPod = RunpodPodCandidate

type GraphQlResponse = {
  data?: { myself?: { pods?: GraphQlPod[] | null } | null }
  errors?: Array<{ message?: string }>
}

type RestPod = {
  id?: string
  name?: string
  desiredStatus?: string
  ports?: string[]
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
}

function describeApiError(status: number, body: string): string {
  if (status === 401 || status === 403) return 'Chave da API do RunPod inválida.'
  const trimmed = body.replace(/\s+/g, ' ').trim().slice(0, 180)
  return trimmed ? `A API do RunPod respondeu ${status}: ${trimmed}` : `A API do RunPod respondeu ${status}.`
}

function podsFromRest(rows: RestPod[]): RunpodPodCandidate[] {
  return rows
    .filter((row) => row.id)
    .map((row) => ({
      id: row.id!,
      name: row.name || row.id!,
      desiredStatus: row.desiredStatus ?? 'RUNNING',
      runtime: {
        ports: (row.ports ?? []).map((entry) => {
          const [port, type] = entry.split('/')
          return { privatePort: Number(port), type: type || 'http' }
        }),
      },
    }))
}

async function listPodsFromGraphQl(apiKey: string): Promise<RunpodPodCandidate[]> {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({ query: PODS_QUERY }),
    signal: AbortSignal.timeout(15_000),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(describeApiError(response.status, text))
  let payload: GraphQlResponse
  try {
    payload = JSON.parse(text) as GraphQlResponse
  } catch {
    throw new Error('A API do RunPod devolveu uma resposta inválida.')
  }
  const message = payload.errors?.[0]?.message?.trim()
  if (message) {
    if (/unauth|invalid.*key|api key/i.test(message)) throw new Error('Chave da API do RunPod inválida.')
    throw new Error(message)
  }
  if (!payload.data?.myself) throw new Error('Chave da API do RunPod inválida.')
  return payload.data.myself.pods ?? []
}

async function listPodsFromRest(apiKey: string): Promise<RunpodPodCandidate[]> {
  const response = await fetch(REST_PODS_URL, {
    headers: authHeaders(apiKey),
    signal: AbortSignal.timeout(15_000),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(describeApiError(response.status, text))
  const payload = JSON.parse(text) as RestPod[] | { pods?: RestPod[] }
  const rows = Array.isArray(payload) ? payload : payload.pods
  if (!Array.isArray(rows)) throw new Error('A API do RunPod devolveu uma lista inválida.')
  return podsFromRest(rows)
}

export async function listRunpodPods(apiKey: string): Promise<RunpodPodCandidate[]> {
  try {
    return await listPodsFromGraphQl(apiKey)
  } catch (graphqlError) {
    try {
      return await listPodsFromRest(apiKey)
    } catch {
      throw graphqlError
    }
  }
}

export async function resolveRunpodComfyUrl(
  apiKey: string,
  currentUrl = '',
): Promise<{ baseUrl: string; podId: string; podName: string }> {
  const pods = await listRunpodPods(apiKey.trim())
  const picked = pickRunpodComfyPod(pods, podIdFromComfyUrl(currentUrl))
  if (!picked) {
    throw new Error(
      `Nenhum pod ligado com a porta ${COMFY_RUNPOD_PORT} (ComfyUI). Ligue o pod no RunPod e tente de novo.`,
    )
  }
  return {
    baseUrl: comfyRunpodProxyUrl(picked.id, picked.port),
    podId: picked.id,
    podName: picked.name,
  }
}
