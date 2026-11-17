type StatusResponse = {
  namespace: string
  realFlowValidated: boolean
  installationId: string | null
  paired: boolean
  endpoint: string | null
  preferredEndpoint?: string | null
  connectionState?: string
  hasPairingToken?: boolean
  pairingTokenFingerprint?: string | null
  lastError: string | null
  lastHealthOk: boolean | null
  lastHelloOk: boolean | null
  reconnectAttempt?: number
  logs: Array<{ at: string; level: string; message: string }>
}

function connectionLabel(state?: string | null): string {
  switch (state) {
    case 'connected':
      return 'conectada'
    case 'reconnecting':
      return 'reconectando'
    case 'atlas_unavailable':
      return 'Atlas indisponível'
    case 'credential_rejected':
      return 'credencial rejeitada'
    case 'unpaired':
      return 'sem pareamento'
    default:
      return state || '—'
  }
}

function renderLogs(logs: StatusResponse['logs']): void {
  const el = document.getElementById('logs')
  if (!el) return
  if (!logs.length) {
    el.textContent = 'Sem logs ainda.'
    return
  }
  el.textContent = logs
    .slice(-30)
    .map((entry) => `${entry.at} [${entry.level}] ${entry.message}`)
    .join('\n')
}

async function refresh(): Promise<void> {
  const badge = document.getElementById('badge')
  const status = document.getElementById('status')
  const endpoint = document.getElementById('endpoint') as HTMLInputElement | null
  const token = document.getElementById('token') as HTMLInputElement | null
  if (!badge || !status) return

  const response = (await chrome.runtime.sendMessage({
    type: 'atlas-flow-v1.getStatus',
  })) as StatusResponse

  badge.textContent = connectionLabel(response.connectionState)
  const activeEndpoint = response.endpoint || response.preferredEndpoint || '—'
  status.innerHTML =
    `Sessão da extensão (Chrome do usuário).<br/>` +
    `Flow real: <strong>NÃO VALIDADO</strong>.<br/>` +
    `estado: <code>${connectionLabel(response.connectionState)}</code><br/>` +
    `endpoint: <code>${activeEndpoint}</code><br/>` +
    `token fp: <code>${response.pairingTokenFingerprint ?? '—'}</code><br/>` +
    `installationId: <code>${response.installationId ?? '—'}</code><br/>` +
    `health: ${response.lastHealthOk ?? '—'} · hello: ${response.lastHelloOk ?? '—'}<br/>` +
    (response.lastError ? `erro: ${response.lastError}<br/>` : '') +
    (response.hasPairingToken
      ? 'Credencial persistida. Campo token vazio mantém a salva.'
      : 'Gere um código em Atlas → Flow → Conexão e cole acima.')

  // Só preenche endpoint se já houver autoridade salva — nunca inventa porta default.
  if (
    endpoint &&
    !endpoint.value &&
    activeEndpoint !== '—' &&
    (response.hasPairingToken || response.connectionState === 'connected')
  ) {
    endpoint.value = activeEndpoint
  }
  if (token) {
    token.value = ''
    token.placeholder = response.hasPairingToken
      ? 'token já armazenado (não exibido)'
      : 'opcional — prefira o código de pareamento'
  }
  renderLogs(response.logs ?? [])
}

async function runDiagnostics(): Promise<void> {
  const endpoint = (document.getElementById('endpoint') as HTMLInputElement).value.trim()
  const pairingToken = (document.getElementById('token') as HTMLInputElement).value.trim()
  const pairingCode = (document.getElementById('pairingCode') as HTMLInputElement).value.trim()
  const resultEl = document.getElementById('result')
  if (resultEl) resultEl.textContent = 'Conectando…'

  const result = await chrome.runtime.sendMessage({
    type: 'atlas-flow-v1.runDiagnostics',
    payload: {
      endpoint: endpoint || undefined,
      // vazio = manter credencial existente (não enviar string vazia como override)
      pairingToken: pairingToken || undefined,
      pairingCode: pairingCode || undefined,
    },
  })

  if (resultEl) {
    resultEl.textContent = JSON.stringify(result, null, 2)
  }
  const codeInput = document.getElementById('pairingCode') as HTMLInputElement | null
  if (codeInput && (result as { ok?: boolean })?.ok) codeInput.value = ''
  await refresh()
}

async function inspectSession(): Promise<void> {
  const resultEl = document.getElementById('result')
  if (resultEl) resultEl.textContent = 'Inspecionando abas flow.google.com…'
  const result = await chrome.runtime.sendMessage({ type: 'atlas-flow-v1.inspectSession' })
  if (resultEl) resultEl.textContent = JSON.stringify(result, null, 2)
  await refresh()
}

document.getElementById('run')?.addEventListener('click', () => {
  void runDiagnostics()
})

document.getElementById('reconnect')?.addEventListener('click', () => {
  void (async () => {
    const resultEl = document.getElementById('result')
    if (resultEl) resultEl.textContent = 'Reconectando…'
    const result = await chrome.runtime.sendMessage({ type: 'atlas-flow-v1.reconnect' })
    if (resultEl) resultEl.textContent = JSON.stringify(result, null, 2)
    await refresh()
  })()
})

document.getElementById('disconnect')?.addEventListener('click', () => {
  void (async () => {
    if (!window.confirm('Desconectar e apagar a credencial salva nesta extensão?')) return
    const resultEl = document.getElementById('result')
    const result = await chrome.runtime.sendMessage({ type: 'atlas-flow-v1.disconnect' })
    if (resultEl) resultEl.textContent = JSON.stringify(result, null, 2)
    await refresh()
  })()
})

