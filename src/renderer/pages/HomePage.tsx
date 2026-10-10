import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  CalendarDays,
  ListTodo,
  Newspaper,
} from 'lucide-react'
import type { AtlasTask, Channel, ChannelVideo, Project, ProjectType } from '@shared/types'
import type { MusicTrack } from '@shared/musicAnalysis'
import type { WorldClock } from '@shared/worldClocks'
import { normalizeWorldClocks } from '@shared/worldClocks'
import { dueDateState, pendingDueTodayCount, pendingTasksForHome } from '@shared/tasks'
import { buildHomeActivity } from '@shared/homeActivity'
import { buildHomeModuleStats } from '@shared/homeStats'
import {
  AGENDA_UPCOMING_VIDEO_LIMIT,
  HOME_UPCOMING_VIDEO_LIMIT,
  channelAgendaPath,
  channelCalendarPath,
  channelPublishedPath,
  channelVideoPath,
  todayDateKey,
} from '@shared/channelVideos'
import { MUSIC_LIPSYNC_PATH, MUSIC_PROMPTS_PATH } from '@shared/workspaceCapabilities'
import type { TeamChatPeer } from '@shared/account'
import { HomeHero } from '../components/home/HomeHero'
import { HomeStatCard } from '../components/home/HomeStatCard'
import { HomeCalendarCard } from '../components/home/HomeCalendarCard'
import { HomeMarketsCard } from '../components/home/HomeMarketsCard'
import { HomePipeline } from '../components/home/HomePipeline'
import { HomeQuickActions, HOME_QUICK_ICONS } from '../components/home/HomeQuickActions'
import { HomeActivityCard } from '../components/home/HomeActivityCard'
import { HomeTasksCard } from '../components/home/HomeTasksCard'
import { Card } from '../components/Card'
import { notifySettingsChanged } from '../lib/settingsEvents'
import {
  EMPTY_PROJECT_FORM,
  ProjectEditorModal,
  type ProjectFormValues,
} from '../components/ProjectEditorModal'
import { getAtlasApi } from '../lib/api'
import { ENVIRONMENTS } from '../lib/environments'
import { notifyProjectsChanged, onProjectsChanged } from '../lib/projectEvents'
import { notifyTasksChanged, onTasksChanged } from '../lib/taskEvents'
import { onChannelsChanged } from '../lib/channelEvents'
import { onVideosChanged } from '../lib/videoEvents'
import { onSettingsChanged } from '../lib/settingsEvents'
import { useToast } from '../components/Toast'
import { formatRelativeDate } from '../lib/utils'

