import { dialog, shell } from 'electron'
import type { BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { ChatActionResult } from '../../../shared/chat/types'
import { isProjectType, type Project, type ProjectType, type TaskRelatedType } from '../../../shared/types'
import { MUSIC_PROMPTS_PATH } from '../../../shared/workspaceCapabilities'
import { isTaskCategory, isTaskPriority, isTaskRelatedType, todayYmd } from '../../../shared/tasks'
import { channelRepository } from '../../repositories/channelRepository'
import { nicheRepository } from '../../repositories/nicheRepository'
import { projectRepository } from '../../repositories/projectRepository'
import { quickPromptRepository } from '../../repositories/quickPromptRepository'
import { scriptRepository } from '../../repositories/scriptRepository'
import { taskRepository } from '../../repositories/taskRepository'
import {
  createProjectFolder,
  folderExists,
  resolveEnvironmentRoot,
} from '../storage/projectFolders'
import type { CodexService } from '../codex/CodexService'
import { AtlasActionRegistry, projectNavigatePath, type AtlasActionContext } from './AtlasActionRegistry'

const LANGUAGE_LABEL: Record<string, string> = {
  de: 'alemão',
  en: 'inglês',
  pt: 'português',
  'pt-br': 'português',
  es: 'espanhol',
  fr: 'francês',
  it: 'italiano',
}

function str(input: Record<string, unknown>, key: string): string {
  const value = input[key]
  return typeof value === 'string' ? value.trim() : ''
}

function bool(input: Record<string, unknown>, key: string, fallback = true): boolean {
  const value = input[key]
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value.toLowerCase() !== 'false'
  return fallback
}

function asProjectType(value: unknown): ProjectType | null {
  if (value === 'music' || value === 'musica' || value === 'música') return 'music'
  if (value === 'history' || value === 'historia' || value === 'história') return 'history'
  return isProjectType(value) ? value : null
}

function parseDueDate(raw?: string): string | null {
  const value = raw?.trim()
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const lower = value.toLowerCase()
  if (lower === 'today' || lower === 'hoje') return todayYmd()
  if (lower === 'tomorrow' || lower === 'amanha' || lower === 'amanhã') {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    return todayYmd(date)
  }
  throw new Error('O prazo deve ser uma data no formato AAAA-MM-DD.')
}

function findProject(input: Record<string, unknown>, ctx: AtlasActionContext): Project {
  const id = str(input, 'id') || str(input, 'projectId')
  const name = str(input, 'name') || str(input, 'projectName')
  if (id) {
    const found = projectRepository.get(id)
    if (!found) throw new Error('Projeto não encontrado.')
    return found
  }
  if (ctx.client.useProjectContext && ctx.client.projectId) {
    const found = projectRepository.get(ctx.client.projectId)
    if (found) return found
  }
  if (name) {
    const list = projectRepository.list({ query: name })
    const exact = list.find((item) => item.name.toLowerCase() === name.toLowerCase())
    if (exact) return exact
    if (list.length === 1) return list[0]
    if (list.length > 1) throw new Error(`Vários projetos correspondem a "${name}". Informe o id.`)
    throw new Error(`Projeto "${name}" não encontrado.`)
  }
  throw new Error('Informe o projeto (id ou nome).')
}

function findChannel(input: Record<string, unknown>) {
  const id = str(input, 'id') || str(input, 'channelId')
  const name = str(input, 'name') || str(input, 'channelName')
  if (id) {
    const found = channelRepository.get(id)
    if (!found) throw new Error('Canal não encontrado.')
    return found
  }
  if (!name) throw new Error('Informe o canal (id ou nome).')
  const list = channelRepository.list({ query: name })
  const exact = list.find((item) => item.name.toLowerCase() === name.toLowerCase())
  if (exact) return exact
  if (list.length === 1) return list[0]
  if (list.length > 1) throw new Error(`Vários canais correspondem a "${name}". Informe o id.`)
  throw new Error(`Canal "${name}" não encontrado.`)
}

function findTask(input: Record<string, unknown>) {
  const id = str(input, 'id') || str(input, 'taskId')
  const title = str(input, 'title') || str(input, 'name')
  if (id) {
    const found = taskRepository.get(id)
    if (!found) throw new Error('Tarefa não encontrada.')
    return found
  }
  if (!title) throw new Error('Informe a tarefa (id ou título).')
  const matches = taskRepository.list().filter((item) =>
    item.title.toLowerCase().includes(title.toLowerCase()),
  )
  const exact = matches.find((item) => item.title.toLowerCase() === title.toLowerCase())
  if (exact) return exact
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) throw new Error(`Várias tarefas correspondem a "${title}". Informe o id.`)
  throw new Error(`Tarefa "${title}" não encontrada.`)
}