async function ensureProject(): Promise<void> {
  const resultEl = document.getElementById('result')
  if (resultEl) resultEl.textContent = 'Solicitando project.ensure (idempotente)…'
  const result = await chrome.runtime.sendMessage({
    type: 'atlas-flow-v1.ensureProject',
    payload: {
      requestedTitle: `Atlas Flow ${new Date().toISOString().slice(0, 16)}`,
    },
  })
  if (resultEl) resultEl.textContent = JSON.stringify(result, null, 2)
  await refresh()
}

document.getElementById('inspect')?.addEventListener('click', () => {
  void inspectSession()
})

document.getElementById('ensure')?.addEventListener('click', () => {
  void ensureProject()
})

document.getElementById('inspectProject')?.addEventListener('click', () => {
  void (async () => {
    const resultEl = document.getElementById('result')
    if (resultEl) resultEl.textContent = 'Inspecionando projeto vinculado…'
    const result = await chrome.runtime.sendMessage({
      type: 'atlas-flow-v1.inspectLinkedProject',
    })
    if (resultEl) resultEl.textContent = JSON.stringify(result, null, 2)
    await refresh()
  })()
})

document.getElementById('openUpload')?.addEventListener('click', () => {
  void (async () => {
    const resultEl = document.getElementById('result')
    if (resultEl) {
      resultEl.textContent =
        'Aguardando projeto pronto (origem/ID/editor/controles) e então abrindo upload…'
    }
    const result = await chrome.runtime.sendMessage({ type: 'atlas-flow-v1.openUploadUi' })
    if (resultEl) resultEl.textContent = JSON.stringify(result, null, 2)
    await refresh()
  })()
})

document.getElementById('reconcileRefs')?.addEventListener('click', () => {
  void (async () => {
    const resultEl = document.getElementById('result')
    if (resultEl) {
      resultEl.textContent =
        'Reconciliando referências existentes (só diagnóstico/binding inequívoco; sem upload/anexo/gerar)…'
    }
    const result = await chrome.runtime.sendMessage({
      type: 'atlas-flow-v1.reconcileReferences',
    })
    if (resultEl) resultEl.textContent = JSON.stringify(result, null, 2)
    await refresh()
  })()
})

document.getElementById('attachBound')?.addEventListener('click', () => {
  void (async () => {
    const resultEl = document.getElementById('result')
    if (resultEl) {
      resultEl.textContent = 'Anexando 2 refs uploaded_bound ao prompt (sem reenvio/gerar)…'
    }
    const result = await chrome.runtime.sendMessage({
      type: 'atlas-flow-v1.attachBoundReferences',
    })
    if (resultEl) resultEl.textContent = JSON.stringify(result, null, 2)
    await refresh()
  })()
})

document.getElementById('verifyComposer')?.addEventListener('click', () => {
  void (async () => {
    const resultEl = document.getElementById('result')
    if (resultEl) {
      resultEl.textContent =
        'Probe CDP no compositor direto (marcador + restore; sem Start, sem Aprovar)…'
    }
    const result = await chrome.runtime.sendMessage({
      type: 'atlas-flow-v1.verifyDirectImageComposer',
    })
    if (resultEl) resultEl.textContent = JSON.stringify(result, null, 2)
    await refresh()
  })()
})

document.getElementById('promptGenerate')?.addEventListener('click', () => {
  void (async () => {
    const resultEl = document.getElementById('result')
    if (resultEl) {
      resultEl.textContent =
        'Escrevendo prompt e clicando Start generation (sem reenvio; marco NÃO VALIDADO até bytes)…'
    }
    const result = await chrome.runtime.sendMessage({
      type: 'atlas-flow-v1.promptAndGenerate',
    })
    if (resultEl) resultEl.textContent = JSON.stringify(result, null, 2)
    await refresh()
  })()
})

document.getElementById('observeGen')?.addEventListener('click', () => {
  void (async () => {
    const resultEl = document.getElementById('result')
    if (resultEl) {
      resultEl.textContent = 'Observando mídia nova na linha (até ~90s). Clique ≠ marco validado…'
    }
    const result = await chrome.runtime.sendMessage({
      type: 'atlas-flow-v1.observeGenerationResult',
    })
    if (resultEl) resultEl.textContent = JSON.stringify(result, null, 2)
    await refresh()
  })()
})

document.getElementById('captureBytes')?.addEventListener('click', () => {
  void (async () => {
    const resultEl = document.getElementById('result')
    if (resultEl) {
      resultEl.textContent = 'Lendo bytes das imgs na linha e gravando hash no Coordinator…'
    }
    const result = await chrome.runtime.sendMessage({
      type: 'atlas-flow-v1.captureGenerationBytes',
    })
    if (resultEl) resultEl.textContent = JSON.stringify(result, null, 2)
    await refresh()
  })()
})

document.getElementById('attachTwo')?.addEventListener('click', () => {
  void (async () => {
    const resultEl = document.getElementById('result')
    if (resultEl) {
      resultEl.textContent =
        'Upload real (bytes/hash) → bind → attach separado → prompt → gerar (NÃO VALIDADO)…'
    }
    const result = await chrome.runtime.sendMessage({
      type: 'atlas-flow-v1.attachTwoReferences',
      payload: { runGenerate: true },
    })
    if (resultEl) resultEl.textContent = JSON.stringify(result, null, 2)
    await refresh()
  })()
})

document.getElementById('clear')?.addEventListener('click', () => {
  void chrome.runtime.sendMessage({ type: 'atlas-flow-v1.clearLogs' }).then(() => refresh())
})

try {
  chrome.runtime.connect({ name: 'atlas-flow-v1-popup' })
} catch {
  /* ignore */
}

void refresh()
