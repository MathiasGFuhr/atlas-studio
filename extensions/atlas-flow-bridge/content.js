;(function atlasFlowBridgeContent() {
  if (window.__atlasFlowBridgeContentLoaded) return
  window.__atlasFlowBridgeContentLoaded = true

  const LOGIN_URL = 'https://accounts.google.com/'

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  function visible(el) {
    if (!el) return false
    const style = window.getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false
    }
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  function textOf(el) {
    return (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim()
  }

  /** 404 real do projeto — só pela URL. Texto do body gera falso positivo durante upload/UI. */
  function isConfirmedProject404(url = location.href) {
    const raw = String(url)
    return /\/404\b/i.test(raw) || /[?&]reason=project\b/i.test(raw)
  }

  function isNotFoundPage(url = location.href) {
    const raw = String(url)
    if (isConfirmedProject404(raw) || /\/project\/new(?:\/|[?#]|$)/i.test(raw)) {
      return true
    }
    // Só no probe/create — não usar para apagar vínculo no Atlas.
    const body = textOf(document.body).toLowerCase()
    return /projeto não encontrado|project not found/.test(body)
  }

  function parseProjectId(url = location.href) {
    const raw = String(url)
    if (isNotFoundPage(raw)) return null
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

  function isLoginPage() {
    const href = location.href
    if (/accounts\.google\.com/i.test(href)) return true
    const body = textOf(document.body).toLowerCase()
    const hasSignIn =
      /sign in|fazer login|iniciar sessão|acessar sua conta/.test(body) && /google/.test(body)
    const hasFlowChrome = Boolean(
      document.querySelector('[aria-label="Edit project"], [aria-label="Editar projeto"]') ||
        Array.from(document.querySelectorAll('button')).some((btn) =>
          /novo projeto|new project/i.test(textOf(btn)),
        ),
    )
    return hasSignIn && !hasFlowChrome && !parseProjectId()
  }

  function findButtonByText(patterns) {
    const buttons = Array.from(
      document.querySelectorAll('button, a[role="button"], div[role="button"]'),
    )
    return buttons.find((btn) => {
      if (!visible(btn)) return false
      const label = `${btn.getAttribute('aria-label') || ''} ${textOf(btn)}`.toLowerCase()
      return patterns.some((pattern) => pattern.test(label))
    })
  }

  function findNewProjectButton() {
    const candidates = Array.from(
      document.querySelectorAll('button, a[role="button"], div[role="button"], a'),
    ).filter((el) => {
      if (!visible(el)) return false
      if (/\/project\/new/i.test(el.getAttribute('href') || '')) return false
      const label = `${el.getAttribute('aria-label') || ''} ${textOf(el)}`
      return (
        /^(new project|novo projeto|create project|criar projeto)$/i.test(label.trim()) ||
        (/new project|novo projeto|create project|criar projeto/i.test(label) &&
          /project|projeto/i.test(label))
      )
    })
    return (
      document.querySelector('button[aria-label="New project"]') ||
      document.querySelector('button[aria-label="Novo projeto"]') ||
      candidates[0] ||
      null
    )
  }

  async function clickNewProject() {
    if (isNotFoundPage()) {
      throw Object.assign(new Error('Página de projeto inexistente no Flow.'), {
        code: 'project_not_found',
      })
    }
    // Já estamos dentro de um projeto válido — não criar outro.
    if (parseProjectId()) return true

    const btn = await waitFor(() => findNewProjectButton(), 12000)
    if (!btn) {
      throw Object.assign(
        new Error(
          'Botão “New project” / “Novo projeto” não encontrado na home do Flow. Confirme o login e tente de novo.',
        ),
        { code: 'create_failed' },
      )
    }
    btn.click()
    await sleep(120)
    return true
  }

  const DATED_TITLE_RE =
    /\b(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|feb|apr|may|aug|sep|oct|dec)[a-z.]*\s+\d{1,2}\s*[-–]\s*\d{1,2}:\d{2}\b/i

  function isDefaultDatedTitle(label) {
    return DATED_TITLE_RE.test(String(label || '').trim())
  }

  function findProjectTitleElement() {
    const nodes = Array.from(
      document.querySelectorAll(
        'button, [role="button"], h1, h2, [contenteditable], div[tabindex], span, a, p',
      ),
    ).filter((el) => {
      if (!visible(el)) return false
      const label = textOf(el).trim()
      if (!label || label.length > 48) return false
      return isDefaultDatedTitle(label)
    })
    nodes.sort((a, b) => textOf(a).length - textOf(b).length)
    if (nodes[0]) return nodes[0]
    return Array.from(
      document.querySelectorAll('button, [role="button"], h1, h2, [contenteditable], div[tabindex], span'),
    ).find((el) => {
      if (!visible(el)) return false
      const label = `${el.getAttribute('aria-label') || ''} ${textOf(el)}`.trim()
      if (!label || label.length > 80) return false
      return /edit project|editar projeto|rename|renomear/i.test(label)
    })
  }

  function findOverflowMenuButton() {
    return (
      document.querySelector('button[aria-label*="More" i]') ||
      document.querySelector('button[aria-label*="Mais" i]') ||
      document.querySelector('button[aria-label*="menu" i]') ||
      Array.from(document.querySelectorAll('button, [role="button"]')).find((el) => {
        if (!visible(el)) return false
        const label = `${el.getAttribute('aria-label') || ''} ${textOf(el)}`
        return /more options|mais opções|more|mais|menu/i.test(label) && textOf(el).length <= 2
      })
    )
  }

  function findEditProjectButton() {
    return (
      document.querySelector('button[aria-label="Edit project"]') ||
      document.querySelector('button[aria-label="Editar projeto"]') ||
      document.querySelector('button[aria-label*="Rename" i]') ||
      document.querySelector('button[aria-label*="Renomear" i]') ||
      findProjectTitleElement() ||
      findButtonByText([
        /^edit project$/,
        /^editar projeto$/,
        /^rename$/,
        /^renomear$/,
        /edit project/i,
        /editar projeto/i,
        /rename/i,
        /renomear/i,
      ])
    )
  }

  function readAccountHint() {
    const candidates = Array.from(
      document.querySelectorAll('[data-email], [aria-label*="@"], img[alt*="@"]'),
    )
    for (const el of candidates) {
      const raw =
        el.getAttribute('data-email') ||
        el.getAttribute('aria-label') ||
        el.getAttribute('alt') ||
        textOf(el)
      const match = String(raw).match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
      if (match) return match[0]
    }
    return null
  }

  async function waitFor(predicate, timeoutMs, intervalMs = 100) {
    const immediate = predicate()
    if (immediate) return immediate

    return new Promise((resolve) => {
      let settled = false
      const finish = (value) => {
        if (settled) return
        settled = true
        observer.disconnect()
        clearInterval(poll)
        clearTimeout(timer)
        resolve(value)
      }

      const check = () => {
        const value = predicate()
        if (value) finish(value)
      }

      const observer = new MutationObserver(() => check())
      observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      })
      const poll = setInterval(check, intervalMs)
      const timer = setTimeout(() => finish(null), timeoutMs)
    })
  }

  function findNameInput() {
    const editables = Array.from(
      document.querySelectorAll(
        'input[type="text"], input:not([type]), textarea, [contenteditable="true"], [contenteditable=""]',
      ),
    ).filter((el) => visible(el))
    return (
      editables.find((el) => {
        const aria = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('placeholder') || ''}`.toLowerCase()
        return /project|projeto|name|nome|title|título/.test(aria)
      }) ||
      editables.find((el) => el === document.activeElement) ||
      editables.find((el) => isDefaultDatedTitle(textOf(el) || el.value)) ||
      editables[0] ||
      null
    )
  }

  function setEditableValue(el, value) {
    if (el.isContentEditable) {
      el.focus()
      el.textContent = value
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return
    }
    el.focus()
    el.select?.()
    const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
    proto?.set?.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  async function openRenameUi() {
    // 1) Título padrão clicável (ex.: "nov. 08 - 20:40")
    const title = findProjectTitleElement()
    if (title) {
      title.click()
      await sleep(250)
      title.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }))
      await sleep(350)
      if (findNameInput()) return true
    }

    // 2) Botão Edit / Rename direto
    const editBtn = findEditProjectButton()
    if (editBtn && editBtn !== title) {
      editBtn.click()
      await sleep(400)
      if (findNameInput()) return true
    }

    // 3) Menu ⋮ → Rename
    const menu = findOverflowMenuButton()
    if (menu) {
      menu.click()
      await sleep(350)
      const renameItem =
        findButtonByText([/^rename$/i, /^renomear$/i, /rename project/i, /renomear projeto/i]) ||
        Array.from(document.querySelectorAll('[role="menuitem"], [role="option"], button, div')).find(
          (el) => visible(el) && /rename|renomear/i.test(textOf(el)),
        )
      if (renameItem) {
        renameItem.click()
        await sleep(400)
        if (findNameInput()) return true
      }
    }

    return Boolean(findNameInput())
  }

  function findDeleteAction() {
    const patterns = [
      /^delete project$/i,
      /^excluir projeto$/i,
      /^delete$/i,
      /^excluir$/i,
      /^move to trash$/i,
      /^mover para a lixeira$/i,
      /^move to bin$/i,
      /delete project/i,
      /excluir projeto/i,
      /move to trash/i,
      /mover para a lixeira/i,
    ]
    return (
      findButtonByText(patterns) ||
      Array.from(
        document.querySelectorAll('[role="menuitem"], [role="option"], button, div, span, a'),
      ).find((el) => {
        if (!visible(el)) return false
        const label = `${el.getAttribute('aria-label') || ''} ${textOf(el)}`.trim()
        if (!label || label.length > 48) return false
        return /delete|excluir|trash|lixeira|bin/i.test(label) && !/undo|desfazer/i.test(label)
      })
    )
  }

  async function confirmDeleteDialog() {
    const confirmBtn = await waitFor(
      () =>
        findButtonByText([
          /^delete$/i,
          /^excluir$/i,
          /^confirm$/i,
          /^confirmar$/i,
          /^move to trash$/i,
          /^mover para a lixeira$/i,
        ]) ||
        document.querySelector(
          'button[aria-label="Delete"], button[aria-label="Excluir"], button[aria-label="Confirm"], button[aria-label="Confirmar"]',
        ),
      4000,
    )
    confirmBtn?.click()
    await sleep(300)
  }

  async function deleteCurrentProject() {
    if (isNotFoundPage()) {
      return { ok: true, alreadyGone: true, remoteId: parseProjectId() }
    }
    const remoteId = parseProjectId()
    if (!remoteId) {
      throw Object.assign(new Error('Nenhum projeto Flow aberto nesta aba para excluir.'), {
        code: 'project_not_found',
      })
    }

    const menu = findOverflowMenuButton()
    if (menu) {
      menu.click()
      await sleep(350)
    }

    let action = findDeleteAction()
    if (!action) {
      const title = findProjectTitleElement()
      title?.click()
      await sleep(250)
      findOverflowMenuButton()?.click()
      await sleep(350)
      action = findDeleteAction()
    }

    if (!action) {
      throw Object.assign(
        new Error('Não encontrei “Excluir projeto” no menu do Google Flow.'),
        { code: 'delete_failed' },
      )
    }
    action.click()
    await sleep(400)
    await confirmDeleteDialog()

    const gone = await waitFor(
      () => (isNotFoundPage() || parseProjectId() !== remoteId ? true : null),
      20000,
    )
    if (!gone && !isNotFoundPage()) {
      throw Object.assign(new Error('O Google Flow não confirmou a exclusão.'), {
        code: 'delete_failed',
      })
    }
    return { ok: true, remoteId }
  }

  async function renameProject(desiredName) {
    let input = findNameInput()
    for (let attempt = 0; attempt < 6 && !input; attempt += 1) {
      await openRenameUi()
      input = findNameInput()
      if (!input) await sleep(180)
    }

    if (!input) {
      throw Object.assign(
        new Error(
          'Não foi possível abrir o rename do projeto (título “nov. 08 - …” / menu). A UI do Flow pode ter mudado.',
        ),
        { code: 'rename_failed' },
      )
    }

    setEditableValue(input, desiredName)
    await sleep(60)

    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }),
    )
    input.dispatchEvent(
      new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }),
    )

    const confirm =
      findButtonByText([/^save$/i, /^salvar$/i, /^done$/i, /^concluído$/i, /^ok$/i]) ||
      document.querySelector('button[aria-label="Save"], button[aria-label="Salvar"]')
    confirm?.click()

    const renamed = await waitFor(() => {
      const heading = textOf(document.body)
      return heading.includes(desiredName) ? true : null
    }, 8000)

    const current = input.isContentEditable
      ? textOf(input)
      : String(input.value || '').trim()
    if (!renamed && current !== desiredName) {
      throw Object.assign(new Error('Falha ao confirmar o novo nome no Google Flow.'), {
        code: 'rename_failed',
      })
    }
    return true
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

  function extFromMime(mime) {
    const value = String(mime || '').toLowerCase()
    if (value.includes('jpeg') || value.includes('jpg')) return '.jpg'
    if (value.includes('webp')) return '.webp'
    if (value.includes('gif')) return '.gif'
    if (value.includes('png')) return '.png'
    return '.png'
  }

  function fileNameFromReference(ref, index) {
    const fromPayload = String(ref?.fileName || '').trim()
    if (fromPayload) return fromPayload
    const label = String(ref?.label || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60)
    const ext = extFromMime(ref?.mimeType)
    if (label) return `${label}${ext}`
    return `atlas-ref-${index + 1}${ext}`
  }

  function fileFromBase64(ref, index) {
    if (!ref?.base64) return null
    try {
      const binary = atob(String(ref.base64))
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
      const mime = ref.mimeType || 'image/png'
      const name = fileNameFromReference(ref, index)
      return new File([bytes], name, { type: mime })
    } catch {
      return null
    }
  }

  function labelBlob(el) {
    return `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''} ${textOf(el)}`
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  }

  function isCollectionActionLabel(label) {
    return /cole[cç][aã]o|collection|nova cole|new collection|criar cole|create collection|folder|pasta/.test(
      label,
    )
  }

  function clickByLabels(patterns, { avoidCollection = true } = {}) {
    const nodes = Array.from(
      document.querySelectorAll(
        'button, a[role="button"], div[role="button"], span[role="button"], [role="menuitem"], [role="option"], [aria-label], [title]',
      ),
    )
    const match = nodes.find((el) => {
      if (!visible(el)) return false
      const label = labelBlob(el)
      if (avoidCollection && isCollectionActionLabel(label)) return false
      return patterns.some((pattern) => label.includes(pattern))
    })
    if (match) {
      match.click()
      return match
    }
    return null
  }

  function findFileInputs() {
    return deepQueryAll('input[type="file"]').filter((el) => {
      const accept = (el.getAttribute('accept') || '').toLowerCase()
      if (accept && !/(image|\*|video|media|png|jpe?g|webp|gif)/i.test(accept)) return false
      return true
    })
  }

  function mark(el) {
    const id = `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    el.setAttribute('data-atlas-el', id)
    return id
  }

  function ensurePageHook() {
    if (document.documentElement.dataset.atlasFlowHook === '1') return
    try {
      const script = document.createElement('script')
      script.src = chrome.runtime.getURL('pageUpload.js')
      script.async = false
      script.dataset.atlasFlowHook = '1'
      ;(document.documentElement || document.head).appendChild(script)
      document.documentElement.dataset.atlasFlowHook = '1'
    } catch {
      /* ignore */
    }
  }

  function pageMessage(payload, expectType, timeoutMs = 4000) {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        window.removeEventListener('message', onMessage)
        resolve(null)
      }, timeoutMs)
      function onMessage(event) {
        const data = event.data
        if (!data || data.source !== 'atlas-flow-bridge-hook') return
        if (data.requestId !== requestId) return
        if (expectType && data.type !== expectType) return
        clearTimeout(timer)
        window.removeEventListener('message', onMessage)
        resolve(data)
      }
      window.addEventListener('message', onMessage)
      window.postMessage({ source: 'atlas-flow-bridge-content', requestId, ...payload }, '*')
    })
  }

  async function armPageUpload(files) {
    ensurePageHook()
    await sleep(40)
    // File é structured-cloneable — evita reencode base64 de fotos grandes.
    return pageMessage({ type: 'arm-upload', files }, 'armed', 2500)
  }

  async function disarmPageUpload() {
    return pageMessage({ type: 'disarm-upload' }, 'disarmed', 1500)
  }

  async function pageCmd(cmd, { el, files, text, key } = {}, timeoutMs = 4000) {
    const id = el ? mark(el) : null
    const data = await pageMessage(
      {
        type: 'page-cmd',
        cmd,
        id,
        files: files || [],
        text: text || '',
        key: key || '',
      },
      'page-result',
      timeoutMs,
    )
    return data?.result ?? 0
  }

  function findPromptBox() {
    const nodes = deepQueryAll(
      'textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"]',
    ).filter(visible)
    const scored = nodes
      .map((el) => {
        const label = labelBlob(el)
        const rect = el.getBoundingClientRect()
        let score = rect.width * rect.height
        if (/o que você quer criar|what do you want to create|prompt|descreva|describe/.test(label)) {
          score += 50_000
        }
        if (/search|buscar|pesquisar|filter/.test(label)) score -= 80_000
        if (rect.top > window.innerHeight * 0.45) score += 8_000
        if (rect.height < 24) score -= 5_000
        return { el, score }
      })
      .sort((a, b) => b.score - a.score)
    return scored[0]?.el || null
  }

  function mentionNeedles(label, references = []) {
    const base = String(label || '').toLowerCase().trim()
    const out = new Set()
    if (base) {
      out.add(base)
      out.add(base.replace(/\s+/g, '-'))
      out.add(base.replace(/\s+/g, ''))
    }
    for (const ref of references || []) {
      const refLabel = String(ref?.label || '').toLowerCase().trim()
      const fileName = String(ref?.fileName || '').toLowerCase().trim()
      const matches =
        !base ||
        !refLabel ||
        refLabel === base ||
        refLabel.includes(base) ||
        base.includes(refLabel)
      if (!matches) continue
      if (refLabel) {
        out.add(refLabel)
        out.add(refLabel.replace(/\s+/g, '-'))
        out.add(refLabel.replace(/\s+/g, ''))
      }
      if (fileName) {
        out.add(fileName)
        out.add(fileName.replace(/\.[a-z0-9]+$/, ''))
      }
    }
    return [...out].filter(Boolean)
  }

  function isMentionNoiseLabel(label) {
    return /pesquisar recursos|search resources|enviar m[ií]dia|upload|incluir no comando|add to prompt|agente|nano banana|fechar|close|cole[cç][aã]o|collection|nova cole/.test(
      label,
    )
  }

  function findAtMentionRoot() {
    const roots = deepQueryAll(
      '[role="listbox"], [role="menu"], [data-radix-popper-content-wrapper], [data-radix-menu-content]',
    ).filter(visible)
    if (roots.length) return roots[0]
    // Fallback: painel com miniaturas perto do compositor.
    const withImgs = deepQueryAll('div, section, ul').filter((el) => {
      if (!visible(el)) return false
      const rect = el.getBoundingClientRect()
      if (rect.height < 40 || rect.height > 480 || rect.width < 120) return false
      if (rect.bottom < window.innerHeight * 0.35) return false
      const imgs = el.querySelectorAll?.('img') || []
      return imgs.length > 0 && imgs.length < 40
    })
    return withImgs.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0] || null
  }

  function findMentionMenuItems(root = null) {
    const scope = root || document
    const selectors =
      '[role="option"], [role="menuitem"], [role="listitem"], button, div[role="button"], div[tabindex], li, a'
    const nodes = root
      ? Array.from(scope.querySelectorAll?.(selectors) || [])
      : deepQueryAll(selectors)
    return nodes.filter((el) => {
      if (!visible(el)) return false
      const label = labelBlob(el)
      if (isMentionNoiseLabel(label)) return false
      const hasImg = Boolean(el.querySelector?.('img'))
      if (!label && !hasImg) return false
      if (label.length > 180) return false
      return true
    })
  }

  function scoreMentionItem(el, needles) {
    const text = labelBlob(el)
    let score = 0
    if (el.querySelector?.('img')) score += 20
    for (const needle of needles) {
      if (!needle) continue
      if (text === needle) score += 100
      else if (text.includes(needle)) score += 60
      else if (needle.includes(text) && text.length >= 3) score += 30
    }
    return score
  }

  async function pickMentionFromMenu(label, references = []) {
    const needles = mentionNeedles(label, references)
    const started = Date.now()
    while (Date.now() - started < 4500) {
      const root = findAtMentionRoot()
      const items = findMentionMenuItems(root)
      const ranked = items
        .map((el) => ({ el, score: scoreMentionItem(el, needles) }))
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score)
      const match = ranked[0]?.el || (needles.length ? null : items.find((el) => el.querySelector?.('img')))
      if (match) {
        match.click()
        await sleep(320)
        return true
      }
      await sleep(160)
    }
    return false
  }

  function findResourceSearchInput() {
    return deepQueryAll('input[type="search"], input[type="text"], input:not([type])').find((el) => {
      if (!visible(el)) return false
      const ph = `${el.getAttribute('placeholder') || ''} ${el.getAttribute('aria-label') || ''}`.toLowerCase()
      return /pesquisar recursos|search resources|pesquisar|search/.test(ph)
    })
  }

  function findResourceEntries(needles = []) {
    const entries = deepQueryAll(
      '[role="option"], [role="listitem"], [role="row"], button, div[tabindex], a, li',
    ).filter((el) => {
      if (!visible(el)) return false
      const label = labelBlob(el)
      if (!label || label.length < 2 || label.length > 200) return false
      if (isMentionNoiseLabel(label)) return false
      if (
        /^(tudo|imagens|v[ií]deos|vozes|personagens|avatares|envios|uploads)$/i.test(label.trim())
      ) {
        return false
      }
      return true
    })
    if (!needles.length) return entries
    return entries
      .map((el) => ({ el, score: scoreMentionItem(el, needles) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((row) => row.el)
  }

  function hardClick(el) {
    if (!el) return false
    try {
      el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    } catch {
      /* ignore */
    }
    try {
      const rect = el.getBoundingClientRect()
      const opts = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }
      el.dispatchEvent(new PointerEvent('pointerdown', opts))
      el.dispatchEvent(new MouseEvent('mousedown', opts))
      el.dispatchEvent(new PointerEvent('pointerup', opts))
      el.dispatchEvent(new MouseEvent('mouseup', opts))
      el.dispatchEvent(new MouseEvent('click', opts))
    } catch {
      try {
        el.click()
      } catch {
        /* ignore */
      }
    }
    return true
  }

  function resourcePickerRoot() {
    const search = deepQueryAll('input').find((el) => visible(el) &&
      /pesquisar recursos|search resources/i.test(
        [el.getAttribute('placeholder'), el.getAttribute('aria-label')].join(' '),
      ),
    )
    if (!search) return null
    for (let node = search.parentElement; node && node !== document.body; node = node.parentElement) {
      if (pickerIncludeButtons(node).length) return node
    }
    return null
  }

  function pickerIncludeButtons(root) {
    return Array.from(root.querySelectorAll('button, [role="button"]')).filter((el) =>
      visible(el) && /incluir no comando|incluir no prompt|add to prompt|add to command|include in prompt|use in prompt/.test(labelBlob(el)),
    )
  }

  function findIncluirNoComandoButton(allowDisabled = false) {
    const root = resourcePickerRoot()
    if (!root) return null
    return pickerIncludeButtons(root).find((el) => allowDisabled ||
      !(el.matches(':disabled, [disabled], [aria-disabled="true"], [data-disabled="true"]')),
    )
  }

  async function clickIncluirNoComando() {
    // Só DOM — NÃO injetar pageUpload aqui (Flow marca como “atividade incomum”).
    const started = Date.now()
    let btn = null
    while (Date.now() - started < 6000) {
      btn = findIncluirNoComandoButton(false)
      if (btn) break
      await sleep(200)
    }
    if (!btn) return false
    btn.click()
    return true
  }

  function entryLooksLoading(el) {
    if (!el?.isConnected) return true
    if (el.getAttribute?.('aria-busy') === 'true') return true
    if (el.querySelector?.('[role="progressbar"], [aria-busy="true"]')) return true
    const label = labelBlob(el)
    if (/carregando|loading|processando|processing/.test(label)) return true
    const img = el.querySelector?.('img')
    if (img) {
      const ready = img.naturalWidth > 0 && (img.complete || img.naturalHeight > 0)
      if (!ready) return true
    }
    return false
  }

  function findReadyEnviosMatch(needles) {
    const fromMenu = findResourceEntries(needles)
    const fromEnvios = listEnviosEntries()
      .filter((entry) => needles.some((n) => entry.key.includes(n)))
      .map((entry) => entry.el)
    const all = []
    const seen = new Set()
    for (const el of [...fromMenu, ...fromEnvios]) {
      if (!el || seen.has(el)) continue
      seen.add(el)
      all.push(el)
    }
    const ready = all.filter((el) => !entryLooksLoading(el))
    // Prefere item com imagem já carregada.
    return (
      ready.find((el) => el.querySelector?.('img')) ||
      ready[0] ||
      null
    )
  }

  async function waitForReadyEnviosMatch(needles, timeoutMs = 10000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const match = findReadyEnviosMatch(needles)
      if (match) return match
      await sleep(350)
    }
    return findReadyEnviosMatch(needles)
  }

  /** Modal “Pesquisar recursos”: escolhe UMA mídia já pronta e clica Incluir. Sem upload. */
  async function includeResourceFromModal(label, references = []) {
    if (!resourceModalOpen()) {
      const opened = await openResourceModalViaPlus()
      if (!opened) return false
    }
    const ref =
      (references || []).find(
        (item) => String(item?.label || '').trim().toLowerCase() === String(label || '').trim().toLowerCase(),
      ) || {}
    const located = await findUploadsMatch(
      {
        label,
        fileName: ref.fileName || '',
        flowUploadKey: ref.flowUploadKey || '',
      },
      { timeoutMs: 18000, verifyIncludeEnabled: true, keepOpen: true },
    )
    if (!located?.ok || !located.entry?.el) {
      if (resourceModalOpen()) {
        dismissResourceModal()
        await sleep(200)
      }
      return false
    }

    const image = located.entry.el.querySelector('img')
    const source = image?.currentSrc || image?.src || ''
    const fileName = located.entry.fileName || ref.fileName || ''
    const expected = { source, fileName }
    if (!(await clickIncluirNoComando())) {
      dismissResourceModal()
      return null
    }

    const attached = await waitFor(
      () => !resourceModalOpen() && listComposerIngredientChips().some((chip) =>
        matchesComposerIngredient(chip, expected),
      ),
      6000,
    )
    if (!attached) {
      if (resourceModalOpen()) dismissResourceModal()
      return null
    }
    return expected
  }

  /** Abre o modal pelo + (biblioteca). Nunca clica em Enviar mídia. */
  async function openResourceModalViaPlus() {
    if (resourceModalOpen()) return true
    const plus = findPlusBesideAgent()
    if (!plus) return false
    hardClick(plus)
    await sleep(600)
    if (!resourceModalOpen()) return false
    // Não forçar Envios aqui: a busca em findUploadsMatch percorre Envios e Tudo.
    return true
  }

  function findComposerControlByText(patterns) {
    const nodes = Array.from(
      document.querySelectorAll(
        'button, [role="button"], [role="combobox"], [aria-haspopup], div[tabindex], span[role="button"]',
      ),
    )
    return nodes.find((el) => {
      if (!visible(el)) return false
      const rect = el.getBoundingClientRect()
      if (rect.bottom < window.innerHeight * 0.45) return false
      if (rect.height > 64 || rect.width < 28) return false
      const label = labelBlob(el)
      return patterns.some((pattern) =>
        typeof pattern === 'string' ? label.includes(pattern) : pattern.test(label),
      )
    })
  }

  async function pickMenuOptionByLabels(labels) {
    const needles = labels.map((item) => String(item || '').toLowerCase().trim()).filter(Boolean)
    const started = Date.now()
    while (Date.now() - started < 3500) {
      const items = deepQueryAll(
        '[role="option"], [role="menuitem"], [role="listitem"], button, div[role="button"], li',
      ).filter((el) => {
        if (!visible(el)) return false
        const label = labelBlob(el)
        if (!label || label.length > 120) return false
        return needles.some((needle) => label === needle || label.includes(needle))
      })
      const exact =
        items.find((el) => needles.includes(labelBlob(el))) ||
        items.find((el) => needles.some((needle) => labelBlob(el).includes(needle)))
      if (exact) {
        exact.click()
        await sleep(280)
        return true
      }
      await sleep(150)
    }
    return false
  }

  async function applyImageSettings({ imageModelLabel, imageOutputs } = {}) {
    const modelLabel = String(imageModelLabel || '').trim()
    const outputs = Number(imageOutputs)
    let modelOk = !modelLabel
    let outputsOk = !Number.isFinite(outputs) || outputs <= 0

    if (modelLabel) {
      const trigger =
        findComposerControlByText([/nano banana/i]) ||
        findComposerControlByText([modelLabel.toLowerCase()])
      if (trigger) {
        const current = labelBlob(trigger)
        if (current.includes(modelLabel.toLowerCase())) {
          modelOk = true
        } else {
          trigger.click()
          await sleep(280)
          modelOk = await pickMenuOptionByLabels([modelLabel, modelLabel.replace(/^nano banana\s+/i, '')])
          if (!modelOk) {
            document.dispatchEvent(
              new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                keyCode: 27,
                bubbles: true,
                cancelable: true,
              }),
            )
          }
        }
      }
    }

    if (Number.isFinite(outputs) && outputs > 0) {
      const target = `x${outputs}`
      const trigger =
        findComposerControlByText([/^x\s*[1-4]$/i, /×\s*[1-4]/, /\bx\s*[1-4]\b/i]) ||
        findComposerControlByText([/x[1-4]/i])
      if (trigger) {
        const current = labelBlob(trigger).replace(/\s+/g, '')
        if (current.includes(`x${outputs}`) || current.includes(`×${outputs}`)) {
          outputsOk = true
        } else {
          trigger.click()
          await sleep(280)
          outputsOk = await pickMenuOptionByLabels([
            target,
            `×${outputs}`,
            String(outputs),
            `${outputs} imagens`,
            `${outputs} images`,
          ])
          if (!outputsOk) {
            document.dispatchEvent(
              new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                keyCode: 27,
                bubbles: true,
                cancelable: true,
              }),
            )
          }
        }
      }
    }

    return { modelOk, outputsOk }
  }

  function promptPlainText(segments = [], fallbackPrompt = '') {
    const fromSegments = (segments || [])
      .map((segment) => {
        if (!segment) return ''
        if (segment.type === 'text') return String(segment.value || '')
        if (segment.type === 'mention') return String(segment.label || '').trim()
        return ''
      })
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
    if (fromSegments) return fromSegments
    return String(fallbackPrompt || '')
      .replace(/@([A-Za-zÀ-ÿ0-9_][\wÀ-ÿ-]{0,78})/g, '$1')
      .replace(/\[([A-Za-zÀ-ÿ0-9_][^\]\n]{0,78})\]/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function readPromptText(box) {
    return String(box?.value ?? box?.innerText ?? box?.textContent ?? '').replace(/\s+/g, ' ').trim()
  }

  async function resolvePromptBox() {
    return (await waitFor(() => findPromptBox(), 5000)) || findPromptBox()
  }

  async function typeIntoPrompt(text) {
    const value = String(text || '')
    if (!value) return false
    const box = await resolvePromptBox()
    if (!box) return false
    return setPromptTextOnce(box, value)
  }

  /** Escreve o prompt uma vez — só DOM isolado (sem pageUpload / MAIN world). */
  async function setPromptTextOnce(box, plain) {
    if (!box) return false
    const target = String(plain || '').replace(/\s+/g, ' ').trim()
    if (!target) return false
    hardClick(box)
    try {
      box.focus()
    } catch {
      /* ignore */
    }
    await sleep(80)
    const current = readPromptText(box)
    if (current === target) return true

    const editable = box.isContentEditable || box.getAttribute?.('contenteditable') === 'true'
    try {
      if (editable) {
        try {
          document.execCommand('selectAll', false)
          document.execCommand('delete', false)
        } catch {
          box.textContent = ''
        }
        box.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            composed: true,
            inputType: 'deleteContent',
          }),
        )
        await sleep(40)
        let inserted = false
        try {
          inserted = document.execCommand('insertText', false, target)
        } catch {
          inserted = false
        }
        if (!inserted) {
          box.textContent = target
          box.dispatchEvent(
            new InputEvent('input', {
              bubbles: true,
              composed: true,
              data: target,
              inputType: 'insertText',
            }),
          )
        }
      } else {
        const proto =
          box.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
        if (setter) setter.call(box, target)
        else box.value = target
        box.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
        box.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
      }
    } catch {
      /* ignore */
    }
    await sleep(150)
    const after = readPromptText(box)
    return after === target
  }

  /**
   * Reinsere o texto sem selectAll/delete — preserva chips/miniaturas já anexados.
   */
  async function appendPromptTextPreserveIngredients(box, plain) {
    if (!box) return false
    const target = String(plain || '').replace(/\s+/g, ' ').trim()
    if (!target) return false
    hardClick(box)
    try {
      box.focus()
    } catch {
      /* ignore */
    }
    await sleep(60)
    const current = readPromptText(box)
    if (current) return current === target

    const editable = box.isContentEditable || box.getAttribute?.('contenteditable') === 'true'
    try {
      if (editable) {
        const selection = window.getSelection?.()
        if (selection) {
          const range = document.createRange()
          range.selectNodeContents(box)
          range.collapse(false)
          selection.removeAllRanges()
          selection.addRange(range)
        }
        let inserted = false
        try {
          inserted = document.execCommand('insertText', false, current ? ` ${target}` : target)
        } catch {
          inserted = false
        }
        if (!inserted) {
          box.append(document.createTextNode(current ? ` ${target}` : target))
          box.dispatchEvent(
            new InputEvent('input', {
              bubbles: true,
              composed: true,
              data: target,
              inputType: 'insertText',
            }),
          )
        }
      } else {
        const proto =
          box.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
        const next = current.includes(target) ? current : `${current} ${target}`.trim()
        if (setter) setter.call(box, next)
        else box.value = next
        box.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
      }
    } catch {
      /* ignore */
    }
    await sleep(120)
    return readPromptText(box) === target
  }

  function elementPoint(el) {
    if (!el || !visible(el)) return null
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return null
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    }
  }

  function locateCreateControls(plain = '') {
    const incluir =
      findIncluirNoComandoButton(false) ||
      (resourceModalOpen() ? findIncluirNoComandoButton(true) : null)
    const box = findPromptBox()
    const generate = findFlowSubmitButton(box)
    return {
      ok: true,
      modalOpen: resourceModalOpen(),
      incluirPoint: elementPoint(incluir),
      generatePoint: elementPoint(generate),
      promptOk: plain
        ? readPromptText(box) === String(plain).replace(/\s+/g, ' ').trim()
        : true,
    }
  }

  function detectUnusualActivity() {
    const body = textOf(document.body).toLowerCase()
    const count = [...body.matchAll(/atividade incomum|unusual activity/g)].length
    if (count) {
      const noCharge = /não houve cobrança|no charge|weren'?t charged|were not charged/.test(body)
      return {
        hit: true,
        count,
        message: noCharge
          ? 'O Flow reportou atividade incomum e informou que não houve cobrança. Geração automática pausada.'
          : 'O Flow reportou atividade incomum. Geração automática pausada.',
      }
    }
    return { hit: false, count: 0, message: '' }
  }

  function findComposerRoot(box = findPromptBox()) {
    const plus = findPlusBesideAgent()
    if (!box || !plus) return null
    for (let node = box.parentElement; node && node !== document.body; node = node.parentElement) {
      if (node.contains(plus)) return node
    }
    return null
  }

  function listComposerIngredientChips() {
    const root = findComposerRoot()
    if (!root) return []
    return Array.from(root.querySelectorAll('img')).filter((img) => {
      if (!visible(img)) return false
      const rect = img.getBoundingClientRect()
      return rect.width >= 20 && rect.width <= 220 && rect.height >= 20 && rect.height <= 160
    }).map((img) => {
      const el = img.parentElement?.parentElement || img.parentElement || img
      return { el, label: labelBlob(el), source: img.currentSrc || img.src || '' }
    })
  }

  function matchesComposerIngredient(chip, expected) {
    if (expected.source && chip.source === expected.source) return true
    if (!expected.fileName) return false
    const name = expected.fileName.toLowerCase()
    return (' ' + chip.label + ' ').includes(' ' + name + ' ')
  }

  async function clearComposerIngredients() {
    // Remove chips residuais do card anterior (X próximo à miniatura).
    for (let round = 0; round < 6; round += 1) {
      const chips = listComposerIngredientChips()
      if (!chips.length) return true
      let removed = false
      for (const chip of chips) {
        const close =
          Array.from(chip.el.querySelectorAll?.('button, [role="button"], [aria-label]') || []).find(
            (btn) => {
              if (!visible(btn)) return false
              const label = labelBlob(btn)
              return /^(?:remover|remove|fechar|close|excluir|delete)\b|^[×x]$/.test(label)
            },
          ) || null
        if (close) {
          hardClick(close)
          removed = true
          await sleep(250)
          break
        }
        // Fallback: botão com aria-label no ancestral próximo.
        const parentClose = chip.el.parentElement?.querySelector?.(
          'button[aria-label], [role="button"][aria-label]',
        )
        if (parentClose && /^(?:remover|remove|fechar|close|excluir|delete)\b/i.test(labelBlob(parentClose))) {
          hardClick(parentClose)
          removed = true
          await sleep(250)
          break
        }
      }
      if (!removed) break
    }
    return listComposerIngredientChips().length === 0
  }

  function countMatchingComposerIngredients(labels, attached) {
    const chips = listComposerIngredientChips()
    const available = [...chips]
    const matched = []
    for (const label of labels) {
      const expected = attached.get(label)
      if (!expected) continue
      const index = available.findIndex((chip) => matchesComposerIngredient(chip, expected))
      if (index < 0) continue
      available.splice(index, 1)
      matched.push(label)
    }
    return { matched, totalChips: chips.length }
  }

  async function fillPromptWithMentions(
    segments,
    references = [],
    settings = {},
    fallbackPrompt = '',
    options = {},
  ) {
    const submit = options.submit !== false
    const now = Date.now()
    if (window.__atlasFlowFillBusy && now - (window.__atlasFlowFillBusyAt || 0) < 120_000) {
      return {
        ok: false,
        code: 'busy',
        message: 'Já estou criando no Flow. Aguarde terminar.',
      }
    }
    window.__atlasFlowFillBusy = true
    window.__atlasFlowFillBusyAt = now
    try {
      // Sem ensurePageHook / pageUpload — injetar MAIN world + Generate = “atividade incomum”.
      const plain = promptPlainText(segments, fallbackPrompt)
      const labels = [
        ...(segments || [])
          .filter((segment) => segment && segment.type === 'mention')
          .map((segment) => String(segment.label || '').trim())
          .filter(Boolean),
      ]
      if (!labels.length) {
        for (const match of String(fallbackPrompt || '').matchAll(/\[([A-Za-zÀ-ÿ0-9_][^\]\n]{0,78})\]|@([A-Za-zÀ-ÿ0-9_][\wÀ-ÿ-]{0,78})/g)) {
          labels.push((match[1] || match[2]).trim())
        }
      }
      const uniqueLabels = [...new Set(labels.map((item) => item.toLowerCase()))].map((key) => {
        return (
          labels.find((item) => item.toLowerCase() === key) ||
          String(references.find((ref) => String(ref?.label || '').toLowerCase() === key)?.label || key)
        )
      })

      if (resourceModalOpen()) {
        dismissResourceModal()
        await sleep(300)
      }

      // Card isolado: limpa resíduos → texto → anexos.
      // Nunca digitar com selectAll depois dos anexos (apagava as miniaturas).
      if (!(await clearComposerIngredients())) {
        return { ok: false, code: 'prompt_failed', message: 'Há anexos do card anterior no Flow.' }
      }
      await sleep(200)

      const box = await resolvePromptBox()
      if (!box) {
        return {
          ok: false,
          code: 'prompt_failed',
          message: 'Não achei o campo “O que você quer criar?”.',
        }
      }
      const typed = plain ? await setPromptTextOnce(box, plain) : true
      await sleep(200)

      try {
        await applyImageSettings(settings)
      } catch {
        /* ignore */
      }

      const attached = new Map()
      const projectId = parseProjectId()
      for (const label of uniqueLabels) {
        if (parseProjectId() !== projectId) break
        const reference = references.find(
          (ref) => String(ref?.label || '').trim().toLowerCase() === label.toLowerCase(),
        )
        if (!reference) continue
        const expected = await includeResourceFromModal(label, [reference])
        if (expected) attached.set(label, expected)
      }

      const liveBox = (await resolvePromptBox()) || box
      if (plain && !readPromptText(liveBox)) {
        await appendPromptTextPreserveIngredients(liveBox, plain)
      }
      const textOk = readPromptText(liveBox) === plain
      const attachedLabels = [...attached.keys()]
      const ingredientCheck = countMatchingComposerIngredients(uniqueLabels, attached)
      const missing = uniqueLabels.filter(
        (label) => !ingredientCheck.matched.some((item) => item.toLowerCase() === label.toLowerCase()),
      )
      const extras = Math.max(0, ingredientCheck.totalChips - uniqueLabels.length)
      const verified =
        Boolean(projectId && parseProjectId() === projectId && !resourceModalOpen()) &&
        typed &&
        textOk &&
        missing.length === 0 &&
        extras === 0 &&
        ingredientCheck.matched.length === uniqueLabels.length

      if (!verified) {
        const reasons = []
        if (!projectId || parseProjectId() !== projectId || resourceModalOpen()) reasons.push('projeto ou caixa de comando mudou')
        if (!typed || !textOk) reasons.push('texto incompleto na caixa de comando')
        if (missing.length) reasons.push(`faltam anexos: ${missing.map((m) => `[${m}]`).join(', ')}`)
        if (extras > 0) reasons.push(`há ${extras} anexo(s) extra(s) residual(is)`)
        return {
          ok: false,
          code: 'prompt_failed',
          verified: false,
          submitted: false,
          attachedLabels,
          mentions: attachedLabels.length,
          stages: {
            ref_located: attachedLabels.length > 0 || uniqueLabels.length === 0,
            ref_attached: missing.length === 0 && extras === 0,
            text_verified: Boolean(typed && textOk),
            generate_requested: false,
            flow_result: 'interrupted_before_generate',
          },
          message: `Card interrompido antes do Generate: ${reasons.join('; ')}.`,
        }
      }

      if (!submit) {
        return {
          ok: true,
          mentions: attachedLabels.length,
          submitted: false,
          typed: true,
          plain,
          verified: true,
          attachedLabels,
          message: 'Card preparado: texto completo e anexos conferidos (Generate não clicado).',
        }
      }

      const previousWarningCount = detectUnusualActivity().count
      let submitted = false
      if (!resourceModalOpen()) {
        submitted = await submitFlowCreation(liveBox)
      }
      // Poll curto: o aviso de atividade incomum pode aparecer após o clique.
      let unusual = detectUnusualActivity()
      if (submitted && unusual.count <= previousWarningCount) {
        const unusualWaitStarted = Date.now()
        while (Date.now() - unusualWaitStarted < 3500) {
          await sleep(400)
          unusual = detectUnusualActivity()
          if (unusual.count > previousWarningCount) break
        }
      }
      if (submitted && unusual.count > previousWarningCount) {
        return {
          ok: false,
          code: 'unusual_activity',
          unusualActivity: true,
          submitted: true,
          verified: true,
          attachedLabels,
          mentions: attachedLabels.length,
          stages: {
            ref_located: true,
            ref_attached: attachedLabels.length === uniqueLabels.length,
            text_verified: true,
            generate_requested: Boolean(submitted),
            flow_result: 'unusual_activity',
          },
          message: unusual.message,
        }
      }

      return {
        ok: true,
        mentions: attachedLabels.length,
        submitted,
        typed: true,
        plain,
        verified: true,
        attachedLabels,
        message: submitted
          ? 'Criação disparada no Flow.'
          : 'Prompt pronto. Confira o card e clique na seta de criação do Flow.',
      }
    } finally {
      window.__atlasFlowFillBusy = false
    }
  }

  function normalizeUploadIdentity(label, fileName) {
    const stem = String(label || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    const file = String(fileName || '')
      .trim()
      .toLowerCase()
      .replace(/\\/g, '/')
      .split('/')
      .pop() || ''
    return { stem, file, stableKey: [stem, file].filter(Boolean).join('::') || stem || file || 'ref' }
  }

  function entryMatchesNeedles(entryKey, needles) {
    const key = String(entryKey || '').toLowerCase()
    return needles.some((n) => n && n.length >= 2 && key.includes(n))
  }

  /**
   * Clique preciso nas abas do seletor (Tudo / Envios / Uploads / All).
   * Evita includes() genérico que pode acertar outros botões.
   */
  function clickGalleryFilter(names = []) {
    const needles = (names || [])
      .map((name) => String(name || '').toLowerCase().trim())
      .filter(Boolean)
    if (!needles.length) return null
    const root = resourcePickerRoot()
    if (!root) return null
    const nodes = Array.from(root.querySelectorAll(
      'button, [role="tab"], [role="button"], [role="option"], div[tabindex], span[role="button"]',
    ))
    const match = nodes.find((el) => {
      if (!visible(el)) return false
      const label = labelBlob(el).replace(/\s+/g, ' ').trim()
      if (!label || label.length > 40) return false
      if (isCollectionActionLabel(label)) return false
      return needles.some((needle) => label === needle || label.replace(/[^\wÀ-ÿ]+/g, '') === needle)
    })
    if (!match) return null
    match.click()
    return match
  }

  function collectUploadCandidates(entries, label, fileName, needles, knownKey = '') {
    const identity = normalizeUploadIdentity(label, fileName)
    const list = (entries || []).filter(Boolean)
    const matched = []
    const seen = new Set()

    const pushUnique = (entry, reason) => {
      if (!entry?.el || seen.has(entry.el)) return
      seen.add(entry.el)
      matched.push({ entry, reason, loading: entryLooksLoading(entry.el) })
    }

    if (knownKey.startsWith('flow:')) {
      for (const entry of list) {
        if (entry.assetKey === knownKey) pushUnique(entry, 'knownKey')
      }
      return { identity, matched }
    }

    if (identity.file) {
      for (const entry of list) {
        if (entry.fileName === identity.file || entry.key.split(/\s+/).includes(identity.file)) pushUnique(entry, 'fileName')
      }
    }

    const fileStem = identity.file ? identity.file.replace(/\.[a-z0-9]+$/i, '') : ''
    if (fileStem && fileStem.length >= 2) {
      for (const entry of list) {
        if (entry.key.includes(fileStem)) pushUnique(entry, 'fileStem')
      }
    }

    for (const entry of list) {
      if (entryMatchesNeedles(entry.key, needles)) pushUnique(entry, 'needle')
    }

    return { identity, matched }
  }

  /**
   * Várias cópias do mesmo arquivo = reutilizar a primeira.
   * Candidatos distintos/indistinguíveis pelo identificador disponível = ambíguo.
   */
  function pickBestUploadEntry(entries, label, fileName, needles, knownKey = '') {
    const { identity, matched } = collectUploadCandidates(entries, label, fileName, needles, knownKey)
    if (!matched.length) return null

    const byFile = matched.filter((row) => row.reason === 'fileName' || row.reason === 'knownKey')
    const byStem = matched.filter((row) => row.reason === 'fileStem')
    const preferred = byFile.length ? byFile : identity.file ? byStem : matched
    if (!preferred.length) return null

    const distinct = new Map()
    for (const row of preferred) {
      distinct.set(row.entry.assetKey || row.entry.el, row)
    }
    if (distinct.size !== 1) {
      return {
        ambiguous: true,
        message: `[${label || fileName}] tem ${distinct.size} candidatos no seletor. Selecione a referência explicitamente.`,
      }
    }
    const [chosen] = distinct.values()
    return {
      entry: chosen.entry,
      flowUploadKey: chosen.entry.assetKey || identity.stableKey,
      loading: chosen.loading,
    }
  }

  async function openResourceGallery(filterNames = null) {
    if (!resourceModalOpen()) {
      const opened = await openResourceModalViaPlus()
      if (!opened) return false
    }
    if (filterNames && filterNames.length) {
      clickGalleryFilter(filterNames)
      await sleep(350)
    }
    return resourceModalOpen()
  }

  async function openEnviosGallery() {
    // Mantém compatibilidade: tenta Envios/Uploads; se falhar, fica no seletor aberto (ex.: Tudo).
    const opened = await openResourceGallery(['envios', 'uploads'])
    if (!opened) return false
    if (!clickGalleryFilter(['envios', 'uploads'])) {
      // UI pode já estar em Tudo — ainda assim a galeria está aberta.
      clickGalleryFilter(['tudo', 'all'])
      await sleep(250)
    }
    return true
  }

  async function waitUntilEntrySelectable(entry, timeoutMs = 12000) {
    if (!entry?.el) return false
    if (!entry.el.isConnected) return false
    entry.el.click()
    return Boolean(await waitFor(
      () => entry.el.isConnected && !entryLooksLoading(entry.el) && findIncluirNoComandoButton(false),
      timeoutMs,
    ))
  }

  /**
   * Localiza o item no seletor do projeto.
   * Caminho: Envios/Uploads → Tudo/All. “encontrado e carregando” = pendente.
   * Só confirma quando o item está selecionável e “Incluir no comando” habilita.
   */
  async function findUploadsMatch(reference = {}, options = {}) {
    const label = String(reference.label || '').trim()
    const fileName = String(reference.fileName || '').trim()
    const knownKey = String(reference.flowUploadKey || '').trim().toLowerCase()
    const needles = mentionNeedles(label, [reference])
    if (fileName) {
      needles.push(fileName.toLowerCase(), fileName.replace(/\.[a-z0-9]+$/i, '').toLowerCase())
    }
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 18000
    const verifyInclude = options.verifyIncludeEnabled !== false
    const keepOpen = Boolean(options.keepOpen)

    if (!(await openResourceGallery()) || !resourcePickerRoot()) {
      return { ok: false, message: 'Não abri a biblioteca de recursos do Flow.' }
    }

    const filterPasses = [null, ['envios', 'uploads'], ['tudo', 'all']]

    const started = Date.now()
    let sawLoading = false
    let lastAmbiguous = null
    let lastEntry = null

    while (Date.now() - started < timeoutMs) {
      for (const filter of filterPasses) {
        if (filter) {
          clickGalleryFilter(filter)
          await sleep(280)
        }

        const entries = listEnviosEntries()
        const pick = pickBestUploadEntry(entries, label, fileName, needles, knownKey)
        if (pick?.ambiguous) {
          lastAmbiguous = pick
          continue
        }
        if (!pick?.entry) continue

        lastEntry = pick.entry
        if (verifyInclude) {
          const selectable = await waitUntilEntrySelectable(pick.entry, Math.min(8000, timeoutMs))
          if (!selectable) {
            sawLoading = true
            continue
          }
        } else if (entryLooksLoading(pick.entry.el)) {
          sawLoading = true
          continue
        }

        if (!keepOpen) {
          dismissResourceModal()
          await sleep(200)
        }
        return {
          ok: true,
          reused: true,
          flowUploadKey: pick.flowUploadKey,
          fileName: pick.entry.fileName || fileName || label,
          entry: pick.entry,
          duplicates: pick.duplicates || 1,
          filter: filter ? filter[0] : 'current',
        }
      }
      await sleep(400)
    }

    if (!keepOpen) {
      dismissResourceModal()
      await sleep(200)
    }

    if (lastAmbiguous?.ambiguous) {
      return {
        ok: false,
        ambiguous: true,
        message: lastAmbiguous.message,
      }
    }

    if (sawLoading || lastEntry || knownKey) {
      return {
        ok: false,
        pending: true,
        missing: false,
        message: `[${label || fileName}] encontrado no seletor, mas a prévia ainda não ficou pronta (Incluir no comando desabilitado). Confirmação pendente — verifique de novo sem reenviar os bytes.`,
      }
    }

    return {
      ok: false,
      missing: true,
      pending: false,
      message: `[${label || fileName}] ainda não está em Envios/Tudo do projeto.`,
    }
  }

  async function ensureReferenceInUploads(reference = {}) {
    const { entry, ...result } = await findUploadsMatch(reference, { timeoutMs: 18000, verifyIncludeEnabled: true, keepOpen: false })
    return result
  }

  async function confirmReferenceInUploads(reference = {}, beforeKeys = []) {
    const label = String(reference.label || '').trim()
    const fileName = String(reference.fileName || '').trim()
    const needles = mentionNeedles(label, [reference])
    if (fileName) needles.push(fileName.toLowerCase())
    const identity = normalizeUploadIdentity(label, fileName)

    if (!(await openResourceGallery(['envios', 'uploads']))) {
      return { ok: false, message: 'Não abri Uploads para confirmar o envio.' }
    }
    clickGalleryFilter(['envios', 'uploads'])
    await sleep(300)

    const known = new Set((beforeKeys || []).map((k) => String(k || '').toLowerCase()))
    const started = Date.now()
    let sawLoading = false

    while (Date.now() - started < 18000) {
      for (const filter of [['envios', 'uploads'], ['tudo', 'all']]) {
        clickGalleryFilter(filter)
        await sleep(250)
        const entries = listEnviosEntries()
        const fresh = entries.filter((entry) => !known.has(String(entry.key || '').toLowerCase()))
        const pool = fresh.length ? fresh : entries

        const pick = pickBestUploadEntry(pool, label, fileName, needles, String(reference.flowUploadKey || '').toLowerCase())
        if (pick?.ambiguous) {
          dismissResourceModal()
          return { ok: false, ambiguous: true, message: pick.message }
        }
        if (pick?.entry) {
          const selectable = await waitUntilEntrySelectable(pick.entry, 8000)
          if (!selectable) {
            sawLoading = true
            continue
          }
          dismissResourceModal()
          await sleep(200)
          return {
            ok: true,
            flowUploadKey: pick.flowUploadKey || identity.stableKey,
            fileName: pick.entry.fileName || fileName || label,
            reused: fresh.length === 0,
          }
        }

        const existing = pickBestUploadEntry(entries, label, fileName, needles, String(reference.flowUploadKey || '').toLowerCase())
        if (existing?.entry) {
          const selectable = await waitUntilEntrySelectable(existing.entry, 8000)
          if (!selectable) {
            sawLoading = true
            continue
          }
          dismissResourceModal()
          await sleep(200)
          return {
            ok: true,
            flowUploadKey: existing.flowUploadKey || identity.stableKey,
            fileName: existing.entry.fileName || fileName || label,
            reused: true,
          }
        }
      }
      await sleep(400)
    }

    dismissResourceModal()
    if (sawLoading) {
      return {
        ok: false,
        pending: true,
        message: `[${label}] apareceu no seletor, mas a confirmação expirou antes da prévia ficar pronta. Tente de novo sem reenviar.`,
      }
    }
    return { ok: false, missing: true, message: `[${label}] não apareceu em Uploads/Tudo após o envio.` }
  }

  function findFlowSubmitButton(box) {
    const root = findComposerRoot(box)
    if (!root) return null
    const matches = Array.from(root.querySelectorAll('button, [role="button"]')).filter((el) => {
      if (!visible(el) || el.matches(':disabled, [disabled], [aria-disabled="true"]')) return false
      const name = el.getAttribute('aria-label') || el.getAttribute('title') || textOf(el)
      return /^(criar|create|generate|gerar)(?: (?:imagem|image))?$/i.test(name.trim())
    })
    return matches.length === 1 ? matches[0] : null
  }

  /** Solicita uma única geração pelo controle do próprio Flow. */
  async function submitFlowCreation(box) {
    if (resourceModalOpen()) return false
    const button = findFlowSubmitButton(box)
    if (!button) return false
    button.click()
    return true
  }

  function dismissResourceModal() {
    const dialogs = deepQueryAll(
      '[role="dialog"], [aria-modal="true"], [data-state="open"]',
    ).filter(visible)
    for (const dialog of dialogs) {
      const closeBtn = Array.from(
        dialog.querySelectorAll('button, [role="button"], [aria-label]'),
      ).find((el) => {
        if (!visible(el)) return false
        const label = labelBlob(el)
        return /^(fechar|close|dismiss)$/i.test(label) || /fechar|close|dismiss/.test(label)
      })
      if (closeBtn) {
        closeBtn.click()
        break
      }
    }
    clickByLabels(['fechar', 'close', 'dismiss'], { avoidCollection: true })
    const opts = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }
    document.dispatchEvent(new KeyboardEvent('keydown', opts))
    document.activeElement?.dispatchEvent?.(new KeyboardEvent('keydown', opts))
  }

  function resourceModalOpen() {
    if (resourcePickerRoot()) return true
    const body = textOf(document.body).toLowerCase()
    if (/pesquisar recursos|search resources/.test(body) && /incluir no comando|add to prompt|enviar mídia|upload media/.test(body)) {
      return true
    }
    return deepQueryAll('[role="dialog"], [aria-modal="true"]').some((el) => {
      if (!visible(el)) return false
      const label = textOf(el).toLowerCase()
      return /pesquisar recursos|search resources|incluir no comando|enviar mídia/.test(label)
    })
  }

  function composerThumbSrcs() {
    const srcs = []
    for (const img of deepQueryAll('img')) {
      if (!visible(img)) continue
      const rect = img.getBoundingClientRect()
      // Miniatura no compositor (faixa inferior) ou chip de anexo.
      if (rect.bottom < window.innerHeight * 0.55) continue
      if (rect.width < 20 || rect.height < 20 || rect.width > 220) continue
      const src = img.currentSrc || img.src || ''
      if (src) srcs.push(src)
    }
    return srcs
  }

  function listEnviosEntries() {
    const root = resourcePickerRoot()
    if (!root) return []
    const entries = Array.from(root.querySelectorAll(
      '[role="option"], [role="listitem"], [role="row"], button, div[tabindex], a, div[role="button"]',
    ))
      .filter((el) => {
        if (!visible(el)) return false
        const label = labelBlob(el)
        if (label.length > 200) return false
        if (
          /pesquisar|search|enviar mídia|incluir no comando|tudo$|^imagens$|^v[ií]deos$|^vozes$|personagens|avatares|biblioteca|cole[cç][aã]o/.test(
            label,
          )
        ) {
          return false
        }
        const hasImg = Boolean(el.querySelector?.('img'))
        if (hasImg && (label.length >= 1 || el.querySelector?.('img')?.alt)) return true
        if (!label || label.length < 2) return false
        return (
          /imagem|image|v[ií]deo|video|[a-f0-9]{8}-[a-f0-9]{4}-/.test(label) ||
          /\.(png|jpe?g|webp|gif|mp4|mov|webm)\b/i.test(label)
        )
      })
    return entries.filter((el) => !entries.some((child) => child !== el && el.contains(child)))
      .map((el) => {
        const img = el.querySelector?.('img')
        const key = (
          `${labelBlob(el)} ${img?.alt || ''} ${img?.currentSrc || img?.src || ''}`
        )
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim()
        const asset = el.closest('[data-media-id], [data-asset-id], [data-tile-id]')
        const id = asset?.getAttribute('data-media-id') || asset?.getAttribute('data-asset-id') || asset?.getAttribute('data-tile-id')
        const fileName = [el.getAttribute('title'), img?.alt, ...String(el.innerText || '').split('\n')]
          .map((value) => String(value || '').trim().toLowerCase())
          .find((value) => /\.(?:png|jpe?g|webp|gif|mp4|mov|webm)$/.test(value)) || ''
        return { el, key, fileName, assetKey: id ? `flow:${id.toLowerCase()}` : '' }
      })
  }

  function clickEnviarMidia() {
    return clickByLabels(
      ['enviar mídia', 'enviar midia', 'upload media', 'upload file', 'enviar arquivo'],
      { avoidCollection: true },
    )
  }

  /**
   * Abre o modal e dispara “Enviar mídia”.
   * NUNCA chama input.click() — sem user activation o Chrome erro
   * "File chooser dialog can only be shown with a user activation."
   * O background deve ter Page.setInterceptFileChooserDialog ligado.
   */
  async function prepareUploadUi() {
    if (!resourceModalOpen()) {
      dismissResourceModal()
      await sleep(150)
      const plus = findPlusBesideAgent()
      if (!plus) {
        return {
          ok: false,
          code: 'picker_unavailable',
          message: 'Não achei o + do compositor no Flow.',
        }
      }
      hardClick(plus)
      await sleep(450)
    }

    clickByLabels(['envios', 'uploads'], { avoidCollection: true })
    await sleep(350)

    const beforeKeys = listEnviosEntries().map((entry) => entry.key)
    const beforeThumbs = composerThumbSrcs()

    if (!clickEnviarMidia()) {
      return {
        ok: false,
        code: 'picker_unavailable',
        message: 'Não achei “Enviar mídia” no Flow (não uso input.click para evitar erro de user activation).',
        beforeKeys,
        beforeThumbs,
      }
    }
    return { ok: true, via: 'enviar-midia', beforeKeys, beforeThumbs }
  }

  async function openFilePickerUi() {
    const prep = await prepareUploadUi()
    return prep
  }

  async function includeUploadedInCommand({
    fileNames = [],
    labels = [],
    expected = 1,
    beforeKeys = [],
    beforeThumbs = [],
  } = {}) {
    if (expected <= 0) {
      for (let i = 0; i < 3; i += 1) {
        if (!resourceModalOpen()) break
        dismissResourceModal()
        await sleep(180)
      }
      return { ok: true, uploaded: 0, message: 'Modal fechado.' }
    }

    const needles = [...labels, ...fileNames.map(stemOf)]
      .map((s) => String(s || '').toLowerCase().trim())
      .filter(Boolean)
    const known = new Set((beforeKeys || []).map((k) => String(k || '').toLowerCase()))
    const knownThumbs = new Set(beforeThumbs || [])

    clickByLabels(['envios', 'uploads'], { avoidCollection: true })
    await sleep(500)

    const started = Date.now()
    let selected = 0
    const usedKeys = new Set()

    while (Date.now() - started < 12000 && selected < expected) {
      const entries = listEnviosEntries()
      // Só itens que NÃO existiam antes do upload — evita reutilizar o piano antigo.
      const fresh = entries.filter((entry) => {
        const key = entry.key.toLowerCase()
        if (known.has(key) || usedKeys.has(key)) return false
        return true
      })

      const byName = fresh.find((entry) => needles.some((n) => entry.key.includes(n)))
      const pick = byName || fresh[0]
      if (!pick) {
        await sleep(350)
        continue
      }

      pick.el.click()
      usedKeys.add(pick.key.toLowerCase())
      await sleep(400)

      const included = clickByLabels(
        [
          'incluir no comando',
          'incluir no prompt',
          'add to prompt',
          'add to command',
          'include in prompt',
          'use in prompt',
        ],
        { avoidCollection: true },
      )
      if (!included) {
        await sleep(300)
        continue
      }

      // Confirma miniatura NOVA no compositor (não a que já estava).
      const confirmStart = Date.now()
      let thumbOk = false
      while (Date.now() - confirmStart < 4000) {
        const thumbs = composerThumbSrcs()
        if (thumbs.some((src) => src && !knownThumbs.has(src))) {
          thumbOk = true
          break
        }
        // Nome da referência apareceu no compositor
        const body = textOf(document.body).toLowerCase()
        if (needles.some((n) => n.length >= 3 && body.includes(n))) {
          thumbOk = true
          break
        }
        await sleep(250)
      }

      if (thumbOk) {
        selected += 1
        await sleep(300)
        continue
      }

      // Incluiu item errado / não refletiu — não conta como sucesso.
      await sleep(300)
    }

    for (let i = 0; i < 3; i += 1) {
      if (!resourceModalOpen()) break
      dismissResourceModal()
      await sleep(200)
    }

    if (selected <= 0) {
      dismissResourceModal()
      return {
        ok: false,
        code: 'upload_failed',
        message:
          'Não enviei a referência nova: o Flow só mostrou mídia antiga no campo. Tente de novo.',
        uploaded: 0,
      }
    }

    return {
      ok: true,
      uploaded: selected,
      message: `${selected} referência(s) novas incluídas no comando do Flow.`,
    }
  }

  function findEmptyStateTarget() {
    const nodes = deepQueryAll('div, section, main, p, span, button')
    return (
      nodes.find((el) => {
        if (!visible(el)) return false
        const label = labelBlob(el)
        return (
          /comece a criar ou adicione arquivos de mídia/.test(label) ||
          /start creating or (add|drop) media/.test(label) ||
          /adicione arquivos de mídia/.test(label) ||
          /add media files/.test(label) ||
          /start creating or drop media/.test(label)
        )
      }) || null
    )
  }

  function findDropTarget() {
    return (
      findEmptyStateTarget() ||
      deepQueryAll('div, section, main, [role="main"]').find((el) => {
        if (!visible(el)) return false
        const label = labelBlob(el)
        return /start creating or drop media|solte a mídia|drop media|arraste|drop files|soltar|adicione arquivos/.test(
          label,
        )
      }) ||
      document.querySelector('[data-dropzone], [data-drop-zone]') ||
      null
    )
  }

  function nearMidiasSidebar(el) {
    let node = el
    for (let i = 0; i < 6 && node; i += 1) {
      const label = labelBlob(node)
      if (/\bm[ií]dias\b|media library|biblioteca/.test(label)) return true
      node = node.parentElement
    }
    const rect = el.getBoundingClientRect()
    return rect.left < 280 && rect.width <= 56
  }

  /** + imediatamente à esquerda de “Agente” / “Agent”. */
  function findPlusBesideAgent() {
    const agent = deepQueryAll('button, [role="button"]').find(
      (el) => visible(el) && /^(agente|agent)$/i.test(textOf(el).trim()),
    )
    if (!agent) return null
    const agentRect = agent.getBoundingClientRect()
    return (
      deepQueryAll('button, [role="button"]').find((btn) => {
        if (!visible(btn) || btn === agent) return false
        if (nearMidiasSidebar(btn)) return false
        const rect = btn.getBoundingClientRect()
        const text = textOf(btn).trim()
        const label = labelBlob(btn)
        const looksPlus =
          text === '+' ||
          text === '＋' ||
          /^add$|^adicionar$/i.test(label.trim()) ||
          /add media|adicionar mídia|upload|attach/.test(label)
        if (!looksPlus && !(rect.width <= 64 && rect.height <= 64)) return false
        return rect.right <= agentRect.left + 16 && Math.abs(rect.top - agentRect.top) < 40
      }) || null
    )
  }

  function countUntitledCollections() {
    const body = textOf(document.body).toLowerCase()
    const matches = body.match(/cole[cç][aã]o sem t[ií]tulo|untitled collection/g)
    return matches ? matches.length : 0
  }

  function mediaSrcSet() {
    const set = new Set()
    for (const img of deepQueryAll('img')) {
      const src = img.currentSrc || img.src || ''
      if (src) set.add(src)
    }
    return set
  }

  function stemOf(fileName) {
    const base = String(fileName || '').trim().toLowerCase()
    if (!base) return ''
    return base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base
  }

  function referenceAppeared(beforeSrcs, fileName) {
    for (const img of deepQueryAll('img')) {
      if (!visible(img)) continue
      const src = img.currentSrc || img.src || ''
      const rect = img.getBoundingClientRect()
      if (!src || beforeSrcs.has(src) || rect.width < 24 || rect.height < 24) continue
      if (/^(blob:|data:image)/i.test(src) || /^https?:/i.test(src)) return true
    }
    const body = textOf(document.body).toLowerCase()
    const name = String(fileName || '').trim().toLowerCase()
    const stem = stemOf(fileName)
    if (name && body.includes(name)) return true
    if (stem && stem.length >= 2 && body.includes(stem)) return true
    // Empty state sumiu após o drop — sinal forte na UI atual.
    if (beforeSrcs.size >= 0 && !findEmptyStateTarget()) {
      const mediaLike = deepQueryAll('img, video, canvas').filter((el) => {
        if (!visible(el)) return false
        const rect = el.getBoundingClientRect()
        return rect.width >= 40 && rect.height >= 40
      })
      if (mediaLike.length > 0) return true
    }
    return false
  }

  async function waitUntilReference(beforeSrcs, fileNames, timeoutMs = 5000) {
    const names = Array.isArray(fileNames) ? fileNames : [fileNames]
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      if (names.some((name) => referenceAppeared(beforeSrcs, name))) return true
      await sleep(250)
    }
    return names.some((name) => referenceAppeared(beforeSrcs, name))
  }

  async function chooseUploadMenuItem() {
    return clickByLabels(
      [
        'upload image',
        'upload photo',
        'enviar imagem',
        'carregar imagem',
        'add image',
        'adicionar imagem',
        'from device',
        'do dispositivo',
        'from computer',
        'do computador',
        'computer',
        'computador',
        'upload file',
        'enviar arquivo',
        'upload',
        'photos',
        'imagens',
      ],
      { avoidCollection: true },
    )
  }

  async function attachReferenceFiles(files) {
    if (!files.length) return { uploaded: 0, reason: 'Nenhum arquivo válido.' }
    if (window.__atlasFlowUploadBusy) {
      return { uploaded: 0, reason: 'Já estou enviando uma referência. Aguarde.' }
    }
    window.__atlasFlowUploadBusy = true
    const fileName = files[0]?.name || ''
    const beforeSrcs = mediaSrcSet()
    const beforeThumbs = composerThumbSrcs()
    const beforeCollections = countUntitledCollections()
    const labels = files.map((f) => stemOf(f.name)).filter(Boolean)
    const needles = [...labels, fileName].map((s) => String(s || '').toLowerCase()).filter(Boolean)

    try {
      // Se já existe em Envios, SÓ inclui — não sobe outra cópia.
      if (!resourceModalOpen()) await openResourceModalViaPlus()
      if (resourceModalOpen()) {
        const existing = await waitForReadyEnviosMatch(needles, 6000)
        if (existing) {
          hardClick(existing)
          await sleep(300)
          if (await clickIncluirNoComando()) {
            await waitFor(() => !resourceModalOpen(), 5000)
            return { uploaded: files.length, beforeThumbs, reused: true }
          }
        }
        dismissResourceModal()
        await sleep(200)
      }

      await armPageUpload(files)

      // Upload UMA vez via set-files (sem .click() no input / sem drop em loop).
      const input = findFileInputs()[0]
      if (input) {
        await pageCmd('set-files', { el: input, files })
        if (await waitUntilReference(beforeSrcs, fileName, 4000)) {
          return { uploaded: files.length, beforeThumbs }
        }
      }

      const promptBox = findPromptBox()
      const composerDrop = promptBox?.parentElement || promptBox
      if (composerDrop) {
        await pageCmd('drop-files', { el: composerDrop, files })
        if (await waitUntilReference(beforeSrcs, fileName, 3200)) {
          return { uploaded: files.length, beforeThumbs }
        }
      }
    } finally {
      await disarmPageUpload()
      window.__atlasFlowUploadBusy = false
    }

    if (countUntitledCollections() > beforeCollections && !referenceAppeared(beforeSrcs, fileName)) {
      return {
        uploaded: 0,
        reason:
          'O Flow criou “Coleção sem título” em vez de receber a imagem. Recarregue a aba do projeto e envie de novo.',
      }
    }

    return {
      uploaded: 0,
      reason:
        'Não consegui anexar a imagem no compositor do Flow. Deixe o projeto aberto na tela “Comece a criar…” (com Agente embaixo) e tente de novo.',
    }
  }

  /** Só DOM — navegação fica no service worker para não matar o content script. */
  async function runStep(command) {
    if (command.step === 'ping') {
      return { ok: true, pong: true, remoteId: parseProjectId(), href: location.href }
    }

    if (isLoginPage()) {
      return {
        ok: false,
        type: 'needs_login',
        loginUrl: LOGIN_URL,
        message: 'Faça login no Google Flow pelo Chrome e tente novamente.',
        code: 'not_authenticated',
      }
    }

    if (command.step === 'probe') {
      if (isNotFoundPage() && !parseProjectId()) {
        return {
          ok: false,
          code: 'project_not_found',
          message: 'Google Flow está na página de projeto inexistente.',
          href: location.href,
        }
      }
      return {
        ok: true,
        remoteId: parseProjectId(),
        remoteUrl: parseProjectId() ? projectUrl(parseProjectId()) : location.href,
        accountHint: readAccountHint(),
        href: location.href,
      }
    }

    if (command.step === 'create_click') {
      try {
        await clickNewProject()
        return { ok: true, href: location.href }
      } catch (error) {
        return {
          ok: false,
          code: error?.code || 'create_failed',
          message: error instanceof Error ? error.message : String(error),
        }
      }
    }

    if (command.step === 'delete') {
      try {
        return await deleteCurrentProject()
      } catch (error) {
        return {
          ok: false,
          code: error?.code || 'delete_failed',
          message: error instanceof Error ? error.message : String(error),
          remoteId: parseProjectId(),
        }
      }
    }

    if (command.step === 'open_file_picker' || command.step === 'prepare_upload') {
      try {
        return await prepareUploadUi()
      } catch (error) {
        return {
          ok: false,
          code: 'picker_unavailable',
          message: error instanceof Error ? error.message : String(error),
        }
      }
    }

    if (command.step === 'include_in_command' || command.step === 'confirm_upload') {
      try {
        const result = await includeUploadedInCommand({
          fileNames: Array.isArray(command.fileNames) ? command.fileNames : [],
          labels: Array.isArray(command.labels) ? command.labels : [],
          expected: Number(command.expected) || 1,
          beforeKeys: Array.isArray(command.beforeKeys) ? command.beforeKeys : [],
          beforeThumbs: Array.isArray(command.beforeThumbs) ? command.beforeThumbs : [],
        })
        return {
          ...result,
          remoteId: parseProjectId(),
        }
      } catch (error) {
        dismissResourceModal()
        return {
          ok: false,
          code: 'upload_failed',
          message: error instanceof Error ? error.message : String(error),
          remoteId: parseProjectId(),
        }
      }
    }

    if (command.step === 'fill_prompt') {
      const expectedId = String(command.remoteId || '').trim()
      const currentId = parseProjectId()
      if (expectedId && currentId && expectedId !== currentId) {
        return {
          ok: false,
          code: 'project_not_found',
          message: 'A aba do Flow não está no projeto esperado para receber o prompt.',
          remoteId: currentId,
        }
      }
      if (!currentId) {
        return {
          ok: false,
          code: 'project_not_found',
          message: 'Abra o projeto no Flow antes de enviar o prompt.',
        }
      }
      try {
        const result = await fillPromptWithMentions(
          Array.isArray(command.segments) ? command.segments : [],
          Array.isArray(command.references) ? command.references : [],
          {
            imageModelLabel: command.imageModelLabel || '',
            imageOutputs: command.imageOutputs,
          },
          String(command.prompt || ''),
          { submit: command.submit !== false },
        )
        if (!result.ok) {
          return {
            ok: false,
            code: result.code || 'prompt_failed',
            unusualActivity: Boolean(result.unusualActivity),
            submitted: Boolean(result.submitted),
            verified: Boolean(result.verified),
            attachedLabels: result.attachedLabels || [],
            message: result.message || 'Falha ao preencher o prompt no Flow.',
            remoteId: currentId,
          }
        }
        return {
          ok: true,
          mentions: result.mentions || 0,
          submitted: Boolean(result.submitted),
          typed: Boolean(result.typed),
          plain: result.plain || '',
          verified: result.verified !== false,
          attachedLabels: result.attachedLabels || [],
          modalOpen: Boolean(result.modalOpen),
          incluirPoint: result.incluirPoint || null,
          generatePoint: result.generatePoint || null,
          remoteId: currentId,
          remoteUrl: projectUrl(currentId),
          message: result.message,
        }
      } catch (error) {
        dismissResourceModal()
        return {
          ok: false,
          code: error?.code || 'prompt_failed',
          message: error instanceof Error ? error.message : String(error),
          remoteId: currentId,
        }
      }
    }

    if (command.step === 'ensure_reference_in_uploads') {
      try {
        const result = await ensureReferenceInUploads(command.reference || {})
        return result
      } catch (error) {
        dismissResourceModal()
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        }
      }
    }

    if (command.step === 'confirm_reference_in_uploads') {
      try {
        return await confirmReferenceInUploads(
          command.reference || {},
          Array.isArray(command.beforeKeys) ? command.beforeKeys : [],
        )
      } catch (error) {
        dismissResourceModal()
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        }
      }
    }

    if (command.step === 'upload_references_gallery') {
      const refs = Array.isArray(command.references) ? command.references : []
      const files = refs.map((ref, index) => fileFromBase64(ref, index)).filter(Boolean)
      if (!files.length) {
        return { ok: false, message: 'Nenhuma imagem válida para enviar à galeria.' }
      }
      try {
        // Reusa upload, mas NÃO inclui no comando — só confirma Envios.
        const before = resourceModalOpen()
          ? listEnviosEntries().map((e) => e.key)
          : []
        if (!resourceModalOpen()) await openResourceModalViaPlus()
        const result = await attachReferenceFiles(files)
        if (!result.uploaded) {
          dismissResourceModal()
          return { ok: false, message: result.reason || 'Falha no upload para Uploads.' }
        }
        // Fecha modal se Incluir abriu — queremos só galeria.
        if (resourceModalOpen()) {
          dismissResourceModal()
          await sleep(250)
        }
        const confirmed = await confirmReferenceInUploads(refs[0] || {}, before)
        return confirmed
      } catch (error) {
        dismissResourceModal()
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        }
      }
    }

    if (command.step === 'locate_create_controls') {
      return locateCreateControls(String(command.prompt || ''))
    }

    if (command.step === 'focus_prompt') {
      const box = await resolvePromptBox()
      if (!box) return { ok: false, code: 'prompt_failed', message: 'Prompt não encontrado.' }
      await pageCmd('click', { el: box })
      try {
        box.focus()
      } catch {
        /* ignore */
      }
      return { ok: true }
    }

    if (command.step === 'fill_prompt_text_only') {
      const plain = String(command.prompt || '').trim()
      if (!plain) return { ok: false, message: 'Prompt vazio.' }
      const typed = await typeIntoPrompt(plain)
      return { ok: typed, typed, ...locateCreateControls(plain) }
    }

    if (command.step === 'upload_references') {
      const expectedId = String(command.remoteId || '').trim()
      const currentId = parseProjectId()
      if (expectedId && currentId && expectedId !== currentId) {
        return {
          ok: false,
          code: 'project_not_found',
          message: 'A aba do Flow não está no projeto esperado para receber as referências.',
          remoteId: currentId,
        }
      }
      if (!currentId) {
        return {
          ok: false,
          code: 'project_not_found',
          message: 'Abra o projeto no Flow antes de anexar as referências.',
        }
      }

      const files = (Array.isArray(command.references) ? command.references : [])
        .slice(0, 8)
        .map((ref, index) => fileFromBase64(ref, index))
        .filter(Boolean)
      if (!files.length) {
        return {
          ok: false,
          code: 'upload_failed',
          message: 'Nenhuma imagem válida para anexar.',
          remoteId: currentId,
        }
      }

      try {
        const result = await attachReferenceFiles(files)
        if (!result.uploaded) {
          dismissResourceModal()
          return {
            ok: false,
            code: 'upload_failed',
            message: result.reason || 'Falha ao anexar as imagens no Flow.',
            remoteId: currentId,
          }
        }
        if (resourceModalOpen()) {
          const included = await includeUploadedInCommand({
            fileNames: files.map((f) => f.name),
            labels: (Array.isArray(command.references) ? command.references : [])
              .map((ref) => String(ref?.label || '').trim())
              .filter(Boolean),
            expected: files.length,
            beforeKeys: [],
            beforeThumbs: result.beforeThumbs || [],
          })
          if (included?.ok) {
            return {
              ok: true,
              uploaded: included.uploaded || files.length,
              remoteId: currentId,
              remoteUrl: projectUrl(currentId),
              message: included.message,
            }
          }
          dismissResourceModal()
          return {
            ok: false,
            code: 'upload_failed',
            message: included?.message || 'Não confirmei a referência nova no comando do Flow.',
            remoteId: currentId,
          }
        }
        dismissResourceModal()
        return {
          ok: true,
          uploaded: result.uploaded,
          remoteId: currentId,
          remoteUrl: projectUrl(currentId),
          message: `${result.uploaded} referência(s) anexada(s) no Flow.`,
        }
      } catch (error) {
        dismissResourceModal()
        return {
          ok: false,
          code: error?.code || 'upload_failed',
          message: error instanceof Error ? error.message : String(error),
          remoteId: currentId,
        }
      }
    }

    if (command.step === 'rename') {
      const remoteId = parseProjectId()
      if (!remoteId) {
        return {
          ok: false,
          code: 'project_not_found',
          message: 'Nenhum projeto Flow aberto nesta aba para renomear.',
        }
      }
      try {
        await renameProject(command.name)
      } catch (error) {
        return {
          ok: false,
          code: error?.code || 'rename_failed',
          message: error instanceof Error ? error.message : String(error),
          remoteId,
          remoteUrl: projectUrl(remoteId),
        }
      }
      return {
        ok: true,
        remoteId,
        remoteUrl: projectUrl(remoteId),
        name: command.name,
        accountHint: readAccountHint(),
      }
    }

    // Compat: create_project legado sem step — só probe/rename; criação é no background.
    if (command.type === 'create_project' || command.type === 'verify_project') {
      const remoteId = parseProjectId() || command.remoteId?.trim() || null
      if (!remoteId) {
        return {
          ok: false,
          code: 'create_failed',
          message:
            'Aguarde a navegação do service worker. O content script não navega mais com location.href.',
        }
      }
      return runStep({ ...command, step: 'rename', name: command.name || command.expectedName })
    }

    return { ok: true }
  }

  const watchedRemoteId = parseProjectId()
  let reportedGone = false
  let goneTimer = null
  if (watchedRemoteId) {
    const clearGoneTimer = () => {
      if (goneTimer) {
        clearTimeout(goneTimer)
        goneTimer = null
      }
    }
    const reportGone = () => {
      if (reportedGone) return
      // Nunca apagar vínculo só porque a SPA mudou o DOM / saiu do id por um instante
      // (ex.: envio de referências, Add media, navegação). Só 404 confirmado na URL.
      if (!isConfirmedProject404()) {
        clearGoneTimer()
        return
      }
      if (goneTimer) return
      goneTimer = setTimeout(() => {
        goneTimer = null
        if (reportedGone) return
        if (!isConfirmedProject404()) return
        reportedGone = true
        chrome.runtime.sendMessage({
          type: 'project_gone',
          remoteId: watchedRemoteId,
          href: location.href,
          confirmed404: true,
        })
      }, 2000)
    }
    const observer = new MutationObserver(() => reportGone())
    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    window.addEventListener('popstate', reportGone)
    window.addEventListener(
      'pagehide',
      () => {
        clearGoneTimer()
        observer.disconnect()
      },
      { once: true },
    )
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.source !== 'atlas-flow-bridge') return false
    if (message.ping) {
      sendResponse({ ok: true, pong: true })
      return true
    }
    if (!message.command) return false
    void (async () => {
      try {
        sendResponse(await runStep(message.command))
      } catch (error) {
        sendResponse({
          ok: false,
          code: 'unknown',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    })()
    return true
  })

  // Mantém o service worker acordado enquanto houver aba do Flow —
  // sem isso o Chrome suspende a extensão e o Atlas fica esperando até abrir o popup.
  function heartbeat() {
    try {
      chrome.runtime.sendMessage({ type: 'atlas-heartbeat' }, () => {
        void chrome.runtime.lastError
      })
    } catch {
      /* ignore */
    }
  }
  heartbeat()
  setInterval(heartbeat, 20_000)
})()
