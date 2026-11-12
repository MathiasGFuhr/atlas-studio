const PORTS = [39207, 39208, 39209, 39210, 39211]
const EXTENSION_VERSION = '1.0.41'
/** Acorda o service worker periodicamente — sem isso o Chrome dorme e para de pollear a ponte. */
const POLL_ALARM = 'atlas-flow-bridge-poll'
/**
 * URL canônica confirmada na UI do Google Flow:
 * https://flow.google.com/project/{uuid}
 * Criação: home + clique em “New project” ( /project/new no flow.google.com vira 404 ).
 * Uma única aba worker em segundo plano — o Atlas nunca abre abas novas via spawn.
 */
const FLOW_HOME = 'https://flow.google.com/'
const WORKER_TAB_KEY = 'atlasFlowWorkerTabId'

/** @type {{ port: number, token: string } | null} */
let bridge = null
let pollTimer = null
let busy = false

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isProjectNotFoundUrl(url) {
  return /\/404\b/i.test(url || '') || /[?&]reason=project\b/i.test(url || '')
}

function isDeadEndProjectUrl(url) {
  return isProjectNotFoundUrl(url) || /\/project\/new(?:\/|[?#]|$)/i.test(url || '')
}

function isFlowUrl(url) {
  if (!url) return false
  if (isDeadEndProjectUrl(url)) return false
  return (
    /https?:\/\/(www\.)?flow\.google\.com\//i.test(url) ||
    /labs\.google\/.*\/tools\/flow/i.test(url)
  )
}

function parseProjectId(url) {
  const raw = String(url || '')
  if (isDeadEndProjectUrl(raw)) return null
  const match =
    raw.match(/flow\.google\.com\/project\/([a-f0-9-]{8,})(?:\/|[?#]|$)/i) ||
    raw.match(/\/tools\/flow\/project\/([a-f0-9-]{8,})(?:\/|[?#]|$)/i)
  if (!match) return null
  const id = match[1]
  if (id.toLowerCase() === 'new') return null
  return id
}

function projectUrl(id) {
  return `https://flow.google.com/project/${id}`
}

async function discoverBridge() {
  for (const port of PORTS) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/hello`, {
        method: 'GET',
        cache: 'no-store',
      })
      if (!response.ok) continue
      const data = await response.json()
      if (data?.app !== 'atlas-studio' || !data?.token) continue
      bridge = { port, token: String(data.token) }
      await chrome.storage.local.set({
        atlasFlowBridge: bridge,
        lastHelloAt: Date.now(),
      })
      const workerTabId = await getStoredWorkerTabId()
      await postEvent({
        type: 'extension_hello',
        extensionVersion: EXTENSION_VERSION,
        accountHint: null,
        workerTabId,
      })
      return bridge
    } catch {
      // próxima porta
    }
  }
  return null
}

async function ensureBridge() {
  if (bridge) return bridge
  const stored = await chrome.storage.local.get(['atlasFlowBridge'])
  if (stored.atlasFlowBridge?.port && stored.atlasFlowBridge?.token) {
    bridge = stored.atlasFlowBridge
    return bridge
  }
  return discoverBridge()
}

async function bridgeFetch(path, options = {}) {
  const current = await ensureBridge()
  if (!current) throw new Error('Atlas não encontrado em localhost.')
  const url = new URL(`http://127.0.0.1:${current.port}${path}`)
  const headers = new Headers(options.headers || {})
  headers.set('Authorization', `Bearer ${current.token}`)
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(url, { ...options, headers, cache: 'no-store' })
  if (response.status === 401) {
    bridge = null
    await chrome.storage.local.remove('atlasFlowBridge')
    const again = await discoverBridge()
    if (!again) throw new Error('Token da ponte expirado. Reabra o Atlas.')
    return bridgeFetch(path, options)
  }
  return response
}

async function postEvent(event) {
  const response = await bridgeFetch('/v1/events', {
    method: 'POST',
    body: JSON.stringify(event),
  })
  if (!response.ok) {
    throw new Error(`Falha ao enviar evento (${response.status})`)
  }
}

async function getStoredWorkerTabId() {
  const stored = await chrome.storage.local.get([WORKER_TAB_KEY])
  const id = stored[WORKER_TAB_KEY]
  return typeof id === 'number' ? id : null
}

async function setStoredWorkerTabId(tabId) {
  await chrome.storage.local.set({ [WORKER_TAB_KEY]: tabId })
}

async function clearStoredWorkerTabId() {
  await chrome.storage.local.remove(WORKER_TAB_KEY)
}

async function findExistingFlowTabs() {
  const tabs = await chrome.tabs.query({
    url: ['https://flow.google.com/*', 'https://labs.google/*'],
  })
  return tabs.filter((tab) => tab.id != null && isFlowUrl(tab.url || ''))
}

async function ensureWorkerTab({ activate = false, url = FLOW_HOME } = {}) {
  const preferredId = await getStoredWorkerTabId()
  if (preferredId != null) {
    try {
      const tab = await chrome.tabs.get(preferredId)
      if (tab?.id != null) {
        const current = String(tab.url || '')
        if (isDeadEndProjectUrl(current) || !isFlowUrl(current)) {
          // Aba presa em 404?reason=project — sair dali ANTES de waitForTabReady.
          // Nunca active:true aqui salvo pedido explícito (login / Ver no Flow).
          await chrome.tabs.update(tab.id, { url: url || FLOW_HOME, active: Boolean(activate) })
          await waitForTabReady(tab.id, 45000)
        } else if (activate) {
          await chrome.tabs.update(tab.id, { active: true })
        }
        if (activate && tab.windowId != null) {
          await chrome.windows.update(tab.windowId, { focused: true })
        }
        await setStoredWorkerTabId(tab.id)
        return await chrome.tabs.get(tab.id)
      }
    } catch (error) {
      if (error?.code === 'project_not_found') {
        // Ainda em 404 após tentativa — tenta home de novo abaixo.
        await clearStoredWorkerTabId()
      } else {
        await clearStoredWorkerTabId()
      }
    }
  }

  const existing = await findExistingFlowTabs()
  if (existing.length > 0) {
    // Preferir aba inativa já aberta — evita criar segunda aba e roubar foco.
    const tab = existing.find((item) => item.active !== true) || existing[0]
    await setStoredWorkerTabId(tab.id)
    if (activate) {
      await chrome.tabs.update(tab.id, { active: true })
      if (tab.windowId != null) {
        await chrome.windows.update(tab.windowId, { focused: true })
      }
    }
    return tab
  }

  try {
    // Única criação permitida: aba worker. Automação → active:false.
    const created = await chrome.tabs.create({
      url: url || FLOW_HOME,
      active: Boolean(activate),
    })
    if (!created?.id) {
      throw new Error('Chrome não retornou aba para o Flow.')
    }
    await setStoredWorkerTabId(created.id)
    if (activate && created.windowId != null) {
      await chrome.windows.update(created.windowId, { focused: true })
    }
    return created
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Não foi possível criar a aba do Google Flow.'
    throw Object.assign(new Error(message), { code: 'browser_unavailable' })
  }
}

async function waitForTabReady(tabId, timeoutMs = 20000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId)
      if (isDeadEndProjectUrl(tab.url || '')) {
        throw Object.assign(
          new Error('Google Flow respondeu “Projeto não encontrado”. Vamos criar um projeto novo.'),
          { code: 'project_not_found' },
        )
      }
      if (tab.status === 'complete' && isFlowUrl(tab.url || '')) return tab
    } catch (error) {
      if (error?.code === 'project_not_found') throw error
      throw Object.assign(new Error('A aba do Flow foi fechada durante a operação.'), {
        code: 'browser_unavailable',
      })
    }
    await sleep(80)
  }
  return chrome.tabs.get(tabId)
}

async function waitForProjectId(tabId, timeoutMs = 45000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId)
      if (isDeadEndProjectUrl(tab.url || '')) {
        throw Object.assign(
          new Error('Google Flow respondeu 404 ao abrir o projeto.'),
          { code: 'project_not_found' },
        )
      }
      const id = parseProjectId(tab.url || '')
      // Aceitar ID assim que a URL muda — não esperar status complete.
      if (id) return { tab, remoteId: id, remoteUrl: tab.url }
    } catch (error) {
      if (error?.code === 'project_not_found') throw error
      throw Object.assign(new Error('A aba do Flow foi fechada durante a criação.'), {
        code: 'browser_unavailable',
      })
    }
    await sleep(100)
  }
  throw Object.assign(
    new Error('Tempo esgotado aguardando o Google Flow criar o projeto remoto.'),
    { code: 'create_failed' },
  )
}

async function injectContent(tabId) {
  // Só content.js — pageUpload MAIN world permanente faz o Flow bloquear (“atividade incomum”).
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    })
  } catch {
    // já injetado
  }
  await sleep(40)
}

