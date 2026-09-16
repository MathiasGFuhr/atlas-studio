import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Channel, Niche, Project, ProjectType } from '@shared/types'
import { createMenuAreaFromPath } from '@shared/createMenu'
import { ProjectEditorModal, type ProjectFormValues } from './ProjectEditorModal'
import {
  ChannelEditorModal,
  EMPTY_CHANNEL_FORM,
  type ChannelFormValues,
} from './ChannelEditorModal'
import { TaskEditorModal, EMPTY_TASK_FORM, type TaskFormValues } from './TaskEditorModal'
import { getAtlasApi } from '../lib/api'
import { notifyProjectsChanged } from '../lib/projectEvents'
import { notifyTasksChanged } from '../lib/taskEvents'
import { projectPath } from '../lib/environments'
import { useToast } from './Toast'

const EMPTY_PROJECT_FORM: ProjectFormValues = { name: '', description: '', channelId: '' }

type CreateKind = 'history' | 'music' | 'channel' | 'task'

type CreateActionsValue = {
  openCreate: (kind: CreateKind) => void
}

const CreateActionsContext = createContext<CreateActionsValue | null>(null)

export function useCreateActions() {
  const value = useContext(CreateActionsContext)
  if (!value) {
    throw new Error('useCreateActions precisa estar dentro de CreateActionsProvider')
  }
  return value
}

