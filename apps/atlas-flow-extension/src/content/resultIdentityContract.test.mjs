import assert from 'node:assert/strict'
import {
  createAttemptCorrelationSession,
  diagnoseMissingCorrelation,
  evaluateAttemptBusyState,
  evaluateCaptureCandidateIdentity,
  evaluatePositiveOrigin,
  evaluateResultShaBinding,
  extractMediaIdFromFlowUrl,
  isCandidateExcludedByBaseline,
  isStableFlowMediaId,
  matchPromptEvidenceLabels,
  mergeIdentityLists,
  normalizeFlowMediaSrcKey,
  pickLegitimateOwner,
  recordCorrelatedRpcObservation,
  recordTrackedSlotOutput,
} from './resultIdentityContract.mjs'

const beachA = '69cc1e0771e034687bc6b2dc3413eef7457f31a32fe9e9468442a3392a70feee'
const beachB = 'fe1988c1193d4a427f615ed9b4720b680ea8a589a49f5303a948fc01ffc0ef1a'
const beachC = 'f40f3d02d001d3d686c71ef58ad007168077e3d4474cbeeabab2476d41167fae'
const ship1 = 'bdeb977be3176cb4c1c089ae16e2e71c62993a3ede768ce1b34073729fc2dfc2'
const ship2 = '087aa27eb67df0b3b22a28dc85bf24bb8e5cfa126ee7c6d517823a7ba98a0203'
const shipRun2A = '1111111111111111111111111111111111111111111111111111111111111111'
const shipRun2B = '2222222222222222222222222222222222222222222222222222222222222222'

const SHIP_PROMPT =
  '[cantor] cantando no meio do mar em um navio luxoso e gospel, foco em lipsync'

// 1) Correção do bug de captura prematura em 0% (44ms/72ms após clicar Start generation)
{
  const zeroPercent = evaluateAttemptBusyState({
    domBusy: false,
    slotPercents: [0, 0, 0],
    generatingCardCount: 3,
    trackedGeneratingSlotCount: 3,
  })
  assert.equal(zeroPercent.busy, true, '0% nos cards sem role=progressbar DEVE bloquear captura')
  assert.equal(zeroPercent.hasIncompletePercent, true)
  assert.equal(zeroPercent.minPercent, 0)

  const partialDone = evaluateAttemptBusyState({
    domBusy: false,
    slotPercents: [100, 64, 100],
    generatingCardCount: 1,
    trackedGeneratingSlotCount: 1,
  })
  assert.equal(partialDone.busy, true, 'Enquanto 1 slot está <100%, continua busy')

  const allDone = evaluateAttemptBusyState({
    domBusy: false,
    slotPercents: [100, 100, 100],
    generatingCardCount: 0,
    trackedGeneratingSlotCount: 0,
  })
  assert.equal(allDone.busy, false)
}

// 2) Extração de mediaId real da URL do Flow (ignorando projectId e local:*)
{
  const flowProj = 'cc162ac6-b5a2-47cb-8d63-4d816f5d84e7'
  const mediaUuid = '91a4d7c1-3f2b-4d8a-9c77-112233445566'
  const url = `https://flow-content.google/project/${flowProj}/media/${mediaUuid}=w1376-h768?token=ephemeral`
  assert.equal(extractMediaIdFromFlowUrl(url, flowProj), mediaUuid)
  assert.equal(
    normalizeFlowMediaSrcKey(url),
    `https://flow-content.google/project/${flowProj}/media/${mediaUuid}`,
  )
  assert.equal(isStableFlowMediaId(mediaUuid), true)
  assert.equal(isStableFlowMediaId('local:69cc1e0771e0'), false)
  assert.equal(isStableFlowMediaId('_gd'), false)
}

