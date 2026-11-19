import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let mockUserData = ''

vi.mock('electron', () => ({
  app: {
    getPath: () => mockUserData,
  },
}))

import { logger } from './logger'

describe('logger — sanitização em disco e console + proteção circular', () => {
  beforeEach(() => {
    mockUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-logger-test-'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(mockUserData, { recursive: true, force: true })
  })

  it('nunca vaza segredos nem no arquivo nem no console.log/console.error', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const fakeSecret = 'rpa_SUPER_SECRET_KEY_1234567890ABCDEF'
    const fakeBearer = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig'

    logger.info('auth.test', {
      runpodApiKey: fakeSecret,
      nested: { header: fakeBearer, safe: 'ok' },
      prompt: 'texto sensível do usuário',
    })
    logger.error('auth.fail', {
      authorization: fakeBearer,
      rawToken: fakeSecret,
    })

    const consoleJoined = [
      ...logSpy.mock.calls.flatMap((c) => c.map((v) => JSON.stringify(v))),
      ...errSpy.mock.calls.flatMap((c) => c.map((v) => JSON.stringify(v))),
    ].join('\n')

    expect(consoleJoined).not.toContain('SUPER_SECRET_KEY')
    expect(consoleJoined).not.toContain('eyJhbGciOi')
    expect(consoleJoined).not.toContain('texto sensível do usuário')
    expect(consoleJoined).toContain('[redacted]')
  })

  it('não lança exceção ao logar objeto circular', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const obj: Record<string, unknown> = { name: 'loop' }
    obj.self = obj
    expect(() => logger.info('circular.test', obj)).not.toThrow()
  })
})