export function CreateActionsProvider({ children }: { children: ReactNode }) {
  const api = getAtlasApi()
  const navigate = useNavigate()
  const location = useLocation()
  const { push } = useToast()

  const [projectType, setProjectType] = useState<ProjectType | null>(null)
  const [projectForm, setProjectForm] = useState<ProjectFormValues>(EMPTY_PROJECT_FORM)
  const [projectChannels, setProjectChannels] = useState<Channel[]>([])
  const [projectSaving, setProjectSaving] = useState(false)

  const [channelOpen, setChannelOpen] = useState(false)
  const [channelForm, setChannelForm] = useState<ChannelFormValues>(EMPTY_CHANNEL_FORM)
  const [channelNiches, setChannelNiches] = useState<Niche[]>([])
  const [pendingAvatar, setPendingAvatar] = useState<string | null>(null)
  const [channelSaving, setChannelSaving] = useState(false)

  const [taskOpen, setTaskOpen] = useState(false)
  const [taskForm, setTaskForm] = useState<TaskFormValues>(EMPTY_TASK_FORM)
  const [historyProjects, setHistoryProjects] = useState<Project[]>([])
  const [musicProjects, setMusicProjects] = useState<Project[]>([])
  const [taskChannels, setTaskChannels] = useState<Channel[]>([])
  const [taskSaving, setTaskSaving] = useState(false)

  const relatedOptions = useMemo(() => {
    if (taskForm.relatedType === 'history') {
      return [
        { value: '', label: 'Selecione o projeto' },
        ...historyProjects.map((p) => ({ value: p.id, label: p.name })),
      ]
    }
    if (taskForm.relatedType === 'music') {
      return [
        { value: '', label: 'Selecione o projeto' },
        ...musicProjects.map((p) => ({ value: p.id, label: p.name })),
      ]
    }
    if (taskForm.relatedType === 'channel') {
      return [
        { value: '', label: 'Selecione o canal' },
        ...taskChannels.map((c) => ({ value: c.id, label: c.name })),
      ]
    }
    return [{ value: '', label: 'Sem relacionamento' }]
  }, [taskForm.relatedType, historyProjects, musicProjects, taskChannels])

  const openCreate = useCallback(
    (kind: CreateKind) => {
      void (async () => {
        if (kind === 'history' || kind === 'music') {
          const type: ProjectType = kind
          const channels = await api.channels.list({ channelType: type })
          setProjectChannels(channels)
          setProjectForm(EMPTY_PROJECT_FORM)
          setProjectType(type)
          return
        }

        if (kind === 'channel') {
          const niches = await api.niches.list()
          const area = createMenuAreaFromPath(location.pathname)
          setChannelNiches(niches)
          setPendingAvatar(null)
          setChannelForm({
            ...EMPTY_CHANNEL_FORM,
            channelType: area === 'music' ? 'music' : 'history',
          })
          setChannelOpen(true)
          return
        }

        const [history, music, channels] = await Promise.all([
          api.projects.list({ projectType: 'history' }),
          api.projects.list({ projectType: 'music' }),
          api.channels.list(),
        ])
        setHistoryProjects(history)
        setMusicProjects(music)
        setTaskChannels(channels)
        setTaskForm(EMPTY_TASK_FORM)
        setTaskOpen(true)
      })()
    },
    [api, location.pathname],
  )

  async function saveProject() {
    if (!projectType) return
    if (!projectForm.name.trim()) {
      push('Informe o nome do projeto.', 'error')
      return
    }
    setProjectSaving(true)
    try {
      const project = await api.projects.create({
        name: projectForm.name.trim(),
        description: projectForm.description.trim(),
        projectType,
        channelId: projectForm.channelId || null,
      })
      setProjectType(null)
      setProjectForm(EMPTY_PROJECT_FORM)
      notifyProjectsChanged()
      navigate(projectPath(projectType, project.id))
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao criar projeto', 'error')
    } finally {
      setProjectSaving(false)
    }
  }

  async function pickChannelAvatar() {
    const file = await api.dialog.selectImage()
    if (file) setPendingAvatar(file)
  }

  async function saveChannel() {
    if (!channelForm.name.trim()) {
      push('O nome do canal é obrigatório.', 'error')
      return
    }
    setChannelSaving(true)
    try {
      const saved = await api.channels.create({
        name: channelForm.name.trim(),
        description: channelForm.description,
        avatarPath: '',
        nicheId: channelForm.nicheId || null,
        youtubeUrl: channelForm.youtubeUrl.trim(),
        color: channelForm.color,
        channelType: channelForm.channelType,
        active: channelForm.active,
      })
      if (pendingAvatar) {
        await api.channels.setAvatar(saved.id, pendingAvatar)
      }
      setChannelOpen(false)
      setPendingAvatar(null)
      navigate(`/canais/${saved.id}`)
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao salvar canal', 'error')
    } finally {
      setChannelSaving(false)
    }
  }

  async function saveTask() {
    if (!taskForm.title.trim()) {
      push('O título da tarefa é obrigatório.', 'error')
      return
    }
    setTaskSaving(true)
    try {
      await api.tasks.create({
        title: taskForm.title.trim(),
        description: taskForm.description,
        category: taskForm.category,
        priority: taskForm.priority,
        dueDate: taskForm.dueDate || null,
        relatedType: taskForm.relatedType || null,
        relatedId: taskForm.relatedType ? taskForm.relatedId || null : null,
      })
      setTaskOpen(false)
      notifyTasksChanged()
      push('Tarefa criada.', 'success')
      navigate('/tarefas')
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao salvar tarefa', 'error')
    } finally {
      setTaskSaving(false)
    }
  }

  const value = useMemo(() => ({ openCreate }), [openCreate])

  return (
    <CreateActionsContext.Provider value={value}>
      {children}
      <ProjectEditorModal
        open={Boolean(projectType)}
        projectType={projectType ?? 'history'}
        channels={projectChannels}
        editing={null}
        form={projectForm}
        saving={projectSaving}
        onChange={(patch) => setProjectForm((current) => ({ ...current, ...patch }))}
        onClose={() => setProjectType(null)}
        onSubmit={() => void saveProject()}
      />
      <ChannelEditorModal
        open={channelOpen}
        editing={null}
        form={channelForm}
        niches={channelNiches}
        pendingAvatar={pendingAvatar}
        saving={channelSaving}
        onChange={(patch) => setChannelForm((current) => ({ ...current, ...patch }))}
        onClose={() => setChannelOpen(false)}
        onSubmit={() => void saveChannel()}
        onPickAvatar={() => void pickChannelAvatar()}
      />
      <TaskEditorModal
        open={taskOpen}
        editing={false}
        form={taskForm}
        relatedOptions={relatedOptions}
        saving={taskSaving}
        onChange={(patch) => setTaskForm((current) => ({ ...current, ...patch }))}
        onClose={() => setTaskOpen(false)}
        onSubmit={() => void saveTask()}
      />
    </CreateActionsContext.Provider>
  )
}
