import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, FolderKanban, ListTodo, Tv } from 'lucide-react'
import type { AtlasTask, Channel, ChannelVideo, Project, ProjectType, ScriptRecord } from '@shared/types'
import type { MusicTrack } from '@shared/musicAnalysis'
import { dueDateState, pendingDueTodayCount, pendingTasksForHome } from '@shared/tasks'
import { buildHomeActivity } from '@shared/homeActivity'
import { buildHomeModuleStats } from '@shared/homeStats'
import {
  HOME_UPCOMING_VIDEO_LIMIT,
  channelAgendaPath,
  channelPublishedPath,
  channelVideoPath,
  todayDateKey,
} from '@shared/channelVideos'
import { HomeModuleCard } from '../components/home/HomeModuleCard'
import { HomeStatCard } from '../components/home/HomeStatCard'
import { HomeTaskRow } from '../components/home/HomeTaskRow'
import { HomeActivityRow } from '../components/home/HomeActivityRow'
import { HomeScheduledVideoCard } from '../components/home/HomeScheduledVideoCard'
import { HomeSection } from '../components/home/HomeSection'
import { Card } from '../components/Card'
import {
  ProjectEditorModal,
  type ProjectFormValues,
} from '../components/ProjectEditorModal'
import { getAtlasApi } from '../lib/api'
import { ENVIRONMENTS, projectPath } from '../lib/environments'
import { notifyProjectsChanged, onProjectsChanged } from '../lib/projectEvents'
import { notifyTasksChanged, onTasksChanged } from '../lib/taskEvents'
import { onChannelsChanged } from '../lib/channelEvents'
import { onVideosChanged } from '../lib/videoEvents'
import { onSettingsChanged } from '../lib/settingsEvents'
import { useToast } from '../components/Toast'
import { formatRelativeDate } from '../lib/utils'
import { useWorkspaceCapabilities } from '../hooks/useWorkspaceCapabilities'
import { enabledContentAreas } from '@shared/workspaceCapabilities'

const EMPTY_FORM: ProjectFormValues = { name: '', description: '', channelId: '' }

function homeGreeting(name?: string | null, now = new Date()): string {
  const hour = now.getHours()
  const hello = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  const trimmed = name?.trim()
  if (!trimmed) return hello
  return `${hello}, ${trimmed}`
}

function homeDateLabel(now = new Date()): string {
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now)
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

