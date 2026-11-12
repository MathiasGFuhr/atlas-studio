import { describe, expect, it } from 'vitest'
import {
  isFlowTabUrl,
  pickReusableFlowTab,
  planFlowSession,
  resolveOperationFocus,
  shouldStealFocus,
} from './flowSession'

describe('flowSession', () => {
  it('reconhece URLs do Google Flow', () => {
    expect(isFlowTabUrl('https://labs.google/fx/tools/flow')).toBe(true)
    expect(isFlowTabUrl('https://labs.google/fx/tools/flow/project/abc-123')).toBe(true)
    expect(isFlowTabUrl('https://flow.google.com/')).toBe(true)
    expect(isFlowTabUrl('https://flow.google.com/project/abc-123')).toBe(true)
    expect(isFlowTabUrl('https://flow.google.com/404?reason=project')).toBe(true)
    expect(isFlowTabUrl('https://edge.microsoft.com/')).toBe(false)
  })

  it('nunca rouba foco na automação comum', () => {
    expect(shouldStealFocus('automation')).toBe(false)
    expect(shouldStealFocus('login')).toBe(true)
    expect(shouldStealFocus('user_reveal')).toBe(true)
  })

  it('reutiliza a aba preferida quando ainda é do Flow', () => {
    const picked = pickReusableFlowTab(
      [
        { id: 1, url: 'https://labs.google/fx/tools/flow' },
        { id: 2, url: 'https://labs.google/fx/tools/flow/project/x' },
      ],
      2,
    )
    expect(picked?.id).toBe(2)
  })

  it('cria aba em segundo plano quando não há Flow aberto', () => {
    expect(
      planFlowSession({
        browserAvailable: true,
        tabs: [{ id: 9, url: 'https://example.com' }],
      }),
    ).toMatchObject({ action: 'create_background' })
  })

  it('marca unavailable se o Chrome estiver fechado', () => {
    const plan = planFlowSession({ browserAvailable: false, tabs: [] })
    expect(plan.action).toBe('unavailable')
    if (plan.action === 'unavailable') {
      expect(plan.reason).toMatch(/Chrome/i)
    }
  })

  it('reutiliza a mesma aba para o segundo projeto', () => {
    const tabs = [{ id: 44, url: 'https://labs.google/fx/tools/flow/project/old' }]
    const first = planFlowSession({ browserAvailable: true, tabs, preferredTabId: 44 })
    const second = planFlowSession({ browserAvailable: true, tabs, preferredTabId: 44 })
    expect(first).toMatchObject({ action: 'reuse', tabId: 44 })
    expect(second).toMatchObject({ action: 'reuse', tabId: 44 })
  })

  it('modo acompanhar resolve para user_reveal', () => {
    expect(resolveOperationFocus('automatic')).toBe('automation')
    expect(resolveOperationFocus('follow')).toBe('user_reveal')
  })
})