function findPrompt(input: Record<string, unknown>) {
  const id = str(input, 'id')
  const name = str(input, 'name')
  if (id) {
    const found = quickPromptRepository.get(id)
    if (!found) throw new Error('Prompt rápido não encontrado.')
    return found
  }
  if (!name) throw new Error('Informe o prompt (id ou nome).')
  const list = quickPromptRepository.list({ query: name })
  const exact = list.find((item) => item.name.toLowerCase() === name.toLowerCase())
  if (exact) return exact
  if (list.length === 1) return list[0]
  throw new Error(`Prompt "${name}" não encontrado.`)
}

function findScript(input: Record<string, unknown>) {
  const id = str(input, 'id') || str(input, 'scriptId')
  const title = str(input, 'title') || str(input, 'name')
  if (id) {
    const found = scriptRepository.get(id)
    if (!found) throw new Error('Roteiro não encontrado.')
    return found
  }
  if (!title) throw new Error('Informe o roteiro (id ou título).')
  const list = scriptRepository.list({ query: title })
  const exact = list.find(
    (item) => item.title.toLowerCase() === title.toLowerCase() || item.topic.toLowerCase() === title.toLowerCase(),
  )
  if (exact) return exact
  if (list.length === 1) return list[0]
  throw new Error(`Roteiro "${title}" não encontrado.`)
}

function ok(partial: Omit<ChatActionResult, 'status'> & { status?: ChatActionResult['status'] }): ChatActionResult {
  return { status: 'success', ...partial }
}

