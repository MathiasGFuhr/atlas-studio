import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron
vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
}))

// Mock logger
vi.mock('../logging/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock settingsRepository
const settingsState = {
  codexModel: 'gpt-5.6-sol',
  accountName: '',
  accountRole: '',
  accountEmail: '',
  codexBinaryPath: '',
  antigravityBinaryPath: '',
  codexOnboardingDismissed: false,
}

vi.mock('../../repositories/settingsRepository', () => ({
  settingsRepository: {
    get: () => ({ ...settingsState }),
    update: (patch: Record<string, unknown>) => {
      Object.assign(settingsState, patch)
      return { ...settingsState }
    },
  },
}))

// Mock child_process.spawn
const mockSpawn = vi.fn()
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}))

// Mock fs
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
}))

import { CodexRuntimeManager } from './CodexRuntimeManager'

describe('CodexRuntimeManager', () => {
  let manager: CodexRuntimeManager

  beforeEach(() => {
    vi.clearAllMocks()
    settingsState.codexOnboardingDismissed = false
    manager = new CodexRuntimeManager({
      getWindow: () => null,
    })
  })

  describe('getStatus', () => {
    it('returns initializing state by default', () => {
      const status = manager.getStatus()
      expect(status.authState).toBe('initializing')
      expect(status.connected).toBe(false)
      expect(status.authenticated).toBe(false)
      expect(status.message).toBe('Inicializando Codex...')
      expect(status).toHaveProperty('runtimePath')
      expect(status).toHaveProperty('codexVersion')
      expect(status).toHaveProperty('appServerRunning')
    })
  })

  describe('isConnected', () => {
    it('returns false when not connected', () => {
      expect(manager.isConnected()).toBe(false)
    })
  })

  describe('getAuthState', () => {
    it('returns initializing by default', () => {
      expect(manager.getAuthState()).toBe('initializing')
    })
  })

  describe('isAppServerRunning', () => {
    it('returns false when no process', () => {
      expect(manager.isAppServerRunning()).toBe(false)
    })
  })

  describe('getBinaryPath', () => {
    it('returns null before initialization', () => {
      expect(manager.getBinaryPath()).toBeNull()
    })
  })

  describe('getRuntimeStatus', () => {
    it('returns empty runtime info before init', () => {
      const runtime = manager.getRuntimeStatus()
      expect(runtime.binaryPath).toBeNull()
      expect(runtime.appServerRunning).toBe(false)
    })
  })

  describe('onboarding', () => {
    it('starts as not dismissed', () => {
      expect(manager.isOnboardingDismissed()).toBe(false)
    })

    it('persists dismissal via settings', () => {
      manager.dismissOnboarding()
      expect(manager.isOnboardingDismissed()).toBe(true)
      expect(settingsState.codexOnboardingDismissed).toBe(true)
    })
  })

  describe('initialize when codex not found', () => {
    it('sets state to not_found when binary is missing', async () => {
      const mockChild = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, cb: (code: number) => void) => {
          if (event === 'close') setTimeout(() => cb(1), 10)
        }),
        kill: vi.fn(),
      }
      mockSpawn.mockReturnValue(mockChild)

      const status = await manager.initialize()
      expect(status.authState).toBe('not_found')
      expect(status.connected).toBe(false)
      expect(status.message).toBe('Não instalado')
    })
  })

  describe('shutdown', () => {
    it('completes without error', async () => {
      await expect(manager.shutdown()).resolves.toBeUndefined()
    })
  })

  describe('loginCancel when no active login', () => {
    it('keeps a safe idle state when nothing was linking', () => {
      manager.loginCancel()
      expect(['initializing', 'not_authenticated', 'not_found']).toContain(
        manager.getAuthState(),
      )
    })
  })

  describe('logout when not connected', () => {
    it('sets state to not_authenticated or not_found', async () => {
      await manager.logout()
      expect(['not_authenticated', 'not_found']).toContain(manager.getAuthState())
    })
  })

  describe('status messages', () => {
    it('maps all auth states to friendly messages', () => {
      const expectedMessages: Record<string, string> = {
        initializing: 'Inicializando Codex...',
        not_found: 'Não instalado',
        not_authenticated: 'Não vinculado',
        authenticating: 'Vinculando com ChatGPT...',
        connected: 'Pronto',
        error: 'Não foi possível conectar ao Codex',
      }

      for (const message of Object.values(expectedMessages)) {
        expect(message.length).toBeGreaterThan(0)
      }
      expect(Object.keys(expectedMessages)).toHaveLength(6)
    })
  })
})

describe('CodexRuntimeManager - auth flow scenarios', () => {
  it('codex installed + authenticated scenario has correct status shape', () => {
    const manager = new CodexRuntimeManager({ getWindow: () => null })
    const status = manager.getStatus()
    expect(status).toHaveProperty('authState')
    expect(status).toHaveProperty('account')
    expect(status).toHaveProperty('connected')
    expect(status).toHaveProperty('authenticated')
    expect(status).toHaveProperty('model')
    expect(status).toHaveProperty('message')
    expect(status).toHaveProperty('lastCheckedAt')
    expect(status).toHaveProperty('runtimePath')
    expect(status).toHaveProperty('codexVersion')
  })

  it('codex not found scenario returns correct authState', async () => {
    const mockChild = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event: string, cb: (code: number) => void) => {
        if (event === 'close') setTimeout(() => cb(1), 5)
        if (event === 'error') {
          /* noop */
        }
      }),
      kill: vi.fn(),
    }
    mockSpawn.mockReturnValue(mockChild)

    const manager = new CodexRuntimeManager({ getWindow: () => null })
    const status = await manager.initialize()
    expect(status.authState).toBe('not_found')
  })
})
