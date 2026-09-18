import type { CodexStatus } from '../../../shared/types'
import {
  adviseCutsLocally,
  buildCodexCutPrompt,
  cutsFromAdvice,
  parseCodexCutAdvice,
  type MusicAdviseRequest,
  type MusicAdviseResult,
} from '../../../shared/audio/audioCutAdvisor'
import type { CodexService } from '../codex/CodexService'
import { logger } from '../logging/logger'

function isCodexReady(status: CodexStatus): boolean {
  return Boolean(status.connected && status.authenticated)
}

export async function adviseMusicCutsWithCodex(
  request: MusicAdviseRequest,
  codexService: CodexService,
): Promise<MusicAdviseResult> {
  const local = adviseCutsLocally(request)
  const status = codexService.getStatus()
  if (!isCodexReady(status)) {
    return local
  }

  try {
    const raw = await codexService.runChatPrompt(buildCodexCutPrompt(request))
    const selected = parseCodexCutAdvice(raw, request.candidates)
    if (selected.length === 0) {
      return {
        ...local,
        usedCodex: true,
        message: 'O Codex não escolheu candidatos válidos. Mantendo a análise local.',
      }
    }
    return {
      usedCodex: true,
      inputKind: 'analysis-summary',
      message: 'FFmpeg / análise local extraiu a estrutura. O Codex fez a decisão editorial com esses dados.',
      selected,
      cuts: cutsFromAdvice(request, selected, 'codex'),
    }
  } catch (error) {
    logger.warn('music.codex_advise.failed', {
      message: error instanceof Error ? error.message : String(error),
    })
    return {
      ...local,
      error: 'Não foi possível analisar a faixa com o Codex.',
      message: 'Não foi possível analisar a faixa com o Codex. Usando análise local.',
    }
  }
}
