import { describe, expect, it } from 'vitest'
import { AtlasActionRegistry } from './AtlasActionRegistry'
import type { AtlasActionContext } from './AtlasActionRegistry'

const ctx: AtlasActionContext = {
  conversationId: 'c1',
  agent: 'codex',
  confirmed: false,
  client: { useProjectContext: false },
}

describe('AtlasActionRegistry', () => {
  it('rejects unknown actions without touching persistence', async () => {
    const registry = new AtlasActionRegistry()
    const result = await registry.execute({ name: 'run_sql', input: { sql: 'DROP TABLE' } }, ctx)
    expect(result.status).toBe('error')
    expect(result.error).toMatch(/não existe/)
  })

  it('does not execute destructive actions without confirmation', async () => {
    const registry = new AtlasActionRegistry()
    registry.register('delete_project', async () => {
      throw new Error('não deveria executar')
    })
    const result = await registry.execute({ name: 'delete_project', input: { id: '1' } }, ctx)
    expect(result.status).toBe('pending')
  })

  it('executes registered safe actions', async () => {
    const registry = new AtlasActionRegistry()
    registry.register('list_projects', async () => ({
      name: 'list_projects',
      status: 'success',
      title: '0 projetos',
    }))
    const result = await registry.execute({ name: 'list_projects', input: {} }, ctx)
    expect(result.status).toBe('success')
    expect(result.title).toBe('0 projetos')
  })
})
