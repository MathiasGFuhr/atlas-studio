import assert from 'node:assert/strict'
import {
  DIRECT_IMAGE_GENERATION_INTENT,
  assertDirectImageComposer,
  detectAgentApprovalUi,
  isAcceptedDirectImageGeneration,
  selectDirectComposerEditor,
} from './directImageComposerContract.mjs'

function run() {
  const startRect = { top: 800, bottom: 840, left: 1100, right: 1140 }
  const ingredientRect = { top: 780, bottom: 820, left: 40, right: 80 }
  const placeholderRect = { top: 760, bottom: 820, left: 100, right: 900 }

  // Cenário real: compositor direto + chat do Agente simultâneos.
  const bothPresent = selectDirectComposerEditor(
    [
      {
        id: 'agent-chat',
        top: 48,
        bottom: 120,
        left: 80,
        right: 700,
        aria: 'Instruções para o agente',
      },
      {
        id: 'classic-composer',
        top: 760,
        bottom: 820,
        left: 100,
        right: 1000,
        aria: 'O que você quer criar?',
      },
    ],
    {
      startRects: [startRect],
      ingredientRects: [ingredientRect],
      placeholderRects: [placeholderRect],
      agentSessionActive: false,
    },
  )
  assert.equal(bothPresent.ok, true)
  assert.equal(bothPresent.selectedId, 'classic-composer')
  assert.equal(bothPresent.intent, DIRECT_IMAGE_GENERATION_INTENT)

  // Só editor do Agente → bloquear (nunca enviar ao agente).
  const onlyAgent = selectDirectComposerEditor(
    [
      {
        id: 'agent-only',
        top: 48,
        bottom: 120,
        left: 80,
        right: 700,
        aria: 'Instruções para o agente',
      },
    ],
    {
      startRects: [startRect],
      agentSessionActive: false,
    },
  )
  assert.equal(onlyAgent.ok, false)
  assert.ok(
    onlyAgent.error === 'PROMPT_EDITOR_TOP_SUSPECT' ||
      onlyAgent.error === 'AGENT_EDITOR_SELECTED',
  )

  // Sessão do Agente ativa → bloquear mesmo com composer clássico no DOM.
  const agentActive = selectDirectComposerEditor(
    [
      {
        id: 'classic-composer',
        top: 760,
        bottom: 820,
        left: 100,
        right: 1000,
        aria: 'O que você quer criar?',
      },
    ],
    {
      startRects: [startRect],
      agentSessionActive: true,
    },
  )
  assert.equal(agentActive.ok, false)
  assert.equal(agentActive.error, 'AGENT_MODE_ACTIVE')

  // Gate pré-envio: sem Start utilizável → bloqueia.
  const beforeSend = assertDirectImageComposer({
    intent: DIRECT_IMAGE_GENERATION_INTENT,
    labels: ['Agente', 'Iniciar geração', 'O que você quer criar?'],
    editorTop: 760,
    startListed: true,
    startUsableCount: 0,
    phase: 'before_send',
    requireStartUsable: true,
  })
  assert.equal(beforeSend.ok, false)
  assert.equal(beforeSend.error, 'START_GENERATION_NOT_READY')

  // UI de aprovação Omni NÃO é aceitação de imagem.
  const approvalLabels = [
    'Aprovar',
    'Sempre aprovar no projeto',
    'Rejeitar',
    'Omni 1.2 Flash',
    'Custa 30 créditos',
  ]
  assert.equal(detectAgentApprovalUi(approvalLabels), true)
  const notAccepted = isAcceptedDirectImageGeneration({
    labels: approvalLabels,
    agentSessionActive: true,
    promptCleared: true,
  })
  assert.equal(notAccepted.accepted, false)
  assert.equal(notAccepted.error, 'AGENT_MODE_ACTIVE')

  // Sinal clássico sem Agente → aceito.
  const accepted = isAcceptedDirectImageGeneration({
    labels: ['Iniciar geração', 'Gerando…'],
    startBecameBusy: true,
  })
  assert.equal(accepted.accepted, true)

  // Após write com editorTop 0 (evidência real) → bloquear.
  const afterWriteHijack = assertDirectImageComposer({
    intent: DIRECT_IMAGE_GENERATION_INTENT,
    labels: ['Aprovar', 'Omni 1.2', 'créditos', 'Instruções para o agente'],
    editorTop: 0,
    phase: 'after_write',
    startListed: true,
  })
  assert.equal(afterWriteHijack.ok, false)
  assert.ok(
    afterWriteHijack.error === 'AGENT_MODE_ACTIVE' ||
      afterWriteHijack.error === 'PROMPT_EDITOR_TOP_SUSPECT',
  )

  console.log('directImageComposerContract.test.mjs: ok')
}

run()