/** Hook MAIN world só na hora do upload de arquivo (não no Criar/prompt). */
async function injectUploadHook(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['pageUpload.js'],
      world: 'MAIN',
    })
  } catch {
    /* ignore */
  }
  await sleep(40)
}

async function sendToContent(tabId, command, attempts = 3) {
  let lastError = null
  for (let i = 0; i < attempts; i += 1) {
    try {
      if (i === 0) {
        const tab = await chrome.tabs.get(tabId)
        if (tab.status !== 'complete' || !isFlowUrl(tab.url || '')) {
          await waitForTabReady(tabId)
        }
      } else {
        await waitForTabReady(tabId)
      }
      return await chrome.tabs.sendMessage(tabId, {
        source: 'atlas-flow-bridge',
        command,
      })
    } catch (error) {
      lastError = error
      await injectContent(tabId)
      await sleep(120)
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError || '')
  throw Object.assign(
    new Error(
      detail.includes('Receiving end')
        ? 'Content script do Flow não respondeu. Recarregue a extensão Atlas Flow Bridge no Chrome e tente de novo.'
        : `Falha ao falar com a aba do Flow: ${detail}`,
    ),
    { code: 'connection_failed' },
  )
}

async function navigateQuiet(tabId, url) {
  await chrome.tabs.update(tabId, { url, active: false })
  await waitForTabReady(tabId)
}

async function activateForLogin(tab) {
  try {
    await chrome.tabs.update(tab.id, { active: true })
    if (tab.windowId != null) {
      await chrome.windows.update(tab.windowId, { focused: true })
    }
  } catch {
    // segue
  }
}

async function waitUntilProjectGone(tabId, remoteId, timeoutMs = 30000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId)
      const url = tab.url || ''
      if (isDeadEndProjectUrl(url)) return true
      const current = parseProjectId(url)
      if (!current || current !== remoteId) return true
    } catch {
      return true
    }
    await sleep(300)
  }
  throw Object.assign(new Error('O Google Flow não confirmou a exclusão do projeto.'), {
    code: 'delete_failed',
  })
}

