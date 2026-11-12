const statusEl = document.getElementById('status')
const detailEl = document.getElementById('detail')
const reconnectBtn = document.getElementById('reconnect')
const resetBtn = document.getElementById('reset')
const openFlowBtn = document.getElementById('open-flow')

function render(connected, port, workerTabId) {
  if (connected) {
    statusEl.className = 'banner ok'
    statusEl.textContent = 'App Atlas Studio conectado'
    detailEl.innerHTML = [
      port ? `Ponte local em <code>127.0.0.1:${port}</code>.` : 'Ponte local ativa.',
      workerTabId != null ? ` Aba Flow worker: <code>${workerTabId}</code>.` : ' Sem aba Flow ainda.',
      ' Use “Abrir aba do Flow” para conferir o card preparado.',
    ].join('')
  } else {
    statusEl.className = 'banner bad'
    statusEl.textContent = 'Atlas não encontrado'
    detailEl.textContent = 'Abra o Atlas Studio e clique em Reconectar.'
  }
}

function refresh() {
  chrome.runtime.sendMessage({ type: 'atlas-status' }, (response) => {
    render(Boolean(response?.connected), response?.port ?? null, response?.workerTabId ?? null)
  })
}

openFlowBtn.addEventListener('click', () => {
  openFlowBtn.disabled = true
  detailEl.textContent = 'Abrindo a aba do Flow…'
  chrome.runtime.sendMessage({ type: 'atlas-open-flow' }, (response) => {
    openFlowBtn.disabled = false
    if (chrome.runtime.lastError) {
      detailEl.textContent = chrome.runtime.lastError.message || 'Falha ao falar com a extensão.'
      return
    }
    detailEl.textContent = response?.message || 'Não consegui abrir a aba do Flow.'
  })
})

reconnectBtn.addEventListener('click', () => {
  reconnectBtn.disabled = true
  chrome.runtime.sendMessage({ type: 'atlas-rediscover' }, (response) => {
    reconnectBtn.disabled = false
    render(Boolean(response?.connected), response?.port ?? null, response?.workerTabId ?? null)
  })
})

resetBtn.addEventListener('click', () => {
  resetBtn.disabled = true
  chrome.runtime.sendMessage({ type: 'atlas-reset-busy' }, () => {
    resetBtn.disabled = false
    detailEl.textContent = 'Fila liberada. Tente vincular novamente no Atlas.'
    refresh()
  })
})

refresh()
