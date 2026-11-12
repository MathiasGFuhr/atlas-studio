import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn(async () => undefined),
    openPath: vi.fn(async () => ''),
  },
  app: {
    getName: () => 'Atlas Studio',
  },
}))

const listByProjectMock = vi.fn(() => [] as Array<{
  id: string
  projectId: string
  label: string
  imagePath: string
  imageUrl: string | null
  imageThumbUrl: string | null
  sortOrder: number
  flowUploadKey: string | null
  flowFileName: string | null
  syncStatus: 'local' | 'sending' | 'confirming' | 'sent' | 'error'
  syncedAt: string | null
  lastSyncError: string | null
  createdAt: string
  updatedAt: string
}>)
const updateReferenceMock = vi.fn((id: string, patch: Record<string, unknown>) => {
  const current = listByProjectMock().find((item) => item.id === id)
  if (!current) return null
  return { ...current, ...patch }
})

vi.mock('../../repositories/flowReferenceRepository', () => ({
  flowReferenceRepository: {
    listByProject: (...args: unknown[]) => listByProjectMock(...args),
    removeByProject: vi.fn(() => 0),
    update: (...args: unknown[]) => updateReferenceMock(...(args as [string, Record<string, unknown>])),
    get: (id: string) => listByProjectMock().find((item) => item.id === id) ?? null,
  },
}))

vi.mock('../../repositories/flowGenerationCardRepository', () => ({
  flowGenerationCardRepository: {
    listByProject: vi.fn(() => []),
    removeByProject: vi.fn(() => 0),
    get: vi.fn(() => null),
    add: vi.fn(),
    importPrompts: vi.fn(() => []),
    update: vi.fn(),
    remove: vi.fn(() => false),
  },
}))

import type { FlowProject } from '../../../shared/flowProjects'
import { buildFlowProjectUrl } from '../../../shared/flowProjects'
import type { FlowBridgeCommand, FlowBridgeEvent } from '../../../shared/flowBridgeProtocol'
import { createFlowProjectService, type FlowBridgePort, type FlowProjectStore } from './FlowProjectService'

function createStore(): FlowProjectStore & { projects: Map<string, FlowProject> } {
  const projects = new Map<string, FlowProject>()
  let seq = 1
  return {
    projects,
    list: () => [...projects.values()],
    get: (id) => projects.get(id) ?? null,
    create: (input) => {
      const now = new Date().toISOString()
      const project: FlowProject = {
        id: `fp-${seq++}`,
        name: input.name,
        localFolderPath: input.localFolderPath,
        remoteUrl: null,
        remoteId: null,
        accountHint: null,
        syncStatus: input.syncStatus ?? 'local_created',
        lastError: null,
        createInFlow: input.createInFlow !== false,
        operationId: input.operationId ?? `op-${seq}`,
        prompt: '',
        imageModel: 'nano-banana-2.1',
        imageOutputs: 3,
        generationPaused: false,
        createdAt: now,
        updatedAt: now,
      }
      projects.set(project.id, project)
      return project
    },
    update: (id, patch) => {
      const current = projects.get(id)
      if (!current) return null
      const next = { ...current, ...patch, updatedAt: new Date().toISOString() }
      projects.set(id, next)
      return next
    },
    remove: (id) => projects.delete(id),
    getByRemoteId: (remoteId) =>
      [...projects.values()].find((project) => project.remoteId === remoteId) ?? null,
  }
}

function createBridge(): FlowBridgePort & EventEmitter & { commands: FlowBridgeCommand[] } {
  const emitter = new EventEmitter()
  const bridge = Object.assign(emitter, {
    commands: [] as FlowBridgeCommand[],
    start: async () => ({
      running: true,
      port: 39207,
      token: 'test-token',
      extensionConnected: true,
      accountHint: null,
      extensionPath: 'D:\\ext',
      lastError: null,
    }),
    getStatus: () => ({
      running: true,
      port: 39207,
      token: 'test-token',
      extensionConnected: true,
      accountHint: null,
      extensionPath: 'D:\\ext',
      lastError: null,
    }),
    enqueue: (command: FlowBridgeCommand) => {
      bridge.commands.push(command)
    },
  }) as FlowBridgePort & EventEmitter & { commands: FlowBridgeCommand[] }
  return bridge
}