async function runDeleteProject(command) {
  const remoteId = String(command.remoteId || '').trim()
  if (!remoteId) {
    await postEvent({
      type: 'error',
      requestId: command.requestId,
      code: 'delete_failed',
      message: 'Sem ID remoto para excluir no Google Flow.',
    })
    return
  }

  const targetUrl = command.remoteUrl || projectUrl(remoteId)
  const tab = await ensureWorkerTab({ activate: false, url: FLOW_HOME })

  try {
    await navigateQuiet(tab.id, targetUrl)
  } catch (error) {
    if (error?.code === 'project_not_found') {
      await postEvent({
        type: 'project_deleted',
        requestId: command.requestId,
        remoteId,
        source: 'atlas',
      })
      return
    }
    throw error
  }

  await injectContent(tab.id)
  const deleted = await sendToContent(tab.id, { step: 'delete' })
  if (deleted?.type === 'needs_login' || deleted?.code === 'not_authenticated') {
    await activateForLogin(tab)
    await postEvent({
      type: 'needs_login',
      requestId: command.requestId,
      loginUrl: deleted.loginUrl || FLOW_HOME,
      message:
        deleted.message ||
        'Faça login na aba do Google Flow já aberta no Chrome e tente excluir de novo.',
    })
    return
  }
  if (deleted?.code === 'project_not_found' || deleted?.alreadyGone) {
    await postEvent({
      type: 'project_deleted',
      requestId: command.requestId,
      remoteId,
      source: 'atlas',
    })
    return
  }
  if (!deleted || deleted.ok === false) {
    await postEvent({
      type: 'error',
      requestId: command.requestId,
      code: deleted?.code || 'delete_failed',
      message: deleted?.message || 'Não foi possível excluir o projeto no Google Flow.',
      remoteId,
    })
    return
  }

  await waitUntilProjectGone(tab.id, remoteId)
  await postEvent({
    type: 'project_deleted',
    requestId: command.requestId,
    remoteId,
    source: 'atlas',
  })
}

async function revealProject(command) {
  const targetUrl =
    (command.remoteUrl && String(command.remoteUrl).trim()) ||
    (command.remoteId ? projectUrl(command.remoteId) : FLOW_HOME)

  const tab = await ensureWorkerTab({ activate: true, url: targetUrl })
  const currentId = parseProjectId(tab.url || '')
  if (command.remoteId && currentId !== command.remoteId) {
    await chrome.tabs.update(tab.id, { url: targetUrl, active: true })
    await waitForTabReady(tab.id)
  }
  await postEvent({
    type: 'revealed',
    requestId: command.requestId,
    workerTabId: tab.id,
    remoteUrl: targetUrl,
  })
}

async function withDebugger(tabId, fn) {
  const target = { tabId }
  let attached = false
  try {
    await chrome.debugger.attach(target, '1.3')
    attached = true
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (!/already attached/i.test(msg)) throw error
    attached = true
  }
  try {
    return await fn(target)
  } finally {
    if (attached) {
      try {
        await chrome.debugger.detach(target)
      } catch {
        /* ignore */
      }
    }
  }
}

function waitForFileChooser(tabId, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.debugger.onEvent.removeListener(onEvent)
      reject(new Error('O Flow não abriu o seletor de arquivos.'))
    }, timeoutMs)

    function onEvent(source, method, params) {
      if (source.tabId !== tabId || method !== 'Page.fileChooserOpened') return
      clearTimeout(timer)
      chrome.debugger.onEvent.removeListener(onEvent)
      resolve(params)
    }

    chrome.debugger.onEvent.addListener(onEvent)
  })
}

async function uploadViaFileChooser(tabId, filePaths) {
  if (!filePaths.length) return { ok: false, reason: 'Sem caminhos locais.' }
  await injectUploadHook(tabId)
  return withDebugger(tabId, async (target) => {
    await chrome.debugger.sendCommand(target, 'Page.enable')
    await chrome.debugger.sendCommand(target, 'DOM.enable')
    await chrome.debugger.sendCommand(target, 'Page.setInterceptFileChooserDialog', {
      enabled: true,
    })

    const chooserPromise = waitForFileChooser(tabId, 12000)
    // prepare_upload fotografa Envios ANTES e só então abre “Enviar mídia”.
    const opened = await sendToContent(tabId, { step: 'prepare_upload' })
    if (opened?.ok === false) {
      try {
        await chrome.debugger.sendCommand(target, 'Page.setInterceptFileChooserDialog', {
          enabled: false,
        })
      } catch {
        /* ignore */
      }
      return {
        ok: false,
        reason: opened.message || 'Não achei controle de upload no Flow.',
        beforeKeys: opened.beforeKeys || [],
        beforeThumbs: opened.beforeThumbs || [],
      }
    }

    try {
      const chooser = await chooserPromise
      const backendNodeId = chooser?.backendNodeId
      if (!backendNodeId) {
        return {
          ok: false,
          reason: 'Seletor de arquivos sem backendNodeId.',
          beforeKeys: opened.beforeKeys || [],
          beforeThumbs: opened.beforeThumbs || [],
        }
      }
      await chrome.debugger.sendCommand(target, 'DOM.setFileInputFiles', {
        backendNodeId,
        files: filePaths,
      })
    } finally {
      try {
        await chrome.debugger.sendCommand(target, 'Page.setInterceptFileChooserDialog', {
          enabled: false,
        })
      } catch {
        /* ignore */
      }
    }

    return {
      ok: true,
      beforeKeys: opened.beforeKeys || [],
      beforeThumbs: opened.beforeThumbs || [],
    }
  })
}

async function cdpClick(tabId, x, y) {
  await withDebugger(tabId, async (target) => {
    const base = {
      x: Number(x),
      y: Number(y),
      button: 'left',
      buttons: 1,
      clickCount: 1,
      pointerType: 'mouse',
    }
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      ...base,
      type: 'mouseMoved',
      buttons: 0,
    })
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      ...base,
      type: 'mousePressed',
    })
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      ...base,
      type: 'mouseReleased',
      buttons: 0,
    })
  })
}

async function cdpInsertText(tabId, text) {
  const value = String(text || '')
  if (!value) return
  await withDebugger(tabId, async (target) => {
    await chrome.debugger.sendCommand(target, 'Input.insertText', { text: value })
  })
}