// 3) Cenário A — Resultados antigos já presentes no projeto + virtualização do grid + fechar painel
{
  let session = createAttemptCorrelationSession({
    attemptId: 'attempt-ship-live',
    commandId: 'cmd-ship-live',
    promptText: SHIP_PROMPT,
    submittedAfterMs: 1_000,
    baselineClosedPanel: true,
    excludeSrcs: ['https://flow-content.google/media/old-beach-1'],
    excludeMediaIds: ['aaaa1111-2222-3333-4444-555566667777'],
    excludeShas: [beachA, beachB, beachC],
    preExistingSlotKeys: ['slot-other-concurrent-gen'],
  })

  // Scroll do grid virtualizado monta um <img> antigo que não estava visível no baseline:
  const virtualizedAttempt = recordTrackedSlotOutput(session, {
    slotKey: 'virtualized-dom-node',
    slotAttemptId: null,
    transitionedFromProgress: false,
    src: 'https://flow-content.google/media/old-beach-virtualized?sig=new',
    mediaId: 'bbbb1111-2222-3333-4444-555566667777',
  })
  assert.equal(virtualizedAttempt.accepted, false)
  assert.equal(virtualizedAttempt.reason, 'UNTRACKED_DOM_APPEARANCE_OR_VIRTUALIZATION')

  // Outra geração já em andamento antes do clique termina um card:
  const foreignPreExisting = recordTrackedSlotOutput(session, {
    slotKey: 'slot-other-concurrent-gen',
    slotAttemptId: 'attempt-ship-live',
    transitionedFromProgress: true,
    src: 'https://flow-content.google/media/concurrent-woods.jpg',
    mediaId: 'cccc1111-2222-3333-4444-555566667777',
  })
  assert.equal(foreignPreExisting.accepted, false)
  assert.equal(foreignPreExisting.reason, 'PRE_EXISTING_PROGRESS_SLOT')

  // Candidato antigo da praia com blob/URL temporária nova é rejeitado tanto por baseline quanto por falta de correlação:
  const checkOldBeach = evaluateCaptureCandidateIdentity({
    candidateSha: beachA,
    candidateSrc: 'blob:https://flow.google.com/temp-new-url',
    excludeShas: session.excludeShas,
    excludeSrcs: session.excludeSrcs,
    excludeMediaIds: session.excludeMediaIds,
    allowSrcs: session.acceptedSrcs,
    allowMediaIds: session.acceptedMediaIds,
    requireAllowlist: true,
    correlationSession: session,
  })
  assert.equal(checkOldBeach.ok, false)
  assert.equal(checkOldBeach.reason, 'EXCLUDED_BY_BASELINE')

  // Candidato de outra cena revelada pelo virtualizer (mesmo com SHA desconhecido) é rejeitado pois não tem origem positiva:
  const checkVirtualizedUnknown = evaluateCaptureCandidateIdentity({
    candidateSha: '9999999999999999999999999999999999999999999999999999999999999999',
    candidateSrc: 'https://flow-content.google/media/old-beach-virtualized?sig=new',
    excludeShas: session.excludeShas,
    excludeSrcs: session.excludeSrcs,
    allowSrcs: ['https://flow-content.google/media/real-ship-slot-1'],
    requireAllowlist: true,
  })
  assert.equal(checkVirtualizedUnknown.ok, false)
  assert.equal(checkVirtualizedUnknown.reason, 'NOT_IN_POST_ACCEPT_ALLOWLIST')
}