describe('FlowProjectService', () => {
  it('cria projeto local com pasta e nome válidos', async () => {
    const store = createStore()
    const bridge = createBridge()
    const service = createFlowProjectService({
      store,
      bridge,
      folderExistsFn: () => true,
      waitForExtensionMs: 10,
      waitForResultMs: 50,
    })

    // createInFlow false — só local
    const project = await service.create({
      name: 'Clipe A',
      localFolderPath: 'D:\\flow\\a',
      createInFlow: false,
    })

    expect(project.name).toBe('Clipe A')
    expect(project.localFolderPath).toBe('D:\\flow\\a')
    expect(project.syncStatus).toBe('local_created')
    expect(store.projects.size).toBe(1)
  })

  it('rejeita pasta inexistente e não grava', async () => {
    const store = createStore()
    const service = createFlowProjectService({
      store,
      bridge: createBridge(),
      folderExistsFn: () => false,
    })

    await expect(
      service.create({ name: 'X', localFolderPath: 'D:\\missing', createInFlow: false }),
    ).rejects.toThrow(/não existe/i)
    expect(store.projects.size).toBe(0)
  })

  it('rejeita nome vazio', async () => {
    const store = createStore()
    const service = createFlowProjectService({
      store,
      bridge: createBridge(),
      folderExistsFn: () => true,
    })
    await expect(
      service.create({ name: '  ', localFolderPath: 'D:\\flow', createInFlow: false }),
    ).rejects.toThrow(/nome/i)
  })

  it('marca awaiting_login quando a extensão reporta não autenticado', async () => {
    const store = createStore()
    const bridge = createBridge()
    const service = createFlowProjectService({
      store,
      bridge,
      folderExistsFn: () => true,
      waitForExtensionMs: 20,
      waitForResultMs: 200,
    })

    const createPromise = service.create({
      name: 'Clipe Login',
      localFolderPath: 'D:\\flow\\login',
      createInFlow: true,
    })

    await vi.waitFor(() => expect(bridge.commands.length).toBe(1))
    const requestId = bridge.commands[0]!.requestId
    bridge.emit('event', {
      type: 'needs_login',
      requestId,
      loginUrl: 'https://accounts.google.com',
      message: 'Faça login no Google.',
    } satisfies FlowBridgeEvent)

    const project = await createPromise
    expect(project.syncStatus).toBe('awaiting_login')
    expect(project.lastError).toMatch(/login|Chrome/i)
  })

  it('vincula em segundo plano sem abrir janela na frente', async () => {
    const store = createStore()
    const bridge = createBridge()
    const service = createFlowProjectService({
      store,
      bridge,
      folderExistsFn: () => true,
      waitForExtensionMs: 20,
      waitForResultMs: 200,
    })

    const createPromise = service.create({
      name: 'Clipe OK',
      localFolderPath: 'D:\\flow\\ok',
      createInFlow: true,
    })

    await vi.waitFor(() => expect(bridge.commands.length).toBe(1))
    const cmd = bridge.commands[0]!
    expect(cmd.type).toBe('create_project')
    if (cmd.type === 'create_project') {
      expect(cmd.background).toBe(true)
    }
    const requestId = cmd.requestId
    const operationId = cmd.type === 'create_project' ? cmd.operationId : ''
    const remoteId = '11111111-2222-3333-4444-555555555555'

    bridge.emit('event', {
      type: 'session_ready',
      requestId,
      workerTabId: 77,
      background: true,
      url: 'https://flow.google.com/',
    } satisfies FlowBridgeEvent)

    bridge.emit('event', {
      type: 'project_partial',
      requestId,
      operationId,
      remoteId,
      remoteUrl: buildFlowProjectUrl(remoteId),
    } satisfies FlowBridgeEvent)

    bridge.emit('event', {
      type: 'project_linked',
      requestId,
      operationId,
      remoteId,
      remoteUrl: buildFlowProjectUrl(remoteId),
      name: 'Clipe OK',
      accountHint: 'mathias@gmail.com',
    } satisfies FlowBridgeEvent)

    const project = await createPromise
    expect(project.syncStatus).toBe('linked')
    expect(project.remoteId).toBe(remoteId)
    expect(project.accountHint).toBe('ma…@gmail.com')
  })

  it('Ver no Flow revela a aba existente sem criar projeto novo', async () => {
    const store = createStore()
    const remoteId = 'reveal-id-1'
    const existing = store.create({
      name: 'Revelar',
      localFolderPath: 'D:\\flow\\r',
      createInFlow: true,
      syncStatus: 'linked',
      operationId: 'op-reveal',
    })
    store.update(existing.id, {
      remoteId,
      remoteUrl: buildFlowProjectUrl(remoteId),
      syncStatus: 'linked',
    })

    const bridge = createBridge()
    const service = createFlowProjectService({
      store,
      bridge,
      folderExistsFn: () => true,
      waitForResultMs: 200,
    })

    const revealPromise = service.openRemote(existing.id)
    await vi.waitFor(() => expect(bridge.commands.length).toBe(1))
    expect(bridge.commands[0]).toMatchObject({
      type: 'reveal_project',
      remoteId,
    })
    bridge.emit('event', {
      type: 'revealed',
      requestId: bridge.commands[0]!.requestId,
      workerTabId: 12,
      remoteUrl: buildFlowProjectUrl(remoteId),
    } satisfies FlowBridgeEvent)

    await expect(revealPromise).resolves.toBe(true)
  })

  it('Ver no Flow falha com erro claro se a extensão não estiver conectada', async () => {
    const store = createStore()
    const remoteId = 'offline-id'
    const existing = store.create({
      name: 'Offline',
      localFolderPath: 'D:\\flow\\offline',
      createInFlow: true,
      syncStatus: 'linked',
      operationId: 'op-offline',
    })
    store.update(existing.id, {
      remoteId,
      remoteUrl: buildFlowProjectUrl(remoteId),
      syncStatus: 'linked',
    })

    const bridge = createBridge()
    bridge.getStatus = () => ({
      running: true,
      port: 39207,
      token: 'test-token',
      extensionConnected: false,
      accountHint: null,
      extensionPath: 'D:\\ext',
      lastError: null,
    })
    const service = createFlowProjectService({
      store,
      bridge,
      folderExistsFn: () => true,
      waitForResultMs: 200,
    })

    await expect(service.openRemote(existing.id)).rejects.toThrow(/não conectada|não abre abas/i)
    expect(bridge.commands).toEqual([])
  })

  it('em falha de rename preserva remoteId e não perde o vínculo parcial', async () => {
    const store = createStore()
    const bridge = createBridge()
    const service = createFlowProjectService({
      store,
      bridge,
      folderExistsFn: () => true,
      waitForExtensionMs: 20,
      waitForResultMs: 200,
    })

    const createPromise = service.create({
      name: 'Clipe Rename',
      localFolderPath: 'D:\\flow\\rename',
      createInFlow: true,
    })

    await vi.waitFor(() => expect(bridge.commands.length).toBe(1))
    const requestId = bridge.commands[0]!.requestId
    const remoteId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

    bridge.emit('event', {
      type: 'error',
      requestId,
      code: 'rename_failed',
      message: 'Não foi possível renomear o projeto.',
      remoteId,
      remoteUrl: buildFlowProjectUrl(remoteId),
    } satisfies FlowBridgeEvent)

    const project = await createPromise
    expect(project.syncStatus).toBe('sync_failed')
    expect(project.remoteId).toBe(remoteId)

    // Retry não deve pedir create sem remoteId
    bridge.commands = []
    const retryPromise = service.retryLink(project.id)
    await vi.waitFor(() => expect(bridge.commands.length).toBe(1))
    const retryCmd = bridge.commands[0]!
    expect(retryCmd.type).toBe('create_project')
    if (retryCmd.type === 'create_project') {
      expect(retryCmd.remoteId).toBe(remoteId)
    }

    bridge.emit('event', {
      type: 'project_linked',
      requestId: retryCmd.requestId,
      operationId: project.operationId,
      remoteId,
      remoteUrl: buildFlowProjectUrl(remoteId),
      name: 'Clipe Rename',
    } satisfies FlowBridgeEvent)

    const linked = await retryPromise
    expect(linked.syncStatus).toBe('linked')
  })

  it('em 404 limpa o ID morto e cria um projeto novo na mesma tentativa', async () => {
    const store = createStore()
    const bridge = createBridge()
    const service = createFlowProjectService({
      store,
      bridge,
      folderExistsFn: () => true,
      waitForExtensionMs: 20,
      waitForResultMs: 400,
    })

    const existing = store.create({
      name: 'Stale',
      localFolderPath: 'D:\\flow\\stale',
      createInFlow: true,
      syncStatus: 'sync_failed',
      operationId: 'op-stale',
    })
    store.update(existing.id, {
      remoteId: 'dead-id',
      remoteUrl: buildFlowProjectUrl('dead-id'),
      lastError: '404',
    })

    const retryPromise = service.retryLink(existing.id)
    await vi.waitFor(() => expect(bridge.commands.length).toBe(1))
    expect(bridge.commands[0]).toMatchObject({ remoteId: 'dead-id' })
    bridge.emit('event', {
      type: 'error',
      requestId: bridge.commands[0]!.requestId,
      code: 'project_not_found',
      message: 'Google Flow respondeu 404 ao abrir o projeto.',
      remoteId: 'dead-id',
      remoteUrl: buildFlowProjectUrl('dead-id'),
    } satisfies FlowBridgeEvent)

    await vi.waitFor(() => expect(bridge.commands.length).toBe(2))
    const recreate = bridge.commands[1]!
    expect(recreate.type).toBe('create_project')
    if (recreate.type === 'create_project') {
      expect(recreate.remoteId).toBeNull()
    }

    const freshId = '012499f7-517b-48f6-a5d5-87c6c523f707'
    bridge.emit('event', {
      type: 'project_linked',
      requestId: recreate.requestId,
      operationId: existing.operationId,
      remoteId: freshId,
      remoteUrl: buildFlowProjectUrl(freshId),
      name: 'Stale',
    } satisfies FlowBridgeEvent)

    const project = await retryPromise
    expect(project.syncStatus).toBe('linked')
    expect(project.remoteId).toBe(freshId)
    expect(project.lastError).toBeNull()
  })

  it('recupera estado creating após fechamento do Atlas', () => {
    const store = createStore()
    const created = store.create({
      name: 'Interrompido',
      localFolderPath: 'D:\\flow\\x',
      createInFlow: true,
      syncStatus: 'creating',
      operationId: 'op-interrupted',
    })
    store.update(created.id, { remoteId: 'rid-1', remoteUrl: buildFlowProjectUrl('rid-1') })

    const service = createFlowProjectService({
      store,
      bridge: createBridge(),
      folderExistsFn: () => true,
    })

    const recovered = service.recoverInterrupted()
    expect(recovered).toHaveLength(1)
    expect(recovered[0]?.syncStatus).toBe('sync_failed')
    expect(recovered[0]?.remoteId).toBe('rid-1')
  })

  it('reabertura de projeto já vinculado não recria no Flow', async () => {
    const store = createStore()
    const remoteId = 'linked-id-1'
    const existing = store.create({
      name: 'Já ok',
      localFolderPath: 'D:\\flow\\ok',
      createInFlow: true,
      syncStatus: 'linked',
      operationId: 'op-linked',
    })
    store.update(existing.id, {
      remoteId,
      remoteUrl: buildFlowProjectUrl(remoteId),
      syncStatus: 'linked',
    })

    const bridge = createBridge()
    const service = createFlowProjectService({
      store,
      bridge,
      folderExistsFn: () => true,
    })

    const again = await service.retryLink(existing.id)
    expect(again.syncStatus).toBe('linked')
    expect(bridge.commands).toHaveLength(0)
  })

  it('falha de conexão marca sync_failed e preserva local', async () => {
    const store = createStore()
    const bridge = createBridge()
    bridge.getStatus = () => ({
      running: true,
      port: 39207,
      token: 'test-token',
      extensionConnected: false,
      accountHint: null,
      extensionPath: 'D:\\ext',
      lastError: null,
    })

    const service = createFlowProjectService({
      store,
      bridge,
      folderExistsFn: () => true,
      waitForExtensionMs: 30,
      waitForResultMs: 50,
    })

    const project = await service.create({
      name: 'Sem extensão',
      localFolderPath: 'D:\\flow\\off',
      createInFlow: true,
    })

    expect(store.projects.has(project.id)).toBe(true)
    expect(project.syncStatus).toBe('sync_failed')
    expect(project.lastError).toMatch(/Chrome/i)
  })

  it('segundo projeto reutiliza o fluxo em background (mesmo comando create_project)', async () => {
    const store = createStore()
    const bridge = createBridge()
    const service = createFlowProjectService({
      store,
      bridge,
      folderExistsFn: () => true,
      waitForExtensionMs: 20,
      waitForResultMs: 200,
    })

    async function createNamed(name: string) {
      const before = bridge.commands.length
      const promise = service.create({
        name,
        localFolderPath: `D:\\flow\\${name}`,
        createInFlow: true,
      })
      await vi.waitFor(() => expect(bridge.commands.length).toBe(before + 1))
      const cmd = bridge.commands[before]!
      const remoteId = `id-${name}`
      bridge.emit('event', {
        type: 'project_linked',
        requestId: cmd.requestId,
        operationId: cmd.type === 'create_project' ? cmd.operationId : '',
        remoteId,
        remoteUrl: buildFlowProjectUrl(remoteId),
        name,
      } satisfies FlowBridgeEvent)
      return promise
    }

    const first = await createNamed('A')
    const second = await createNamed('B')
    expect(first.syncStatus).toBe('linked')
    expect(second.syncStatus).toBe('linked')
    expect(bridge.commands.every((cmd) => cmd.type === 'create_project' && cmd.background === true)).toBe(
      true,
    )
  })

  it('exclui só no Atlas quando o projeto não tem remoto', async () => {
    const store = createStore()
    const bridge = createBridge()
    const service = createFlowProjectService({
      store,
      bridge,
      folderExistsFn: () => true,
      waitForExtensionMs: 20,
      waitForResultMs: 200,
    })

    const project = await service.create({
      name: 'Local',
      localFolderPath: 'D:\\flow\\local',
      createInFlow: false,
    })
    await expect(service.remove(project.id)).resolves.toBe(true)
    expect(store.get(project.id)).toBeNull()
    expect(bridge.commands).toEqual([])
  })

  it('exclui no Flow e no Atlas quando há remoteId', async () => {
    const store = createStore()
    const bridge = createBridge()
    const service = createFlowProjectService({
      store,
      bridge,
      folderExistsFn: () => true,
      waitForExtensionMs: 20,
      waitForResultMs: 200,
    })

    const existing = store.create({
      name: 'Remoto',
      localFolderPath: 'D:\\flow\\remoto',
      createInFlow: true,
      syncStatus: 'linked',
    })
    store.update(existing.id, {
      remoteId: '012499f7-517b-48f6-a5d5-87c6c523f707',
      remoteUrl: buildFlowProjectUrl('012499f7-517b-48f6-a5d5-87c6c523f707'),
    })

    const removePromise = service.remove(existing.id)
    await vi.waitFor(() => expect(bridge.commands.length).toBe(1))
    const cmd = bridge.commands[0]!
    expect(cmd.type).toBe('delete_project')
    if (cmd.type === 'delete_project') {
      expect(cmd.remoteId).toBe('012499f7-517b-48f6-a5d5-87c6c523f707')
    }

    bridge.emit('event', {
      type: 'project_deleted',
      requestId: cmd.requestId,
      remoteId: '012499f7-517b-48f6-a5d5-87c6c523f707',
      source: 'atlas',
    } satisfies FlowBridgeEvent)

    await expect(removePromise).resolves.toBe(true)
    expect(store.get(existing.id)).toBeNull()
  })

  it('remove do Atlas quando o Flow avisa que o projeto remoto sumiu', async () => {
    const store = createStore()
    const bridge = createBridge()
    createFlowProjectService({
      store,
      bridge,
      folderExistsFn: () => true,
    })

    const existing = store.create({
      name: 'Gone',
      localFolderPath: 'D:\\flow\\gone',
      createInFlow: true,
      syncStatus: 'linked',
    })
    store.update(existing.id, {
      remoteId: 'dead-remote',
      remoteUrl: buildFlowProjectUrl('dead-remote'),
    })

    bridge.emit('event', {
      type: 'project_deleted',
      remoteId: 'dead-remote',
      source: 'flow',
    } satisfies FlowBridgeEvent)

    expect(store.get(existing.id)).toBeNull()
  })

  it('não apaga o projeto local se project_deleted chegar no meio do envio de refs', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-flow-sync-keep-'))
    const imagePath = path.join(dir, 'cena.png')
    fs.writeFileSync(
      imagePath,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
    )

    const store = createStore()
    const remoteId = 'keep-alive-1'
    const existing = store.create({
      name: 'Manter',
      localFolderPath: 'D:\\flow\\keep',
      createInFlow: true,
      syncStatus: 'linked',
      operationId: 'op-keep',
    })
    store.update(existing.id, {
      remoteId,
      remoteUrl: buildFlowProjectUrl(remoteId),
      syncStatus: 'linked',
    })

    const now = new Date().toISOString()
    listByProjectMock.mockReturnValue([
      {
        id: 'ref-keep',
        projectId: existing.id,
        label: 'cena',
        imagePath,
        imageUrl: null,
        imageThumbUrl: null,
        sortOrder: 0,
        flowUploadKey: null,
        flowFileName: null,
        syncStatus: 'local',
        syncedAt: null,
        lastSyncError: null,
        createdAt: now,
        updatedAt: now,
      },
    ])

    const bridge = createBridge()
    bridge.getStatus = () => ({
      running: true,
      port: 39207,
      token: 'tok',
      extensionConnected: true,
      accountHint: null,
      extensionPath: '',
      lastError: null,
    })
    const service = createFlowProjectService({
      store,
      bridge,
      folderExistsFn: () => true,
      waitForResultMs: 800,
    })

    try {
      const syncPromise = service.syncReferences(existing.id)
      await vi.waitFor(() => expect(bridge.commands.length).toBe(1))
      const cmd = bridge.commands[0]!

      // Falso positivo da extensão no meio do upload — não pode apagar o projeto.
      bridge.emit('event', {
        type: 'project_deleted',
        remoteId,
        source: 'flow',
      } satisfies FlowBridgeEvent)
      expect(store.get(existing.id)).not.toBeNull()

      bridge.emit('event', {
        type: 'references_uploaded',
        requestId: cmd.requestId,
        remoteId,
        uploaded: 1,
      } satisfies FlowBridgeEvent)

      await expect(syncPromise).resolves.toEqual({ uploaded: 1, reused: 0 })
      expect(store.get(existing.id)?.remoteId).toBe(remoteId)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('envia referências locais ao projeto vinculado no Flow', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-flow-sync-ref-'))
    const imagePath = path.join(dir, 'cantor.png')
    fs.writeFileSync(
      imagePath,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
    )

    const store = createStore()
    const remoteId = 'sync-refs-1'
    const existing = store.create({
      name: 'Com refs',
      localFolderPath: 'D:\\flow\\refs',
      createInFlow: true,
      syncStatus: 'linked',
      operationId: 'op-sync-refs',
    })
    store.update(existing.id, {
      remoteId,
      remoteUrl: buildFlowProjectUrl(remoteId),
      syncStatus: 'linked',
    })

    const now = new Date().toISOString()
    listByProjectMock.mockReturnValueOnce([
      {
        id: 'ref-1',
        projectId: existing.id,
        label: 'cantor',
        imagePath,
        imageUrl: null,
        imageThumbUrl: null,
        sortOrder: 0,
        flowUploadKey: null,
        flowFileName: null,
        syncStatus: 'local',
        syncedAt: null,
        lastSyncError: null,
        createdAt: now,
        updatedAt: now,
      },
    ])

    const bridge = createBridge()
    bridge.getStatus = () => ({
      running: true,
      port: 39207,
      token: 'tok',
      extensionConnected: true,
      accountHint: null,
      extensionPath: '',
      lastError: null,
    })
    const service = createFlowProjectService({
      store,
      bridge,
      folderExistsFn: () => true,
      waitForResultMs: 500,
    })

    try {
      const syncPromise = service.syncReferences(existing.id)
      await vi.waitFor(() => expect(bridge.commands.length).toBe(1))
      const cmd = bridge.commands[0]!
      expect(cmd.type).toBe('upload_references')
      if (cmd.type === 'upload_references') {
        expect(cmd.remoteId).toBe(remoteId)
        expect(cmd.galleryOnly).toBe(true)
        expect(cmd.references).toHaveLength(1)
        expect(cmd.references[0]?.label).toBe('cantor')
        expect(cmd.references[0]?.fileName).toBe('cantor.png')
        expect(cmd.references[0]?.localPath?.replace(/\\/g, '/')).toMatch(/\/cantor\.png$/)
        expect(cmd.references[0]?.base64?.length).toBeGreaterThan(10)
      }

      bridge.emit('event', {
        type: 'references_uploaded',
        requestId: cmd.requestId,
        remoteId,
        uploaded: 1,
        results: [
          {
            id: 'ref-1',
            flowUploadKey: 'cantor::cantor.png',
            fileName: 'cantor.png',
            reused: false,
          },
        ],
        message: '1 referência(s) confirmada(s) em Uploads.',
      } satisfies FlowBridgeEvent)

      await expect(syncPromise).resolves.toEqual({ uploaded: 1, reused: 0 })
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('marca confirmação pendente sem tratar como enviada', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-flow-sync-pending-'))
    const imagePath = path.join(dir, 'cantor.jpg')
    fs.writeFileSync(
      imagePath,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
    )

    const store = createStore()
    const remoteId = 'sync-pending-1'
    const existing = store.create({
      name: 'Pending ref',
      localFolderPath: 'D:\\flow\\pending',
      createInFlow: true,
      syncStatus: 'linked',
      operationId: 'op-pending-ref',
    })
    store.update(existing.id, {
      remoteId,
      remoteUrl: buildFlowProjectUrl(remoteId),
      syncStatus: 'linked',
    })

    const now = new Date().toISOString()
    listByProjectMock.mockReturnValue([
      {
        id: 'ref-pending',
        projectId: existing.id,
        label: 'cantor',
        imagePath,
        imageUrl: null,
        imageThumbUrl: null,
        sortOrder: 0,
        flowUploadKey: null,
        flowFileName: null,
        syncStatus: 'local',
        syncedAt: null,
        lastSyncError: null,
        createdAt: now,
        updatedAt: now,
      },
    ])

    const bridge = createBridge()
    bridge.getStatus = () => ({
      running: true,
      port: 39207,
      token: 'tok',
      extensionConnected: true,
      accountHint: null,
      extensionPath: '',
      lastError: null,
    })
    const service = createFlowProjectService({
      store,
      bridge,
      folderExistsFn: () => true,
      waitForResultMs: 800,
    })

    try {
      const syncPromise = service.syncReferences(existing.id)
      await vi.waitFor(() => expect(bridge.commands.length).toBe(1))
      const cmd = bridge.commands[0]!

      bridge.emit('event', {
        type: 'reference_progress',
        requestId: cmd.requestId,
        remoteId,
        refId: 'ref-pending',
        stage: 'ref_pending',
        message:
          '[cantor] encontrado no seletor, mas a prévia ainda não ficou pronta. Confirmação pendente.',
      } satisfies FlowBridgeEvent)

      expect(updateReferenceMock).toHaveBeenCalledWith(
        'ref-pending',
        expect.objectContaining({
          syncStatus: 'confirming',
        }),
      )

      bridge.emit('event', {
        type: 'error',
        requestId: cmd.requestId,
        code: 'upload_failed',
        message: 'Nenhuma referência foi confirmada no seletor do Flow.',
        remoteId,
        remoteUrl: buildFlowProjectUrl(remoteId),
      } satisfies FlowBridgeEvent)

      await expect(syncPromise).rejects.toThrow(/confirmada|seletor/i)
      // Pendente não deve ser sobrescrito para error genérico (só refs ainda "sending").
      const confirmingCalls = updateReferenceMock.mock.calls.filter(
        ([id, patch]) => id === 'ref-pending' && patch.syncStatus === 'confirming',
      )
      expect(confirmingCalls.length).toBeGreaterThan(0)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('bloqueia generate quando a geração está pausada', async () => {
    const store = createStore()
    const existing = store.create({
      name: 'Pausado',
      localFolderPath: 'D:\\flow\\pause',
      createInFlow: true,
      syncStatus: 'linked',
      operationId: 'op-pause',
    })
    store.update(existing.id, {
      remoteId: 'remote-pause',
      remoteUrl: buildFlowProjectUrl('remote-pause'),
      syncStatus: 'linked',
      generationPaused: true,
      lastError: 'O Flow reportou atividade incomum.',
      prompt: 'cena com [cantor]',
    })

    const service = createFlowProjectService({
      store,
      bridge: createBridge(),
      folderExistsFn: () => true,
    })

    await expect(service.syncPrompt(existing.id, { submit: true })).rejects.toThrow(
      /atividade incomum|pausada/i,
    )
  })

  it('recusa generate se a menção não tem referência vinculada', async () => {
    const store = createStore()
    const existing = store.create({
      name: 'Sem banda',
      localFolderPath: 'D:\\flow\\banda',
      createInFlow: true,
      syncStatus: 'linked',
      operationId: 'op-banda',
    })
    store.update(existing.id, {
      remoteId: 'remote-banda',
      remoteUrl: buildFlowProjectUrl('remote-banda'),
      syncStatus: 'linked',
      prompt: 'palco com [banda]',
    })
    listByProjectMock.mockReturnValueOnce([])

    const service = createFlowProjectService({
      store,
      bridge: createBridge(),
      folderExistsFn: () => true,
    })

    await expect(service.syncPrompt(existing.id, { submit: true })).rejects.toThrow(/\[banda\]/)
  })
})
