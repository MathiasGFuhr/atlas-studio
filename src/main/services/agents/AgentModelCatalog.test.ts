import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { AgentModelCache } from './AgentModelCache'
import { AgentModelCatalog } from './AgentModelCatalog'
import type { AgentModelProvider } from './AgentModelProvider'
import type { AgentModelInfo, AgentProviderId, AgentReasoningEffort } from '../../../shared/agents/types'

function tmpFile() {
  return path.join(os.tmpdir(), `atlas-agent-cache-${Date.now()}-${Math.random().toString(16).slice(2)}.json`)
}

function fakeProvider(
  id: AgentProviderId,
  state: {
    version: string
    auth: string
    models: AgentModelInfo[]
    currentModel: string | null
    currentEffort?: string | null
    efforts?: AgentReasoningEffort[]
    listCalls?: number
    source?: 'cli' | 'none'
    error?: string | null
  },
): AgentModelProvider {
  return {
    id,
    getStatus: async () => ({ version: state.version, connected: true }),
    getVersion: async () => state.version,
    getAuthFingerprint: async () => state.auth,
    getCurrentModel: async () => state.currentModel,
    listModels: async () => {
      state.listCalls = (state.listCalls ?? 0) + 1
      return {
        models: state.models,
        source: state.source ?? 'cli',
        error: state.error ?? null,
      }
    },
    setDefaultModel: async (model) => {
      state.currentModel = model
    },
    listReasoningEfforts: async () => state.efforts ?? [],
    getCurrentReasoningEffort: async () => state.currentEffort ?? null,
    setReasoningEffort: async (effort) => {
      state.currentEffort = effort
    },
  }
}

describe('cache de modelos', () => {
  const files: string[] = []
  afterEach(() => {
    for (const file of files) {
      try {
        fs.unlinkSync(file)
      } catch {
        /* ignore */
      }
    }
  })

  it('reutiliza cache na mesma versão e autenticação', async () => {
    const file = tmpFile()
    files.push(file)
    const state = {
      version: '1.0.0',
      auth: 'user-a',
      models: [{ id: 'alpha', label: 'Alpha' }],
      currentModel: 'alpha',
      listCalls: 0,
    }
    const catalog = new AgentModelCatalog(
      { codex: fakeProvider('codex', state), antigravity: fakeProvider('antigravity', { ...state, models: [] }) },
      new AgentModelCache(file),
    )
    await catalog.get('codex')
    await catalog.get('codex')
    expect(state.listCalls).toBe(1)
  })

  it('invalida quando a versão do CLI muda', async () => {
    const file = tmpFile()
    files.push(file)
    const state = {
      version: '1.0.0',
      auth: 'user-a',
      models: [{ id: 'alpha', label: 'Alpha' }],
      currentModel: 'alpha',
      listCalls: 0,
    }
    const provider = fakeProvider('codex', state)
    const catalog = new AgentModelCatalog(
      { codex: provider, antigravity: fakeProvider('antigravity', { ...state, models: [] }) },
      new AgentModelCache(file),
    )
    await catalog.get('codex')
    state.version = '1.1.0'
    state.models = [{ id: 'beta', label: 'Beta' }]
    const next = await catalog.get('codex')
    expect(state.listCalls).toBe(2)
    expect(next.models.map((model) => model.id)).toEqual(['beta'])
  })

  it('Atualizar modelos força nova descoberta', async () => {
    const file = tmpFile()
    files.push(file)
    const state = {
      version: '1.0.0',
      auth: 'user-a',
      models: [{ id: 'alpha', label: 'Alpha' }],
      currentModel: 'alpha',
      listCalls: 0,
    }
    const catalog = new AgentModelCatalog(
      { codex: fakeProvider('codex', state), antigravity: fakeProvider('antigravity', { ...state, models: [] }) },
      new AgentModelCache(file),
    )
    await catalog.get('codex')
    await catalog.refresh('codex')
    expect(state.listCalls).toBe(2)
  })
})

describe('troca e reconexão', () => {
  it('troca o modelo padrão sem alterar a lista descoberta', async () => {
    const file = tmpFile()
    const state = {
      version: '1.0.0',
      auth: 'user-a',
      models: [
        { id: 'alpha', label: 'Alpha' },
        { id: 'beta', label: 'Beta' },
      ],
      currentModel: 'alpha' as string | null,
      listCalls: 0,
    }
    const catalog = new AgentModelCatalog(
      { codex: fakeProvider('codex', state), antigravity: fakeProvider('antigravity', { ...state, models: [] }) },
      new AgentModelCache(file),
    )
    await catalog.get('codex')
    const next = await catalog.setDefaultModel('codex', 'beta')
    expect(next.currentModel).toBe('beta')
    expect(next.models.map((model) => model.id)).toEqual(['alpha', 'beta'])
    fs.unlinkSync(file)
  })

  it('marca modelo configurado que sumiu do catálogo', async () => {
    const file = tmpFile()
    const state = {
      version: '1.0.0',
      auth: 'user-a',
      models: [{ id: 'alive', label: 'Alive' }],
      currentModel: 'removed' as string | null,
      listCalls: 0,
    }
    const catalog = new AgentModelCatalog(
      { codex: fakeProvider('codex', state), antigravity: fakeProvider('antigravity', { ...state, models: [] }) },
      new AgentModelCache(file),
    )
    const snapshot = await catalog.get('codex')
    expect(snapshot.configuredModelMissing).toBe(true)
    expect(snapshot.currentModel).toBe('removed')
    expect(snapshot.models.map((model) => model.id)).toEqual(['alive'])
    fs.unlinkSync(file)
  })

  it('CLI indisponível não quebra o catálogo', async () => {
    const file = tmpFile()
    const state = {
      version: null as unknown as string,
      auth: 'none',
      models: [] as AgentModelInfo[],
      currentModel: 'still-configured' as string | null,
      listCalls: 0,
      source: 'none' as const,
      error: 'Não foi possível carregar os modelos.',
    }
    const catalog = new AgentModelCatalog(
      {
        codex: fakeProvider('codex', state),
        antigravity: fakeProvider('antigravity', { ...state, currentModel: null }),
      },
      new AgentModelCache(file),
    )
    const snapshot = await catalog.get('codex')
    expect(snapshot.models).toEqual([])
    expect(snapshot.error).toBe('Não foi possível carregar os modelos.')
    expect(snapshot.currentModel).toBe('still-configured')
    fs.unlinkSync(file)
  })

  it('reconexão (auth diferente) dispara nova descoberta', async () => {
    const file = tmpFile()
    const state = {
      version: '1.0.0',
      auth: 'before',
      models: [{ id: 'old', label: 'Old' }],
      currentModel: 'old' as string | null,
      listCalls: 0,
    }
    const catalog = new AgentModelCatalog(
      { codex: fakeProvider('codex', state), antigravity: fakeProvider('antigravity', { ...state, models: [] }) },
      new AgentModelCache(file),
    )
    await catalog.get('codex')
    state.auth = 'after-login'
    state.models = [{ id: 'new', label: 'New' }]
    const snapshot = await catalog.get('codex')
    expect(state.listCalls).toBe(2)
    expect(snapshot.models[0]?.id).toBe('new')
    fs.unlinkSync(file)
  })
})
