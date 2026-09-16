import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ScriptRecord, ScriptVersion } from '../../../shared/types'
import { resolveAdjustInstruction } from '../../../shared/adjustInstructions'
import { assertCanCreateScript } from '../scripts/scriptMutationGuard'

type Store = {
  scripts: Map<string, ScriptRecord>
  versions: Map<string, ScriptVersion[]>
}

const { store } = vi.hoisted(() => {
  const store: Store = {
    scripts: new Map(),
    versions: new Map(),
  }
  return { store }
})

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
}))

vi.mock('../logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../../db/database', () => ({
  getDb: () => ({
    prepare: () => ({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(() => []),
    }),
  }),
}))

vi.mock('../../repositories/settingsRepository', () => ({
  settingsRepository: {
    get: () => ({
      defaultOutputStyle: 'profissional',
      finalAuditEnabled: false,
      codexModel: 'gpt-5.6-sol',
    }),
  },
}))

vi.mock('../../repositories/projectRepository', () => ({
  projectRepository: {
    get: vi.fn(() => null),
    create: vi.fn((input: { name: string }) => ({
      id: 'project-1',
      name: input.name,
      projectType: 'history',
    })),
    touch: vi.fn(),
  },
}))

vi.mock('../../repositories/generationRunRepository', () => ({
  generationRunRepository: {
    updateStatus: vi.fn(),
    listInterrupted: vi.fn(() => []),
    markInterruptedAbandoned: vi.fn(),
  },
}))

vi.mock('../memory/EditorialMemoryService', () => ({
  EditorialMemoryService: {
    buildCompactEditorialContext: () => 'memória',
    recordApprovedEpisode: vi.fn(),
    getRecentScriptsFromFolder: () => [],
  },
}))

vi.mock('./transport', () => ({
  buildStatus: (partial: Record<string, unknown>) => ({
    connected: false,
    authenticated: false,
    authState: 'not_authenticated',
    account: null,
    model: null,
    message: '',
    lastCheckedAt: new Date().toISOString(),
    ...partial,
  }),
  detectCodexTransport: vi.fn(),
  runCodexPrompt: vi.fn(),
}))

vi.mock('../skills/SkillResolver', () => ({
  resolveSkillForNiche: vi.fn(),
}))

vi.mock('../../repositories/scriptRepository', () => {
  function latest(scriptId: string): ScriptVersion | null {
    const list = store.versions.get(scriptId) ?? []
    return list.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0] ?? null
  }

  return {
    scriptRepository: {
      get(id: string) {
        return store.scripts.get(id) ?? null
      },
      count() {
        return store.scripts.size
      },
      listByNiche() {
        return Array.from(store.scripts.values())
      },
      versions(scriptId: string) {
        return (store.versions.get(scriptId) ?? [])
          .slice()
          .sort((a, b) => b.versionNumber - a.versionNumber)
      },
      getVersion(scriptId: string, versionId: string) {
        return (store.versions.get(scriptId) ?? []).find((v) => v.id === versionId) ?? null
      },
      latestVersion(scriptId: string) {
        return latest(scriptId)
      },
      create(input: Omit<ScriptRecord, 'id' | 'createdAt' | 'updatedAt'> & { folderPath?: string }) {
        assertCanCreateScript()
        const id = `script-${store.scripts.size + 1}`
        const timestamp = new Date().toISOString()
        const script: ScriptRecord = {
          id,
          nicheId: input.nicheId,
          title: input.title,
          topic: input.topic,
          language: input.language,
          content: input.content,
          status: input.status,
          durationMinutes: input.durationMinutes,
          outputStyle: input.outputStyle as ScriptRecord['outputStyle'],
          folderPath: input.folderPath,
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        store.scripts.set(id, script)
        store.versions.set(id, [
          {
            id: `${id}-v1`,
            scriptId: id,
            versionNumber: 1,
            content: input.content,
            adjustmentPrompt: null,
            createdAt: timestamp,
          },
        ])
        return script
      },
      updateContent(
        id: string,
        content: string,
        options?: { status?: ScriptRecord['status']; adjustmentPrompt?: string },
      ) {
        const current = store.scripts.get(id)
        if (!current) return null
        const updated: ScriptRecord = {
          ...current,
          content,
          status: options?.status ?? current.status,
          updatedAt: new Date().toISOString(),
        }
        store.scripts.set(id, updated)
        const list = store.versions.get(id) ?? []
        const versionNumber = (latest(id)?.versionNumber ?? 0) + 1
        list.push({
          id: `${id}-v${versionNumber}`,
          scriptId: id,
          versionNumber,
          content,
          adjustmentPrompt: options?.adjustmentPrompt ?? null,
          createdAt: new Date().toISOString(),
        })
        store.versions.set(id, list)
        return updated
      },
    },
  }
})