export function createAtlasActionRegistry(deps: {
  getMainWindow: () => BrowserWindow | null
  codexService: CodexService
}): AtlasActionRegistry {
  const registry = new AtlasActionRegistry()
  const { getMainWindow, codexService } = deps

  registry.register('list_projects', (input) => {
    const projectType = asProjectType(input.projectType ?? input.type)
    const items = projectRepository.list({
      projectType: projectType ?? undefined,
      query: str(input, 'query') || undefined,
    })
    return ok({
      name: 'list_projects',
      title: items.length === 1 ? '1 projeto' : `${items.length} projetos`,
      data: items.map((item) => ({
        id: item.id,
        name: item.name,
        projectType: item.projectType,
        channelName: item.channelName,
      })),
    })
  })

  registry.register('get_project', (input, ctx) => {
    const project = findProject(input, ctx)
    return ok({
      name: 'get_project',
      title: project.name,
      subtitle: project.projectType === 'music' ? 'Música' : 'História',
      entityType: 'project',
      entityId: project.id,
      navigateTo: projectNavigatePath(project.projectType, project.id),
      navigateLabel: 'Abrir projeto',
      data: {
        id: project.id,
        name: project.name,
        description: project.description,
        projectType: project.projectType,
        channelId: project.channelId,
        channelName: project.channelName,
        projectFolderPath: project.projectFolderPath,
      },
    })
  })

  registry.register('create_project', (input) => {
    const name = str(input, 'name')
    const projectType =
      asProjectType(input.projectType ?? input.type) ??
      (String(input.kind ?? '').toLowerCase().includes('music') ? 'music' : null)
    if (!name) throw new Error('Informe o nome do projeto.')
    if (!projectType) throw new Error('Informe se o projeto é de História ou Música.')
    const project = projectRepository.create({
      name,
      description: str(input, 'description'),
      projectType,
      channelId: str(input, 'channelId') || null,
    })
    return ok({
      name: 'create_project',
      title: 'Projeto criado',
      subtitle: project.name,
      entityType: 'project',
      entityId: project.id,
      navigateTo: projectNavigatePath(project.projectType, project.id),
      navigateLabel: 'Abrir projeto',
      data: { id: project.id, name: project.name, projectType: project.projectType },
    })
  })

  registry.register('update_project', (input, ctx) => {
    const project = findProject(input, ctx)
    const newName = str(input, 'newName') || str(input, 'name')
    const updated = projectRepository.update(project.id, {
      name: newName || undefined,
      description: input.description !== undefined ? str(input, 'description') : undefined,
      channelId: input.channelId !== undefined ? str(input, 'channelId') || null : undefined,
    })
    if (!updated) throw new Error('Não foi possível atualizar o projeto.')
    return ok({
      name: 'update_project',
      title: 'Projeto atualizado',
      subtitle: updated.name,
      entityType: 'project',
      entityId: updated.id,
      navigateTo: projectNavigatePath(updated.projectType, updated.id),
      navigateLabel: 'Abrir projeto',
    })
  })

  registry.register('open_project', (input, ctx) => {
    const project = findProject(input, ctx)
    return ok({
      name: 'open_project',
      title: 'Abrir projeto',
      subtitle: project.name,
      entityType: 'project',
      entityId: project.id,
      navigateTo: projectNavigatePath(project.projectType, project.id),
      navigateLabel: 'Abrir projeto',
    })
  })

  registry.register('delete_project', (input, ctx) => {
    const project = findProject(input, ctx)
    projectRepository.remove(project.id)
    return ok({
      name: 'delete_project',
      title: 'Projeto removido do Atlas',
      subtitle: `${project.name} — a pasta física não foi apagada.`,
      entityType: 'project',
      entityId: project.id,
    })
  })

  registry.register('create_project_folder', (input, ctx) => {
    const project = findProject(input, ctx)
    if (project.projectFolderPath && folderExists(project.projectFolderPath)) {
      return ok({
        name: 'create_project_folder',
        title: 'Pasta já vinculada',
        subtitle: project.projectFolderPath,
        entityType: 'project',
        entityId: project.id,
      })
    }
    const folder = createProjectFolder({ name: project.name, projectType: project.projectType })
    const updated = projectRepository.update(project.id, { projectFolderPath: folder })
    return ok({
      name: 'create_project_folder',
      title: 'Pasta criada',
      subtitle: folder,
      entityType: 'project',
      entityId: project.id,
      data: { projectFolderPath: updated?.projectFolderPath },
    })
  })

  registry.register('link_project_folder', async (input, ctx) => {
    const project = findProject(input, ctx)
    const win = getMainWindow()
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      title: 'Selecionar pasta do projeto',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath:
        (project.projectFolderPath && folderExists(project.projectFolderPath)
          ? project.projectFolderPath
          : undefined) ?? resolveEnvironmentRoot(project.projectType),
    })
    if (result.canceled || !result.filePaths[0]) {
      throw new Error('Nenhuma pasta foi selecionada.')
    }
    const updated = projectRepository.update(project.id, { projectFolderPath: result.filePaths[0] })
    return ok({
      name: 'link_project_folder',
      title: 'Pasta vinculada',
      subtitle: updated?.projectFolderPath ?? result.filePaths[0],
      entityType: 'project',
      entityId: project.id,
    })
  })

  registry.register('open_project_folder', async (input, ctx) => {
    const project = findProject(input, ctx)
    if (!project.projectFolderPath) throw new Error('Nenhuma pasta vinculada a este projeto.')
    if (!folderExists(project.projectFolderPath)) {
      throw new Error('A pasta vinculada não existe mais. Vincule outra pasta.')
    }
    const error = await shell.openPath(path.resolve(project.projectFolderPath))
    if (error) throw new Error(error)
    return ok({
      name: 'open_project_folder',
      title: 'Pasta aberta',
      subtitle: project.projectFolderPath,
      entityType: 'project',
      entityId: project.id,
    })
  })

  registry.register('delete_project_files', async (input, ctx) => {
    const project = findProject(input, ctx)
    if (!project.projectFolderPath || !folderExists(project.projectFolderPath)) {
      throw new Error('Este projeto não tem pasta física para apagar.')
    }
    const target = path.resolve(project.projectFolderPath)
    await fs.promises.rm(target, { recursive: true, force: true })
    projectRepository.update(project.id, { projectFolderPath: null })
    return ok({
      name: 'delete_project_files',
      title: 'Pasta física apagada',
      subtitle: target,
      entityType: 'project',
      entityId: project.id,
    })
  })

  registry.register('list_channels', (input) => {
    const channelType = asProjectType(input.channelType ?? input.type)
    const items = channelRepository.list({
      channelType: channelType ?? undefined,
      query: str(input, 'query') || undefined,
    })
    return ok({
      name: 'list_channels',
      title: items.length === 1 ? '1 canal' : `${items.length} canais`,
      data: items.map((item) => ({
        id: item.id,
        name: item.name,
        channelType: item.channelType,
        description: item.description,
      })),
    })
  })

  registry.register('get_channel', (input) => {
    const channel = findChannel(input)
    return ok({
      name: 'get_channel',
      title: channel.name,
      subtitle: channel.channelType === 'music' ? 'Música' : 'História',
      entityType: 'channel',
      entityId: channel.id,
      navigateTo: `/canais/${channel.id}`,
      navigateLabel: 'Abrir canal',
      data: {
        id: channel.id,
        name: channel.name,
        channelType: channel.channelType,
        description: channel.description,
      },
    })
  })

  registry.register('create_channel', (input) => {
    const name = str(input, 'name')
    if (!name) throw new Error('Informe o nome do canal.')
    const channelType = asProjectType(input.channelType ?? input.type) ?? 'history'
    const language = str(input, 'language').toLowerCase()
    const languageNote = language
      ? `Idioma: ${LANGUAGE_LABEL[language] ?? language}.`
      : ''
    const description = [str(input, 'description'), languageNote].filter(Boolean).join(' ').trim()
    const channel = channelRepository.create({
      name,
      description,
      avatarPath: '',
      nicheId: str(input, 'nicheId') || null,
      youtubeUrl: str(input, 'youtubeUrl'),
      color: str(input, 'color') || '#35e58b',
      channelType,
      active: true,
    })
    return ok({
      name: 'create_channel',
      title: 'Canal criado',
      subtitle: channel.name,
      entityType: 'channel',
      entityId: channel.id,
      navigateTo: `/canais/${channel.id}`,
      navigateLabel: 'Abrir canal',
      data: { id: channel.id, name: channel.name, channelType: channel.channelType },
    })
  })

  registry.register('update_channel', (input) => {
    const channel = findChannel(input)
    const newName = str(input, 'newName')
    const updated = channelRepository.update(channel.id, {
      name: newName || undefined,
      description: input.description !== undefined ? str(input, 'description') : undefined,
      youtubeUrl: input.youtubeUrl !== undefined ? str(input, 'youtubeUrl') : undefined,
      channelType: asProjectType(input.channelType) ?? undefined,
    })
    if (!updated) throw new Error('Não foi possível atualizar o canal.')
    return ok({
      name: 'update_channel',
      title: 'Canal atualizado',
      subtitle: updated.name,
      entityType: 'channel',
      entityId: updated.id,
      navigateTo: `/canais/${updated.id}`,
      navigateLabel: 'Abrir canal',
    })
  })

  registry.register('open_channel', (input) => {
    const channel = findChannel(input)
    return ok({
      name: 'open_channel',
      title: 'Abrir canal',
      subtitle: channel.name,
      entityType: 'channel',
      entityId: channel.id,
      navigateTo: `/canais/${channel.id}`,
      navigateLabel: 'Abrir canal',
    })
  })

  registry.register('delete_channel', (input) => {
    const channel = findChannel(input)
    channelRepository.remove(channel.id)
    return ok({
      name: 'delete_channel',
      title: 'Canal excluído',
      subtitle: channel.name,
      entityType: 'channel',
      entityId: channel.id,
    })
  })

  registry.register('list_tasks', (input) => {
    const status = str(input, 'status')
    const query = str(input, 'query').toLowerCase()
    let items = taskRepository.list()
    if (status === 'pending' || status === 'completed') {
      items = items.filter((item) => item.status === status)
    }
    if (query) {
      items = items.filter(
        (item) =>
          item.title.toLowerCase().includes(query) || item.description.toLowerCase().includes(query),
      )
    }
    return ok({
      name: 'list_tasks',
      title: items.length === 1 ? '1 tarefa' : `${items.length} tarefas`,
      data: items.map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        dueDate: item.dueDate,
        relatedName: item.relatedName,
      })),
    })
  })

  registry.register('get_task', (input) => {
    const task = findTask(input)
    return ok({
      name: 'get_task',
      title: task.title,
      subtitle: task.dueDate ?? undefined,
      entityType: 'task',
      entityId: task.id,
      navigateTo: '/tarefas',
      navigateLabel: 'Ver em Tarefas',
      data: task,
    })
  })

  async function createOneTask(input: Record<string, unknown>): Promise<ChatActionResult> {
    const title = str(input, 'title') || str(input, 'name')
    if (!title) throw new Error('Informe o título da tarefa.')
    const relatedRaw = str(input, 'relatedType')
    const relatedType: TaskRelatedType | null = isTaskRelatedType(relatedRaw) ? relatedRaw : null
    const priorityRaw = str(input, 'priority')
    const categoryRaw = str(input, 'category')
    const task = taskRepository.create({
      title,
      description: str(input, 'description'),
      dueDate: parseDueDate(str(input, 'dueDate') || str(input, 'due')),
      priority: isTaskPriority(priorityRaw) ? priorityRaw : 'normal',
      category: isTaskCategory(categoryRaw) ? categoryRaw : 'general',
      relatedType,
      relatedId: str(input, 'relatedId') || null,
    })
    return ok({
      name: 'create_task',
      title: 'Tarefa criada',
      subtitle: [task.title, task.dueDate ? formatBrDate(task.dueDate) : '']
        .filter(Boolean)
        .join(' · '),
      entityType: 'task',
      entityId: task.id,
      navigateTo: '/tarefas',
      navigateLabel: 'Ver em Tarefas',
      data: { id: task.id, title: task.title, dueDate: task.dueDate },
    })
  }

  registry.register('create_task', async (input) => {
    const batch = Array.isArray(input.tasks) ? input.tasks : null
    if (batch && batch.length > 0) {
      const created: ChatActionResult[] = []
      for (const item of batch) {
        if (!item || typeof item !== 'object') continue
        created.push(await createOneTask(item as Record<string, unknown>))
      }
      if (created.length === 0) throw new Error('Nenhuma tarefa válida para criar.')
      return ok({
        name: 'create_task',
        title: `${created.length} tarefas criadas`,
        subtitle: created
          .map((item) => item.subtitle)
          .filter(Boolean)
          .join('; '),
        navigateTo: '/tarefas',
        navigateLabel: 'Ver em Tarefas',
        data: created.map((item) => item.data),
      })
    }
    return createOneTask(input)
  })

  registry.register('update_task', (input) => {
    const task = findTask(input)
    const priorityRaw = str(input, 'priority')
    const updated = taskRepository.update(task.id, {
      title: str(input, 'newTitle') || str(input, 'title') || undefined,
      description: input.description !== undefined ? str(input, 'description') : undefined,
      dueDate: input.dueDate !== undefined ? parseDueDate(str(input, 'dueDate')) : undefined,
      priority: isTaskPriority(priorityRaw) ? priorityRaw : undefined,
    })
    if (!updated) throw new Error('Não foi possível atualizar a tarefa.')
    return ok({
      name: 'update_task',
      title: 'Tarefa atualizada',
      subtitle: updated.title,
      entityType: 'task',
      entityId: updated.id,
      navigateTo: '/tarefas',
      navigateLabel: 'Ver em Tarefas',
    })
  })

  registry.register('complete_task', (input) => {
    const task = findTask(input)
    const updated = taskRepository.setStatus(task.id, 'completed')
    if (!updated) throw new Error('Não foi possível concluir a tarefa.')
    return ok({
      name: 'complete_task',
      title: 'Tarefa concluída',
      subtitle: updated.title,
      entityType: 'task',
      entityId: updated.id,
    })
  })

  registry.register('reopen_task', (input) => {
    const task = findTask(input)
    const updated = taskRepository.setStatus(task.id, 'pending')
    if (!updated) throw new Error('Não foi possível reabrir a tarefa.')
    return ok({
      name: 'reopen_task',
      title: 'Tarefa reaberta',
      subtitle: updated.title,
      entityType: 'task',
      entityId: updated.id,
    })
  })

  registry.register('delete_task', (input) => {
    const task = findTask(input)
    taskRepository.remove(task.id)
    return ok({
      name: 'delete_task',
      title: 'Tarefa excluída',
      subtitle: task.title,
      entityType: 'task',
      entityId: task.id,
    })
  })

  registry.register('list_quick_prompts', (input, ctx) => {
    const projectId =
      str(input, 'projectId') || (ctx.client.useProjectContext ? ctx.client.projectId ?? '' : '')
    const items = quickPromptRepository.list({
      projectId: projectId || null,
      query: str(input, 'query') || undefined,
    })
    return ok({
      name: 'list_quick_prompts',
      title: `${items.length} prompts salvos`,
      data: items.map((item) => ({ id: item.id, name: item.name, category: item.category })),
    })
  })

  registry.register('get_quick_prompt', (input) => {
    const prompt = findPrompt(input)
    return ok({
      name: 'get_quick_prompt',
      title: prompt.name,
      entityType: 'quick_prompt',
      entityId: prompt.id,
      navigateTo: MUSIC_PROMPTS_PATH,
      navigateLabel: 'Ver em Prompts rápidos',
      data: prompt,
    })
  })

  function savePrompt(input: Record<string, unknown>, ctx: AtlasActionContext): ChatActionResult {
    const name = str(input, 'name')
    const text = str(input, 'text') || str(input, 'content') || str(input, 'prompt')
    if (!name) throw new Error('Informe o nome do prompt.')
    if (!text) throw new Error('Informe o texto do prompt para salvar.')
    const projectId =
      str(input, 'projectId') ||
      (ctx.client.useProjectContext && ctx.client.projectType === 'music'
        ? ctx.client.projectId ?? ''
        : '')
    const created = quickPromptRepository.create({
      name,
      text,
      category: str(input, 'category') || 'custom',
      projectId: projectId || null,
    })
    return ok({
      name: 'save_quick_prompt',
      title: 'Prompt salvo',
      subtitle: created.name,
      entityType: 'quick_prompt',
      entityId: created.id,
      navigateTo: MUSIC_PROMPTS_PATH,
      navigateLabel: 'Ver em Prompts rápidos',
      data: { id: created.id, name: created.name },
    })
  }

  registry.register('save_quick_prompt', (input, ctx) => savePrompt(input, ctx))
  registry.register('create_quick_prompt', (input, ctx) => savePrompt(input, ctx))

  registry.register('update_quick_prompt', (input) => {
    const prompt = findPrompt(input)
    const updated = quickPromptRepository.update(prompt.id, {
      name: str(input, 'newName') || undefined,
      text: input.text !== undefined ? str(input, 'text') : undefined,
      category: input.category !== undefined ? str(input, 'category') : undefined,
    })
    if (!updated) throw new Error('Não foi possível atualizar o prompt.')
    return ok({
      name: 'update_quick_prompt',
      title: 'Prompt atualizado',
      subtitle: updated.name,
      entityType: 'quick_prompt',
      entityId: updated.id,
      navigateTo: MUSIC_PROMPTS_PATH,
      navigateLabel: 'Ver em Prompts rápidos',
    })
  })

  registry.register('delete_quick_prompt', (input) => {
    const prompt = findPrompt(input)
    quickPromptRepository.remove(prompt.id)
    return ok({
      name: 'delete_quick_prompt',
      title: 'Prompt excluído',
      subtitle: prompt.name,
      entityType: 'quick_prompt',
      entityId: prompt.id,
    })
  })

  registry.register('favorite_quick_prompt', (input) => {
    const id = str(input, 'id') || str(input, 'itemId')
    if (!id) throw new Error('Informe o id do prompt para favoritar.')
    quickPromptRepository.setFavorite(id, bool(input, 'favorite', true))
    return ok({
      name: 'favorite_quick_prompt',
      title: bool(input, 'favorite', true) ? 'Prompt favoritado' : 'Favorito removido',
      entityType: 'quick_prompt',
      entityId: id,
      navigateTo: MUSIC_PROMPTS_PATH,
      navigateLabel: 'Ver em Prompts rápidos',
    })
  })

  registry.register('list_scripts', (input, ctx) => {
    const projectId =
      str(input, 'projectId') || (ctx.client.useProjectContext ? ctx.client.projectId ?? '' : '')
    const items = scriptRepository.list({
      projectId: projectId || undefined,
      query: str(input, 'query') || undefined,
      nicheId: str(input, 'nicheId') || undefined,
      language: str(input, 'language') || undefined,
    })
    return ok({
      name: 'list_scripts',
      title: `${items.length} roteiros`,
      data: items.map((item) => ({
        id: item.id,
        title: item.title,
        topic: item.topic,
        status: item.status,
        projectId: item.projectId,
      })),
    })
  })

  registry.register('get_script', (input) => {
    const script = findScript(input)
    const content = script.content.length > 4000 ? `${script.content.slice(0, 4000)}…` : script.content
    return ok({
      name: 'get_script',
      title: script.title,
      entityType: 'script',
      entityId: script.id,
      navigateTo: `/historia/roteiros/${script.id}`,
      navigateLabel: 'Abrir roteiro',
      data: {
        id: script.id,
        title: script.title,
        topic: script.topic,
        language: script.language,
        status: script.status,
        content,
      },
    })
  })

  registry.register('open_script', (input) => {
    const script = findScript(input)
    return ok({
      name: 'open_script',
      title: 'Abrir roteiro',
      subtitle: script.title,
      entityType: 'script',
      entityId: script.id,
      navigateTo: `/historia/roteiros/${script.id}`,
      navigateLabel: 'Abrir roteiro',
    })
  })

  registry.register('create_script', async (input, ctx) => {
    const nicheId = str(input, 'nicheId')
    const language = str(input, 'language') || 'pt'
    const topic = str(input, 'topic') || str(input, 'title')
    if (!nicheId) throw new Error('Informe o nicho (nicheId). Use list_niches se necessário.')
    if (!topic) throw new Error('Informe o tema do roteiro.')
    const projectId =
      str(input, 'projectId') || (ctx.client.useProjectContext ? ctx.client.projectId ?? '' : '')
    const durationRaw = input.durationMinutes
    const durationMinutes =
      typeof durationRaw === 'number'
        ? durationRaw
        : durationRaw
          ? Number(durationRaw)
          : undefined
    const result = await codexService.generateScript({
      nicheId,
      language,
      topic,
      durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : undefined,
      projectId: projectId || null,
    })
    return ok({
      name: 'create_script',
      title: 'Roteiro criado',
      subtitle: result.script.title,
      entityType: 'script',
      entityId: result.script.id,
      navigateTo: `/historia/roteiros/${result.script.id}`,
      navigateLabel: 'Abrir roteiro',
      data: { id: result.script.id, title: result.script.title, status: result.script.status },
    })
  })

  registry.register('adjust_script', async (input) => {
    const scriptId = str(input, 'scriptId') || str(input, 'id')
    const instruction = str(input, 'instruction') || str(input, 'prompt')
    if (!scriptId) throw new Error('Informe o roteiro.')
    if (!instruction) throw new Error('Informe a instrução de revisão.')
    const result = await codexService.adjustScript({ scriptId, instruction })
    return ok({
      name: 'adjust_script',
      title: 'Revisão solicitada',
      subtitle: result.script.title,
      entityType: 'script',
      entityId: result.script.id,
      navigateTo: `/historia/roteiros/${result.script.id}`,
      navigateLabel: 'Abrir roteiro',
    })
  })

  registry.register('list_niches', (input) => {
    const items = nicheRepository.list({
      query: str(input, 'query') || undefined,
      language: str(input, 'language') || undefined,
    })
    return ok({
      name: 'list_niches',
      title: `${items.length} nichos`,
      data: items.map((item) => ({
        id: item.id,
        name: item.name,
        defaultLanguage: item.defaultLanguage,
      })),
    })
  })

  registry.register('get_current_view', (_input, ctx) =>
    ok({
      name: 'get_current_view',
      title: 'Tela atual',
      subtitle: ctx.client.viewPath || 'desconhecida',
      data: { viewPath: ctx.client.viewPath ?? null },
    }),
  )

  registry.register('get_current_project', (_input, ctx) => {
    if (!ctx.client.useProjectContext || !ctx.client.projectId) {
      throw new Error('Nenhum projeto está em contexto nesta conversa.')
    }
    const project = projectRepository.get(ctx.client.projectId)
    if (!project) throw new Error('O projeto em contexto não foi encontrado.')
    return ok({
      name: 'get_current_project',
      title: project.name,
      subtitle: project.projectType === 'music' ? 'Música' : 'História',
      entityType: 'project',
      entityId: project.id,
      navigateTo: projectNavigatePath(project.projectType, project.id),
      navigateLabel: 'Abrir projeto',
      data: {
        id: project.id,
        name: project.name,
        projectType: project.projectType,
        description: project.description,
      },
    })
  })

  return registry
}

function formatBrDate(ymd: string): string {
  const [year, month, day] = ymd.split('-')
  if (!year || !month || !day) return ymd
  return `${day}/${month}/${year}`
}
