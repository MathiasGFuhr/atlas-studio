import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const settingsState = {
  defaultCodexModel: '',
  codexModel: '',
  defaultCodexEffort: '',
  defaultAntigravityModel: '',
  defaultAntigravityEffort: '',
}

vi.mock('../../repositories/settingsRepository', () => ({
  settingsRepository: {
    get: () => ({ ...settingsState }),
    update: (patch: Record<string, unknown>) => Object.assign(settingsState, patch),
  },
}))

import { CodexModelProvider } from './CodexModelProvider'
import { AntigravityModelProvider } from './AntigravityModelProvider'
import { writeConfiguredModel, readConfiguredModel, getCodexConfigPath } from '../codex/codexModels'

describe('CodexModelProvider', () => {
  let home: string

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-codex-home-'))
    process.env.CODEX_HOME = home
    settingsState.defaultCodexModel = ''
    settingsState.codexModel = ''
    settingsState.defaultCodexEffort = ''
  })

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true })
    delete process.env.CODEX_HOME
  })

  it('descobre modelos pelo CLI e lê o modelo atual do config', async () => {
    fs.writeFileSync(path.join(home, 'config.toml'), 'model = "from-config"\nother = true\n', 'utf8')
    const runCli = vi.fn(async (args: string[]) => {
      if (args[0] === 'debug' && args[1] === 'models') {
        return {
          code: 0,
          stdout: JSON.stringify({ models: [{ slug: 'from-cli', display_name: 'From CLI' }] }),
          stderr: '',
        }
      }
      return { code: 1, stdout: '', stderr: 'unknown' }
    })
    const provider = new CodexModelProvider({
      runCli,
      getVersion: () => '0.9.0',
      getAuthFingerprint: () => 'connected:user',
    })
    const listed = await provider.listModels()
    expect(listed.models.map((model) => model.id)).toEqual(['from-cli'])
    expect(listed.source).toBe('cli')
    expect(await provider.getCurrentModel()).toBe('from-config')
  })

  it('troca o modelo preservando o restante do config.toml', async () => {
    fs.writeFileSync(
      path.join(home, 'config.toml'),
      'sandbox_mode = "danger-full-access"\nmodel = "old"\n',
      'utf8',
    )
    const provider = new CodexModelProvider({
      runCli: async () => ({ code: 1, stdout: '', stderr: '' }),
      getVersion: () => '0.9.0',
      getAuthFingerprint: () => 'connected',
    })
    await provider.setDefaultModel('new-model')
    const text = fs.readFileSync(getCodexConfigPath(), 'utf8')
    expect(text).toContain('sandbox_mode = "danger-full-access"')
    expect(readConfiguredModel()).toBe('new-model')
    expect(settingsState.defaultCodexModel).toBe('new-model')
  })

  it('CLI indisponível cai para o config atual', async () => {
    fs.writeFileSync(path.join(home, 'config.toml'), 'model = "only-config"\n', 'utf8')
    const provider = new CodexModelProvider({
      runCli: async () => ({ code: 1, stdout: '', stderr: 'codex: command not found' }),
      getVersion: () => null,
      getAuthFingerprint: () => 'none',
    })
    const listed = await provider.listModels()
    expect(listed.models).toEqual([{ id: 'only-config', label: 'only-config' }])
    expect(listed.source).toBe('config')
  })
})

describe('AntigravityModelProvider', () => {
  beforeEach(() => {
    settingsState.defaultAntigravityModel = 'agy-saved'
    settingsState.defaultAntigravityEffort = ''
  })

  it('lista modelos reais do `agy models`', async () => {
    const runCli = vi.fn(async (args: string[]) => {
      if (args[0] === 'models' && args[1] === '--json') {
        return { code: 1, stdout: '', stderr: 'unknown flag' }
      }
      if (args[0] === 'models') {
        return { code: 0, stdout: 'agy-one    One\nagy-two    Two\n', stderr: '' }
      }
      return { code: 0, stdout: '', stderr: '' }
    })
    const provider = new AntigravityModelProvider({
      runCli,
      getVersion: () => '1.2.0',
      getAuthFingerprint: () => 'token:1:1',
      hasBinary: async () => true,
    })
    const listed = await provider.listModels()
    expect(listed.models.map((model) => model.id)).toEqual(['agy-one', 'agy-two'])
    expect(await provider.getCurrentModel()).toBe('agy-saved')
  })

  it('CLI indisponível devolve erro curto e não quebra', async () => {
    const provider = new AntigravityModelProvider({
      runCli: async () => ({ code: 1, stdout: '', stderr: 'not found' }),
      getVersion: () => null,
      getAuthFingerprint: () => 'none',
      hasBinary: async () => false,
    })
    const listed = await provider.listModels()
    expect(listed.models).toEqual([])
    expect(listed.error).toBe('Não foi possível carregar os modelos.')
  })
})