// 4) Cenário B — Duas tentativas usando EXATAMENTE o mesmo prompt
{
  // Tentativa 1 do navio já produziu ship1 (mediaId m1)
  const bindingsAfterRun1 = [
    {
      id: 'bind-ship-run1-0',
      attemptId: 'attempt-ship-run-1',
      flowMediaId: '11111111-aaaa-4bbb-8ccc-111111111111',
      outputIndex: 0,
      sha256: ship1,
      retrievalState: 'retrieved',
      errorCode: null,
    },
  ]

  // Tentativa 2 dispara exatamente o MESMO prompt SHIP_PROMPT
  let run2Session = createAttemptCorrelationSession({
    attemptId: 'attempt-ship-run-2',
    commandId: 'cmd-ship-run-2',
    promptText: SHIP_PROMPT,
    submittedAfterMs: 50_000,
    baselineClosedPanel: true,
    excludeSrcs: ['https://flow-content.google/media/11111111-aaaa-4bbb-8ccc-111111111111'],
    excludeMediaIds: ['11111111-aaaa-4bbb-8ccc-111111111111'],
    excludeShas: [ship1],
  })

  // Resposta RPC antiga da Tentativa 1 (startedAtMs < submittedAfterMs) NÃO entra na Tentativa 2:
  const staleRpc = recordCorrelatedRpcObservation(run2Session, {
    workflowId: 'wf-ship-run-1',
    requestPromptText: SHIP_PROMPT,
    requestStartedAtMs: 10_000,
    mediaIds: ['11111111-aaaa-4bbb-8ccc-111111111111'],
  })
  assert.equal(staleRpc.matched, false)

  // Resposta RPC real da Tentativa 2 (startedAtMs >= submittedAfterMs) entra e trava wf-ship-run-2:
  const run2Rpc = recordCorrelatedRpcObservation(run2Session, {
    workflowId: 'wf-ship-run-2',
    requestPromptText: SHIP_PROMPT,
    requestStartedAtMs: 50_120,
    mediaIds: ['22222222-bbbb-4ccc-8ddd-222222222222'],
    mediaUrls: [
      'https://flow-content.google/media/22222222-bbbb-4ccc-8ddd-222222222222=w1376-h768?sig=xyz',
    ],
  })
  assert.equal(run2Rpc.matched, true)
  run2Session = run2Rpc.session

  // Tentativa 2 rejeita rebind do output da Tentativa 1 tanto no cliente quanto no servidor:
  const clientRejectRun1OnRun2 = evaluateCaptureCandidateIdentity({
    candidateSha: ship1,
    candidateMediaId: '11111111-aaaa-4bbb-8ccc-111111111111',
    candidateSrc: 'https://flow-content.google/media/11111111-aaaa-4bbb-8ccc-111111111111',
    excludeShas: run2Session.excludeShas,
    excludeSrcs: run2Session.excludeSrcs,
    excludeMediaIds: run2Session.excludeMediaIds,
    allowSrcs: run2Session.acceptedSrcs,
    allowMediaIds: run2Session.acceptedMediaIds,
    requireAllowlist: true,
  })
  assert.equal(clientRejectRun1OnRun2.ok, false)
  assert.equal(clientRejectRun1OnRun2.reason, 'EXCLUDED_BY_BASELINE')

  const serverRejectSameMediaId = evaluateResultShaBinding({
    sha256: shipRun2A, // mesmo se re-encodado em outro formato, mediaId real barra!
    flowMediaId: '11111111-aaaa-4bbb-8ccc-111111111111',
    attemptId: 'attempt-ship-run-2',
    knownBindings: bindingsAfterRun1,
  })
  assert.equal(serverRejectSameMediaId.ok, false)
  assert.equal(serverRejectSameMediaId.error, 'RESULT_MEDIA_ID_ALREADY_BOUND')
  assert.equal(serverRejectSameMediaId.existingAttemptId, 'attempt-ship-run-1')

  // Tentativa 2 aceita seu próprio output correlacionado:
  const clientAcceptRun2 = evaluateCaptureCandidateIdentity({
    candidateSha: shipRun2A,
    candidateMediaId: '22222222-bbbb-4ccc-8ddd-222222222222',
    candidateSrc:
      'https://flow-content.google/media/22222222-bbbb-4ccc-8ddd-222222222222=w1376-h768?sig=abc',
    excludeShas: run2Session.excludeShas,
    excludeSrcs: run2Session.excludeSrcs,
    excludeMediaIds: run2Session.excludeMediaIds,
    allowSrcs: run2Session.acceptedSrcs,
    allowMediaIds: run2Session.acceptedMediaIds,
    originProofByKey: run2Session.originProofByKey,
    requireAllowlist: true,
  })
  assert.equal(clientAcceptRun2.ok, true)
  assert.equal(clientAcceptRun2.originProof, 'rpc_response')
  assert.equal(clientAcceptRun2.automaticCorrelation, true)
}

