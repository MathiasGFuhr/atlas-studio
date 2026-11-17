/**
 * Sensor + primitivas passivas/ativas mínimas em flow.google.com.
 * JS clássico. Listeners protegidos contra duplicata.
 * Reinjeção com versão nova substitui o listener (sem reload da aba).
 */
;(() => {
  const SENSOR_VERSION = '0.3.74'
  const SENSOR_BUILD_ID = '0.3.76'
  /** Espelha directImageComposerContract.mjs — intent obrigatório da bancada. */
  const DIRECT_IMAGE_GENERATION_INTENT = 'direct_image_generation'
  /** Contenção espelhada no SW: false após probe CDP confirmado (sem Agente). */
  const GENERATION_SEND_PAUSED = false
  const previous = globalThis.__ATLAS_FLOW_V1_SENSOR__
  if (
    previous?.version === SENSOR_VERSION &&
    previous?.buildId === SENSOR_BUILD_ID &&
    typeof previous.onMessage === 'function'
  ) {
    return
  }
  if (previous?.onMessage) {
    try {
      chrome.runtime.onMessage.removeListener(previous.onMessage)
    } catch {
      /* ignore */
    }
  }
  if (typeof previous?.onDeleteClick === 'function') {
    try {
      document.removeEventListener('click', previous.onDeleteClick, true)
    } catch {
      /* ignore */
    }
  }
  // sensorVersion = versão do content script (independente do manifest.version da extensão).
  // Manter alinhada ao empacotamento atual para evitar falso “script antigo”.
  globalThis.__ATLAS_FLOW_V1_SENSOR__ = {
    version: SENSOR_VERSION,
    buildId: SENSOR_BUILD_ID,
    documentId: previous?.documentId || `${location.href}::${crypto.randomUUID()}`,
    onMessage: null,
  }

  try {
    if (!document.documentElement.dataset.atlasFlowDoc) {
      document.documentElement.dataset.atlasFlowDoc = crypto.randomUUID()
    }
  } catch {
    /* ignore */
  }

  const MAX_LABELS = 80
  const PROJECT_ID_RE = /^\/project\/([a-f0-9-]{8,})(?:\/|$)/i

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /** Evita a geração ficar presa se o debugger não responder. */
  function sendRuntimeMessage(message, timeoutMs = 12000) {
    return new Promise((resolve) => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        resolve({ ok: false, error: 'EXTENSION_MESSAGE_TIMEOUT' })
      }, timeoutMs)
      try {
        chrome.runtime.sendMessage(message, (result) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          const err = chrome.runtime.lastError
          if (err) resolve({ ok: false, error: err.message })
          else resolve(result || { ok: false, error: 'EMPTY_RESPONSE' })
        })
      } catch (error) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })
  }

  function parseProjectId(href) {
    try {
      const url = new URL(href)
      if (url.hostname !== 'flow.google.com' && !url.hostname.endsWith('.flow.google.com')) {
        return null
      }
      const match = url.pathname.match(PROJECT_ID_RE)
      if (!match) return null
      const id = match[1]
      if (id.toLowerCase() === 'new') return null
      return id
    } catch {
      return null
    }
  }

  function controlLabel(el) {
    const raw =
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      (el instanceof HTMLInputElement ? el.placeholder : '') ||
      el.textContent ||
      ''
    return String(raw).replace(/\s+/g, ' ').trim()
  }

  function collectAccessibleLabels() {
    const labels = []
    const nodes = deepQueryAll(
      'button, a[href], [role="button"], [aria-label], input, textarea, [contenteditable="true"]',
    )
    for (const node of nodes) {
      if (labels.length >= MAX_LABELS) break
      const text = controlLabel(node)
      if (!text || text.length > 120) continue
      if (!labels.includes(text)) labels.push(text)
    }
    return labels
  }

  function inferSessionHints(labels) {
    const joined = labels.join(' · ').toLowerCase()
    return {
      signInVisible: /sign in|fazer login|entrar/.test(joined),
      ultraMention: /\bultra\b/.test(joined),
      newProjectMention: /new project|novo projeto|\+\s*new|criar projeto|addnew project/.test(
        joined,
      ),
      imageMention: /\bimage\b|\bimagem\b|nano banana|text.to.image/.test(joined),
      generateMention: /\bgenerate\b|\bgerar\b/.test(joined),
    }
  }

  function deepQueryAll(selector, root = document) {
    const out = []
    const visit = (node) => {
      if (!node) return
      if (node.querySelectorAll) {
        try {
          out.push(...Array.from(node.querySelectorAll(selector)))
        } catch {
          /* ignore */
        }
        Array.from(node.querySelectorAll('*')).forEach((el) => {
          if (el.shadowRoot) visit(el.shadowRoot)
        })
      }
    }
    visit(root)
    return out
  }

  function collectFileInputs() {
    return deepQueryAll('input[type="file"]').map((input, index) => {
      const diagnosis = diagnoseElementUsability(input)
      const style = window.getComputedStyle(input)
      return {
        index,
        accept: input.getAttribute('accept') || null,
        multiple: input.multiple === true,
        id: input.id || null,
        name: input.name || null,
        ariaLabel: input.getAttribute('aria-label') || null,
        disabled: input.disabled === true,
        capture: input.getAttribute('capture') || null,
        className: typeof input.className === 'string' ? input.className.slice(0, 120) : null,
        // Existência ≠ visibilidade. Registrar mesmo se oculto (mecanismo real da UI).
        visuallyUsable: diagnosis.usable,
        unusableReasons: diagnosis.reasons,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        clientRects: diagnosis.details.clientRects ?? 0,
      }
    })
  }

  function extractAccountLabel(labels) {
    for (const label of labels) {
      const email = String(label).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
      if (email?.[0]) return email[0].slice(0, 120)
    }
    return null
  }

  function buildObservation() {
    const href = location.href
    const labels = collectAccessibleLabels()
    const hints = inferSessionHints(labels)
    const fileInputs = collectFileInputs()
    const joined = labels.join(' · ').toLowerCase()
    const accountLabel = extractAccountLabel(labels)
    return {
      observedAt: new Date().toISOString(),
      origin: location.origin,
      href,
      pathname: location.pathname,
      title: document.title,
      projectIdFromUrl: parseProjectId(href),
      readyState: document.readyState,
      labelsSample: labels,
      accountLabel,
      fileInputs,
      referenceUiHints: {
        uploadMention: /upload|enviar|add image|add images|ingredient|referenc|anexar|attach/.test(
          joined,
        ),
        imageModeMention: /\bimage\b|\bimagem\b|nano banana|frames|ingredients/.test(joined),
        promptEditable:
          Boolean(document.querySelector('[contenteditable="true"], textarea')) ||
          labels.some((l) => /prompt|describe|descreva/i.test(l)),
        fileInputCount: fileInputs.length,
      },
      hints,
      evidenceStatus: hints.signInVisible ? 'login_ui_visible' : 'page_observable',
      sensorVersion: globalThis.__ATLAS_FLOW_V1_SENSOR__.version,
      note: 'Sensor passivo. labels/fileInputs orientam; não validam seletor definitivo.',
    }
  }

  /**
   * Encontra exatamente um controle cujo label case com o matcher.
   * 0 ou >1 => erro tipado (não escolhe o “primeiro parecido”).
   */
  function findUniqueControlByLabel(matcher, description) {
    const nodes = deepQueryAll('button, a[href], [role="button"], [aria-label]')
    const matches = []
    for (const el of nodes) {
      const label = controlLabel(el)
      if (!label) continue
      if (matcher(label)) {
        matches.push({ el, label })
      }
    }
    if (matches.length === 0) {
      return {
        ok: false,
        error: `CONTROL_NOT_FOUND: ${description}`,
        matchCount: 0,
        matchedLabels: [],
        labelsSample: collectAccessibleLabels().slice(0, 40),
      }
    }
    if (matches.length > 1) {
      return {
        ok: false,
        error: `CONTROL_AMBIGUOUS: ${description}`,
        matchCount: matches.length,
        matchedLabels: matches.map((m) => m.label).slice(0, 10),
      }
    }
    return {
      ok: true,
      el: matches[0].el,
      label: matches[0].label,
      matchCount: 1,
    }
  }

  async function waitForUniqueControl(matcher, description, timeoutMs = 20_000) {
    const started = Date.now()
    let last = findUniqueControlByLabel(matcher, description)
    while (!last.ok && Date.now() - started < timeoutMs) {
      await sleep(300)
      last = findUniqueControlByLabel(matcher, description)
    }
    return last
  }

  function newProjectLabelMatcher(label) {
    const n = normalizeControlLabel(label)
    if (!n) return false
    // EN observado: "addNew project". PT: "+ Novo projeto" / "addNovo projeto" (ícone Material colado).
    const compact = n.replace(/[^a-z0-9]+/g, '')
    if (
      n === 'new project' ||
      n === 'novo projeto' ||
      n === 'create project' ||
      n === 'criar projeto' ||
      n === 'add new project' ||
      n === 'addnew project' ||
      n === '+ new project' ||
      n === '+ novo projeto' ||
      n === 'add novo projeto' ||
      n === 'add criar projeto'
    ) {
      return true
    }
    if (
      n.endsWith('new project') ||
      n.endsWith('novo projeto') ||
      n.endsWith('create project') ||
      n.endsWith('criar projeto')
    ) {
      return true
    }
    if (
      compact === 'newproject' ||
      compact === 'novoprojeto' ||
      compact === 'createproject' ||
      compact === 'criarprojeto'
    ) {
      return true
    }
    if (
      compact === 'addnewproject' ||
      compact === 'addnovoprojeto' ||
      compact === 'addcreateproject' ||
      compact === 'addcriarprojeto' ||
      compact.endsWith('newproject') ||
      compact.endsWith('novoprojeto')
    ) {
      return true
    }
    return (
      /^\+?\s*novo\s+projeto$/.test(n) ||
      /^\+?\s*new\s+project$/.test(n) ||
      /^add[_a-z]*\s*\+?\s*novo\s+projeto$/.test(n) ||
      /^add[_a-z]*\s*\+?\s*new\s+project$/.test(n) ||
      /^add[_a-z]*novo\s*projeto$/.test(n) ||
      /^add[_a-z]*new\s*project$/.test(n)
    )
  }

  function homeLabelMatcher(label) {
    const n = normalizeControlLabel(label)
    if (!n) return false
    return (
      n === 'pagina inicial' ||
      n === 'home' ||
      n === 'go home' ||
      n === 'go to home' ||
      n === 'voltar para a pagina inicial' ||
      n.endsWith('pagina inicial')
    )
  }

  function isFlowHomeHref(href = location.href) {
    try {
      const u = new URL(href)
      return (
        (u.hostname === 'flow.google.com' || u.hostname.endsWith('.flow.google.com')) &&
        (u.pathname === '/' || u.pathname === '')
      )
    } catch {
      return false
    }
  }

  /**
   * Home é obrigatória para o botão New project. O Flow costuma reabrir o último
   * /project/… — insistir até estabilizar em `/` ou achar o botão.
   */
  async function navigateToFlowHome(timeoutMs = 28_000) {
    const started = Date.now()
    let forcedAssigns = 0

    const tryClickHome = () => {
      const found = findUniqueControlByLabel(homeLabelMatcher, 'home')
      if (!found.ok) return false
      try {
        found.el.click()
        return true
      } catch {
        return false
      }
    }

    if (!isFlowHomeHref()) {
      if (!tryClickHome()) {
        location.assign('https://flow.google.com/?pli=1')
        forcedAssigns += 1
      }
      await sleep(900)
    }

    while (Date.now() - started < timeoutMs) {
      if (findUniqueControlByLabel(newProjectLabelMatcher, 'new_project').ok) {
        return { ok: true, href: location.href, forcedAssigns }
      }
      if (isFlowHomeHref()) {
        await sleep(350)
        continue
      }
      // Bounce de volta ao projeto: força home de novo.
      if (forcedAssigns < 4) {
        if (!tryClickHome()) {
          location.assign(`https://flow.google.com/?pli=1&atlas_home=${Date.now()}`)
          forcedAssigns += 1
        }
        await sleep(1100)
      } else {
        break
      }
    }

    return {
      ok: isFlowHomeHref(),
      href: location.href,
      forcedAssigns,
      error: isFlowHomeHref() ? null : 'HOME_NAV_FAILED',
    }
  }

  async function waitForProjectUrl(timeoutMs) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const id = parseProjectId(location.href)
      if (id) {
        return {
          ok: true,
          flowProjectId: id,
          flowProjectUrl: `https://flow.google.com/project/${id}`,
          href: location.href,
        }
      }
      await sleep(200)
    }
    return {
      ok: false,
      error: 'POSTCONDITION_TIMEOUT: URL não virou /project/{id}',
      href: location.href,
    }
  }

  function isFlowOrigin() {
    try {
      return location.protocol === 'https:' && location.hostname === 'flow.google.com'
    } catch {
      return false
    }
  }

  function diagnoseElementUsability(el) {
    if (!el || !(el instanceof Element)) {
      return {
        usable: false,
        reasons: ['NOT_ELEMENT'],
        details: {},
      }
    }
    const style = window.getComputedStyle(el)
    const details = {
      tag: el.tagName,
      role: el.getAttribute('role'),
      disabledAttr: el.hasAttribute('disabled'),
      ariaDisabled: el.getAttribute('aria-disabled'),
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      clientRects: el.getClientRects().length,
    }
    // Espelha explainUnusableReasons (readinessContract.mjs) — não presumir disabled.
    const reasons = []
    if (details.disabledAttr) reasons.push('DISABLED_ATTR')
    if (details.ariaDisabled === 'true') reasons.push('ARIA_DISABLED')
    if (details.display === 'none') reasons.push('DISPLAY_NONE')
    if (details.visibility === 'hidden') reasons.push('VISIBILITY_HIDDEN')
    if (details.opacity === '0') reasons.push('OPACITY_ZERO')
    if (details.clientRects <= 0) reasons.push('NO_CLIENT_RECTS')
    return {
      usable: reasons.length === 0,
      reasons,
      details,
    }
  }

  function isElementUsable(el) {
    return diagnoseElementUsability(el).usable
  }

  function findControlCandidates(matcher) {
    const nodes = Array.from(
      document.querySelectorAll('button, a[href], [role="button"], [aria-label]'),
    )
    const matches = []
    for (const el of nodes) {
      const label = controlLabel(el)
      if (!label || !matcher(label)) continue
      const diagnosis = diagnoseElementUsability(el)
      matches.push({ el, label, diagnosis })
    }
    return matches
  }

  function findUsableControl(matcher) {
    return findControlCandidates(matcher)
      .filter((item) => item.diagnosis.usable)
      .map((item) => ({ el: item.el, label: item.label }))
  }

  /** Espelha readinessContract.mjs#operationControlsReady */
  function operationControlsReady(operation, snap) {
    if (snap.isLoading) return false
    if (operation === 'base') return true
    if (operation === 'open_upload') {
      return (
        snap.editorUsable === true &&
        (snap.ingredientsUsableCount === 1 || snap.addMediaUsableCount === 1)
      )
    }
    if (operation === 'generate') {
      return (
        snap.editorUsable === true &&
        snap.startGenerationUsableCount >= 1 &&
        snap.hasPromptText === true
      )
    }
    return false
  }

  /** Espelha readinessContract.mjs#normalizeControlLabel */
  function normalizeControlLabel(label) {
    return String(label || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /** Espelha readinessContract.mjs#isAddIngredientsLabel (EN + PT-BR exatos). */
  function isAddIngredientsLabel(label) {
    const n = normalizeControlLabel(label)
    return (
      n === 'add ingredients to the prompt box' ||
      n === 'adicionar elementos a caixa de comando'
    )
  }

  /** Espelha readinessContract.mjs#isAddMediaMenuLabel */
  function isAddMediaMenuLabel(label) {
    const n = normalizeControlLabel(label)
    return n === 'add media menu' || n === 'menu para adicionar arquivos'
  }

  /** Espelha readinessContract.mjs#isUploadMediaLabel */
  function isUploadMediaLabel(label) {
    const n = normalizeControlLabel(label)
    if (!n) return false
    if (n === 'upload media' || n === 'enviar midia' || n === 'fazer upload de midia') return true
    if (
      n.endsWith('upload media') ||
      n.endsWith('enviar midia') ||
      n.endsWith('fazer upload de midia')
    ) {
      return true
    }
    return (
      /upload\s*media/.test(n) ||
      /enviar\s*midia/.test(n) ||
      /fazer\s*upload\s*de\s*midia/.test(n)
    )
  }

  function isSearchAssetsLabel(label) {
    const n = normalizeControlLabel(label)
    return (
      n === 'search assets' ||
      n === 'pesquisar assets' ||
      n === 'pesquisar recursos' ||
      n.endsWith('pesquisar recursos') ||
      n.endsWith('search assets')
    )
  }

  function isSortAssetsLabel(label) {
    const n = normalizeControlLabel(label)
    return n === 'sort assets' || n === 'ordenar assets' || n === 'ordenar recursos'
  }

  function isCategoryNavigationLabel(label) {
    const n = normalizeControlLabel(label)
    return (
      n === 'category navigation' ||
      n === 'navegacao de categorias' ||
      n === 'navegacao por categoria'
    )
  }

  function isAssetListLabel(label) {
    const n = normalizeControlLabel(label)
    return n === 'asset list' || n === 'lista de recursos'
  }

  function isAddToPromptLabel(label) {
    const n = normalizeControlLabel(label)
    return n === 'add to prompt' || n === 'incluir no comando'
  }

  function isAssetsPanelLabel(label) {
    return (
      isSearchAssetsLabel(label) ||
      isSortAssetsLabel(label) ||
      isCategoryNavigationLabel(label) ||
      isUploadMediaLabel(label)
    )
  }

  /** Espelha readinessContract.mjs#classifyLoadingScope */
  function classifyLoadingScope(snap) {
    const uploadAvailable = snap.uploadMediaUsableCount === 1
    const panelLocal =
      snap.assetsPanelPresent === true &&
      (snap.loadingLabel === true || snap.busy === true) &&
      snap.editorUsable === true &&
      snap.projectContextOk === true &&
      snap.onlyShell !== true

    if (!snap.projectContextOk || snap.onlyShell === true) {
      return {
        scope: 'global',
        isGlobalBlocking: true,
        isPanelLocalLoading: false,
        uploadAvailableDespiteListLoading: false,
      }
    }
    if (panelLocal) {
      return {
        scope: 'panel_local',
        isGlobalBlocking: false,
        isPanelLocalLoading: true,
        uploadAvailableDespiteListLoading: uploadAvailable,
      }
    }
    if ((snap.busy || snap.loadingLabel) && !snap.assetsPanelPresent && !snap.editorUsable) {
      return {
        scope: 'global',
        isGlobalBlocking: true,
        isPanelLocalLoading: false,
        uploadAvailableDespiteListLoading: false,
      }
    }
    // Editor utilizável: progressbar residual não bloqueia a página.
    return {
      scope: 'none',
      isGlobalBlocking: false,
      isPanelLocalLoading: false,
      uploadAvailableDespiteListLoading: uploadAvailable,
    }
  }

  function assertProjectContext(expectedFlowProjectId) {
    if (!isFlowOrigin()) {
      return { ok: false, error: 'ORIGIN_MISMATCH', href: location.href }
    }
    const currentId = parseProjectId(location.href)
    if (!currentId) {
      return { ok: false, error: 'PROJECT_ID_MISSING', href: location.href }
    }
    if (expectedFlowProjectId && currentId !== expectedFlowProjectId) {
      return {
        ok: false,
        error: 'PROJECT_ID_MISMATCH',
        expectedFlowProjectId,
        currentId,
        href: location.href,
      }
    }
    return { ok: true, currentId, href: location.href }
  }

  function detectAssetsPanel() {
    const labels = collectAccessibleLabels()
    const markers = labels.filter((label) => isAssetsPanelLabel(label))
    const uploadCandidates = findControlCandidates(isUploadMediaLabel)
    const uploadUsable = uploadCandidates.filter((item) => item.diagnosis.usable)
    const loading = detectLoadingState()
    const editor =
      document.querySelector('[contenteditable="true"]') || document.querySelector('textarea')
    const editorUsable = isElementUsable(editor)
    const context = assertProjectContext(null)
    const scope = classifyLoadingScope({
      projectContextOk: context.ok,
      editorUsable,
      onlyShell: loading.onlyShell,
      busy: loading.busy,
      loadingLabel: loading.loadingLabel,
      assetsPanelPresent: markers.length > 0,
      uploadMediaUsableCount: uploadUsable.length,
    })
    return {
      present: markers.length > 0,
      markers: markers.slice(0, 12),
      uploadMatchCount: uploadCandidates.length,
      uploadUsableCount: uploadUsable.length,
      uploadCandidates: uploadCandidates.slice(0, 5).map((item) => ({
        label: item.label,
        usable: item.diagnosis.usable,
        reasons: item.diagnosis.reasons,
        details: item.diagnosis.details,
      })),
      loading,
      scope,
      editorUsable,
    }
  }

  function detectLoadingState() {
    const title = String(document.title || '')
    const bodyText = String(document.body?.innerText || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500)
    const labels = collectAccessibleLabels()
    const busy =
      document.querySelector('[aria-busy="true"]') != null ||
      document.querySelector('[role="progressbar"]') != null
    const loadingLabel = labels.some((label) => /^loading\b/i.test(label.trim()))
    const loadingText =
      loadingLabel ||
      /loading/i.test(title) ||
      /\bloading\b/i.test(bodyText) ||
      /carregando/i.test(bodyText)
    const onlyShell =
      labels.length <= 3 &&
      (loadingText || bodyText.toLowerCase().includes('loading'))
    return {
      busy,
      loadingText,
      loadingLabel,
      onlyShell,
      title,
      bodyPreview: bodyText.slice(0, 160),
      isLoading: Boolean(busy || loadingText || onlyShell),
    }
  }

  function labelMatchers() {
    return {
      ingredients: isAddIngredientsLabel,
      addMedia: isAddMediaMenuLabel,
      startGeneration: isStartGenerationLabel,
    }
  }

  function summarizeControlInspection(matcher) {
    const candidates = findControlCandidates(matcher)
    const usable = candidates.filter((item) => item.diagnosis.usable)
    return {
      matchCount: candidates.length,
      usableCount: usable.length,
      presentInLabelsSample: collectAccessibleLabels().some(matcher),
      candidates: candidates.slice(0, 5).map((item) => ({
        label: item.label,
        usable: item.diagnosis.usable,
        reasons: item.diagnosis.reasons,
        details: item.diagnosis.details,
      })),
      note:
        candidates.length === 0
          ? 'Label pode existir na amostra agregada sem nó batendo no seletor de controles.'
          : usable.length === 0
            ? 'Controle encontrado no DOM, mas nenhum utilizável — ver reasons (não presumir disabled).'
            : null,
    }
  }

  /**
   * @param {string | null} expectedFlowProjectId
   * @param {'base' | 'open_upload' | 'generate'} [forOperation='open_upload']
   */
  function assessProjectUiReady(expectedFlowProjectId, forOperation = 'open_upload') {
    const operation =
      forOperation === 'base' || forOperation === 'generate' || forOperation === 'open_upload'
        ? forOperation
        : 'open_upload'

    if (!isFlowOrigin()) {
      return {
        ready: false,
        reason: 'ORIGIN_MISMATCH',
        operation,
        href: location.href,
        loading: detectLoadingState(),
      }
    }
    const currentId = parseProjectId(location.href)
    if (!currentId) {
      return {
        ready: false,
        reason: detectLoadingState().isLoading ? 'LOADING_NO_PROJECT_ID' : 'PROJECT_ID_MISSING',
        operation,
        href: location.href,
        loading: detectLoadingState(),
      }
    }
    if (expectedFlowProjectId && currentId !== expectedFlowProjectId) {
      return {
        ready: false,
        reason: 'PROJECT_ID_MISMATCH',
        operation,
        expectedFlowProjectId,
        currentId,
        href: location.href,
        loading: detectLoadingState(),
      }
    }

    const loading = detectLoadingState()
    const editor =
      document.querySelector('[contenteditable="true"]') || document.querySelector('textarea')
    const editorDiagnosis = diagnoseElementUsability(editor)
    const editorUsable = editorDiagnosis.usable
    const matchers = labelMatchers()
    const ingredientsAll = findControlCandidates(matchers.ingredients)
    const addMediaAll = findControlCandidates(matchers.addMedia)
    const startGenAll = findControlCandidates(matchers.startGeneration)
    const ingredients = ingredientsAll.filter((item) => item.diagnosis.usable)
    const addMedia = addMediaAll.filter((item) => item.diagnosis.usable)
    const startGen = startGenAll.filter((item) => item.diagnosis.usable)
    const promptText = readPromptText()
    const hasPromptText = Boolean(promptText && promptText.length > 0)

    const startGenerationInspection = summarizeControlInspection(matchers.startGeneration)
    const loadScope = classifyLoadingScope({
      projectContextOk: true,
      editorUsable,
      onlyShell: loading.onlyShell,
      busy: loading.busy,
      loadingLabel: Boolean(loading.loadingLabel || loading.loadingText),
      assetsPanelPresent: false,
      uploadMediaUsableCount: 0,
    })
    const blockingLoad = loadScope.isGlobalBlocking === true

    const snap = {
      isLoading: blockingLoad,
      editorUsable,
      ingredientsUsableCount: ingredients.length,
      addMediaUsableCount: addMedia.length,
      startGenerationUsableCount: startGen.length,
      hasPromptText,
    }
    const controlsReady = operationControlsReady(operation, snap)

    const controlCounts = {
      ingredients: ingredients.length,
      addMedia: addMedia.length,
      startGeneration: startGen.length,
    }
    const controlMatched = {
      ingredients: ingredientsAll.length,
      addMedia: addMediaAll.length,
      startGeneration: startGenAll.length,
    }

    if (blockingLoad && !controlsReady) {
      return {
        ready: false,
        reason: 'UI_LOADING',
        operation,
        currentId,
        loading,
        editorUsable,
        editorDiagnosis,
        controlCounts,
        controlMatched,
        startGenerationInspection,
      }
    }

    if (operation === 'base') {
      if (blockingLoad) {
        return {
          ready: false,
          reason: 'UI_LOADING',
          operation,
          currentId,
          loading,
          editorUsable,
          controlCounts,
          controlMatched,
          startGenerationInspection,
        }
      }
      return {
        ready: true,
        operation,
        currentId,
        loading,
        editorUsable,
        controlCounts,
        controlMatched,
        startGenerationInspection,
        note: 'Base OK: origem/projeto/documento sem loading bloqueante. Geração não exigida.',
      }
    }

    if (!controlsReady) {
      return {
        ready: false,
        reason: blockingLoad ? 'UI_LOADING' : 'CONTROLS_NOT_READY',
        operation,
        currentId,
        loading,
        editorUsable,
        editorDiagnosis,
        controlCounts,
        controlMatched,
        startGenerationInspection,
        labelsSample: collectAccessibleLabels().slice(0, 40),
        note:
          operation === 'open_upload'
            ? 'open_upload exige editor e um controle de ingredients ou de add media. startGeneration utilizável NÃO é requisito.'
            : 'generate exige editor + prompt + startGeneration utilizável na etapa própria.',
      }
    }

    return {
      ready: true,
      operation,
      currentId,
      loading,
      editorUsable: true,
      controlCounts,
      controlMatched,
      startGenerationInspection,
      controls: {
        ingredients: ingredients[0]?.label || null,
        addMedia: addMedia[0]?.label || null,
        startGeneration: startGen[0]?.label || null,
      },
      note:
        operation === 'open_upload' && startGen.length === 0
          ? 'Upload pronto; Start generation presente/matched mas não utilizável — irrelevante para abrir upload.'
          : null,
    }
  }

  function waitForDomTick(ms, signal) {
    return new Promise((resolve) => {
      if (signal?.aborted) {
        resolve('aborted')
        return
      }
      let done = false
      const finish = (reason) => {
        if (done) return
        done = true
        observer.disconnect()
        clearTimeout(timer)
        signal?.removeEventListener?.('abort', onAbort)
        resolve(reason)
      }
      const onAbort = () => finish('aborted')
      const observer = new MutationObserver(() => finish('mutation'))
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      })
      const timer = setTimeout(() => finish('timeout'), ms)
      signal?.addEventListener?.('abort', onAbort, { once: true })
    })
  }

  /**
   * Aguarda UI do projeto para a operação pedida.
   * open_upload ≠ generate (geração não bloqueia upload).
   */
  async function waitForProjectReady(options) {
    const expectedFlowProjectId =
      typeof options?.expectedFlowProjectId === 'string' ? options.expectedFlowProjectId : null
    const forOperation =
      options?.forOperation === 'base' || options?.forOperation === 'generate'
        ? options.forOperation
        : 'open_upload'
    const timeoutMs =
      typeof options?.timeoutMs === 'number' && options.timeoutMs > 0 ? options.timeoutMs : 45_000
    const signal = options?.signal || null
    const started = Date.now()
    let lastAssessment = assessProjectUiReady(expectedFlowProjectId, forOperation)

    while (Date.now() - started < timeoutMs) {
      if (signal?.aborted) {
        return {
          ok: false,
          error: 'PROJECT_UI_WAIT_ABORTED',
          durationMs: Date.now() - started,
          assessment: lastAssessment,
          observation: buildObservation(),
        }
      }

      // Revalida documento/projeto a cada ciclo (SPA/navegação).
      lastAssessment = assessProjectUiReady(expectedFlowProjectId, forOperation)
      if (lastAssessment.ready) {
        return {
          ok: true,
          durationMs: Date.now() - started,
          assessment: lastAssessment,
          observation: buildObservation(),
          sensorVersion: globalThis.__ATLAS_FLOW_V1_SENSOR__.version,
        }
      }

      if (
        lastAssessment.reason === 'ORIGIN_MISMATCH' ||
        lastAssessment.reason === 'PROJECT_ID_MISMATCH'
      ) {
        return {
          ok: false,
          error: lastAssessment.reason,
          durationMs: Date.now() - started,
          assessment: lastAssessment,
          observation: buildObservation(),
        }
      }

      await waitForDomTick(300, signal)
    }

    const finalAssessment = assessProjectUiReady(expectedFlowProjectId, forOperation)
    const stillLoading =
      finalAssessment.reason === 'UI_LOADING' ||
      finalAssessment.reason === 'LOADING_NO_PROJECT_ID' ||
      finalAssessment.loading?.isLoading

    return {
      ok: false,
      error: stillLoading ? 'PROJECT_UI_LOADING_TIMEOUT' : 'PROJECT_UI_READY_TIMEOUT',
      durationMs: Date.now() - started,
      assessment: finalAssessment,
      observation: buildObservation(),
      sensorVersion: globalThis.__ATLAS_FLOW_V1_SENSOR__.version,
      note: stillLoading
        ? 'UI ainda carregando ao fim do prazo — não classificar como CONTROL_NOT_FOUND.'
        : `Prazo esgotado sem prontidão para operation=${forOperation}.`,
    }
  }

  function isComposerAnchorLabel(label) {
    const n = normalizeControlLabel(label)
    return (
      isAddIngredientsLabel(n) ||
      isStartGenerationLabel(n) ||
      n === 'clear prompt' ||
      n === 'apagar comando' ||
      n === 'what do you want to create?' ||
      n === 'o que voce quer criar?' ||
      // Não usar "Agente" como âncora — puxa o editor errado / ativa o modo agente.
      n === 'settings trigger' ||
      n === 'gatilho de configuracoes'
    )
  }

  function isAgentModeLabel(label) {
    const n = normalizeControlLabel(label)
    if (!n) return false
    if (n === 'agent' || n === 'agente') return true
    if (n === 'apps_spark_2 agent' || n === 'apps_spark_2 agente') return true
    // Evitar casar "agentic" / outros — só o pill do modo.
    return /^(apps_spark_2\s*)?agente?$/.test(n)
  }

  function isAgentRejectLabel(label) {
    const n = normalizeControlLabel(label)
    return n === 'rejeitar' || n === 'reject'
  }

  function isAgentStopLabel(label) {
    const n = normalizeControlLabel(label)
    return (
      n === 'stop' ||
      n === 'parar' ||
      n === 'stop generating' ||
      n === 'parar geracao' ||
      n === 'cancel' ||
      n === 'cancelar'
    )
  }

  /** Botão de parar a geração de imagem no compositor (não o Cancelar de diálogo). */
  function isGenerationStopLabel(label) {
    const n = normalizeControlLabel(label)
    return (
      n === 'stop' ||
      n === 'parar' ||
      n === 'stop generating' ||
      n === 'stop generation' ||
      n === 'parar geracao' ||
      n === 'parar a geracao' ||
      n === 'cancel generation' ||
      n === 'cancelar geracao'
    )
  }

  async function clickGenerationStop() {
    const usable = findUsableControl(isGenerationStopLabel)
    const target = usable[0]?.el
    if (!target) return { ok: false, clicked: false, error: 'STOP_CONTROL_NOT_FOUND' }
    const trusted = await trustedClickElement(target, { align: 'center' })
    return {
      ok: trusted?.ok === true,
      clicked: trusted?.ok === true,
      label: usable[0].label,
      click: trusted,
    }
  }

  function isAgentInstructionLabel(label) {
    const n = normalizeControlLabel(label)
    return (
      n === 'instrucoes para o agente' ||
      n === 'instructions for the agent' ||
      n.includes('instrucoes para o agente') ||
      n.includes('instructions for the agent')
    )
  }

  function isDirectComposerPlaceholderLabel(label) {
    const n = normalizeControlLabel(label)
    return n === 'what do you want to create?' || n === 'o que voce quer criar?'
  }

  /** Observado após digitar no compositor: "Clear prompt" / "Apagar comando". */
  function isClearPromptLabel(label) {
    const n = normalizeControlLabel(label)
    return n === 'clear prompt' || n === 'apagar comando'
  }

  function controlLooksSelected(el) {
    if (!el) return false
    const ariaPressed = el.getAttribute('aria-pressed')
    const ariaChecked = el.getAttribute('aria-checked')
    const ariaSelected = el.getAttribute('aria-selected')
    const ariaCurrent = el.getAttribute('aria-current')
    if (ariaPressed === 'true' || ariaChecked === 'true' || ariaSelected === 'true') return true
    if (ariaCurrent && ariaCurrent !== 'false') return true
    const state = String(el.getAttribute('data-state') || '')
    if (state === 'on' || state === 'checked' || state === 'active') return true
    const cls = String(el.className || '')
    if (/\b(selected|active|pressed|is-selected|is-active)\b/i.test(cls)) return true
    // Pill branco selecionado no Flow: fundo claro.
    try {
      const style = window.getComputedStyle(el)
      const bg = style.backgroundColor || ''
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
      if (m) {
        const r = Number(m[1])
        const g = Number(m[2])
        const b = Number(m[3])
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
        if (luminance > 0.82) return true
      }
    } catch {
      /* ignore */
    }
    return false
  }

  /** Sessão/UI do Agente do Flow (chat, pensar, aprovar vídeo) — proibida na bancada. */
  function detectAgentSession() {
    const labels = collectAccessibleLabels()
    const joined = labels.join(' · ')
    // Não usar só “Agente”/“Aprovar” soltos — o pill sempre existe; Aprovar pode ser outro UI.
    const agentUi =
      /pensando\.\.\.|thinking\.\.\.|visualizing the|quer que eu inicie|quero que eu inicie|sempre aprovar no projeto|custa\s+\d+\s+cr[eé]ditos|costs?\s+\d+\s+credits|omni\s*1\.\d|gera[cç][aã]o de v[ií]deo|video generation|iniciar nova sessao|start new session/i.test(
        joined,
      ) ||
      (/\b(aprovar|rejeitar|approve|reject)\b/i.test(joined) &&
        /\b(cr[eé]dito|credit|omni|v[ií]deo|video)\b/i.test(joined)) ||
      labels.some((l) => isAgentInstructionLabel(l))
    const agentPillSelected = findControlCandidates(isAgentModeLabel).some((item) =>
      controlLooksSelected(item.el),
    )
    const startUsable = findUsableControl(isStartGenerationLabel).length
    const startListed = labels.some((l) => isStartGenerationLabel(l))
    return {
      active: agentUi || agentPillSelected,
      agentUi,
      agentPillSelected,
      startCount: startUsable,
      startListed,
      intent: DIRECT_IMAGE_GENERATION_INTENT,
      labelsSample: labels
        .filter((l) =>
          /agent|agente|pensando|thinking|aprovar|rejeitar|credit|cr[eé]dito|omni|video|v[ií]deo|generat|gera|iniciar|instru/i.test(
            String(l),
          ),
        )
        .slice(0, 16),
    }
  }

  /**
   * Compositor direto de imagem (intent explícito).
   * NUNCA clica em Agente para “ligar”. Só desliga se aria-pressed/checked=true
   * (sem heurística de luminância — falso positivo LIGA o Agente).
   * Nunca clica Aprovar / Sempre aprovar.
   * @param {{ requireStartButton?: boolean }} [options]
   */
  async function ensureClassicCreateMode(options = {}) {
    const requireStartButton = options.requireStartButton === true
    const steps = []
    const startBefore = findUsableControl(isStartGenerationLabel).length

    // 1) Recusar diálogo de aprovação do Agente (não gerar vídeo / não gastar créditos).
    const rejectBtns = findUsableControl(isAgentRejectLabel)
    if (rejectBtns.length >= 1) {
      const click = clickElementHard(rejectBtns[0].el)
      steps.push({ action: 'reject_agent', label: rejectBtns[0].label, click })
      await waitForDomTick(400, null)
    }

    // 2) Parar “Pensando…” se houver controle de stop.
    const stopBtns = findUsableControl(isAgentStopLabel)
    if (stopBtns.length === 1) {
      const click = clickElementHard(stopBtns[0].el)
      steps.push({ action: 'stop_agent', label: stopBtns[0].label, click })
      await waitForDomTick(350, null)
    }

    // 3) Desligar pill Agente SOMENTE com aria explícita (nunca luminância).
    const selectedAgents = findControlCandidates(isAgentModeLabel).filter((item) => {
      const el = item.el
      return (
        el.getAttribute('aria-pressed') === 'true' ||
        el.getAttribute('aria-checked') === 'true' ||
        el.getAttribute('aria-selected') === 'true'
      )
    })
    for (const item of selectedAgents.slice(0, 2)) {
      const trusted = await trustedClickElement(item.el)
      steps.push({ action: 'deselect_agent_pill', via: 'trusted', label: item.label, click: trusted })
      await waitForDomTick(450, null)
      if (
        item.el.getAttribute('aria-pressed') === 'true' ||
        item.el.getAttribute('aria-checked') === 'true'
      ) {
        const hard = clickElementHard(item.el)
        steps.push({ action: 'deselect_agent_pill', via: 'hard', label: item.label, click: hard })
        await waitForDomTick(400, null)
      }
    }

    // 4) Escape para fechar overlays do Agente.
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }),
    )
    await sleep(180)

    let session = detectAgentSession()
    let startAfter = findUsableControl(isStartGenerationLabel).length
    if (requireStartButton && startAfter < 1 && !session.active) {
      const waitStart = Date.now()
      while (Date.now() - waitStart < 8_000) {
        await waitForDomTick(400, null)
        session = detectAgentSession()
        startAfter = findUsableControl(isStartGenerationLabel).length
        if (session.active || startAfter >= 1) break
      }
      steps.push({
        action: 'wait_start_button',
        waitMs: Date.now() - waitStart,
        startAfter,
        startListed: session.startListed,
      })
    }

    const startInspection = summarizeControlInspection(isStartGenerationLabel)
    const arrowReady = findProjectGenerateArrow() != null
    const startListed = session.startListed === true || arrowReady
    if (arrowReady) startAfter = Math.max(startAfter, 1)
    const editor = findPromptEditor()
    const editorTop = editor ? Math.round(editor.getBoundingClientRect().top) : null
    const editorAria = editor
      ? `${controlLabel(editor)} ${editor.getAttribute('aria-label') || ''} ${editor.getAttribute('aria-placeholder') || ''}`
      : ''
    const composerConfirmed =
      !session.active &&
      startListed &&
      editor != null &&
      editorTop != null &&
      editorTop >= 140 &&
      !isAgentInstructionLabel(editorAria)
    const ok =
      composerConfirmed && (!requireStartButton || startAfter >= 1)
    return {
      ok,
      error: ok
        ? null
        : session.active
          ? 'AGENT_MODE_ACTIVE'
          : !startListed
            ? 'DIRECT_COMPOSER_NOT_CONFIRMED'
            : editorTop != null && editorTop < 140
              ? 'PROMPT_EDITOR_TOP_SUSPECT'
              : requireStartButton
                ? 'START_GENERATION_NOT_READY'
                : 'DIRECT_COMPOSER_NOT_CONFIRMED',
      intent: DIRECT_IMAGE_GENERATION_INTENT,
      requireStartButton,
      startBefore,
      startAfter,
      startListed,
      editorTop,
      startInspection,
      steps,
      session,
      note: requireStartButton
        ? 'Antes de Gerar: intent=direct_image + sem Agente + Iniciar geração utilizável no compositor.'
        : 'Antes de anexar/escrever: intent=direct_image + sem Agente + compositor clássico confirmado.',
    }
  }

  /**
   * Verifica compositor + exercita writePromptText/CDP (mesmo caminho do job).
   * Sem Start, sem atalho de envio, sem Aprovar. Restaura o rascunho.
   */
  async function verifyDirectImageComposerOnly(expectedFlowProjectId) {
    const marker = `[[atlas-flow-cdp-probe ${Date.now()}]]`
    const context = assertProjectContext(expectedFlowProjectId)
    if (!context.ok) {
      return {
        ok: false,
        step: 'verify_context',
        error: context.error,
        intent: DIRECT_IMAGE_GENERATION_INTENT,
        didWritePrompt: false,
        didGenerate: false,
        generationSendPaused: GENERATION_SEND_PAUSED,
      }
    }

    const before = {
      agent: detectAgentSession(),
      startGeneration: snapshotStartGeneration(),
      editor: describeComposerEditor(findPromptEditor()),
      draftText: readPromptText() || '',
      observation: buildObservation(),
    }

    // Pill "Agente" nos labels ≠ modo ativo.
    if (before.agent.active) {
      return {
        ok: false,
        step: 'verify_agent_already_active',
        error: 'AGENT_MODE_ACTIVE',
        intent: DIRECT_IMAGE_GENERATION_INTENT,
        before,
        firstDivergentInteraction: 'precheck_agent_session',
        didWritePrompt: false,
        didGenerate: false,
        generationSendPaused: GENERATION_SEND_PAUSED,
        note: 'Agente já ativo antes do probe — não escrever.',
      }
    }

    const classicMode = await ensureClassicCreateMode({ requireStartButton: false })
    if (!classicMode.ok) {
      return {
        ok: false,
        step: 'direct_image_composer_blocked',
        error: classicMode.error,
        intent: DIRECT_IMAGE_GENERATION_INTENT,
        classicMode,
        before,
        didWritePrompt: false,
        didGenerate: false,
        generationSendPaused: GENERATION_SEND_PAUSED,
      }
    }

    const editorBeforeWrite = findPromptEditor()
    const editorId = describeComposerEditor(editorBeforeWrite)
    if (!editorBeforeWrite || !editorId?.anchors || (editorId.anchors.startListed < 1 && editorId.anchors.placeholderListed < 1)) {
      return {
        ok: false,
        step: 'verify_editor_anchors',
        error: 'DIRECT_COMPOSER_ANCHOR_MISSING',
        intent: DIRECT_IMAGE_GENERATION_INTENT,
        classicMode,
        before,
        editor: editorId,
        didWritePrompt: false,
        didGenerate: false,
        generationSendPaused: GENERATION_SEND_PAUSED,
        note: 'Editor exige âncoras Start/placeholder do compositor direto (top só auxiliar).',
      }
    }

    const preservedDraft = before.draftText
    const promptWrite = await writePromptText(marker, { cdpOnly: true })
    const afterWriteAgent = detectAgentSession()
    const editorAfterWrite = findPromptEditor()
    const readFromEditor = editorAfterWrite
      ? (editorAfterWrite.innerText || editorAfterWrite.textContent || '').trim()
      : readPromptText() || ''
    const markerInEditor = readFromEditor.includes(marker)
    const startAfterWrite = snapshotStartGeneration()

    if (!promptWrite.ok || !markerInEditor || afterWriteAgent.active) {
      // Tentar restaurar mesmo em falha.
      let restore = null
      try {
        restore =
          preservedDraft === ''
            ? await clearComposerDraftCdpOrObserved()
            : await writePromptText(preservedDraft, { cdpOnly: true })
      } catch (error) {
        restore = {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
      return {
        ok: false,
        step: afterWriteAgent.active
          ? 'verify_agent_activated_by_write'
          : !markerInEditor
            ? 'verify_marker_not_in_composer'
            : 'verify_cdp_write_failed',
        error: afterWriteAgent.active
          ? 'AGENT_ACTIVATED_BY_WRITE'
          : promptWrite.error || 'CDP_WRITE_PROBE_FAILED',
        intent: DIRECT_IMAGE_GENERATION_INTENT,
        classicMode,
        before,
        editor: editorId,
        promptWrite,
        marker,
        readFromEditor,
        markerInEditor,
        agentAfterWrite: afterWriteAgent,
        startGenerationAfterWrite: startAfterWrite,
        firstDivergentInteraction: afterWriteAgent.active
          ? 'writePromptText.trusted_cdp_insertText'
          : 'writePromptText',
        restore,
        didWritePrompt: promptWrite.ok === true,
        didGenerate: false,
        generationSendPaused: GENERATION_SEND_PAUSED,
        sensorVersion: globalThis.__ATLAS_FLOW_V1_SENSOR__.version,
        note: 'Probe CDP falhou ou desviou para Agente — geração permanece pausada.',
      }
    }

    // Restaurar rascunho: vazio → Apagar comando (observado) ou CDP clear; senão CDP write.
    const restore =
      preservedDraft === ''
        ? await clearComposerDraftCdpOrObserved()
        : await writePromptText(preservedDraft, { cdpOnly: true })
    const afterRestoreAgent = detectAgentSession()
    const restoredText = readPromptText() || ''
    const draftRestored =
      restoredText === preservedDraft ||
      (preservedDraft === '' && restoredText === '') ||
      (preservedDraft.length > 0 &&
        restoredText.includes(preservedDraft.slice(0, Math.min(24, preservedDraft.length))))

    const after = {
      agent: afterRestoreAgent,
      startGeneration: snapshotStartGeneration(),
      editor: describeComposerEditor(findPromptEditor()),
      draftText: restoredText,
      observation: buildObservation(),
    }

    const ok =
      promptWrite.ok === true &&
      markerInEditor === true &&
      afterWriteAgent.active === false &&
      afterRestoreAgent.active === false &&
      restore.ok === true &&
      draftRestored === true

    return {
      ok,
      step: ok ? 'direct_image_cdp_write_confirmed' : 'direct_image_cdp_write_incomplete',
      error: ok
        ? null
        : afterRestoreAgent.active
          ? 'AGENT_MODE_ACTIVE'
          : !draftRestored
            ? 'DRAFT_RESTORE_MISMATCH'
            : 'CDP_WRITE_PROBE_INCOMPLETE',
      intent: DIRECT_IMAGE_GENERATION_INTENT,
      classicMode,
      before,
      editor: editorId,
      marker,
      promptWrite,
      readFromEditor,
      markerInEditor,
      agentAfterWrite: afterWriteAgent,
      startGenerationAfterWrite: startAfterWrite,
      restore: {
        ...restore,
        preservedDraft,
        restoredText,
        draftRestored,
      },
      after,
      didWritePrompt: true,
      didGenerate: false,
      generationSendPaused: GENERATION_SEND_PAUSED,
      sensorVersion: globalThis.__ATLAS_FLOW_V1_SENSOR__.version,
      note: 'Probe CDP do job real no compositor direto; Start não clicado; Agente inativo; rascunho restaurado.',
    }
  }

  /**
   * Editor do prompt (compositor direto de imagem), NÃO título nem chat do Agente.
   * PT: âncoras "Iniciar geração" / "O que você quer criar?" / "Adicionar elementos…".
   * Sem fallback para “primeiro/último contenteditable”.
   */
  function findPromptEditor() {
    const editors = deepQueryAll('[contenteditable="true"], textarea').filter((el) =>
      isElementUsable(el),
    )
    if (editors.length === 0) return null

    const anchors = findControlCandidates(isComposerAnchorLabel).map((item) => item.el)
    // Incluir Start listado (mesmo disabled) — âncora do compositor clássico.
    const startGen = findControlCandidates(isStartGenerationLabel)
    const placeholders = findControlCandidates(isDirectComposerPlaceholderLabel)

    let best = null
    let bestScore = Infinity
    for (const editor of editors) {
      const er = editor.getBoundingClientRect()
      let score = 50_000
      const aria = normalizeControlLabel(
        `${controlLabel(editor)} ${editor.getAttribute('aria-label') || ''} ${editor.getAttribute('aria-placeholder') || ''} ${editor.getAttribute('data-placeholder') || ''} ${editor.getAttribute('placeholder') || ''}`,
      )
      if (isAgentInstructionLabel(aria)) score += 50_000
      for (const anchor of anchors) {
        const ar = anchor.getBoundingClientRect()
        const dist =
          Math.abs(er.left - ar.left) +
          Math.abs(er.bottom - ar.top) +
          Math.abs(er.top - ar.top) * 0.25
        if (dist < score) score = dist
      }
      for (const item of startGen) {
        const ar = item.el.getBoundingClientRect()
        const dist = Math.abs(er.bottom - ar.bottom) * 2 + Math.abs(er.right - ar.left)
        score = Math.min(score, dist)
      }
      for (const item of placeholders) {
        const ar = item.el.getBoundingClientRect()
        const dist = Math.abs(er.top - ar.top) + Math.abs(er.left - ar.left)
        score = Math.min(score, dist + 500)
      }
      if (
        /what do you want to create|o que voce quer criar|prompt|describe|descreva/.test(aria)
      ) {
        score -= 8_000
      }
      if (/editable text|texto editavel|project name|nome do projeto/.test(aria)) {
        score += 12_000
      }
      if (er.top < 160) score += 10_000
      if (er.top > window.innerHeight * 0.45) score -= 2_000
      if (score < bestScore) {
        best = editor
        bestScore = score
      }
    }
    if (!best) return null
    const bestRect = best.getBoundingClientRect()
    const nearStart = startGen.some((item) => {
      const ar = item.el.getBoundingClientRect()
      return Math.abs(bestRect.bottom - ar.bottom) < 120
    })
    // top>=140 é auxiliar: só bloqueia se também estiver longe do Start.
    if (bestRect.top < 140 && !nearStart) return null
    const bestAria = normalizeControlLabel(
      `${controlLabel(best)} ${best.getAttribute('aria-label') || ''} ${best.getAttribute('aria-placeholder') || ''}`,
    )
    if (isAgentInstructionLabel(bestAria)) return null
    if (startGen.length < 1 && anchors.length < 1 && placeholders.length < 1) return null
    return best
  }

  function describeComposerEditor(el) {
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const startGen = findControlCandidates(isStartGenerationLabel)
    const placeholders = findControlCandidates(isDirectComposerPlaceholderLabel)
    const ingredients = findControlCandidates(isAddIngredientsLabel)
    const nearStart = startGen.some((item) => {
      const ar = item.el.getBoundingClientRect()
      return Math.abs(rect.bottom - ar.bottom) < 120
    })
    return {
      tag: el.tagName,
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      left: Math.round(rect.left),
      aria:
        controlLabel(el) ||
        el.getAttribute('aria-label') ||
        el.getAttribute('aria-placeholder') ||
        null,
      anchors: {
        startListed: startGen.length,
        startLabels: startGen.map((i) => i.label).slice(0, 2),
        placeholderListed: placeholders.length,
        ingredientsListed: ingredients.length,
        nearStart,
      },
      topCheckAuxiliary: rect.top >= 140 || nearStart,
    }
  }

  function snapshotStartGeneration() {
    const inspection = summarizeControlInspection(isStartGenerationLabel)
    const usable = findUsableControl(isStartGenerationLabel)
    const all = findControlCandidates(isStartGenerationLabel)
    return {
      listed: all.length,
      usable: usable.length,
      labels: all.map((i) => i.label).slice(0, 3),
      disabledAttr: inspection?.candidates?.[0]?.details?.disabledAttr ?? null,
      inspection,
    }
  }

  async function clearPromptAfterGeneration() {
    const editor = findPromptEditor()
    const editorRect = editor?.getBoundingClientRect?.()
    let target = findUsableControl(isClearPromptLabel)[0]?.el || null
    if (!target && editor) {
      let node = editor.parentElement
      let box = node
      for (let depth = 0; depth < 6 && node; depth += 1) {
        const rect = node.getBoundingClientRect()
        if (rect.width >= editorRect.width - 12 && rect.height < 680 && rect.width < 1100) box = node
        node = node.parentElement
      }
      target =
        deepQueryAll('button, [role="button"]', box || document).find((el) => {
          if (!isShown(el)) return false
          const label = normLabel(accessibleName(el))
          if (isClearPromptLabel(label)) return true
          const rect = el.getBoundingClientRect()
          if (rect.width > 48 || rect.height > 48 || rect.width < 12) return false
          return rect.top <= editorRect.top + 12 && rect.right >= editorRect.right - 36
        }) || null
    }
    if (!target) return { ok: false, error: 'CLEAR_PROMPT_MISSING' }
    const click = await trustedClickElement(target, { align: 'center' })
    await waitForDomTick(400, null)
    const text = readPromptText() || ''
    return {
      ok: text === '' && click?.ok !== false,
      method: 'apagar_comando',
      click,
      readBack: text,
    }
  }

  /** Limpa o compositor (rascunho vazio). Prefere "Apagar comando"; senão CDP selectAll+Backspace. */
  async function clearComposerDraftCdpOrObserved() {
    const beforeAgent = detectAgentSession()
    if (beforeAgent.active) {
      return {
        ok: false,
        error: 'AGENT_MODE_ACTIVE',
        intent: DIRECT_IMAGE_GENERATION_INTENT,
      }
    }
    const clearBtns = findUsableControl(isClearPromptLabel)
    if (clearBtns.length === 1) {
      const click = await trustedClickElement(clearBtns[0].el)
      await waitForDomTick(350, null)
      const text = readPromptText() || ''
      const agent = detectAgentSession()
      return {
        ok: text === '' && agent.active === false && click?.ok === true,
        method: 'clear_prompt_button',
        label: clearBtns[0].label,
        click,
        readBack: text,
        agent,
        intent: DIRECT_IMAGE_GENERATION_INTENT,
      }
    }
    // Fallback: mesmo writePromptText CDP com texto vazio (selectAll+Backspace no SW).
    return writePromptText('', { cdpOnly: true })
  }

  /** Fecha painel de assets se aberto (senão cobrir composer / roubar foco). */
  async function dismissAssetsPanelIfOpen() {
    if (!detectAssetsPanel().present && !findAssetsPanelRoot()) {
      return { closed: false, reason: 'not_open' }
    }
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }),
    )
    await sleep(200)
    document.dispatchEvent(
      new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }),
    )
    await sleep(250)
    // Clica no composer / setinha para tirar foco do painel.
    const start = findUsableControl(isStartGenerationLabel)[0]
    if (start?.el) {
      try {
        start.el.focus?.()
      } catch {
        /* ignore */
      }
    }
    return {
      closed: !detectAssetsPanel().present,
      reason: detectAssetsPanel().present ? 'still_open' : 'dismissed',
    }
  }

  /** Ativa o compositor direto (placeholder PT/EN) antes de digitar. Nunca foca Agente. */
  async function focusPromptComposer() {
    if (detectAgentSession().active) return null
    const placeholder = findControlCandidates(isDirectComposerPlaceholderLabel)
    if (placeholder[0]?.el) {
      try {
        placeholder[0].el.click()
      } catch {
        /* ignore */
      }
      await sleep(120)
    }
    if (detectAgentSession().active) return null
    let editor = findPromptEditor()
    if (editor) {
      try {
        editor.click()
        editor.focus()
      } catch {
        /* ignore */
      }
      await sleep(80)
    }
    if (detectAgentSession().active) return null
    editor = findPromptEditor()
    return editor
  }

  function readPromptText() {
    const editor = findPromptEditor()
    if (!editor) return null
    if (editor instanceof HTMLTextAreaElement) return String(editor.value || '').trim()
    return (editor.innerText || editor.textContent || '').trim()
  }

  function clickElementHard(el) {
    if (!el) return { ok: false }
    const rect = el.getBoundingClientRect()
    const x = rect.left + Math.max(rect.width / 2, 1)
    const y = rect.top + Math.max(rect.height / 2, 1)
    const base = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      button: 0,
      buttons: 1,
      detail: 1,
    }
    try {
      el.focus?.()
    } catch {
      /* ignore */
    }
    el.dispatchEvent(
      new PointerEvent('pointerdown', { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true }),
    )
    el.dispatchEvent(new MouseEvent('mousedown', base))
    el.dispatchEvent(
      new PointerEvent('pointerup', { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true }),
    )
    el.dispatchEvent(new MouseEvent('mouseup', base))
    el.dispatchEvent(new MouseEvent('click', base))
    try {
      el.click()
    } catch {
      /* ignore */
    }
    return { ok: true, x: Math.round(x), y: Math.round(y) }
  }

  /**
   * Clique trusted via background chrome.debugger (CDP Input).
   * align center: chips do painel. O padrão 0.72 acerta a seta de Start generation.
   */
  async function trustedClickElement(el, options = {}) {
    if (!el) return { ok: false, error: 'NO_ELEMENT' }
    try {
      el.scrollIntoView({ block: 'center', inline: 'nearest' })
    } catch {
      /* ignore */
    }
    await sleep(80)
    const rect = el.getBoundingClientRect()
    const fraction = options.align === 'left' ? 0.15 : options.align === 'center' ? 0.5 : 0.72
    const x = rect.left + Math.max(rect.width * fraction, 1)
    const y = rect.top + Math.max(rect.height / 2, 1)
    const ariaLabel =
      el.getAttribute('aria-label') || controlLabel(el) || ''
    const button = options.button === 'right' ? 'right' : 'left'
    el.setAttribute('data-atlas-flow-click', '1')
    try {
      const result = await sendRuntimeMessage({
        type: 'atlas-flow-v1.trustedClick',
        payload: { x, y, ariaLabel, originX: x, originY: y, button },
      })
      el.removeAttribute('data-atlas-flow-click')
      return { ...(result || {}), x: Math.round(x), y: Math.round(y), ariaLabel, button }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        x: Math.round(x),
        y: Math.round(y),
        ariaLabel,
        button,
      }
    } finally {
      el.removeAttribute('data-atlas-flow-click')
    }
  }

  function dispatchEditorKey(editor, key, mods = {}) {
    if (!editor) return
    const init = {
      key,
      code: key === 'Enter' ? 'Enter' : key,
      keyCode: key === 'Enter' ? 13 : 0,
      which: key === 'Enter' ? 13 : 0,
      bubbles: true,
      cancelable: true,
      ctrlKey: mods.ctrl === true,
      metaKey: mods.meta === true,
      shiftKey: mods.shift === true,
      altKey: mods.alt === true,
    }
    editor.dispatchEvent(new KeyboardEvent('keydown', init))
    editor.dispatchEvent(new KeyboardEvent('keypress', init))
    editor.dispatchEvent(new KeyboardEvent('keyup', init))
  }

  /**
   * @param {string} text
   * @param {{ cdpOnly?: boolean }} [options]
   *   cdpOnly: só trusted CDP do job (sem fallback sintético) — usado no probe.
   */
  async function writePromptText(text, options = {}) {
    const cdpOnly = options.cdpOnly === true
    const targetText = typeof text === 'string' ? text : ''
    await closeImageSettingsPanel()
    await dismissAssetsPanelIfOpen()
    const mode = await ensureClassicCreateMode()
    if (!mode.ok) {
      return {
        ok: false,
        error: mode.error || 'AGENT_MODE_ACTIVE',
        mode,
        intent: DIRECT_IMAGE_GENERATION_INTENT,
        note: 'Não escrever no compositor enquanto o Agente estiver ativo / modo não confirmado.',
      }
    }
    const editor = await focusPromptComposer()
    if (!editor) {
      return {
        ok: false,
        error: detectAgentSession().active ? 'AGENT_MODE_ACTIVE' : 'PROMPT_EDITOR_NOT_FOUND',
        mode,
        intent: DIRECT_IMAGE_GENERATION_INTENT,
        note: 'Foco no compositor direto falhou ou Agente abriu ao focar.',
      }
    }

    let active = findPromptEditor() || editor
    const described = describeComposerEditor(active)
    if (!described?.anchors?.startListed && !described?.anchors?.placeholderListed) {
      return {
        ok: false,
        error: 'DIRECT_COMPOSER_ANCHOR_MISSING',
        editor: described,
        mode,
        intent: DIRECT_IMAGE_GENERATION_INTENT,
      }
    }
    // top é auxiliar: bloqueia só se longe do Start.
    if (described.top < 140 && !described.anchors.nearStart) {
      return {
        ok: false,
        error: 'PROMPT_EDITOR_TOP_SUSPECT',
        editor: described,
        editorTop: described.top,
        mode,
        intent: DIRECT_IMAGE_GENERATION_INTENT,
      }
    }
    const editorAria =
      described.aria ||
      controlLabel(active) ||
      active.getAttribute('aria-label') ||
      active.getAttribute('aria-placeholder') ||
      'O que você quer criar?'
    if (isAgentInstructionLabel(editorAria)) {
      return {
        ok: false,
        error: 'AGENT_EDITOR_SELECTED',
        editor: described,
        mode,
        intent: DIRECT_IMAGE_GENERATION_INTENT,
      }
    }
    active.focus()

    if (active instanceof HTMLTextAreaElement) {
      if (cdpOnly) {
        return {
          ok: false,
          error: 'CDP_ONLY_TEXTAREA_UNSUPPORTED',
          editor: described,
          intent: DIRECT_IMAGE_GENERATION_INTENT,
          note: 'Probe exige contenteditable via CDP (mesmo caminho do job).',
        }
      }
      const proto = window.HTMLTextAreaElement.prototype
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
      if (descriptor?.set) descriptor.set.call(active, targetText)
      else active.value = targetText
      active.dispatchEvent(
        new InputEvent('input', { bubbles: true, inputType: 'insertText', data: targetText }),
      )
      active.dispatchEvent(new Event('change', { bubbles: true }))
      const readBack = String(active.value || '').trim()
      return {
        ok: readBack === targetText || (targetText && readBack.includes(targetText.slice(0, 24))),
        method: 'textarea',
        readBack,
        editor: describeComposerEditor(active),
        intent: DIRECT_IMAGE_GENERATION_INTENT,
      }
    }

    const attempts = []
    // 0) CDP InsertText (trusted) — re-resolve por âncoras pós-banner no SW.
    try {
      const rect = active.getBoundingClientRect()
      const trustedType = await sendRuntimeMessage({
        type: 'atlas-flow-v1.trustedType',
        payload: {
          text: targetText,
          x: rect.left + Math.min(rect.width * 0.4, 40),
          y: rect.top + Math.max(rect.height / 2, 8),
          ariaLabel: editorAria,
        },
      })
      attempts.push({
        method: 'trusted_cdp_insertText',
        ok: trustedType?.ok === true,
        detail: trustedType || null,
      })
      await sleep(250)
      const agentAfterCdp = detectAgentSession()
      if (agentAfterCdp.active) {
        return {
          ok: false,
          error: 'AGENT_ACTIVATED_BY_WRITE',
          method: 'trusted_cdp_insertText',
          attempts,
          editor: describeComposerEditor(findPromptEditor() || active),
          agent: agentAfterCdp,
          intent: DIRECT_IMAGE_GENERATION_INTENT,
          firstDivergentInteraction: 'writePromptText.trusted_cdp_insertText',
          note: 'CDP/write abriu Agente — abortar. Não Aprovar.',
        }
      }
      if (cdpOnly && trustedType?.ok !== true) {
        return {
          ok: false,
          error: trustedType?.error || 'TRUSTED_TYPE_FAILED',
          method: 'trusted_cdp_insertText',
          attempts,
          editor: described,
          intent: DIRECT_IMAGE_GENERATION_INTENT,
          note: 'Probe cdpOnly: sem fallback sintético.',
        }
      }
    } catch (error) {
      attempts.push({
        method: 'trusted_cdp_insertText',
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
      if (cdpOnly) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          method: 'trusted_cdp_insertText',
          attempts,
          intent: DIRECT_IMAGE_GENERATION_INTENT,
        }
      }
    }

    const sliceLen = Math.min(12, Math.max(1, targetText.length))
    const hasTarget = (el) => {
      const body = el?.innerText || el?.textContent || ''
      if (!targetText) return String(body).trim() === ''
      return body.includes(targetText.slice(0, sliceLen))
    }

    if (!cdpOnly && !hasTarget(active)) {
      try {
        const selection = window.getSelection()
        const range = document.createRange()
        range.selectNodeContents(active)
        selection?.removeAllRanges()
        selection?.addRange(range)
        const okInsert =
          document.execCommand('selectAll', false) &&
          document.execCommand('insertText', false, targetText)
        attempts.push({ method: 'insertText', ok: okInsert })
      } catch (error) {
        attempts.push({
          method: 'insertText',
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    if (!cdpOnly && !hasTarget(active)) {
      try {
        active.focus()
        document.execCommand('selectAll', false)
        const dt = new DataTransfer()
        dt.setData('text/plain', targetText)
        const paste = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: dt,
        })
        const notCancelled = active.dispatchEvent(paste)
        if (notCancelled && !hasTarget(active)) {
          document.execCommand('insertText', false, targetText)
        }
        attempts.push({ method: 'paste', ok: hasTarget(active) })
      } catch (error) {
        attempts.push({
          method: 'paste',
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    if (!cdpOnly && !hasTarget(active)) {
      active.textContent = ''
      if (targetText) active.appendChild(document.createTextNode(targetText))
      active.dispatchEvent(
        new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: targetText,
        }),
      )
      active.dispatchEvent(
        new InputEvent('input', { bubbles: true, inputType: 'insertText', data: targetText }),
      )
      attempts.push({ method: 'textNode', ok: true })
    }

    active.dispatchEvent(new Event('change', { bubbles: true }))
    active.focus()

    const liveEditor = findPromptEditor() || active
    const readBack = (liveEditor.innerText || liveEditor.textContent || '').trim()
    const method = attempts
      .filter((item) => item.ok)
      .map((item) => item.method)
      .join('+')
    const liveDesc = describeComposerEditor(liveEditor)
    const agentAfter = detectAgentSession()
    if (agentAfter.active || (liveDesc?.top < 140 && !liveDesc?.anchors?.nearStart)) {
      return {
        ok: false,
        error: agentAfter.active ? 'AGENT_ACTIVATED_BY_WRITE' : 'PROMPT_EDITOR_TOP_SUSPECT',
        method: method || 'contenteditable_failed',
        readBack,
        attempts,
        editor: liveDesc,
        agent: agentAfter,
        intent: DIRECT_IMAGE_GENERATION_INTENT,
        note: 'Após write: Agente ativo ou editor suspeito — não enviar.',
      }
    }
    const textOk = !targetText
      ? readBack === ''
      : readBack === targetText ||
        readBack.includes(targetText.slice(0, Math.min(24, targetText.length)))
    const cdpOk = attempts.some((a) => a.method === 'trusted_cdp_insertText' && a.ok)
    return {
      ok: cdpOnly ? textOk && cdpOk : textOk,
      method: method || 'contenteditable_failed',
      readBack,
      attempts,
      editor: liveDesc,
      cdpOnly,
      cdpOk,
      intent: DIRECT_IMAGE_GENERATION_INTENT,
    }
  }

  async function openUniqueControl(matcherDescription, matcher) {
    const usable = findUsableControl(matcher)
    if (usable.length === 0) {
      const loading = detectLoadingState()
      const before = buildObservation()
      const nearby = (before.labelsSample || [])
        .filter((label) =>
          /ingredient|elementos|gera|generat|media|arquivo|upload|adicionar|add /i.test(label),
        )
        .slice(0, 12)
      return {
        ok: false,
        error: loading.isLoading ? 'PROJECT_UI_LOADING' : 'CONTROL_NOT_FOUND',
        sought: matcherDescription,
        matchCount: 0,
        matchedLabels: [],
        nearbyCandidateLabels: nearby,
        loading,
        before,
        note: loading.isLoading
          ? 'UI ainda carregando.'
          : `Controle "${matcherDescription}" ausente com matcher EN/PT exato. Página pode estar correta com locale diferente do esperado antigo.`,
      }
    }
    if (usable.length > 1) {
      return {
        ok: false,
        error: 'CONTROL_AMBIGUOUS',
        sought: matcherDescription,
        matchCount: usable.length,
        matchedLabels: usable.map((item) => item.label).slice(0, 10),
        before: buildObservation(),
      }
    }
    const found = usable[0]
    const before = buildObservation()
    found.el.click()
    await waitForDomTick(500, null)
    const after = buildObservation()
    return {
      ok: true,
      selector: {
        strategy: 'unique_usable_aria_or_text',
        label: found.label,
        matchCount: 1,
        confirmedUnique: true,
        purpose: matcherDescription,
      },
      before,
      after,
      fileInputsBefore: before.fileInputs.length,
      fileInputsAfter: after.fileInputs.length,
      newLabels: after.labelsSample.filter((l) => !before.labelsSample.includes(l)),
    }
  }

  async function waitForAssetsPanelUploadAction(expectedFlowProjectId, timeoutMs) {
    const started = Date.now()
    let lastPanel = detectAssetsPanel()
    while (Date.now() - started < timeoutMs) {
      const context = assertProjectContext(expectedFlowProjectId)
      if (!context.ok) {
        return {
          ok: false,
          error: context.error,
          durationMs: Date.now() - started,
          context,
          panel: lastPanel,
          observation: buildObservation(),
        }
      }

      lastPanel = detectAssetsPanel()
      if (lastPanel.scope.isGlobalBlocking && !lastPanel.present) {
        await waitForDomTick(300, null)
        continue
      }

      // Upload único/utilizável: seguir mesmo se a lista ainda carrega.
      if (lastPanel.uploadUsableCount === 1) {
        return {
          ok: true,
          durationMs: Date.now() - started,
          context,
          panel: lastPanel,
          observation: buildObservation(),
        }
      }

      if (lastPanel.uploadUsableCount > 1) {
        return {
          ok: false,
          error: 'UPLOAD_MEDIA_AMBIGUOUS',
          durationMs: Date.now() - started,
          context,
          panel: lastPanel,
          observation: buildObservation(),
        }
      }

      await waitForDomTick(300, null)
    }

    const context = assertProjectContext(expectedFlowProjectId)
    lastPanel = detectAssetsPanel()
    const stillGlobal =
      lastPanel.scope.isGlobalBlocking && !lastPanel.present && lastPanel.loading?.isLoading
    return {
      ok: false,
      error: stillGlobal
        ? 'PROJECT_UI_LOADING_TIMEOUT'
        : lastPanel.present
          ? 'ASSETS_PANEL_UPLOAD_TIMEOUT'
          : 'ASSETS_PANEL_NOT_FOUND',
      durationMs: Date.now() - started,
      context,
      panel: lastPanel,
      observation: buildObservation(),
      note: lastPanel.present
        ? 'Painel de assets presente; Upload media não ficou único/utilizável a tempo. Loading da lista ≠ bloqueio global.'
        : 'Painel de assets não identificado após ingredients.',
    }
  }

  async function openUploadUiSequentially(expectedFlowProjectId) {
    const ready = await waitForProjectReady({
      expectedFlowProjectId,
      forOperation: 'open_upload',
      timeoutMs: 45_000,
    })
    if (!ready.ok) {
      return {
        ok: false,
        step: 'wait_for_project_ready',
        error: ready.error,
        ready,
        sensorVersion: globalThis.__ATLAS_FLOW_V1_SENSOR__.version,
      }
    }

    const beforeContext = assertProjectContext(expectedFlowProjectId)
    if (!beforeContext.ok) {
      return {
        ok: false,
        step: 'context_before_ingredients',
        error: beforeContext.error,
        ready,
        beforeContext,
        observation: buildObservation(),
        sensorVersion: globalThis.__ATLAS_FLOW_V1_SENSOR__.version,
      }
    }

    // Caminho observado: Add ingredients abre o seletor de assets (não Add media menu).
    const ingredients = await openUniqueControl('add_ingredients', isAddIngredientsLabel)
    if (!ingredients.ok) {
      return {
        ok: false,
        step: 'open_ingredients',
        error: ingredients.error,
        ready,
        ingredients,
        observation: buildObservation(),
        sensorVersion: globalThis.__ATLAS_FLOW_V1_SENSOR__.version,
      }
    }

    await waitForDomTick(400, null)

    const afterContext = assertProjectContext(expectedFlowProjectId)
    if (!afterContext.ok) {
      return {
        ok: false,
        step: 'context_after_ingredients',
        error: afterContext.error,
        ready,
        ingredients,
        afterContext,
        observation: buildObservation(),
        sensorVersion: globalThis.__ATLAS_FLOW_V1_SENSOR__.version,
      }
    }

    // Acompanha o painel aberto; NÃO revalidar open_upload global (Loading da lista ≠ página bloqueada).
    let panelWait = await waitForAssetsPanelUploadAction(expectedFlowProjectId, 20_000)
    let addMediaAlternate = null

    // Só tenta Add media menu se o painel de assets NÃO apareceu (entradas alternativas).
    if (!panelWait.ok && panelWait.error === 'ASSETS_PANEL_NOT_FOUND') {
      addMediaAlternate = await openUniqueControl('add_media_menu', isAddMediaMenuLabel)
      if (addMediaAlternate.ok) {
        await waitForDomTick(400, null)
        panelWait = await waitForAssetsPanelUploadAction(expectedFlowProjectId, 15_000)
      }
    }

    if (!panelWait.ok) {
      return {
        ok: false,
        step: 'wait_assets_panel_upload',
        error: panelWait.error,
        ready,
        ingredients,
        addMediaAlternate,
        panelWait,
        observation: buildObservation(),
        sensorVersion: globalThis.__ATLAS_FLOW_V1_SENSOR__.version,
      }
    }

    const uploadMedia = await openUniqueControl('upload_media', isUploadMediaLabel)
    if (!uploadMedia.ok) {
      return {
        ok: false,
        step: 'open_upload_media',
        error: uploadMedia.error,
        ready,
        ingredients,
        addMediaAlternate,
        panelWait,
        uploadMedia,
        observation: buildObservation(),
        sensorVersion: globalThis.__ATLAS_FLOW_V1_SENSOR__.version,
        note: 'Upload media não acionável após painel pronto.',
      }
    }

    await waitForDomTick(500, null)
    const fileInput = inspectFileInputs()
    const afterUploadMedia = buildObservation()

    return {
      ok: true,
      step: 'upload_ui_opened',
      ready,
      ingredients,
      addMediaAlternate,
      panelWait,
      uploadMedia,
      fileInput,
      observation: afterUploadMedia,
      sensorVersion: globalThis.__ATLAS_FLOW_V1_SENSOR__.version,
      note: fileInput.ok
        ? `Upload media acionado; file input registrado (visualmenteUtilizável=${fileInput.inputMeta?.visuallyUsable}).`
        : 'Upload media acionado; file input ainda não único — ver observation.fileInputs (pode estar oculto).',
    }
  }

  function base64ToUint8Array(base64) {
    const bin = atob(base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
    return bytes
  }

  function inspectFileInputs() {
    const metas = collectFileInputs()
    const enabled = deepQueryAll('input[type="file"]').filter((el) => !el.disabled)
    if (enabled.length === 0) {
      return {
        ok: false,
        error: 'FILE_INPUT_NOT_FOUND',
        matchCount: 0,
        inputs: metas,
        note: 'Nenhum input[type=file] no DOM (inclui ocultos). Existência visual não é requisito.',
      }
    }
    if (enabled.length > 1) {
      return {
        ok: false,
        error: 'FILE_INPUT_AMBIGUOUS',
        matchCount: enabled.length,
        inputs: metas,
        accepts: enabled.map((el) => el.getAttribute('accept')),
      }
    }
    const input = enabled[0]
    const meta = metas.find((item) => item.index === 0) || metas[0]
    return {
      ok: true,
      input,
      matchCount: 1,
      inputMeta: meta,
      inputs: metas,
      mechanism: {
        kind: 'input_type_file',
        accept: input.getAttribute('accept'),
        multiple: input.multiple === true,
        visuallyUsable: meta?.visuallyUsable === true,
        note: 'Mecanismo DOM registrado; oculto ainda pode aceitar DataTransfer.',
      },
    }
  }

  function findUniqueFileInput() {
    const inspected = inspectFileInputs()
    if (!inspected.ok) {
      return {
        ok: false,
        error: inspected.error,
        matchCount: inspected.matchCount,
        inputs: inspected.inputs,
        accepts: inspected.accepts,
      }
    }
    return {
      ok: true,
      input: inspected.input,
      matchCount: 1,
      inputMeta: inspected.inputMeta,
      mechanism: inspected.mechanism,
    }
  }

  async function sha256HexOfBytes(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }

  function fileNameStem(name) {
    return String(name || '')
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '')
  }

  /** Espelha uploadIdentity.mjs — SCRIPT/_gd não são evidência de mídia. */
  function isExcludedAssetTag(tag) {
    const value = String(tag || '').toUpperCase()
    return (
      value === 'SCRIPT' ||
      value === 'STYLE' ||
      value === 'NOSCRIPT' ||
      value === 'META' ||
      value === 'LINK' ||
      value === 'TEMPLATE' ||
      value === 'HEAD'
    )
  }

  function isLegitimateMediaId(id) {
    if (typeof id !== 'string') return false
    const value = id.trim()
    if (!value) return false
    if (value === '_gd' || value.startsWith('_')) return false
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      return true
    }
    if (/^[a-zA-Z0-9-]{20,}$/.test(value) && !/[{}[\]"'=]/.test(value)) return true
    return false
  }

  function extractMediaIdentityFromElement(el) {
    if (!el || isExcludedAssetTag(el.tagName)) return null
    for (const key of ['data-media-id', 'data-asset-id', 'data-tile-id', 'data-entity-id']) {
      const value = el.getAttribute(key)
      if (isLegitimateMediaId(value)) return { id: value.trim(), source: key }
    }
    const dataId = el.getAttribute('data-id')
    if (isLegitimateMediaId(dataId)) return { id: dataId.trim(), source: 'data-id' }
    const hrefOrSrc =
      el.getAttribute('href') ||
      el.getAttribute('src') ||
      (el instanceof HTMLImageElement ? el.currentSrc || el.src : '') ||
      ''
    if (hrefOrSrc) {
      const mediaPath = String(hrefOrSrc).match(
        /\/(?:media|asset|assets|file|ingredient|image)s?\/([a-zA-Z0-9_-]{6,})/i,
      )
      if (mediaPath && isLegitimateMediaId(mediaPath[1])) {
        return { id: mediaPath[1], source: 'url_path' }
      }
    }
    return null
  }

  function labelMatchesFile(label, fileName, stem) {
    const normalized = String(label || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
    const compact = normalized.replace(/\s+/g, '')
    const file = String(fileName || '').toLowerCase()
    const fileHit =
      Boolean(file) && (normalized.includes(file) || compact.includes(file.replace(/\s+/g, '')))
    const stemHit = Boolean(stem) && compact.includes(stem)
    return { fileHit, stemHit, matched: fileHit || stemHit }
  }

  function assetItemLabel(el) {
    const img = el.querySelector?.('img')
    return [
      controlLabel(el),
      el.getAttribute('alt'),
      el.getAttribute('title'),
      img?.getAttribute('alt'),
      img?.getAttribute('title'),
      el.innerText,
    ]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function extractAssetFileNameHints(text) {
    const matches = String(text || '').match(
      /[a-z0-9][a-z0-9_-]*\.(?:png|jpe?g|webp|gif|heic|heif|mp4|mov|webm|m4v)/gi,
    )
    if (!matches) return []
    return [...new Set(matches.map((item) => item.toLowerCase()))]
  }

  function sanitizeMediaUrl(url) {
    if (!url || typeof url !== 'string') return null
    try {
      const parsed = new URL(url, 'https://flow.google.com')
      return parsed.origin + parsed.pathname
    } catch {
      return url.split('?')[0].slice(0, 160)
    }
  }

  /** Pontos de nome do arquivo (folha) — o botão pode ser só um filho interno do card. */
  function findNameHitElements(fileName, stem) {
    const nodes = deepQueryAll(
      'button, [role="button"], [role="option"], [role="listitem"], [role="row"], a[href], [role="gridcell"], span, div, p, img',
    ).filter((el) => !isExcludedAssetTag(el.tagName))
    const matches = []
    for (const el of nodes) {
      const label = assetItemLabel(el)
      const match = labelMatchesFile(label, fileName, stem)
      if (!match.matched) continue
      matches.push({
        el,
        label: label.slice(0, 120),
        fileHit: match.fileHit,
        stemHit: match.stemHit,
        tag: el.tagName,
      })
    }
    return matches.filter(
      (item) => !matches.some((other) => other !== item && item.el.contains(other.el)),
    )
  }

  function relevantElementAttrs(el) {
    if (!el || !el.getAttribute) return {}
    const out = {}
    for (const key of [
      'role',
      'aria-label',
      'title',
      'alt',
      'data-media-id',
      'data-asset-id',
      'data-tile-id',
      'data-entity-id',
      'data-id',
      'href',
    ]) {
      const value = el.getAttribute(key)
      if (!value) continue
      if (key === 'href') out[key] = sanitizeMediaUrl(value)
      else out[key] = value.slice(0, 120)
    }
    const src = el.getAttribute('src') || (el instanceof HTMLImageElement ? el.currentSrc : '')
    if (src) out.src = sanitizeMediaUrl(src)
    return out
  }

  /**
   * Filhos com OUTRO asset (nome estrangeiro).
   * Não conta botão+IMG/tooltip do mesmo arquivo como vários assets.
   */
  function countForeignAssetChildren(node, fileName, stem) {
    let count = 0
    const foreign = []
    for (const child of Array.from(node.children || [])) {
      if (isExcludedAssetTag(child.tagName)) continue
      const names = extractAssetFileNameHints(child.innerText || assetItemLabel(child))
      const otherNames = names.filter((name) => !labelMatchesFile(name, fileName, stem).matched)
      if (otherNames.length >= 1) {
        count += 1
        foreign.push({ tag: child.tagName, otherNames: otherNames.slice(0, 4) })
      }
    }
    return { count, foreign: foreign.slice(0, 6) }
  }

  function classifyDomMultiAsset(node, fileName, stem) {
    if (!node || node === document.body || node === document.documentElement) {
      return {
        multi: true,
        reason: 'document_root',
        detail: 'Raiz do documento sempre multi-asset.',
        distinctFileNames: [],
        ourNames: [],
        otherNames: [],
        foreignChildAssetCount: 0,
      }
    }
    const names = extractAssetFileNameHints(node.innerText || assetItemLabel(node))
    const distinctFileNames = [...new Set(names)]
    const ourNames = distinctFileNames.filter((name) =>
      labelMatchesFile(name, fileName, stem).matched,
    )
    const otherNames = distinctFileNames.filter(
      (name) => !labelMatchesFile(name, fileName, stem).matched,
    )
    const foreignKids = countForeignAssetChildren(node, fileName, stem)
    const mediaIds = collectMediaIdsInScope(node, { shallow: false }).identities.map(
      (entry) => entry.id,
    )

    if (otherNames.length >= 1) {
      return {
        multi: true,
        reason: 'distinct_foreign_filenames',
        detail:
          'Contêiner tem nomes de arquivos distintos (não apenas repetições do mesmo nome).',
        distinctFileNames,
        ourNames,
        otherNames,
        foreignChildAssetCount: foreignKids.count,
        foreignChildren: foreignKids.foreign,
        mediaIds: mediaIds.slice(0, 6),
      }
    }
    if (foreignKids.count > 0 && ourNames.length >= 1) {
      return {
        multi: true,
        reason: 'foreign_asset_child',
        detail: 'Filho direto apresenta nome de outro asset.',
        distinctFileNames,
        ourNames,
        otherNames,
        foreignChildAssetCount: foreignKids.count,
        foreignChildren: foreignKids.foreign,
        mediaIds: mediaIds.slice(0, 6),
      }
    }
    return {
      multi: false,
      reason: null,
      detail:
        ourNames.length > 1
          ? 'Mesmo nome repetido no contêiner (rótulo/tooltip) — um asset.'
          : 'Sem nomes estrangeiros; nome+img do mesmo card permitido.',
      distinctFileNames,
      ourNames,
      otherNames,
      foreignChildAssetCount: 0,
      mediaIds: mediaIds.slice(0, 6),
    }
  }

  function isMultiAssetContainer(node, fileName, stem) {
    return classifyDomMultiAsset(node, fileName, stem).multi === true
  }

  /**
   * Contêiner exclusivo: sobe da folha com o nome até incluir irmãos (IMG),
   * parando só ante ancestral com referências DIFERENTES.
   */
  function findExclusiveAssetCard(nameEl, fileName, stem) {
    let card = nameEl
    let node = nameEl
    const chain = []
    while (node && node !== document.body && node !== document.documentElement) {
      const classification = classifyDomMultiAsset(node, fileName, stem)
      if (classification.multi) {
        return {
          card,
          reason: 'stopped_before_multi_asset_ancestor',
          chain,
          multiAncestorTag: node.tagName,
          multiReason: classification.reason,
          multiDetail: classification.detail,
          multiClassification: classification,
        }
      }
      card = node
      const scoped = collectMediaIdsInScope(card, { shallow: false })
      chain.push({
        tag: node.tagName,
        depth: chain.length,
        mediaIdCount: scoped.identities.length,
        distinctFileNames: classification.distinctFileNames,
        classificationDetail: classification.detail,
      })
      if (scoped.identities.length === 1) {
        return { card, reason: 'exclusive_with_unique_id', chain, multiReason: null }
      }
      const parent = node.parentElement
      if (!parent) break
      const parentClass = classifyDomMultiAsset(parent, fileName, stem)
      if (parentClass.multi) {
        return {
          card,
          reason: 'parent_is_multi_asset',
          chain,
          multiAncestorTag: parent.tagName,
          multiReason: parentClass.reason,
          multiDetail: parentClass.detail,
          multiClassification: parentClass,
        }
      }
      node = parent
    }
    return { card, reason: 'exclusive_top', chain, multiReason: null }
  }

  /** Diagnóstico sanitizado da estrutura real — sem URLs assinadas. */
  function diagnoseAssetDomForFile(fileMeta) {
    const fileName = String(fileMeta?.name || '')
    const stem = fileNameStem(fileName)
    const nameHits = findNameHitElements(fileName, stem)
    const reports = []

    for (const hit of nameHits.slice(0, 3)) {
      const exclusive = findExclusiveAssetCard(hit.el, fileName, stem)
      const ancestors = []
      let node = hit.el
      let depth = 0
      while (node && depth < 10 && node !== document.documentElement) {
        const classification = classifyDomMultiAsset(node, fileName, stem)
        const scoped = collectMediaIdsInScope(node, { shallow: false })
        const siblingMedia = []
        if (node.parentElement) {
          for (const sib of Array.from(node.parentElement.children || [])) {
            if (sib === node || isExcludedAssetTag(sib.tagName)) continue
            const sibIds = collectMediaIdsInScope(sib, { shallow: false }).identities
            const sibNames = extractAssetFileNameHints(sib.innerText || assetItemLabel(sib))
            if (sibIds.length || sibNames.length) {
              siblingMedia.push({
                tag: sib.tagName,
                role: sib.getAttribute('role'),
                attrs: relevantElementAttrs(sib),
                fileNames: sibNames.slice(0, 4),
                mediaIds: sibIds.slice(0, 4).map((entry) => ({
                  id: entry.id,
                  source: entry.source,
                  tag: entry.tag,
                  srcHost: entry.srcHost || null,
                })),
              })
            }
          }
        }
        ancestors.push({
          depth,
          tag: node.tagName,
          role: node.getAttribute('role'),
          attrs: relevantElementAttrs(node),
          distinctFileNames: classification.distinctFileNames,
          ourNames: classification.ourNames,
          otherNames: classification.otherNames,
          multi: classification.multi,
          multiReason: classification.reason,
          multiDetail: classification.detail,
          foreignChildAssetCount: classification.foreignChildAssetCount,
          mediaIds: scoped.identities.slice(0, 6).map((entry) => ({
            id: entry.id,
            source: entry.source,
            tag: entry.tag,
            srcHost: entry.srcHost || null,
          })),
          relevantSiblings: siblingMedia.slice(0, 6),
        })
        node = node.parentElement
        depth += 1
      }

      const cardScoped = collectMediaIdsInScope(exclusive.card, { shallow: false })
      reports.push({
        fileName,
        stem,
        nameElement: {
          tag: hit.el.tagName,
          role: hit.el.getAttribute('role'),
          attrs: relevantElementAttrs(hit.el),
          label: hit.label,
        },
        exclusiveCard: {
          tag: exclusive.card?.tagName || null,
          role: exclusive.card?.getAttribute?.('role') || null,
          reason: exclusive.reason,
          multiReason: exclusive.multiReason || null,
          multiDetail: exclusive.multiDetail || null,
          multiAncestorTag: exclusive.multiAncestorTag || null,
          attrs: exclusive.card ? relevantElementAttrs(exclusive.card) : {},
          mediaIds: cardScoped.identities.slice(0, 6).map((entry) => ({
            id: entry.id,
            source: entry.source,
            tag: entry.tag,
            srcHost: entry.srcHost || null,
          })),
        },
        ancestors,
        cardSelectionFunction: 'findExclusiveAssetCard',
        note: 'Diagnóstico sanitizado. Mesmo nome repetido ≠ multi-asset; nomes distintos sim.',
      })
    }

    return {
      fileName,
      stem,
      hitCount: nameHits.length,
      reports,
      inspectedAt: new Date().toISOString(),
    }
  }

  function collectMediaIdsInScope(root, options) {
    const out = []
    const rejected = []
    const visit = (node) => {
      if (!node || node.nodeType !== 1) return
      if (isExcludedAssetTag(node.tagName)) {
        const rawId = node.getAttribute?.('data-id')
        if (rawId) {
          rejected.push({
            reason: 'excluded_tag',
            tag: node.tagName,
            dataId: String(rawId).slice(0, 40),
          })
        }
        return
      }
      const found = extractMediaIdentityFromElement(node)
      if (found) {
        out.push({
          id: found.id,
          source: found.source,
          tag: node.tagName,
          srcHost: sanitizeMediaUrl(node.getAttribute?.('src') || node.src || '') || null,
        })
      } else {
        const rawId = node.getAttribute?.('data-id')
        if (rawId && !isLegitimateMediaId(rawId)) {
          rejected.push({
            reason: 'non_media_data_id',
            tag: node.tagName,
            dataId: String(rawId).slice(0, 40),
          })
        }
      }
      if (options?.shallow) return
      if (node.shadowRoot) {
        Array.from(node.shadowRoot.children || []).forEach((child) => visit(child))
      }
      Array.from(node.children || []).forEach((child) => visit(child))
    }
    visit(root)
    const unique = []
    const seen = new Set()
    for (const entry of out) {
      if (seen.has(entry.id)) continue
      seen.add(entry.id)
      unique.push(entry)
    }
    return { identities: unique, rejected }
  }

  function sanitizeIdentityEvidence(evidence) {
    return {
      fileName: evidence.fileName || null,
      stem: evidence.stem || null,
      assetItemCount: evidence.assetItemCount ?? 0,
      withIdCount: evidence.withIdCount ?? 0,
      items: Array.isArray(evidence.items)
        ? evidence.items.slice(0, 8).map((item) => ({
            label: item.label || null,
            tag: item.tag || null,
            cardReason: item.cardReason || null,
            multiReason: item.multiReason || null,
            multiDetail: item.multiDetail || null,
            fileHit: Boolean(item.fileHit),
            stemHit: Boolean(item.stemHit),
            scopedMediaIds: Array.isArray(item.scopedMediaIds)
              ? item.scopedMediaIds.slice(0, 4).map((entry) => ({
                  id: entry.id,
                  source: entry.source,
                  tag: entry.tag || null,
                  srcHost: entry.srcHost ? String(entry.srcHost).split('?')[0] : null,
                }))
              : [],
            uniqueCount: item.uniqueCount ?? 0,
          }))
        : [],
      rejected: Array.isArray(evidence.rejected) ? evidence.rejected.slice(0, 12) : [],
      detailsTried: Boolean(evidence.detailsTried),
      detailsTargetConfirmed: Boolean(evidence.detailsTargetConfirmed),
      detailsResult: evidence.detailsResult || null,
      detailsObservation: evidence.detailsObservation || null,
      passiveObservation: evidence.passiveObservation || null,
      structureDiagnosis: evidence.structureDiagnosis || null,
      note: evidence.note || null,
    }
  }

  /**
   * Nome → card exclusivo → IDs em filhos/irmãos do card.
   * Não usa IMG de card vizinho nem ancestral multi-asset.
   */
  function discoverUploadIdentityForFile(fileMeta) {
    const fileName = String(fileMeta?.name || '')
    const stem = fileNameStem(fileName)
    const nameHits = findNameHitElements(fileName, stem)
    const itemEvidence = []
    const rejected = []
    const acceptedIds = []
    const cards = []

    for (const hit of nameHits) {
      const exclusive = findExclusiveAssetCard(hit.el, fileName, stem)
      const card = exclusive.card
      const scoped = collectMediaIdsInScope(card, { shallow: false })
      rejected.push(...scoped.rejected.slice(0, 6))
      const unique = scoped.identities.map((entry) => entry.id)
      if (
        exclusive.multiReason ||
        exclusive.reason === 'stopped_before_multi_asset_ancestor' ||
        exclusive.reason === 'parent_is_multi_asset'
      ) {
        rejected.push({
          reason: 'multi_asset_ancestor_ignored',
          tag: exclusive.multiAncestorTag || null,
          multiReason: exclusive.multiReason || exclusive.reason,
          multiDetail: exclusive.multiDetail || null,
          otherNames: exclusive.multiClassification?.otherNames || [],
        })
      }
      itemEvidence.push({
        label: hit.label,
        tag: card.tagName || hit.tag,
        cardReason: exclusive.reason,
        multiReason: exclusive.multiReason || null,
        multiDetail: exclusive.multiDetail || null,
        fileHit: hit.fileHit,
        stemHit: hit.stemHit,
        scopedMediaIds: scoped.identities.slice(0, 4),
        uniqueCount: unique.length,
      })
      cards.push({ hit, card, exclusive, identities: scoped.identities })
      if (unique.length === 1) acceptedIds.push(unique[0])
    }

    const withIdCount = itemEvidence.reduce((sum, item) => sum + item.uniqueCount, 0)
    const uniqueAccepted = [...new Set(acceptedIds)]
    const structureDiagnosis = diagnoseAssetDomForFile(fileMeta)
    const evidence = sanitizeIdentityEvidence({
      fileName,
      stem,
      assetItemCount: itemEvidence.length,
      withIdCount,
      items: itemEvidence,
      rejected,
      detailsTried: false,
      structureDiagnosis,
      note: 'Card exclusivo: nomes distintos = multi; mesmo nome repetido/nome+img = um asset.',
    })

    const primary = cards[0] || null
    if (uniqueAccepted.length === 1 && itemEvidence.some((item) => item.uniqueCount === 1)) {
      const matched = cards.find((entry) =>
        entry.identities.some((id) => id.id === uniqueAccepted[0]),
      )
      return {
        ok: true,
        certainty: 'accepted',
        uploadState: 'uploaded_bound_evidence',
        flowMediaId: uniqueAccepted[0],
        error: null,
        evidence,
        itemEl: matched?.hit.el || primary?.hit.el || null,
        cardEl: matched?.card || primary?.card || null,
      }
    }

    if (itemEvidence.length >= 1) {
      return {
        ok: false,
        certainty: 'may_have_sent',
        uploadState: 'upload_uncertain_needs_reconcile',
        flowMediaId: null,
        error: 'UPLOAD_IDENTITY_UNCERTAIN',
        evidence,
        itemEl: primary?.hit.el || null,
        cardEl: primary?.card || null,
        note: 'Nome no card exclusivo sem ID inequívoco — fallback de detalhes deve seguir.',
      }
    }

    return {
      ok: false,
      certainty: 'may_have_sent',
      uploadState: 'upload_uncertain_needs_reconcile',
      flowMediaId: null,
      error: 'ASSET_ITEM_NOT_FOUND',
      evidence,
      itemEl: null,
      cardEl: null,
    }
  }

  function beginPassiveMediaObservation() {
    const captured = []
    const originalFetch = window.fetch.bind(window)
    let active = true
    window.fetch = async function atlasPassiveFetch(...args) {
      const response = await originalFetch(...args)
      if (!active) return response
      try {
        const requestUrl = String(args[0]?.url || args[0] || '')
        const contentType = response.headers.get('content-type') || ''
        if (!/json|javascript|text\/plain/i.test(contentType)) return response
        const clone = response.clone()
        const text = await clone.text()
        const ids = []
        const uuidRe =
          /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
        let match
        while ((match = uuidRe.exec(text)) && ids.length < 8) {
          if (isLegitimateMediaId(match[0]) && !ids.includes(match[0])) ids.push(match[0])
        }
        const fileHints = extractAssetFileNameHints(text)
        if (ids.length || fileHints.length) {
          let hostPath = null
          try {
            const parsed = new URL(requestUrl, location.href)
            hostPath = parsed.origin + parsed.pathname
          } catch {
            hostPath = String(requestUrl).split('?')[0].slice(0, 160)
          }
          captured.push({
            hostPath,
            mediaIds: ids.slice(0, 4),
            fileHints: fileHints.slice(0, 4),
          })
        }
      } catch {
        /* observação passiva nunca quebra o fluxo */
      }
      return response
    }
    return {
      stop() {
        active = false
        window.fetch = originalFetch
        return captured.slice(0, 10)
      },
    }
  }

  /** Fallback: confirma alvo, abre detalhes, registra detailsTried + observação passiva. */
  async function tryDiscoverIdentityViaAssetDetails(fileMeta, targetEl) {
    const fileName = String(fileMeta?.name || '')
    const stem = fileNameStem(fileName)
    if (!targetEl) {
      return {
        ok: false,
        detailsTried: false,
        detailsTargetConfirmed: false,
        error: 'DETAILS_TARGET_MISSING',
        evidenceExtra: {
          detailsTried: false,
          detailsTargetConfirmed: false,
          detailsResult: 'target_missing',
        },
      }
    }

    const targetLabel = assetItemLabel(targetEl)
    const targetConfirmed = labelMatchesFile(targetLabel, fileName, stem).matched
    if (!targetConfirmed) {
      return {
        ok: false,
        detailsTried: false,
        detailsTargetConfirmed: false,
        error: 'DETAILS_TARGET_NOT_CONFIRMED',
        evidenceExtra: {
          detailsTried: false,
          detailsTargetConfirmed: false,
          detailsResult: 'target_not_confirmed',
          targetLabel: targetLabel.slice(0, 80),
        },
      }
    }

    const urlBefore = location.href
    const mediaBefore = new Set(
      collectMediaIdsInScope(document.body, { shallow: false }).identities.map((entry) => entry.id),
    )
    const addedNodes = []
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes || [])) {
          if (!node || node.nodeType !== 1) continue
          if (isExcludedAssetTag(node.tagName)) continue
          const ids = collectMediaIdsInScope(node, { shallow: false }).identities
          const names = extractAssetFileNameHints(node.innerText || assetItemLabel(node))
          if (ids.length || names.length) {
            addedNodes.push({
              tag: node.tagName,
              role: node.getAttribute?.('role') || null,
              attrs: relevantElementAttrs(node),
              fileNames: names.slice(0, 4),
              mediaIds: ids.slice(0, 4).map((entry) => ({
                id: entry.id,
                source: entry.source,
                tag: entry.tag,
              })),
            })
          }
        }
      }
    })
    try {
      observer.observe(document.documentElement, { childList: true, subtree: true })
    } catch {
      /* ignore */
    }

    const passive = beginPassiveMediaObservation()
    let clickOk = false
    try {
      targetEl.click()
      clickOk = true
    } catch (error) {
      observer.disconnect()
      const captured = passive.stop()
      return {
        ok: false,
        detailsTried: true,
        detailsTargetConfirmed: true,
        error: 'DETAILS_CLICK_FAILED',
        evidenceExtra: {
          detailsTried: true,
          detailsTargetConfirmed: true,
          detailsResult: 'click_failed',
          detailsObservation: {
            targetTag: targetEl.tagName,
            targetRole: targetEl.getAttribute('role'),
            targetAttrs: relevantElementAttrs(targetEl),
            urlBefore,
            urlAfter: location.href,
            changeObserved: 'none',
          },
          clickError: error instanceof Error ? error.message : String(error),
          passiveObservation: { count: captured.length, samples: captured },
        },
      }
    }

    await waitForDomTick(1100, null)
    observer.disconnect()
    const urlAfter = location.href
    const captured = passive.stop()

    const dialogNodes = deepQueryAll(
      '[role="dialog"], [role="complementary"], [aria-modal="true"], aside, [data-side-panel]',
    ).filter((el) => !isExcludedAssetTag(el.tagName))

    // Detalhes podem NÃO ser dialog: regiões que citam o arquivo + alvo/pai.
    const relatedRegions = deepQueryAll(
      '[role="dialog"], [role="complementary"], [aria-modal="true"], aside, [data-side-panel], [role="tooltip"], [role="listbox"], [role="grid"]',
    ).filter((el) => {
      if (isExcludedAssetTag(el.tagName)) return false
      const text = String(el.innerText || '').toLowerCase()
      return (
        text.includes(fileName.toLowerCase()) || text.replace(/\s+/g, '').includes(stem)
      )
    })

    for (const region of [...dialogNodes, ...relatedRegions, targetEl, targetEl.parentElement]) {
      if (!region) continue
      const text = String(region.innerText || '').toLowerCase()
      const mentions =
        text.includes(fileName.toLowerCase()) || text.replace(/\s+/g, '').includes(stem)
      if (!mentions && region !== targetEl && region !== targetEl.parentElement) continue
      const scoped = collectMediaIdsInScope(region, { shallow: false })
      const unique = [...new Set(scoped.identities.map((entry) => entry.id))]
      if (unique.length === 1) {
        return {
          ok: true,
          certainty: 'accepted',
          uploadState: 'uploaded_bound_evidence',
          flowMediaId: unique[0],
          error: null,
          detailsTried: true,
          detailsTargetConfirmed: true,
          evidence: sanitizeIdentityEvidence({
            fileName,
            stem,
            assetItemCount: 1,
            withIdCount: 1,
            items: [
              {
                label: fileName,
                tag: region.tagName || 'DETAILS',
                cardReason: 'details_or_related_region',
                fileHit: true,
                stemHit: true,
                scopedMediaIds: scoped.identities.slice(0, 4),
                uniqueCount: 1,
              },
            ],
            rejected: scoped.rejected,
            detailsTried: true,
            detailsTargetConfirmed: true,
            detailsResult: 'identity_from_details_region',
            detailsObservation: {
              targetTag: targetEl.tagName,
              targetRole: targetEl.getAttribute('role'),
              targetAttrs: relevantElementAttrs(targetEl),
              urlBefore,
              urlAfter,
              changeObserved:
                urlBefore !== urlAfter
                  ? 'route'
                  : dialogNodes.length
                    ? 'panel_or_dialog'
                    : addedNodes.length
                      ? 'dom_added'
                      : 'related_region',
              dialogCount: dialogNodes.length,
              addedNodeCount: addedNodes.length,
              addedNodes: addedNodes.slice(0, 8),
            },
            passiveObservation: { count: captured.length, samples: captured },
            note: 'Identidade via região relacionada ao asset (não exige dialog).',
          }),
        }
      }
    }

    // IDs novos no DOM após o clique, se o nó/ancestral citar o arquivo.
    const mediaAfter = collectMediaIdsInScope(document.body, { shallow: false }).identities
    const newIds = mediaAfter
      .filter((entry) => !mediaBefore.has(entry.id))
      .map((entry) => entry.id)
    const newUnique = [...new Set(newIds)]
    if (newUnique.length === 1) {
      return {
        ok: true,
        certainty: 'accepted',
        uploadState: 'uploaded_bound_evidence',
        flowMediaId: newUnique[0],
        error: null,
        detailsTried: true,
        detailsTargetConfirmed: true,
        evidence: sanitizeIdentityEvidence({
          fileName,
          stem,
          assetItemCount: 1,
          withIdCount: 1,
          items: [
            {
              label: fileName,
              tag: 'DOM_DELTA',
              cardReason: 'new_media_after_details_click',
              fileHit: true,
              stemHit: true,
              scopedMediaIds: [{ id: newUnique[0], source: 'dom_delta', tag: 'NEW' }],
              uniqueCount: 1,
            },
          ],
          detailsTried: true,
          detailsTargetConfirmed: true,
          detailsResult: 'identity_from_dom_delta',
          detailsObservation: {
            targetTag: targetEl.tagName,
            targetRole: targetEl.getAttribute('role'),
            targetAttrs: relevantElementAttrs(targetEl),
            urlBefore,
            urlAfter,
            changeObserved: urlBefore !== urlAfter ? 'route' : 'dom_media_delta',
            dialogCount: dialogNodes.length,
            addedNodes: addedNodes.slice(0, 8),
            newMediaIds: newUnique,
          },
          passiveObservation: { count: captured.length, samples: captured },
          note: 'Identidade via delta de mídia no DOM após clique legítimo.',
        }),
      }
    }

    const passiveForFile = captured.filter((item) =>
      (item.fileHints || []).some((hint) => labelMatchesFile(hint, fileName, stem).matched),
    )
    const passiveUnique = [
      ...new Set(passiveForFile.flatMap((item) => item.mediaIds || [])),
    ].filter(isLegitimateMediaId)

    if (passiveUnique.length === 1) {
      return {
        ok: true,
        certainty: 'accepted',
        uploadState: 'uploaded_bound_evidence',
        flowMediaId: passiveUnique[0],
        error: null,
        detailsTried: true,
        detailsTargetConfirmed: true,
        evidence: sanitizeIdentityEvidence({
          fileName,
          stem,
          assetItemCount: 1,
          withIdCount: 1,
          items: [
            {
              label: fileName,
              tag: 'PASSIVE',
              cardReason: 'passive_observation',
              fileHit: true,
              stemHit: true,
              scopedMediaIds: [{ id: passiveUnique[0], source: 'passive_fetch', tag: 'NET' }],
              uniqueCount: 1,
            },
          ],
          detailsTried: true,
          detailsTargetConfirmed: true,
          detailsResult: 'identity_from_passive_observation',
          detailsObservation: {
            targetTag: targetEl.tagName,
            targetRole: targetEl.getAttribute('role'),
            targetAttrs: relevantElementAttrs(targetEl),
            urlBefore,
            urlAfter,
            changeObserved: urlBefore !== urlAfter ? 'route' : addedNodes.length ? 'dom_added' : 'none',
            dialogCount: dialogNodes.length,
            addedNodes: addedNodes.slice(0, 8),
          },
          passiveObservation: { count: captured.length, samples: captured },
          note: 'Identidade via observação passiva. count=0 não prova ausência se DOM expuser ID.',
        }),
      }
    }

    const changeObserved =
      urlBefore !== urlAfter
        ? 'route'
        : dialogNodes.length
          ? 'panel_or_dialog'
          : addedNodes.length
            ? 'dom_added'
            : 'none'

    return {
      ok: false,
      detailsTried: true,
      detailsTargetConfirmed: true,
      clickOk,
      error: 'DETAILS_IDENTITY_NOT_FOUND',
      evidenceExtra: {
        detailsTried: true,
        detailsTargetConfirmed: true,
        detailsResult: 'no_identity_in_details_or_passive',
        detailsObservation: {
          targetTag: targetEl.tagName,
          targetRole: targetEl.getAttribute('role'),
          targetAttrs: relevantElementAttrs(targetEl),
          urlBefore,
          urlAfter,
          changeObserved,
          dialogCount: dialogNodes.length,
          addedNodeCount: addedNodes.length,
          addedNodes: addedNodes.slice(0, 8),
          newMediaIds: newUnique,
          note: 'dialogCount não é prova única; passive count=0 ≠ ausência de identidade no DOM.',
        },
        passiveObservation: {
          count: captured.length,
          samples: captured,
          note: 'count=0 não prova inexistência de identidade.',
        },
        limitation:
          'Sem associação inequívoca nome↔ID após card+detalhes+delta/passivo. Ver structureDiagnosis.',
      },
    }
  }

  /** Relocaliza o input no DOM atual — nunca reutiliza input serializado do JSON. */
  function relocateFileInput(expectedFlowProjectId) {
    const context = assertProjectContext(expectedFlowProjectId)
    if (!context.ok) {
      return { ok: false, error: context.error, context }
    }
    const inspected = findUniqueFileInput()
    if (!inspected.ok || !inspected.input || !(inspected.input instanceof HTMLInputElement)) {
      return {
        ok: false,
        error: inspected.error || 'FILE_INPUT_NOT_FOUND',
        context,
        inspected,
        note: 'input:{} no JSON não é DOM; é obrigatório relocalizar na página.',
      }
    }
    return {
      ok: true,
      context,
      input: inspected.input,
      inputMeta: inspected.inputMeta,
      mechanism: inspected.mechanism,
    }
  }

  function applyFilesViaAcceptedMechanism(input, fileObjs) {
    const list = Array.isArray(fileObjs) ? fileObjs.filter(Boolean) : []
    if (list.length === 0) {
      return { ok: false, error: 'FILE_ASSIGN_EMPTY' }
    }
    const dt = new DataTransfer()
    for (const fileObj of list) dt.items.add(fileObj)
    let setMethod = 'direct'
    try {
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')
      if (desc && typeof desc.set === 'function') {
        desc.set.call(input, dt.files)
        setMethod = 'prototype_setter'
      } else {
        input.files = dt.files
      }
    } catch {
      try {
        input.files = dt.files
        setMethod = 'direct_fallback'
      } catch (error) {
        return {
          ok: false,
          error: `FILE_ASSIGN_FAILED: ${error instanceof Error ? error.message : String(error)}`,
        }
      }
    }
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    return {
      ok: true,
      setMethod,
      filesLengthAfter: input.files?.length || 0,
      assignedCount: list.length,
      // Atribuição/change NÃO prova upload concluído.
      provesUploadComplete: false,
    }
  }

  function applyFileViaAcceptedMechanism(input, fileObj) {
    return applyFilesViaAcceptedMechanism(input, [fileObj])
  }

  function unfinishedUploadResult(fileMeta, evidence, durationMs) {
    return {
      ok: false,
      certainty: 'may_have_sent',
      uploadState: 'upload_uncertain_needs_reconcile',
      flowMediaId: null,
      error: 'UPLOAD_COMPLETION_TIMEOUT',
      evidence,
      durationMs,
      referenceId: fileMeta?.referenceId || null,
      name: fileMeta?.name || null,
      note: 'Prazo esgotado sem identidade externa. Não reenviar automaticamente.',
    }
  }

  async function waitForUploadCompletion(fileMeta, beforeLabels, timeoutMs) {
    const batch = await waitForBatchUploadCompletion([fileMeta], beforeLabels, timeoutMs)
    return batch[0] || unfinishedUploadResult(fileMeta, null, timeoutMs)
  }

  /**
   * Espera todas as identidades no mesmo prazo. Não espera um arquivo terminar
   * para começar a olhar o próximo — o Flow sobe vários em paralelo.
   */
  async function waitForBatchUploadCompletion(fileMetas, beforeLabels, timeoutMs) {
    const metas = (Array.isArray(fileMetas) ? fileMetas : []).filter(Boolean)
    if (metas.length === 0) return []
    const started = Date.now()
    const results = metas.map(() => null)
    const detailsAttempted = new Set()
    let lastEvidenceByIndex = metas.map(() => null)

    while (Date.now() - started < timeoutMs) {
      const loading = detectLoadingState()
      const labels = collectAccessibleLabels()
      const newLabels = labels.filter((label) => !beforeLabels.includes(label))

      for (let index = 0; index < metas.length; index += 1) {
        if (results[index]) continue
        const fileMeta = metas[index]
        const stem = fileNameStem(fileMeta.name)
        const fileName = String(fileMeta.name || '').toLowerCase()
        const discovery = discoverUploadIdentityForFile(fileMeta)
        const evidence = {
          loading,
          newLabels: newLabels.slice(0, 20),
          ...discovery.evidence,
        }
        lastEvidenceByIndex[index] = evidence

        if (discovery.ok && isLegitimateMediaId(discovery.flowMediaId)) {
          results[index] = {
            ok: true,
            certainty: 'accepted',
            uploadState: 'uploaded_bound_evidence',
            flowMediaId: discovery.flowMediaId,
            evidence,
            durationMs: Date.now() - started,
            referenceId: fileMeta.referenceId || null,
            name: fileMeta.name || null,
          }
          continue
        }

        const nameVisible =
          discovery.evidence.assetItemCount >= 1 ||
          newLabels.some(
            (label) =>
              label.toLowerCase().includes(fileName) ||
              label.toLowerCase().replace(/\s+/g, '').includes(stem),
          )

        if (
          nameVisible &&
          !loading.loadingLabel &&
          !loading.busy &&
          !detailsAttempted.has(index) &&
          (discovery.cardEl || discovery.itemEl) &&
          Date.now() - started > 2500
        ) {
          detailsAttempted.add(index)
          const detailsTarget = discovery.cardEl || discovery.itemEl
          const viaDetails = await tryDiscoverIdentityViaAssetDetails(fileMeta, detailsTarget)
          if (viaDetails?.ok && isLegitimateMediaId(viaDetails.flowMediaId)) {
            results[index] = {
              ok: true,
              certainty: 'accepted',
              uploadState: 'uploaded_bound_evidence',
              flowMediaId: viaDetails.flowMediaId,
              evidence: viaDetails.evidence,
              durationMs: Date.now() - started,
              referenceId: fileMeta.referenceId || null,
              name: fileMeta.name || null,
            }
            continue
          }
          lastEvidenceByIndex[index] = {
            ...evidence,
            detailsTried: Boolean(viaDetails?.detailsTried),
            detailsTargetConfirmed: Boolean(viaDetails?.detailsTargetConfirmed),
            ...(viaDetails?.evidenceExtra || {}),
          }
        }
      }

      if (results.every(Boolean)) break
      await waitForDomTick(400, null)
    }

    return metas.map((fileMeta, index) => {
      if (results[index]) return results[index]
      return unfinishedUploadResult(
        fileMeta,
        lastEvidenceByIndex[index],
        Date.now() - started,
      )
    })
  }

  async function reconcileUploadIdentities(references, expectedFlowProjectId) {
    const context = assertProjectContext(expectedFlowProjectId)
    if (!context.ok) {
      return { ok: false, error: context.error, step: 'reconcile_context', context }
    }
    const results = []
    for (const ref of references || []) {
      const name =
        typeof ref.name === 'string' && ref.name.trim()
          ? ref.name.trim()
          : `${ref.displayName || ref.referenceId}.png`
      const priorId = typeof ref.flowMediaId === 'string' ? ref.flowMediaId : null
      const priorLegitimate = isLegitimateMediaId(priorId)

      let discovery = discoverUploadIdentityForFile({ name, referenceId: ref.referenceId })
      let evidence = { ...(discovery.evidence || {}) }
      if (!discovery.ok && (discovery.cardEl || discovery.itemEl)) {
        const detailsTarget = discovery.cardEl || discovery.itemEl
        const viaDetails = await tryDiscoverIdentityViaAssetDetails(
          { name, referenceId: ref.referenceId },
          detailsTarget,
        )
        if (viaDetails?.ok && isLegitimateMediaId(viaDetails.flowMediaId)) {
          discovery = viaDetails
          evidence = viaDetails.evidence || evidence
        } else {
          evidence = {
            ...evidence,
            detailsTried: Boolean(viaDetails?.detailsTried),
            detailsTargetConfirmed: Boolean(viaDetails?.detailsTargetConfirmed),
            ...(viaDetails?.evidenceExtra || {}),
          }
        }
      } else if (!discovery.ok) {
        evidence = {
          ...evidence,
          detailsTried: false,
          detailsTargetConfirmed: false,
          detailsResult: 'no_target_for_details',
        }
      }

      if (discovery.ok && isLegitimateMediaId(discovery.flowMediaId)) {
        results.push({
          referenceId: ref.referenceId,
          ok: true,
          name,
          flowMediaId: discovery.flowMediaId,
          uploadState: 'uploaded_bound_evidence',
          bindingState: 'bound',
          priorFlowMediaId: priorLegitimate ? priorId : null,
          invalidatedPriorId: priorId && !priorLegitimate ? priorId : null,
          evidence,
          note: 'Reconciliado no DOM/detalhes/passivo sem reenvio.',
        })
      } else {
        results.push({
          referenceId: ref.referenceId,
          ok: false,
          name,
          flowMediaId: null,
          uploadState: 'upload_uncertain_needs_reconcile',
          bindingState: 'upload_uncertain_needs_reconcile',
          priorFlowMediaId: priorLegitimate ? priorId : null,
          invalidatedPriorId: priorId && !priorLegitimate ? priorId : null,
          error: discovery.error || 'UPLOAD_IDENTITY_UNCERTAIN',
          evidence,
          note: 'Permanece uncertain. Não reenviar automaticamente.',
        })
      }
    }

    const allOk = results.length > 0 && results.every((item) => item.ok)
    return {
      ok: allOk,
      step: 'reconcile_identities',
      results,
      realFlowValidated: false,
      note: 'Reconcile preserva uncertain até identidade inequívoca. Sem reenvio.',
    }
  }

  function pathnameHasAssetEdit(href) {
    try {
      return /\/edit\//i.test(new URL(href, location.href).pathname)
    } catch {
      return /\/edit\//i.test(String(href || ''))
    }
  }

  async function waitUntilLeftAssetEdit(expectedFlowProjectId, timeoutMs) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      if (!pathnameHasAssetEdit(location.href)) {
        const ingredients = findUsableControl(isAddIngredientsLabel)
        if (ingredients.length >= 1 || collectAccessibleLabels().length >= 8) {
          return { ok: true, href: location.href, durationMs: Date.now() - started }
        }
      }
      await waitForDomTick(300, null)
    }
    return {
      ok: !pathnameHasAssetEdit(location.href),
      href: location.href,
      durationMs: Date.now() - started,
      expectedFlowProjectId: expectedFlowProjectId || null,
    }
  }

  /** Clique no tile da timeline abre /edit/ — isso NÃO é anexar ingredient. */
  async function exitAssetEditIfNeeded(expectedFlowProjectId) {
    if (!pathnameHasAssetEdit(location.href)) {
      return { exited: false, href: location.href }
    }
    const finished = findUsableControl((label) => {
      const n = label.toLowerCase().replace(/\s+/g, ' ').trim()
      return n === 'finished editing'
    })
    if (finished.length === 1) {
      finished[0].el.click()
      const waited = await waitUntilLeftAssetEdit(expectedFlowProjectId, 8_000)
      if (!pathnameHasAssetEdit(location.href)) {
        return {
          exited: true,
          via: 'finished_editing',
          href: location.href,
          stillInEdit: false,
          waited,
        }
      }
    }
    const back = findUsableControl((label) => {
      const n = label.toLowerCase().replace(/\s+/g, ' ').trim()
      return n === 'back button to go to previous page'
    })
    if (back.length === 1) {
      back[0].el.click()
      const waited = await waitUntilLeftAssetEdit(expectedFlowProjectId, 8_000)
      if (!pathnameHasAssetEdit(location.href)) {
        return {
          exited: true,
          via: 'back',
          href: location.href,
          stillInEdit: false,
          waited,
        }
      }
    }

    if (pathnameHasAssetEdit(location.href)) {
      try {
        history.back()
      } catch {
        /* ignore */
      }
      const waitedBack = await waitUntilLeftAssetEdit(expectedFlowProjectId, 5_000)
      if (!pathnameHasAssetEdit(location.href)) {
        return {
          exited: true,
          via: 'history_back',
          href: location.href,
          stillInEdit: false,
          waited: waitedBack,
        }
      }
    }

    const projectId = expectedFlowProjectId || parseProjectId(location.href)
    if (projectId && pathnameHasAssetEdit(location.href)) {
      const target = `https://flow.google.com/project/${projectId}`
      location.assign(target)
      const waitedAssign = await waitUntilLeftAssetEdit(expectedFlowProjectId, 12_000)
      return {
        exited: true,
        via: 'location_assign',
        href: location.href,
        stillInEdit: pathnameHasAssetEdit(location.href),
        waited: waitedAssign,
        target,
      }
    }

    return {
      exited: false,
      error: 'STUCK_IN_ASSET_EDIT',
      href: location.href,
      stillInEdit: true,
    }
  }

  function findPanelMarkerElements() {
    return deepQueryAll(
      'button, a[href], [role="button"], [aria-label], input, textarea, [placeholder]',
    ).filter((el) => {
      const label = controlLabel(el)
      const placeholder = String(el.getAttribute?.('placeholder') || '')
      const ph = normalizeControlLabel(placeholder)
      return (
        isSearchAssetsLabel(label) ||
        isSortAssetsLabel(label) ||
        isCategoryNavigationLabel(label) ||
        isUploadMediaLabel(label) ||
        isSearchAssetsLabel(ph) ||
        (/pesquisar|search/.test(ph) && /recurso|asset/.test(ph))
      )
    })
  }

  function lowestCommonAncestor(a, b) {
    if (!a || !b) return null
    const seen = new Set()
    let node = a
    while (node) {
      seen.add(node)
      node = node.parentElement
    }
    node = b
    while (node) {
      if (seen.has(node)) return node
      node = node.parentElement
    }
    return null
  }

  function findIngredientsListChrome() {
    return deepQueryAll(
      'button, a[href], [role="button"], [aria-label], [role="list"], [role="listbox"], [role="grid"], [role="region"]',
    ).filter((el) => {
      const label = controlLabel(el)
      return isAssetListLabel(label) || isAddToPromptLabel(label)
    })
  }

  /**
   * Root do painel de assets (ingredients). Sem root, NÃO clicar name-hits da timeline.
   * LCA dos marcadores (search/upload/sort) + expansão até Asset list / Add to prompt.
   * Evidência 0.3.13: LCA só do toolbar excluía a lista (`scopedHitCount=0`).
   */
  function findAssetsPanelRoot() {
    const markers = findPanelMarkerElements()
    if (markers.length === 0) return null

    const searchish = markers.filter((el) => {
      const label = `${controlLabel(el)} ${el.getAttribute?.('placeholder') || ''}`
      return isSearchAssetsLabel(label) || /pesquisar|search/.test(normalizeControlLabel(label))
    })
    const uploadish = markers.filter((el) => isUploadMediaLabel(controlLabel(el)))
    const sortish = markers.filter((el) => {
      const label = controlLabel(el)
      return isSortAssetsLabel(label) || isCategoryNavigationLabel(label)
    })

    const pairs = []
    if (searchish[0] && uploadish[0]) pairs.push([searchish[0], uploadish[0]])
    if (searchish[0] && sortish[0]) pairs.push([searchish[0], sortish[0]])
    if (uploadish[0] && sortish[0]) pairs.push([uploadish[0], sortish[0]])

    let best = null
    let bestScore = Infinity
    for (const [left, right] of pairs) {
      const root = lowestCommonAncestor(left, right)
      if (!root || root === document.body || root === document.documentElement) continue
      const score = (root.querySelectorAll?.('*') || []).length || 999999
      if (score < bestScore) {
        best = root
        bestScore = score
      }
    }

    if (!best) {
      const primary = searchish[0] || uploadish[0] || sortish[0] || markers[0]
      best =
        primary.closest?.(
          '[role="dialog"], [role="complementary"], aside, [data-panel], [data-sidebar]',
        ) || null
      if (!best) {
        let climb = primary.parentElement
        for (let depth = 0; depth < 10 && climb; depth += 1) {
          const containedMarkers = markers.filter((el) => climb.contains(el)).length
          if (containedMarkers >= 2 && climb !== document.body) {
            best = climb
            break
          }
          climb = climb.parentElement
        }
      }
    }

    const chrome = findIngredientsListChrome()
    const assetList = chrome.find((el) => isAssetListLabel(controlLabel(el)))
    const addToPrompt = chrome.find((el) => isAddToPromptLabel(controlLabel(el)))

    for (const extra of [assetList, addToPrompt]) {
      if (!extra) continue
      if (best && best.contains(extra)) continue
      const expanded = best ? lowestCommonAncestor(best, extra) : extra
      if (
        expanded &&
        expanded !== document.body &&
        expanded !== document.documentElement
      ) {
        best = expanded
      }
    }

    // Se a lista existe mas o root ainda não a contém, subir a partir da lista até achar marcadores.
    if (assetList && (!best || !best.contains(assetList))) {
      let climb = assetList
      while (climb && climb !== document.body && climb !== document.documentElement) {
        const hasMarker = markers.some((el) => climb.contains(el))
        if (hasMarker) {
          best = climb
          break
        }
        climb = climb.parentElement
      }
    }

    if (!best || best === document.body || best === document.documentElement) return null
    return best
  }

  async function ensureIngredientsPanelForAttach(expectedFlowProjectId) {
    const context = assertProjectContext(expectedFlowProjectId)
    if (!context.ok) {
      return { ok: false, error: context.error, step: 'attach_panel_context', context }
    }

    const settle = async (alreadyOpen, ingredients) => {
      const started = Date.now()
      while (Date.now() - started < 15_000) {
        const ctx = assertProjectContext(expectedFlowProjectId)
        if (!ctx.ok) {
          return { ok: false, error: ctx.error, step: 'attach_panel_context', context: ctx }
        }
        const panel = detectAssetsPanel()
        const panelRoot = findAssetsPanelRoot()
        const listChrome = findIngredientsListChrome()
        const assetListInRoot =
          !!panelRoot &&
          listChrome.some((el) => isAssetListLabel(controlLabel(el)) && panelRoot.contains(el))
        // Preferir root que já contém Asset list; após 2.5s aceita root só com marcadores.
        if (panelRoot && (assetListInRoot || Date.now() - started >= 2_500)) {
          return {
            ok: true,
            alreadyOpen,
            ingredients: ingredients || null,
            panel,
            panelRootPresent: true,
            assetListInRoot,
            markerCount: findPanelMarkerElements().length,
            durationMs: Date.now() - started,
          }
        }
        await waitForDomTick(300, null)
      }
      return {
        ok: false,
        step: 'wait_assets_panel_root',
        error: 'ATTACH_PANEL_ROOT_MISSING',
        alreadyOpen,
        ingredients: ingredients || null,
        panel: detectAssetsPanel(),
        panelRootPresent: false,
        markerCount: findPanelMarkerElements().length,
        observation: buildObservation(),
        note: 'Marcadores de painel sem root escopável — recusar clique na timeline.',
      }
    }

    if (findAssetsPanelRoot()) {
      return settle(true, null)
    }

    const ingredients = await openUniqueControl('add_ingredients', isAddIngredientsLabel)
    if (!ingredients.ok) {
      return {
        ok: false,
        step: 'open_ingredients_for_attach',
        error: ingredients.error,
        ingredients,
        observation: buildObservation(),
      }
    }
    return settle(false, ingredients)
  }

  function navigatesToAssetEdit(el) {
    let node = el
    while (node && node !== document.body) {
      if (node.tagName === 'A') {
        const href = node.getAttribute('href') || ''
        if (/\/edit\//i.test(href)) return true
      }
      node = node.parentElement
    }
    return false
  }

  function promptNearbyIngredientHint(stem) {
    const editor = findPromptEditor()
    if (!editor || !stem) return { nearPrompt: false, labels: [] }
    const needle = stem.toLowerCase()
    let root = editor.parentElement
    for (let depth = 0; depth < 8 && root; depth += 1) {
      const labels = Array.from(
        root.querySelectorAll('button, [role="button"], [aria-label], img[alt]'),
      )
        .map((el) => controlLabel(el) || '')
        .filter(Boolean)
      const hits = labels.filter((label) => label.toLowerCase().includes(needle))
      if (hits.length > 0) {
        return { nearPrompt: true, labels: hits.slice(0, 8), depth }
      }
      root = root.parentElement
    }
    return { nearPrompt: false, labels: [] }
  }

  /** Conta chips Ingredient/Elemento sem dedupe (2º chip também conta). */
  function isIngredientChipLabel(label) {
    const n = normalizeControlLabel(label)
    return (
      n === 'ingredient' ||
      n.startsWith('ingredient ') ||
      n === 'elemento' ||
      n.startsWith('elemento ')
    )
  }

  function countIngredientControls() {
    return findControlCandidates(isIngredientChipLabel).length
  }

  /**
   * Chips de ingredient no composer: miniaturas próximas do editor.
   * Evidência: 1º attach cria label "Ingredient"; 2º só aumenta contagem visual de chips.
   */
  async function clearPromptImageChips() {
    const editor = findPromptEditor()
    if (!editor) return { ok: true, removed: 0 }
    let removed = 0
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const editorRect = editor.getBoundingClientRect()
      const chip = deepQueryAll('img').find((img) => {
        if (!isShown(img)) return false
        const rect = img.getBoundingClientRect()
        return (
          rect.width >= 12 &&
          rect.height >= 12 &&
          rect.width <= 120 &&
          rect.height <= 120 &&
          rect.top >= editorRect.top - 180 &&
          rect.bottom <= editorRect.bottom + 140
        )
      })
      if (!chip) break
      const rect = chip.getBoundingClientRect()
      const close = deepQueryAll('button, [role="button"]').find((el) => {
        if (!isShown(el)) return false
        const box = el.getBoundingClientRect()
        if (box.width > 40 || box.height > 40) return false
        const label = normLabel(accessibleName(el))
        if (/gerar|enviar|formatar|nano|banana|agente|adicionar/.test(label)) return false
        const named = /^(x|×)$|remover|remove|fechar|close|excluir|delete|dismiss/.test(label)
        const corner =
          Math.abs(box.right - rect.right) < 30 && Math.abs(box.top - rect.top) < 30
        return named || corner
      })
      if (!close) break
      await trustedClickElement(close, { align: 'center' })
      removed += 1
      await sleep(250)
    }
    return { ok: true, removed }
  }

  /**
   * Cancela o rascunho anexado no composer: tira chips de referência e apaga o texto.
   * Usado ao cancelar lote / geração — o usuário não deve ficar com prompts anexados.
   */
  async function clearComposerAttachments() {
    await dismissAssetsPanelIfOpen()
    const beforeChips = countPromptIngredientChips()
    // "Apagar comando" / "Clear prompt" no Flow limpa texto e chips de uma só vez quando visível.
    let clearPrompt = await clearPromptAfterGeneration()
    const chips = await clearPromptImageChips()
    if (clearPrompt.ok !== true || (readPromptText() || '').trim().length > 0) {
      clearPrompt = await clearComposerDraftCdpOrObserved()
    }
    // Segunda passagem: garante remoção de qualquer chip residual.
    const chipsAfter = await clearPromptImageChips()
    const afterChips = countPromptIngredientChips()
    const removed =
      Number(chips.removed || 0) +
      Number(chipsAfter.removed || 0) +
      Math.max(0, (beforeChips.media || 0) - (afterChips.media || 0))
    const text = readPromptText() || ''
    return {
      ok: afterChips.media === 0 && afterChips.ingredientButtons === 0 && text === '',
      removed,
      chips,
      chipsAfter,
      clearPrompt,
      beforeChips,
      afterChips,
      readBack: text,
      note: 'Anexos e texto do composer limpos após cancelar.',
    }
  }

  function countPromptIngredientChips() {
    const editor = findPromptEditor()
    if (!editor) return { media: 0, ingredientButtons: 0, depth: null, score: 0 }
    let best = { media: 0, ingredientButtons: 0, depth: null, score: 0 }
    let root = editor.parentElement
    for (let depth = 0; depth < 10 && root; depth += 1) {
      const media = Array.from(root.querySelectorAll('img')).filter((img) => {
        if (isExcludedAssetTag(img.tagName)) return false
        const rect = img.getBoundingClientRect()
        return (
          rect.width >= 12 &&
          rect.height >= 12 &&
          rect.width <= 112 &&
          rect.height <= 112 &&
          rect.bottom <= (editor.getBoundingClientRect().bottom || 0) + 80
        )
      }).length
      const ingredientButtons = Array.from(
        root.querySelectorAll('button, [role="button"], [aria-label]'),
      ).filter((el) => isIngredientChipLabel(controlLabel(el))).length
      const score = media * 2 + ingredientButtons
      if (score > best.score) {
        best = { media, ingredientButtons, depth, score }
      }
      root = root.parentElement
    }
    return best
  }

  function findNameHitElementsInRoot(fileName, stem, panelRoot) {
    if (!panelRoot) return []
    const nodes = deepQueryAll(
      'button, [role="button"], [role="option"], [role="listitem"], [role="row"], [role="gridcell"], a[href], span, div, p, img',
      panelRoot,
    ).filter((el) => !isExcludedAssetTag(el.tagName))
    const matches = []
    for (const el of nodes) {
      const label = assetItemLabel(el)
      const match = labelMatchesFile(label, fileName, stem)
      if (!match.matched) continue
      matches.push({
        el,
        label: label.slice(0, 120),
        fileHit: match.fileHit,
        stemHit: match.stemHit,
        tag: el.tagName,
        panelListHint: /pngimage|jpe?gimage|webpimage|gifimage/i.test(
          label.replace(/\s+/g, ''),
        ),
      })
    }
    return matches.filter(
      (item) => !matches.some((other) => other !== item && item.el.contains(other.el)),
    )
  }

  function compactLabel(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\s+/g, '')
  }

  function isPanelListImageLabel(label, fileName, stem) {
    const compact = compactLabel(label)
    const file = compactLabel(fileName)
    // EN: "atlas-ref-a.pngImage" · PT: "atlas-ref-a.pngImagem"
    if (file && (compact === `${file}image` || compact === `${file}imagem` || compact === file)) {
      return true
    }
    if (
      stem &&
      (compact === `${stem}.pngimage` ||
        compact === `${stem}pngimage` ||
        compact === `${stem}.pngimagem` ||
        compact === `${stem}pngimagem`)
    ) {
      return true
    }
    return (
      /pngimagem?|jpe?gimagem?|webpimagem?|gifimagem?/i.test(compact) &&
      labelMatchesFile(label, fileName, stem).matched
    )
  }

  function dedupeNestedCandidates(scored) {
    // exclusive-card pode reintroduzir ancestral + folha → preferir folhas.
    return scored.filter(
      (item) => !scored.some((other) => other !== item && item.el.contains(other.el)),
    )
  }

  function pickAttachTargetInPanel(bound, panelRoot) {
    const stem = fileNameStem(bound.name)
    const fileName = bound.name || `${stem}.png`
    const globalHits = findNameHitElements(fileName, stem)
    if (!panelRoot) {
      return {
        ok: false,
        error: 'ATTACH_PANEL_ROOT_MISSING',
        scopedHitCount: 0,
        totalHitCount: globalHits.length,
        note: 'Sem root do painel — recusar name-hits (timeline abre /edit/).',
      }
    }
    const scopedHits = findNameHitElementsInRoot(fileName, stem, panelRoot)

    const scored = scopedHits
      .map((item) => {
        const exclusive = findExclusiveAssetCard(item.el, fileName, stem)
        const card = exclusive.card
        if (!panelRoot.contains(card) && !panelRoot.contains(item.el)) {
          return null
        }
        // Preferir o próprio hit da lista (pngImage), não ancestral exclusive da timeline.
        let clickEl = item.el
        if (
          panelRoot.contains(card) &&
          isElementUsable(card) &&
          (card === item.el || item.el.contains(card) === false) &&
          isPanelListImageLabel(controlLabel(card) || item.label, fileName, stem)
        ) {
          clickEl = card
        }
        // Se clickEl é folha não-interativa (SPAN/DIV/P/IMG), promover ao ancestral clicável da lista.
        if (!/^(BUTTON|A)$/i.test(clickEl.tagName || '')) {
          const interactive = clickEl.closest?.(
            'button, [role="button"], [role="option"], [role="listitem"]',
          )
          if (
            interactive &&
            panelRoot.contains(interactive) &&
            isElementUsable(interactive) &&
            !navigatesToAssetEdit(interactive)
          ) {
            clickEl = interactive
          }
        }
        if (!isElementUsable(clickEl) && panelRoot.contains(card) && isElementUsable(card)) {
          clickEl = card
        }
        if (!panelRoot.contains(clickEl)) return null
        const scoped = collectMediaIdsInScope(clickEl, { shallow: false })
        const hasId =
          isLegitimateMediaId(bound.flowMediaId) &&
          scoped.identities.some((entry) => entry.id === bound.flowMediaId)
        const aria = controlLabel(clickEl)
        const exactList = isPanelListImageLabel(aria, fileName, stem)
        const role = (clickEl.getAttribute?.('role') || item.el.getAttribute?.('role') || '')
          .toLowerCase()
        const roleBonus = /^(option|listitem|gridcell|row|checkbox)$/.test(role) ? 4 : 0
        const listBonus = exactList ? 20 : item.panelListHint ? 10 : 0
        const editPenalty = navigatesToAssetEdit(clickEl) || navigatesToAssetEdit(item.el) ? -100 : 0
        const usable = isElementUsable(clickEl)
        return {
          el: clickEl,
          label: aria || item.label,
          hasId,
          exactList,
          score: (hasId ? 20 : 0) + roleBonus + listBonus + editPenalty + (usable ? 2 : -50),
          exclusiveReason: exclusive.reason || null,
        }
      })
      .filter((item) => item && item.score >= 0 && isElementUsable(item.el))
      .sort((a, b) => b.score - a.score)

    if (scored.length === 0) {
      return {
        ok: false,
        error: 'ATTACH_TARGET_NOT_IN_PANEL',
        scopedHitCount: scopedHits.length,
        totalHitCount: globalHits.length,
        assetListPresent: findIngredientsListChrome().some(
          (el) => isAssetListLabel(controlLabel(el)) && panelRoot.contains(el),
        ),
      }
    }

    const leaves = dedupeNestedCandidates(scored)
    const pool = leaves.length > 0 ? leaves : scored
    const withId = pool.filter((item) => item.hasId)
    if (withId.length === 1) {
      return { ok: true, target: withId[0], candidates: pool.length, resolvedBy: 'flowMediaId' }
    }
    const exact = pool.filter((item) => item.exactList)
    if (exact.length === 1) {
      return { ok: true, target: exact[0], candidates: pool.length, resolvedBy: 'exact_list_label' }
    }
    if (pool.length === 1) {
      return { ok: true, target: pool[0], candidates: 1, resolvedBy: 'unique' }
    }
    return {
      ok: false,
      error: 'ATTACH_TARGET_AMBIGUOUS',
      candidates: pool.length,
      candidateLabels: pool.map((item) => item.label).slice(0, 6),
    }
  }

  async function clickAddToPromptIfPresent(panelRoot) {
    const usable = findUsableControl((label) => isAddToPromptLabel(label)).filter(
      (item) => !panelRoot || panelRoot.contains(item.el),
    )
    if (usable.length === 0) return { clicked: false, matchCount: 0 }
    if (usable.length > 1) return { clicked: false, matchCount: usable.length, error: 'ADD_TO_PROMPT_AMBIGUOUS' }
    usable[0].el.click()
    await waitForDomTick(500, null)
    return { clicked: true, matchCount: 1, label: usable[0].label }
  }

  function setInputValueNative(input, value) {
    const proto = window.HTMLInputElement.prototype
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
    if (descriptor?.set) descriptor.set.call(input, value)
    else input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function scorePanelSearchInput(el, panelRoot) {
    if (!el || (panelRoot && !panelRoot.contains(el))) return 0
    if (!isElementUsable(el)) return 0
    const own = `${el.getAttribute('aria-label') || ''} ${el.placeholder || ''} ${el.getAttribute('name') || ''}`
    const ancestor =
      el.closest?.('[aria-label], [role="search"], [data-search]') || el.parentElement
    const parentLabel = ancestor ? controlLabel(ancestor) : ''
    const blob = normalizeControlLabel(`${own} ${parentLabel}`)
    let score = 0
    if (isSearchAssetsLabel(own) || isSearchAssetsLabel(parentLabel)) score += 30
    if (/pesquisar\s*recursos|search\s*assets/.test(blob)) score += 20
    if (/pesquisar|search/.test(blob) && /recurso|asset/.test(blob)) score += 12
    if (/pesquisar|search/.test(blob)) score += 4
    if (el.getAttribute('type') === 'search') score += 3
    if (el.closest?.('[role="search"]')) score += 6
    // Input sem aria no painel, mas com chrome de pesquisa ao lado (PT Flow).
    if (
      score === 0 &&
      panelRoot &&
      findPanelMarkerElements().some(
        (marker) =>
          panelRoot.contains(marker) &&
          isSearchAssetsLabel(
            `${controlLabel(marker)} ${marker.getAttribute?.('placeholder') || ''}`,
          ) &&
          (marker.contains(el) || marker.parentElement?.contains(el)),
      )
    ) {
      score += 8
    }
    return score
  }

  function findPanelSearchInputs(panelRoot) {
    const roots = []
    if (panelRoot) {
      roots.push(panelRoot)
      const dialog =
        panelRoot.closest?.(
          '[role="dialog"], [role="complementary"], aside, [data-panel], [data-sidebar]',
        ) || null
      if (dialog && dialog !== panelRoot) roots.push(dialog)
    }
    const pool = deepQueryAll(
      'input[type="search"], input[type="text"], input:not([type]), textarea',
    )
    const scored = []
    const seen = new Set()
    for (const root of roots.length > 0 ? roots : [null]) {
      for (const el of pool) {
        if (seen.has(el)) continue
        if (root && !root.contains(el)) continue
        const score = scorePanelSearchInput(el, root || panelRoot || el.ownerDocument?.body)
        if (score <= 0) continue
        seen.add(el)
        scored.push({ el, score })
      }
    }
    // Sem root útil: ainda aceita “Pesquisar recursos” global (não o “Pesquisar” da home).
    if (scored.length === 0) {
      for (const el of pool) {
        const score = scorePanelSearchInput(el, null)
        if (score < 12) continue
        scored.push({ el, score })
      }
    }
    return scored.sort((a, b) => b.score - a.score)
  }

  async function selectPanelUploadsCategory(panelRoot) {
    const isUploads = (label) => {
      const n = normalizeControlLabel(label)
      return n === 'envios' || n === 'uploads'
    }
    const all = findUsableControl(isUploads).filter((item) => {
      // Nunca clicar o rail lateral do projeto (drive_folder_upload Envios à esquerda)!
      const rect = item.el.getBoundingClientRect?.()
      if (rect && rect.left < 96) return false
      return true
    })
    const scoped = panelRoot ? all.filter((item) => panelRoot.contains(item.el)) : []
    const pool = scoped.length === 1 ? scoped : []
    if (pool.length !== 1) {
      return {
        clicked: false,
        matchCount: (scoped.length > 0 ? scoped : all).length,
        scopedMatchCount: scoped.length,
      }
    }
    pool[0].el.click()
    await waitForDomTick(400, null)
    return { clicked: true, matchCount: 1, label: pool[0].label }
  }

  function clearPanelSearchInputIfDirty(panelRoot) {
    try {
      const inputs = findPanelSearchInputs(panelRoot || findAssetsPanelRoot())
      for (const item of inputs) {
        if (item.el && String(item.el.value || '').trim().length > 0) {
          setInputValueNative(item.el, '')
          item.el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }))
        }
      }
    } catch {
      /* ignore */
    }
  }

  async function filterAssetsPanelByStem(stem, panelRoot, fileName) {
    if (!stem) return { used: false }
    let root = panelRoot || findAssetsPanelRoot()
    let scored = findPanelSearchInputs(root)
    // Evidência 0.3.37: marcadores no root, mas input real fora do LCA estreito.
    if (scored.length === 0 && root) {
      const expanded =
        root.parentElement && root.parentElement !== document.body ? root.parentElement : root
      scored = findPanelSearchInputs(expanded)
      if (scored.length > 0) root = expanded
    }
    if (scored.length === 0) {
      const globalNamed = deepQueryAll(
        'input[type="search"], input[type="text"], input:not([type]), textarea',
      ).filter((el) => {
        const aria = `${el.getAttribute('aria-label') || ''} ${el.placeholder || ''}`
        return (
          isSearchAssetsLabel(aria) ||
          /search|pesquisar/.test(normalizeControlLabel(aria)) ||
          /asset|recurso/.test(normalizeControlLabel(aria))
        )
      })
      return {
        used: false,
        matchCount: 0,
        scopedMatchCount: 0,
        totalMatchCount: globalNamed.length,
        note: 'Input de Pesquisar recursos não encontrado no painel.',
      }
    }
    const preferred =
      scored.find((item) => item.score >= 20)?.el ||
      scored[0].el
    preferred.focus()
    setInputValueNative(preferred, '')
    await waitForDomTick(120, null)
    setInputValueNative(preferred, stem)
    preferred.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }))

    const started = Date.now()
    let settled = false
    let lastLabels = []
    for (let iter = 0; iter < 15 && Date.now() - started < 3_500; iter += 1) {
      lastLabels = collectAccessibleLabels()
      const wanted = lastLabels.some((label) =>
        isPanelListImageLabel(label, fileName || `${stem}.png`, stem),
      )
      const emptyPanel = lastLabels.some((label) =>
        /nenhum recurso encontrado|no resources? found/i.test(label),
      )
      const foreignStem = lastLabels.some((label) => {
        const compact = compactLabel(label)
        if (!/pngimage|jpe?gimage|pngimagem|jpe?gimagem/i.test(compact)) return false
        return !labelMatchesFile(label, fileName || `${stem}.png`, stem).matched
      })
      if (wanted && !foreignStem) {
        settled = true
        break
      }
      if (wanted && (iter >= 2 || Date.now() - started > 800)) {
        settled = true
        break
      }
      if (emptyPanel && iter >= 2) break
      await waitForDomTick(200, null)
    }

    return {
      used: true,
      value: stem,
      settled,
      matchCount: scored.length,
      totalMatchCount: scored.length,
      waitMs: Date.now() - started,
      labelsSample: lastLabels
        .filter((label) => {
          const compact = compactLabel(label)
          return (
            /atlas-ref|pngimage|pngimagem|\.png/i.test(label) ||
            (stem && compact.includes(compactLabel(stem)))
          )
        })
        .slice(0, 8),
    }
  }

  /**
   * Anexa asset bound via painel "Add ingredients" — NÃO clicar tile da timeline (/edit/).
   */
  async function selectBoundAssetForPrompt(bound, expectedFlowProjectId, timeoutMs, options) {
    const started = Date.now()
    const exit = options?.skipExitEdit
      ? { exited: false, skipped: true }
      : await exitAssetEditIfNeeded(expectedFlowProjectId)
    if (exit.stillInEdit) {
      return {
        ok: false,
        error: exit.error || 'STUCK_IN_ASSET_EDIT',
        step: 'exit_asset_edit',
        exit,
        attachedState: 'not_attached',
        durationMs: Date.now() - started,
      }
    }

    const context = assertProjectContext(expectedFlowProjectId)
    if (!context.ok) {
      return { ok: false, error: context.error, step: 'attach_context', context, exit }
    }

    let panelGate = options?.skipOpenPanel
      ? {
          ok: !!findAssetsPanelRoot(),
          alreadyOpen: true,
          panel: detectAssetsPanel(),
          skipped: true,
          panelRootPresent: !!findAssetsPanelRoot(),
          error: findAssetsPanelRoot() ? null : 'ATTACH_PANEL_ROOT_MISSING',
        }
      : await ensureIngredientsPanelForAttach(expectedFlowProjectId)
    if (!panelGate.ok) {
      panelGate = await ensureIngredientsPanelForAttach(expectedFlowProjectId)
    }
    if (!panelGate.ok) {
      return {
        ok: false,
        error: panelGate.error,
        step: panelGate.step || 'attach_panel',
        panelGate,
        exit,
        attachedState: 'not_attached',
        durationMs: Date.now() - started,
      }
    }

    const stem = fileNameStem(bound.name)
    const fileName = bound.name || `${stem}.png`
    // Já no draft (chip Elemento/Ingredient ou miniatura)? Não reanexar.
    {
      const chips = countPromptIngredientChips()
      const ingredients = countIngredientControls()
      const near = promptNearbyIngredientHint(stem)
      if ((chips.score >= 1 || ingredients >= 1) && near.nearPrompt) {
        return {
          ok: true,
          attachedState: 'attached',
          certainty: 'accepted',
          step: 'already_on_draft',
          flowMediaId: bound.flowMediaId || null,
          chips,
          ingredientControls: ingredients,
          near,
          durationMs: Date.now() - started,
          note: 'Ref já presente no draft; sem novo clique.',
        }
      }
    }
    let panelRoot = findAssetsPanelRoot()
    let uploadsCategory = { clicked: false, matchCount: 0, skipped: true }
    let search = { used: false, skipped: true }

    // 1) Tenta achar diretamente na lista aberta (sem tocar no filtro de busca nem categorias!).
    let picked = pickAttachTargetInPanel(bound, panelRoot)
    if (!picked.ok) {
      clearPanelSearchInputIfDirty(panelRoot)
      await waitForDomTick(150, null)
      panelRoot = findAssetsPanelRoot() || panelRoot
      picked = pickAttachTargetInPanel(bound, panelRoot)
    }
    // 2) Se ainda não achou na lista visível, usa o filtro de busca por stem.
    if (!picked.ok) {
      uploadsCategory = await selectPanelUploadsCategory(panelRoot)
      panelRoot = findAssetsPanelRoot() || panelRoot
      search = await filterAssetsPanelByStem(stem, panelRoot, fileName)
      panelRoot = findAssetsPanelRoot() || panelRoot
      picked = pickAttachTargetInPanel(bound, panelRoot)
      if (!picked.ok) {
        const retryStarted = Date.now()
        while (!picked.ok && Date.now() - retryStarted < 2_000) {
          await waitForDomTick(200, null)
          panelRoot = findAssetsPanelRoot() || panelRoot
          picked = pickAttachTargetInPanel(bound, panelRoot)
        }
      }
    }
    // 3) Reexpande root se necessário.
    if (!picked.ok && (search.used !== true || picked.error === 'ATTACH_TARGET_NOT_IN_PANEL')) {
      const climb = panelRoot?.parentElement
      if (climb && climb !== document.body) panelRoot = climb
      search = await filterAssetsPanelByStem(stem, findAssetsPanelRoot() || panelRoot, fileName)
      panelRoot = findAssetsPanelRoot() || panelRoot
      picked = pickAttachTargetInPanel(bound, panelRoot)
    }
    if (!picked.ok) {
      if (search.used) clearPanelSearchInputIfDirty(panelRoot)
      return {
        ok: false,
        error: picked.error,
        step: 'attach_find_in_panel',
        panelRootPresent: !!panelRoot,
        search,
        uploadsCategory,
        picked,
        exit,
        panelGate,
        observation: buildObservation(),
        durationMs: Date.now() - started,
        note:
          'Alvo deve estar no painel de ingredients (Envios + Pesquisar recursos). Tile da timeline abre /edit/ e não anexa.',
      }
    }

    const target = picked.target
    const beforeLabels = collectAccessibleLabels()
    const beforePrompt = readPromptText()
    const beforeIngredientControls = countIngredientControls()
    const beforeChips = countPromptIngredientChips()
    const hrefBefore = location.href
    const panelOpenBefore = detectAssetsPanel().present

    target.el.click()
    await waitForDomTick(350, null)
    if (search.used) clearPanelSearchInputIfDirty(panelRoot)

    if (pathnameHasAssetEdit(location.href) && !pathnameHasAssetEdit(hrefBefore)) {
      return {
        ok: false,
        error: 'ATTACH_OPENED_MEDIA_EDIT',
        attachedState: 'not_attached',
        certainty: 'may_have_sent',
        step: 'attach_click',
        selector: { label: target.label || null, flowMediaId: bound.flowMediaId },
        hrefBefore,
        hrefAfter: location.href,
        search,
        panelRootPresent: !!panelRoot,
        exit,
        observation: buildObservation(),
        durationMs: Date.now() - started,
        note: 'Clique abriu editor de mídia (/edit/). Isso não é anexação ao prompt.',
      }
    }

    // Fluxo observado: item na Asset list pode auto-anexar; Add to prompt se ainda existir.
    let addToPrompt = await clickAddToPromptIfPresent(findAssetsPanelRoot() || panelRoot)

    // Janela de confirmação contada a partir do CLIQUE (não do início da busca, evitando timeout falso sob tab throttling).
    const clickStarted = Date.now()
    const confirmTimeoutMs = Math.max(8_000, Number(timeoutMs) || 12_000)
    let triedTrustedFallback = false

    for (let iter = 0; iter < 30 && (iter < 3 || Date.now() - clickStarted < confirmTimeoutMs); iter += 1) {
      if (pathnameHasAssetEdit(location.href) && !pathnameHasAssetEdit(hrefBefore)) {
        return {
          ok: false,
          error: 'ATTACH_OPENED_MEDIA_EDIT',
          attachedState: 'not_attached',
          certainty: 'may_have_sent',
          selector: { label: target.label || null, flowMediaId: bound.flowMediaId },
          hrefAfter: location.href,
          addToPrompt,
          durationMs: Date.now() - started,
        }
      }
      const labels = collectAccessibleLabels()
      const newLabels = labels.filter((label) => !beforeLabels.includes(label))
      const promptNow = readPromptText()
      const near = promptNearbyIngredientHint(stem)
      const afterIngredientControls = countIngredientControls()
      const afterChips = countPromptIngredientChips()
      const ingredientDelta = afterIngredientControls > beforeIngredientControls
      const chipDelta =
        afterChips.media + afterChips.ingredientButtons >
        beforeChips.media + beforeChips.ingredientButtons
      const panelClosedAfterAttach =
        panelOpenBefore && !detectAssetsPanel().present && (ingredientDelta || chipDelta)
      const attachedHint =
        ingredientDelta ||
        chipDelta ||
        panelClosedAfterAttach ||
        near.nearPrompt ||
        newLabels.some((label) => /ingredient|elemento|attached|remove|chip|clear prompt|apagar comando/i.test(label)) ||
        (stem &&
          labels.some(
            (label) =>
              label.toLowerCase().includes(stem.toLowerCase()) &&
              /remove|ingredient|elemento|chip/i.test(label),
          ))
      if (attachedHint) {
        return {
          ok: true,
          attachedState: 'attached',
          certainty: 'accepted',
          selector: { label: target.label || null, flowMediaId: bound.flowMediaId },
          promptBefore: beforePrompt,
          promptAfter: promptNow,
          newLabels: newLabels.slice(0, 15),
          nearPrompt: near,
          ingredientControls: {
            before: beforeIngredientControls,
            after: afterIngredientControls,
          },
          chips: { before: beforeChips, after: afterChips },
          search,
          addToPrompt,
          panelRootPresent: !!panelRoot,
          exit,
          durationMs: Date.now() - started,
        }
      }
      // Se o .click() sintético não surtiu efeito após ~900ms, dispara trustedClick via CDP no item.
      if (!triedTrustedFallback && (iter >= 2 || Date.now() - clickStarted >= 900) && isElementUsable(target.el)) {
        triedTrustedFallback = true
        await trustedClickElement(target.el, { align: 'center' })
        await waitForDomTick(250, null)
        addToPrompt = await clickAddToPromptIfPresent(findAssetsPanelRoot() || panelRoot)
        continue
      }
      await waitForDomTick(300, null)
    }

    return {
      ok: false,
      error: 'ATTACH_CONFIRMATION_TIMEOUT',
      attachedState: 'not_attached',
      certainty: 'may_have_sent',
      selector: { label: target.label || null, flowMediaId: bound.flowMediaId },
      search,
      addToPrompt,
      ingredientControls: {
        before: beforeIngredientControls,
        after: countIngredientControls(),
      },
      chips: { before: beforeChips, after: countPromptIngredientChips() },
      panelRootPresent: !!panelRoot,
      exit,
      observation: buildObservation(),
      durationMs: Date.now() - started,
      note:
        'Clique no painel ocorreu; confirmação no draft falhou. Labels deduplicados ≠ contagem de chips.',
    }
  }

  /**
   * Anexa refs já bound ao draft. Sem upload, prompt ou geração.
   * Sai de /edit/, abre ingredients uma vez, seleciona no painel.
   */
  async function attachBoundReferencesOnly(bounds, expectedFlowProjectId) {
    const exit = await exitAssetEditIfNeeded(expectedFlowProjectId)
    if (exit.stillInEdit) {
      return {
        ok: false,
        step: 'exit_asset_edit',
        error: exit.error || 'STUCK_IN_ASSET_EDIT',
        exit,
        didUpload: false,
        didWritePrompt: false,
        didGenerate: false,
      }
    }

    const classicMode = await ensureClassicCreateMode()
    if (!classicMode.ok) {
      return {
        ok: false,
        step: 'classic_mode',
        error: classicMode.error || 'AGENT_MODE_ACTIVE',
        classicMode,
        exit,
        didUpload: false,
        didWritePrompt: false,
        didGenerate: false,
        note: 'Agente ativo no Flow — a bancada não anexa/gera nesse modo.',
      }
    }
    const context = assertProjectContext(expectedFlowProjectId)
    if (!context.ok) {
      return {
        ok: false,
        step: 'attach_only_context',
        error: context.error,
        context,
        classicMode,
        exit,
        didUpload: false,
        didWritePrompt: false,
        didGenerate: false,
      }
    }

    // Limpa anexos/texto residuais do prompt anterior antes de anexar o conjunto desta linha.
    {
      const existingChips = countPromptIngredientChips()
      const existingControls = countIngredientControls()
      const existingText = (readPromptText() || '').trim()
      if (existingChips.media > 0 || existingChips.ingredientButtons > 0 || existingControls > 0 || existingText.length > 0) {
        await clearComposerAttachments()
      }
    }

    let panelGate = await ensureIngredientsPanelForAttach(expectedFlowProjectId)
    if (!panelGate.ok) {
      return {
        ok: false,
        step: panelGate.step || 'attach_panel',
        error: panelGate.error,
        panelGate,
        classicMode,
        exit,
        didUpload: false,
        didWritePrompt: false,
        didGenerate: false,
        observation: buildObservation(),
      }
    }

    const list = Array.isArray(bounds) ? bounds : []
    const attachments = []
    for (const bound of list) {
      const flowMediaId = bound?.flowMediaId
      if (!isLegitimateMediaId(flowMediaId)) {
        attachments.push({
          referenceId: bound?.referenceId || null,
          ok: false,
          error: 'NOT_BOUND',
          attachedState: 'not_attached',
          flowMediaId: null,
          note: 'Sem flowMediaId legítimo — não anexar.',
        })
        continue
      }

      if (pathnameHasAssetEdit(location.href) || !findAssetsPanelRoot()) {
        const recover = await exitAssetEditIfNeeded(expectedFlowProjectId)
        if (recover.stillInEdit) {
          attachments.push({
            referenceId: bound.referenceId,
            flowMediaId,
            ok: false,
            error: recover.error || 'STUCK_IN_ASSET_EDIT',
            attachedState: 'not_attached',
            recover,
          })
          continue
        }
        const reopen = await ensureIngredientsPanelForAttach(expectedFlowProjectId)
        if (!reopen.ok) {
          attachments.push({
            referenceId: bound.referenceId,
            flowMediaId,
            ok: false,
            error: reopen.error,
            attachedState: 'not_attached',
            reopen,
          })
          continue
        }
        panelGate = reopen
      }

      const attached = await selectBoundAssetForPrompt(
        {
          name: bound.name || `${bound.displayName || bound.referenceId}.png`,
          referenceId: bound.referenceId,
          flowMediaId,
        },
        expectedFlowProjectId,
        20_000,
        { skipExitEdit: true, skipOpenPanel: true },
      )
      attachments.push({
        referenceId: bound.referenceId,
        flowMediaId,
        name: bound.name || null,
        ...attached,
      })
      if (attached.error === 'ATTACH_OPENED_MEDIA_EDIT') {
        await exitAssetEditIfNeeded(expectedFlowProjectId)
      }
    }

    const minAttach = Math.max(1, list.length)
    const allOk =
      attachments.length >= minAttach && attachments.every((item) => item.ok === true)
    const panelDismiss = allOk ? await dismissAssetsPanelIfOpen() : { closed: false }
    return {
      ok: allOk,
      step: allOk ? 'attach_only_done' : 'attach_only',
      attachments,
      exit,
      panelGate,
      panelDismiss,
      didUpload: false,
      didWritePrompt: false,
      didGenerate: false,
      observation: buildObservation(),
      sensorVersion: globalThis.__ATLAS_FLOW_V1_SENSOR__.version,
      realFlowValidated: false,
      note: 'Anexação exige panelRoot do ingredients. Sem root = sem clique (timeline /edit/ bloqueado).',
    }
  }

  /** Espelha readinessContract.mjs#isStartGenerationLabel (EN + PT-BR). */
  function isStartGenerationLabel(label) {
    const n = normalizeControlLabel(label)
    if (!n) return false
    if (n === 'start generation' || n === 'iniciar geracao') return true
    if (n.endsWith('start generation') || n.endsWith('iniciar geracao')) return true
    return false
  }

  /**
   * Indicadores de geração já visíveis na página (barras de progresso + "N%" nos cards).
   * Usado como linha de base antes do clique: no lote, o prompt anterior ainda está
   * gerando, então "há progresso na tela" sozinho não prova que ESTE clique iniciou nada.
   */
  function countGenerationIndicators() {
    let count = document.querySelectorAll('[role="progressbar"]').length
    for (const el of Array.from(document.querySelectorAll('div, span, p'))) {
      const text = String(el.textContent || '').trim()
      if (!text || text.length > 6 || !/^\d{1,3}\s*%$/.test(text)) continue
      const rect = el.getBoundingClientRect()
      if (rect.width < 8 || rect.height < 8 || rect.width > 120 || rect.height > 48) continue
      count += 1
    }
    return count
  }

  async function waitForGenerationStarted(baseline, timeoutMs) {
    const started = Date.now()
    const promptBefore = typeof baseline?.promptText === 'string' ? baseline.promptText : null
    // Sinais que já existiam antes do clique (geração anterior em andamento) não contam.
    const busyBefore = baseline?.busyBefore === true
    const ariaBusyBefore = baseline?.ariaBusyBefore === true
    const indicatorsBefore =
      typeof baseline?.indicatorsBefore === 'number' ? baseline.indicatorsBefore : 0
    const usableBefore = typeof baseline?.usableBefore === 'number' ? baseline.usableBefore : 1
    while (Date.now() - started < timeoutMs) {
      const agent = detectAgentSession()
      if (agent.active) {
        return {
          started: false,
          via: 'agent_mode_hijack',
          error: 'AGENT_MODE_ACTIVE',
          accepted: false,
          agent,
          durationMs: Date.now() - started,
          note: 'Chat/Aprovar/Omni após clique ≠ geração de imagem aceita.',
        }
      }
      const labels = collectAccessibleLabels()
      const busy = detectGenerationBusy(labels)
      const usable = findUsableControl(isStartGenerationLabel)
      const sceneCount = countLargeSceneImages()
      const indicatorsNow = countGenerationIndicators()
      const ariaBusyNow = document.querySelector('[aria-busy="true"]') != null
      const promptNow = readPromptText()
      if (busy && !busyBefore) {
        return { started: true, via: 'busy_labels', durationMs: Date.now() - started }
      }
      if (indicatorsNow > indicatorsBefore) {
        return {
          started: true,
          via: 'progress',
          indicatorsBefore,
          indicatorsNow,
          durationMs: Date.now() - started,
        }
      }
      if (ariaBusyNow && !ariaBusyBefore) {
        return { started: true, via: 'aria_busy', durationMs: Date.now() - started }
      }
      // Só vale se o botão estava disponível antes do clique e sumiu/desativou depois.
      if (usable.length === 0 && usableBefore > 0) {
        return { started: true, via: 'start_unavailable', durationMs: Date.now() - started }
      }
      // Após enviar, o Flow costuma limpar/encurtar o composer.
      if (
        promptBefore &&
        promptBefore.length >= 8 &&
        (!promptNow || promptNow.length + 8 < promptBefore.length)
      ) {
        return {
          started: true,
          via: 'prompt_cleared',
          durationMs: Date.now() - started,
        }
      }
      // Com geração anterior em andamento, imagens dela podem surgir agora — não é prova deste clique.
      const previousGenerationRunning = busyBefore || indicatorsBefore > 0
      if (!previousGenerationRunning && sceneCount > baseline.sceneCount) {
        return {
          started: true,
          via: 'scene_growth',
          sceneCount,
          durationMs: Date.now() - started,
        }
      }
      await waitForDomTick(400, null)
    }
    return { started: false, durationMs: Date.now() - started }
  }

  async function startGenerationOnce(expectedFlowProjectId, timeoutMs) {
    if (GENERATION_SEND_PAUSED) {
      return {
        ok: false,
        error: 'GENERATION_SEND_PAUSED',
        step: 'generate_paused',
        intent: DIRECT_IMAGE_GENERATION_INTENT,
        note: 'Envio pausado — modo confirmável via verifyDirectImageComposer, sem Start.',
      }
    }
    const context = assertProjectContext(expectedFlowProjectId)
    if (!context.ok) {
      return { ok: false, error: context.error, step: 'generate_context' }
    }
    if (detectAgentSession().active) {
      return {
        ok: false,
        error: 'AGENT_MODE_ACTIVE',
        step: 'generate_preflight',
        intent: DIRECT_IMAGE_GENERATION_INTENT,
        note: 'Agente ativo — não clicar a seta de gerar.',
      }
    }
    const promptBeforeClick = readPromptText()
    if (!promptBeforeClick || promptBeforeClick.length < 8) {
      return {
        ok: false,
        error: 'PROMPT_EMPTY_BEFORE_GENERATE',
        step: 'generate_precheck',
        promptBeforeClick,
        note: 'Prompt vazio no compositor direto — não clicar Start generation.',
      }
    }

    const started = Date.now()
    let lastInspection = null
    while (Date.now() - started < timeoutMs) {
      const usable = findUsableControl(isStartGenerationLabel)
      const arrow = findProjectGenerateArrow() || (usable.length === 1 ? usable[0].el : null)
      lastInspection = summarizeControlInspection(isStartGenerationLabel)
      if (arrow) {
        const before = buildObservation()
        const baseline = {
          sceneCount: countLargeSceneImages(),
          labels: before.labelsSample,
          promptText: promptBeforeClick,
          busyBefore: detectGenerationBusy(collectAccessibleLabels()),
          ariaBusyBefore: document.querySelector('[aria-busy="true"]') != null,
          indicatorsBefore: countGenerationIndicators(),
          usableBefore: findUsableControl(isStartGenerationLabel).length,
        }
        const retries = []

        // Preferir clique trusted (CDP): Flow ignora isTrusted=false; manual funciona.
        // Re-resolve coords após banner do debugger (ver trustedClickViaDebugger).
        const trusted = await trustedClickElement(arrow, { align: 'center' })
        await waitForDomTick(700, null)
        let effect = await waitForGenerationStarted(baseline, 10_000)
        retries.push({ via: 'trusted_debugger_click', click: trusted, effect })

        // Mesmo com trusted.ok, o clique pode ter errado o alvo (banner/layout).
        if (!effect.started) {
          const again = findUsableControl(isStartGenerationLabel)
          const targetEl = again[0]?.el || findProjectGenerateArrow() || arrow
          const trusted2 = await trustedClickElement(targetEl)
          await waitForDomTick(700, null)
          effect = await waitForGenerationStarted(baseline, 8_000)
          retries.push({ via: 'trusted_debugger_click_retry', click: trusted2, effect })
        }

        if (!effect.started) {
          const clickHard = clickElementHard(arrow)
          await waitForDomTick(600, null)
          effect = await waitForGenerationStarted(baseline, 5_000)
          retries.push({ via: 'synthetic_hard_click_fallback', click: clickHard, effect })
        }

        // Sem Ctrl/Meta+Enter: no Flow isso alimenta o Agente em vez de Start generation.

        if (!effect.started) {
          const agentError = effect.error === 'AGENT_MODE_ACTIVE'
          return {
            ok: false,
            error: agentError ? 'AGENT_MODE_ACTIVE' : 'GENERATE_NO_EFFECT',
            certainty: agentError ? 'not_sent' : 'may_have_sent',
            step: agentError ? 'generate_agent_hijack' : 'generate_no_effect',
            selector: { label: usable[0]?.label || 'composer_arrow', matchCount: usable.length || 1 },
            promptBeforeClick,
            retries,
            before,
            after: buildObservation(),
            effect,
            startGenerationInspection: lastInspection,
            intent: DIRECT_IMAGE_GENERATION_INTENT,
            durationMs: Date.now() - started,
            note: agentError
              ? 'Após clique surgiu UI do Agente/Aprovar — não é geração de imagem aceita.'
              : 'Sem sinal de geração após clique trusted/sintético. Confirme permissão debugger ao recarregar a extensão.',
          }
        }

        // Rejeitar se Agente abriu mesmo com busy/prompt_cleared falso-positivo.
        const agentFinal = detectAgentSession()
        if (agentFinal.active) {
          return {
            ok: false,
            error: 'AGENT_MODE_ACTIVE',
            certainty: 'not_sent',
            step: 'generate_agent_hijack',
            selector: { label: usable[0]?.label || 'composer_arrow', matchCount: usable.length || 1 },
            promptBeforeClick,
            retries,
            effect,
            agent: agentFinal,
            intent: DIRECT_IMAGE_GENERATION_INTENT,
            note: 'Sinal ambíguo com Agente ativo — não contar como aceito.',
          }
        }

        const cleared = await clearPromptAfterGeneration()
        return {
          ok: true,
          certainty: 'accepted_start_signal',
          step: 'generate_started',
          cleared,
          selector: { label: usable[0]?.label || 'composer_arrow', matchCount: usable.length || 1 },
          promptBeforeClick,
          retries,
          before,
          after: buildObservation(),
          effect,
          startGenerationInspection: lastInspection,
          intent: DIRECT_IMAGE_GENERATION_INTENT,
          note: 'Sinal de geração de imagem no compositor direto. Resultado ainda NÃO VALIDADO até bytes na linha.',
        }
      }
      await waitForDomTick(400, null)
    }
    return {
      ok: false,
      error: 'START_GENERATION_NOT_READY',
      step: 'generate_wait',
      startGenerationInspection: lastInspection,
      observation: buildObservation(),
      durationMs: Date.now() - started,
    }
  }

  function listMediaLikeLabels(labels) {
    return (labels || collectAccessibleLabels()).filter((label) => {
      const n = String(label || '')
      return (
        /\.(png|jpe?g|webp|gif|heic|heif|mp4|mov|webm)/i.test(n) ||
        /pngimage|jpe?gimage|webpimage/i.test(n.replace(/\s+/g, ''))
      )
    })
  }

  /** Controles de batch que só aparecem depois de tiles gerados. */
  function listGenerationBatchControls(labels) {
    return (labels || []).filter((label) =>
      /^(Reuse prompt|Download batch|Move batch to bin)$/i.test(String(label || '').trim()),
    )
  }

  /**
   * Títulos de tile gerado (Flow nomeia sem extensão: "Atlas Flow v1 portrait").
   * Exclui chrome de UI / navegação.
   */
  function listLikelyGeneratedTileTitles(labels) {
    const deny =
      /^(skip to main content|home|search|settings|more options|account details|ultra tier|google account|project navigation|all media|images|characters|scenes|uploads|library add|create collection|tools|create tool|bin|collapse|editable text|what do you want to create\?|add ingredients to the prompt box|add media menu|product help|agent|settings trigger|start generation|clear prompt|ingredient|favourite|download|filtering and sorting options|more options for the project|left_panel_closecollapse|apps_spark_2tools|deletebin|drive_folder_upload uploads|folder library add|accessibility_new characters|movie scenes|image images|dashboard all media|addcreate tool)$/i
    return (labels || []).filter((label) => {
      const n = String(label || '').trim()
      if (!n || n.length < 8 || n.length > 120) return false
      if (deny.test(n)) return false
      if (/^(Reuse prompt|Download batch|Move batch to bin)$/i.test(n)) return false
      if (/\.(png|jpe?g|webp|gif|heic|heif|mp4|mov|webm)/i.test(n)) return false
      if (/pngimage|jpe?gimage|webpimage/i.test(n.replace(/\s+/g, ''))) return false
      // Títulos curtos com espaço (auto-nome do Flow) ou contendo atlas/portrait/prompt stem.
      if (/\b(portrait|atlas flow|close-up|window light)\b/i.test(n)) return true
      if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÀÜ][\wÁÉÍÓÚÂÊÔÃÕÀÜáéíóúâêôãõàü'’\-]+(?:\s+[\wÁÉÍÓÚÂÊÔÃÕÀÜáéíóúâêôãõàü'’\-]+){1,8}$/.test(n)) {
        return !/tier|google|account|navigation|options|settings|upload|library|collection|dashboard/i.test(
          n,
        )
      }
      return false
    })
  }

  function listGenerationEvidenceLabels(labels) {
    const set = new Set([
      ...listMediaLikeLabels(labels),
      ...listLikelyGeneratedTileTitles(labels),
    ])
    return Array.from(set)
  }

  function isKnownMediaLabel(label, knownStems) {
    const compact = String(label || '')
      .toLowerCase()
      .replace(/\s+/g, '')
    return knownStems.some((stem) => {
      const stemCompact = String(stem || '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '')
      return stemCompact.length > 0 && compact.includes(stemCompact)
    })
  }

  function countLargeSceneImages() {
    return Array.from(document.querySelectorAll('img')).filter((img) => {
      if (isExcludedAssetTag(img.tagName)) return false
      const rect = img.getBoundingClientRect()
      return rect.width >= 96 && rect.height >= 96
    }).length
  }

  /** Normaliza src para comparar baseline vs pós-geração (sem query efêmera/resize). */
  function normalizeImageSrc(src) {
    const raw = String(src || '').trim()
    if (!raw || raw.startsWith('data:')) return ''
    try {
      const u = new URL(raw, location.href)
      if (u.protocol === 'blob:') return raw
      const cleanPath = u.pathname.replace(/=w\d+[^/]*$/i, '').replace(/=s\d+[^/]*$/i, '')
      const stableParams = []
      for (const key of ['mediaId', 'media_id', 'assetId', 'asset_id', 'id', 'name']) {
        const val = u.searchParams.get(key)
        if (val && isLegitimateMediaId(val)) {
          stableParams.push(`${key}=${val}`)
        }
      }
      const suffix = stableParams.length > 0 ? `?${stableParams.join('&')}` : ''
      return `${u.origin}${cleanPath}${suffix}`
    } catch {
      return raw.split('?')[0].split('#')[0]
    }
  }

  const RESERVED_FLOW_URL_SEGMENTS = new Set([
    'project',
    'projects',
    'media',
    'assets',
    'asset',
    'image',
    'images',
    'download',
    'preview',
    'thumbnail',
    'thumb',
    'api',
    'v1',
    'v1beta',
    'trpc',
    'fx',
    'flow',
    'storage',
    'public',
    'signed',
  ])

  function extractMediaIdFromSrcUrl(rawUrl, expectedFlowProjectId) {
    const raw = String(rawUrl || '').trim()
    if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return null
    const projLower = String(
      expectedFlowProjectId || parseProjectId(location.href) || '',
    ).toLowerCase()
    try {
      const u = new URL(raw, location.href)
      for (const key of ['mediaId', 'media_id', 'assetId', 'asset_id', 'generationMediaId', 'id']) {
        const val = u.searchParams.get(key)
        if (val && val.toLowerCase() !== projLower && isLegitimateMediaId(val)) {
          return val
        }
      }
      const cleanPath = u.pathname.replace(/=w\d+[^/]*$/i, '').replace(/=s\d+[^/]*$/i, '')
      const segs = cleanPath
        .split('/')
        .map((s) => decodeURIComponent(s).trim())
        .filter(Boolean)
      for (let i = segs.length - 1; i >= 0; i -= 1) {
        const seg = segs[i].replace(/\.(png|jpe?g|webp|gif|mp4|bin)$/i, '')
        if (!seg || seg.toLowerCase() === projLower) continue
        if (RESERVED_FLOW_URL_SEGMENTS.has(seg.toLowerCase())) continue
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) {
          return seg
        }
      }
      return null
    } catch {
      return null
    }
  }

  function resolveElementFlowMediaId(img, rawSrc, expectedFlowProjectId) {
    const direct =
      extractMediaIdentityFromElement(img) ||
      extractMediaIdentityFromElement(
        img.closest(
          '[data-media-id], [data-asset-id], [data-tile-id], [data-entity-id], [data-item-id], [data-key], [data-id]',
        ),
      )
    if (direct && isLegitimateMediaId(direct.id)) return direct.id
    const host = img.closest('[data-item-id], [data-key], a[href]')
    if (host) {
      for (const attr of ['data-item-id', 'data-key']) {
        const v = host.getAttribute(attr)
        if (v && isLegitimateMediaId(v)) return v.trim()
      }
      const href = host.getAttribute('href')
      if (href) {
        const fromHref = extractMediaIdFromSrcUrl(href, expectedFlowProjectId)
        if (fromHref) return fromHref
      }
    }
    return extractMediaIdFromSrcUrl(rawSrc, expectedFlowProjectId)
  }

  /**
   * Estado vivo de correlação positiva por tentativa na página:
   * - Canal A: respostas de interação observadas passivamente no mundo MAIN (`__atlas_flow_v1_rpc_observed__`).
   * - Canal B: containers de slots de progresso (`0%..99%` / `[role="progressbar"]`) surgidos após o armamento
   *   desta tentativa e acompanhados até materializarem `<img>` final (ignora scroll/virtualização do grid!).
   */
  function createEmptyCorrelationSession() {
    return {
      attemptId: null,
      commandId: null,
      promptText: '',
      expectedFlowProjectId: null,
      armedAtMs: 0,
      baselineClosedPanel: false,
      excludeSrcs: new Set(),
      excludeMediaIds: new Set(),
      preExistingSlotKeys: new Set(),
      rpcWorkflowIds: new Set(),
      rpcMediaIds: new Set(),
      rpcSrcs: new Set(),
      slotLineageMediaIds: new Set(),
      slotLineageSrcs: new Set(),
      trackedSlotKeys: new Set(),
      /** Último rect conhecido por slot — sobrevive à troca de DOM do card de progresso. */
      trackedSlotRects: new Map(),
      originProofByKey: {},
      sawAcceptedProgress: false,
    }
  }

  function normalizePromptForRpcMatch(text) {
    return String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\s+/g, ' ')
      .replace(/\[([^\]]+)\]/g, '@$1')
      .trim()
      .toLowerCase()
  }

  function newestArmedCorrelationSession(sessions) {
    let best = null
    for (const session of sessions) {
      if (!session?.attemptId) continue
      if (!best || Number(session.armedAtMs || 0) > Number(best.armedAtMs || 0)) {
        best = session
      }
    }
    return best
  }

  /**
   * Dono global de cada imagem (media/src → attemptId) durante a vida da página.
   * Sobrevive ao fim da sessão de correlação: uma imagem atribuída a um prompt nunca
   * pode ser reatribuída a outro prompt do lote (causa das imagens trocadas entre linhas).
   */
  const identityOwner =
    previous?.identityOwner instanceof Map ? previous.identityOwner : new Map()
  globalThis.__ATLAS_FLOW_V1_SENSOR__.identityOwner = identityOwner

  function identityOwnedByOther(key, attemptId) {
    if (!key) return false
    const owner = identityOwner.get(key)
    return Boolean(owner && owner !== attemptId)
  }

  function recordSlotLineageIdentity(session, img, raw, proof) {
    const srcKey = normalizeImageSrc(raw)
    const mediaId = resolveElementFlowMediaId(img, raw, session.expectedFlowProjectId)
    if (srcKey && session.excludeSrcs.has(srcKey)) return false
    if (mediaId && session.excludeMediaIds.has(mediaId)) return false
    // Exclusividade entre tentativas: já pertence a outro prompt → não é deste.
    if (srcKey && identityOwnedByOther(`src:${srcKey}`, session.attemptId)) return false
    if (mediaId && identityOwnedByOther(`media:${mediaId}`, session.attemptId)) return false
    let recorded = false
    if (srcKey) {
      session.slotLineageSrcs.add(srcKey)
      identityOwner.set(`src:${srcKey}`, session.attemptId)
      if (!session.originProofByKey[`src:${srcKey}`]) {
        session.originProofByKey[`src:${srcKey}`] = proof
      }
      recorded = true
    }
    if (mediaId) {
      session.slotLineageMediaIds.add(mediaId)
      identityOwner.set(`media:${mediaId}`, session.attemptId)
      if (!session.originProofByKey[`media:${mediaId}`]) {
        session.originProofByKey[`media:${mediaId}`] = proof
      }
      recorded = true
    }
    if (recorded) {
      try {
        img.dataset.atlasAttemptId = session.attemptId
        img.dataset.atlasSlotLineage = '1'
      } catch {
        /* ignore */
      }
    }
    return recorded
  }

  /** Várias gerações em paralelo: cada tentativa mantém a própria sessão. */
  const correlationSessions = new Map()
  let correlationObserver = null
  let correlationRuntime = createEmptyCorrelationSession()

  function listCorrelationSessions() {
    const out = []
    for (const session of correlationSessions.values()) out.push(session)
    if (
      correlationRuntime.attemptId &&
      !correlationSessions.has(String(correlationRuntime.attemptId))
    ) {
      out.push(correlationRuntime)
    }
    return out
  }

  function resolveCorrelationSession(attemptId) {
    const id = attemptId ? String(attemptId) : ''
    if (id && correlationSessions.has(id)) return correlationSessions.get(id)
    if (id && String(correlationRuntime.attemptId || '') === id) return correlationRuntime
    return null
  }

  function findProgressSlotContainer(node) {
    if (!node || !(node instanceof Element)) return null
    let cur = node
    let best = null
    for (let depth = 0; cur && depth < 9 && cur !== document.body; depth += 1) {
      const rect = cur.getBoundingClientRect()
      if (
        rect &&
        rect.width >= 120 &&
        rect.height >= 120 &&
        rect.width <= 920 &&
        rect.height <= 920
      ) {
        best = cur
        // Para no card individual antes de subir ao grid inteiro do projeto.
        if (rect.width <= 640 && rect.height <= 640) break
      }
      cur = cur.parentElement
    }
    return best
  }

  function collectActiveProgressSlotElements() {
    const containers = new Set()
    for (const pb of Array.from(document.querySelectorAll('[role="progressbar"]'))) {
      const box = findProgressSlotContainer(pb)
      if (box) containers.add(box)
    }
    for (const el of Array.from(document.querySelectorAll('div, span, p'))) {
      const text = String(el.textContent || '').trim()
      if (!text || text.length > 6) continue
      const match = text.match(/^(\d{1,3})\s*%$/)
      if (!match) continue
      const pct = Number(match[1])
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) continue
      const rect = el.getBoundingClientRect()
      if (rect.width < 8 || rect.height < 8 || rect.width > 120 || rect.height > 48) continue
      const box = findProgressSlotContainer(el)
      if (box) containers.add(box)
    }
    return Array.from(containers)
  }

  function ensureSlotKeyOnElement(el) {
    if (!el.dataset.atlasSlotKey) {
      el.dataset.atlasSlotKey = `slot-${crypto.randomUUID()}`
    }
    return el.dataset.atlasSlotKey
  }

  function scanOneCorrelationSession(session, options = {}) {
    if (!session?.attemptId) return 0
    const allowClaimUnstamped = options.allowClaimUnstamped === true
    const activeSlots = collectActiveProgressSlotElements()
    let trackedGeneratingSlotCount = 0
    const nowMs = Date.now()

    for (const slotEl of activeSlots) {
      const slotKey = ensureSlotKeyOnElement(slotEl)
      if (session.preExistingSlotKeys.has(slotKey)) continue
      if (
        slotEl.dataset.atlasAttemptId &&
        slotEl.dataset.atlasAttemptId !== session.attemptId
      ) {
        continue
      }
      // Observer global: só a tentativa armada mais recente carimba slots novos.
      // Senão o lote 3-em-3 atribui progresso do prompt B ao A.
      if (!slotEl.dataset.atlasAttemptId && !allowClaimUnstamped) continue
      slotEl.dataset.atlasAttemptId = session.attemptId
      slotEl.dataset.atlasSawProgress = '1'
      session.trackedSlotKeys.add(slotKey)
      session.sawAcceptedProgress = true
      trackedGeneratingSlotCount += 1
      try {
        const rect = slotEl.getBoundingClientRect()
        if (rect.width >= 80 && rect.height >= 80) {
          session.trackedSlotRects.set(slotKey, {
            cx: rect.left + rect.width / 2,
            cy: rect.top + rect.height / 2,
            w: rect.width,
            h: rect.height,
            lastSeenMs: nowMs,
          })
        }
      } catch {
        /* ignore */
      }
    }

    // Atualiza rects de slots já carimbados desta tentativa (mesmo sem % ativo).
    const stampedSelector = `[data-atlas-attempt-id="${CSS.escape(session.attemptId)}"][data-atlas-saw-progress="1"]`
    for (const trackedEl of Array.from(document.querySelectorAll(stampedSelector))) {
      const slotKey = ensureSlotKeyOnElement(trackedEl)
      try {
        const rect = trackedEl.getBoundingClientRect()
        if (rect.width >= 80 && rect.height >= 80) {
          session.trackedSlotRects.set(slotKey, {
            cx: rect.left + rect.width / 2,
            cy: rect.top + rect.height / 2,
            w: rect.width,
            h: rect.height,
            lastSeenMs: nowMs,
          })
        }
      } catch {
        /* ignore */
      }
      for (const img of Array.from(trackedEl.querySelectorAll('img'))) {
        if (isExcludedAssetTag(img.tagName)) continue
        const raw = String(img.currentSrc || img.src || '')
        if (!raw || raw.startsWith('data:')) continue
        const rect = img.getBoundingClientRect()
        const nw = img.naturalWidth || 0
        const nh = img.naturalHeight || 0
        if (rect.width < 120 && nw < 480) continue
        if (rect.height < 120 && nh < 320) continue
        recordSlotLineageIdentity(session, img, raw, 'tracked_progress_slot')
      }
    }

    // Flow troca o card de progresso por um card de imagem (perde data-atlas-*).
    if (session.trackedSlotRects.size > 0) {
      const activeKeysNow = new Set(activeSlots.map((el) => el.dataset.atlasSlotKey).filter(Boolean))
      const orphanRects = []
      for (const [slotKey, rect] of session.trackedSlotRects.entries()) {
        if (nowMs - Number(rect.lastSeenMs || 0) > 60_000) continue
        if (activeKeysNow.has(slotKey)) continue
        let stillInDom = null
        try {
          stillInDom = document.querySelector(`[data-atlas-slot-key="${CSS.escape(slotKey)}"]`)
        } catch {
          stillInDom = null
        }
        if (stillInDom) continue
        orphanRects.push({ slotKey, ...rect })
      }
      for (const img of Array.from(document.querySelectorAll('img'))) {
        if (isExcludedAssetTag(img.tagName)) continue
        if (img.dataset.atlasSlotLineage === '1' && img.dataset.atlasAttemptId === session.attemptId) {
          continue
        }
        if (img.dataset.atlasAttemptId && img.dataset.atlasAttemptId !== session.attemptId) {
          continue
        }
        const owner = img.closest('[data-atlas-attempt-id]')
        if (
          owner?.dataset?.atlasAttemptId &&
          owner.dataset.atlasAttemptId !== session.attemptId
        ) {
          continue
        }
        const raw = String(img.currentSrc || img.src || '')
        if (!raw || raw.startsWith('data:')) continue
        const rect = img.getBoundingClientRect()
        const nw = img.naturalWidth || 0
        const nh = img.naturalHeight || 0
        if (rect.width < 120 && nw < 480) continue
        if (rect.height < 120 && nh < 320) continue
        const imgCx = rect.left + rect.width / 2
        const imgCy = rect.top + rect.height / 2
        let bestDist = Infinity
        let matched = false
        for (const or of orphanRects) {
          const threshold = Math.max(96, Math.max(or.w, or.h) * 0.85)
          const dx = imgCx - or.cx
          const dy = imgCy - or.cy
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist <= threshold && dist < bestDist) {
            bestDist = dist
            matched = true
          }
        }
        if (!matched) continue
        if (recordSlotLineageIdentity(session, img, raw, 'tracked_progress_slot_spatial')) {
          session.sawAcceptedProgress = true
        }
      }
    }

    // Se a sessão observou progresso real e os cards de progresso terminaram (ou trocaram de container
    // enquanto a aba estava em background), promove imagens grandes novas pós-baseline.
    if (session.sawAcceptedProgress && activeSlots.length === 0) {
      const panelRoot = detectAssetsPanel().present ? findAssetsPanelRoot() : null
      for (const img of Array.from(document.querySelectorAll('img'))) {
        if (isExcludedAssetTag(img.tagName)) continue
        if (img.dataset.atlasPreexistingImg === '1') continue
        if (panelRoot && panelRoot.contains(img)) continue
        if (img.dataset.atlasAttemptId && img.dataset.atlasAttemptId !== session.attemptId) {
          continue
        }
        const raw = String(img.currentSrc || img.src || '')
        if (!raw || raw.startsWith('data:')) continue
        if (/atlas-ref-[ab]\.png|\/atlas-ref-[ab]/i.test(raw)) continue
        const srcKey = normalizeImageSrc(raw)
        if (srcKey && session.excludeSrcs.has(srcKey)) continue
        const mediaId = extractMediaIdFromSrcUrl(raw, session.expectedFlowProjectId)
        if (mediaId && session.excludeMediaIds.has(mediaId)) continue
        const rect = img.getBoundingClientRect()
        const nw = img.naturalWidth || 0
        const nh = img.naturalHeight || 0
        if (rect.width < 140 && nw < 480) continue
        if (rect.height < 140 && nh < 320) continue
        recordSlotLineageIdentity(session, img, raw, 'tracked_progress_slot')
      }
    }

    return trackedGeneratingSlotCount
  }

  function scanCorrelationTrackerDom(attemptId = null) {
    const allSessions = listCorrelationSessions()
    const sessions = attemptId
      ? [resolveCorrelationSession(attemptId)].filter(Boolean)
      : allSessions
    const newest = newestArmedCorrelationSession(allSessions)
    let trackedGeneratingSlotCount = 0
    for (const session of sessions) {
      const isNewest = Boolean(newest && session.attemptId === newest.attemptId)
      const waveAlreadyCompleted =
        session.trackedSlotKeys.size > 0 &&
        (session.slotLineageMediaIds.size > 0 || session.slotLineageSrcs.size > 0)
      const allowClaimUnstamped = isNewest && !waveAlreadyCompleted
      trackedGeneratingSlotCount += scanOneCorrelationSession(session, {
        allowClaimUnstamped,
      })
    }
    return { trackedGeneratingSlotCount }
  }

  /** Diagnóstico do canal RPC (sai no capture_correlation para conferir se o hook vê tráfego). */
  const rpcStats = { observed: 0, withOutputs: 0, matched: 0, lastPaths: [] }

  /** Remove aliases/@tokens/pontuação: o Flow reescreve [alias] em chips, então o texto do request difere. */
  function looseRpcPromptKey(text) {
    return normalizePromptForRpcMatch(text)
      .replace(/@[\w-]+/g, ' ')
      .replace(/[^a-z0-9à-ÿ]+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function rpcPromptMatches(reqPrompt, expected) {
    if (!reqPrompt || !expected) return false
    if (reqPrompt === expected) return true
    const a = normalizePromptForRpcMatch(reqPrompt)
    const b = normalizePromptForRpcMatch(expected)
    if (a && b && a === b) return true
    const la = looseRpcPromptKey(reqPrompt)
    const lb = looseRpcPromptKey(expected)
    if (la.length < 24 || lb.length < 24) return false
    if (la === lb) return true
    const head = (s) => s.slice(0, 120)
    return la.includes(head(lb)) || lb.includes(head(la))
  }

  /** RPC é a prova mais forte: assume a posse e tira a imagem da linhagem de outra tentativa. */
  function assignRpcIdentity(session, key, kind, value) {
    const owner = identityOwner.get(key)
    if (owner && owner !== session.attemptId) {
      const other = resolveCorrelationSession(owner)
      if (other) {
        if (kind === 'media') other.slotLineageMediaIds.delete(value)
        else other.slotLineageSrcs.delete(value)
        delete other.originProofByKey[key]
      }
    }
    identityOwner.set(key, session.attemptId)
    if (kind === 'media') session.rpcMediaIds.add(value)
    else session.rpcSrcs.add(value)
    session.originProofByKey[key] = 'rpc_response'
  }

  function absorbRpcOutputs(session, mediaIds, mediaUrls) {
    for (const rawId of mediaIds) {
      const id = String(rawId || '').trim()
      if (isLegitimateMediaId(id) && !session.excludeMediaIds.has(id)) {
        assignRpcIdentity(session, `media:${id}`, 'media', id)
      }
    }
    const filteredUrls = (mediaUrls || []).filter((rawUrl) => {
      const u = String(rawUrl || '')
      // Em batchexecute do projeto vêm 15..24 miniaturas lh3/asb de histórico/refs;
      // se o pacote traz >4 URLs, ignora lh3/asb sem UUID e mantém apenas flow-content.google.
      if (mediaUrls.length > 4 && /googleusercontent\.com\/asb\//i.test(u)) return false
      return true
    })
    for (const rawUrl of filteredUrls) {
      const srcKey = normalizeImageSrc(rawUrl)
      if (srcKey && !session.excludeSrcs.has(srcKey)) {
        assignRpcIdentity(session, `src:${srcKey}`, 'src', srcKey)
      }
      const fromUrl = extractMediaIdFromSrcUrl(rawUrl, session.expectedFlowProjectId)
      if (fromUrl && !session.excludeMediaIds.has(fromUrl)) {
        assignRpcIdentity(session, `media:${fromUrl}`, 'media', fromUrl)
      }
    }
  }

  function handleMainWorldRpcEvent(event) {
    try {
      const detail = event && event.detail && typeof event.detail === 'object' ? event.detail : null
      if (!detail) return
      rpcStats.observed += 1
      if (typeof detail.urlPath === 'string' && detail.urlPath) {
        rpcStats.lastPaths = [detail.urlPath.slice(0, 120), ...rpcStats.lastPaths.filter((p) => p !== detail.urlPath)].slice(0, 6)
      }
      const sessions = listCorrelationSessions()
      if (sessions.length === 0) return
      const wf = typeof detail.workflowId === 'string' ? detail.workflowId.trim() : ''
      const reqPrompt = typeof detail.requestPromptText === 'string' ? detail.requestPromptText.trim() : ''
      const reqStartedAt = Number(detail.requestStartedAtMs || 0)
      const mediaIds = Array.isArray(detail.mediaIds) ? detail.mediaIds : []
      const mediaUrls = Array.isArray(detail.mediaUrls) ? detail.mediaUrls : []
      const hasOutputs = mediaIds.length > 0 || mediaUrls.length > 0
      if (hasOutputs) rpcStats.withOutputs += 1

      let matchedAny = false
      const byWorkflow = []
      const byPrompt = []
      for (const session of sessions) {
        if (wf && session.rpcWorkflowIds.has(wf)) {
          byWorkflow.push(session)
          continue
        }
        if (wf && session.rpcWorkflowIds.size > 0 && !session.rpcWorkflowIds.has(wf)) continue
        const expected = String(session.promptText || '').trim()
        const afterArm = !reqStartedAt || reqStartedAt >= session.armedAtMs - 500
        if (afterArm && rpcPromptMatches(reqPrompt, expected)) byPrompt.push(session)
      }
      // Prompt casando com mais de uma tentativa = ambíguo; não atribui a nenhuma.
      const winners = byWorkflow.length > 0 ? byWorkflow : byPrompt.length === 1 ? byPrompt : []
      for (const session of winners) {
        matchedAny = true
        rpcStats.matched += 1
        if (wf) session.rpcWorkflowIds.add(wf)
        session.sawAcceptedProgress = true
        absorbRpcOutputs(session, mediaIds, mediaUrls)
      }
      if (byPrompt.length > 1 && byWorkflow.length === 0) matchedAny = true

      // Sem prompt no payload: só vincula se não for listagem grande de histórico/assets (<= 4 outputs),
      // houver workflowId ou URLs diretas flow-content.google, e apenas UMA tentativa armada.
      const looksLikeBulkFeed =
        mediaUrls.length > 4 ||
        mediaIds.length > 4 ||
        (!wf &&
          !reqPrompt &&
          mediaIds.length === 0 &&
          mediaUrls.every((u) => /googleusercontent\.com\/asb\//i.test(String(u || ''))))
      if (!matchedAny && hasOutputs && !looksLikeBulkFeed && mediaIds.length <= 4 && mediaUrls.length <= 4) {
        const eligible = sessions.filter((session) => {
          if (wf && session.rpcWorkflowIds.size > 0 && !session.rpcWorkflowIds.has(wf)) return false
          return !reqStartedAt || reqStartedAt >= session.armedAtMs - 500
        })
        if (eligible.length === 1) {
          const best = eligible[0]
          if (wf) best.rpcWorkflowIds.add(wf)
          best.sawAcceptedProgress = true
          absorbRpcOutputs(best, mediaIds, mediaUrls)
          rpcStats.matched += 1
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (previous?.onRpcEvent) {
    try {
      window.removeEventListener('__atlas_flow_v1_rpc_observed__', previous.onRpcEvent)
    } catch {
      /* ignore */
    }
  }
  globalThis.__ATLAS_FLOW_V1_SENSOR__.onRpcEvent = handleMainWorldRpcEvent
  window.addEventListener('__atlas_flow_v1_rpc_observed__', handleMainWorldRpcEvent)

  function getCorrelationSnapshot(attemptId = null) {
    // Pediu uma tentativa específica e ela não existe mais: snapshot VAZIO.
    // Cair na sessão mais recente misturava a linhagem de outro prompt nesta tentativa.
    const session = attemptId
      ? resolveCorrelationSession(attemptId) || createEmptyCorrelationSession()
      : correlationRuntime
    const correlatedMediaIds = Array.from(
      new Set([...session.rpcMediaIds, ...session.slotLineageMediaIds]),
    )
    const correlatedSrcs = Array.from(
      new Set([...session.rpcSrcs, ...session.slotLineageSrcs]),
    )
    return {
      attemptId: session.attemptId,
      commandId: session.commandId,
      baselineClosedPanel: session.baselineClosedPanel,
      sawAcceptedProgress: session.sawAcceptedProgress,
      preExistingSlotKeys: Array.from(session.preExistingSlotKeys),
      trackedSlotKeys: Array.from(session.trackedSlotKeys),
      rpcWorkflowIds: Array.from(session.rpcWorkflowIds),
      rpcMediaIds: Array.from(session.rpcMediaIds),
      rpcSrcs: Array.from(session.rpcSrcs),
      slotLineageMediaIds: Array.from(session.slotLineageMediaIds),
      slotLineageSrcs: Array.from(session.slotLineageSrcs),
      correlatedMediaIds,
      correlatedSrcs,
      originProofByKey: { ...session.originProofByKey },
      rpcStats: {
        observed: rpcStats.observed,
        withOutputs: rpcStats.withOutputs,
        matched: rpcStats.matched,
        lastPaths: rpcStats.lastPaths.slice(0, 6),
      },
    }
  }

  /**
   * Coleta candidatos visíveis com identidades estáveis observadas no DOM
   * (src normalizado + mediaId quando a UI/URL expõe). Sem inventar endpoints.
   */
  function collectVisibleResultCandidates(expectedFlowProjectId) {
    const out = []
    const seenSrc = new Set()
    const seenMedia = new Set()
    for (const img of Array.from(document.querySelectorAll('img'))) {
      if (isExcludedAssetTag(img.tagName)) continue
      const rect = img.getBoundingClientRect()
      if (rect.width < 96 || rect.height < 96) continue
      const raw = String(img.currentSrc || img.src || '')
      if (!raw || raw.startsWith('data:')) continue
      const srcKey = normalizeImageSrc(raw)
      const mediaId = resolveElementFlowMediaId(img, raw, expectedFlowProjectId)
      if (srcKey && seenSrc.has(srcKey) && (!mediaId || seenMedia.has(mediaId))) continue
      if (srcKey) seenSrc.add(srcKey)
      if (mediaId) seenMedia.add(mediaId)
      out.push({
        img,
        rawSrc: raw,
        srcKey,
        mediaId,
        candidateKey: mediaId ? `media:${mediaId}` : `src:${srcKey || raw}`,
        alt: String(img.alt || img.getAttribute('aria-label') || '').slice(0, 120),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        naturalWidth: img.naturalWidth || 0,
        naturalHeight: img.naturalHeight || 0,
      })
    }
    return out
  }

  /**
   * Prepara o grid ANTES do envio (fecha painel de Assets + sai de asset edit),
   * registra identificadores estáveis de todos os assets/cards já presentes e
   * inicia a observação (`MutationObserver` + receptor RPC) ANTES do clique em Gerar.
   */
  async function preparePreSubmitBaseline(expectedFlowProjectId, options = {}) {
    await exitAssetEditIfNeeded(expectedFlowProjectId)
    await dismissAssetsPanelIfOpen()
    await waitForDomTick(450, null)

    const attemptId = options?.attemptId ? String(options.attemptId) : null
    const session = createEmptyCorrelationSession()

    // Não apaga carimbos de outras tentativas ainda em observação (lote 3 em 3).
    const preExistingSlotKeys = []
    for (const slotEl of collectActiveProgressSlotElements()) {
      const slotKey = ensureSlotKeyOnElement(slotEl)
      // Slots já de outra tentativa ou já gerando contam como pré-existentes nesta.
      if (slotEl.dataset.atlasAttemptId && slotEl.dataset.atlasAttemptId !== attemptId) {
        session.preExistingSlotKeys.add(slotKey)
        preExistingSlotKeys.push(slotKey)
        continue
      }
      if (!slotEl.dataset.atlasAttemptId) {
        slotEl.dataset.atlasPreexistingSlot = '1'
      }
      session.preExistingSlotKeys.add(slotKey)
      preExistingSlotKeys.push(slotKey)
    }

    const candidates = collectVisibleResultCandidates(expectedFlowProjectId)
    const srcs = []
    const mediaIds = []
    const seenSrc = new Set()
    const seenMedia = new Set()
    for (const item of candidates) {
      try {
        item.img.dataset.atlasPreexistingImg = '1'
      } catch {
        /* ignore */
      }
      if (item.srcKey && !seenSrc.has(item.srcKey)) {
        seenSrc.add(item.srcKey)
        srcs.push(item.srcKey)
      }
      if (item.mediaId && !seenMedia.has(item.mediaId)) {
        seenMedia.add(item.mediaId)
        mediaIds.push(item.mediaId)
      }
    }

    const labels = collectAccessibleLabels()
    const evidenceLabels = listGenerationEvidenceLabels(labels)

    session.attemptId = attemptId
    session.commandId = options?.commandId ? String(options.commandId) : null
    session.promptText = typeof options?.promptText === 'string' ? options.promptText : ''
    session.expectedFlowProjectId = expectedFlowProjectId || parseProjectId(location.href)
    session.armedAtMs = Date.now()
    session.baselineClosedPanel = true
    session.excludeSrcs = new Set(srcs)
    session.excludeMediaIds = new Set(mediaIds)

    if (attemptId) {
      correlationSessions.set(attemptId, session)
    }
    correlationRuntime = session

    if (!correlationObserver && document.body) {
      correlationObserver = new MutationObserver(() => {
        scanCorrelationTrackerDom()
      })
      correlationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'srcset', 'aria-valuenow', 'aria-label', 'role'],
      })
    }

    return {
      ok: true,
      baselineClosedPanel: true,
      armedAttemptId: session.attemptId,
      armedAt: new Date(session.armedAtMs).toISOString(),
      srcs,
      mediaIds,
      preExistingSlotKeys,
      srcCount: srcs.length,
      mediaIdCount: mediaIds.length,
      preExistingSlotCount: preExistingSlotKeys.length,
      activeCorrelationSessions: correlationSessions.size,
      sceneCount: countLargeSceneImages(),
      evidenceLabels: evidenceLabels.slice(0, 24),
      evidenceCount: evidenceLabels.length,
      observedAt: new Date().toISOString(),
      sensorVersion: globalThis.__ATLAS_FLOW_V1_SENSOR__.version,
      note: 'Baseline por tentativa; gerações em paralelo não apagam a correlação anterior.',
    }
  }

  /**
   * Snapshot síncrono compatível (fallback). Para geração real, preferir preparePreSubmitBaseline.
   */
  function snapshotGenerationBaseline() {
    const labels = collectAccessibleLabels()
    const evidenceLabels = listGenerationEvidenceLabels(labels)
    const candidates = collectVisibleResultCandidates(parseProjectId(location.href))
    const srcs = []
    const mediaIds = []
    const seenSrc = new Set()
    const seenMedia = new Set()
    for (const item of candidates) {
      if (item.srcKey && !seenSrc.has(item.srcKey)) {
        seenSrc.add(item.srcKey)
        srcs.push(item.srcKey)
      }
      if (item.mediaId && !seenMedia.has(item.mediaId)) {
        seenMedia.add(item.mediaId)
        mediaIds.push(item.mediaId)
      }
    }
    return {
      ok: true,
      baselineClosedPanel: false,
      srcs,
      mediaIds,
      preExistingSlotKeys: [],
      srcCount: srcs.length,
      mediaIdCount: mediaIds.length,
      sceneCount: countLargeSceneImages(),
      evidenceLabels: evidenceLabels.slice(0, 24),
      evidenceCount: evidenceLabels.length,
      observedAt: new Date().toISOString(),
      sensorVersion: globalThis.__ATLAS_FLOW_V1_SENSOR__.version,
      note: 'Baseline pré-geração — capture exclui estes srcs/mediaIds; origem exige correlação positiva.',
    }
  }

  function detectGenerationBusy(labels) {
    const joined = (labels || collectAccessibleLabels()).join(' · ').toLowerCase()
    return (
      /generating|generation in progress|gerando|criar imagens|criando|carregando|loading…|loading\.\.\.|parar gera|stop generation|cancel generation/i.test(
        joined,
      ) || detectLoadingState().isLoading
    )
  }

  /**
   * Lê progresso real na página do Flow (DOM / a11y).
   * Percentual só quando o texto ou aria-valuenow estiver presente — sem simular por tempo.
   * Observado na UI: cards com "N%" no canto e [role=progressbar] durante a geração.
   */
  function sampleGenerationProgress(options = {}) {
    const baselineSrcs = new Set(
      (Array.isArray(options?.excludeSrcs) ? options.excludeSrcs : []).map((s) =>
        normalizeImageSrc(s),
      ),
    )
    const baselineMediaIds = new Set(
      (Array.isArray(options?.excludeMediaIds) ? options.excludeMediaIds : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    )
    const baselineEvidenceCount =
      typeof options?.baselineEvidenceCount === 'number' ? options.baselineEvidenceCount : 0
    const labels = collectAccessibleLabels()
    const domBusy = detectGenerationBusy(labels)
    const focusAttemptId = options?.attemptId ? String(options.attemptId) : null
    const focusedSession = focusAttemptId ? resolveCorrelationSession(focusAttemptId) : null
    if (focusedSession) {
      correlationRuntime = focusedSession
    }
    const trackerScan = scanCorrelationTrackerDom(focusAttemptId)
    const trackedGeneratingSlotCount = Number(trackerScan.trackedGeneratingSlotCount) || 0
    const focusedWaveFinished = Boolean(
      focusedSession &&
        focusedSession.trackedSlotKeys.size > 0 &&
        trackedGeneratingSlotCount === 0,
    )
    const slotBelongsToOtherAttempt = (slotBox) => {
      if (!slotBox) return false
      if (slotBox.dataset?.atlasPreexistingSlot === '1') return true
      const slotKey = slotBox.dataset?.atlasSlotKey
      if (focusedSession && slotKey && focusedSession.preExistingSlotKeys.has(slotKey)) {
        return true
      }
      const ownerId = slotBox.dataset?.atlasAttemptId
      if (focusAttemptId && ownerId && ownerId !== focusAttemptId) return true
      if (focusedWaveFinished && (!ownerId || ownerId !== focusAttemptId)) return true
      return false
    }

    const percentHits = []
    let scopedProgressbarCount = 0

    for (const el of Array.from(document.querySelectorAll('[role="progressbar"]'))) {
      const slotBox = findProgressSlotContainer(el)
      if (slotBelongsToOtherAttempt(slotBox)) continue
      scopedProgressbarCount += 1
      const nowRaw = el.getAttribute('aria-valuenow')
      if (nowRaw != null && nowRaw !== '') {
        const percent = Number(nowRaw)
        if (Number.isFinite(percent) && percent >= 0 && percent <= 100) {
          percentHits.push({ source: 'aria-valuenow', percent, label: null })
        }
      }
      const text = String(el.textContent || '').trim()
      const match = text.match(/(\d{1,3})\s*%/)
      if (match) {
        const percent = Number(match[1])
        if (Number.isFinite(percent) && percent >= 0 && percent <= 100) {
          percentHits.push({ source: 'progressbar-text', percent, label: text.slice(0, 32) })
        }
      }
    }

    // Cards do Flow mostram "0%" / "11%" como texto curto isolado (sem role=progressbar).
    for (const el of Array.from(document.querySelectorAll('div, span, p'))) {
      const text = String(el.textContent || '').trim()
      if (!text || text.length > 6) continue
      const match = text.match(/^(\d{1,3})\s*%$/)
      if (!match) continue
      const percent = Number(match[1])
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) continue
      const rect = el.getBoundingClientRect()
      if (rect.width < 8 || rect.height < 8 || rect.width > 120 || rect.height > 48) continue
      const slotBox = findProgressSlotContainer(el)
      if (slotBelongsToOtherAttempt(slotBox)) continue
      percentHits.push({ source: 'card-percent-text', percent, label: text })
    }

    // Só usa labels globais de % quando não há escopo por tentativa (evita ler % de outro prompt do lote).
    if (!focusAttemptId && percentHits.length === 0) {
      for (const label of labels) {
        const text = String(label || '')
        const match = text.match(/(?:^|[^\d])(\d{1,3})\s*%/)
        if (!match) continue
        const percent = Number(match[1])
        if (Number.isFinite(percent) && percent >= 0 && percent <= 100) {
          percentHits.push({
            source: 'label',
            percent,
            label: text.slice(0, 96),
          })
        }
      }
    }

    const slotPercents = percentHits.map((hit) => hit.percent)
    const hasIncompletePercent = slotPercents.some(
      (p) => Number.isFinite(p) && p >= 0 && p < 100,
    )
    const effectiveDomBusy = focusedWaveFinished ? false : domBusy
    const generatingCardCount = Math.max(
      trackedGeneratingSlotCount,
      scopedProgressbarCount,
      percentHits.filter((hit) => hit.source === 'card-percent-text').length,
      effectiveDomBusy && slotPercents.length === 0 ? 1 : 0,
    )
    // Qualquer percentual < 100% desta tentativa ou slot rastreado desta tentativa gerando = BUSY!
    const busy =
      effectiveDomBusy ||
      hasIncompletePercent ||
      trackedGeneratingSlotCount > 0 ||
      (generatingCardCount > 0 && slotPercents.length === 0)

    const evidenceLabels = listGenerationEvidenceLabels(labels)
    const completedEvidenceCount = Math.max(0, evidenceLabels.length - baselineEvidenceCount)
    const sceneCount = countLargeSceneImages()
    const corrSnap = getCorrelationSnapshot(focusAttemptId)
    // NÃO promove `visible` genérico do DOM para allowlist (evita virtualização/painel fechado).
    const correlatedSrcs = corrSnap.correlatedSrcs.filter((s) => !baselineSrcs.has(s))
    const correlatedMediaIds = corrSnap.correlatedMediaIds.filter((m) => !baselineMediaIds.has(m))
    const freshScenes = []
    const seenFresh = new Set()
    for (const img of Array.from(document.querySelectorAll('img'))) {
      if (isExcludedAssetTag(img.tagName)) continue
      const rect = img.getBoundingClientRect()
      const nw = img.naturalWidth || 0
      const nh = img.naturalHeight || 0
      if (rect.width < 8 || rect.height < 8) continue
      if (rect.width < 120 && nw < 480) continue
      if (rect.height < 120 && nh < 320) continue
      const raw = String(img.currentSrc || img.src || '')
      if (!raw || raw.startsWith('data:')) continue
      const srcKey = normalizeImageSrc(raw)
      if (!srcKey || baselineSrcs.has(srcKey) || seenFresh.has(srcKey)) continue
      const mediaId = resolveElementFlowMediaId(img, raw, parseProjectId(location.href))
      if (mediaId && baselineMediaIds.has(mediaId)) continue
      seenFresh.add(srcKey)
      freshScenes.push({ src: srcKey, top: rect.top, mediaId: mediaId || null })
    }
    freshScenes.sort((a, b) => a.top - b.top)
    const freshSlice = freshScenes.slice(0, 8)
    const newSceneCount = Math.max(
      freshScenes.length,
      corrSnap.slotLineageMediaIds.filter((m) => !baselineMediaIds.has(m)).length,
      corrSnap.slotLineageSrcs.filter((s) => !baselineSrcs.has(s)).length,
    )
    const attemptPercent =
      slotPercents.length > 0
        ? Math.min(...slotPercents.filter((p) => Number.isFinite(p)))
        : null

    let stage = 'idle'
    if (busy || hasIncompletePercent) stage = 'generating'
    else if (newSceneCount > 0 || completedEvidenceCount > 0) stage = 'receiving_image'
    else if (detectLoadingState().isLoading) stage = 'preparing'

    return {
      ok: true,
      busy,
      domBusy,
      hasIncompletePercent,
      stage,
      attemptPercent: Number.isFinite(attemptPercent) ? attemptPercent : null,
      slotPercents: slotPercents.length > 0 ? slotPercents.slice(0, 8) : null,
      generatingCardCount,
      trackedGeneratingSlotCount,
      completedEvidenceCount,
      evidenceCountAbsolute: evidenceLabels.length,
      baselineEvidenceCount,
      newSceneCount,
      freshSceneSrcs: freshSlice.map((item) => item.src),
      freshSceneMediaIds: freshSlice.map((item) => item.mediaId).filter(Boolean),
      // Apenas identidades correlacionadas positivamente (RPC ou linhagem de slot de progresso):
      correlatedSrcs: correlatedSrcs.slice(0, 24),
      correlatedMediaIds: correlatedMediaIds.slice(0, 24),
      rpcWorkflowIds: corrSnap.rpcWorkflowIds.slice(0, 8),
      rpcMediaIds: corrSnap.rpcMediaIds.slice(0, 24),
      rpcSrcs: corrSnap.rpcSrcs.slice(0, 24),
      slotLineageMediaIds: corrSnap.slotLineageMediaIds.slice(0, 24),
      slotLineageSrcs: corrSnap.slotLineageSrcs.slice(0, 24),
      trackedSlotKeys: corrSnap.trackedSlotKeys.slice(0, 16),
      sawAcceptedProgress: corrSnap.sawAcceptedProgress,
      originProofByKey: corrSnap.originProofByKey,
      rpcStats: corrSnap.rpcStats,
      sceneCount,
      evidenceLabels: evidenceLabels.slice(0, 12),
      percentSamples: percentHits.slice(0, 12),
      labelsSample: labels
        .filter((label) => /\d+\s*%|generating|gerando|criar imagens/i.test(String(label || '')))
        .slice(0, 12),
      observedAt: new Date().toISOString(),
      sensorVersion: globalThis.__ATLAS_FLOW_V1_SENSOR__.version,
    }
  }

  /**
   * Espera a geração assentar: sai de “busy” (incluindo 0%..99% em cards!) e estabiliza cenas.
   */
  async function waitForGenerationSettle(options) {
    const timeoutMs =
      typeof options?.timeoutMs === 'number' && options.timeoutMs > 0 ? options.timeoutMs : 180_000
    const minSceneCount =
      typeof options?.minSceneCount === 'number' && options.minSceneCount > 0
        ? options.minSceneCount
        : 1
    const settleAttemptId = options?.attemptId || null
    const started = Date.now()
    let lastScene = countLargeSceneImages()
    let stableSince = Date.now()
    let sawBusy = false
    let lastBusy = sampleGenerationProgress({ attemptId: settleAttemptId }).busy

    while (Date.now() - started < timeoutMs) {
      await waitForDomTick(800, null)
      const prog = sampleGenerationProgress({ attemptId: settleAttemptId })
      const busy = prog.busy === true
      const scene = Math.max(countLargeSceneImages(), prog.newSceneCount || 0)
      if (busy) sawBusy = true
      if (scene !== lastScene) {
        lastScene = scene
        stableSince = Date.now()
      }
      lastBusy = busy
      const stableMs = Date.now() - stableSince
      if (
        !busy &&
        scene >= minSceneCount &&
        stableMs >= (sawBusy ? 2_000 : 3_500) &&
        Date.now() - started >= 2_500
      ) {
        return {
          ok: true,
          settled: true,
          sawBusy,
          sceneCount: scene,
          waitMs: Date.now() - started,
          busy: false,
        }
      }
    }
    return {
      ok: lastScene >= minSceneCount && !lastBusy,
      settled: false,
      sawBusy,
      sceneCount: lastScene,
      waitMs: Date.now() - started,
      busy: lastBusy,
      error: lastBusy ? 'GENERATION_STILL_BUSY' : 'GENERATION_SETTLE_TIMEOUT',
    }
  }

  function buildObserveHit({
    certainty,
    note,
    baselineMediaLabels,
    baselineSceneCount,
    evidenceLabels,
    unknownEvidence,
    batchControls,
    sceneCount,
    sceneDelta,
    busy,
    started,
    exit,
    appearedDuringWait,
  }) {
    return {
      ok: true,
      step: 'generation_result_observed',
      certainty,
      baseline: {
        mediaLabels: baselineMediaLabels,
        sceneCount: baselineSceneCount,
      },
      result: {
        evidenceLabels: evidenceLabels.slice(0, 16),
        newMediaLabels: unknownEvidence.slice(0, 12),
        unknownNewLabels: unknownEvidence.slice(0, 12),
        batchControls: batchControls.slice(0, 8),
        sceneCount,
        sceneDelta,
        busy,
        appearedDuringWait: Boolean(appearedDuringWait),
      },
      durationMs: Date.now() - started,
      observation: buildObservation(),
      exit,
      sensorVersion: globalThis.__ATLAS_FLOW_V1_SENSOR__.version,
      realFlowValidated: false,
      note,
    }
  }

  /**
   * Observa pós-gerar: procura mídia nova na linha/timeline.
   * Aceita presença já na página (botão Observar depois do gerar) — não só delta durante a espera.
   * Não marca realFlowValidated — falta prova de bytes.
   */
  async function observeGenerationResult(expectedFlowProjectId, options) {
    const timeoutMs =
      typeof options?.timeoutMs === 'number' && options.timeoutMs > 0
        ? options.timeoutMs
        : 90_000
    const knownStems = Array.isArray(options?.knownStems)
      ? options.knownStems.map((s) => String(s || '').toLowerCase()).filter(Boolean)
      : []

    const exit = await exitAssetEditIfNeeded(expectedFlowProjectId)
    const context = assertProjectContext(expectedFlowProjectId)
    if (!context.ok) {
      return {
        ok: false,
        step: 'observe_context',
        error: context.error,
        context,
        exit,
        realFlowValidated: false,
      }
    }

    const started = Date.now()
    const baselineLabels = collectAccessibleLabels()
    const baselineMediaLabels = listMediaLikeLabels(baselineLabels)
    const baselineSceneCount = countLargeSceneImages()

    const evaluate = (labels, appearedDuringWait) => {
      const evidenceLabels = listGenerationEvidenceLabels(labels)
      const unknownEvidence = evidenceLabels.filter((label) => !isKnownMediaLabel(label, knownStems))
      const batchControls = listGenerationBatchControls(labels)
      const sceneCount = countLargeSceneImages()
      const busy = detectGenerationBusy(labels)
      const sceneDelta = sceneCount > baselineSceneCount
      return {
        labels,
        evidenceLabels,
        unknownEvidence,
        batchControls,
        sceneCount,
        busy,
        sceneDelta,
        appearedDuringWait,
      }
    }

    let last = evaluate(baselineLabels, false)

    // Pós-hoc: tiles/títulos já na página ao clicar Observar.
    if (last.unknownEvidence.length > 0) {
      return buildObserveHit({
        certainty: 'observed_generation_tile_present',
        note: 'Tile/título de geração já presente (≠ refs conhecidas). Marco ainda NÃO VALIDADO (falta bytes).',
        baselineMediaLabels,
        baselineSceneCount,
        evidenceLabels: last.evidenceLabels,
        unknownEvidence: last.unknownEvidence,
        batchControls: last.batchControls,
        sceneCount: last.sceneCount,
        sceneDelta: last.sceneDelta,
        busy: last.busy,
        started,
        exit,
        appearedDuringWait: false,
      })
    }
    if (last.batchControls.length >= 2 && !last.busy) {
      return buildObserveHit({
        certainty: 'observed_generation_batch_ui',
        note: 'UI de batch pós-gerar presente (Reuse/Download batch). Confirme tiles; marco NÃO VALIDADO (falta bytes).',
        baselineMediaLabels,
        baselineSceneCount,
        evidenceLabels: last.evidenceLabels,
        unknownEvidence: last.unknownEvidence,
        batchControls: last.batchControls,
        sceneCount: last.sceneCount,
        sceneDelta: last.sceneDelta,
        busy: last.busy,
        started,
        exit,
        appearedDuringWait: false,
      })
    }

    while (Date.now() - started < timeoutMs) {
      await waitForDomTick(1000, null)
      last = evaluate(collectAccessibleLabels(), true)

      if (last.unknownEvidence.length > 0) {
        return buildObserveHit({
          certainty: 'observed_new_media_label',
          note: 'Label/tile de geração observada durante a espera. Marco ainda NÃO VALIDADO (falta bytes).',
          baselineMediaLabels,
          baselineSceneCount,
          evidenceLabels: last.evidenceLabels,
          unknownEvidence: last.unknownEvidence,
          batchControls: last.batchControls,
          sceneCount: last.sceneCount,
          sceneDelta: last.sceneDelta,
          busy: last.busy,
          started,
          exit,
          appearedDuringWait: true,
        })
      }
      if (last.batchControls.length >= 2 && !last.busy) {
        return buildObserveHit({
          certainty: 'observed_generation_batch_ui',
          note: 'UI de batch pós-gerar durante a espera. Marco ainda NÃO VALIDADO (falta bytes).',
          baselineMediaLabels,
          baselineSceneCount,
          evidenceLabels: last.evidenceLabels,
          unknownEvidence: last.unknownEvidence,
          batchControls: last.batchControls,
          sceneCount: last.sceneCount,
          sceneDelta: last.sceneDelta,
          busy: last.busy,
          started,
          exit,
          appearedDuringWait: true,
        })
      }
      if (
        last.sceneDelta &&
        last.sceneCount >= baselineSceneCount + 1 &&
        !last.busy &&
        Date.now() - started > 5_000
      ) {
        return buildObserveHit({
          certainty: 'observed_scene_delta_weak',
          note: 'Só delta de cena (fraco, sem título de tile). Confirme visualmente; marco NÃO VALIDADO.',
          baselineMediaLabels,
          baselineSceneCount,
          evidenceLabels: last.evidenceLabels,
          unknownEvidence: [],
          batchControls: last.batchControls,
          sceneCount: last.sceneCount,
          sceneDelta: last.sceneDelta,
          busy: last.busy,
          started,
          exit,
          appearedDuringWait: true,
        })
      }
    }

    return {
      ok: false,
      step: 'generation_result_timeout',
      error: 'GENERATION_RESULT_NOT_OBSERVED',
      certainty: 'not_observed',
      baseline: {
        mediaLabels: baselineMediaLabels,
        sceneCount: baselineSceneCount,
      },
      last,
      durationMs: Date.now() - started,
      observation: buildObservation(),
      exit,
      sensorVersion: globalThis.__ATLAS_FLOW_V1_SENSOR__.version,
      realFlowValidated: false,
      note: 'Timeout sem tile/label de mídia nova. Clique em gerar ≠ resultado na linha.',
    }
  }

  function uint8ArrayToBase64(bytes) {
    const chunk = 0x8000
    let binary = ''
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    return btoa(binary)
  }

  function guessExtFromMime(mime) {
    const m = String(mime || '').toLowerCase()
    if (m.includes('png')) return 'png'
    if (m.includes('webp')) return 'webp'
    if (m.includes('gif')) return 'gif'
    if (m.includes('jpeg') || m.includes('jpg')) return 'jpg'
    return 'bin'
  }

  /** PT/EN — Flow frequentemente rotula tiles em inglês. */
  const PROMPT_SCENE_ALIASES = {
    navio: ['navio', 'ship', 'boat', 'vessel'],
    mar: ['mar', 'sea', 'ocean'],
    luxoso: ['luxoso', 'luxury', 'luxurious'],
    gospel: ['gospel'],
    praia: ['praia', 'beach', 'shore'],
    mata: ['mata', 'woods', 'forest', 'woodland'],
    floresta: ['floresta', 'forest', 'woods'],
    cantando: ['cantando', 'singing', 'singer', 'performing'],
    lipsync: ['lipsync', 'lip-sync', 'lip sync'],
  }

  function distinctivePromptTokens(promptText) {
    const stop = new Set([
      'cantor',
      'singer',
      'no',
      'na',
      'do',
      'da',
      'de',
      'em',
      'um',
      'uma',
      'the',
      'and',
      'on',
      'in',
      'a',
      'foco',
      'focus',
      'meio',
      'para',
      'com',
    ])
    return String(promptText || '')
      .toLowerCase()
      .replace(/[\[\].,;:!?]/g, ' ')
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3 && !stop.has(t))
  }

  function expandSceneNeedles(promptText) {
    const tokens = distinctivePromptTokens(promptText)
    const needles = new Set()
    for (const token of tokens) {
      needles.add(token)
      const aliases = PROMPT_SCENE_ALIASES[token]
      if (aliases) for (const a of aliases) needles.add(a)
    }
    return [...needles]
  }

  /**
   * Evidência de prompt na página: substring exata OU sobreposição bilingue de cena.
   * Não usa posição no grid.
   */
  function matchPromptEvidenceOnPage(promptFingerprint, labels) {
    const fingerprint = String(promptFingerprint || '').trim()
    if (!fingerprint) {
      return { required: false, matched: true, label: null, mode: 'not_required', needles: [] }
    }
    const needleExact = fingerprint.slice(0, 80).toLowerCase()
    const exactHit = (labels || []).find((label) =>
      String(label || '')
        .toLowerCase()
        .includes(needleExact),
    )
    if (exactHit) {
      return {
        required: true,
        matched: true,
        label: exactHit,
        mode: 'exact_substr',
        needles: [needleExact],
        fingerprint: fingerprint.slice(0, 120),
      }
    }
    const needles = expandSceneNeedles(fingerprint)
    let best = null
    let bestScore = 0
    for (const label of labels || []) {
      const low = String(label || '').toLowerCase()
      if (!low || low.length < 8) continue
      const score = needles.filter((n) => low.includes(n)).length
      if (score > bestScore) {
        bestScore = score
        best = label
      }
    }
    // Exige ≥2 tokens de cena (ex.: gospel+ship) para não aceitar só "singer".
    if (best && bestScore >= 2) {
      return {
        required: true,
        matched: true,
        label: best,
        mode: 'scene_token_overlap',
        score: bestScore,
        needles,
        fingerprint: fingerprint.slice(0, 120),
      }
    }
    return {
      required: true,
      matched: false,
      label: null,
      mode: 'unmatched',
      score: bestScore,
      needles,
      fingerprint: fingerprint.slice(0, 120),
    }
  }

  function scoreImgAgainstScene(item, needles) {
    if (!needles.length) return 0
    const hay = `${item.alt || ''} ${item.src || ''}`.toLowerCase()
    return needles.filter((n) => hay.includes(n)).length
  }

  /**
   * Lista candidatos visíveis na página do Flow para seleção explícita do usuário
   * quando a correlação automática não puder ser reconstruída, SEM disparar geração
   * e SEM vincular automaticamente.
   */
  async function listRecoveryCandidatesOnce(expectedFlowProjectId, options = {}) {
    await exitAssetEditIfNeeded(expectedFlowProjectId)
    await dismissAssetsPanelIfOpen()
    await waitForDomTick(250, null)
    const context = assertProjectContext(expectedFlowProjectId)
    if (!context.ok) {
      return { ok: false, error: context.error, candidates: [] }
    }
    const knownStems = Array.isArray(options?.knownStems)
      ? options.knownStems.map((s) => String(s || '').toLowerCase()).filter(Boolean)
      : []
    const excludeSrcs = new Set(
      (Array.isArray(options?.excludeSrcs) ? options.excludeSrcs : []).map((s) =>
        normalizeImageSrc(s),
      ),
    )
    const excludeMediaIds = new Set(
      (Array.isArray(options?.excludeMediaIds) ? options.excludeMediaIds : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    )
    const visible = collectVisibleResultCandidates(expectedFlowProjectId)
    const candidates = []
    for (const item of visible) {
      if (item.width < 140 || item.height < 140) continue
      if (item.naturalWidth > 0 && item.naturalWidth < 400) continue
      if (item.naturalHeight > 0 && item.naturalHeight < 260) continue
      const hay = `${item.alt} ${item.rawSrc}`.toLowerCase()
      if (/atlas-ref-[ab]\.png|\/atlas-ref-[ab]/i.test(hay)) continue
      if (
        knownStems.some((stem) => {
          const s = stem.replace(/[^a-z0-9_-]/g, '')
          return (
            Boolean(s) &&
            (hay.includes(`${s}.png`) ||
              hay.includes(`${s}.jpg`) ||
              hay.includes(`${s}.jpeg`) ||
              hay.includes(`${s}.webp`))
          )
        })
      ) {
        continue
      }
      candidates.push({
        candidateKey: item.candidateKey,
        flowMediaId: item.mediaId || null,
        srcKey: item.srcKey || null,
        src: item.rawSrc,
        alt: item.alt || null,
        width: item.naturalWidth || item.width,
        height: item.naturalHeight || item.height,
        inBaseline:
          (item.srcKey ? excludeSrcs.has(item.srcKey) : false) ||
          (item.mediaId ? excludeMediaIds.has(item.mediaId) : false),
      })
    }
    return {
      ok: true,
      candidates: candidates.slice(0, 24),
      observedAt: new Date().toISOString(),
      sensorVersion: globalThis.__ATLAS_FLOW_V1_SENSOR__.version,
    }
  }

  /**
   * Lê bytes de imgs grandes na linha (resultado gerado), exclui refs conhecidas.
   * Exige origem positiva verificada (RPC ou linhagem de slot) OU seleção explícita do usuário.
   */
  async function captureGenerationBytesOnce(expectedFlowProjectId, options) {
    const knownStems = Array.isArray(options?.knownStems)
      ? options.knownStems.map((s) => String(s || '').toLowerCase()).filter(Boolean)
      : []
    const maxCandidates =
      typeof options?.maxCandidates === 'number' && options.maxCandidates > 0
        ? Math.min(options.maxCandidates, 6)
        : 4
    const promptFingerprint =
      typeof options?.promptFingerprint === 'string' ? options.promptFingerprint.trim() : ''
    const excludeSrcs = new Set(
      (Array.isArray(options?.excludeSrcs) ? options.excludeSrcs : []).map((s) =>
        normalizeImageSrc(s),
      ),
    )
    const excludeShas = new Set(
      (Array.isArray(options?.excludeShas) ? options.excludeShas : [])
        .map((s) => String(s || '').toLowerCase())
        .filter((s) => s.length >= 16),
    )
    const excludeMediaIds = new Set(
      (Array.isArray(options?.excludeMediaIds) ? options.excludeMediaIds : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    )
    // Mescla allowlist enviada pelo SW com a correlação viva observada no sensor desta tentativa
    const corrSnap = getCorrelationSnapshot(options?.attemptId || null)
    const sameAttemptInSensor =
      options?.attemptId &&
      corrSnap.attemptId &&
      String(options.attemptId) === String(corrSnap.attemptId)
    const allowSrcs = new Set(
      [
        ...(Array.isArray(options?.allowSrcs) ? options.allowSrcs : []),
        ...(sameAttemptInSensor ? corrSnap.correlatedSrcs : []),
      ]
        .map((s) => normalizeImageSrc(s))
        .filter(Boolean),
    )
    const allowMediaIds = new Set(
      [
        ...(Array.isArray(options?.allowMediaIds) ? options.allowMediaIds : []),
        ...(sameAttemptInSensor ? corrSnap.correlatedMediaIds : []),
      ]
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    )
    const explicitSelectionKeys = new Set(
      (Array.isArray(options?.explicitSelectionKeys) ? options.explicitSelectionKeys : [])
        .map((k) => String(k || '').trim())
        .filter(Boolean),
    )
    const isExplicitSelection = explicitSelectionKeys.size > 0
    const originProofByKey = {
      ...(sameAttemptInSensor ? corrSnap.originProofByKey : {}),
      ...(options?.originProofByKey && typeof options.originProofByKey === 'object'
        ? options.originProofByKey
        : {}),
    }
    const requireAllowlist = !isExplicitSelection && options?.requirePositiveOrigin === true

    const exit = await exitAssetEditIfNeeded(expectedFlowProjectId)
    await dismissAssetsPanelIfOpen()
    const context = assertProjectContext(expectedFlowProjectId)
    if (!context.ok) {
      return {
        ok: false,
        step: 'capture_context',
        error: context.error,
        context,
        exit,
        bytesCaptured: false,
        realFlowValidated: false,
      }
    }

    const skipSettle = options?.skipSettle === true || isExplicitSelection
    const liveProgress = sampleGenerationProgress({
      attemptId: options?.attemptId || null,
      excludeSrcs: Array.from(excludeSrcs),
      excludeMediaIds: Array.from(excludeMediaIds),
    })
    // Nunca capturar bytes enquanto há cards em 0%..99% na captura automática!
    if (!isExplicitSelection && skipSettle && liveProgress.busy) {
      return {
        ok: false,
        step: 'capture_still_generating',
        error: 'GENERATION_STILL_BUSY',
        settle: { ok: false, settled: false, busy: true, skipped: true },
        exit,
        bytesCaptured: false,
        correlationUncertain: false,
        realFlowValidated: false,
        sensorVersion: globalThis.__ATLAS_FLOW_V1_SENSOR__.version,
        note: 'Slots ainda em progresso (<100%). Aguardando conclusão real antes de capturar bytes.',
      }
    }

    const settle = skipSettle
      ? {
          ok: true,
          settled: false,
          sawBusy: liveProgress.busy,
          sceneCount: countLargeSceneImages(),
          waitMs: 0,
          busy: liveProgress.busy,
          skipped: true,
        }
      : await waitForGenerationSettle({
          attemptId: options?.attemptId || null,
          timeoutMs:
            typeof options?.settleTimeoutMs === 'number' ? options.settleTimeoutMs : 120_000,
          minSceneCount: Math.max(1, Math.min(maxCandidates, 2)),
        })

    // Re-varre o tracker após o settle para pegar imagens recém-materializadas nos slots!
    scanCorrelationTrackerDom(options?.attemptId || null)
    if (sameAttemptInSensor) {
      const afterSettleSnap = getCorrelationSnapshot(options?.attemptId || null)
      for (const s of afterSettleSnap.correlatedSrcs) {
        const ns = normalizeImageSrc(s)
        if (ns) allowSrcs.add(ns)
      }
      for (const m of afterSettleSnap.correlatedMediaIds) {
        if (m) allowMediaIds.add(m)
      }
      Object.assign(originProofByKey, afterSettleSnap.originProofByKey)
    }

    const observation = buildObservation()
    const labels = observation.labelsSample || []
    const promptEvidence = matchPromptEvidenceOnPage(promptFingerprint, labels)
    const sceneNeedles = promptEvidence.needles || expandSceneNeedles(promptFingerprint)

    const domImgs = Array.from(document.querySelectorAll('img'))
      .map((img) => {
        const rect = img.getBoundingClientRect()
        const src = String(img.currentSrc || img.src || '')
        const alt = String(img.alt || img.getAttribute('aria-label') || '')
        const naturalWidth = img.naturalWidth || 0
        const naturalHeight = img.naturalHeight || 0
        const srcKey = normalizeImageSrc(src)
        const mediaId = resolveElementFlowMediaId(img, src, expectedFlowProjectId)
        const candidateKey = mediaId ? `media:${mediaId}` : `src:${srcKey || src}`
        const sceneScore = scoreImgAgainstScene({ alt, src }, sceneNeedles)
        const inExplicit =
          isExplicitSelection &&
          (explicitSelectionKeys.has('*') ||
            explicitSelectionKeys.has(candidateKey) ||
            (mediaId && explicitSelectionKeys.has(mediaId)) ||
            (srcKey && explicitSelectionKeys.has(srcKey)) ||
            explicitSelectionKeys.has(src))
        const inAllowlist =
          (mediaId && allowMediaIds.has(mediaId)) || (srcKey && allowSrcs.has(srcKey))
        const originProof = inExplicit
          ? 'explicit_user_selection'
          : (mediaId && originProofByKey[`media:${mediaId}`]) ||
            (srcKey && originProofByKey[`src:${srcKey}`]) ||
            (inAllowlist ? 'tracked_progress_slot' : 'post_baseline_scene')
        return {
          img,
          src,
          srcKey,
          mediaId,
          candidateKey,
          alt,
          top: rect.top,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          naturalWidth,
          naturalHeight,
          area: Math.max(rect.width, 0) * Math.max(rect.height, 0),
          pixelArea: Math.max(naturalWidth, 0) * Math.max(naturalHeight, 0),
          isNew:
            (srcKey ? !excludeSrcs.has(srcKey) : true) &&
            (mediaId ? !excludeMediaIds.has(mediaId) : true),
          inAllowlist,
          inExplicit,
          originProof,
          sceneScore,
        }
      })
      .filter((item) => {
        if (isExcludedAssetTag(item.img.tagName)) return false
        if (!item.src || item.src.startsWith('data:image/svg')) return false
        if (isExplicitSelection && !explicitSelectionKeys.has('*')) {
          return item.inExplicit
        }
        // Exclui tiles que já existiam antes desta geração.
        if (excludeSrcs.size > 0 && item.srcKey && excludeSrcs.has(item.srcKey)) return false
        if (item.mediaId && excludeMediaIds.has(item.mediaId)) return false
        if (!item.inAllowlist) {
          if (item.width < 120 && item.naturalWidth < 480) return false
          if (item.height < 120 && item.naturalHeight < 320) return false
        }
        const hay = `${item.alt} ${item.src}`.toLowerCase()
        if (
          knownStems.some((stem) => {
            const s = String(stem || '')
              .toLowerCase()
              .replace(/[^a-z0-9_-]/g, '')
            if (!s) return false
            return (
              hay.includes(`${s}.png`) ||
              hay.includes(`${s}.jpg`) ||
              hay.includes(`${s}.jpeg`) ||
              hay.includes(`${s}.webp`)
            )
          })
        ) {
          return false
        }
        if (/atlas-ref-[ab]\.png|\/atlas-ref-[ab]/i.test(hay)) return false
        return true
      })

    // Inclui também URLs/mediaIds correlacionados na allowlist que eventualmente tenham saído do DOM
    // por virtualização do grid ou abertura de painel.
    const seenCandidateKeys = new Set(
      domImgs.flatMap((i) => [i.srcKey, i.mediaId ? `media:${i.mediaId}` : '']).filter(Boolean),
    )
    const directCandidates = []
    for (const mediaId of allowMediaIds) {
      if (!mediaId || excludeMediaIds.has(mediaId)) continue
      if (seenCandidateKeys.has(`media:${mediaId}`)) continue
      const directUrl = `https://flow-content.google/image/${mediaId}`
      const srcKey = normalizeImageSrc(directUrl)
      if (excludeSrcs.has(srcKey)) continue
      seenCandidateKeys.add(`media:${mediaId}`)
      seenCandidateKeys.add(srcKey)
      directCandidates.push({
        img: null,
        src: directUrl,
        srcKey,
        mediaId,
        candidateKey: `media:${mediaId}`,
        alt: '',
        top: 0,
        width: 1376,
        height: 768,
        naturalWidth: 1376,
        naturalHeight: 768,
        area: 1376 * 768,
        pixelArea: 1376 * 768,
        isNew: true,
        inAllowlist: true,
        inExplicit: isExplicitSelection,
        originProof: originProofByKey[`media:${mediaId}`] || 'tracked_progress_slot',
        sceneScore: 10,
      })
    }
    for (const rawAllowSrc of allowSrcs) {
      if (!rawAllowSrc || excludeSrcs.has(rawAllowSrc)) continue
      if (allowSrcs.size > 6 && /googleusercontent\.com\/asb\//i.test(rawAllowSrc)) continue
      const srcKey = normalizeImageSrc(rawAllowSrc)
      const mediaId = extractMediaIdFromSrcUrl(rawAllowSrc, expectedFlowProjectId)
      if (mediaId && excludeMediaIds.has(mediaId)) continue
      if (seenCandidateKeys.has(srcKey) || (mediaId && seenCandidateKeys.has(`media:${mediaId}`))) {
        continue
      }
      seenCandidateKeys.add(srcKey)
      if (mediaId) seenCandidateKeys.add(`media:${mediaId}`)
      directCandidates.push({
        img: null,
        src: rawAllowSrc,
        srcKey,
        mediaId: mediaId || null,
        candidateKey: mediaId ? `media:${mediaId}` : `src:${srcKey}`,
        alt: '',
        top: 0,
        width: 1376,
        height: 768,
        naturalWidth: 1376,
        naturalHeight: 768,
        area: 1376 * 768,
        pixelArea: 1376 * 768,
        isNew: true,
        inAllowlist: true,
        inExplicit: isExplicitSelection,
        originProof: originProofByKey[`src:${srcKey}`] || 'tracked_progress_slot',
        sceneScore: 8,
      })
    }

    const imgs = [...domImgs, ...directCandidates].sort(
      (a, b) =>
        Number(b.inExplicit) - Number(a.inExplicit) ||
        Number(b.inAllowlist) - Number(a.inAllowlist) ||
        Number(/flow-content\.google/i.test(b.src)) - Number(/flow-content\.google/i.test(a.src)) ||
        Number(b.isNew) - Number(a.isNew) ||
        b.sceneScore - a.sceneScore ||
        b.pixelArea - a.pixelArea ||
        b.area - a.area,
    )

    const attempts = []
    const captured = []

    for (const item of imgs.slice(0, 12)) {
      if (captured.length >= maxCandidates) break
      let bytes = null
      let mimeType = 'application/octet-stream'
      let method = null
      let error = null

      try {
        const res = await fetch(item.src, { credentials: 'include', cache: 'no-cache' })
        if (!res.ok) throw new Error(`HTTP_${res.status}`)
        const buf = new Uint8Array(await res.arrayBuffer())
        if (buf.length < 8_000) throw new Error('TOO_SMALL_PREVIEW')
        bytes = buf
        mimeType = res.headers.get('content-type') || mimeType
        method = 'fetch_src'
      } catch (fetchError) {
        error = fetchError instanceof Error ? fetchError.message : String(fetchError)
        // Fallback: SW com host_permissions (flow-content.google etc.) — evita canvas tainted.
        try {
          const sw = await chrome.runtime.sendMessage({
            type: 'atlas-flow-v1.fetchMediaBytes',
            payload: { url: item.src },
          })
          if (sw && sw.ok === true && typeof sw.base64 === 'string' && sw.base64) {
            const bin = atob(sw.base64)
            const buf = new Uint8Array(bin.length)
            for (let i = 0; i < bin.length; i += 1) buf[i] = bin.charCodeAt(i)
            if (buf.length < 8_000) throw new Error('SW_FETCH_TOO_SMALL')
            bytes = buf
            mimeType = typeof sw.mimeType === 'string' ? sw.mimeType : mimeType
            method = 'sw_fetch'
            error = null
          } else {
            throw new Error(String(sw?.error || 'SW_FETCH_FAILED'))
          }
        } catch (swError) {
          error = `${error}|sw:${swError instanceof Error ? swError.message : String(swError)}`
        }
      }
      if (!bytes && item.img) {
        try {
          const canvas = document.createElement('canvas')
          const w = item.img.naturalWidth || item.width
          const h = item.img.naturalHeight || item.height
          if (w < 480 || h < 320) throw new Error('CANVAS_TOO_SMALL')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          if (!ctx) throw new Error('NO_2D')
          ctx.drawImage(item.img, 0, 0)
          const blob = await new Promise((resolve, reject) => {
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error('TOBLOB_NULL'))),
              'image/png',
            )
          })
          bytes = new Uint8Array(await blob.arrayBuffer())
          if (bytes.length < 8_000) throw new Error('CANVAS_PREVIEW_TOO_SMALL')
          mimeType = 'image/png'
          method = 'canvas_png'
          error = null
        } catch (canvasError) {
          error = `${error || 'fetch_failed'}|canvas:${
            canvasError instanceof Error ? canvasError.message : String(canvasError)
          }`
        }
      }

      const attempt = {
        srcHost: (() => {
          try {
            return new URL(item.src, location.href).host
          } catch {
            return null
          }
        })(),
        width: item.width,
        height: item.height,
        naturalWidth: item.naturalWidth,
        naturalHeight: item.naturalHeight,
        method,
        error,
        byteSize: bytes?.length || 0,
      }
      attempts.push(attempt)

      if (!bytes || bytes.length < 8_000) continue

      const sha256 = await sha256HexOfBytes(bytes)
      if (captured.some((c) => c.sha256 === sha256)) continue
      // Identidade estável: SHA já conhecido no projeto ≠ output desta tentativa.
      if (excludeShas.has(String(sha256).toLowerCase())) {
        attempts.push({
          ...attempt,
          error: `${attempt.error || ''}|EXCLUDED_KNOWN_SHA:${String(sha256).slice(0, 12)}`.replace(
            /^\|/,
            '',
          ),
          excludedKnownSha: true,
        })
        continue
      }

      captured.push({
        sha256,
        byteSize: bytes.length,
        mimeType,
        method,
        width: item.naturalWidth || item.width,
        height: item.naturalHeight || item.height,
        srcHost: attempt.srcHost,
        srcKey: item.srcKey || null,
        candidateKey: item.candidateKey || null,
        flowMediaId: item.mediaId || null,
        originProof: item.originProof || (isExplicitSelection ? 'explicit_user_selection' : 'tracked_progress_slot'),
        automaticCorrelation: !isExplicitSelection,
        displayName: `flow-result-${captured.length + 1}.${guessExtFromMime(mimeType)}`,
        base64: uint8ArrayToBase64(bytes),
      })
    }

    if (captured.length === 0) {
      return {
        ok: false,
        step: 'capture_generation_bytes',
        error: settle.busy
          ? 'GENERATION_STILL_BUSY'
          : excludeSrcs.size > 0
            ? 'NEW_GENERATION_BYTES_UNAVAILABLE'
            : 'GENERATION_BYTES_UNAVAILABLE',
        attempts: attempts.slice(0, 8),
        candidateCount: imgs.length,
        excludedBaselineCount: excludeSrcs.size,
        excludedMediaIdCount: excludeMediaIds.size,
        excludedKnownShaCount: excludeShas.size,
        allowSrcCount: allowSrcs.size,
        allowMediaIdCount: allowMediaIds.size,
        settle,
        promptEvidence,
        exit,
        observation,
        bytesCaptured: false,
        correlationUncertain: false,
        realFlowValidated: false,
        sensorVersion: globalThis.__ATLAS_FLOW_V1_SENSOR__.version,
        note: 'Sem bytes de resultado no content script; SW tentará fallback via debugger/host.',
      }
    }

    if (options?.attemptId && !skipSettle && captured.length >= maxCandidates) {
      correlationSessions.delete(String(options.attemptId))
    }

    return {
      ok: true,
      step: 'generation_bytes_captured',
      files: captured.map(({ base64: _b, ...meta }) => meta),
      _filesWithBytes: captured,
      attempts: attempts.slice(0, 8),
      candidateCount: imgs.length,
      excludedBaselineCount: excludeSrcs.size,
      excludedMediaIdCount: excludeMediaIds.size,
      excludedKnownShaCount: excludeShas.size,
      allowSrcCount: allowSrcs.size,
      allowMediaIdCount: allowMediaIds.size,
      settle,
      promptEvidence,
      exit,
      observation,
      bytesCaptured: true,
      correlationUncertain: false,
      realFlowValidated: false,
      sensorVersion: globalThis.__ATLAS_FLOW_V1_SENSOR__.version,
      note: requireAllowlist
        ? 'Bytes só de candidatos na allowlist pós-aceite. Marco só após staging.'
        : 'Bytes com SHA novo (baseline src + SHA do projeto excluídos). Marco só após staging.',
    }
  }

  function flowLabelKey(label) {
    return String(label || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function usableControlsIn(root, predicate) {
    const nodes = deepQueryAll(
      'button, [role="button"], [role="tab"], [role="option"], [role="menuitem"], [role="radio"]',
      root || document,
    )
    const matches = []
    for (const el of nodes) {
      if (!isElementUsable(el)) continue
      const label = controlLabel(el)
      if (!label || label.length > 80) continue
      if (!predicate(flowLabelKey(label), el)) continue
      matches.push({ el, label })
    }
    return matches
  }

  function findImageSettingsPanel() {
    const aspect = usableControlsIn(document, (label) => label === '16:9')
    for (const hit of aspect) {
      let node = hit.el
      for (let depth = 0; depth < 10 && node; depth += 1) {
        const text = flowLabelKey(node.innerText || '')
        if (
          text.includes('16:9') &&
          (text.includes('x1') ||
            text.includes('×1') ||
            text.includes('nivel de raciocinio') ||
            text.includes('reasoning') ||
            text.includes('imagem') ||
            text.includes('image') ||
            text.includes('banana')) &&
          text.length < 1400
        ) {
          return node
        }
        node = node.parentElement
      }
    }
    return null
  }

  function findSettingsDismissButton() {
    const panel = findImageSettingsPanel()
    if (!panel) return null
    const bounds = panel.getBoundingClientRect()
    const named = deepQueryAll('button, [role="button"]').find((el) => {
      if (!isShown(el)) return false
      const label = normLabel(`${accessibleName(el)} ${el.textContent || ''}`)
      return /^x$|^×$|^fechar$|^close$|fechar painel|close panel|dismiss/.test(label)
    })
    if (named) return named
    const corner = deepQueryAll('button, [role="button"]').filter((el) => {
      if (!isShown(el)) return false
      const rect = el.getBoundingClientRect()
      if (rect.width > 44 || rect.height > 44 || rect.width < 10) return false
      const inside = rect.top >= bounds.top - 24 && rect.bottom <= bounds.bottom + 24
      return inside && rect.left >= bounds.right - 88 && rect.left <= bounds.right + 28
    })
    corner.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
    return corner[0] || null
  }

  function findProjectGenerateArrow() {
    const editor = findPromptEditor()
    if (!editor) return null
    const editorRect = editor.getBoundingClientRect()
    let node = editor.parentElement
    let card = editor.parentElement
    for (let depth = 0; depth < 8 && node; depth += 1) {
      const rect = node.getBoundingClientRect()
      if (rect.width >= 280 && rect.width <= 1000 && rect.height >= editorRect.height && rect.height <= 560) {
        card = node
      }
      node = node.parentElement
    }
    const bounds = card.getBoundingClientRect()
    const buttons = deepQueryAll('button, [role="button"]', card).filter((el) => {
      if (!isShown(el)) return false
      const rect = el.getBoundingClientRect()
      if (rect.width < 24 || rect.height < 24 || rect.width > 84 || rect.height > 84) return false
      if (Math.abs(rect.width - rect.height) > 18) return false
      if (rect.left < bounds.right - 130) return false
      if (rect.top < bounds.bottom - 86) return false
      const label = normLabel(accessibleName(el))
      if (/agente|agent|nano|banana|adicionar|formatar|apagar|clear|fechar|close/.test(label)) return false
      return true
    })
    buttons.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)
    return buttons[0] || null
  }

  async function closeImageSettingsPanel() {
    if (!findImageSettingsPanel()) return { ok: true, via: 'already_closed' }
    const dismiss = findSettingsDismissButton()
    if (dismiss) {
      await trustedClickElement(dismiss, { align: 'center' })
      await waitForDomTick(280, null)
      if (!findImageSettingsPanel()) return { ok: true, via: 'dismiss' }
    }
    const escaped = await sendRuntimeMessage({
      type: 'atlas-flow-v1.trustedKey',
      payload: { key: 'Escape' },
    })
    await waitForDomTick(220, null)
    if (!findImageSettingsPanel()) return { ok: true, via: 'escape', escaped }
    const triggers = findUsableControl((label) => {
      const key = flowLabelKey(label)
      return key === 'settings trigger' || key === 'gatilho de configuracoes'
    })
    const trigger = [...triggers].sort(
      (a, b) => b.el.getBoundingClientRect().top - a.el.getBoundingClientRect().top,
    )[0]
    if (trigger) {
      await trustedClickElement(trigger.el, { align: 'center' })
      await waitForDomTick(220, null)
    }
    return {
      ok: !findImageSettingsPanel(),
      via: trigger ? 'trigger' : 'escape',
      escaped,
    }
  }

  function labelHitsCandidate(label, candidates) {
    const words = label.split(' ')
    return candidates.some((candidate) => {
      const wanted = flowLabelKey(candidate)
      if (label === wanted || words.includes(wanted)) return true
      return wanted.includes(' ') && label.includes(wanted)
    })
  }

  async function clickExactControl(root, candidates) {
    const wanted = candidates.map((item) => flowLabelKey(item))
    const hits = usableControlsIn(root, (label) => labelHitsCandidate(label, wanted)).sort(
      (a, b) => a.label.length - b.label.length,
    )
    const hit =
      hits.find((item) => labelHitsCandidate(flowLabelKey(item.label), wanted) && controlLooksSelected(item.el)) ||
      hits[0]
    if (!hit) return { ok: false, error: 'CONTROL_NOT_FOUND', wanted }
    if (controlLooksSelected(hit.el) && labelHitsCandidate(flowLabelKey(hit.label), wanted)) {
      return { ok: true, label: hit.label, via: 'already_selected' }
    }
    const click = await trustedClickElement(hit.el, { align: 'center' })
    await waitForDomTick(250, null)
    return { ok: click?.ok !== false, label: hit.label, click, via: 'click' }
  }

  /**
   * Abre o painel do compositor e aplica proporção, modelo, raciocínio e quantidade.
   * Só imagem. Falha explícita se o controle pedido não aparecer.
   */
  async function applyImageGenerationSettings(rawSettings) {
    const aspectRatio = ['16:9', '4:3', '1:1', '3:4', '9:16'].includes(rawSettings?.aspectRatio)
      ? rawSettings.aspectRatio
      : '16:9'
    const reasoningLabels =
      rawSettings?.reasoning === 'low'
        ? ['baixo', 'low']
        : rawSettings?.reasoning === 'medium'
          ? ['medio', 'medium']
          : ['alto', 'high']
    const outputs = [1, 2, 3, 4].includes(Number(rawSettings?.outputs))
      ? Number(rawSettings.outputs)
      : 3
    const modelLabel = flowLabelKey(rawSettings?.modelLabel || 'Nano Banana 2.1')
    const outputLabels = [`x${outputs}`, `×${outputs}`]

    const triggers = findUsableControl((label) => {
      const key = flowLabelKey(label)
      return key === 'settings trigger' || key === 'gatilho de configuracoes'
    })
    const trigger = [...triggers].sort(
      (a, b) => b.el.getBoundingClientRect().top - a.el.getBoundingClientRect().top,
    )[0]
    if (!trigger) {
      return { ok: false, error: 'SETTINGS_TRIGGER_NOT_FOUND', aspectRatio, outputs }
    }

    let panel = findImageSettingsPanel()
    if (!panel) {
      const opened = await trustedClickElement(trigger.el, { align: 'center' })
      const started = Date.now()
      for (let iter = 0; !panel && (iter < 4 || Date.now() - started < 3500); iter += 1) {
        await waitForDomTick(220, null)
        panel = findImageSettingsPanel()
      }
      if (!panel) {
        return {
          ok: false,
          error: 'IMAGE_SETTINGS_PANEL_NOT_FOUND',
          opened,
          aspectRatio,
          outputs,
        }
      }
    }

    const imageTab = await clickExactControl(panel, ['imagem', 'image'])
    const videoTabs = usableControlsIn(panel, (label) => labelHitsCandidate(label, ['video']))
    if (!imageTab.ok && videoTabs.some((item) => controlLooksSelected(item.el))) {
      await closeImageSettingsPanel()
      return { ok: false, error: 'IMAGE_TAB_NOT_FOUND', imageTab, aspectRatio, outputs }
    }
    const aspect = await clickExactControl(panel, [aspectRatio])
    if (!aspect.ok) {
      await closeImageSettingsPanel()
      return { ok: false, error: 'ASPECT_NOT_FOUND', imageTab, aspect, aspectRatio }
    }

    const knownModels = ['nano banana 2.1', 'nano banana 2 lite', 'nano banana pro']
    const singleModelIn = (label) => {
      const present = knownModels.filter((item) => label.includes(item))
      return present.length === 1 ? present[0] : null
    }
    const wantedModel = rawSettings?.modelLabel || 'Nano Banana 2.1'
    const openers = usableControlsIn(
      panel,
      (label) => label.includes('banana') || label.includes('imagen') || label.includes('modelo'),
    )
    const currentModel = openers.find((item) => singleModelIn(flowLabelKey(item.label)) === modelLabel)
    let model = currentModel
      ? { ok: true, via: 'already_selected', label: currentModel.label }
      : { ok: false }
    if (!currentModel) {
      const opener =
        openers.find((item) => singleModelIn(flowLabelKey(item.label))) || openers[0]
      if (!opener) {
        await closeImageSettingsPanel()
        return { ok: false, error: 'MODEL_CONTROL_NOT_FOUND', aspect, modelLabel }
      }
      await trustedClickElement(opener.el, { align: 'center' })
      await waitForDomTick(300, null)
      const option = await clickExactControl(document, [wantedModel])
      model = option
      if (!option.ok) {
        await closeImageSettingsPanel()
        return { ok: false, error: 'MODEL_OPTION_NOT_FOUND', option, modelLabel }
      }
    }

    // Nível de raciocínio pode não existir em alguns modelos; não bloquear a seleção de quantidade (x1..x4).
    const reasoning = await clickExactControl(panel, reasoningLabels)
    const count = await clickExactControl(panel, outputLabels)
    const closed = await closeImageSettingsPanel()
    if (!count.ok) {
      return { ok: false, error: 'OUTPUT_COUNT_NOT_FOUND', count, outputLabels, closed }
    }

    return {
      ok: true,
      aspectRatio,
      outputs,
      modelLabel: rawSettings?.modelLabel || 'Nano Banana 2.1',
      reasoning: rawSettings?.reasoning || 'high',
      imageTab,
      aspect,
      model,
      reasoningClick: reasoning,
      count,
      closed,
    }
  }

  /**
   * Prompt + Start generation isolados. Exige 2 ingredients já no draft.
   * Sem upload/anexo. realFlowValidated permanece false até bytes na linha.
   */
  async function promptAndGenerateOnly(expectedFlowProjectId, promptText, imageSettings) {
    if (GENERATION_SEND_PAUSED) {
      // Ainda permite verify do modo via ensureClassic; bloqueia Start no final.
      // write também fica bloqueado aqui para não reabrir Agente durante contenção.
      const verifyOnly = await verifyDirectImageComposerOnly(expectedFlowProjectId)
      return {
        ok: false,
        step: 'generation_send_paused',
        error: 'GENERATION_SEND_PAUSED',
        intent: DIRECT_IMAGE_GENERATION_INTENT,
        verifyOnly,
        didUpload: false,
        didAttach: false,
        didWritePrompt: false,
        didGenerate: false,
        realFlowValidated: false,
        note: 'Envio pausado. verifyOnly comprova (ou não) o compositor direto sem digitar/gerar.',
      }
    }

    const exit = await exitAssetEditIfNeeded(expectedFlowProjectId)
    if (exit.stillInEdit) {
      return {
        ok: false,
        step: 'exit_asset_edit',
        error: exit.error || 'STUCK_IN_ASSET_EDIT',
        exit,
        intent: DIRECT_IMAGE_GENERATION_INTENT,
        didUpload: false,
        didAttach: false,
        didWritePrompt: false,
        didGenerate: false,
        realFlowValidated: false,
      }
    }

    const context = assertProjectContext(expectedFlowProjectId)
    if (!context.ok) {
      return {
        ok: false,
        step: 'prompt_generate_context',
        error: context.error,
        context,
        exit,
        didUpload: false,
        didAttach: false,
        didWritePrompt: false,
        didGenerate: false,
        realFlowValidated: false,
      }
    }

    const chips = countPromptIngredientChips()
    const ingredientControls = countIngredientControls()
    // Aceita ≥1 ingredient no draft (seleção da linha pode ter 1 ref).
    const attachedOnPage =
      ingredientControls >= 1 ||
      chips.media >= 1 ||
      chips.ingredientButtons >= 1 ||
      /@cantor\b|\[cantor\]/i.test(typeof promptText === 'string' ? promptText : '')
    if (!attachedOnPage) {
      return {
        ok: false,
        step: 'require_attached_on_page',
        error: 'NEED_ATTACHED_ON_PAGE',
        chips,
        ingredientControls,
        exit,
        didUpload: false,
        didAttach: false,
        didWritePrompt: false,
        didGenerate: false,
        realFlowValidated: false,
        observation: buildObservation(),
        note: 'Precisa de ingredient anexado no draft da tentativa atual.',
      }
    }

    const text = (
      typeof promptText === 'string' && promptText.trim() ? promptText.trim() : ''
    ).replace(/\[cantor\]/gi, '@cantor')
    if (!text) {
      return {
        ok: false,
        step: 'prompt_text',
        error: 'PROMPT_TEXT_REQUIRED',
        chips,
        ingredientControls,
        exit,
        didUpload: false,
        didAttach: true,
        didWritePrompt: false,
        didGenerate: false,
        realFlowValidated: false,
        note: 'Texto da tentativa obrigatório; sem prompt de teste.',
      }
    }

    await dismissAssetsPanelIfOpen()
    const classicMode = await ensureClassicCreateMode()
    if (!classicMode.ok) {
      return {
        ok: false,
        step: 'classic_mode',
        error: classicMode.error || 'AGENT_MODE_ACTIVE',
        classicMode,
        chips,
        ingredientControls,
        exit,
        didUpload: false,
        didAttach: true,
        didWritePrompt: false,
        didGenerate: false,
        realFlowValidated: false,
        note: 'Agente ativo — não enviar prompt (evita vídeo/Omni). Anexar+Start generation apenas.',
      }
    }
    const promptField = findPromptEditor()
    if (promptField) await trustedClickElement(promptField, { align: 'left' })
    const promptWrite = await writePromptText(text)
    if (!promptWrite.ok) {
      return {
        ok: false,
        step: 'write_prompt',
        error: promptWrite.error || 'PROMPT_WRITE_FAILED',
        promptWrite,
        classicMode,
        chips,
        ingredientControls,
        exit,
        didUpload: false,
        didAttach: true,
        didWritePrompt: false,
        didGenerate: false,
        realFlowValidated: false,
      }
    }

    await waitForDomTick(500, null)
    // Confirma composer: preferir readBack do write (findPromptEditor pode mudar após Agente).
    const readAfterWrite = (() => {
      const live = readPromptText()
      if (live && live.includes(text.slice(0, Math.min(16, text.length)))) return live
      const fromWrite = typeof promptWrite.readBack === 'string' ? promptWrite.readBack : ''
      if (fromWrite && fromWrite.includes(text.slice(0, Math.min(16, text.length)))) return fromWrite
      return live || fromWrite || ''
    })()
    if (
      !readAfterWrite ||
      !readAfterWrite.includes(text.slice(0, Math.min(16, text.length)))
    ) {
      return {
        ok: false,
        step: 'write_prompt_verify',
        error: 'PROMPT_WRITE_MISMATCH',
        promptWrite,
        classicMode,
        promptText: readAfterWrite,
        chips,
        ingredientControls,
        exit,
        didUpload: false,
        didAttach: true,
        didWritePrompt: false,
        didGenerate: false,
        realFlowValidated: false,
        note: 'Texto não ficou no composer. Não clicar Gerar.',
      }
    }

    const imageSettingsApplied = await applyImageGenerationSettings(imageSettings)
    await closeImageSettingsPanel()
    if (detectAgentSession().active) {
      return {
        ok: false,
        step: 'classic_mode_before_generate',
        error: 'AGENT_MODE_ACTIVE',
        classicMode,
        promptWrite,
        promptText: readPromptText() || readAfterWrite,
        imageSettings: imageSettingsApplied,
        chips,
        ingredientControls,
        exit,
        didUpload: false,
        didAttach: true,
        didWritePrompt: true,
        didGenerate: false,
        realFlowValidated: false,
      }
    }

    const generate = await startGenerationOnce(expectedFlowProjectId, 12_000)
    return {
      ok: generate.ok === true,
      step: generate.ok ? 'prompt_generate_clicked' : 'prompt_generate',
      promptWrite,
      classicMode,
      promptText: readPromptText() || readAfterWrite,
      generate,
      chips,
      ingredientControls,
      exit,
      didUpload: false,
      didAttach: false,
      didWritePrompt: true,
      didGenerate: generate.ok === true,
      imageSettings: imageSettingsApplied,
      observation: buildObservation(),
      sensorVersion: globalThis.__ATLAS_FLOW_V1_SENSOR__.version,
      realFlowValidated: false,
      note: 'Prompt+gerar no modo clássico (sem Agente). Clique ≠ imagem na linha.',
    }
  }

  /**
   * Upload real (1 a 1) → evidência de conclusão → bind identity.
   * Depois attach separado. Não trata change/FileList como sucesso.
   */
  function normLabel(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function findNamedControl(pattern) {
    return deepQueryAll('button, [role="button"], [role="tab"], a').find((el) => {
      if (!isShown(el)) return false
      return pattern.test(normLabel(accessibleName(el)))
    })
  }

  function characterComposerOpen() {
    return /descreva seu personagem|describe your character|adicionar do projeto|add from project|crie e reutilize personagens|create and reuse characters/.test(
      normLabel(document.body?.innerText || ''),
    )
  }

  function characterSheetOpen() {
    return /selecionar uma voz|select a voice|criar corpo|create body|o que voce quer mudar|what do you want to change|informacoes sobre o personagem|novo personagem/.test(
      normLabel(document.body?.innerText || ''),
    )
  }

  function stillInCharacterFlow() {
    return characterComposerOpen() || characterSheetOpen()
  }

  function onCharacterPage() {
    return /\/character\/?$/.test(location.pathname) || stillInCharacterFlow()
  }

  function findCharactersNav() {
    const link = deepQueryAll('a[href]').find((el) => {
      if (!isShown(el)) return false
      const href = String(el.getAttribute('href') || el.href || '').split('?')[0]
      return /\/character\/?$/.test(href)
    })
    if (link) return link
    const rail = deepQueryAll('a, button, [role="button"]').filter((el) => {
      if (!isShown(el)) return false
      const rect = el.getBoundingClientRect()
      if (rect.left > 88 || rect.width > 72 || rect.height > 72 || rect.width < 16) return false
      return /personag|^character$|^characters$/.test(normLabel(accessibleName(el)))
    })
    rail.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
    return rail[0] || null
  }

  function singerChipVisible(name) {
    const wanted = normLabel(name)
    if (!wanted) return false
    const page = normLabel(document.body?.innerText || '')
    if (
      page.includes(wanted) &&
      /selecionar uma voz|select a voice|criar corpo|create body|informacoes sobre o personagem|informacoes sobre seu personagem/.test(
        page,
      )
    ) {
      return true
    }
    return deepQueryAll('button, [role="button"], a').some((el) => {
      if (!isShown(el)) return false
      const text = normLabel(accessibleName(el) || '')
      return text === `@${wanted}`
    })
  }

  async function openCharactersPanel() {
    if (onCharacterPage()) return { ok: true, alreadyOpen: true }
    if (pickerIsOpen()) await dismissAssetPicker()
    const button = findCharactersNav()
    if (!button) return { ok: false, error: 'CHARACTERS_NAV_MISSING' }
    const click = await trustedClickElement(button, { align: 'center' })
    const started = Date.now()
    while (Date.now() - started < 12000) {
      if (onCharacterPage()) return { ok: true, click, via: 'character_url' }
      await sleep(250)
    }
    return {
      ok: false,
      error: 'CHARACTERS_PANEL_NOT_OPEN',
      click,
      href: button.getAttribute?.('href') || null,
    }
  }

  function findDescribeField() {
    return (
      deepQueryAll('textarea, input, [contenteditable="true"]').find((el) => {
        if (!isShown(el)) return false
        const label = normLabel(
          `${el.getAttribute('placeholder') || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('data-placeholder') || ''} ${el.innerText || ''}`,
        )
        return /descreva seu personagem|describe your character/.test(label)
      }) || null
    )
  }

  function findCharacterNameField() {
    return (
      deepQueryAll('input, textarea').find((el) => {
        if (!isShown(el)) return false
        const label = normLabel(
          `${el.getAttribute('aria-label') || ''} ${el.getAttribute('placeholder') || ''}`,
        )
        if (/descreva seu personagem|describe your character|busca|search|prompt|comando/.test(label)) {
          return false
        }
        return /nome do personagem|character name|^nome$|^name$|\bnome\b|\bname\b/.test(label)
      }) || null
    )
  }

  async function insertCharacterText(field, text, pressEnter) {
    if (!field) return { ok: false, error: 'CHARACTER_FIELD_MISSING' }
    const rect = field.getBoundingClientRect()
    try {
      field.focus()
    } catch {
      /* ignore */
    }
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'atlas-flow-v1.trustedInsert',
        payload: {
          text,
          enter: pressEnter === true,
          x: Math.round(rect.left + Math.max(rect.width / 2, 8)),
          y: Math.round(rect.top + Math.max(rect.height / 2, 8)),
        },
      })
      return { ok: result?.ok !== false, result }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  function scoreProjectImage(img, wanted) {
    const rect = img.getBoundingClientRect()
    const label = normLabel(
      `${img.getAttribute('alt') || ''} ${img.getAttribute('aria-label') || ''} ${accessibleName(img.closest('button, [role="button"], a') || img)}`,
    )
    const nameHit = wanted && label.includes(wanted) ? 1000000 : 0
    return nameHit + rect.width * rect.height
  }

  function pickerIsOpen() {
    return /pesquisar recursos|search resources|nenhum recurso|no resources found|fazer upload/.test(
      normLabel(document.body?.innerText || ''),
    )
  }

  async function dismissAssetPicker() {
    if (!pickerIsOpen()) return { ok: true, alreadyClosed: true }
    const close = findNamedControl(/^fechar$|^close$|^cancelar$|^voltar$/)
    if (close) {
      await trustedClickElement(close, { align: 'center' })
      await sleep(400)
    }
    if (pickerIsOpen()) {
      try {
        await chrome.runtime.sendMessage({
          type: 'atlas-flow-v1.trustedKey',
          payload: { key: 'Escape' },
        })
      } catch {
        /* ignore */
      }
      await sleep(450)
    }
    return { ok: !pickerIsOpen() }
  }

  function assetPickerRoot() {
    return (
      deepQueryAll('[role="dialog"], [aria-modal="true"]').find((el) => {
        if (!isShown(el)) return false
        return /pesquisar recursos|search resources|adicionar midia|add media/.test(
          normLabel(el.innerText || ''),
        )
      }) || null
    )
  }

  function findPickerChoice(root, wanted) {
    const scope = root || document
    const names = (Array.isArray(wanted) ? wanted : [wanted]).map((item) => normLabel(item)).filter(Boolean)
    const candidates = deepQueryAll(
      'button, [role="option"], [role="button"], [role="listitem"], a, li',
      scope,
    ).filter((el) => {
      if (!isShown(el)) return false
      const rect = el.getBoundingClientRect()
      if (rect.width < 40 || rect.height < 24 || rect.width > 720) return false
      const text = normLabel(accessibleName(el) || el.innerText || '')
      if (!text || text.length > 80) return false
      if (/adicionar midia|fazer upload|pesquisar recursos|recentes|^imagens$|^envios$/.test(text)) return false
      return names.some((name) => text === name || text.includes(name))
    })
    if (candidates.length) {
      candidates.sort((a, b) => {
        const ta = normLabel(accessibleName(a) || a.innerText || '')
        const tb = normLabel(accessibleName(b) || b.innerText || '')
        const exactA = names.some((name) => ta === name) ? 1 : 0
        const exactB = names.some((name) => tb === name) ? 1 : 0
        if (exactA !== exactB) return exactB - exactA
        return a.getBoundingClientRect().width - b.getBoundingClientRect().width
      })
      return { el: candidates[0], label: normLabel(accessibleName(candidates[0]) || '') }
    }
    const imgs = deepQueryAll('img', scope).filter((img) => {
      if (!isShown(img)) return false
      const rect = img.getBoundingClientRect()
      return rect.width >= 48 && rect.height >= 48
    })
    if (!imgs.length) return null
    imgs.sort((a, b) => scoreProjectImage(b, names[0]) - scoreProjectImage(a, names[0]))
    return { el: imgs[0], label: 'img' }
  }

  async function chooseListedProjectImage(picked) {
    const clickable = picked.closest('button, [role="button"], [role="option"], a, label') || picked
    await trustedClickElement(clickable, { align: 'center' })
    await sleep(500)
    const confirm = findNamedControl(
      /adicionar midia|add media|^adicionar$|^usar esta$|^usar$|^selecionar$|^select$|^use$|^concluir$|^done$|^confirmar$/,
    )
    if (confirm) {
      await trustedClickElement(confirm, { align: 'center' })
      await sleep(700)
    }
    return { ok: Boolean(confirm), confirmed: Boolean(confirm) }
  }

  async function uploadFileIntoOpenPicker(fileObj, wanted) {
    const beforeImgs = new Set(deepQueryAll('img'))
    const uploadControl = findNamedControl(/fazer upload|fazer o upload|^upload\b/)
    const inputs = () => deepQueryAll('input[type="file"]').filter((el) => !el.disabled)
    let input =
      uploadControl?.querySelector?.('input[type="file"]') ||
      uploadControl?.parentElement?.querySelector?.('input[type="file"]') ||
      null
    if (!input) {
      const before = new Set(inputs())
      if (uploadControl) {
        await trustedClickElement(uploadControl, { align: 'center' })
        await sleep(400)
      }
      input = inputs().find((el) => !before.has(el)) || inputs()[0] || null
    }
    if (!input) return { ok: false, error: 'PICKER_UPLOAD_INPUT_MISSING' }
    const applied = applyFileViaAcceptedMechanism(input, fileObj)
    if (!applied.ok) return { ok: false, error: applied.error || 'PICKER_UPLOAD_FAILED', applied }
    const started = Date.now()
    let picked = null
    while (Date.now() - started < 20000 && !picked) {
      const fresh = deepQueryAll('img').filter((img) => {
        if (beforeImgs.has(img) || !isShown(img)) return false
        const rect = img.getBoundingClientRect()
        return rect.width >= 48 && rect.height >= 48
      })
      if (fresh.length) {
        fresh.sort((a, b) => scoreProjectImage(b, wanted) - scoreProjectImage(a, wanted))
        picked = fresh[0]
        break
      }
      await sleep(400)
    }
    if (!picked) return { ok: false, error: 'PICKER_UPLOAD_NOT_LISTED', applied }
    await chooseListedProjectImage(picked)
    return { ok: true, via: 'picker_upload', applied }
  }

  async function addSingerFromProject(name, fileName) {
    const button = findNamedControl(/adicionar do projeto|add from project/)
    if (!button) return { ok: false, error: 'ADD_FROM_PROJECT_MISSING' }
    const click = await trustedClickElement(button, { align: 'center' })
    if (click?.ok === false) return { ok: false, error: 'ADD_FROM_PROJECT_CLICK_FAILED', click }
    const wanted = [normLabel(name), normLabel(String(fileName || '')).replace(/\.(png|jpe?g|webp|gif)$/i, '')].filter(
      Boolean,
    )
    const started = Date.now()
    let picked = null
    while (Date.now() - started < 12000 && !picked) {
      if (pickerIsOpen() || findNamedControl(/adicionar midia|add media/)) {
        picked = findPickerChoice(assetPickerRoot(), wanted)
      }
      if (!picked) await sleep(300)
    }
    if (!picked) {
      await dismissAssetPicker()
      return { ok: false, error: 'PROJECT_IMAGE_NOT_LISTED', click }
    }
    const chosen = await chooseListedProjectImage(picked.el)
    if (!chosen.confirmed) {
      await dismissAssetPicker()
      return { ok: false, error: 'ADD_MEDIA_MISSING', click, label: picked.label }
    }
    return { ok: true, via: 'project', label: picked.label }
  }

  function findComposerPlus() {
    return (
      deepQueryAll('button, [role="button"]').find((el) => {
        if (!isShown(el)) return false
        const rect = el.getBoundingClientRect()
        if (rect.width > 64 || rect.height > 64) return false
        const label = normLabel(accessibleName(el))
        return label === '+' || /adicionar imagem|add image|anexar|attach/.test(label)
      }) || null
    )
  }

  async function attachSingerFile(fileObj) {
    const list = () => deepQueryAll('input[type="file"]').filter((el) => !el.disabled)
    const before = new Set(list())
    const enviar = findNamedControl(/^enviar$|^upload$|^carregar$/)
    let input =
      enviar?.querySelector?.('input[type="file"]') ||
      enviar?.parentElement?.querySelector?.('input[type="file"]') ||
      null
    if (!input) {
      const plus = findComposerPlus()
      if (plus) {
        await trustedClickElement(plus, { align: 'center' })
        await sleep(400)
        input = list().find((el) => !before.has(el)) || null
      }
    }
    if (!input) return { ok: false, error: 'CHARACTER_FILE_INPUT_MISSING' }
    const applied = applyFileViaAcceptedMechanism(input, fileObj)
    if (!applied.ok) return { ok: false, error: applied.error || 'CHARACTER_UPLOAD_FAILED', applied }
    await sleep(700)
    return { ok: true, via: 'file', applied }
  }

  function findComposerSubmit() {
    const field = findDescribeField()
    let root = field?.parentElement || null
    let box = null
    for (let depth = 0; depth < 8 && root; depth += 1) {
      const text = normLabel(root.innerText || '')
      if (/descreva seu personagem|describe your character|formatar|nano banana/.test(text)) {
        box = root
      } else if (box) {
        break
      }
      root = root.parentElement
    }
    const buttons = deepQueryAll('button, [role="button"]', box || document).filter((el) => {
      if (!isShown(el)) return false
      const rect = el.getBoundingClientRect()
      if (rect.width > 72 || rect.height > 72) return false
      const label = normLabel(accessibleName(el))
      if (/formatar|format|nano|banana|adicionar do projeto|add from project|exemplo/.test(label)) {
        return false
      }
      if (label === '+' || /adicionar imagem|add image/.test(label)) return false
      return true
    })
    buttons.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)
    return buttons[0] || null
  }

  async function openNewCharacterComposer() {
    if (findNamedControl(/adicionar do projeto|add from project/)) return { ok: true, already: true }
    const create = findNamedControl(/novo personagem|new character|criar personagem|create character/)
    if (create) {
      await trustedClickElement(create, { align: 'center' })
      const started = Date.now()
      while (Date.now() - started < 5000) {
        if (findNamedControl(/adicionar do projeto|add from project/)) return { ok: true }
        await sleep(250)
      }
    }
    return { ok: false, error: 'ADD_FROM_PROJECT_MISSING' }
  }

  function findUnnamedCharacterTitle() {
    return (
      deepQueryAll('h1, h2, h3, [role="heading"], span, div, p, button').find((el) => {
        if (!isShown(el)) return false
        const text = normLabel(el.innerText || el.textContent || '')
        if (text !== 'personagem sem nome' && !text.startsWith('personagem sem n')) return false
        const rect = el.getBoundingClientRect()
        return rect.top < 220 && rect.width < 460 && rect.height < 96
      }) || null
    )
  }

  async function concludeCharacter() {
    const done = findNamedControl(/^concluir$|^done$|^salvar$|^save$/)
    if (!done) return { ok: false, error: 'CHARACTER_CONCLUDE_MISSING' }
    const saved = await trustedClickElement(done, { align: 'center' })
    await sleep(900)
    return { ok: saved?.ok !== false, saved }
  }

  async function setCharacterDisplayName(name) {
    const wanted = normLabel(name)
    const heading =
      findUnnamedCharacterTitle() ||
      deepQueryAll('h1, h2, [role="heading"]').find((el) => {
        if (!isShown(el)) return false
        const text = normLabel(el.innerText || '')
        return text.length > 0 && text.length < 48
      })
    if (heading && normLabel(heading.innerText || '') === wanted) return { ok: true, already: true }
    let field = findCharacterNameField()
    if (!field && heading) {
      const rect = heading.getBoundingClientRect()
      const pencil = deepQueryAll('button, [role="button"]').find((el) => {
        if (!isShown(el)) return false
        const r = el.getBoundingClientRect()
        if (r.width > 48 || r.height > 48) return false
        const cy = r.top + r.height / 2
        const hy = rect.top + rect.height / 2
        return Math.abs(cy - hy) < 28 && r.left >= rect.right - 8 && r.left < rect.right + 72
      })
      if (pencil) {
        await trustedClickElement(pencil, { align: 'center' })
        await sleep(350)
      } else {
        await trustedClickElement(heading, { align: 'center' })
        await sleep(350)
      }
      field =
        findCharacterNameField() ||
        deepQueryAll('input, textarea, [contenteditable="true"]').find((el) => {
          if (!isShown(el)) return false
          const label = normLabel(
            `${el.getAttribute('placeholder') || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('data-placeholder') || ''}`,
          )
          if (
            /descreva seu personagem|describe your character|o que voce quer mudar|busca|search|prompt|formatar/.test(
              label,
            )
          ) {
            return false
          }
          const box = el.getBoundingClientRect()
          return box.top < 220 && box.left < 560
        }) ||
        null
    }
    if (!field) return { ok: false, error: 'CHARACTER_NAME_FIELD_MISSING' }
    return insertCharacterText(field, name, true)
  }

  async function finishCharacterName(name) {
    const field = findCharacterNameField()
    const named = field ? await insertCharacterText(field, name) : { ok: false, skipped: true }
    const done = findNamedControl(/^concluir$|^done$|^salvar$|^save$/)
    let saved = null
    if (done) {
      saved = await trustedClickElement(done, { align: 'center' })
      await sleep(900)
    }
    return { named, saved }
  }

  async function waitForSingerChip(name, timeoutMs) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      if (singerChipVisible(name)) return true
      await sleep(300)
    }
    return false
  }

  async function returnToProjectComposer(expectedFlowProjectId) {
    if (!stillInCharacterFlow() && !onCharacterPage()) return { ok: true }
    const back = findNamedControl(/^voltar$|^back$|^fechar$|^close$/)
    if (back) {
      await trustedClickElement(back, { align: 'center' })
      await sleep(700)
    }
    if (stillInCharacterFlow()) {
      const projectNav = deepQueryAll('button, [role="button"], a').find((el) => {
        if (!isShown(el)) return false
        const rect = el.getBoundingClientRect()
        if (rect.left > 96) return false
        const label = normLabel(accessibleName(el))
        return /imagem|image|projeto|project|inicio|home|galeria|gallery/.test(label) && !/personag|character/.test(label)
      })
      if (projectNav) {
        await trustedClickElement(projectNav, { align: 'center' })
        await sleep(700)
      }
    }
    if ((stillInCharacterFlow() || onCharacterPage()) && expectedFlowProjectId) {
      const projectLink = deepQueryAll('a[href]').find((el) => {
        if (!isShown(el)) return false
        const href = String(el.getAttribute('href') || '').split('?')[0]
        return href.endsWith(`/project/${expectedFlowProjectId}`)
      })
      if (projectLink) {
        await trustedClickElement(projectLink, { align: 'center' })
        await sleep(800)
      }
    }
    return { ok: !stillInCharacterFlow() && !onCharacterPage() }
  }

  function findUploadButton() {
    return (
      deepQueryAll('button, [role="button"], [role="menuitem"]').find((el) => {
        if (!isShown(el)) return false
        const text = normLabel(accessibleName(el) || el.innerText || '')
        if (!text || text.length > 48) return false
        return text === 'fazer upload' || text === 'upload' || isUploadMediaLabel(text)
      }) || null
    )
  }

  async function ensureFreshFileInput(expectedFlowProjectId) {
    await exitAssetEditIfNeeded(expectedFlowProjectId)
    if (onCharacterPage() || stillInCharacterFlow()) {
      await returnToProjectComposer(expectedFlowProjectId)
      await sleep(400)
    }
    const clickUpload = async () => {
      const upload = findUploadButton()
      if (!upload) return false
      await trustedClickElement(upload, { align: 'center' })
      await sleep(400)
      return true
    }
    if (pickerIsOpen()) {
      await clickUpload()
      let relocated = relocateFileInput(expectedFlowProjectId)
      if (relocated.ok) return relocated
      await dismissAssetPicker()
    }
    let relocated = relocateFileInput(expectedFlowProjectId)
    if (relocated.ok) return relocated
    const reopen = await openUploadUiSequentially(expectedFlowProjectId)
    relocated = relocateFileInput(expectedFlowProjectId)
    if (relocated.ok) return relocated
    if (pickerIsOpen()) {
      await clickUpload()
      relocated = relocateFileInput(expectedFlowProjectId)
      if (relocated.ok) return relocated
    }
    return {
      ok: false,
      error: relocated.error || reopen.error || 'FILE_INPUT_NOT_FOUND',
      reopen,
    }
  }

  async function ensureSingerCharacter(file, expectedFlowProjectId) {
    const name = String(file?.alias || 'cantor').trim() || 'cantor'
    const context = assertProjectContext(expectedFlowProjectId)
    if (!context.ok) return { ok: false, error: context.error, name, step: 'project_context' }

    if (pickerIsOpen()) await dismissAssetPicker()
    if (singerChipVisible(name) && !characterComposerOpen()) {
      return { ok: true, already: true, name, step: 'character_exists' }
    }

    const opened = await openCharactersPanel()
    if (!opened.ok) return { ok: false, ...opened, name, step: 'open_characters' }
    if (singerChipVisible(name)) {
      const named = await setCharacterDisplayName(name)
      const concluded = await concludeCharacter()
      await returnToProjectComposer(expectedFlowProjectId)
      return { ok: true, already: true, name, step: 'character_exists', named, concluded }
    }

    const composer = await openNewCharacterComposer()
    if (!composer.ok) return { ok: false, ...composer, name, step: 'new_character' }

    const fromProject = await addSingerFromProject(name, file.name)
    if (!fromProject.ok) {
      await dismissAssetPicker()
      return {
        ok: false,
        error: fromProject.error || 'PROJECT_IMAGE_NOT_LISTED',
        name,
        step: 'add_from_project',
        fromProject,
      }
    }

    const sheetStarted = Date.now()
    while (Date.now() - sheetStarted < 8000 && !characterSheetOpen() && !singerChipVisible(name)) {
      await sleep(300)
    }
    const named = await setCharacterDisplayName(name)
    const concluded = await concludeCharacter()
    const exists = singerChipVisible(name) || concluded.ok === true || (await waitForSingerChip(name, 4000))
    await returnToProjectComposer(expectedFlowProjectId)
    if (!exists) {
      return {
        ok: false,
        error: named?.error || concluded.error || 'CHARACTER_NOT_CONFIRMED',
        name,
        step: 'confirm_character',
        fromProject,
        named,
        concluded,
      }
    }
    return { ok: true, name, step: 'character_saved', via: 'project', named, concluded }
  }

  function findResolutionControl(resolution) {
    const token = String(resolution || '').toLowerCase()
    return (
      deepQueryAll('button, [role="menuitem"], [role="option"], [role="button"], a').find((el) => {
        if (!isShown(el)) return false
        const text = normLabel(accessibleName(el))
        if (!text || text.length > 48) return false
        if (token === '1k') return /^1k\b/.test(text) || /tamanho original|original size/.test(text)
        if (token === '2k') return /^2k\b/.test(text)
        if (token === '4k') return /^4k\b/.test(text)
        return false
      }) || null
    )
  }

  function findCardForMedia(flowMediaId) {
    const wanted = String(flowMediaId || '').trim()
    if (!wanted) return null
    const imgs = deepQueryAll('img').filter((img) => {
      const src = `${img.currentSrc || ''} ${img.src || ''}`
      const identity = extractMediaIdentityFromElement(img)
      return (identity && identity.id === wanted) || src.includes(wanted)
    })
    let start = imgs.sort(
      (a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width,
    )[0]
    if (!start) {
      start =
        deepQueryAll('[data-media-id], [data-asset-id], [data-id], a, video').find((el) => {
          const identity = extractMediaIdentityFromElement(el)
          return identity && identity.id === wanted
        }) || null
    }
    if (!start) return null
    let node = start
    for (let depth = 0; depth < 8 && node; depth += 1) {
      const rect = node.getBoundingClientRect?.()
      const buttons = deepQueryAll('button, [role="button"]', node).filter(isShown)
      if (rect && rect.width > 80 && rect.width < 960 && buttons.length >= 1) return node
      node = node.parentElement
    }
    return start.parentElement || start
  }

  async function downloadGeneratedImage(flowMediaId, resolution, expectedFlowProjectId) {
    const token = String(resolution || '').toLowerCase()
    if (token !== '1k' && token !== '2k' && token !== '4k') {
      return { ok: false, error: 'RESOLUTION_INVALID', step: 'resolution' }
    }
    const context = assertProjectContext(expectedFlowProjectId)
    if (!context.ok) return { ok: false, error: context.error, step: 'project_context' }
    const card = findCardForMedia(flowMediaId)
    if (!card) return { ok: false, error: 'IMAGE_NOT_ON_PAGE', step: 'find_image', flowMediaId }

    const more = deepQueryAll('button, [role="button"]', card).find((el) => {
      if (!isShown(el)) return false
      return /mais op|more option|more_vert|^mais$|^more$|opcoes da imagem|image options/.test(
        normLabel(accessibleName(el)),
      )
    })
    const cardRect = card.getBoundingClientRect?.()
    const corner =
      more ||
      deepQueryAll('button, [role="button"]', card)
        .filter((el) => {
          if (!isShown(el) || !cardRect) return false
          const rect = el.getBoundingClientRect()
          return rect.width <= 48 && rect.right > cardRect.right - 80 && rect.top < cardRect.top + 80
        })
        .sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0]
    const opener = corner || card.querySelector?.('img') || card
    await trustedClickElement(opener, { align: 'center' })
    await sleep(450)

    let downloadItem = findNamedControl(/fazer o download|^download$|fazer download/)
    if (!downloadItem) {
      await trustedClickElement(card.querySelector?.('img') || card, { align: 'center' })
      await sleep(400)
      downloadItem = findNamedControl(/fazer o download|^download$|fazer download/)
    }
    if (!downloadItem) {
      return { ok: false, error: 'DOWNLOAD_MENU_MISSING', step: 'open_menu', flowMediaId }
    }
    await trustedClickElement(downloadItem)
    await sleep(500)
    let choice = findResolutionControl(token)
    if (!choice) {
      await trustedClickElement(downloadItem)
      await sleep(500)
      choice = findResolutionControl(token)
    }
    if (!choice) {
      return { ok: false, error: 'RESOLUTION_MISSING', step: 'pick_resolution', resolution: token }
    }
    const click = await trustedClickElement(choice, { align: 'center' })
    return {
      ok: click?.ok !== false,
      error: click?.ok === false ? click.error || 'RESOLUTION_CLICK_FAILED' : undefined,
      step: 'download_clicked',
      resolution: token,
      click,
    }
  }

  function isImageTrashLabel(value) {
    const text = normLabel(value)
    if (!text || text.length > 64) return false
    if (/projeto|project/.test(text)) return false
    return (
      text === 'mover para a lixeira' ||
      text === 'move to trash' ||
      text === 'move to bin' ||
      text.endsWith('mover para a lixeira') ||
      text.endsWith('move to trash')
    )
  }

  function findImageTrashControl(root) {
    return (
      deepQueryAll('button, [role="menuitem"], [role="button"], a', root || document).find((el) => {
        if (!isShown(el)) return false
        return isImageTrashLabel(accessibleName(el) || el.innerText || '')
      }) || null
    )
  }

  async function waitForImageTrashMenu(timeoutMs = 2500) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const trashItem = findImageTrashControl(document)
      if (trashItem) return trashItem
      await sleep(200)
    }
    return null
  }

  async function openImageActionsMenu(card) {
    const img = card.querySelector?.('img') || card
    try {
      card.scrollIntoView({ block: 'center', inline: 'nearest' })
    } catch {
      /* ignore */
    }
    await sleep(120)

    const more = deepQueryAll('button, [role="button"]', card).find((el) => {
      if (!isShown(el)) return false
      return /mais op|more option|more_vert|more_horiz|^mais$|^more$|opcoes da imagem|image options|opcoes/.test(
        normLabel(accessibleName(el)),
      )
    })
    const cardRect = card.getBoundingClientRect?.()
    const corner =
      more ||
      deepQueryAll('button, [role="button"]', card)
        .filter((el) => {
          if (!isShown(el) || !cardRect) return false
          const rect = el.getBoundingClientRect()
          return rect.width <= 48 && rect.right > cardRect.right - 80 && rect.top < cardRect.top + 80
        })
        .sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0]

    // 1) Botão ⋮ / Mais opções
    if (corner) {
      await trustedClickElement(corner, { align: 'center' })
      const viaMore = await waitForImageTrashMenu(1800)
      if (viaMore) return { ok: true, via: 'more_button', trashItem: viaMore }
    }

    // 2) Clique direito na imagem (menu do print: Favorito / Mover para a lixeira)
    await trustedClickElement(img, { align: 'center', button: 'right' })
    const viaRight = await waitForImageTrashMenu(2200)
    if (viaRight) return { ok: true, via: 'context_menu', trashItem: viaRight }

    // 3) Clique esquerdo no card e tenta de novo o canto
    await trustedClickElement(img, { align: 'center' })
    await sleep(350)
    if (corner) {
      await trustedClickElement(corner, { align: 'center' })
      const viaRetry = await waitForImageTrashMenu(1800)
      if (viaRetry) return { ok: true, via: 'more_button_retry', trashItem: viaRetry }
    }

    return { ok: false, via: 'none', trashItem: null }
  }

  async function trashGeneratedImage(flowMediaId, expectedFlowProjectId) {
    const context = assertProjectContext(expectedFlowProjectId)
    if (!context.ok) return { ok: false, error: context.error, step: 'project_context' }

    let card = findCardForMedia(flowMediaId)
    if (!card) {
      // Grid virtualizado: percorre um pouco a página para materializar o card.
      const scroller =
        document.scrollingElement || document.documentElement || document.body
      const startTop = Number(scroller?.scrollTop || 0)
      for (const delta of [0, 480, 960, 1600, -480, -960]) {
        try {
          scroller.scrollTo({ top: Math.max(0, startTop + delta), behavior: 'instant' })
        } catch {
          try {
            scroller.scrollTop = Math.max(0, startTop + delta)
          } catch {
            /* ignore */
          }
        }
        await sleep(280)
        card = findCardForMedia(flowMediaId)
        if (card) break
      }
    }
    if (!card) return { ok: false, error: 'IMAGE_NOT_ON_PAGE', step: 'find_image', flowMediaId }

    const opened = await openImageActionsMenu(card)
    const trashItem = opened.trashItem
    if (!trashItem) {
      return {
        ok: false,
        error: 'TRASH_MENU_MISSING',
        step: 'open_menu',
        flowMediaId,
        menuVia: opened.via,
      }
    }
    await trustedClickElement(trashItem, { align: 'center' })
    await sleep(500)

    const stillVisible = () => {
      const left = findCardForMedia(flowMediaId)
      if (!left) return false
      const rect = left.getBoundingClientRect?.()
      return Boolean(rect && rect.width > 80 && rect.height > 48)
    }
    const confirmStarted = Date.now()
    while (Date.now() - confirmStarted < 3200) {
      const dialog = deepQueryAll('[role="dialog"], [role="alertdialog"]').find((el) => isShown(el))
      const confirm = dialog ? findImageTrashControl(dialog) : null
      if (confirm && confirm !== trashItem) {
        await trustedClickElement(confirm, { align: 'center' })
        break
      }
      if (!stillVisible()) break
      await sleep(250)
    }
    await sleep(450)
    if (stillVisible()) {
      return {
        ok: false,
        error: 'TRASH_NOT_CONFIRMED',
        step: 'confirm',
        flowMediaId,
        menuVia: opened.via,
      }
    }
    return { ok: true, step: 'trashed', flowMediaId, menuVia: opened.via }
  }

  async function attachFilesToPrompt(files, expectedFlowProjectId, options) {
    const promptText =
      typeof options?.promptText === 'string' && options.promptText.trim()
        ? options.promptText.trim()
        : null
    const runGenerate = options?.runGenerate === true
    const preBound = Array.isArray(options?.preBound) ? options.preBound : []
    const needsUpload = Array.isArray(files) && files.length > 0

    const ready = await waitForProjectReady({
      expectedFlowProjectId,
      forOperation: needsUpload ? 'open_upload' : 'base',
      timeoutMs: 45_000,
    })
    if (!ready.ok) {
      return {
        ok: false,
        certainty: 'not_sent',
        error: ready.error,
        step: 'wait_for_project_ready',
        ready,
      }
    }

    let uploadUi = { ok: true, step: 'skipped_prebound_only' }
    if (needsUpload) {
      uploadUi = await openUploadUiSequentially(expectedFlowProjectId)
      if (!uploadUi.ok) {
        return {
          ok: false,
          certainty: 'not_sent',
          error: uploadUi.error,
          step: uploadUi.step,
          uploadUi,
        }
      }
    }

    const uploads = []
    const orderedFiles = [
      ...files.filter((file) => file?.asCharacter === true),
      ...files.filter((file) => file?.asCharacter !== true),
    ]
    const prepared = []
    for (const file of orderedFiles) {
      const context = assertProjectContext(expectedFlowProjectId)
      if (!context.ok) {
        uploads.push({
          referenceId: file.referenceId,
          ok: false,
          error: context.error,
          uploadState: 'not_sent',
          attachedState: 'not_attached',
        })
        continue
      }

      const bytes = base64ToUint8Array(file.base64)
      const digest = await sha256HexOfBytes(bytes)
      if (file.sha256 && digest !== String(file.sha256).toLowerCase()) {
        uploads.push({
          referenceId: file.referenceId,
          ok: false,
          error: 'SHA256_MISMATCH',
          expectedSha256: file.sha256,
          actualSha256: digest,
          byteSize: bytes.length,
          uploadState: 'not_sent',
          attachedState: 'not_attached',
        })
        continue
      }
      if (file.byteSize != null && Number(file.byteSize) !== bytes.length) {
        uploads.push({
          referenceId: file.referenceId,
          ok: false,
          error: 'BYTE_SIZE_MISMATCH',
          expectedByteSize: file.byteSize,
          actualByteSize: bytes.length,
          uploadState: 'not_sent',
          attachedState: 'not_attached',
        })
        continue
      }

      prepared.push({
        file,
        bytes,
        digest,
        fileObj: new File([bytes], file.name || 'reference.png', {
          type: file.mimeType || 'image/png',
        }),
      })
    }

    if (prepared.length > 0) {
      let relocated = relocateFileInput(expectedFlowProjectId)
      if (!relocated.ok) {
        const reopen = await openUploadUiSequentially(expectedFlowProjectId)
        relocated = relocateFileInput(expectedFlowProjectId)
        if (!relocated.ok) {
          for (const item of prepared) {
            uploads.push({
              referenceId: item.file.referenceId,
              ok: false,
              error: relocated.error,
              reopen,
              uploadState: 'not_sent',
              attachedState: 'not_attached',
            })
          }
        }
      }

      if (relocated.ok) {
        try {
          relocated.input.value = ''
        } catch {
          /* limpa o valor anterior antes do lote */
        }

        const beforeLabels = collectAccessibleLabels()
        const supportsMultiple = relocated.input.multiple === true || prepared.length === 1
        let applied = null
        let completionByRef = new Map()

        if (supportsMultiple) {
          // Um único change com todos os arquivos — o Flow sobe em paralelo.
          applied = applyFilesViaAcceptedMechanism(
            relocated.input,
            prepared.map((item) => item.fileObj),
          )
          if (!applied.ok) {
            for (const item of prepared) {
              uploads.push({
                referenceId: item.file.referenceId,
                ok: false,
                error: applied.error,
                uploadState: 'not_sent',
                attachedState: 'not_attached',
              })
            }
          } else {
            const batchTimeout = Math.min(90_000, Math.max(45_000, prepared.length * 25_000))
            const completions = await waitForBatchUploadCompletion(
              prepared.map((item) => ({
                name: item.file.name,
                referenceId: item.file.referenceId,
                sha256: item.digest,
              })),
              beforeLabels,
              batchTimeout,
            )
            for (const completion of completions) {
              if (completion?.referenceId) completionByRef.set(completion.referenceId, completion)
            }
          }
        } else {
          // Fallback raro: input sem multiple — ainda sobe um a um, sem esperar preview.
          for (let index = 0; index < prepared.length; index += 1) {
            const item = prepared[index]
            let slot =
              index === 0 ? relocated : await ensureFreshFileInput(expectedFlowProjectId)
            if (!slot.ok) {
              const reopen = await openUploadUiSequentially(expectedFlowProjectId)
              slot = relocateFileInput(expectedFlowProjectId)
              if (!slot.ok) {
                uploads.push({
                  referenceId: item.file.referenceId,
                  ok: false,
                  error: slot.error,
                  reopen,
                  uploadState: 'not_sent',
                  attachedState: 'not_attached',
                })
                continue
              }
            }
            try {
              slot.input.value = ''
            } catch {
              /* ignore */
            }
            const labelsNow = collectAccessibleLabels()
            applied = applyFileViaAcceptedMechanism(slot.input, item.fileObj)
            if (!applied.ok) {
              uploads.push({
                referenceId: item.file.referenceId,
                ok: false,
                error: applied.error,
                uploadState: 'not_sent',
                attachedState: 'not_attached',
              })
              continue
            }
            // Não espera a conclusão aqui: só dispara e segue para o próximo arquivo.
            // A identidade de todos é reconciliada no batch abaixo.
            completionByRef.set(item.file.referenceId, {
              ok: false,
              certainty: 'may_have_sent',
              uploadState: 'upload_pending_batch',
              flowMediaId: null,
              evidence: { labelsSample: labelsNow.slice(0, 8) },
              durationMs: 0,
              referenceId: item.file.referenceId,
              name: item.file.name,
              note: 'Disparado sem multiple; identidade no batch final.',
            })
          }
          if (completionByRef.size > 0) {
            const pending = prepared.filter((item) => completionByRef.has(item.file.referenceId))
            const completions = await waitForBatchUploadCompletion(
              pending.map((item) => ({
                name: item.file.name,
                referenceId: item.file.referenceId,
                sha256: item.digest,
              })),
              beforeLabels,
              Math.min(90_000, Math.max(45_000, pending.length * 25_000)),
            )
            for (const completion of completions) {
              if (completion?.referenceId) completionByRef.set(completion.referenceId, completion)
            }
          }
        }

        if (completionByRef.size > 0 || (applied && applied.ok)) {
          for (const item of prepared) {
            if (uploads.some((row) => row.referenceId === item.file.referenceId)) continue
            const completion =
              completionByRef.get(item.file.referenceId) ||
              unfinishedUploadResult(
                {
                  name: item.file.name,
                  referenceId: item.file.referenceId,
                },
                null,
                0,
              )
            if (item.file.asCharacter === true) {
              if (pickerIsOpen()) await dismissAssetPicker()
              if (!runGenerate) await clearPromptImageChips()
              const character = await ensureSingerCharacter(item.file, expectedFlowProjectId)
              uploads.push({
                referenceId: item.file.referenceId,
                sha256: item.digest,
                name: item.file.name,
                byteSize: item.bytes.length,
                ok: character.ok === true,
                asCharacter: true,
                characterName: character.name,
                flowMediaId: completion.flowMediaId || null,
                certainty: completion.certainty,
                uploadState: character.ok === true ? 'uploaded_bound' : completion.uploadState,
                attachedState: character.ok === true ? 'attached' : 'not_attached',
                error: character.ok === true ? undefined : character.error || 'CHARACTER_NOT_CREATED',
                step: character.step,
                plainUpload: {
                  ok: completion.ok === true,
                  error: completion.error || null,
                  flowMediaId: completion.flowMediaId || null,
                },
                batchAssigned: supportsMultiple,
                note:
                  character.ok === true
                    ? 'Imagem enviada como referência e adicionada como personagem.'
                    : 'A imagem subiu como referência, mas não entrou como personagem.',
              })
              continue
            }
            uploads.push({
              referenceId: item.file.referenceId,
              sha256: item.digest,
              name: item.file.name,
              byteSize: item.bytes.length,
              ok: completion.ok === true,
              certainty: completion.certainty,
              uploadState: completion.uploadState,
              flowMediaId: completion.flowMediaId,
              attachedState: 'not_attached',
              applied,
              inputMeta: relocated.inputMeta,
              evidence: completion.evidence,
              error: completion.error || null,
              note: completion.note || null,
              durationMs: completion.durationMs,
              batchAssigned: supportsMultiple,
            })
          }
          if (pickerIsOpen()) await dismissAssetPicker()
          await exitAssetEditIfNeeded(expectedFlowProjectId)
        }
      }
    }

    const boundFromUpload = uploads.filter(
      (item) =>
        item.ok &&
        item.uploadState === 'uploaded_bound_evidence' &&
        isLegitimateMediaId(item.flowMediaId),
    )
    const boundFromStore = preBound.filter(
      (item) => item && isLegitimateMediaId(item.flowMediaId),
    )
    const boundOk = [
      ...boundFromUpload,
      ...boundFromStore.filter(
        (item) => !boundFromUpload.some((upload) => upload.referenceId === item.referenceId),
      ),
    ]
    const expectedTotal = Math.max(files.length + preBound.length, boundOk.length, 1)
    const attachments = []
    if (runGenerate) {
      for (const bound of boundOk) {
        const attached = await selectBoundAssetForPrompt(bound, expectedFlowProjectId, 20_000)
        attachments.push({
          referenceId: bound.referenceId,
          flowMediaId: bound.flowMediaId,
          ...attached,
        })
        if (attached.ok) {
          bound.attachedState = 'attached'
        }
      }
    } else {
      await clearPromptImageChips()
    }

    const characterOnly =
      needsUpload &&
      files.every((file) => file?.asCharacter === true) &&
      uploads.length === files.length &&
      uploads.every((item) => item.ok === true && item.asCharacter === true)
    const allUploaded =
      characterOnly ||
      !needsUpload ||
      (uploads.length === files.length && uploads.every((item) => item.ok))
    const minAttach = Math.max(1, expectedTotal)
    const allAttached =
      attachments.length >= minAttach &&
      attachments.length === boundOk.length &&
      attachments.every((item) => item.ok === true)

    let promptWrite = null
    if (promptText && allUploaded && allAttached) {
      await dismissAssetsPanelIfOpen()
      promptWrite = await writePromptText(promptText)
    }

    let generate = null
    // Geração bloqueada até anexação confirmada da seleção.
    if (runGenerate && promptWrite?.ok && allUploaded && allAttached) {
      generate = await startGenerationOnce(expectedFlowProjectId, 30_000)
    } else if (runGenerate && !allAttached) {
      generate = {
        ok: false,
        error: 'GENERATE_BLOCKED_UNTIL_ATTACHED',
        attachedCount: attachments.filter((item) => item.ok).length,
        expectedTotal,
      }
    }

    const readyNow = runGenerate
      ? characterOnly || (allUploaded && allAttached)
      : characterOnly || allUploaded
    return {
      ok: readyNow,
      certainty: readyNow ? 'accepted' : 'may_have_sent',
      step: characterOnly
        ? 'character_ready'
        : !allUploaded
          ? 'upload_phase'
          : !allAttached
            ? 'attach_phase'
            : generate
              ? 'generate_phase'
              : 'attach_phase_done',
      uploadUi: {
        ok: uploadUi.ok,
        step: uploadUi.step,
        // Não serializar DOM
        fileInputOk: uploadUi.fileInput?.ok === true,
      },
      uploads,
      attachments,
      promptWrite,
      generate,
      observation: buildObservation(),
      distinctions: {
        staged_local: 'bytes no Atlas',
        uploaded_bound: 'identidade Flow (flowMediaId) após conclusão real',
        attached: 'selecionado no draft (pós-condição própria)',
        generate: 'Start generation — resultado NÃO VALIDADO até bytes',
      },
      sensorVersion: globalThis.__ATLAS_FLOW_V1_SENSOR__.version,
      realFlowValidated: false,
      note: 'FileList/change ≠ upload concluído. Miniatura isolada ≠ identidade. Reconciliar se uncertain.',
    }
  }

  const DATED_FLOW_TITLE_RE =
    /\b(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|feb|apr|may|aug|sep|oct|dec)[a-z.]*\s+\d{1,2}\s*[-–]\s*\d{1,2}:\d{2}\b/i

  function visibleText(el) {
    return String(el?.innerText || el?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function findDatedFlowTitle() {
    const nodes = deepQueryAll(
      'button, [role="button"], h1, h2, [contenteditable="true"], div[tabindex], span, a, p',
    ).filter((el) => {
      if (!isShown(el)) return false
      const label = visibleText(el)
      if (!label || label.length > 48) return false
      return DATED_FLOW_TITLE_RE.test(label)
    })
    nodes.sort((a, b) => visibleText(a).length - visibleText(b).length)
    return nodes[0] || null
  }

  function findProjectNameInput() {
    const editables = deepQueryAll(
      'input[type="text"], input:not([type]), textarea, [contenteditable="true"]',
    ).filter((el) => isShown(el))
    const byAria = editables.find((el) => {
      const aria = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('placeholder') || ''} ${el.getAttribute('aria-placeholder') || ''}`.toLowerCase()
      return /project name|nome do projeto|editable text|texto editavel|texto editável/.test(aria)
    })
    if (byAria) return byAria
    const dated = editables.find((el) =>
      DATED_FLOW_TITLE_RE.test(`${visibleText(el)} ${el.value || ''}`),
    )
    if (dated) return dated
    const active = document.activeElement
    if (active && editables.includes(active)) {
      const aria = `${active.getAttribute('aria-label') || ''} ${active.getAttribute('placeholder') || ''}`.toLowerCase()
      const value = `${visibleText(active)} ${active.value || ''}`
      if (/project|projeto|name|nome|title|título|titulo/.test(aria) || DATED_FLOW_TITLE_RE.test(value)) {
        return active
      }
    }
    return null
  }

  function projectTitleShows(name) {
    return deepQueryAll('h1, h2, [contenteditable="true"], button, span, p').some((el) => {
      if (!isShown(el)) return false
      const label = visibleText(el)
      if (!label || label.length > name.length + 12) return false
      return label === name
    })
  }

  function writeProjectTitle(el, value) {
    el.focus()
    if (el.isContentEditable) {
      const selection = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(el)
      selection?.removeAllRanges()
      selection?.addRange(range)
      const inserted = document.execCommand('insertText', false, value)
      if (!inserted || visibleText(el) !== value) {
        el.textContent = value
        el.dispatchEvent(
          new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }),
        )
      }
      return
    }
    const proto =
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value') ||
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')
    proto?.set?.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  async function openProjectTitleEditor() {
    if (findProjectNameInput()) return true
    const title = findDatedFlowTitle()
    if (title) {
      title.click()
      title.dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }),
      )
      await sleep(280)
      if (findProjectNameInput()) return true
    }
    const pencil = deepQueryAll('button, [role="button"]').find((el) => {
      if (!isShown(el)) return false
      const rect = el.getBoundingClientRect()
      if (rect.top > 160) return false
      const label = labelOf(el).toLowerCase()
      if (!label || label.length > 64) return false
      return /rename|renomear|edit project|editar projeto|edit title|editar t[ií]tulo|project name|nome do projeto/.test(
        label,
      )
    })
    if (pencil) {
      pencil.click()
      await sleep(280)
    }
    return Boolean(findProjectNameInput())
  }

  async function applyRequestedProjectTitle(requestedTitle) {
    const name = String(requestedTitle || '').trim()
    if (!name) return { ok: false, skipped: true, reason: 'empty' }
    const started = Date.now()
    while (Date.now() - started < 5000) {
      if (projectTitleShows(name) && !findDatedFlowTitle()) {
        return { ok: true, alreadyNamed: true, observedTitle: name }
      }
      if (findDatedFlowTitle() || findProjectNameInput()) break
      await sleep(200)
    }
    if (projectTitleShows(name) && !findDatedFlowTitle()) {
      return { ok: true, alreadyNamed: true, observedTitle: name }
    }

    return {
      ok: false,
      needsTrustedRename: true,
      note: 'O nome só grava com digitação trusted. Escrever no DOM faz o Flow voltar para a data.',
    }
  }

  async function ensureNewProject(request) {
    const requestedTitle =
      typeof request?.requestedTitle === 'string' && request.requestedTitle.trim()
        ? request.requestedTitle.trim()
        : `Atlas Flow ${new Date().toISOString().slice(0, 19)}`

    const beforeHref = location.href
    const beforeId = parseProjectId(beforeHref)

    // Já estamos num projeto e o pedido pede reuso desse ID.
    if (request?.existingFlowProjectId && beforeId === request.existingFlowProjectId) {
      const titleApply = await applyRequestedProjectTitle(requestedTitle)
      return {
        ok: true,
        certainty: 'accepted',
        reused: true,
        created: false,
        requestedTitle,
        flowProjectId: beforeId,
        flowProjectUrl: `https://flow.google.com/project/${beforeId}`,
        observedTitle: titleApply.observedTitle || document.title || null,
        titleApply,
        selector: { strategy: 'url_already_on_project', label: null },
        evidence: { beforeHref, afterHref: beforeHref },
      }
    }

    // Se já temos ID externo conhecido, navegar e verificar (sem clicar New).
    if (request?.existingFlowProjectId) {
      const target = `https://flow.google.com/project/${request.existingFlowProjectId}`
      if (location.href !== target) {
        location.assign(target)
        const nav = await waitForProjectUrl(20_000)
        if (!nav.ok || nav.flowProjectId !== request.existingFlowProjectId) {
          return {
            ok: false,
            certainty: 'not_sent',
            error: 'EXISTING_PROJECT_NAV_FAILED',
            details: nav,
          }
        }
      }
      const titleApply = await applyRequestedProjectTitle(requestedTitle)
      return {
        ok: true,
        certainty: 'accepted',
        reused: true,
        created: false,
        requestedTitle,
        flowProjectId: request.existingFlowProjectId,
        flowProjectUrl: target,
        observedTitle: titleApply.observedTitle || document.title || null,
        titleApply,
        selector: { strategy: 'navigate_existing_id', label: null },
        evidence: { beforeHref, afterHref: location.href },
      }
    }

    // Home necessária para o botão New project / "+ Novo projeto".
    const homeNav = await navigateToFlowHome(28_000)
    if (!homeNav.ok && !findUniqueControlByLabel(newProjectLabelMatcher, 'new_project').ok) {
      return {
        ok: false,
        certainty: 'not_sent',
        error: homeNav.error || 'HOME_NAV_FAILED',
        href: homeNav.href || location.href,
        labelsSample: collectAccessibleLabels().slice(0, 40),
        evidence: { beforeHref, homeNav },
        note: 'Não estabilizou na home do Flow (costuma reabrir o último projeto). Abra flow.google.com na página inicial e tente de novo.',
      }
    }

    const found = await waitForUniqueControl(newProjectLabelMatcher, 'new_project', 28_000)
    if (!found.ok) {
      return {
        ok: false,
        certainty: 'not_sent',
        error: found.error,
        matchCount: found.matchCount,
        matchedLabels: found.matchedLabels,
        labelsSample: found.labelsSample || collectAccessibleLabels().slice(0, 40),
        href: location.href,
        evidence: { beforeHref, homeNav },
        note: 'Botão New project / + Novo projeto não encontrado na home do Flow.',
      }
    }

    const clickStartedAt = new Date().toISOString()
    try {
      found.el.click()
    } catch (error) {
      return {
        ok: false,
        certainty: 'not_sent',
        error: `CLICK_FAILED: ${error instanceof Error ? error.message : String(error)}`,
        selector: { strategy: 'unique_aria_or_text', label: found.label },
      }
    }

    const post = await waitForProjectUrl(25_000)
    if (!post.ok) {
      return {
        ok: false,
        certainty: 'may_have_sent',
        error: post.error,
        selector: { strategy: 'unique_aria_or_text', label: found.label, matchCount: 1 },
        evidence: {
          beforeHref,
          afterHref: location.href,
          clickStartedAt,
          reconcileRequired: true,
        },
        note: 'Clique ocorreu; pós-condição de URL não confirmada. Não repetir clique.',
      }
    }

    const titleApply = await applyRequestedProjectTitle(requestedTitle)
    return {
      ok: true,
      certainty: 'accepted',
      reused: false,
      created: true,
      requestedTitle,
      flowProjectId: post.flowProjectId,
      flowProjectUrl: post.flowProjectUrl,
      observedTitle: titleApply.observedTitle || document.title || null,
      titleApply,
      selector: {
        strategy: 'unique_aria_or_text',
        label: found.label,
        matchCount: 1,
        confirmedUnique: true,
      },
      postcondition: {
        kind: 'url_project_id',
        href: post.href,
      },
      evidence: {
        beforeHref,
        afterHref: post.href,
        clickStartedAt,
        confirmedAt: new Date().toISOString(),
      },
    }
  }

  function labelOf(el) {
    return `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''} ${el.textContent || ''}`
      .replace(/\s+/g, ' ')
      .trim()
  }

  function isShown(el) {
    if (!el || el.nodeType !== 1) return false
    const style = getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    const rect = el.getBoundingClientRect()
    return rect.width > 1 && rect.height > 1
  }

  function pageLooksMissing() {
    const text = (document.body?.innerText || '').slice(0, 4000).toLowerCase()
    return /not found|n[aã]o encontrad|doesn.?t exist|n[aã]o existe|project unavailable|projeto indispon/.test(
      text,
    )
  }

  function accessibleName(el) {
    const labelledBy = el.getAttribute('aria-labelledby')
    const fromIds = labelledBy
      ? labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.innerText || '')
          .join(' ')
      : ''
    return `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''} ${fromIds} ${el.innerText || ''}`
      .replace(/\s+/g, ' ')
      .trim()
  }

  function plainLabel(label) {
    return String(label || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /** “Ver lixeira” abre a lixeira. Não é a exclusão do projeto. */
  function isViewTrashLabel(label) {
    return /ver lixeira|view trash|see trash|mostrar lixeira|open trash/.test(plainLabel(label))
  }

  /** Ação que realmente exclui. Recusa Renomear e Ver lixeira. */
  function isExactDeleteAction(label) {
    const text = plainLabel(label)
    if (!text || text.length > 80 || isViewTrashLabel(text)) return false
    if (/renomear|rename|\bedit\b|undo|desfazer|cancel|voltar|\bback\b/.test(text)) return false
    return /(^| )(delete project|excluir projeto|move to trash|mover para a lixeira|move to bin|apagar projeto|remover projeto|delete|excluir|apagar)( |$)/.test(
      text,
    )
  }

  function isDeleteLabel(label) {
    return isExactDeleteAction(label)
  }

  function findDeleteControl(root = document) {
    return deepQueryAll(
      'button, [role="button"], [role="menuitem"], [role="option"]',
      root,
    ).find((el) => isShown(el) && isDeleteLabel(accessibleName(el)))
  }

  function findProjectCard(projectId) {
    const id = String(projectId || '').trim().toLowerCase()
    if (!id) return null
    const link = deepQueryAll('a[href]').find((el) => {
      const href = `${el.getAttribute('href') || ''} ${el.href || ''}`.toLowerCase()
      return href.includes(`/project/${id}`)
    })
    if (!link) return null
    let node = link.parentElement
    let card = link
    for (let depth = 0; depth < 8 && node; depth += 1) {
      const ids = new Set(
        deepQueryAll('a[href]', node)
          .map((el) =>
            `${el.getAttribute('href') || ''} ${el.href || ''}`.toLowerCase().match(
              /\/project\/([a-f0-9-]{8,})/i,
            )?.[1],
          )
          .filter(Boolean),
      )
      if (ids.size > 1) break
      card = node
      node = node.parentElement
    }
    return { link, card }
  }

  function trashButtonOnCard(card) {
    return findDeleteControl(card) || null
  }

  async function confirmDeleteDialog(action) {
    const confirm = await new Promise((resolve) => {
      const started = Date.now()
      const timer = setInterval(() => {
        const dialog = document.querySelector('[role="dialog"], [role="alertdialog"]')
        const btn = deepQueryAll('button, [role="button"]', dialog || document).find((el) => {
          if (!isShown(el) || el === action) return false
          return isDeleteLabel(accessibleName(el)) || /^(confirm|confirmar|ok)$/i.test(accessibleName(el))
        })
        if (btn) {
          clearInterval(timer)
          resolve(btn)
          return
        }
        if (Date.now() - started > 4000) {
          clearInterval(timer)
          resolve(null)
        }
      }, 150)
    })
    if (confirm) confirm.click()
  }

  async function openProjectMenu() {
    const titleTrash = findTitleTrash()
    const menu =
      titleTrash ||
      deepQueryAll('button, [role="button"]').find((el) => {
        if (!isShown(el)) return false
        const rect = el.getBoundingClientRect()
        if (rect.width > 64 || rect.height > 64) return false
        const label = plainLabel(accessibleName(el))
        return /more option|mais opco|more action|mais aco|opcoes do projeto|project option|overflow|more_vert/.test(
          label,
        )
      })
    if (!menu) return false
    await trustedClickElement(menu, { align: 'center' })
    await sleep(450)
    return true
  }

  async function deleteFromHomeCard(projectId) {
    const started = Date.now()
    let found = null
    while (Date.now() - started < 8000) {
      found = findProjectCard(projectId)
      if (found) break
      await sleep(250)
    }
    if (!found?.card) {
      return {
        ok: false,
        code: 'DELETE_CONTROL_MISSING',
        error: 'O card desse projeto não está na página inicial do Google Flow.',
        href: location.href,
      }
    }
    found.link.scrollIntoView({ block: 'center', inline: 'nearest' })
    found.card.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    found.link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    await sleep(250)
    const action = trashButtonOnCard(found.card)
    if (!action) {
      return {
        ok: false,
        code: 'DELETE_CONTROL_MISSING',
        error: 'Não encontrei a lixeira no card do projeto.',
        href: location.href,
      }
    }
    action.click()
    await sleep(400)
    await confirmDeleteDialog(action)
    const gone = await new Promise((resolve) => {
      const waitStarted = Date.now()
      const timer = setInterval(() => {
        if (!findProjectCard(projectId) || pageLooksMissing()) {
          clearInterval(timer)
          resolve(true)
          return
        }
        if (Date.now() - waitStarted > 12000) {
          clearInterval(timer)
          resolve(false)
        }
      }, 250)
    })
    if (!gone) {
      return {
        ok: false,
        code: 'DELETE_UNCONFIRMED',
        error: 'O Google Flow não confirmou a exclusão.',
        href: location.href,
      }
    }
    return { ok: true, alreadyGone: false, flowProjectId: projectId, href: location.href }
  }

  /**
   * Exclui pelo card da home do Flow (lixeira ao lado do nome).
   * Se a aba já está dentro do projeto, tenta o menu e depois a home.
   */
  async function deleteProjectOnPage(payload) {
    const expected = String(payload?.flowProjectId || '').trim().toLowerCase()
    const current = String(parseProjectId(location.href) || '').toLowerCase()
    if (pageLooksMissing()) {
      return { ok: true, alreadyGone: true, code: 'ALREADY_GONE', href: location.href }
    }
    if (!expected) {
      return {
        ok: false,
        code: 'PROJECT_NOT_FOUND',
        error: 'Sem ID do projeto no Google Flow.',
        href: location.href,
      }
    }
    if (current && current !== expected) {
      return {
        ok: false,
        code: 'PROJECT_MISMATCH',
        error: 'A aba não está no projeto Flow esperado.',
        href: location.href,
      }
    }

    if (current === expected) {
      await openProjectMenu()
      const action = findMenuExcluir() || findDeleteControl()
      if (action) {
        await trustedClickElement(action, { align: 'center' })
        await sleep(400)
        await confirmDeleteDialog(action)
        const gone = await new Promise((resolve) => {
          const started = Date.now()
          const timer = setInterval(() => {
            const nowId = String(parseProjectId(location.href) || '').toLowerCase()
            if (pageLooksMissing() || nowId !== expected) {
              clearInterval(timer)
              resolve(true)
              return
            }
            if (Date.now() - started > 12000) {
              clearInterval(timer)
              resolve(false)
            }
          }, 250)
        })
        if (gone) {
          return { ok: true, alreadyGone: false, flowProjectId: expected, href: location.href }
        }
      }
      location.assign('https://flow.google.com/')
      const left = await new Promise((resolve) => {
        const started = Date.now()
        const timer = setInterval(() => {
          if (!parseProjectId(location.href)) {
            clearInterval(timer)
            resolve(true)
            return
          }
          if (Date.now() - started > 8000) {
            clearInterval(timer)
            resolve(false)
          }
        }, 200)
      })
      if (!left) {
        return {
          ok: false,
          code: 'DELETE_CONTROL_MISSING',
          error: 'Não encontrei a lixeira dentro do projeto nem voltei à página inicial.',
          href: location.href,
        }
      }
      await sleep(600)
    }

    return deleteFromHomeCard(expected)
  }

  function pointOf(el) {
    const rect = el.getBoundingClientRect()
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      label: accessibleName(el).slice(0, 80),
    }
  }

  function elementOwnText(el) {
    let text = ''
    for (const node of el.childNodes) {
      if (node.nodeType === 3) text += node.textContent || ''
    }
    return plainLabel(text)
  }

  function isInsideProjectMenu(el) {
    let node = el.parentElement
    for (let depth = 0; depth < 8 && node; depth += 1) {
      const text = plainLabel(node.innerText || '')
      const hasRename = text.includes('renomear') || text.includes('rename')
      const hasTrashView = text.includes('ver lixeira')
      const hasDelete = text.includes('excluir') || text.includes('delete') || text.includes('apagar')
      if ((hasRename || hasTrashView) && hasDelete) return true
      if (text.length > 500) break
      node = node.parentElement
    }
    return false
  }

  function findMenuExcluir() {
    const pool = deepQueryAll(
      'button, a, div, span, li, p, [role="button"], [role="menuitem"], [role="menuitemradio"]',
    )
    const hits = []
    for (const el of pool) {
      if (!isShown(el)) continue
      const own = elementOwnText(el)
      const full = plainLabel(el.innerText || '')
      const named = plainLabel(accessibleName(el))
      if (isViewTrashLabel(full) || isViewTrashLabel(named) || isViewTrashLabel(own)) continue
      const leaf =
        own === 'excluir' ||
        own === 'delete' ||
        own === 'apagar' ||
        own === 'excluir projeto' ||
        full === 'excluir' ||
        full === 'delete' ||
        full === 'apagar' ||
        full === 'excluir projeto'
      if (!leaf && !(isExactDeleteAction(named) && full.length > 0 && full.length <= 40)) continue
      if (!isInsideProjectMenu(el)) continue
      const rect = el.getBoundingClientRect()
      if (rect.width < 8 || rect.height < 8 || rect.width > 360 || rect.height > 72) continue
      hits.push(el)
    }
    const rows = hits.filter((el) => {
      const full = plainLabel(el.innerText || '')
      const rect = el.getBoundingClientRect()
      if (rect.width < 64) return false
      if (full.includes('renomear') || full.includes('ver lixeira') || full.includes('rename')) return false
      return (
        full === 'excluir' ||
        full === 'delete' ||
        full === 'apagar' ||
        full === 'excluir projeto' ||
        /(^| )excluir( |$)/.test(full) ||
        /(^| )delete( |$)/.test(full) ||
        /(^| )apagar( |$)/.test(full)
      )
    })
    rows.sort((a, b) => {
      const ra = a.getBoundingClientRect()
      const rb = b.getBoundingClientRect()
      return ra.width * ra.height - rb.width * rb.height
    })
    return rows[0] || null
  }

  function isIconButton(el) {
    const rect = el.getBoundingClientRect()
    return rect.width >= 8 && rect.width <= 56 && rect.height >= 8 && rect.height <= 56
  }

  function findTitleTrash() {
    const buttons = deepQueryAll('button, [role="button"]').filter((el) => isShown(el))
    const pencil = buttons.find((el) =>
      /renomear|rename|edit project|editar projeto|edit title|editar titulo/.test(
        plainLabel(accessibleName(el)),
      ),
    )
    const sameRow = (anchor, el) => {
      if (!anchor || el === anchor || !isIconButton(el)) return false
      const rect = el.getBoundingClientRect()
      const origin = anchor.getBoundingClientRect()
      return Math.abs(rect.top - origin.top) < 28 && rect.left >= origin.left - 8
    }
    if (pencil) {
      const trash = buttons
        .filter((el) => sameRow(pencil, el) && !isViewTrashLabel(accessibleName(el)))
        .sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left)[0]
      if (trash) return trash
    }
    const named = buttons.find((el) => {
      if (!isIconButton(el)) return false
      const name = plainLabel(accessibleName(el))
      if (!name || isViewTrashLabel(name) || /renomear|rename/.test(name)) return false
      return /delete|excluir|apagar|trash|lixeira|bin/.test(name)
    })
    if (named) return named
    const icons = buttons.filter((el) => isIconButton(el) && !isViewTrashLabel(accessibleName(el)))
    const rights = []
    for (const left of icons) {
      const leftRect = left.getBoundingClientRect()
      const right = icons.find((el) => {
        if (el === left) return false
        const rect = el.getBoundingClientRect()
        if (Math.abs(rect.top - leftRect.top) > 14) return false
        const gap = rect.left - leftRect.right
        return gap >= -4 && gap <= 20
      })
      if (!right) continue
      const host = right.parentElement
      const text = plainLabel(host?.innerText || '')
      const hostButtons = host
        ? deepQueryAll('button, [role="button"]', host).filter((el) => isShown(el))
        : []
      if (text.length < 2 || text.length > 90 || hostButtons.length > 4) continue
      rights.push(right)
    }
    if (rights.length === 1) return rights[0]
    if (rights.length > 1) {
      rights.sort(
        (a, b) =>
          plainLabel(b.parentElement?.innerText || '').length -
          plainLabel(a.parentElement?.innerText || '').length,
      )
      const bestLen = plainLabel(rights[0].parentElement?.innerText || '').length
      const secondLen = plainLabel(rights[1].parentElement?.innerText || '').length
      if (bestLen >= secondLen + 4) return rights[0]
    }
    return null
  }

  function locateDeleteTarget(flowProjectId, where) {
    const id = String(flowProjectId || '').trim().toLowerCase()
    const href = location.href
    const urlId = String(parseProjectId(href) || '').toLowerCase()
    if (pageLooksMissing()) return { ok: true, phase: 'gone', href }
    const dialog = document.querySelector('[role="dialog"], [role="alertdialog"]')
    if (dialog && isShown(dialog)) {
      const confirm = deepQueryAll('button, [role="button"]', dialog).find((el) => {
        if (!isShown(el)) return false
        const name = accessibleName(el)
        return isExactDeleteAction(name) || /^(confirm|confirmar|ok)$/i.test(name.trim())
      })
      if (confirm) return { ok: true, phase: 'confirm', href, ...pointOf(confirm) }
    }
    const menuDelete = findMenuExcluir()
    if (menuDelete) return { ok: true, phase: 'delete', href, ...pointOf(menuDelete) }
    if (where === 'home') {
      const found = findProjectCard(id)
      if (!found?.card) return { ok: true, phase: 'absent', href }
      const trash = trashButtonOnCard(found.card)
      if (!trash || isViewTrashLabel(accessibleName(trash))) {
        const rect = found.card.getBoundingClientRect()
        return {
          ok: true,
          phase: 'reveal',
          href,
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(Math.min(rect.bottom - 16, rect.top + 28)),
        }
      }
      return { ok: true, phase: 'menu', href, ...pointOf(trash) }
    }
    if (urlId !== id) return { ok: true, phase: 'left', href }
    const titleTrash = findTitleTrash()
    if (titleTrash) return { ok: true, phase: 'menu', href, ...pointOf(titleTrash) }
    const menu = deepQueryAll('button, [role="button"]').find((el) => {
      if (!isShown(el)) return false
      const rect = el.getBoundingClientRect()
      if (rect.width > 64 || rect.height > 64) return false
      const label = plainLabel(accessibleName(el))
      return /more option|mais opco|more action|mais aco|opcoes do projeto|more_vert|\bmore\b|\bmenu\b/.test(
        label,
      )
    })
    if (menu) return { ok: true, phase: 'menu', href, ...pointOf(menu) }
    return { ok: true, phase: 'missing', href }
  }

  function onMessage(message, _sender, sendResponse) {
    if (!message || typeof message.type !== 'string') return false

    if (message.type === 'atlas-flow-v1.page.ping') {
      sendResponse({
        ok: true,
        pong: true,
        href: location.href,
        readyState: document.readyState,
        sensorVersion: globalThis.__ATLAS_FLOW_V1_SENSOR__.version,
        sensorBuildId: globalThis.__ATLAS_FLOW_V1_SENSOR__.buildId || null,
        projectIdFromUrl: parseProjectId(location.href),
      })
      return true
    }

    if (message.type === 'atlas-flow-v1.page.inspect') {
      try {
        sendResponse({ ok: true, observation: buildObservation() })
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      return true
    }

    if (message.type === 'atlas-flow-v1.page.ownDelete') {
      const id = String(message.payload?.flowProjectId || '').trim().toLowerCase()
      if (id) ownDeleteUntil.set(id, Date.now() + 60_000)
      sendResponse({ ok: true })
      return true
    }

    if (message.type === 'atlas-flow-v1.page.locateDelete') {
      try {
        sendResponse(
          locateDeleteTarget(message.payload?.flowProjectId, message.payload?.where || 'project'),
        )
      } catch (error) {
        sendResponse({
          ok: false,
          phase: 'missing',
          error: error instanceof Error ? error.message : String(error),
        })
      }
      return true
    }

    if (message.type === 'atlas-flow-v1.page.deleteProject') {
      void deleteProjectOnPage(message.payload || {})
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            code: 'DELETE_FAILED',
            error: error instanceof Error ? error.message : String(error),
          }),
        )
      return true
    }

    if (message.type === 'atlas-flow-v1.page.renameProject') {
      void applyRequestedProjectTitle(message.payload?.requestedTitle || '')
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        )
      return true
    }

    if (message.type === 'atlas-flow-v1.page.ensureProject') {
      void ensureNewProject(message.payload || {})
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            certainty: 'not_sent',
            error: error instanceof Error ? error.message : String(error),
          }),
        )
      return true
    }

    if (message.type === 'atlas-flow-v1.page.openUploadUi') {
      void openUploadUiSequentially(message.payload?.expectedFlowProjectId || null)
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        )
      return true
    }

    if (message.type === 'atlas-flow-v1.page.waitForProjectReady') {
      void waitForProjectReady({
        expectedFlowProjectId: message.payload?.expectedFlowProjectId || null,
        forOperation: message.payload?.forOperation || 'open_upload',
        timeoutMs: message.payload?.timeoutMs,
      })
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        )
      return true
    }

    if (message.type === 'atlas-flow-v1.page.trashResult') {
      void trashGeneratedImage(
        message.payload?.flowMediaId || '',
        message.payload?.expectedFlowProjectId || null,
      )
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        )
      return true
    }

    if (message.type === 'atlas-flow-v1.page.downloadResult') {
      void downloadGeneratedImage(
        message.payload?.flowMediaId || '',
        message.payload?.resolution || '',
        message.payload?.expectedFlowProjectId || null,
      )
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        )
      return true
    }

    if (message.type === 'atlas-flow-v1.page.ensureSingerCharacter') {
      void ensureSingerCharacter(message.payload || {}, message.payload?.expectedFlowProjectId || null)
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        )
      return true
    }

    if (message.type === 'atlas-flow-v1.page.attachFiles') {
      void attachFilesToPrompt(message.payload?.files || [], message.payload?.expectedFlowProjectId || null, {
        promptText: message.payload?.promptText || null,
        runGenerate: message.payload?.runGenerate === true,
        preBound: message.payload?.preBound || [],
      })
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            certainty: 'not_sent',
            error: error instanceof Error ? error.message : String(error),
          }),
        )
      return true
    }

    if (message.type === 'atlas-flow-v1.page.reconcileUploadIdentities') {
      void reconcileUploadIdentities(
        message.payload?.references || [],
        message.payload?.expectedFlowProjectId || null,
      )
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        )
      return true
    }

    if (message.type === 'atlas-flow-v1.page.attachBoundReferences') {
      void attachBoundReferencesOnly(
        message.payload?.bounds || [],
        message.payload?.expectedFlowProjectId || null,
      )
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            didUpload: false,
            didWritePrompt: false,
            didGenerate: false,
          }),
        )
      return true
    }

    if (message.type === 'atlas-flow-v1.page.writePrompt') {
      const text = typeof message.payload?.text === 'string' ? message.payload.text : ''
      void writePromptText(text)
        .then((written) =>
          sendResponse({
            ...written,
            promptText: readPromptText(),
            observation: buildObservation(),
          }),
        )
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        )
      return true
    }

    if (message.type === 'atlas-flow-v1.page.verifyDirectImageComposer') {
      void verifyDirectImageComposerOnly(message.payload?.expectedFlowProjectId || null)
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            intent: DIRECT_IMAGE_GENERATION_INTENT,
            didGenerate: false,
          }),
        )
      return true
    }

    if (message.type === 'atlas-flow-v1.page.promptAndGenerate') {
      void promptAndGenerateOnly(
        message.payload?.expectedFlowProjectId || null,
        message.payload?.promptText || null,
        message.payload?.imageSettings || null,
      )
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            didUpload: false,
            didAttach: false,
            didWritePrompt: false,
            didGenerate: false,
            realFlowValidated: false,
          }),
        )
      return true
    }

    if (message.type === 'atlas-flow-v1.page.observeGenerationResult') {
      void observeGenerationResult(message.payload?.expectedFlowProjectId || null, {
        timeoutMs: message.payload?.timeoutMs,
        knownStems: message.payload?.knownStems,
      })
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            realFlowValidated: false,
          }),
        )
      return true
    }

    if (message.type === 'atlas-flow-v1.page.preparePreSubmitBaseline') {
      void preparePreSubmitBaseline(message.payload?.expectedFlowProjectId || null, {
        attemptId: message.payload?.attemptId || null,
        commandId: message.payload?.commandId || null,
        promptText: message.payload?.promptText || '',
      })
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            srcs: [],
            mediaIds: [],
            evidenceCount: 0,
          }),
        )
      return true
    }

    if (message.type === 'atlas-flow-v1.page.listRecoveryCandidates') {
      void listRecoveryCandidatesOnce(message.payload?.expectedFlowProjectId || null, {
        knownStems: message.payload?.knownStems,
        excludeSrcs: message.payload?.excludeSrcs,
        excludeMediaIds: message.payload?.excludeMediaIds,
      })
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            candidates: [],
          }),
        )
      return true
    }

    if (message.type === 'atlas-flow-v1.page.snapshotGenerationBaseline') {
      try {
        sendResponse(snapshotGenerationBaseline())
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          srcs: [],
          evidenceCount: 0,
        })
      }
      return true
    }

    if (message.type === 'atlas-flow-v1.page.stopGeneration') {
      void (async () => {
        const stopped = await clickGenerationStop()
        const cleared = await clearComposerAttachments()
        return {
          ...stopped,
          ok: stopped.ok === true || cleared.ok === true,
          clearedAttachments: cleared,
        }
      })()
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            clicked: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        )
      return true
    }

    if (message.type === 'atlas-flow-v1.page.clearComposerAttachments') {
      void clearComposerAttachments()
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            removed: 0,
            error: error instanceof Error ? error.message : String(error),
          }),
        )
      return true
    }

    if (message.type === 'atlas-flow-v1.page.sampleGenerationProgress') {
      try {
        sendResponse(
          sampleGenerationProgress({
            attemptId: message.payload?.attemptId || null,
            excludeSrcs: message.payload?.excludeSrcs,
            excludeMediaIds: message.payload?.excludeMediaIds,
            baselineEvidenceCount: message.payload?.baselineEvidenceCount,
          }),
        )
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          attemptPercent: null,
          busy: false,
        })
      }
      return false
    }

    if (message.type === 'atlas-flow-v1.page.captureGenerationBytes') {
      void captureGenerationBytesOnce(message.payload?.expectedFlowProjectId || null, {
        attemptId: message.payload?.attemptId || null,
        knownStems: message.payload?.knownStems,
        maxCandidates: message.payload?.maxCandidates,
        promptFingerprint: message.payload?.promptFingerprint,
        settleTimeoutMs: message.payload?.settleTimeoutMs,
        skipSettle: message.payload?.skipSettle === true,
        excludeSrcs: message.payload?.excludeSrcs,
        excludeShas: message.payload?.excludeShas,
        excludeMediaIds: message.payload?.excludeMediaIds,
        allowSrcs: message.payload?.allowSrcs,
        allowMediaIds: message.payload?.allowMediaIds,
        explicitSelectionKeys: message.payload?.explicitSelectionKeys,
        originProofByKey: message.payload?.originProofByKey,
        requirePositiveOrigin: message.payload?.requirePositiveOrigin === true,
      })
        .then((result) => sendResponse(result))
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            realFlowValidated: false,
            bytesCaptured: false,
            correlationUncertain: true,
          }),
        )
      return true
    }

    return false
  }

  globalThis.__ATLAS_FLOW_V1_SENSOR__.onMessage = onMessage
  const ownDeleteUntil = new Map()

  function cardForClick(el) {
    let node = el
    let found = null
    for (let depth = 0; depth < 8 && node; depth += 1) {
      const ids = [
        ...new Set(
          deepQueryAll('a[href]', node)
            .map((link) =>
              `${link.getAttribute('href') || ''} ${link.href || ''}`.match(
                /\/project\/([a-f0-9-]{8,})/i,
              )?.[1],
            )
            .filter(Boolean)
            .map((id) => id.toLowerCase()),
        ),
      ]
      if (ids.length > 1) break
      if (ids.length === 1) found = { id: ids[0], card: node }
      node = node.parentElement
    }
    return found
  }

  function onUserDeleteClick(event) {
    if (!event.isTrusted) return
    const raw = event.target
    if (!(raw instanceof Element)) return
    const el = raw.closest('button, [role="button"], [role="menuitem"]')
    if (!el) return
    const fromCard = cardForClick(el)
    const urlId = String(parseProjectId(location.href) || '').toLowerCase()
    const id = fromCard?.id || urlId
    if (!id || (ownDeleteUntil.get(id) || 0) > Date.now()) return
    const labeled = isDeleteLabel(accessibleName(el))
    const trash = fromCard?.card ? trashButtonOnCard(fromCard.card) === el : false
    if (!labeled && !trash) return
    const watchId = id
    const startedOnProject = urlId === watchId
    const started = Date.now()
    const timer = setInterval(() => {
      const nowUrl = String(parseProjectId(location.href) || '').toLowerCase()
      const card = findProjectCard(watchId)
      const gone =
        pageLooksMissing() ||
        (fromCard && !card) ||
        (startedOnProject && nowUrl !== watchId)
      if (gone) {
        clearInterval(timer)
        try {
          chrome.runtime.sendMessage({
            type: 'atlas-flow-v1.flowProjectDeletedByUser',
            flowProjectId: watchId,
          })
        } catch {
          /* ignore */
        }
        return
      }
      if (Date.now() - started > 12000) clearInterval(timer)
    }, 400)
  }

  document.addEventListener('click', onUserDeleteClick, true)
  globalThis.__ATLAS_FLOW_V1_SENSOR__.onDeleteClick = onUserDeleteClick

  chrome.runtime.onMessage.addListener(onMessage)
})()
