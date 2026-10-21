import { dialog, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { ChatActionResult } from '../../../shared/chat/types'
import { resolveAtlasScreen } from '../../../shared/chat/atlasKnowledge'
import { foldPersonName, matchNamedTarget } from '../../../shared/chat/teamMessageTarget'
import type { ChannelVideoStatus } from '../../../shared/types'
import { todayYmd } from '../../../shared/tasks'
import { SHORTS_VIDEO_EXTENSIONS } from '../../../shared/shorts'
import { createWorldClock, WORLD_CLOCK_CATALOG } from '../../../shared/worldClocks'
import { channelRepository } from '../../repositories/channelRepository'
import { lipSyncRefRepository } from '../../repositories/lipSyncRefRepository'
import { musicRepository } from '../../repositories/musicRepository'
import { projectRepository } from '../../repositories/projectRepository'
import { promptRepository } from '../../repositories/promptRepository'
import { quickPromptRepository } from '../../repositories/quickPromptRepository'
import { settingsRepository } from '../../repositories/settingsRepository'
import { shortsRepository } from '../../repositories/shortsRepository'
import { probeVideo } from '../media/ffmpegVideo'
import { createChannelVideo, removeChannelVideo } from '../videos/musicVideoProjectService'
import { createFromSourceVideo, deleteProject as deleteShortsProject, updateClip } from '../shorts/ShortsProjectService'
import { ensureShortsThumbnail } from '../shorts/shortsThumbnail'
import { teamChatService } from '../teamChat/teamChatService'
import { workspaceBriefingText } from '../chat/workspaceBriefing'
import { AtlasActionRegistry } from './AtlasActionRegistry'

const AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'wma', 'aiff']

function str(input: Record<string, unknown>, key: string): string {
  const value = input[key]
  return typeof value === 'string' ? value.trim() : ''
}

function ok(partial: Omit<ChatActionResult, 'status'>): ChatActionResult {
  return { status: 'success', ...partial }
}

function parseDate(raw?: string): string {
  const value = raw?.trim()
  if (!value) throw new Error('Informe a data no formato AAAA-MM-DD, ou hoje/amanhã.')
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const lower = value.toLowerCase()
  if (lower === 'today' || lower === 'hoje') return todayYmd()
  if (lower === 'tomorrow' || lower === 'amanha' || lower === 'amanhã') {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    return todayYmd(date)
  }
  throw new Error('A data deve ser AAAA-MM-DD, hoje ou amanhã.')
}

function asVideoStatus(value: unknown): ChannelVideoStatus | null {
  const raw = foldPersonName(String(value ?? ''))
  if (!raw) return null
  if (raw === 'publicado' || raw === 'published') return 'publicado'
  if (raw === 'agendando' || raw === 'agendado' || raw === 'agendar' || raw === 'scheduled') return 'agendando'
  if (raw === 'editando' || raw === 'edicao' || raw === 'editar') return 'editando'
  if (raw === 'colocando' || raw === 'upload' || raw === 'enviando') return 'colocando'
  return null
}

function pickNamed<T extends { id: string; name: string; aliases?: string[] }>(
  items: T[],
  query: string,
  kind: string,
): T {
  const trimmed = query.trim()
  if (!trimmed) throw new Error(`Informe o ${kind}.`)
  const byId = items.find((item) => item.id === trimmed)
  if (byId) return byId
  return matchNamedTarget(items, trimmed, kind)
}

function findChannel(input: Record<string, unknown>) {
  const query = str(input, 'channelId') || str(input, 'channel') || str(input, 'channelName') || str(input, 'canal')
  const channels = channelRepository.list()
  return pickNamed(
    channels.map((item) => ({ id: item.id, name: item.name })),
    query,
    'canal',
  )
}

function findProjectId(input: Record<string, unknown>): string | null {
  const query = str(input, 'projectId') || str(input, 'project') || str(input, 'projectName') || str(input, 'projeto')
  if (!query) return null
  const projects = projectRepository.list()
  return pickNamed(
    projects.map((item) => ({ id: item.id, name: item.name })),
    query,
    'projeto',
  ).id
}

function findTrack(input: Record<string, unknown>) {
  const query = str(input, 'id') || str(input, 'trackId') || str(input, 'name') || str(input, 'faixa')
  const tracks = musicRepository.list()
  const projects = new Map(projectRepository.list().map((item) => [item.id, item.name]))
  return pickNamed(
    tracks.map((item) => ({
      ...item,
      name: item.name,
      aliases: item.projectId ? [projects.get(item.projectId) ?? ''] : [],
    })),
    query,
    'faixa',
  )
}

