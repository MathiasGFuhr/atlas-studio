/** Regras do menu de exclusão do Flow. “Ver lixeira” não exclui o projeto. */

export function plainDeleteLabel(label) {
  return String(label || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isViewTrashLabel(label) {
  return /ver lixeira|view trash|see trash|mostrar lixeira|open trash/.test(plainDeleteLabel(label))
}

export function isExactDeleteAction(label) {
  const text = plainDeleteLabel(label)
  if (!text || text.length > 80 || isViewTrashLabel(text)) return false
  if (/renomear|rename|\bedit\b|undo|desfazer|cancel|voltar|\bback\b/.test(text)) return false
  return /(^| )(delete project|excluir projeto|move to trash|mover para a lixeira|move to bin|apagar projeto|remover projeto|delete|excluir|apagar)( |$)/.test(
    text,
  )
}