async function runFillPrompt(command) {
  const remoteId = String(command.remoteId || '').trim()
  if (!remoteId) {
    await postEvent({
      type: 'error',
      requestId: command.requestId,
      code: 'prompt_failed',
      message: 'Projeto remoto não informado para enviar o prompt.',
    })
    return
  }

  const prompt = String(command.prompt || '').trim()
  if (!prompt) {
    await postEvent({
      type: 'error',
      requestId: command.requestId,
      code: 'prompt_failed',
      message: 'Prompt vazio.',
      remoteId,
    })
    return
  }

  const targetUrl =
    (command.remoteUrl && String(command.remoteUrl).trim()) || projectUrl(remoteId)

  await postEvent({
    type: 'progress',
    requestId: command.requestId,
    stage: 'open_project',
    message: 'Abrindo o projeto no Flow para criar…',
  })

  // Precisa da aba ativa — em background o Generate do Flow não dispara.
  let tab = await ensureWorkerTab({ activate: true, url: targetUrl })
  if (parseProjectId(tab.url || '') !== remoteId) {
    await chrome.tabs.update(tab.id, { url: targetUrl, active: true })
    if (tab.windowId != null) {
      try {
        await chrome.windows.update(tab.windowId, { focused: true })
      } catch {
        /* ignore */
      }
    }
    tab = await chrome.tabs.get(tab.id)
  }
  await waitForTabReady(tab.id)
  await injectContent(tab.id)
  await activateForLogin(tab)

  const probe = await sendToContent(tab.id, { step: 'probe' })
  if (probe?.type === 'needs_login' || probe?.code === 'not_authenticated') {
    await activateForLogin(tab)
    await postEvent({
      type: 'needs_login',
      requestId: command.requestId,
      loginUrl: probe.loginUrl || FLOW_HOME,
      message:
        probe.message ||
        'Faça login na aba do Google Flow já aberta no Chrome e tente enviar de novo.',
    })
    return
  }

  if (probe?.code === 'project_not_found' || parseProjectId(tab.url || '') !== remoteId) {
    await postEvent({
      type: 'error',
      requestId: command.requestId,
      code: 'project_not_found',
      message: 'Projeto não encontrado no Google Flow para receber o prompt.',
      remoteId,
      remoteUrl: targetUrl,
    })
    return
  }

  const refs = Array.isArray(command.references) ? command.references : []

  await postEvent({
    type: 'progress',
    requestId: command.requestId,
    stage: 'fill_prompt',
    message: 'Preenchendo o prompt e clicando em Generate…',
  })

  const submit = command.submit !== false
  const result = await sendToContent(tab.id, {
    step: 'fill_prompt',
    remoteId,
    prompt,
    segments: Array.isArray(command.segments) ? command.segments : [],
    references: refs,
    imageModel: command.imageModel || null,
    imageModelLabel: command.imageModelLabel || null,
    imageOutputs: command.imageOutputs ?? null,
    submit,
  }, 1)

  if (result?.type === 'needs_login' || result?.code === 'not_authenticated') {
    await activateForLogin(tab)
    await postEvent({
      type: 'needs_login',
      requestId: command.requestId,
      loginUrl: result.loginUrl || FLOW_HOME,
      message: result.message || 'Faça login no Google Flow e tente de novo.',
    })
    return
  }

  if (result?.code === 'unusual_activity' || result?.unusualActivity) {
    await postEvent({
      type: 'generation_blocked',
      requestId: command.requestId,
      remoteId,
      code: 'unusual_activity',
      message:
        result.message ||
        'O Flow reportou atividade incomum. Geração automática pausada — não houve cobrança.',
    })
    return
  }

  if (!result || result.ok === false) {
    await postEvent({
      type: 'error',
      requestId: command.requestId,
      code: result?.code || 'prompt_failed',
      message: result?.message || 'Não foi possível preencher o prompt no Google Flow.',
      remoteId,
      remoteUrl: targetUrl,
    })
    return
  }

  await activateForLogin(tab)
  await postEvent({
    type: 'prompt_filled',
    requestId: command.requestId,
    remoteId,
    mentions: Number(result.mentions) || 0,
    submitted: Boolean(result.submitted),
    attachedLabels: Array.isArray(result.attachedLabels) ? result.attachedLabels : [],
    verified: result.verified !== false,
    message:
      result.message ||
      (result.submitted
        ? 'Criação disparada no Flow.'
        : 'Prompt/anexos preparados no Flow (sem Generate).'),
  })
}

