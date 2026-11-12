/**
 * Próxima implementação: desligamento automático após sucesso/erro.
 * Apenas planejamento — não executa STOP.
 */

export type ComfyAutoShutdownTrigger =
  | 'batch_success'
  | 'batch_error'
  | 'batch_canceled'
  | 'connect_timeout'
  | 'recovery_failed_after_create'

export type ComfyAutoShutdownPlan = {
  implemented: false
  /** Feature flag futura — padrão off até teste real passar. */
  enabledByDefault: false
  stopAction: 'stop'
  neverActions: Array<'terminate' | 'delete' | 'delete_volume'>
  waitForDownloads: true
  graceSecondsAfterLastDownload: number
  triggers: ComfyAutoShutdownTrigger[]
  safetyRules: string[]
  uiRequirements: string[]
  estimatedRiskWithoutIt: string
  message: string
}

export function buildComfyAutoShutdownPlan(): ComfyAutoShutdownPlan {
  return {
    implemented: false,
    enabledByDefault: false,
    stopAction: 'stop',
    neverActions: ['terminate', 'delete', 'delete_volume'],
    waitForDownloads: true,
    graceSecondsAfterLastDownload: 30,
    triggers: [
      'batch_success',
      'batch_error',
      'batch_canceled',
      'connect_timeout',
      'recovery_failed_after_create',
    ],
    safetyRules: [
      'Só POST /v2/pods/{id}/action { action: "stop" } — nunca terminate/delete.',
      'Não interromper downloads: aguardar jobs em downloading/done e grace de 30s.',
      'Não desligar se houver outro lote ativo do mesmo usuário/conta.',
      'Exigir opt-in explícito nas Configurações após o teste real de 1 cena passar.',
      'Preservar Pod antigo e Network Volume; stop só libera compute.',
      'Se STOP falhar, toast + banner de cobrança contínua com link/ação manual.',
    ],
    uiRequirements: [
      'Toggle “Desligar GPU ao concluir/erro” (off por padrão).',
      'Banner enquanto GPU RUNNING: custo/h + botão Parar agora.',
      'Logar evento runpod.autoshutdown.{requested|ok|failed}.',
    ],
    estimatedRiskWithoutIt:
      'Compute horário continua até STOP manual; storage do volume permanece cobrando mensalmente.',
    message:
      'Auto-shutdown planejado para a próxima entrega — não ativo. Use STOP manual após o teste.',
  }
}
