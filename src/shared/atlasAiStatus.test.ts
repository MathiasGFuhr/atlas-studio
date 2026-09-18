import { describe, expect, it } from 'vitest'
import type { AntigravityStatus, CodexStatus } from './types'
import { deriveAtlasAiStatus, friendlyModelLabel } from './atlasAiStatus'

function codex(authState: CodexStatus['authState'], extras: Partial<CodexStatus> = {}): CodexStatus {
  return {
    connected: authState === 'connected',
    authenticated: authState === 'connected',
    authState,
    account: null,
    model: extras.model ?? (authState === 'connected' ? 'gpt-5.6-sol' : null),
    message: extras.message ?? '',
    lastCheckedAt: '2026-09-17T12:00:00.000Z',
    runtimePath: extras.runtimePath ?? 'C:\\codex',
    codexVersion: extras.codexVersion ?? '0.154.0',
    ...extras,
  }
}

function antigravity(
  authState: AntigravityStatus['authState'],
  extras: Partial<AntigravityStatus> = {},
): AntigravityStatus {
  return {
    connected: authState === 'connected',
    authenticated: authState === 'connected',
    authState,
    version: extras.version ?? '1.2.3',
    runtimePath: extras.runtimePath ?? 'C:\\agy.exe',
    message: extras.message ?? '',
    lastCheckedAt: '2026-09-17T12:00:00.000Z',
    ...extras,
  }
}

function leakedTechnical(view: ReturnType<typeof deriveAtlasAiStatus>) {
  const blob = `${view.statusLabel}\n${view.compactLabel}\n${view.tooltip}`
  return {
    blob,
    hasVersion: /v?0\.154|1\.2\.3/.test(blob),
    hasPath: /C:\\|runtime|codexVersion/i.test(blob),
    hasRawModel: /gpt-5\.6-sol/.test(blob),
  }
}

describe('deriveAtlasAiStatus', () => {
  it('mostra Codex conectado sem versão, path ou model id', () => {
    const view = deriveAtlasAiStatus(codex('connected'), antigravity('not_authenticated'))
    expect(view.kind).toBe('connected')
    expect(view.title).toBe('IA do Atlas')
    expect(view.statusLabel).toBe('Codex conectado')
    expect(view.compactLabel).toBe('IA do Atlas · Codex conectado')
    expect(view.connectedCount).toBe(1)
    const leak = leakedTechnical(view)
    expect(leak.hasVersion).toBe(false)
    expect(leak.hasPath).toBe(false)
    expect(leak.hasRawModel).toBe(false)
    expect(view.tooltip).toContain('Codex: GPT-5.6 Sol')
  })

  it('mostra Antigravity conectado', () => {
    const view = deriveAtlasAiStatus(codex('not_authenticated'), antigravity('connected'))
    expect(view.kind).toBe('connected')
    expect(view.statusLabel).toBe('Antigravity conectado')
    expect(view.compactLabel).toBe('IA do Atlas · Antigravity conectado')
  })

  it('resume dois agentes conectados sem listar os nomes no card', () => {
    const view = deriveAtlasAiStatus(codex('connected'), antigravity('connected'))
    expect(view.kind).toBe('connected')
    expect(view.statusLabel).toBe('2 agentes conectados')
    expect(view.compactLabel).toBe('IA do Atlas · Conectada')
    expect(view.connectedCount).toBe(2)
    expect(view.statusLabel).not.toMatch(/Codex|Antigravity/)
  })

  it('pede configuração quando nenhum está conectado', () => {
    const view = deriveAtlasAiStatus(codex('not_authenticated'), antigravity('not_found'))
    expect(view.kind).toBe('disconnected')
    expect(view.statusLabel).toBe('Configuração necessária')
    expect(view.compactLabel).toBe('IA do Atlas · Configuração necessária')
  })

  it('mostra conectando enquanto um agente autentica', () => {
    const view = deriveAtlasAiStatus(codex('authenticating'), antigravity('not_authenticated'))
    expect(view.kind).toBe('connecting')
    expect(view.statusLabel).toBe('Conectando...')
    expect(view.compactLabel).toBe('IA do Atlas · Conectando...')
  })

  it('trata status ainda não carregado como conectando', () => {
    const view = deriveAtlasAiStatus(null, null)
    expect(view.kind).toBe('connecting')
    expect(view.statusLabel).toBe('Conectando...')
  })

  it('mostra atenção quando há erro e ninguém conectado', () => {
    const view = deriveAtlasAiStatus(codex('error'), antigravity('not_authenticated'))
    expect(view.kind).toBe('attention')
    expect(view.statusLabel).toBe('Atenção necessária')
  })

  it('prioriza o agente conectado mesmo se o outro estiver com erro', () => {
    const view = deriveAtlasAiStatus(codex('connected'), antigravity('error'))
    expect(view.kind).toBe('connected')
    expect(view.statusLabel).toBe('Codex conectado')
  })
})

describe('friendlyModelLabel', () => {
  it('formata gpt-5.6-sol sem expor o id cru no tooltip', () => {
    expect(friendlyModelLabel('gpt-5.6-sol')).toBe('GPT-5.6 Sol')
  })

  it('ignora paths e versões', () => {
    expect(friendlyModelLabel('C:\\Users\\codex')).toBeNull()
    expect(friendlyModelLabel('0.154.0')).toBeNull()
    expect(friendlyModelLabel('v0.154.0')).toBeNull()
  })
})
