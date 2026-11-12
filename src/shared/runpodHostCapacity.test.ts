import { describe, expect, it } from 'vitest'
import {
  formatRunpodHostGpuUnavailableMessage,
  formatRunpodNoInstanceAvailableMessage,
  isRunpodHostGpuUnavailableMessage,
  isRunpodNoInstanceAvailableMessage,
} from './runpodHostCapacity'

describe('runpodHostCapacity', () => {
  it('detecta o 400 clássico do host sem GPU', () => {
    const raw =
      'A API do RunPod respondeu 400: {"detail":"There are not enough free GPUs on the host machine to start this pod.","status":400,"title":"Bad Request"}'
    expect(isRunpodHostGpuUnavailableMessage(raw)).toBe(true)
    expect(formatRunpodHostGpuUnavailableMessage(raw)).toMatch(/modelos no volume/i)
  })

  it('detecta falta de instância com as specs pedidas', () => {
    const raw =
      'There are no longer any instances available with the requested specifications. Please refresh and try again.'
    expect(isRunpodNoInstanceAvailableMessage(raw)).toBe(true)
    expect(formatRunpodNoInstanceAvailableMessage(raw)).toMatch(/Usar Pod existente/i)
  })

  it('ignora outros erros', () => {
    expect(isRunpodHostGpuUnavailableMessage('Chave inválida')).toBe(false)
    expect(isRunpodNoInstanceAvailableMessage('Chave inválida')).toBe(false)
  })
})
