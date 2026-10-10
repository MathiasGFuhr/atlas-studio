import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import type { Channel, Project, ProjectType } from '@shared/types'
import {
  EMPTY_PROJECT_FORM,
  ProjectEditorModal,
  type ProjectFormValues,
} from './ProjectEditorModal'
import {
  ChannelEditorModal,
  EMPTY_CHANNEL_FORM,
  type ChannelFormValues,
} from './ChannelEditorModal'
import { TaskEditorModal, EMPTY_TASK_FORM, type TaskFormValues } from './TaskEditorModal'
import { getAtlasApi } from '../lib/api'
import { notifyProjectsChanged } from '../lib/projectEvents'
import { notifyChannelsChanged } from '../lib/channelEvents'
import { notifyTasksChanged } from '../lib/taskEvents'
import { projectPath } from '../lib/environments'
import { useToast } from './Toast'
import { taskRelatedTypeOptions } from '@shared/workspaceCapabilities'

type CreateKind = 'music' | 'channel' | 'task'

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
  const { push, pushError } = useToast()

  const [projectType, setProjectType] = useState<ProjectType | null>(null)
  const [projectForm, setProjectForm] = useState<ProjectFormValues>(EMPTY_PROJECT_FORM)
  const [projectChannels, setProjectChannels] = useState<Channel[]>([])
  const [projectSaving, setProjectSaving] = useState(false)

  const [channelOpen, setChannelOpen] = useState(false)
  const [channelForm, setChannelForm] = useState<ChannelFormValues>(EMPTY_CHANNEL_FORM)
  const [pendingAvatar, setPendingAvatar] = useState<string | null>(null)
  const [channelSaving, setChannelSaving] = useState(false)

  const [taskOpen, setTaskOpen] = useState(false)
  const [taskForm, setTaskForm] = useState<TaskFormValues>(EMPTY_TASK_FORM)
  const [musicProjects, setMusicProjects] = useState<Project[]>([])
  const [taskChannels, setTaskChannels] = useState<Channel[]>([])
  const [taskSaving, setTaskSaving] = useState(false)

  const relatedOptions = useMemo(() => {
    if (taskForm.relatedType === 'music' || taskForm.relatedType === 'history') {
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
  }, [taskForm.relatedType, musicProjects, taskChannels])

  const openCreate = useCallback(
    (kind: CreateKind) => {
      void (async () => {
        if (kind === 'music') {
          const channels = await api.channels.list({ channelType: 'music' })
          setProjectChannels(channels)
          setProjectForm(EMPTY_PROJECT_FORM)
          setProjectType('music')
          return
        }

        if (kind === 'channel') {
          setPendingAvatar(null)
          setChannelForm({
            ...EMPTY_CHANNEL_FORM,
            channelType: 'music',
          })
          setChannelOpen(true)
          return
        }

        const [music, channels] = await Promise.all([
          api.projects.list({ projectType: 'music' }),
          api.channels.list(),
        ])
        setMusicProjects(music)
        setTaskChannels(channels)
        setTaskForm(EMPTY_TASK_FORM)
        setTaskOpen(true)
      })()
    },
    [api],
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
      pushError(error, 'Falha ao criar projeto')
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
        nicheId: null,
        youtubeUrl: channelForm.youtubeUrl.trim(),
        color: channelForm.color,
        channelType: 'music',
        active: channelForm.active,
        folderPath: channelForm.folderPath?.trim() || null,
      })
      if (pendingAvatar) {
        await api.channels.setAvatar(saved.id, pendingAvatar)
      }
      setChannelOpen(false)
      setPendingAvatar(null)
      notifyChannelsChanged()
      navigate(`/canais/${saved.id}`)
    } catch (error) {
      pushError(error, 'Falha ao salvar canal')
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
      const relatedType =
        taskForm.relatedType === 'history' ? 'music' : taskForm.relatedType || null
      await api.tasks.create({
        title: taskForm.title.trim(),
        description: taskForm.description,
        category: taskForm.category === 'history' || taskForm.category === 'script' ? 'music' : taskForm.category,
        priority: taskForm.priority,
        dueDate: taskForm.dueDate || null,
        relatedType,
        relatedId: relatedType ? taskForm.relatedId || null : null,
      })
      setTaskOpen(false)
      notifyTasksChanged()
      push('Tarefa criada.', 'success')
      navigate('/tarefas')
    } catch (error) {
      pushError(error, 'Falha ao salvar tarefa')
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
        projectType={projectType ?? 'music'}
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
        niches={[]}
        pendingAvatar={pendingAvatar}
        saving={channelSaving}
        hideNiche
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
        relatedTypeOptions={taskRelatedTypeOptions({ musicEnabled: true })}
        saving={taskSaving}
        onChange={(patch) => setTaskForm((current) => ({ ...current, ...patch }))}
        onClose={() => setTaskOpen(false)}
        onSubmit={() => void saveTask()}
      />
    </CreateActionsContext.Provider>
  )
}
