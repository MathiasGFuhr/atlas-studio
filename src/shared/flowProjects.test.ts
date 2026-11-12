import { describe, expect, it } from 'vitest'
import {
  buildFlowProjectUrl,
  buildFlowReferenceUploadFileName,
  buildFlowUploadKey,
  flowDeleteConfirmMessage,
  FLOW_IMAGE_MODEL_LABEL,
  labelFromImagePath,
  maskGoogleAccountHint,
  normalizeFlowImageModel,
  normalizeFlowImageOutputs,
  normalizeFlowProjectUrl,
  parseFlowProjectIdFromUrl,
  parseFlowPromptMentions,
  planFlowLinkAttempt,
  shouldShowRetryLink,
  splitFlowPromptSegments,
  validateFlowProjectCreateInput,
  validateFlowReferenceLabel,
} from './flowProjects'

describe('validateFlowProjectCreateInput', () => {
  it('exige nome', () => {
    const result = validateFlowProjectCreateInput({
      name: '   ',
      localFolderPath: 'D:\\flow\\out',
      folderExists: true,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/nome/i)
  })

  it('exige pasta', () => {
    const result = validateFlowProjectCreateInput({
      name: 'Clipe 01',
      localFolderPath: '',
      folderExists: true,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/pasta/i)
  })

  it('rejeita pasta inexistente', () => {
    const result = validateFlowProjectCreateInput({
      name: 'Clipe 01',
      localFolderPath: 'D:\\nao\\existe',
      folderExists: false,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/não existe/i)
  })

  it('aceita criação local válida', () => {
    const result = validateFlowProjectCreateInput({
      name: '  Clipe 01  ',
      localFolderPath: ' D:\\flow\\out ',
      folderExists: true,
    })
    expect(result).toEqual({
      ok: true,
      name: 'Clipe 01',
      localFolderPath: 'D:\\flow\\out',
    })
  })
})

describe('parseFlowProjectIdFromUrl', () => {
  it('extrai uuid da URL atual flow.google.com', () => {
    expect(
      parseFlowProjectIdFromUrl(
        'https://flow.google.com/project/012499f7-517b-48f6-a5d5-87c6c523f707',
      ),
    ).toBe('012499f7-517b-48f6-a5d5-87c6c523f707')
  })

  it('extrai uuid da URL Labs legada', () => {
    expect(
      parseFlowProjectIdFromUrl(
        'https://labs.google/fx/tools/flow/project/a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      ),
    ).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
  })

  it('ignora 404?reason=project', () => {
    expect(parseFlowProjectIdFromUrl('https://flow.google.com/404?reason=project')).toBeNull()
  })

  it('ignora /project/new', () => {
    expect(parseFlowProjectIdFromUrl('https://flow.google.com/project/new')).toBeNull()
  })

  it('ignora URL inválida', () => {
    expect(parseFlowProjectIdFromUrl('https://example.com/flow/project/abc')).toBeNull()
  })
})

describe('normalizeFlowProjectUrl', () => {
  it('normaliza Labs legado para flow.google.com', () => {
    expect(
      normalizeFlowProjectUrl(
        'https://labs.google/fx/tools/flow/project/a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      ),
    ).toBe(buildFlowProjectUrl('a1b2c3d4-e5f6-7890-abcd-ef1234567890'))
  })

  it('descarta 404', () => {
    expect(normalizeFlowProjectUrl('https://flow.google.com/404?reason=project')).toBeNull()
  })
})

describe('buildFlowProjectUrl', () => {
  it('usa o formato confirmado na UI', () => {
    expect(buildFlowProjectUrl('012499f7-517b-48f6-a5d5-87c6c523f707')).toBe(
      'https://flow.google.com/project/012499f7-517b-48f6-a5d5-87c6c523f707',
    )
  })
})

describe('planFlowLinkAttempt', () => {
  it('não cria de novo quando já há remoteId', () => {
    expect(
      planFlowLinkAttempt({
        remoteId: 'abc-123',
        remoteUrl: buildFlowProjectUrl('abc-123'),
        syncStatus: 'sync_failed',
        createInFlow: true,
        operationId: 'op-1',
      }).action,
    ).toBe('verify_existing')
  })

  it('não usa nome igual como prova de identidade', () => {
    expect(
      planFlowLinkAttempt({
        remoteId: null,
        remoteUrl: null,
        syncStatus: 'sync_failed',
        createInFlow: true,
        operationId: 'op-1',
      }).action,
    ).toBe('create')
  })

  it('retoma rename se criação parcial já salvou o ID', () => {
    expect(
      planFlowLinkAttempt({
        remoteId: 'abc-123',
        remoteUrl: buildFlowProjectUrl('abc-123'),
        syncStatus: 'creating',
        createInFlow: true,
        operationId: 'op-1',
      }).action,
    ).toBe('resume_rename')
  })

  it('pula quando já vinculado', () => {
    expect(
      planFlowLinkAttempt({
        remoteId: 'abc-123',
        remoteUrl: buildFlowProjectUrl('abc-123'),
        syncStatus: 'linked',
        createInFlow: true,
        operationId: 'op-1',
      }).action,
    ).toBe('skip')
  })
})

describe('maskGoogleAccountHint', () => {
  it('mascara e-mail sem guardar credencial', () => {
    expect(maskGoogleAccountHint('mathias@gmail.com')).toBe('ma…@gmail.com')
  })
})

describe('shouldShowRetryLink', () => {
  it('mostra retry só quando necessário', () => {
    expect(shouldShowRetryLink('linked')).toBe(false)
    expect(shouldShowRetryLink('creating')).toBe(false)
    expect(shouldShowRetryLink('sync_failed')).toBe(true)
    expect(shouldShowRetryLink('awaiting_login')).toBe(true)
    expect(shouldShowRetryLink('local_created')).toBe(true)
  })
})

describe('flowDeleteConfirmMessage', () => {
  it('avisa exclusão nos dois lados quando há remoto', () => {
    expect(
      flowDeleteConfirmMessage({ name: 'Clipe 01', remoteId: 'abc' }),
    ).toMatch(/Atlas e no Google Flow/)
  })

  it('não menciona o Flow quando o projeto é só local', () => {
    expect(flowDeleteConfirmMessage({ name: 'Local', remoteId: null })).not.toMatch(
      /Google Flow/,
    )
  })
})

describe('referências Flow', () => {
  it('extrai o nome do arquivo como label', () => {
    expect(labelFromImagePath('D:\\refs\\cantor_principal.png')).toBe('cantor principal')
  })

  it('normaliza label vazio', () => {
    expect(validateFlowReferenceLabel('   ')).toBe('Referência')
    expect(validateFlowReferenceLabel('  Cenário  ')).toBe('Cenário')
  })

  it('monta o nome do arquivo a partir do rótulo da referência', () => {
    expect(buildFlowReferenceUploadFileName('banda', 'D:\\tmp\\uuid-abc.jpg')).toBe('banda.jpg')
    expect(buildFlowReferenceUploadFileName('Cantor Principal', 'x.png')).toBe('Cantor-Principal.png')
  })

  it('monta chave estável de upload no Flow', () => {
    expect(buildFlowUploadKey('Cantor', 'cantor.png')).toBe('cantor::cantor.png')
    expect(buildFlowUploadKey('cenário', 'cenario.png')).toBe('cenario::cenario.png')
  })

  it('extrai menções @ e [] do prompt', () => {
    expect(parseFlowPromptMentions('foto do @cantor com a [banda]')).toEqual(['cantor', 'banda'])
    expect(splitFlowPromptSegments('Olá @cantor!')).toEqual([
      { type: 'text', value: 'Olá ' },
      { type: 'mention', label: 'cantor' },
      { type: 'text', value: '!' },
    ])
  })

  it('normaliza modelo e quantidade de imagem do Flow', () => {
    expect(normalizeFlowImageModel('nano-banana-pro')).toBe('nano-banana-pro')
    expect(normalizeFlowImageModel('outro')).toBe('nano-banana-2.1')
    expect(FLOW_IMAGE_MODEL_LABEL['nano-banana-2-lite']).toBe('Nano Banana 2 Lite')
    expect(normalizeFlowImageOutputs(2)).toBe(2)
    expect(normalizeFlowImageOutputs('3')).toBe(3)
    expect(normalizeFlowImageOutputs(9)).toBe(3)
  })
})
