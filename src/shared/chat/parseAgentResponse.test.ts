import { describe, expect, it } from 'vitest'
import { ATLAS_ACTION_CATALOG, actionRequiresConfirmation, getActionDefinition } from './actionCatalog'
import { parseAgentResponse, titleFromFirstMessage } from './parseAgentResponse'

describe('Atlas action catalog', () => {
  it('has unique action names', () => {
    const names = ATLAS_ACTION_CATALOG.map((item) => item.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('marks destructive actions as confirmation required', () => {
    expect(actionRequiresConfirmation('delete_project')).toBe(true)
    expect(actionRequiresConfirmation('delete_channel')).toBe(true)
    expect(actionRequiresConfirmation('delete_task')).toBe(true)
    expect(actionRequiresConfirmation('delete_project_files')).toBe(true)
    expect(actionRequiresConfirmation('create_channel')).toBe(false)
    expect(actionRequiresConfirmation('create_task')).toBe(false)
  })

  it('exposes definitions used by the registry', () => {
    expect(getActionDefinition('save_quick_prompt')?.category).toBe('quick_prompts')
  })
})

describe('parseAgentResponse', () => {
  it('reads JSON with actions', () => {
    const parsed = parseAgentResponse(
      JSON.stringify({
        message: 'Canal Johann Falk criado.',
        actions: [{ name: 'create_channel', input: { name: 'Johann Falk', type: 'music', language: 'de' } }],
      }),
    )
    expect(parsed.message).toContain('Johann Falk')
    expect(parsed.actions).toEqual([
      { name: 'create_channel', input: { name: 'Johann Falk', type: 'music', language: 'de' } },
    ])
  })

  it('reads fenced JSON', () => {
    const parsed = parseAgentResponse('```json\n{"message":"Ok","actions":[]}\n```')
    expect(parsed.message).toBe('Ok')
    expect(parsed.actions).toEqual([])
  })

  it('treats free text as a normal reply', () => {
    const parsed = parseAgentResponse('Aqui vão 10 ideias de títulos.')
    expect(parsed.message).toContain('10 ideias')
    expect(parsed.actions).toEqual([])
  })
})

describe('titleFromFirstMessage', () => {
  it('uses the start of the first message', () => {
    expect(titleFromFirstMessage('Crie um canal chamado Johann Falk')).toBe(
      'Crie um canal chamado Johann Falk',
    )
  })
})
