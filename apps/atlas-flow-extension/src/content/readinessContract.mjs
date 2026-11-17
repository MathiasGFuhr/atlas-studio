/**
 * Contrato de prontidão por operação (fonte de verdade para testes).
 * pageSensor.js deve espelhar estas regras nas checagens DOM.
 */

/** @typedef {'base' | 'open_upload' | 'generate'} ReadyOperation */
/** @typedef {'none' | 'global' | 'panel_local'} LoadingScope */

/**
 * @param {ReadyOperation} operation
 * @param {{
 *   isLoading: boolean,
 *   editorUsable: boolean,
 *   ingredientsUsableCount: number,
 *   addMediaUsableCount: number,
 *   startGenerationUsableCount: number,
 *   hasPromptText?: boolean,
 *   referenceCount?: number,
 * }} snap
 */
export function operationControlsReady(operation, snap) {
  if (snap.isLoading) return false

  if (operation === 'base') {
    return true
  }

  if (operation === 'open_upload') {
    // Um dos dois caminhos basta: ingredients é o principal, Add media é o fallback.
    return (
      snap.editorUsable === true &&
      (snap.ingredientsUsableCount === 1 || snap.addMediaUsableCount === 1)
    )
  }

  if (operation === 'generate') {
    return (
      snap.editorUsable === true &&
      snap.startGenerationUsableCount >= 1 &&
      snap.hasPromptText === true &&
      (snap.referenceCount ?? 0) >= 0
    )
  }

  return false
}

/**
 * Distingue carregamento global da página vs loading local do seletor de assets.
 * Upload disponível no painel NÃO é bloqueado por loading da lista.
 *
 * @param {{
 *   projectContextOk: boolean,
 *   editorUsable: boolean,
 *   onlyShell: boolean,
 *   busy: boolean,
 *   loadingLabel: boolean,
 *   assetsPanelPresent: boolean,
 *   uploadMediaUsableCount: number,
 * }} snap
 * @returns {{
 *   scope: LoadingScope,
 *   isGlobalBlocking: boolean,
 *   isPanelLocalLoading: boolean,
 *   uploadAvailableDespiteListLoading: boolean,
 * }}
 */
export function classifyLoadingScope(snap) {
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

  // Editor já utilizável: progressbar ou aria-busy residual não trava a página.

  return {
    scope: 'none',
    isGlobalBlocking: false,
    isPanelLocalLoading: false,
    uploadAvailableDespiteListLoading: uploadAvailable,
  }
}

/**
 * Após abrir ingredientes: se Upload media está único/utilizável, seguir;
 * loading da lista não cancela a ação.
 */
export function shouldProceedWithPanelUpload(scopeResult) {
  if (scopeResult.uploadAvailableDespiteListLoading) return true
  if (scopeResult.isGlobalBlocking) return false
  return false
}

/**
 * Classifica por que um controle matched não é utilizável (sem assumir disabled).
 * @param {{
 *   isElement?: boolean,
 *   disabledAttr?: boolean,
 *   ariaDisabled?: string | null,
 *   display?: string,
 *   visibility?: string,
 *   opacity?: string,
 *   clientRects?: number,
 * }} flags
 */
export function explainUnusableReasons(flags) {
  const reasons = []
  if (flags.isElement === false) {
    reasons.push('NOT_ELEMENT')
    return reasons
  }
  if (flags.disabledAttr === true) reasons.push('DISABLED_ATTR')
  if (flags.ariaDisabled === 'true') reasons.push('ARIA_DISABLED')
  if (flags.display === 'none') reasons.push('DISPLAY_NONE')
  if (flags.visibility === 'hidden') reasons.push('VISIBILITY_HIDDEN')
  if (flags.opacity === '0') reasons.push('OPACITY_ZERO')
  if ((flags.clientRects ?? 0) <= 0) reasons.push('NO_CLIENT_RECTS')
  return reasons
}

/** Normaliza label acessível (minúsculas, espaços, sem acento). */
export function normalizeControlLabel(label) {
  return String(label || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Labels exatos observados (EN + PT-BR). Sem fallback genérico/ambíguo.
 * PT observado no Flow: "Adicionar elementos à caixa de comando".
 */
export function isAddIngredientsLabel(label) {
  const n = normalizeControlLabel(label)
  return (
    n === 'add ingredients to the prompt box' ||
    n === 'adicionar elementos a caixa de comando'
  )
}

/** EN: "start generation" · PT observado: "Iniciar geração". */
export function isStartGenerationLabel(label) {
  const n = normalizeControlLabel(label)
  if (!n) return false
  if (n === 'start generation' || n === 'iniciar geracao') return true
  if (n.endsWith('start generation') || n.endsWith('iniciar geracao')) return true
  return false
}

/** EN: "add media menu" · PT observado: "Menu para adicionar arquivos". */
export function isAddMediaMenuLabel(label) {
  const n = normalizeControlLabel(label)
  return n === 'add media menu' || n === 'menu para adicionar arquivos'
}

/** Normaliza label observado ("uploadUpload media" / "uploadFazer upload de mídia"). */
export function isUploadMediaLabel(label) {
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

/** EN: Search assets · PT observado: "Pesquisar recursos". */
export function isSearchAssetsLabel(label) {
  const n = normalizeControlLabel(label)
  return (
    n === 'search assets' ||
    n === 'pesquisar assets' ||
    n === 'pesquisar recursos' ||
    n.endsWith('pesquisar recursos') ||
    n.endsWith('search assets')
  )
}

/** EN: Sort assets · PT: "Ordenar recursos". */
export function isSortAssetsLabel(label) {
  const n = normalizeControlLabel(label)
  return n === 'sort assets' || n === 'ordenar assets' || n === 'ordenar recursos'
}

/** EN: Category navigation · PT: "Navegação por categoria". */
export function isCategoryNavigationLabel(label) {
  const n = normalizeControlLabel(label)
  return (
    n === 'category navigation' ||
    n === 'navegacao de categorias' ||
    n === 'navegacao por categoria'
  )
}

/** EN: Asset list · PT: "Lista de recursos". */
export function isAssetListLabel(label) {
  const n = normalizeControlLabel(label)
  return n === 'asset list' || n === 'lista de recursos'
}

/** EN: Add to prompt · PT: "Incluir no comando". */
export function isAddToPromptLabel(label) {
  const n = normalizeControlLabel(label)
  return n === 'add to prompt' || n === 'incluir no comando'
}

/** EN: New project / addNew project · PT oficial: "+ Novo projeto". */
export function isNewProjectLabel(label) {
  const n = normalizeControlLabel(label)
  if (!n) return false
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

export function isAssetsPanelLabel(label) {
  return (
    isSearchAssetsLabel(label) ||
    isSortAssetsLabel(label) ||
    isCategoryNavigationLabel(label) ||
    isUploadMediaLabel(label)
  )
}
