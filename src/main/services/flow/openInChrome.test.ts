import { describe, expect, it, vi } from 'vitest'
import {
  chromeExecutableCandidates,
  openInChrome,
  resolveChromeExecutable,
} from './openInChrome'

describe('openInChrome', () => {
  it('prioriza caminhos do Chrome no Windows', () => {
    const candidates = chromeExecutableCandidates(
      {
        LOCALAPPDATA: 'C:\\Users\\Dev\\AppData\\Local',
        PROGRAMFILES: 'C:\\Program Files',
        'PROGRAMFILES(X86)': 'C:\\Program Files (x86)',
      },
      'win32',
    )
    expect(candidates[0]).toContain('Google\\Chrome\\Application\\chrome.exe')
    expect(candidates.some((item) => item.includes('Edge'))).toBe(false)
  })

  it('resolve o primeiro executável existente', () => {
    const resolved = resolveChromeExecutable(
      ['C:\\missing\\chrome.exe', 'C:\\ok\\chrome.exe'],
      (filePath) => filePath.endsWith('ok\\chrome.exe'),
    )
    expect(resolved).toBe('C:\\ok\\chrome.exe')
  })

  it('abre a URL no Chrome e nunca no Edge', async () => {
    const spawnFn = vi.fn(() => {
      const child = {
        once: vi.fn(),
        unref: vi.fn(),
      }
      return child as unknown as ReturnType<typeof import('node:child_process').spawn>
    })

    await openInChrome('https://labs.google/fx/tools/flow', {
      resolveExecutable: () => 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      spawnFn,
    })

    expect(spawnFn).toHaveBeenCalledWith(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      ['https://labs.google/fx/tools/flow'],
      expect.objectContaining({ detached: true }),
    )
  })

  it('falha com mensagem clara se o Chrome não existir', async () => {
    await expect(
      openInChrome('https://labs.google/fx/tools/flow', {
        resolveExecutable: () => null,
      }),
    ).rejects.toThrow(/Chrome não encontrado/i)
  })
})
