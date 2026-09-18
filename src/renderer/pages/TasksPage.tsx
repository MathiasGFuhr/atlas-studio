import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { CheckSquare, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import type { AtlasTask, Channel, Project, TaskFilter } from '@shared/types'
import {
  TASK_CATEGORY_LABEL,
  TASK_FILTER_LABEL,
  TASK_PRIORITY_LABEL,
  dueDateLabel,
  dueDateState,
  filterTasks,
  relatedOpenPath,
  sortTasks,
} from '@shared/tasks'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/Modal'
import { TaskEditorModal, EMPTY_TASK_FORM, type TaskFormValues } from '../components/TaskEditorModal'
import { Card } from '../components/Card'
import { getAtlasApi } from '../lib/api'
import { notifyTasksChanged, onTasksChanged } from '../lib/taskEvents'
import { useToast } from '../components/Toast'
import { cn } from '../lib/utils'
import { useWorkspaceCapabilities } from '../hooks/useWorkspaceCapabilities'
import { taskRelatedTypeOptions } from '@shared/workspaceCapabilities'

const FILTERS: TaskFilter[] = ['all', 'today', 'pending', 'completed']

export function TasksPage() {
  const api = getAtlasApi()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { push } = useToast()
  const { capabilities } = useWorkspaceCapabilities()
  const [tasks, setTasks] = useState<AtlasTask[]>([])
  const [historyProjects, setHistoryProjects] = useState<Project[]>([])
  const [musicProjects, setMusicProjects] = useState<Project[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AtlasTask | null>(null)
  const [deleting, setDeleting] = useState<AtlasTask | null>(null)
  const [form, setForm] = useState<TaskFormValues>(EMPTY_TASK_FORM)
  const [saving, setSaving] = useState(false)
  const openedQueryRef = useRef<string | null>(null)

  async function load() {
    const [list, history, music, channelList] = await Promise.all([
      api.tasks.list(),
      api.projects.list({ projectType: 'history' }),
      api.projects.list({ projectType: 'music' }),
      api.channels.list(),
    ])
    setTasks(list)
    setHistoryProjects(history)
    setMusicProjects(music)
    setChannels(channelList)
  }

  useEffect(() => {
    void load()
    return onTasksChanged(() => {
      void load()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visible = useMemo(
    () => sortTasks(filterTasks(tasks, { filter, query })),
    [tasks, filter, query],
  )

  const relatedOptions = useMemo(() => {
    if (form.relatedType === 'history') {
      return [
        { value: '', label: 'Selecione o projeto' },
        ...historyProjects.map((p) => ({ value: p.id, label: p.name })),
      ]
    }
    if (form.relatedType === 'music') {
      return [
        { value: '', label: 'Selecione o projeto' },
        ...musicProjects.map((p) => ({ value: p.id, label: p.name })),
      ]
    }
    if (form.relatedType === 'channel') {
      return [
        { value: '', label: 'Selecione o canal' },
        ...channels.map((c) => ({ value: c.id, label: c.name })),
      ]
    }
    return [{ value: '', label: 'Sem relacionamento' }]
  }, [form.relatedType, historyProjects, musicProjects, channels])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_TASK_FORM)
    setModalOpen(true)
  }

  function openEdit(task: AtlasTask) {
    setEditing(task)
    setForm({
      title: task.title,
      description: task.description,
      category: task.category,
      priority: task.priority,
      dueDate: task.dueDate ?? '',
      relatedType: task.relatedType ?? '',
      relatedId: task.relatedId ?? '',
    })
    setModalOpen(true)
  }

  useEffect(() => {
    const taskId = searchParams.get('task')
    if (!taskId) {
      openedQueryRef.current = null
      return
    }
    const nonce = (location.state as { nonce?: number } | null)?.nonce
    const key = `${taskId}:${nonce ?? 'q'}`
    if (openedQueryRef.current === key) return
    const found = tasks.find((task) => task.id === taskId)
    if (!found) return
    openedQueryRef.current = key
    openEdit(found)
  }, [searchParams, tasks, location.state])

  async function save() {
    if (!form.title.trim()) {
      push('O título da tarefa é obrigatório.', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description,
        category: form.category,
        priority: form.priority,
        dueDate: form.dueDate || null,
        relatedType: form.relatedType || null,
        relatedId: form.relatedType ? form.relatedId || null : null,
      }
      if (editing) {
        await api.tasks.update(editing.id, payload)
        push('Tarefa atualizada.', 'success')
      } else {
        await api.tasks.create(payload)
        push('Tarefa criada.', 'success')
      }
      setModalOpen(false)
      await load()
      notifyTasksChanged()
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao salvar tarefa', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function toggleStatus(task: AtlasTask) {
    const next = task.status === 'pending' ? 'completed' : 'pending'
    try {
      await api.tasks.setStatus(task.id, next)
      await load()
      notifyTasksChanged()
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao atualizar tarefa', 'error')
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await api.tasks.remove(deleting.id)
      push('Tarefa excluída.', 'success')
      setDeleting(null)
      await load()
      notifyTasksChanged()
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao excluir tarefa', 'error')
    }
  }

  return (
    <PageShell>
      <PageHeader
        breadcrumb="Atlas / Tarefas"
        title="Tarefas"
        subtitle="Lista simples do que precisa ser feito no dia a dia da criação de conteúdo."
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar tarefa..."
            className="h-11 w-full rounded-xl border border-border bg-card-2 pl-10 pr-3 text-sm text-text placeholder:text-muted-2 focus:border-accent/50 focus:outline-none"
          />
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
          Nova tarefa
        </Button>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFilter(item)}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
              filter === item
                ? 'border-accent/40 bg-accent-dark/55 text-accent'
                : 'border-border bg-card-2 text-muted hover:text-text',
            )}
          >
            {TASK_FILTER_LABEL[item]}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card className="flex flex-col items-center py-14 text-center">
          <CheckSquare className="h-8 w-8 text-muted-2" />
          <p className="mt-3 text-sm font-medium text-text">
            {tasks.length === 0 ? 'Nenhuma tarefa ainda' : 'Nenhuma tarefa neste filtro'}
          </p>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">
            {tasks.length === 0
              ? 'Crie uma tarefa rápida, mesmo que seja só um título. Você pode relacionar a um projeto ou canal depois.'
              : 'Tente outro filtro ou limpe a busca.'}
          </p>
          {tasks.length === 0 ? (
            <Button className="mt-5" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
              Criar primeira tarefa
            </Button>
          ) : null}
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((task) => {
            const due = dueDateLabel(task.dueDate)
            const dueState = dueDateState(task.dueDate)
            const openPath = relatedOpenPath(task)
            const completed = task.status === 'completed'
            return (
              <Card key={task.id} padding="sm" className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => void toggleStatus(task)}
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                    completed
                      ? 'border-accent bg-accent text-black'
                      : 'border-border bg-card-2 hover:border-accent/60',
                  )}
                  aria-label={completed ? 'Reabrir tarefa' : 'Marcar como concluída'}
                >
                  {completed ? <span className="text-[11px] font-bold">✓</span> : null}
                </button>
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      'text-sm font-medium',
                      completed ? 'text-muted line-through' : 'text-text',
                    )}
                  >
                    {task.title}
                  </div>
                  {task.description ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">{task.description}</p>
                  ) : null}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-2">
                    <span>{TASK_CATEGORY_LABEL[task.category]}</span>
                    <span>•</span>
                    <span>{completed ? 'Concluída' : TASK_PRIORITY_LABEL[task.priority]}</span>
                    {due ? (
                      <>
                        <span>•</span>
                        <span
                          className={cn(
                            dueState === 'overdue' && !completed && 'font-medium text-danger',
                            dueState === 'today' && !completed && 'font-medium text-warning',
                          )}
                        >
                          {due}
                        </span>
                      </>
                    ) : null}
                    {task.relatedName ? (
                      <>
                        <span>•</span>
                        <span>{task.relatedName}</span>
                      </>
                    ) : null}
                  </div>
                  {openPath && task.relatedType ? (
                    <button
                      type="button"
                      onClick={() => navigate(openPath)}
                      className="mt-2 text-xs font-medium text-accent hover:underline"
                    >
                      {task.relatedType === 'channel' ? 'Abrir canal' : 'Abrir projeto'}
                    </button>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(task)}
                    className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-text"
                    aria-label="Editar tarefa"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(task)}
                    className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-danger"
                    aria-label="Excluir tarefa"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <TaskEditorModal
        open={modalOpen}
        editing={Boolean(editing)}
        form={form}
        relatedOptions={relatedOptions}
        relatedTypeOptions={taskRelatedTypeOptions(capabilities)}
        saving={saving}
        onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
        onClose={() => setModalOpen(false)}
        onSubmit={() => void save()}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Excluir tarefa"
        message={
          deleting
            ? `Excluir “${deleting.title}”? Essa ação não pode ser desfeita.`
            : ''
        }
        confirmLabel="Excluir"
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleting(null)}
      />
    </PageShell>
  )
}