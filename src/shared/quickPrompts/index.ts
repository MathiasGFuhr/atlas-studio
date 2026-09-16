// Contexto de palco — compartilhado pelas duas categorias.
export * from './stageContext'

// Categoria "Animar / Lipsync" (vídeo).
export * from './types'
export * from './presets'
export * from './sceneBlocks'
export * from './composePrompt'

// Categoria "Criar imagem" (imagem estática). Mantida separada de propósito:
// composição de imagem não compartilha presets com movimento de câmera.
export * from './imageTypes'
export * from './imagePresets'
export * from './composeImagePrompt'