// 5) Cenário C — Conclusão fora de ordem (Tentativa B inicia depois de A, mas termina ANTES de A!)
{
  let sessionA = createAttemptCorrelationSession({
    attemptId: 'attempt-A-slow',
    commandId: 'cmd-A',
    promptText: SHIP_PROMPT,
    submittedAfterMs: 1_000,
    baselineClosedPanel: true,
  })
  let sessionB = createAttemptCorrelationSession({
    attemptId: 'attempt-B-fast',
    commandId: 'cmd-B',
    promptText: SHIP_PROMPT,
    submittedAfterMs: 2_000,
    baselineClosedPanel: true,
    preExistingSlotKeys: ['slot-A-1'],
  })

  // A trava no workflow-A; B trava no workflow-B
  sessionA = recordCorrelatedRpcObservation(sessionA, {
    workflowId: 'wf-A',
    requestPromptText: SHIP_PROMPT,
    requestStartedAtMs: 1_050,
  }).session
  sessionB = recordCorrelatedRpcObservation(sessionB, {
    workflowId: 'wf-B',
    foreignWorkflowIds: ['wf-A'],
    requestPromptText: SHIP_PROMPT,
    requestStartedAtMs: 2_050,
  }).session

  // B conclui PRIMEIRO (em t=3000) com mediaId-B:
  const bPoll = recordCorrelatedRpcObservation(sessionB, {
    workflowId: 'wf-B',
    mediaIds: ['bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'],
    mediaUrls: ['https://flow-content.google/media/bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'],
  })
  assert.equal(bPoll.matched, true)
  sessionB = bPoll.session

  // A recebe o evento de wf-B enquanto ainda está gerando — DEVE ignorar wf-B!
  const aSeesBPoll = recordCorrelatedRpcObservation(sessionA, {
    workflowId: 'wf-B',
    mediaIds: ['bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'],
  })
  assert.equal(aSeesBPoll.matched, false)
  assert.equal(aSeesBPoll.reason, 'DIFFERENT_WORKFLOW_ID_FOR_SAME_PROMPT')

  // Slot de B não pode ser aceito por A:
  const aSeesBSlot = recordTrackedSlotOutput(sessionA, {
    slotKey: 'slot-B-1',
    slotAttemptId: 'attempt-B-fast',
    transitionedFromProgress: true,
    src: 'https://flow-content.google/media/bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
    mediaId: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
  })
  assert.equal(aSeesBSlot.accepted, false)
  assert.equal(aSeesBSlot.reason, 'SLOT_OWNED_BY_OTHER_ATTEMPT')

  // B persiste no banco em t=3000:
  const dbBindings = []
  const bindB = evaluateResultShaBinding({
    sha256: shipRun2B,
    flowMediaId: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
    attemptId: 'attempt-B-fast',
    knownBindings: dbBindings,
  })
  assert.equal(bindB.ok, true)
  dbBindings.push({
    id: 'rb-B-0',
    attemptId: 'attempt-B-fast',
    flowMediaId: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
    outputIndex: 0,
    sha256: shipRun2B,
    retrievalState: 'retrieved',
  })

  // A termina DEPOIS (em t=4500) com seu próprio slot-A-1:
  sessionA = recordTrackedSlotOutput(sessionA, {
    slotKey: 'slot-A-1',
    slotAttemptId: 'attempt-A-slow',
    transitionedFromProgress: true,
    src: 'https://flow-content.google/media/aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    mediaId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  }).session

  // Se A tentasse ingerir o output de B, o servidor barraria; mas para o output de A, vincula limpo!
  assert.equal(
    evaluateResultShaBinding({
      sha256: shipRun2B,
      flowMediaId: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
      attemptId: 'attempt-A-slow',
      knownBindings: dbBindings,
    }).ok,
    false,
  )
  const bindA = evaluateResultShaBinding({
    sha256: shipRun2A,
    flowMediaId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    attemptId: 'attempt-A-slow',
    knownBindings: dbBindings,
  })
  assert.equal(bindA.ok, true)
  assert.equal(bindA.idempotent, false)
}

// 6) Ingestão repetida idempotente + Persistência contra restart do worker + Seleção explícita honesta
{
  const known = [
    {
      id: 'rb-1',
      attemptId: 'attempt-ship-1',
      flowMediaId: '99999999-1111-4222-8333-444444444444',
      outputIndex: 2,
      sha256: ship2,
      retrievalState: 'retrieved',
      errorCode: null,
    },
    {
      id: 'rb-mis',
      attemptId: 'attempt-ship-1',
      flowMediaId: 'local:69cc1e0771e0',
      outputIndex: 0,
      sha256: beachA,
      retrievalState: 'misattributed',
      errorCode: 'MISATTRIBUTED_CAPTURE',
    },
  ]

  // Reingestão repetida do mesmo output preserva id e outputIndex sem duplicar
  const repeat = evaluateResultShaBinding({
    sha256: ship2,
    flowMediaId: '99999999-1111-4222-8333-444444444444',
    attemptId: 'attempt-ship-1',
    knownBindings: known,
  })
  assert.equal(repeat.ok, true)
  assert.equal(repeat.idempotent, true)
  assert.equal(repeat.resultBindingId, 'rb-1')
  assert.equal(repeat.outputIndex, 2)

  // SHA marcado como misattributed na tentativa não reativa acidentalmente
  const mis = evaluateResultShaBinding({
    sha256: beachA,
    attemptId: 'attempt-ship-1',
    knownBindings: known,
  })
  assert.equal(mis.ok, false)
  assert.equal(mis.error, 'RESULT_SHA_MISATTRIBUTED')

  // Restart do worker: serializa em JSON para storage/SQLite e reconstrói sem perder allowlist
  const beforeRestart = recordTrackedSlotOutput(
    createAttemptCorrelationSession({
      attemptId: 'attempt-restart',
      commandId: 'cmd-restart',
      baselineClosedPanel: true,
      excludeShas: [beachA],
    }),
    {
      slotKey: 'slot-restart-1',
      slotAttemptId: 'attempt-restart',
      transitionedFromProgress: true,
      src: 'https://flow-content.google/media/dddddddd-1111-4222-8333-eeeeeeeeeeee=w1376',
    },
  ).session
  const roundTripped = createAttemptCorrelationSession(
    JSON.parse(JSON.stringify(beforeRestart)),
  )
  assert.deepEqual(roundTripped.acceptedMediaIds, ['dddddddd-1111-4222-8333-eeeeeeeeeeee'])
  assert.equal(
    roundTripped.originProofByKey['media:dddddddd-1111-4222-8333-eeeeeeeeeeee'],
    'tracked_progress_slot',
  )

  // Quando correlação continua incerta, informa exatamente o que falta e mantém pendente:
  const emptyCorr = createAttemptCorrelationSession({ attemptId: 'attempt-uncertain' })
  const uncertainEval = evaluatePositiveOrigin({
    candidateSrc: 'https://flow-content.google/media/unknown.jpg',
    requireAllowlist: true,
    correlationSession: emptyCorr,
  })
  assert.equal(uncertainEval.ok, false)
  assert.equal(uncertainEval.correlationUncertain, true)
  assert.ok(Array.isArray(uncertainEval.missingCorrelation))
  assert.ok(uncertainEval.missingCorrelation.includes('flow_rpc_output_ids_not_observed'))
  assert.ok(
    uncertainEval.missingCorrelation.includes('tracked_progress_slot_to_image_lineage_not_observed'),
  )
  assert.deepEqual(diagnoseMissingCorrelation(null), [
    'no_persisted_correlation_session',
    'no_pre_submit_baseline',
    'no_rpc_generation_correlation',
    'no_tracked_progress_slot_lineage',
  ])

  // Recuperação por seleção explícita do usuário funciona sem fingir correlação automática:
  const explicitEval = evaluateCaptureCandidateIdentity({
    candidateSha: ship1,
    candidateKey: 'media:explicit-ship-tile-1',
    candidateMediaId: 'explicit-ship-tile-1',
    explicitSelectionKeys: ['media:explicit-ship-tile-1'],
    requireAllowlist: true,
  })
  assert.equal(explicitEval.ok, true)
  assert.equal(explicitEval.originProof, 'explicit_user_selection')
  assert.equal(explicitEval.automaticCorrelation, false)
}

// 7) Auxiliares preservados (pickLegitimateOwner prioriza origem verificada; matchPromptEvidenceLabels PT/EN)
{
  const owner = pickLegitimateOwner([
    { id: 'early-mis', attemptId: 'mata', createdAt: '2026-11-14T15:32:31.348Z', hasVerifiedOrigin: false },
    { id: 'verified', attemptId: 'praia', createdAt: '2026-11-14T15:33:00.000Z', hasVerifiedOrigin: true },
  ])
  assert.equal(owner.keepAttemptId, 'praia')
  assert.equal(owner.keepBindingId, 'verified')

  const r = matchPromptEvidenceLabels(SHIP_PROMPT, [
    'Singer performing on gospel ship',
    '[cantor] singing on the beach.',
  ])
  assert.equal(r.matched, true)
  assert.equal(r.mode, 'scene_token_overlap')

  assert.equal(
    isCandidateExcludedByBaseline({
      excludeSrcs: ['https://flow-content.google/media/old-1'],
      excludeShas: [beachA],
      candidateSha: beachA,
      candidateSrc: 'blob:https://flow.google.com/new',
    }),
    true,
  )
  assert.deepEqual(mergeIdentityLists(['a', 'b'], ['b', 'c'], null, ['']), ['a', 'b', 'c'])
}

console.log('resultIdentityContract.test.mjs: ALL TESTS PASSED')