function findShort(input: Record<string, unknown>) {
  const query = str(input, 'id') || str(input, 'jobId') || str(input, 'name') || str(input, 'short')
  return pickNamed(
    shortsRepository.list().map((item) => ({ ...item, name: item.name })),
    query,
    'short',
  )
}

function findVideo(input: Record<string, unknown>) {
  const query = str(input, 'id') || str(input, 'videoId') || str(input, 'title') || str(input, 'name')
  return pickNamed(
    channelRepository.listVideos().map((item) => ({
      ...item,
      name: item.title,
      aliases: [item.channelName ?? '', item.projectName ?? ''].filter(Boolean),
    })),
    query,
    'vídeo',
  )
}

function findLipsync(input: Record<string, unknown>) {
  const query = str(input, 'id') || str(input, 'name') || str(input, 'label')
  return pickNamed(
    lipSyncRefRepository.list({ status: 'all' }).map((item) => ({
      ...item,
      name: item.label || 'Sem nome',
      aliases: [item.projectName ?? ''].filter(Boolean),
    })),
    query,
    'lipsync',
  )
}

async function chooseFile(
  win: BrowserWindow | null,
  title: string,
  extensions: string[],
): Promise<string> {
  const result = await dialog.showOpenDialog(win ?? undefined!, {
    title,
    properties: ['openFile'],
    filters: [{ name: 'Arquivo', extensions }],
  })
  if (result.canceled || !result.filePaths[0]) throw new Error('Nenhum arquivo foi selecionado.')
  return result.filePaths[0]
}

