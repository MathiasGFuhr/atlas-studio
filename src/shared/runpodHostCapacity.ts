/** Erros de capacidade do host físico do Pod (REST v2 HTTP 400). */

export function isRunpodHostGpuUnavailableMessage(message: string | null | undefined): boolean {
  const text = String(message || '').toLowerCase()
  if (!text) return false
  return (
    text.includes('not enough free gpus') ||
    text.includes('free gpus on the host') ||
    text.includes('host machine to start this pod') ||
    text.includes('não há gpu livre') ||
    text.includes('host sem capacidade') ||
    text.includes('gpu do host')
  )
}

export function formatRunpodHostGpuUnavailableMessage(raw: string): string {
  if (!isRunpodHostGpuUnavailableMessage(raw)) return raw
  return (
    'Esta GPU está ocupada na máquina atual. Escolha usar outro Pod ou criar um novo com a mesma placa — seus modelos no volume ficam guardados.'
  )
}

/** Create/start recusado por falta de instância com as specs pedidas (DC/GPU). */
export function isRunpodNoInstanceAvailableMessage(message: string | null | undefined): boolean {
  const text = String(message || '').toLowerCase()
  if (!text) return false
  return (
    text.includes('no longer any instances available') ||
    text.includes('instances available with the requested') ||
    text.includes('please refresh and try again') ||
    text.includes('nenhuma instância disponível')
  )
}

export function formatRunpodNoInstanceAvailableMessage(raw: string): string {
  if (!isRunpodNoInstanceAvailableMessage(raw)) return raw
  return (
    'Não há vaga para essa GPU agora. Prefira “Usar Pod existente” ou tente criar de novo daqui a pouco.'
  )
}
