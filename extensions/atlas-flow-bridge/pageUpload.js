;(function atlasFlowBridgePageUpload() {
  // Restaura click/showPicker nativos (remove patch antigo atlasFlowClick).
  function restoreNativeFileChooserApis() {
    try {
      const iframe = document.createElement('iframe')
      iframe.setAttribute('src', 'about:blank')
      iframe.style.cssText = 'display:none!important;width:0;height:0;border:0;position:absolute'
      ;(document.documentElement || document.body || document).appendChild(iframe)
      const win = iframe.contentWindow
      if (win?.HTMLInputElement?.prototype?.click) {
        HTMLInputElement.prototype.click = win.HTMLInputElement.prototype.click
        window.__atlasFlowNativeInputClick = win.HTMLInputElement.prototype.click
      }
      if (
        typeof win?.HTMLInputElement?.prototype?.showPicker === 'function' &&
        typeof HTMLInputElement.prototype.showPicker === 'function'
      ) {
        HTMLInputElement.prototype.showPicker = win.HTMLInputElement.prototype.showPicker
        window.__atlasFlowNativeShowPicker = win.HTMLInputElement.prototype.showPicker
      }
      iframe.remove()
    } catch {
      /* ignore */
    }
  }
  restoreNativeFileChooserApis()

  if (window.__atlasFlowBridgePageUpload === 6) return
  window.__atlasFlowBridgePageUpload = 6

  let pendingFiles = null
  let appliedCount = 0

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

  function findMarked(id) {
    if (!id) return null
    try {
      return deepQueryAll(`[data-atlas-el="${CSS.escape(String(id))}"]`)[0] || null
    } catch {
      return deepQueryAll(`[data-atlas-el="${String(id)}"]`)[0] || null
    }
  }

  function buildTransfer(files) {
    const transfer = new DataTransfer()
    for (const file of files || []) {
      if (file) transfer.items.add(file)
    }
    return transfer
  }

  function applyFilesToInput(input, files) {
    if (!input || !files?.length) return 0
    const transfer = buildTransfer(files)
    try {
      input.files = transfer.files
    } catch {
      /* ignore */
    }
    try {
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')
      if (desc?.set) desc.set.call(input, transfer.files)
    } catch {
      /* ignore */
    }
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    appliedCount = input.files?.length || transfer.files.length || 0
    window.postMessage(
      { source: 'atlas-flow-bridge-hook', type: 'files-applied', count: appliedCount },
      '*',
    )
    return appliedCount
  }

  function dropOnElement(el, files) {
    if (!el || !files?.length) return 0
    const transfer = buildTransfer(files)
    const opts = { bubbles: true, cancelable: true, composed: true, dataTransfer: transfer }
    el.dispatchEvent(new DragEvent('dragenter', opts))
    el.dispatchEvent(new DragEvent('dragover', opts))
    el.dispatchEvent(new DragEvent('drop', opts))
    appliedCount = transfer.files.length
    window.postMessage(
      { source: 'atlas-flow-bridge-hook', type: 'files-applied', count: appliedCount },
      '*',
    )
    return appliedCount
  }

  function filesFromPayload(payload) {
    if (Array.isArray(payload?.files) && payload.files.length) {
      return payload.files.filter((file) => file && typeof file.name === 'string')
    }
    if (!Array.isArray(payload?.blobs)) return pendingFiles || []
    const fromBlobs = payload.blobs
      .map((item) => {
        try {
          const binary = atob(String(item.base64 || ''))
          const bytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
          return new File([bytes], item.name || 'atlas-ref.png', {
            type: item.type || 'image/png',
          })
        } catch {
          return null
        }
      })
      .filter(Boolean)
    return fromBlobs.length ? fromBlobs : pendingFiles || []
  }

  // Sem monkeypatch de click/showPicker — isso gerava:
  // "File chooser dialog can only be shown with a user activation."

  const observer = new MutationObserver(() => {
    if (!pendingFiles?.length) return
    const input =
      deepQueryAll('input[type="file"]').find((el) => {
        const accept = (el.getAttribute('accept') || '').toLowerCase()
        return !accept || /(image|\*|png|jpe?g|webp|gif|media|video)/i.test(accept)
      }) || null
    if (!input) return
    try {
      applyFilesToInput(input, pendingFiles)
    } catch {
      /* ignore */
    }
  })
  try {
    observer.observe(document.documentElement, { childList: true, subtree: true })
  } catch {
    /* ignore */
  }

  window.addEventListener('message', (event) => {
    const data = event.data
    if (!data || data.source !== 'atlas-flow-bridge-content') return

    if (data.type === 'arm-upload') {
      const direct = Array.isArray(data.files) ? data.files.filter(Boolean) : []
      pendingFiles = direct.length ? direct : filesFromPayload(data)
      appliedCount = 0
      window.postMessage(
        {
          source: 'atlas-flow-bridge-hook',
          type: 'armed',
          requestId: data.requestId,
          count: pendingFiles?.length || 0,
        },
        '*',
      )
      return
    }

    if (data.type === 'disarm-upload') {
      pendingFiles = null
      window.postMessage(
        { source: 'atlas-flow-bridge-hook', type: 'disarmed', requestId: data.requestId },
        '*',
      )
      return
    }

    if (data.type === 'page-cmd') {
      let result = 0
      try {
        const el = findMarked(data.id)
        const files = filesFromPayload(data)
        if (data.cmd === 'click-by-text') {
          const needle = String(data.text || '')
            .toLowerCase()
            .trim()
          const btn = Array.from(
            document.querySelectorAll('button, [role="button"], div[role="button"]'),
          ).find((node) => {
            const label = `${node.getAttribute?.('aria-label') || ''} ${node.innerText || node.textContent || ''}`
              .replace(/\s+/g, ' ')
              .trim()
              .toLowerCase()
            if (!needle || !label.includes(needle)) return false
            if (node.disabled || node.getAttribute('aria-disabled') === 'true') return false
            const style = window.getComputedStyle(node)
            if (style.display === 'none' || style.visibility === 'hidden') return false
            const rect = node.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0
          })
          if (btn) {
            btn.focus()
            btn.click()
            result = 1
          }
        } else if (data.cmd === 'set-files' && el) result = applyFilesToInput(el, files)
        else if (data.cmd === 'drop-files' && el) result = dropOnElement(el, files)
        else if (data.cmd === 'click' && el) {
          // Nunca .click() em input[type=file] — abre seletor sem user activation.
          if (el.tagName === 'INPUT' && String(el.type).toLowerCase() === 'file') {
            result = files.length
              ? applyFilesToInput(el, files)
              : pendingFiles?.length
                ? applyFilesToInput(el, pendingFiles)
                : 0
          } else {
            el.focus()
            el.click()
            result = 1
          }
        } else if (data.cmd === 'clear' && el) {
          el.focus()
          if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
            el.textContent = ''
            el.dispatchEvent(
              new InputEvent('input', { bubbles: true, composed: true, inputType: 'deleteContent' }),
            )
          } else {
            const proto =
              el.tagName === 'TEXTAREA'
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype
            const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
            if (setter) setter.call(el, '')
            else el.value = ''
            el.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
          }
          result = 1
        } else if (data.cmd === 'press-key' && el) {
          el.focus()
          const key = String(data.key || '')
          const code =
            key === 'Enter'
              ? 'Enter'
              : key === 'Escape'
                ? 'Escape'
                : key === 'ArrowDown'
                  ? 'ArrowDown'
                  : key === 'ArrowUp'
                    ? 'ArrowUp'
                    : key
          const keyCode =
            key === 'Enter' ? 13 : key === 'Escape' ? 27 : key === 'ArrowDown' ? 40 : key === 'ArrowUp' ? 38 : 0
          const opts = {
            key,
            code,
            keyCode,
            which: keyCode,
            bubbles: true,
            cancelable: true,
            composed: true,
          }
          el.dispatchEvent(new KeyboardEvent('keydown', opts))
          el.dispatchEvent(new KeyboardEvent('keyup', opts))
          document.activeElement?.dispatchEvent?.(new KeyboardEvent('keydown', opts))
          result = 1
        } else if (data.cmd === 'insert-text' && el) {
          const text = String(data.text || '')
          el.focus()
          const editable =
            el.isContentEditable ||
            el.getAttribute('contenteditable') === 'true' ||
            el.getAttribute('role') === 'textbox'
          if (editable) {
            // beforeinput + execCommand: o Flow escuta isso para abrir o menu @.
            try {
              el.dispatchEvent(
                new InputEvent('beforeinput', {
                  bubbles: true,
                  cancelable: true,
                  composed: true,
                  inputType: 'insertText',
                  data: text,
                }),
              )
            } catch {
              /* ignore */
            }
            const ok = document.execCommand('insertText', false, text)
            if (!ok) {
              el.textContent = `${el.textContent || ''}${text}`
            }
            el.dispatchEvent(
              new InputEvent('input', {
                bubbles: true,
                composed: true,
                inputType: 'insertText',
                data: text,
              }),
            )
          } else {
            const proto =
              el.tagName === 'TEXTAREA'
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype
            const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
            const next = `${el.value || ''}${text}`
            if (setter) setter.call(el, next)
            else el.value = next
            el.dispatchEvent(
              new InputEvent('input', {
                bubbles: true,
                composed: true,
                inputType: 'insertText',
                data: text,
              }),
            )
          }
          result = text.length || 1
        }
      } catch {
        result = 0
      }
      window.postMessage(
        {
          source: 'atlas-flow-bridge-hook',
          type: 'page-result',
          requestId: data.requestId,
          result,
          appliedCount,
        },
        '*',
      )
    }
  })
})()