export function HomePage() {
  const api = getAtlasApi()
  const navigate = useNavigate()
  const { push } = useToast()
  const { capabilities } = useWorkspaceCapabilities()
  const modules = enabledContentAreas(capabilities)

  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<AtlasTask[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [scripts, setScripts] = useState<ScriptRecord[]>([])
  const [tracks, setTracks] = useState<MusicTrack[]>([])
  const [upcomingVideos, setUpcomingVideos] = useState<ChannelVideo[]>([])
  const [accountName, setAccountName] = useState('')
  const [createType, setCreateType] = useState<ProjectType | null>(null)
  const [form, setForm] = useState<ProjectFormValues>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const [history, music, taskList, channelList, scriptList, trackList, videoList, settings] = await Promise.all([
      api.projects.list({ projectType: 'history' }),
      api.projects.list({ projectType: 'music' }),
      api.tasks.list(),
      api.channels.list(),
      api.scripts.list(),
      api.music.list(),
      api.videos.list({ from: todayDateKey(), limit: HOME_UPCOMING_VIDEO_LIMIT, excludeStatus: 'publicado' }),
      api.settings.get(),
    ])
    setProjects([...history, ...music])
    setTasks(taskList)
    setChannels(channelList)
    setScripts(scriptList)
    setTracks(trackList)
    setUpcomingVideos(videoList)
    setAccountName(settings.accountName?.trim() ?? '')
  }, [api])

  useEffect(() => {
    void load()
    const refresh = () => {
      void load()
    }
    const stopTasks = onTasksChanged(refresh)
    const stopProjects = onProjectsChanged(refresh)
    const stopVideos = onVideosChanged(refresh)
    const stopChannels = onChannelsChanged(refresh)
    const stopSettings = onSettingsChanged(refresh)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    return () => {
      stopTasks()
      stopProjects()
      stopVideos()
      stopChannels()
      stopSettings()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
    }
  }, [load])

  const pending = tasks.filter((task) => task.status === 'pending')
  const pendingHome = pendingTasksForHome(tasks, 5)
  const todayCount = pendingDueTodayCount(tasks)
  const overdueCount = pending.filter((task) => dueDateState(task.dueDate) === 'overdue').length
  const moduleStats = useMemo(
    () => buildHomeModuleStats({ projects, scripts, tracks }),
    [projects, scripts, tracks],
  )
  const activity = useMemo(
    () =>
      buildHomeActivity({
        projects,
        scripts: moduleStats.scripts,
        tasks,
        channels,
        tracks: moduleStats.tracks,
      }),
    [projects, moduleStats.scripts, moduleStats.tracks, tasks, channels],
  )
  const latestActivity = activity[0]

  function openCreate(type: ProjectType) {
    setCreateType(type)
    setForm(EMPTY_FORM)
  }

  async function saveProject() {
    if (!createType) return
    if (!form.name.trim()) {
      push('Informe o nome do projeto.', 'error')
      return
    }
    setSaving(true)
    try {
      const project = await api.projects.create({
        name: form.name.trim(),
        description: form.description.trim(),
        projectType: createType,
        channelId: form.channelId || null,
      })
      setCreateType(null)
      setForm(EMPTY_FORM)
      notifyProjectsChanged()
      navigate(`${ENVIRONMENTS[createType].projectsPath}/${project.id}`)
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao criar projeto', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function copyVideoField(value: string, emptyMessage: string, successMessage: string) {
    const text = value.trim()
    if (!text) {
      push(emptyMessage, 'error')
      return
    }
    try {
      await api.system.copyText(text)
      push(successMessage, 'success')
    } catch {
      push('Não foi possível copiar.', 'error')
    }
  }

  async function completeTask(task: AtlasTask) {
    try {
      await api.tasks.setStatus(task.id, 'completed')
      notifyTasksChanged()
      await load()
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao atualizar tarefa', 'error')
    }
  }

  const createChannels = channels.filter((channel) => channel.channelType === createType)

  return (
    <div className="relative h-full overflow-y-auto">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,rgba(53,229,139,0.07),transparent_62%)]"
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-2">Início</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text sm:text-[32px]">{homeGreeting(accountName)}</h1>
            <p className="mt-1.5 text-sm text-muted">{homeDateLabel()}</p>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-pretty text-muted-2 sm:text-right">
            Produção, agenda e pendências em um só lugar.
          </p>
        </header>

        <Card padding="sm" className="overflow-hidden !p-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <HomeStatCard
              className="border-b border-border-soft sm:border-r xl:border-b-0"
              icon={<FolderKanban className="h-4 w-4" />}
              label="Projetos"
              value={projects.length}
              hint={
                modules.length === 2
                  ? 'História e Música'
                  : modules[0] === 'music'
                    ? 'Música'
                    : modules[0] === 'history'
                      ? 'História'
                      : 'Cadastrados'
              }
            />
            <HomeStatCard
              className="border-b border-border-soft xl:border-b-0 xl:border-r"
              icon={<Tv className="h-4 w-4" />}
              label="Canais"
              value={channels.length}
              hint="Cadastro ativo"
              onClick={() => navigate('/canais')}
            />
            <HomeStatCard
              className="border-b border-border-soft sm:border-r sm:border-b-0 xl:border-b-0 xl:border-r"
              icon={<ListTodo className="h-4 w-4" />}
              label="Pendências"
              value={pending.length}
              hint={todayCount > 0 ? `${todayCount} para hoje` : 'Nada para hoje'}
              onClick={() => navigate('/tarefas')}
            />
            <HomeStatCard
              icon={<Activity className="h-4 w-4" />}
              label="Atividade"
              value={latestActivity ? formatRelativeDate(latestActivity.at) : '—'}
              hint={latestActivity?.detail}
            />
          </div>
        </Card>

        <div
          className={
            modules.length > 1
              ? 'mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2'
              : 'mt-8 grid grid-cols-1 gap-5'
          }
        >
          {modules.map((type) => {
            const env = ENVIRONMENTS[type]
            const stats =
              type === 'history'
                ? [
                    { label: 'Projetos', value: moduleStats.historyCount },
                    { label: 'Em andamento', value: moduleStats.draftCount },
                    { label: 'Para revisar', value: moduleStats.reviewCount },
                  ]
                : [
                    { label: 'Projetos', value: moduleStats.musicCount },
                    { label: 'Faixas', value: moduleStats.trackCount },
                  ]

            return (
              <HomeModuleCard
                key={type}
                color={env.color}
                icon={<env.icon className="h-5 w-5" />}
                title={env.label}
                description={env.description}
                stats={stats}
                primaryLabel={`Abrir ${env.label}`}
                secondaryLabel="Novo projeto"
                onOpen={() => navigate(env.basePath)}
                onPrimary={() => navigate(env.basePath)}
                onSecondary={() => openCreate(type)}
              />
            )
          })}
        </div>

        <div className="mt-10">
          <HomeSection
            kicker="Calendário"
            title="Agenda"
            count={upcomingVideos.length}
            action={
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate(channelPublishedPath())}
                  className="text-[13px] font-medium text-muted transition-colors hover:text-text"
                >
                  Publicados
                </button>
                <button
                  type="button"
                  onClick={() => navigate(channelAgendaPath())}
                  className="text-[13px] font-medium text-muted transition-colors hover:text-text"
                >
                  Ver todos
                </button>
              </div>
            }
          >
            {upcomingVideos.length === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border-soft bg-card/60 px-5 py-6">
                <div>
                  <p className="text-sm font-medium text-text">Nenhum vídeo na agenda</p>
                  <p className="mt-1 text-sm text-muted-2">Os próximos cadastros do calendário aparecem aqui.</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/canais')}
                  className="text-[13px] font-medium text-accent hover:text-accent-hover"
                >
                  Abrir canais
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {upcomingVideos.map((video) => (
                  <HomeScheduledVideoCard
                    key={video.id}
                    video={video}
                    onOpen={() => navigate(channelVideoPath(video.channelId, video.id))}
                    onOpenProject={
                      video.channelType === 'music' && video.projectId
                        ? () => navigate(projectPath('music', video.projectId!))
                        : undefined
                    }
                    onCopyTitle={() =>
                      void copyVideoField(video.title, 'Este vídeo ainda não tem título.', 'Título copiado.')
                    }
                    onCopyDescription={() =>
                      void copyVideoField(
                        video.description,
                        'Este vídeo ainda não tem descrição.',
                        'Descrição copiada.',
                      )
                    }
                  />
                ))}
              </div>
            )}
          </HomeSection>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-8 xl:grid-cols-2">
          <HomeSection
            kicker="Operação"
            title="Pendências"
            count={pending.length}
            action={
              <button
                type="button"
                onClick={() => navigate('/tarefas')}
                className="text-[13px] font-medium text-muted transition-colors hover:text-text"
              >
                Ver todas
              </button>
            }
          >
            <Card padding="sm" className="min-h-[240px] !px-4 !py-1">
              <p className="px-1 pb-1 pt-3 text-xs text-muted-2">
                {overdueCount > 0
                  ? `${overdueCount} atrasada${overdueCount === 1 ? '' : 's'}`
                  : todayCount > 0
                    ? `${todayCount} para hoje`
                    : 'Organizadas por prazo e prioridade'}
              </p>
              {pendingHome.length === 0 ? (
                <p className="px-1 py-10 text-sm text-muted-2">Nenhuma tarefa pendente.</p>
              ) : (
                <ul className="divide-y divide-border-soft">
                  {pendingHome.map((task) => (
                    <HomeTaskRow
                      key={task.id}
                      task={task}
                      onToggle={() => void completeTask(task)}
                      onOpenRelated={(path) => navigate(path)}
                    />
                  ))}
                </ul>
              )}
            </Card>
          </HomeSection>

          <HomeSection kicker="Movimento" title="Atividade recente" count={activity.length}>
            <Card padding="sm" className="min-h-[240px] !px-4 !py-1">
              {activity.length === 0 ? (
                <p className="px-1 py-10 text-sm text-muted-2">
                  A produção recente aparece aqui quando houver movimento no Atlas.
                </p>
              ) : (
                <ul className="divide-y divide-border-soft">
                  {activity.map((item) => (
                    <HomeActivityRow
                      key={item.id}
                      item={item}
                      onOpen={(href) => navigate(href)}
                    />
                  ))}
                </ul>
              )}
            </Card>
          </HomeSection>
        </div>
      </div>

      <ProjectEditorModal
        open={Boolean(createType)}
        projectType={createType ?? 'history'}
        channels={createChannels}
        editing={null}
        form={form}
        saving={saving}
        onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
        onClose={() => setCreateType(null)}
        onSubmit={() => void saveProject()}
      />
    </div>
  )
}