import { CodexService } from './CodexService'
import { runCodexPrompt } from './transport'
import { resolveSkillForNiche } from '../skills/SkillResolver'
import { scriptRepository } from '../../repositories/scriptRepository'

const runCodexPromptMock = vi.mocked(runCodexPrompt)
const resolveSkillMock = vi.mocked(resolveSkillForNiche)

function seedPortugueseScript(folder: string): ScriptRecord {
  const v1 =
    '# Como a Prússia Dominou a Alemanha\n\nO reino cresceu sobre decisões, não sobre slogans.\n'
  const script: ScriptRecord = {
    id: 'script-pt-1',
    nicheId: 'niche-1',
    nicheName: 'Histórias Esquecidas',
    title: 'Como a Prússia Dominou a Alemanha e Depois Sumiu do Mapa',
    topic: 'Como a Prússia Dominou a Alemanha e Depois Sumiu do Mapa',
    language: 'Português',
    content: v1,
    status: 'pronto',
    durationMinutes: 15,
    folderPath: folder,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  store.scripts.set(script.id, script)
  store.versions.set(script.id, [
    {
      id: 'ver-1',
      scriptId: script.id,
      versionNumber: 1,
      content: v1,
      adjustmentPrompt: null,
      createdAt: script.createdAt,
    },
  ])
  fs.writeFileSync(path.join(folder, 'script-v1.md'), v1, 'utf8')
  return script
}

describe('adjustScript — revisão sem novo roteiro', () => {
  let tmp: string
  let skillDir: string
  let scriptFolder: string
  let service: CodexService

  beforeEach(() => {
    store.scripts.clear()
    store.versions.clear()
    runCodexPromptMock.mockReset()
    resolveSkillMock.mockReset()
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-adjust-'))
    skillDir = path.join(tmp, 'skill')
    scriptFolder = path.join(tmp, 'gerados', '001-prussia')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.mkdirSync(scriptFolder, { recursive: true })
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# skill\n', 'utf8')

    seedPortugueseScript(scriptFolder)

    resolveSkillMock.mockReturnValue({
      niche: {
        id: 'niche-1',
        name: 'Histórias Esquecidas',
        defaultLanguage: 'Alemão',
        description: '',
        skillPath: skillDir,
        scriptsPath: path.join(tmp, 'roteiros'),
        memoryPath: path.join(tmp, 'memory'),
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      skillPath: skillDir,
      validation: { status: 'valid', path: skillDir, issues: [], warnings: [] },
      metadata: null,
    })

    service = new CodexService({
      workspaceRoot: tmp,
      getWindow: () => null,
      runtimeManager: {
        getStatus: () => ({
          connected: true,
          authenticated: true,
          authState: 'connected' as const,
          account: { email: 't@t.com' },
          model: 'gpt-5.6-sol',
          message: 'Pronto',
          lastCheckedAt: new Date().toISOString(),
        }),
        getBinaryPath: () => 'codex',
      } as never,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('Mais retenção / emoção / curto / ajuste manual versionam o mesmo script em Português', async () => {
    const original = scriptRepository.get('script-pt-1')!
    const v1Content = scriptRepository.versions(original.id).find((v) => v.versionNumber === 1)!
      .content
    const foldersBefore = fs.readdirSync(path.join(tmp, 'gerados'))

    const replies = [
      '# [ABERTURA — UM NOME FORA DO MAPA]\n\nVersão com mais retenção em português.\n',
      '# [ABERTURA — UM NOME FORA DO MAPA]\n\nVersão com mais emoção em português.\n',
      '# [ABERTURA — UM NOME FORA DO MAPA]\n\nVersão mais curta em português.\n',
      '# [ABERTURA — UM NOME FORA DO MAPA]\n\nAbertura fortalecida em português.\n',
    ]
    runCodexPromptMock.mockImplementation(async ({ prompt }) => {
      expect(prompt).toContain('Idioma OBRIGATÓRIO de saída: Português')
      expect(prompt).toContain('Ignore o idioma padrão do nicho')
      expect(prompt).not.toContain('Alemão')
      return replies.shift() ?? 'conteúdo'
    })

    const r2 = await service.adjustScript({
      scriptId: original.id,
      instruction: 'Mais retenção',
    })
    expect(runCodexPromptMock.mock.calls[0][0].prompt).toContain(
      resolveAdjustInstruction('Mais retenção'),
    )
    expect(r2.script.id).toBe(original.id)
    expect(r2.script.language).toBe('Português')
    expect(r2.script.title).toBe(original.title)
    expect(r2.version.versionNumber).toBe(2)
    expect(scriptRepository.count()).toBe(1)
    expect(scriptRepository.versions(original.id).find((v) => v.versionNumber === 1)?.content).toBe(
      v1Content,
    )
    expect(fs.existsSync(path.join(scriptFolder, 'script-v2.md'))).toBe(true)
    expect(fs.readdirSync(path.join(tmp, 'gerados'))).toEqual(foldersBefore)

    const r3 = await service.adjustScript({
      scriptId: original.id,
      instruction: 'Mais emoção',
    })
    expect(r3.script.id).toBe(original.id)
    expect(r3.version.versionNumber).toBe(3)
    expect(r3.script.language).toBe('Português')

    const r4 = await service.adjustScript({
      scriptId: original.id,
      instruction: 'Mais curto',
    })
    expect(r4.script.id).toBe(original.id)
    expect(r4.version.versionNumber).toBe(4)
    expect(r4.script.language).toBe('Português')

    const r5 = await service.adjustScript({
      scriptId: original.id,
      instruction: 'Fortaleça apenas a abertura.',
    })
    expect(r5.script.id).toBe(original.id)
    expect(r5.version.versionNumber).toBe(5)
    expect(r5.script.language).toBe('Português')
    expect(r5.script.title).toBe(original.title)
    expect(r5.script.nicheId).toBe(original.nicheId)
    expect(scriptRepository.count()).toBe(1)
    expect(fs.readdirSync(path.join(tmp, 'gerados'))).toEqual(foldersBefore)
    expect(fs.existsSync(path.join(scriptFolder, 'script-v5.md'))).toBe(true)
    expect(scriptRepository.versions(original.id).find((v) => v.versionNumber === 1)?.content).toBe(
      v1Content,
    )
  })

  it('recusa uma segunda generateScript enquanto outra operação está em andamento', async () => {
    let release!: () => void
    let started!: () => void
    const startedP = new Promise<void>((resolve) => {
      started = resolve
    })
    const blocked = new Promise<string>((resolve) => {
      release = () => resolve('Roteiro gerado em português para o teste de exclusão.')
    })
    runCodexPromptMock.mockImplementationOnce(async () => {
      started()
      return blocked
    })

    const first = service.generateScript({
      nicheId: 'niche-1',
      language: 'Português',
      topic: 'Tema A',
    })
    await startedP

    await expect(
      service.generateScript({
        nicheId: 'niche-1',
        language: 'Alemão',
        topic: 'Tema A',
      }),
    ).rejects.toThrow(/em andamento/)

    release()
    await expect(first).resolves.toBeTruthy()
  })
})