async function runUploadReferences(command) {
  const remoteId = String(command.remoteId || '').trim()
  if (!remoteId) {
    await postEvent({
      type: 'error',
      requestId: command.requestId,
      code: 'upload_failed',
      message: 'Projeto remoto não informado para enviar referências.',
    })
    return
  }

  const refs = Array.isArray(command.references) ? command.references : []
  if (refs.length === 0) {
    await postEvent({
      type: 'error',
      requestId: command.requestId,
      code: 'upload_failed',
      message: 'Nenhuma imagem de referência para enviar.',
      remoteId,
    })
    return
  }

  const targetUrl =
    (command.remoteUrl && String(command.remoteUrl).trim()) || projectUrl(remoteId)

  await postEvent({
    type: 'progress',
    requestId: command.requestId,
    stage: 'open_project',
    message: 'Enviando referências no Flow em segundo plano…',
  })

  // Nunca ativar a aba — não pode roubar o foco do usuário.
  let tab = await ensureWorkerTab({ activate: false, url: targetUrl })
  if (parseProjectId(tab.url || '') !== remoteId) {
    await navigateQuiet(tab.id, targetUrl)
    tab = await chrome.tabs.get(tab.id)
  }
  await waitForTabReady(tab.id)
  await injectContent(tab.id)

  const probe = await sendToContent(tab.id, { step: 'probe' })
  if (probe?.type === 'needs_login' || probe?.code === 'not_authenticated') {
    await activateForLogin(tab)
    await postEvent({
      type: 'needs_login',
      requestId: command.requestId,
      loginUrl: probe.loginUrl || FLOW_HOME,
      message:
        probe.message ||
        'Faça login na aba do Google Flow já aberta no Chrome e tente enviar de novo.',
    })
    return
  }

  if (probe?.code === 'project_not_found' || parseProjectId(tab.url || '') !== remoteId) {
    await postEvent({
      type: 'error',
      requestId: command.requestId,
      code: 'project_not_found',
      message: 'Projeto não encontrado no Google Flow para receber as referências.',
      remoteId,
      remoteUrl: targetUrl,
    })
    return
  }

  const galleryOnly = command.galleryOnly !== false
  await postEvent({
    type: 'progress',
    requestId: command.requestId,
    stage: 'upload_refs',
    message: galleryOnly
      ? `Confirmando ${refs.length} referência(s) em Uploads (sem Incluir no comando)…`
      : `Anexando ${refs.length} imagem(ns) no Flow…`,
  })

  const results = []
  let uploadedCount = 0

  for (const ref of refs) {
    const refId = String(ref?.id || '').trim()
    const label = String(ref?.label || '').trim()
    const fileName = String(ref?.fileName || label || '').trim()
    const localPath = String(ref?.localPath || '').trim()
    const knownKey = String(ref?.flowUploadKey || '').trim()

    await postEvent({
      type: 'reference_progress',
      requestId: command.requestId,
      remoteId,
      refId,
      stage: 'ref_locate',
      message: `Localizando [${label || fileName}] em Uploads…`,
    })

    const ensured = await sendToContent(tab.id, {
      step: 'ensure_reference_in_uploads',
      remoteId,
      reference: ref,
      galleryOnly: true,
      knownKey,
    })

    if (ensured?.type === 'needs_login' || ensured?.code === 'not_authenticated') {
      await activateForLogin(tab)
      await postEvent({
        type: 'needs_login',
        requestId: command.requestId,
        loginUrl: ensured.loginUrl || FLOW_HOME,
        message: ensured.message || 'Faça login no Google Flow e tente de novo.',
      })
      return
    }

    // Já existe em Envios/Tudo (mesmo com várias cópias do mesmo arquivo) → só vincula.
    if (ensured?.ok && ensured?.flowUploadKey) {
      uploadedCount += 1
      results.push({
        id: refId,
        flowUploadKey: ensured.flowUploadKey,
        fileName: ensured.fileName || fileName,
        reused: true,
      })
      const dupHint =
        Number(ensured.duplicates) > 1
          ? ` (${ensured.duplicates} cópias no Flow — reutilizando, sem novo upload)`
          : ''
      await postEvent({
        type: 'reference_progress',
        requestId: command.requestId,
        remoteId,
        refId,
        stage: 'ref_reused',
        message: `[${label}] já estava no seletor — vínculo reutilizado.${dupHint}`,
        flowUploadKey: ensured.flowUploadKey,
        reused: true,
      })
      continue
    }

    // Encontrado carregando / Incluir ainda desabilitado → NÃO reenviar bytes.
    if (ensured?.pending) {
      await postEvent({
        type: 'reference_progress',
        requestId: command.requestId,
        remoteId,
        refId,
        stage: 'ref_pending',
        message:
          ensured.message ||
          `[${label}] confirmação pendente no Flow (prévia carregando). Verifique de novo sem reenviar.`,
      })
      continue
    }

    if (ensured?.ambiguous) {
      await postEvent({
        type: 'reference_progress',
        requestId: command.requestId,
        remoteId,
        refId,
        stage: 'ref_error',
        message:
          ensured.message ||
          `[${label}] tem candidatos ambíguos no seletor. Selecione explicitamente.`,
      })
      continue
    }

    // Só faz upload se o item realmente não estiver na galeria.
    if (ensured?.missing !== true) {
      await postEvent({
        type: 'reference_progress',
        requestId: command.requestId,
        remoteId,
        refId,
        stage: 'ref_pending',
        message:
          ensured.message ||
          `[${label}] não confirmado — tente verificar de novo sem reenviar os bytes.`,
      })
      continue
    }

    if (!localPath) {
      await postEvent({
        type: 'reference_progress',
        requestId: command.requestId,
        remoteId,
        refId,
        stage: 'ref_error',
        message: `Sem caminho local para enviar [${label || fileName}].`,
      })
      continue
    }

    try {
      const viaChooser = await uploadViaFileChooser(tab.id, [localPath])
      if (!viaChooser.ok) {
        // Fallback base64/set-files só desta ref.
        const fallback = await sendToContent(tab.id, {
          step: 'upload_references_gallery',
          remoteId,
          references: [ref],
        })
        if (!fallback?.ok) {
          await postEvent({
            type: 'reference_progress',
            requestId: command.requestId,
            remoteId,
            refId,
            stage: fallback?.pending ? 'ref_pending' : 'ref_error',
            message:
              fallback?.message ||
              viaChooser.reason ||
              `Falha ao enviar [${label}] para Uploads.`,
          })
          continue
        }
        if (fallback?.ok && fallback.flowUploadKey) {
          uploadedCount += 1
          results.push({
            id: refId,
            flowUploadKey: fallback.flowUploadKey,
            fileName: fallback.fileName || fileName,
            reused: Boolean(fallback.reused),
          })
          await postEvent({
            type: 'reference_progress',
            requestId: command.requestId,
            remoteId,
            refId,
            stage: fallback.reused ? 'ref_reused' : 'ref_sent',
            message: `[${label}] confirmada em Uploads.`,
            flowUploadKey: fallback.flowUploadKey,
            reused: Boolean(fallback.reused),
          })
          continue
        }
      }

      const confirmed = await sendToContent(tab.id, {
        step: 'confirm_reference_in_uploads',
        remoteId,
        reference: ref,
        beforeKeys: viaChooser?.beforeKeys || [],
        galleryOnly: true,
      })
      if (!confirmed?.ok || !confirmed.flowUploadKey) {
        await postEvent({
          type: 'reference_progress',
          requestId: command.requestId,
          remoteId,
          refId,
          stage: confirmed?.pending ? 'ref_pending' : 'ref_error',
          message:
            confirmed?.message ||
            `Upload de [${label}] não ficou selecionável a tempo no seletor.`,
        })
        continue
      }

      uploadedCount += 1
      results.push({
        id: refId,
        flowUploadKey: confirmed.flowUploadKey,
        fileName: confirmed.fileName || fileName,
        reused: false,
      })
      await postEvent({
        type: 'reference_progress',
        requestId: command.requestId,
        remoteId,
        refId,
        stage: 'ref_sent',
        message: `[${label}] confirmada em Uploads.`,
        flowUploadKey: confirmed.flowUploadKey,
        reused: false,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      await postEvent({
        type: 'reference_progress',
        requestId: command.requestId,
        remoteId,
        refId,
        stage: 'ref_error',
        message: `Erro ao enviar [${label}]: ${detail}`,
      })
    }
  }

  if (uploadedCount <= 0) {
    await postEvent({
      type: 'error',
      requestId: command.requestId,
      code: 'upload_failed',
      message:
        'Nenhuma referência foi confirmada no seletor do Flow. Se o arquivo já aparece (mesmo carregando), clique de novo em “Enviar referências ao Flow” para só vincular — sem nova cópia.',
      remoteId,
      remoteUrl: targetUrl,
    })
    return
  }

  await postEvent({
    type: 'references_uploaded',
    requestId: command.requestId,
    remoteId,
    uploaded: uploadedCount,
    results,
    message: `${uploadedCount} referência(s) confirmada(s) em Uploads.`,
  })
}

async function runCreateProject(command, tab) {
  await postEvent({
    type: 'progress',
    requestId: command.requestId,
    stage: 'probe',
    message: 'Verificando sessão do Google Flow…',
  })

  const probe = await sendToContent(tab.id, { step: 'probe' })
  if (probe?.type === 'needs_login' || probe?.code === 'not_authenticated') {
    await activateForLogin(tab)
    return {
      type: 'needs_login',
      loginUrl: probe.loginUrl || FLOW_HOME,
      message:
        probe.message ||
        'Faça login na aba do Google Flow já aberta no Chrome (sem nova aba).',
    }
  }

  let remoteId =
    probe?.code === 'project_not_found' ? null : command.remoteId?.trim() || null
  let remoteUrl = remoteId ? projectUrl(remoteId) : null
  let partial = null

  if (remoteId) {
    await postEvent({
      type: 'progress',
      requestId: command.requestId,
      stage: 'recover',
      message: 'Recuperando projeto remoto já conhecido…',
    })
    try {
      await navigateQuiet(tab.id, projectUrl(remoteId))
      const ready = await waitForProjectId(tab.id, 45000)
      remoteId = ready.remoteId
      remoteUrl = ready.remoteUrl || projectUrl(remoteId)
    } catch (error) {
      if (error?.code !== 'project_not_found') throw error
      // ID inválido/404 → cria um projeto novo sem duplicar lógica de nome.
      remoteId = null
      remoteUrl = null
    }
  }

  if (!remoteId) {
    await postEvent({
      type: 'progress',
      requestId: command.requestId,
      stage: 'create',
      message: 'Criando projeto novo no Google Flow…',
    })
    // /project/new no flow.google.com responde 404 — criar via UI (New project).
    // Se a worker já está na home (pré-aquecida), não recarrega a página.
    const currentUrl = String((await chrome.tabs.get(tab.id)).url || '')
    const onHome =
      isFlowUrl(currentUrl) &&
      !parseProjectId(currentUrl) &&
      !isDeadEndProjectUrl(currentUrl) &&
      /flow\.google\.com\/?$/i.test(currentUrl.replace(/[?#].*$/, ''))
    if (!onHome) {
      await navigateQuiet(tab.id, FLOW_HOME)
    }
    await injectContent(tab.id)
    const clicked = await sendToContent(tab.id, { step: 'create_click' })
    if (clicked?.type === 'needs_login' || clicked?.code === 'not_authenticated') {
      await activateForLogin(tab)
      return {
        type: 'needs_login',
        loginUrl: clicked.loginUrl || FLOW_HOME,
        message:
          clicked.message ||
          'Faça login na aba do Google Flow já aberta no Chrome (sem nova aba).',
      }
    }
    if (clicked?.code === 'project_not_found' || !clicked || clicked.ok === false) {
      if (clicked?.code === 'project_not_found') {
        await chrome.tabs.update(tab.id, { url: FLOW_HOME, active: false })
        await waitForTabReady(tab.id)
        await injectContent(tab.id)
        const retryClick = await sendToContent(tab.id, { step: 'create_click' })
        if (retryClick?.type === 'needs_login' || retryClick?.code === 'not_authenticated') {
          await activateForLogin(tab)
          return {
            type: 'needs_login',
            loginUrl: retryClick.loginUrl || FLOW_HOME,
            message:
              retryClick.message ||
              'Faça login na aba do Google Flow já aberta no Chrome (sem nova aba).',
          }
        }
        if (!retryClick || retryClick.ok === false) {
          return {
            ok: false,
            code: retryClick?.code || clicked?.code || 'create_failed',
            message:
              retryClick?.message ||
              clicked?.message ||
              'Botão “New project” / “Novo projeto” não encontrado na home do Flow.',
          }
        }
      } else {
        return {
          ok: false,
          code: clicked?.code || 'create_failed',
          message:
            clicked?.message ||
            'Botão “New project” / “Novo projeto” não encontrado na home do Flow.',
        }
      }
    }
    let created
    try {
      created = await waitForProjectId(tab.id, 60000)
    } catch (error) {
      if (error?.code !== 'project_not_found') throw error
      await chrome.tabs.update(tab.id, { url: FLOW_HOME, active: false })
      await waitForTabReady(tab.id)
      await injectContent(tab.id)
      const retryClick = await sendToContent(tab.id, { step: 'create_click' })
      if (!retryClick || retryClick.ok === false) {
        return {
          ok: false,
          code: retryClick?.code || 'create_failed',
          message:
            retryClick?.message ||
            'Não foi possível criar o projeto pelo botão New project do Flow.',
        }
      }
      created = await waitForProjectId(tab.id, 60000)
    }
    remoteId = created.remoteId
    remoteUrl = created.remoteUrl || projectUrl(remoteId)
    partial = { remoteId, remoteUrl }
  }

  if (partial) {
    await postEvent({
      type: 'project_partial',
      requestId: command.requestId,
      operationId: command.operationId,
      remoteId: partial.remoteId,
      remoteUrl: partial.remoteUrl,
    })
  }

  await postEvent({
    type: 'progress',
    requestId: command.requestId,
    stage: 'rename',
    message: 'Definindo o nome do projeto…',
  })

  // Título padrão (“nov. 08 - 20:40”) aparece logo após a URL — tentar rápido e retentar curto.
  await sleep(180)
  await injectContent(tab.id)
  let renamed = await sendToContent(tab.id, {
    step: 'rename',
    name: command.name,
  })
  if (renamed?.ok === false && renamed?.code === 'rename_failed') {
    await sleep(350)
    await injectContent(tab.id)
    renamed = await sendToContent(tab.id, {
      step: 'rename',
      name: command.name,
    })
  }

  if (renamed?.type === 'needs_login' || renamed?.code === 'not_authenticated') {
    await activateForLogin(tab)
    return {
      type: 'needs_login',
      loginUrl: renamed.loginUrl || FLOW_HOME,
      message:
        renamed.message ||
        'Faça login na aba do Google Flow já aberta no Chrome (sem nova aba).',
      remoteId,
      remoteUrl,
    }
  }

  if (!renamed || renamed.ok === false) {
    return {
      ok: false,
      code: renamed?.code || 'rename_failed',
      message: renamed?.message || 'Falha ao renomear o projeto no Flow.',
      remoteId,
      remoteUrl,
      partial,
    }
  }

  return {
    ok: true,
    remoteId: renamed.remoteId || remoteId,
    remoteUrl: renamed.remoteUrl || remoteUrl || projectUrl(remoteId),
    name: command.name,
    accountHint: renamed.accountHint || null,
    partial,
  }
}

async function handleCommand(command) {
  if (command.type === 'ping' || command.type === 'reset_queue') {
    busy = false
    await postEvent({
      type: 'extension_hello',
      extensionVersion: EXTENSION_VERSION,
      accountHint: null,
      workerTabId: await getStoredWorkerTabId(),
    })
    return
  }

  const startedWait = Date.now()
  while (busy && Date.now() - startedWait < 180_000) {
    await sleep(400)
  }
  if (busy) busy = false

  busy = true
  const watchdog = setTimeout(() => {
    busy = false
  }, 190_000)

  try {
    if (command.type === 'reveal_project') {
      await revealProject(command)
      return
    }

    if (command.type === 'delete_project') {
      await runDeleteProject(command)
      return
    }

    if (command.type === 'upload_references') {
      await runUploadReferences(command)
      return
    }

    if (command.type === 'fill_prompt') {
      await runFillPrompt(command)
      return
    }

    if (command.type === 'ensure_session') {
      const tab = await ensureWorkerTab({ activate: Boolean(command.activate) })
      await waitForTabReady(tab.id)
      await injectContent(tab.id)
      await postEvent({
        type: 'session_ready',
        requestId: command.requestId,
        workerTabId: tab.id,
        background: !command.activate,
        url: tab.url || null,
      })
      return
    }

    let tab = await ensureWorkerTab({ activate: false })
    try {
      await waitForTabReady(tab.id)
    } catch (error) {
      if (error?.code !== 'project_not_found') throw error
      // Qualquer 404 residual → home limpa antes de criar/vincular.
      await chrome.tabs.update(tab.id, { url: FLOW_HOME, active: false })
      tab = await waitForTabReady(tab.id)
    }
    await injectContent(tab.id)

    await postEvent({
      type: 'session_ready',
      requestId: command.requestId,
      workerTabId: tab.id,
      background: true,
      url: tab.url || null,
    })
    await postEvent({
      type: 'progress',
      requestId: command.requestId,
      stage: 'tab',
      message: 'Aba Flow pronta em segundo plano.',
    })

    let result
    if (command.type === 'create_project' || command.type === 'verify_project') {
      result = await runCreateProject(
        {
          ...command,
          remoteId:
            command.type === 'verify_project' ? command.remoteId : command.remoteId || null,
          name: command.name || command.expectedName,
        },
        tab,
      )
    } else {
      result = await sendToContent(tab.id, command)
    }

    if (result?.type === 'needs_login') {
      await postEvent({
        type: 'needs_login',
        requestId: command.requestId,
        loginUrl: result.loginUrl || FLOW_HOME,
        message: result.message || 'Faça login no Google Flow.',
      })
      return
    }

    const partial = result?.partial
    if (partial?.remoteId && command.operationId) {
      await postEvent({
        type: 'project_partial',
        requestId: command.requestId,
        operationId: command.operationId,
        remoteId: partial.remoteId,
        remoteUrl: partial.remoteUrl,
      })
    }

    if (!result || result.ok === false) {
      await postEvent({
        type: 'error',
        requestId: command.requestId,
        code: result?.code || 'unknown',
        message: result?.message || 'Falha na automação do Google Flow.',
        remoteId: result?.remoteId || partial?.remoteId || null,
        remoteUrl: result?.remoteUrl || partial?.remoteUrl || null,
      })
      return
    }

    await postEvent({
      type: 'project_linked',
      requestId: command.requestId,
      operationId: command.operationId || '',
      remoteId: result.remoteId,
      remoteUrl: result.remoteUrl,
      name: result.name,
      accountHint: result.accountHint || null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await postEvent({
      type: 'error',
      requestId: command.requestId,
      code: error?.code || 'connection_failed',
      message: message.includes('Receiving end')
        ? 'Content script do Flow não respondeu. Recarregue a extensão no Chrome (chrome://extensions) e tente vincular novamente.'
        : message,
    }).catch(() => undefined)
  } finally {
    clearTimeout(watchdog)
    busy = false
  }
}

async function pollOnce() {
  try {
    const response = await bridgeFetch('/v1/commands?waitMs=12000', { method: 'GET' })
    if (!response.ok) return
    const commands = await response.json()
    if (!Array.isArray(commands) || commands.length === 0) return
    for (const command of commands) {
      await handleCommand(command)
    }
  } catch {
    bridge = null
  }
}

/**
 * Loop rápido enquanto o service worker está acordado.
 * Quando o Chrome suspende o SW, os setTimeout morrem — o chrome.alarms reacorda.
 */
function startPolling() {
  if (pollTimer) return
  const tick = async () => {
    pollTimer = null
    try {
      await pollOnce()
    } finally {
      // Reagenda só se ainda estivermos no mesmo “ciclo acordado”.
      pollTimer = setTimeout(tick, busy ? 120 : 400)
    }
  }
  pollTimer = setTimeout(tick, 0)
}

async function ensurePollAlarm() {
  try {
    const existing = await chrome.alarms.get(POLL_ALARM)
    if (existing) return
    // 0.5 min = mínimo prático no Chrome ativo; reacorda o SW sem precisar abrir o popup.
    await chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.5 })
  } catch {
    // Chromium antigo pode rejeitar 0.5 — tenta 1 minuto.
    try {
      await chrome.alarms.create(POLL_ALARM, { periodInMinutes: 1 })
    } catch {
      /* ignore */
    }
  }
}

async function wakeAndPoll() {
  await ensurePollAlarm()
  await discoverBridge()
  startPolling()
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== POLL_ALARM) return
  void wakeAndPoll()
})

chrome.tabs.onRemoved.addListener((tabId) => {
  void (async () => {
    const workerId = await getStoredWorkerTabId()
    if (workerId === tabId) await clearStoredWorkerTabId()
  })()
})

// Qualquer navegação no Flow acorda o SW (não depende do popup).
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' && !changeInfo.url) return
  const url = changeInfo.url || tab.url || ''
  if (!isFlowUrl(url) && !/flow\.google\.com|labs\.google\/.*flow/i.test(url)) return
  void wakeAndPoll()
})

chrome.runtime.onInstalled.addListener(() => {
  void wakeAndPoll()
})

chrome.runtime.onStartup.addListener(() => {
  void wakeAndPoll()
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'atlas-heartbeat') {
    // Content script na aba Flow mantém o SW vivo sem abrir o popup.
    void wakeAndPoll()
    sendResponse({ ok: true, busy })
    return true
  }
  if (message?.type === 'atlas-status') {
    void (async () => {
      const current = await ensureBridge()
      startPolling()
      sendResponse({
        connected: Boolean(current),
        port: current?.port ?? null,
        extensionVersion: EXTENSION_VERSION,
        workerTabId: await getStoredWorkerTabId(),
        busy,
      })
    })()
    return true
  }
  if (message?.type === 'atlas-rediscover') {
    bridge = null
    void wakeAndPoll().then(async () => {
      const found = bridge
      sendResponse({
        connected: Boolean(found),
        port: found?.port ?? null,
        workerTabId: await getStoredWorkerTabId(),
        busy,
      })
    })
    return true
  }
  if (message?.type === 'atlas-reset-busy') {
    busy = false
    sendResponse({ ok: true, busy: false })
    return true
  }
  if (message?.type === 'atlas-open-flow') {
    void (async () => {
      try {
        const tabId = await getStoredWorkerTabId()
        const tab = tabId == null ? null : await chrome.tabs.get(tabId)
        if (!tab || !isFlowUrl(tab.url || '')) {
          sendResponse({ ok: false, message: 'Abra o projeto pelo Atlas Studio primeiro.' })
          return
        }
        await activateForLogin(tab)
        sendResponse({ ok: true, message: 'Confira o texto e as referências na caixa do Flow.' })
      } catch (error) {
        sendResponse({
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    })()
    return true
  }
  if (message?.type === 'project_gone' && message.remoteId) {
    // Durante create/upload/delete o DOM/URL oscila — não apagar o vínculo no Atlas.
    if (busy || !message.confirmed404) {
      sendResponse({ ok: true, ignored: true, busy, confirmed404: Boolean(message.confirmed404) })
      return true
    }
    void postEvent({
      type: 'project_deleted',
      remoteId: String(message.remoteId),
      source: 'flow',
    }).catch(() => undefined)
    sendResponse({ ok: true })
    return true
  }
  return false
})

void wakeAndPoll()