export function registerStudioActions(
  registry: AtlasActionRegistry,
  deps: { getMainWindow: () => BrowserWindow | null },
): void {
  registry.register('get_studio_overview', () =>
    ok({
      name: 'get_studio_overview',
      title: 'Panorama do Atlas',
      data: { text: workspaceBriefingText() },
    }),
  )

  registry.register('open_screen', (input) => {
    const screen = resolveAtlasScreen(str(input, 'screen') || str(input, 'name') || str(input, 'tela'))
    return ok({
      name: 'open_screen',
      title: 'Abrir tela',
      subtitle: screen.label,
      navigateTo: screen.path,
      navigateLabel: 'Abrir',
    })
  })

  registry.register('list_tracks', (input) => {
    const projectId = findProjectId(input)
    const query = foldPersonName(str(input, 'query'))
    const projects = new Map(projectRepository.list().map((item) => [item.id, item.name]))
    const items = musicRepository.list(projectId ? { projectId } : undefined).filter((item) => {
      if (!query) return true
      return foldPersonName(`${item.name} ${projects.get(item.projectId ?? '') ?? ''}`).includes(query)
    })
    return ok({
      name: 'list_tracks',
      title: items.length === 1 ? '1 faixa' : `${items.length} faixas`,
      data: items.map((item) => ({
        id: item.id,
        name: item.name,
        project: item.projectId ? projects.get(item.projectId) ?? null : null,
        duration: item.duration,
        cuts: item.cuts.length,
      })),
    })
  })

  registry.register('get_track', (input) => {
    const track = findTrack(input)
    return ok({
      name: 'get_track',
      title: track.name,
      subtitle: `${track.cuts.length} cortes`,
      navigateTo: `/musica/faixas/${track.id}`,
      navigateLabel: 'Abrir faixa',
      entityType: 'track',
      entityId: track.id,
      data: {
        id: track.id,
        name: track.name,
        projectId: track.projectId,
        duration: track.duration,
        cutMode: track.cutMode,
        cuts: track.cuts.map((cut) => ({ label: cut.label, start: cut.start, end: cut.end })),
      },
    })
  })

  registry.register('open_track', (input) => {
    const track = findTrack(input)
    return ok({
      name: 'open_track',
      title: 'Abrir faixa',
      subtitle: track.name,
      navigateTo: `/musica/faixas/${track.id}`,
      navigateLabel: 'Abrir faixa',
      entityId: track.id,
    })
  })

  registry.register('rename_track', (input) => {
    const track = findTrack(input)
    const name = str(input, 'newName') || str(input, 'title')
    if (!name) throw new Error('Informe o novo nome da faixa.')
    const updated = musicRepository.update(track.id, { name })
    if (!updated) throw new Error('Não foi possível renomear a faixa.')
    return ok({
      name: 'rename_track',
      title: 'Faixa renomeada',
      subtitle: updated.name,
      navigateTo: `/musica/faixas/${updated.id}`,
      navigateLabel: 'Abrir faixa',
      entityId: updated.id,
    })
  })

  registry.register('import_track', async (input) => {
    const filePath = str(input, 'filePath') || str(input, 'path')
    const source = filePath || (await chooseFile(deps.getMainWindow(), 'Importar áudio', AUDIO_EXTENSIONS))
    const projectId = findProjectId(input)
    const track = await musicRepository.importFromFile(source, projectId)
    if (projectId) projectRepository.touch(projectId)
    return ok({
      name: 'import_track',
      title: 'Faixa importada',
      subtitle: track.name,
      navigateTo: `/musica/faixas/${track.id}`,
      navigateLabel: 'Abrir faixa',
      entityId: track.id,
      data: { id: track.id, name: track.name, projectId: track.projectId },
    })
  })

  registry.register('delete_track', (input) => {
    const track = findTrack(input)
    musicRepository.remove(track.id)
    return ok({
      name: 'delete_track',
      title: 'Faixa excluída',
      subtitle: track.name,
      entityId: track.id,
    })
  })

  registry.register('list_shorts', (input) => {
    const query = foldPersonName(str(input, 'query'))
    const items = shortsRepository.list().filter((item) => !query || foldPersonName(item.name).includes(query))
    return ok({
      name: 'list_shorts',
      title: items.length === 1 ? '1 short' : `${items.length} shorts`,
      data: items.map((item) => ({
        id: item.id,
        name: item.name,
        status: item.status,
        clips: item.clips.length,
      })),
    })
  })

  registry.register('get_short', (input) => {
    const job = findShort(input)
    return ok({
      name: 'get_short',
      title: job.name,
      subtitle: `${job.status} · ${job.clips.length} cortes`,
      navigateTo: `/shorts/${job.id}`,
      navigateLabel: 'Abrir short',
      entityId: job.id,
      data: {
        id: job.id,
        name: job.name,
        status: job.status,
        sourceName: job.sourceName,
        clips: job.clips.map((clip, index) => ({
          id: clip.id,
          index: index + 1,
          title: clip.title,
          start: clip.start,
          end: clip.end,
        })),
      },
    })
  })

  registry.register('open_short', (input) => {
    const job = findShort(input)
    return ok({
      name: 'open_short',
      title: 'Abrir short',
      subtitle: job.name,
      navigateTo: `/shorts/${job.id}`,
      navigateLabel: 'Abrir short',
      entityId: job.id,
    })
  })

  registry.register('rename_short', (input) => {
    const job = findShort(input)
    const name = str(input, 'newName') || str(input, 'title')
    if (!name) throw new Error('Informe o novo nome do short.')
    const updated = shortsRepository.update(job.id, { name })
    if (!updated) throw new Error('Não foi possível renomear o short.')
    return ok({
      name: 'rename_short',
      title: 'Short renomeado',
      subtitle: updated.name,
      navigateTo: `/shorts/${updated.id}`,
      navigateLabel: 'Abrir short',
      entityId: updated.id,
    })
  })

  registry.register('update_short_clip', (input) => {
    const job = findShort(input)
    const clipId = str(input, 'clipId')
    const indexRaw = input.index ?? input.corte
    const index = typeof indexRaw === 'number' ? indexRaw : Number(indexRaw)
    const clip = clipId
      ? job.clips.find((item) => item.id === clipId)
      : Number.isFinite(index)
        ? job.clips[Math.max(0, Math.floor(index) - 1)]
        : undefined
    if (!clip) throw new Error('Informe o corte pelo número (index) ou pelo id.')
    const title = str(input, 'title') || str(input, 'newTitle')
    const description = input.description !== undefined ? str(input, 'description') : undefined
    if (!title && description === undefined) throw new Error('Informe o título ou a descrição do corte.')
    const updated = updateClip(job.id, clip.id, {
      ...(title ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
    })
    if (!updated) throw new Error('Não foi possível atualizar o corte.')
    return ok({
      name: 'update_short_clip',
      title: 'Corte atualizado',
      subtitle: title || clip.title,
      navigateTo: `/shorts/${job.id}`,
      navigateLabel: 'Abrir short',
      entityId: job.id,
    })
  })

  registry.register('import_short', async (input) => {
    const filePath = str(input, 'filePath') || str(input, 'path')
    const source =
      filePath || (await chooseFile(deps.getMainWindow(), 'Importar vídeo para Shorts', [...SHORTS_VIDEO_EXTENSIONS]))
    const resolved = path.resolve(source)
    if (!fs.existsSync(resolved)) throw new Error('Arquivo de vídeo não encontrado.')
    const probe = await probeVideo(resolved)
    const projectId = findProjectId(input)
    const created = createFromSourceVideo({
      sourcePath: resolved,
      sourceName: probe.name,
      projectId,
      profile: 'music',
      probe,
      forceNew: false,
    })
    if (created.kind === 'created') {
      await ensureShortsThumbnail(created.project).catch(() => null)
    }
    const job = shortsRepository.get(created.project.id) ?? created.project
    return ok({
      name: 'import_short',
      title: created.kind === 'created' ? 'Short importado' : 'Short já existia',
      subtitle: job.name,
      navigateTo: `/shorts/${job.id}`,
      navigateLabel: 'Abrir short',
      entityId: job.id,
      data: { id: job.id, name: job.name, status: job.status },
    })
  })

  registry.register('delete_short', (input) => {
    const job = findShort(input)
    deleteShortsProject(job.id)
    return ok({
      name: 'delete_short',
      title: 'Short excluído',
      subtitle: job.name,
      entityId: job.id,
    })
  })

  registry.register('list_videos', (input) => {
    const status = asVideoStatus(input.status)
    const channelQuery = str(input, 'channelId') || str(input, 'channel') || str(input, 'channelName') || str(input, 'canal')
    const channelId = channelQuery ? findChannel(input).id : undefined
    const query = foldPersonName(str(input, 'query'))
    const items = channelRepository
      .listVideos({
        channelId,
        status: status ?? undefined,
        excludeStatus: status ? undefined : str(input, 'includePublished') === 'true' ? undefined : undefined,
      })
      .filter((item) => !query || foldPersonName(`${item.title} ${item.channelName ?? ''}`).includes(query))
    return ok({
      name: 'list_videos',
      title: items.length === 1 ? '1 vídeo' : `${items.length} vídeos`,
      data: items.map((item) => ({
        id: item.id,
        title: item.title,
        channel: item.channelName,
        date: item.scheduledDate,
        status: item.status,
        project: item.projectName,
      })),
    })
  })

  registry.register('get_video', (input) => {
    const video = findVideo(input)
    return ok({
      name: 'get_video',
      title: video.title,
      subtitle: [video.channelName, video.scheduledDate, video.status].filter(Boolean).join(' · '),
      navigateTo: `/canais/${video.channelId}/videos/${video.id}`,
      navigateLabel: 'Abrir na agenda',
      entityId: video.id,
      data: {
        id: video.id,
        title: video.title,
        description: video.description,
        channelId: video.channelId,
        channel: video.channelName,
        date: video.scheduledDate,
        status: video.status,
        projectId: video.projectId,
        project: video.projectName,
      },
    })
  })

  registry.register('open_video', (input) => {
    const video = findVideo(input)
    return ok({
      name: 'open_video',
      title: 'Abrir vídeo',
      subtitle: video.title,
      navigateTo: `/canais/${video.channelId}/videos/${video.id}`,
      navigateLabel: 'Abrir na agenda',
      entityId: video.id,
    })
  })

  registry.register('create_video', (input) => {
    const channel = findChannel(input)
    const title = str(input, 'title') || str(input, 'name')
    if (!title) throw new Error('Informe o título do vídeo.')
    const video = createChannelVideo({
      channelId: channel.id,
      title,
      description: str(input, 'description'),
      scheduledDate: parseDate(str(input, 'scheduledDate') || str(input, 'date') || str(input, 'dueDate')),
      status: asVideoStatus(input.status) ?? 'agendando',
      projectId: findProjectId(input),
    })
    return ok({
      name: 'create_video',
      title: 'Vídeo na agenda',
      subtitle: `${video.title} · ${video.scheduledDate}`,
      navigateTo: `/canais/${video.channelId}/videos/${video.id}`,
      navigateLabel: 'Abrir na agenda',
      entityId: video.id,
      data: { id: video.id, title: video.title, status: video.status },
    })
  })

  registry.register('update_video', (input) => {
    const video = findVideo(input)
    const status = asVideoStatus(input.status)
    const updated = channelRepository.updateVideo(video.id, {
      title: str(input, 'newTitle') || str(input, 'title') || undefined,
      description: input.description !== undefined ? str(input, 'description') : undefined,
      scheduledDate:
        input.scheduledDate !== undefined || input.date !== undefined
          ? parseDate(str(input, 'scheduledDate') || str(input, 'date'))
          : undefined,
      status: status ?? undefined,
    })
    if (!updated) throw new Error('Não foi possível atualizar o vídeo.')
    return ok({
      name: 'update_video',
      title: 'Vídeo atualizado',
      subtitle: `${updated.title} · ${updated.status}`,
      navigateTo: `/canais/${updated.channelId}/videos/${updated.id}`,
      navigateLabel: 'Abrir na agenda',
      entityId: updated.id,
    })
  })

  registry.register('delete_video', (input) => {
    const video = findVideo(input)
    removeChannelVideo(video.id)
    return ok({
      name: 'delete_video',
      title: 'Vídeo removido da agenda',
      subtitle: video.title,
      entityId: video.id,
    })
  })

  registry.register('list_lipsync_refs', (input) => {
    const projectId = findProjectId(input)
    const query = foldPersonName(str(input, 'query'))
    const items = lipSyncRefRepository
      .list({ projectId, status: 'active' })
      .filter(
        (item) => !query || foldPersonName(`${item.label} ${item.prompt} ${item.lyrics}`).includes(query),
      )
    return ok({
      name: 'list_lipsync_refs',
      title: items.length === 1 ? '1 referência' : `${items.length} referências`,
      navigateTo: '/musica/lipsync',
      navigateLabel: 'Abrir lipsync',
      data: items.map((item) => ({
        id: item.id,
        label: item.label,
        project: item.projectName,
        prompt: item.prompt.slice(0, 180),
        lyrics: item.lyrics.slice(0, 180),
      })),
    })
  })

  registry.register('update_lipsync_ref', (input) => {
    const ref = findLipsync(input)
    const updated = lipSyncRefRepository.update(ref.id, {
      label: input.label !== undefined || input.newName !== undefined ? str(input, 'label') || str(input, 'newName') : undefined,
      prompt: input.prompt !== undefined || input.text !== undefined ? str(input, 'prompt') || str(input, 'text') : undefined,
      lyrics: input.lyrics !== undefined ? str(input, 'lyrics') : undefined,
      projectId: str(input, 'project') || str(input, 'projectName') ? findProjectId(input) : undefined,
    })
    if (!updated) throw new Error('Não foi possível atualizar a referência.')
    return ok({
      name: 'update_lipsync_ref',
      title: 'Lipsync atualizado',
      subtitle: updated.label,
      navigateTo: '/musica/lipsync',
      navigateLabel: 'Abrir lipsync',
      entityId: updated.id,
    })
  })

  registry.register('delete_lipsync_ref', (input) => {
    const ref = findLipsync(input)
    lipSyncRefRepository.remove(ref.id)
    return ok({
      name: 'delete_lipsync_ref',
      title: 'Referência excluída',
      subtitle: ref.name,
      entityId: ref.id,
    })
  })

  registry.register('list_channel_prompts', (input) => {
    const channelId = str(input, 'channel') || str(input, 'channelName') ? findChannel(input).id : undefined
    const items = promptRepository.list({ channelId, query: str(input, 'query') || undefined })
    return ok({
      name: 'list_channel_prompts',
      title: items.length === 1 ? '1 prompt de canal' : `${items.length} prompts de canal`,
      data: items.map((item) => ({
        id: item.id,
        title: item.title,
        channel: item.channelName,
        content: item.content.slice(0, 180),
      })),
    })
  })

  registry.register('save_channel_prompt', (input) => {
    const channel = findChannel(input)
    const title = str(input, 'title') || str(input, 'name')
    const content = str(input, 'content') || str(input, 'text') || str(input, 'prompt')
    if (!title || !content) throw new Error('Informe o título e o texto do prompt do canal.')
    const existingId = str(input, 'id')
    const saved = existingId
      ? promptRepository.update(existingId, { title, content, channelId: channel.id })
      : promptRepository.create({ channelId: channel.id, title, content })
    if (!saved) throw new Error('Não foi possível salvar o prompt do canal.')
    return ok({
      name: 'save_channel_prompt',
      title: existingId ? 'Prompt do canal atualizado' : 'Prompt do canal salvo',
      subtitle: saved.title,
      navigateTo: `/canais/${channel.id}`,
      navigateLabel: 'Abrir canal',
      entityId: saved.id,
    })
  })

  registry.register('delete_channel_prompt', (input) => {
    const query = str(input, 'id') || str(input, 'title') || str(input, 'name')
    const prompts = promptRepository.list()
    const prompt = pickNamed(
      prompts.map((item) => ({ ...item, name: item.title, aliases: [item.channelName ?? ''].filter(Boolean) })),
      query,
      'prompt',
    )
    promptRepository.remove(prompt.id)
    return ok({
      name: 'delete_channel_prompt',
      title: 'Prompt do canal excluído',
      subtitle: prompt.title,
      entityId: prompt.id,
    })
  })

  registry.register('list_prompt_tabs', () => {
    const tabs = quickPromptRepository.listTabs()
    return ok({
      name: 'list_prompt_tabs',
      title: tabs.length === 1 ? '1 aba' : `${tabs.length} abas`,
      navigateTo: '/musica/prompts',
      navigateLabel: 'Abrir prompts',
      data: tabs.map((tab) => ({ id: tab.id, name: tab.name })),
    })
  })

  registry.register('create_prompt_tab', (input) => {
    const name = str(input, 'name') || str(input, 'title')
    const tab = quickPromptRepository.createTab({ name })
    return ok({
      name: 'create_prompt_tab',
      title: 'Aba criada',
      subtitle: tab.name,
      navigateTo: '/musica/prompts',
      navigateLabel: 'Abrir prompts',
      entityId: tab.id,
    })
  })

  registry.register('add_world_clock', (input) => {
    const query = str(input, 'label') || str(input, 'name') || str(input, 'country') || str(input, 'timeZone')
    const match = pickNamed(
      WORLD_CLOCK_CATALOG.map((item) => ({
        id: item.timeZone,
        name: item.label,
        aliases: [item.timeZone, item.region],
      })),
      query,
      'fuso',
    )
    const settings = settingsRepository.get()
    if (settings.worldClocks.some((clock) => clock.timeZone === match.id)) {
      return ok({
        name: 'add_world_clock',
        title: 'Fuso já está no Início',
        subtitle: match.name,
        navigateTo: '/',
        navigateLabel: 'Abrir Início',
      })
    }
    const clock = createWorldClock(match.name, match.id)
    if (!clock) throw new Error('Fuso inválido.')
    settingsRepository.update({ worldClocks: [...settings.worldClocks, clock] })
    return ok({
      name: 'add_world_clock',
      title: 'Fuso adicionado',
      subtitle: clock.label,
      navigateTo: '/',
      navigateLabel: 'Abrir Início',
    })
  })

  registry.register('remove_world_clock', (input) => {
    const settings = settingsRepository.get()
    const query = str(input, 'label') || str(input, 'name') || str(input, 'timeZone')
    const match = pickNamed(
      settings.worldClocks.map((clock) => ({ id: clock.id, name: clock.label, aliases: [clock.timeZone] })),
      query,
      'fuso',
    )
    if (settings.worldClocks.length <= 1) throw new Error('Deixe ao menos um fuso no Início.')
    settingsRepository.update({
      worldClocks: settings.worldClocks.filter((clock) => clock.id !== match.id),
    })
    return ok({
      name: 'remove_world_clock',
      title: 'Fuso removido',
      subtitle: match.name,
      navigateTo: '/',
      navigateLabel: 'Abrir Início',
    })
  })

  registry.register('create_team_group', async (input) => {
    const name = str(input, 'name') || str(input, 'title')
    const raw = input.members ?? input.people ?? input.pessoas
    const names = Array.isArray(raw)
      ? raw.map((item) => String(item).trim()).filter(Boolean)
      : (str(input, 'members') || str(input, 'people')).split(/[,;]/).map((item) => item.trim()).filter(Boolean)
    const people = names.length > 0 ? await teamChatService.listDirectory() : []
    const memberIds = names.map((person) =>
      pickNamed(
        people.map((item) => ({ id: item.id, name: item.name, aliases: item.email ? [item.email] : [] })),
        person,
        'pessoa',
      ).id,
    )
    const room = await teamChatService.createGroup({ name, memberIds })
    return ok({
      name: 'create_team_group',
      title: 'Grupo criado',
      subtitle: room.title,
      navigateTo: `/equipe?sala=${encodeURIComponent(room.id)}`,
      navigateLabel: 'Abrir conversa',
      entityId: room.id,
    })
  })
}
