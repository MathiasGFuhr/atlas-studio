import assert from 'node:assert/strict'
import {
  classifyLoadingScope,
  explainUnusableReasons,
  isAddIngredientsLabel,
  isAddMediaMenuLabel,
  isAddToPromptLabel,
  isAssetListLabel,
  isAssetsPanelLabel,
  isCategoryNavigationLabel,
  isSearchAssetsLabel,
  isSortAssetsLabel,
  isStartGenerationLabel,
  isUploadMediaLabel,
  isNewProjectLabel,
  operationControlsReady,
  shouldProceedWithPanelUpload,
} from './readinessContract.mjs'

function scenarioUploadReadyGenerateDisabled() {
  return {
    isLoading: false,
    editorUsable: true,
    ingredientsUsableCount: 1,
    addMediaUsableCount: 1,
    startGenerationUsableCount: 0,
    hasPromptText: false,
    referenceCount: 0,
  }
}

function run() {
  const snap = scenarioUploadReadyGenerateDisabled()

  assert.equal(operationControlsReady('open_upload', snap), true)
  assert.equal(operationControlsReady('generate', snap), false)
  assert.equal(
    operationControlsReady('open_upload', { ...snap, addMediaUsableCount: 0 }),
    true,
  )
  assert.equal(
    operationControlsReady('open_upload', {
      ...snap,
      ingredientsUsableCount: 0,
      addMediaUsableCount: 0,
    }),
    false,
  )

  const residualProgress = classifyLoadingScope({
    projectContextOk: true,
    editorUsable: true,
    onlyShell: false,
    busy: true,
    loadingLabel: false,
    assetsPanelPresent: false,
    uploadMediaUsableCount: 0,
  })
  assert.equal(residualProgress.isGlobalBlocking, false)
  assert.equal(residualProgress.scope, 'none')

  // Carregamento global (shell / sem contexto).
  const globalLoading = classifyLoadingScope({
    projectContextOk: true,
    editorUsable: false,
    onlyShell: true,
    busy: false,
    loadingLabel: true,
    assetsPanelPresent: false,
    uploadMediaUsableCount: 0,
  })
  assert.equal(globalLoading.scope, 'global')
  assert.equal(globalLoading.isGlobalBlocking, true)
  assert.equal(shouldProceedWithPanelUpload(globalLoading), false)

  // Loading local do seletor de assets (lista), upload ainda não utilizável.
  const panelLoading = classifyLoadingScope({
    projectContextOk: true,
    editorUsable: true,
    onlyShell: false,
    busy: true,
    loadingLabel: true,
    assetsPanelPresent: true,
    uploadMediaUsableCount: 0,
  })
  assert.equal(panelLoading.scope, 'panel_local')
  assert.equal(panelLoading.isGlobalBlocking, false)
  assert.equal(panelLoading.isPanelLocalLoading, true)
  assert.equal(shouldProceedWithPanelUpload(panelLoading), false)

  // Upload disponível enquanto a lista carrega — NÃO bloquear.
  const uploadWhileListLoads = classifyLoadingScope({
    projectContextOk: true,
    editorUsable: true,
    onlyShell: false,
    busy: true,
    loadingLabel: true,
    assetsPanelPresent: true,
    uploadMediaUsableCount: 1,
  })
  assert.equal(uploadWhileListLoads.scope, 'panel_local')
  assert.equal(uploadWhileListLoads.isGlobalBlocking, false)
  assert.equal(uploadWhileListLoads.uploadAvailableDespiteListLoading, true)
  assert.equal(shouldProceedWithPanelUpload(uploadWhileListLoads), true)

  assert.equal(isUploadMediaLabel('Upload media'), true)
  assert.equal(isUploadMediaLabel('uploadUpload media'), true)
  assert.equal(isUploadMediaLabel('uploadFazer upload de mídia'), true)
  assert.equal(isUploadMediaLabel('Search assets'), false)

  // Locale PT-BR observado no Flow — match exato, não genérico.
  assert.equal(isAddIngredientsLabel('add ingredients to the prompt box'), true)
  assert.equal(isAddIngredientsLabel('Adicionar elementos à caixa de comando'), true)
  assert.equal(isAddIngredientsLabel('Adicionar'), false)
  assert.equal(isStartGenerationLabel('Start generation'), true)
  assert.equal(isStartGenerationLabel('Iniciar geração'), true)
  assert.equal(isStartGenerationLabel('Gerar'), false)
  assert.equal(isAddMediaMenuLabel('add media menu'), true)
  assert.equal(isAddMediaMenuLabel('Menu para adicionar arquivos'), true)
  assert.equal(isAssetsPanelLabel('Pesquisar recursos'), true)
  assert.equal(isAssetsPanelLabel('Lista de recursos'), false)
  assert.equal(isSearchAssetsLabel('Pesquisar recursos'), true)
  assert.equal(isSortAssetsLabel('Ordenar recursos'), true)
  assert.equal(isCategoryNavigationLabel('Navegação por categoria'), true)
  assert.equal(isAssetListLabel('Lista de recursos'), true)
  assert.equal(isAddToPromptLabel('Incluir no comando'), true)
  assert.equal(isNewProjectLabel('New project'), true)
  assert.equal(isNewProjectLabel('addNew project'), true)
  assert.equal(isNewProjectLabel('+ Novo projeto'), true)
  assert.equal(isNewProjectLabel('Novo projeto'), true)
  assert.equal(isNewProjectLabel('addNovo projeto'), true)
  assert.equal(isNewProjectLabel('add_circleNovo projeto'), true)
  assert.equal(isNewProjectLabel('Criar projeto'), true)
  assert.equal(isNewProjectLabel('Projeto'), false)

  assert.deepEqual(
    explainUnusableReasons({
      isElement: true,
      disabledAttr: true,
      ariaDisabled: null,
      display: 'inline-flex',
      visibility: 'visible',
      opacity: '1',
      clientRects: 1,
    }),
    ['DISABLED_ATTR'],
  )

  console.log('readinessContract.test.mjs: OK')
}

run()
