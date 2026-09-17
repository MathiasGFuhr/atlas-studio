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
  channelVideoPath,
  todayDateKey,
} from '@shared/channelVideos'
import { PageHeader } from '../components/PageHeader'
import { Card } from '../components/Card'
import {
  ProjectEditorModal,
  type ProjectFormValues,
} from '../components/ProjectEditorModal'
import { HomeModuleCard } from '../components/home/HomeModuleCard'
import { HomeStatCard } from '../components/home/HomeStatCard'
import { HomeTaskRow } from '../components/home/HomeTaskRow'
import { HomeActivityRow } from '../components/home/HomeActivityRow'
import { HomeScheduledVideoCard } from '../components/home/HomeScheduledVideoCard'
import { getAtlasApi } from '../lib/api'
import { ENVIRONMENTS } from '../lib/environments'
import { notifyProjectsChanged, onProjectsChanged } from '../lib/projectEvents'
import { notifyTasksChanged, onTasksChanged } from '../lib/taskEvents'
import { onChannelsChanged } from '../lib/channelEvents'
import { onVideosChanged } from '../lib/videoEvents'
import { useToast } from '../components/Toast'
import { formatRelativeDate } from '../lib/utils'
import { useWorkspaceCapabilities } from '../hooks/useWorkspaceCapabilities'
import { enabledContentAreas } from '@shared/workspaceCapabilities'

const EMPTY_FORM: ProjectFormValues = { name: '', description: '', channelId: '' }

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
  const [createType, setCreateType] = useState<ProjectType | null>(null)
  const [form, setForm] = useState<ProjectFormValues>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const [history, music, taskList, channelList, scriptList, trackList, videoList] = await Promise.all([
      api.projects.list({ projectType: 'history' }),
      api.projects.list({ projectType: 'music' }),
      api.tasks.list(),
      api.channels.list(),
      api.scripts.list(),
      api.music.list(),
      api.videos.list({ from: todayDateKey(), limit: HOME_UPCOMING_VIDEO_LIMIT }),
    ])
    setProjects([...history, ...music])
    setTasks(taskList)
    setChannels(channelList)
    setScripts(scriptList)
    setTracks(trackList)
    setUpcomingVideos(videoList)
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
    <div className="h-full overflow-y-auto px-8 py-6">
      <PageHeader
        breadcrumb="Atlas / Início"
        title="Atlas Studio"
        subtitle="Seu centro de produção para roteiros, música e organização criativa."
        hint="Gerencie projetos, canais, tarefas e produção em um só lugar."
      />

      <div className={modules.length > 1 ? 'grid grid-cols-1 gap-5 lg:grid-cols-2' : 'grid grid-cols-1 gap-5'}>
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
                  { label: 'Cortes', value: moduleStats.cutCount },
                ]

          return (
            <HomeModuleCard
              key={type}
              color={env.color}
              icon={<env.icon className="h-6 w-6" />}
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

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        <HomeStatCard
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
                  : 'Projetos cadastrados'
          }
        />
        <HomeStatCard
          icon={<Tv className="h-4 w-4" />}
          label="Canais"
          value={channels.length}
          hint="Cadastrados no Atlas"
          onClick={() => navigate('/canais')}
        />
        <HomeStatCard
          icon={<ListTodo className="h-4 w-4" />}
          label="Tarefas pendentes"
          value={pending.length}
          hint={todayCount > 0 ? `${todayCount} para hoje` : 'Nenhuma para hoje'}
          onClick={() => navigate('/tarefas')}
        />
        <HomeStatCard
          icon={<Activity className="h-4 w-4" />}
          label="Última atividade"
          value={latestActivity ? formatRelativeDate(latestActivity.at) : '—'}
          hint={latestActivity?.detail}
        />
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="text-base font-semibold text-text">Vídeos agendados</h2>
            <span className="rounded-full border border-border-soft bg-card-2 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted">
              {upcomingVideos.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => navigate(channelAgendaPath())}
            className="shrink-0 text-xs font-medium text-accent hover:underline"
          >
            Ver todos
          </button>
        </div>
        {upcomingVideos.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-soft bg-card px-4 py-3">
            <p className="text-sm text-muted">Nenhum vídeo agendado.</p>
            <button
              type="button"
              onClick={() => navigate('/canais')}
              className="text-xs font-medium text-accent hover:underline"
            >
              Abrir canais
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {upcomingVideos.map((video) => (
              <HomeScheduledVideoCard
                key={video.id}
                video={video}
                onOpen={() => navigate(channelVideoPath(video.channelId, video.id))}
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
      </section>

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-text">Tarefas pendentes</h2>
              <span className="rounded-full border border-border-soft bg-card-2 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted">
                {pending.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/tarefas')}
              className="text-xs font-medium text-accent hover:underline"
            >
              Ver todas
            </button>
          </div>
          <Card padding="sm" className="min-h-[220px]">
            <p className="mb-2 text-xs text-muted">
              {overdueCount > 0
                ? `${overdueCount} atrasada${overdueCount === 1 ? '' : 's'}`
                : todayCount > 0
                  ? `${todayCount} para hoje`
                  : 'Fila organizada por prazo e prioridade'}
            </p>
            {pendingHome.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-muted-2">
                Nenhuma tarefa pendente no momento.
              </p>
            ) : (
              <ul className="flex flex-col">
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
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-text">Atividade recente</h2>
              <span className="rounded-full border border-border-soft bg-card-2 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted">
                {activity.length}
              </span>
            </div>
          </div>
          <Card padding="sm" className="min-h-[220px]">
            {activity.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-muted-2">
                A produção recente aparece aqui quando houver movimento no Atlas.
              </p>
            ) : (
              <ul className="flex flex-col">
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
        </section>
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