function homeHello(now = new Date()): string {
  const hour = now.getHours()
  return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
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
  const { push, pushError } = useToast()

  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<AtlasTask[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [tracks, setTracks] = useState<MusicTrack[]>([])
  const [upcomingVideos, setUpcomingVideos] = useState<ChannelVideo[]>([])
  const [publishedCount, setPublishedCount] = useState(0)
  const [chatOnline, setChatOnline] = useState<TeamChatPeer[]>([])
  const [accountName, setAccountName] = useState('')
  const [worldClocks, setWorldClocks] = useState<WorldClock[]>([])
  const [createType, setCreateType] = useState<ProjectType | null>(null)
  const [form, setForm] = useState<ProjectFormValues>(EMPTY_PROJECT_FORM)
  const [saving, setSaving] = useState(false)
  const [savingClocks, setSavingClocks] = useState(false)
  const loadSeq = useRef(0)

  const load = useCallback(async () => {
    const seq = ++loadSeq.current
    try {
      const [
        music,
        taskList,
        channelList,
        trackList,
        videoList,
        publishedList,
        settings,
        online,
      ] = await Promise.all([
        api.projects.list({ projectType: 'music' }),
        api.tasks.list(),
        api.channels.list(),
        api.music.list(),
        api.videos.list({
          from: todayDateKey(),
          limit: AGENDA_UPCOMING_VIDEO_LIMIT,
          excludeStatus: 'publicado',
        }),
        api.videos.list({ status: 'publicado', limit: 100 }).catch(() => [] as ChannelVideo[]),
        api.settings.get(),
        api.teamChat.listOnline().catch(() => [] as TeamChatPeer[]),
      ])
      if (seq !== loadSeq.current) return
      setProjects(music)
      setTasks(taskList)
      setChannels(channelList)
      setTracks(trackList)
      setUpcomingVideos(videoList)
      setPublishedCount(publishedList.length)
      setAccountName(settings.accountName?.trim() ?? '')
      setWorldClocks(normalizeWorldClocks(settings.worldClocks))
      setChatOnline(online)
    } catch (error) {
      if (seq !== loadSeq.current) return
      pushError(error, 'Falha ao carregar o início')
    }
  }, [api, pushError])

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
    const stopPresence = api.teamChat.onPresence((peers) => setChatOnline(peers))
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    return () => {
      loadSeq.current += 1
      stopTasks()
      stopProjects()
      stopVideos()
      stopChannels()
      stopSettings()
      stopPresence()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
    }
  }, [api, load])

  const pending = tasks.filter((task) => task.status === 'pending')
  const pendingHome = pendingTasksForHome(tasks, 6)
  const todayCount = pendingDueTodayCount(tasks)
  const overdueCount = pending.filter((task) => dueDateState(task.dueDate) === 'overdue').length
  const pipelineVideos = upcomingVideos.slice(0, HOME_UPCOMING_VIDEO_LIMIT + 2)
  const moduleStats = useMemo(
    () => buildHomeModuleStats({ projects, tracks, upcomingVideos }),
    [projects, tracks, upcomingVideos],
  )
  const activity = useMemo(
    () =>
      buildHomeActivity({
        projects,
        tasks,
        channels,
        tracks: moduleStats.tracks,
      }),
    [projects, moduleStats.tracks, tasks, channels],
  )
  const latestActivity = activity[0]

  function openCreate(type: ProjectType) {
    setCreateType(type)
    setForm(EMPTY_PROJECT_FORM)
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
      setForm(EMPTY_PROJECT_FORM)
      notifyProjectsChanged()
      navigate(`${ENVIRONMENTS[createType].projectsPath}/${project.id}`)
    } catch (error) {
      pushError(error, 'Falha ao criar projeto')
    } finally {
      setSaving(false)
    }
  }

  async function completeTask(task: AtlasTask) {
    try {
      await api.tasks.setStatus(task.id, 'completed')
      notifyTasksChanged()
      await load()
    } catch (error) {
      pushError(error, 'Falha ao atualizar tarefa')
    }
  }

  async function saveWorldClocks(next: WorldClock[]) {
    const previous = worldClocks
    const normalizedNext = normalizeWorldClocks(next)
    loadSeq.current += 1
    setWorldClocks(normalizedNext)
    setSavingClocks(true)
    try {
      const saved = await api.settings.update({ worldClocks: normalizedNext })
      setWorldClocks(normalizeWorldClocks(saved.worldClocks))
      notifySettingsChanged()
    } catch (error) {
      setWorldClocks(previous)
      pushError(error, 'Falha ao salvar fusos horários')
    } finally {
      setSavingClocks(false)
    }
  }

  const createChannels = channels.filter((channel) => channel.channelType === createType)
  const tasksHint =
    overdueCount > 0
      ? `${overdueCount} atrasada${overdueCount === 1 ? '' : 's'}`
      : todayCount > 0
        ? `${todayCount} para hoje`
        : 'Organizadas por prazo e prioridade'

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="relative mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
          {/* Coluna principal */}
          <div className="flex min-w-0 flex-col gap-4 xl:col-span-3">
            <HomeHero hello={homeHello()} name={accountName} dateLabel={homeDateLabel()} />

            <Card padding="sm" className="overflow-hidden !p-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
                <HomeStatCard
                  className="border-b border-white/[0.05] sm:border-r xl:border-b-0 xl:border-r"
                  icon={<CalendarDays className="h-4 w-4 text-accent" />}
                  label="Agendamentos"
                  value={upcomingVideos.length}
                  hint={upcomingVideos.length === 0 ? 'Nada na agenda' : 'Na agenda'}
                  onClick={() => navigate(channelAgendaPath())}
                />
                <HomeStatCard
                  className="border-b border-white/[0.05] sm:border-r-0 xl:border-b-0 xl:border-r"
                  icon={<Newspaper className="h-4 w-4 text-accent" />}
                  label="Publicações"
                  value={publishedCount}
                  hint="Publicados"
                  onClick={() => navigate(channelPublishedPath())}
                />
                <HomeStatCard
                  className="border-b border-white/[0.05] sm:border-r xl:border-b-0 xl:border-r"
                  icon={<ListTodo className="h-4 w-4 text-accent" />}
                  label="Tarefas pendentes"
                  value={pending.length}
                  hint={todayCount > 0 ? `${todayCount} para hoje` : 'Nada para hoje'}
                  onClick={() => navigate('/tarefas')}
                />
                <HomeStatCard
                  icon={<Activity className="h-4 w-4 text-accent" />}
                  label="Atividade recente"
                  value={latestActivity ? formatRelativeDate(latestActivity.at) : '—'}
                  hint={latestActivity?.detail ?? 'Sem movimento'}
                />
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="min-w-0 lg:col-span-2">
                <HomeCalendarCard
                  channels={channels}
                  onOpenChannel={(id) => navigate(channelCalendarPath(id))}
                  onOpenDay={(id) => navigate(channelCalendarPath(id))}
                  onOpenVideo={(video) => navigate(channelVideoPath(video.channelId, video.id))}
                />
              </div>
              <HomeQuickActions
                actions={[
                  {
                    id: 'project',
                    label: 'Novo projeto',
                    icon: HOME_QUICK_ICONS.FolderPlus,
                    onClick: () => openCreate('music'),
                  },
                  {
                    id: 'lipsync',
                    label: 'Lipsync',
                    icon: HOME_QUICK_ICONS.Mic2,
                    onClick: () => navigate(MUSIC_LIPSYNC_PATH),
                  },
                  {
                    id: 'shorts',
                    label: 'Shorts Studio',
                    icon: HOME_QUICK_ICONS.Clapperboard,
                    onClick: () => navigate('/shorts'),
                  },
                  {
                    id: 'channels',
                    label: 'Canais',
                    icon: HOME_QUICK_ICONS.Tv,
                    onClick: () => navigate('/canais'),
                  },
                  {
                    id: 'prompts',
                    label: 'Prompts',
                    icon: HOME_QUICK_ICONS.MessageSquareText,
                    onClick: () => navigate(MUSIC_PROMPTS_PATH),
                  },
                  {
                    id: 'chat',
                    label: chatOnline.length > 0 ? `Chat · ${chatOnline.length}` : 'Chat equipe',
                    icon: HOME_QUICK_ICONS.MessagesSquare,
                    onClick: () => navigate('/equipe'),
                  },
                ]}
              />
            </div>

            <HomePipeline
              videos={pipelineVideos}
              onOpen={(video) => navigate(channelVideoPath(video.channelId, video.id))}
              onSeeAll={() => navigate(channelAgendaPath())}
            />
          </div>

          {/* Coluna direita */}
          <div className="flex min-w-0 flex-col gap-4 xl:col-span-1">
            <HomeMarketsCard
              clocks={worldClocks}
              saving={savingClocks}
              onChange={(next) => void saveWorldClocks(next)}
            />
            <HomeActivityCard
              items={activity.slice(0, 8)}
              onOpen={(href) => navigate(href)}
            />
            <HomeTasksCard
              tasks={pendingHome}
              hint={tasksHint}
              onToggle={(task) => void completeTask(task)}
              onOpenRelated={(path) => navigate(path)}
              onOpenAll={() => navigate('/tarefas')}
              onCreate={() => navigate('/tarefas')}
            />
          </div>
        </div>
      </div>

      <ProjectEditorModal
        open={Boolean(createType)}
        projectType={createType ?? 'music'}
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
