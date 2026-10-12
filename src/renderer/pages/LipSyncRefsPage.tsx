import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, Copy, FolderPlus, ImagePlus, Library, Pencil, Trash2 } from 'lucide-react'
import type { LipSyncRef } from '@shared/lipSyncRefs'
import type { CustomPrompt } from '@shared/quickPrompts'
import type { Channel, Project } from '@shared/types'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/Modal'
import { SavedPromptPicker } from '../components/SavedPromptPicker'
import {
  EMPTY_PROJECT_FORM,
  ProjectEditorModal,
  type ProjectFormValues,
} from '../components/ProjectEditorModal'
import { getAtlasApi } from '../lib/api'
import { useToast } from '../components/Toast'
import { environmentBreadcrumb } from '../lib/environments'
import { notifyProjectsChanged } from '../lib/projectEvents'
import { notifyVideosChanged } from '../lib/videoEvents'
import { cn } from '../lib/utils'

type Draft = {
  label: string
  prompt: string
  projectId: string
}

const FILTER_ALL = '__all__'
const FILTER_NONE = '__none__'

export function LipSyncRefsPage() {
  const api = getAtlasApi()
  const { push, pushError } = useToast()
  const [items, setItems] = useState<LipSyncRef[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [filterChannelId, setFilterChannelId] = useState(FILTER_ALL)
  const [filterProjectId, setFilterProjectId] = useState(FILTER_ALL)
  const [attachProjectId, setAttachProjectId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [editorOpen, setEditorOpen] = useState(false)
  const [projectForm, setProjectForm] = useState<ProjectFormValues>(EMPTY_PROJECT_FORM)
  const [projectSaving, setProjectSaving] = useState(false)
  const [pickerItemId, setPickerItemId] = useState<string | null>(null)

  const projectsInFilter = useMemo(() => {
    if (filterChannelId === FILTER_ALL) return projects
    return projects.filter((project) => project.channelId === filterChannelId)
  }, [filterChannelId, projects])

  const listFilters = useMemo(() => {
    if (filterProjectId === FILTER_NONE) return { unassignedOnly: true as const, status: 'active' as const }
    if (filterProjectId === FILTER_ALL) return { status: 'active' as const }
    return { projectId: filterProjectId, status: 'active' as const }
  }, [filterProjectId])

  const refresh = useCallback(async () => {
    const [list, projectList, channelList] = await Promise.all([
      api.lipSyncRefs.list(listFilters),
      api.projects.list({ projectType: 'music' }),
      api.channels.list({ channelType: 'music' }),
    ])
    setProjects(projectList)
    setChannels(channelList)

    const channelProjectIds =
      filterChannelId === FILTER_ALL
        ? null
        : new Set(
            projectList
              .filter((project) => project.channelId === filterChannelId)
              .map((project) => project.id),
          )

    const scoped =
      filterProjectId === FILTER_ALL && channelProjectIds
        ? list.filter((item) => item.projectId && channelProjectIds.has(item.projectId))
        : list

    setItems(scoped)
    setDrafts(
      Object.fromEntries(
        scoped.map((item) => [
          item.id,
          {
            label: item.label,
            prompt: item.prompt,
            projectId: item.projectId ?? '',
          },
        ]),
      ),
    )

    const attachPool =
      filterChannelId === FILTER_ALL
        ? projectList
        : projectList.filter((project) => project.channelId === filterChannelId)

    setAttachProjectId((current) => {
      if (current && attachPool.some((project) => project.id === current)) return current
      if (filterProjectId !== FILTER_ALL && filterProjectId !== FILTER_NONE) {
        if (attachPool.some((project) => project.id === filterProjectId)) return filterProjectId
      }
      return attachPool[0]?.id ?? ''
    })
  }, [api, filterChannelId, filterProjectId, listFilters])

  useEffect(() => {
    setLoading(true)
    void refresh()
      .catch((error) => pushError(error, 'Não foi possível carregar as referências.'))
      .finally(() => setLoading(false))
  }, [pushError, refresh])

  function openCreateProject() {
    setProjectForm({
      ...EMPTY_PROJECT_FORM,
      channelId: filterChannelId !== FILTER_ALL ? filterChannelId : '',
      publicationTitle: '',
    })
    setEditorOpen(true)
  }

  async function saveNewProject() {
    if (!projectForm.name.trim()) {
      push('Informe o nome do projeto.', 'error')
      return
    }
    if (projectForm.scheduledDate && !projectForm.channelId) {
      push('Escolha um canal para agendar a publicação.', 'error')
      return
    }
    setProjectSaving(true)
    try {
      const created = await api.projects.create({
        name: projectForm.name.trim(),
        description: projectForm.description.trim(),
        projectType: 'music',
        channelId: projectForm.channelId || null,
      })

      if (projectForm.channelId && projectForm.scheduledDate) {
        await api.videos.create({
          channelId: projectForm.channelId,
          title: (projectForm.publicationTitle.trim() || projectForm.name).trim(),
          description: projectForm.publicationDescription,
          thumbnailPath: '',
          scheduledDate: projectForm.scheduledDate,
          status: projectForm.publicationStatus,
          projectId: created.id,
        })
        notifyVideosChanged()
      }

      notifyProjectsChanged()
      setEditorOpen(false)
      setProjectForm(EMPTY_PROJECT_FORM)
      if (projectForm.channelId) setFilterChannelId(projectForm.channelId)
      setFilterProjectId(created.id)
      setAttachProjectId(created.id)
      push(
        projectForm.channelId && projectForm.scheduledDate
          ? 'Projeto criado e publicação agendada.'
          : 'Projeto criado.',
        'success',
      )
    } catch (error) {
      pushError(error, 'Não foi possível criar o projeto.')
    } finally {
      setProjectSaving(false)
    }
  }

  async function addImages() {
    const projectId =
      filterProjectId !== FILTER_ALL && filterProjectId !== FILTER_NONE
        ? filterProjectId
        : attachProjectId
    if (!projectId) {
      push('Selecione um projeto no filtro para vincular as imagens.')
      return
    }
    setBusy(true)
    try {
      const paths = await api.dialog.selectImages()
      if (paths.length === 0) return
      await api.lipSyncRefs.createMany(paths, projectId)
      await refresh()
      push(
        paths.length === 1 ? 'Imagem adicionada.' : `${paths.length} imagens adicionadas.`,
        'success',
      )
    } catch (error) {
      pushError(error, 'Não foi possível anexar as imagens.')
    } finally {
      setBusy(false)
    }
  }

  function itemLeavesCurrentFilter(projectId: string | null | undefined) {
    if (filterProjectId === FILTER_NONE) return Boolean(projectId)
    if (filterProjectId !== FILTER_ALL) return projectId !== filterProjectId
    if (filterChannelId === FILTER_ALL) return false
    if (!projectId) return true
    return !projects.some(
      (project) => project.id === projectId && project.channelId === filterChannelId,
    )
  }

  async function saveItem(id: string) {
    const draft = drafts[id]
    if (!draft) return
    try {
      const updated = await api.lipSyncRefs.update(id, {
        label: draft.label,
        prompt: draft.prompt,
        projectId: draft.projectId || null,
      })
      if (!updated) return
      if (itemLeavesCurrentFilter(updated.projectId)) {
        setItems((current) => current.filter((item) => item.id !== id))
        setDrafts((current) => {
          const next = { ...current }
          delete next[id]
          return next
        })
        return
      }
      setItems((current) => current.map((item) => (item.id === id ? updated : item)))
      setDrafts((current) => ({
        ...current,
        [id]: {
          label: updated.label,
          prompt: updated.prompt,
          projectId: updated.projectId ?? '',
        },
      }))
    } catch (error) {
      pushError(error, 'Não foi possível salvar.')
    }
  }

  async function removeItem(id: string) {
    setBusy(true)
    try {
      await api.lipSyncRefs.remove(id)
      setItems((current) => current.filter((item) => item.id !== id))
      setDrafts((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
    } catch (error) {
      pushError(error, 'Não foi possível remover.')
    } finally {
      setBusy(false)
    }
  }

  async function applySavedPrompt(prompt: CustomPrompt) {
    const id = pickerItemId
    if (!id) return
    const draft = drafts[id]
    const item = items.find((entry) => entry.id === id)
    if (!draft && !item) return
    const next: Draft = {
      label: draft?.label ?? item?.label ?? '',
      prompt: prompt.text,
      projectId: draft?.projectId ?? item?.projectId ?? '',
    }
    setPickerItemId(null)
    setDrafts((current) => ({ ...current, [id]: next }))
    try {
      const updated = await api.lipSyncRefs.update(id, {
        label: next.label,
        prompt: next.prompt,
        projectId: next.projectId || null,
      })
      if (!updated) return
      if (itemLeavesCurrentFilter(updated.projectId)) {
        setItems((current) => current.filter((entry) => entry.id !== id))
        setDrafts((current) => {
          const following = { ...current }
          delete following[id]
          return following
        })
        return
      }
      setItems((current) => current.map((entry) => (entry.id === id ? updated : entry)))
      setDrafts((current) => ({
        ...current,
        [id]: {
          label: updated.label,
          prompt: updated.prompt,
          projectId: updated.projectId ?? '',
        },
      }))
      push(`“${prompt.name}” aplicado nesta imagem.`, 'success')
    } catch (error) {
      pushError(error, 'Não foi possível aplicar o prompt salvo.')
    }
  }

  async function copyPrompt(id: string) {
    const text = drafts[id]?.prompt?.trim() || items.find((item) => item.id === id)?.prompt || ''
    if (!text) {
      push('Prompt vazio.')
      return
    }
    try {
      await api.system.copyText(text)
      push('Prompt copiado.', 'success')
    } catch (error) {
      pushError(error, 'Não foi possível copiar.')
    }
  }

  const projectOptions = projectsInFilter

  const finishProjectId = useMemo(() => {
    if (filterProjectId !== FILTER_ALL && filterProjectId !== FILTER_NONE) return filterProjectId
    if (items.length === 0) return null
    const first = items[0]?.projectId
    if (!first) return null
    return items.every((item) => item.projectId === first) ? first : null
  }, [filterProjectId, items])

  const finishProject = finishProjectId
    ? projects.find((project) => project.id === finishProjectId) ?? null
    : null
  const canFinishProject = Boolean(finishProjectId) && items.length > 0

  async function archiveProjectRefs() {
    if (!finishProjectId) {
      push('Selecione um projeto (ou deixe só refs do mesmo projeto) para salvar.')
      return
    }
    setBusy(true)
    try {
      const archived = await api.lipSyncRefs.archiveByProject(finishProjectId)
      notifyProjectsChanged()
      await refresh()
      push(
        archived.length === 1
          ? 'Salvo na pasta do projeto. A referência saiu da fila.'
          : `${archived.length} referências salvas na pasta do projeto e removidas da fila.`,
        'success',
      )
    } catch (error) {
      pushError(error, 'Não foi possível salvar as referências no projeto.')
    } finally {
      setBusy(false)
    }
  }

  async function discardProjectRefs() {
    if (!finishProjectId) return
    setBusy(true)
    try {
      const removed = await api.lipSyncRefs.removeByProject(finishProjectId)
      setDiscardOpen(false)
      await refresh()
      push(
        removed === 1
          ? 'Referência de lipsync descartada.'
          : `${removed} referências de lipsync descartadas.`,
        'success',
      )
    } catch (error) {
      pushError(error, 'Não foi possível descartar as referências.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageShell className="flex min-h-0 flex-col">
      <PageHeader
        breadcrumb={environmentBreadcrumb('music', 'Lipsync')}
        title="Lipsync"
        subtitle="Imagens do cantor ou da banda vinculadas a um projeto, com o prompt de lipsync colado embaixo."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted" htmlFor="lipsync-channel-filter">
            Filtrar por canal
          </label>
          <select
            id="lipsync-channel-filter"
            value={filterChannelId}
            onChange={(event) => {
              const next = event.target.value
              setFilterChannelId(next)
              setFilterProjectId((current) => {
                if (current === FILTER_ALL || current === FILTER_NONE) return current
                const project = projects.find((entry) => entry.id === current)
                if (!project) return FILTER_ALL
                if (next !== FILTER_ALL && project.channelId !== next) return FILTER_ALL
                return current
              })
            }}
            className="h-9 min-w-[12rem] rounded-xl border border-border bg-card-2 px-3 text-xs text-text focus:border-accent/60 focus:outline-none"
          >
            <option value={FILTER_ALL}>Todos</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted" htmlFor="lipsync-project-filter">
            Filtrar por projeto
          </label>
          <select
            id="lipsync-project-filter"
            value={filterProjectId}
            onChange={(event) => {
              const next = event.target.value
              setFilterProjectId(next)
              if (next !== FILTER_ALL && next !== FILTER_NONE) setAttachProjectId(next)
            }}
            className="h-9 min-w-[12rem] rounded-xl border border-border bg-card-2 px-3 text-xs text-text focus:border-accent/60 focus:outline-none"
          >
            <option value={FILTER_ALL}>Todos</option>
            <option value={FILTER_NONE}>Sem projeto</option>
            {projectOptions.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canFinishProject ? (
            <>
              <Button
                type="button"
                variant="secondary"
                className="shrink-0"
                icon={<Archive className="h-4 w-4" />}
                disabled={busy}
                onClick={() => void archiveProjectRefs()}
              >
                Salvar e limpar fila
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="shrink-0"
                icon={<Trash2 className="h-4 w-4" />}
                disabled={busy}
                onClick={() => setDiscardOpen(true)}
              >
                Descartar
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            className="shrink-0"
            icon={<FolderPlus className="h-4 w-4" />}
            onClick={openCreateProject}
          >
            Novo projeto
          </Button>
          <Button
            type="button"
            className="shrink-0"
            icon={<ImagePlus className="h-4 w-4" />}
            disabled={busy || !attachProjectId}
            onClick={() => void addImages()}
          >
            Anexar imagens
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-muted">Carregando…</p>
      ) : projects.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card-2/40 px-6 py-16 text-center">
          <p className="text-sm font-medium text-text">Crie um projeto de música primeiro</p>
          <p className="mt-1 max-w-md text-sm text-muted">
            Escolha o canal, preencha título e descrição e, se quiser, já agenda a publicação.
          </p>
          <Button
            type="button"
            className="mt-5"
            icon={<FolderPlus className="h-4 w-4" />}
            onClick={openCreateProject}
          >
            Novo projeto
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card-2/40 px-6 py-16 text-center">
          <p className="text-sm font-medium text-text">Nenhuma referência neste filtro</p>
          <p className="mt-1 max-w-md text-sm text-muted">
            Escolha o canal e o projeto acima e anexe fotos do cantor ou da banda. O prompt fica
            colado embaixo de cada imagem. Ao terminar, use Salvar e limpar fila ou Descartar.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              variant="secondary"
              icon={<FolderPlus className="h-4 w-4" />}
              onClick={openCreateProject}
            >
              Novo projeto
            </Button>
            <Button
              type="button"
              icon={<ImagePlus className="h-4 w-4" />}
              disabled={busy || !attachProjectId}
              onClick={() => void addImages()}
            >
              Anexar imagens
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {items.map((item) => {
            const draft = drafts[item.id] ?? {
              label: item.label,
              prompt: item.prompt,
              projectId: item.projectId ?? '',
            }
            const dirty =
              draft.label !== item.label ||
              draft.prompt !== item.prompt ||
              draft.projectId !== (item.projectId ?? '')
            return (
              <article
                key={item.id}
                className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card-2"
              >
                <div className="relative aspect-[3/4] w-full bg-black/30">
                  {item.imageDataUrl ? (
                    <img
                      src={item.imageDataUrl}
                      alt={draft.label || 'Referência lipsync'}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted">
                      Imagem indisponível
                    </div>
                  )}
                </div>

                <div className="border-t border-border bg-bg/40">
                  <select
                    value={draft.projectId}
                    onChange={(event) => {
                      const projectId = event.target.value
                      setDrafts((current) => ({
                        ...current,
                        [item.id]: { ...draft, projectId },
                      }))
                      void api.lipSyncRefs
                        .update(item.id, {
                          label: draft.label,
                          prompt: draft.prompt,
                          projectId: projectId || null,
                        })
                        .then((updated) => {
                          if (!updated) return
                          if (itemLeavesCurrentFilter(updated.projectId)) {
                            setItems((current) => current.filter((entry) => entry.id !== item.id))
                            setDrafts((current) => {
                              const next = { ...current }
                              delete next[item.id]
                              return next
                            })
                            return
                          }
                          setItems((current) =>
                            current.map((entry) => (entry.id === item.id ? updated : entry)),
                          )
                          setDrafts((current) => ({
                            ...current,
                            [item.id]: {
                              label: updated.label,
                              prompt: updated.prompt,
                              projectId: updated.projectId ?? '',
                            },
                          }))
                        })
                        .catch((error) => pushError(error, 'Não foi possível vincular o projeto.'))
                    }}
                    className="w-full border-b border-border/70 bg-transparent px-2.5 py-1.5 text-[11px] font-medium text-text focus:outline-none"
                    title="Projeto vinculado"
                  >
                    <option value="">Sem projeto</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1.5 border-b border-border/70 px-2.5 py-1.5">
                    <input
                      value={draft.label}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [item.id]: { ...draft, label: event.target.value },
                        }))
                      }
                      onBlur={() => {
                        if (dirty) void saveItem(item.id)
                      }}
                      placeholder="Nome (cantor, banda, ângulo…)"
                      className="min-w-0 flex-1 bg-transparent text-[11px] font-medium text-text placeholder:text-muted-2 focus:outline-none focus:ring-0"
                      title="Editar nome da imagem"
                    />
                    <Pencil className="h-3 w-3 shrink-0 text-muted-2" aria-hidden />
                  </label>
                  <div className="flex items-center justify-between gap-2 px-2.5 pt-1.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-2">
                      Prompt
                    </span>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-accent transition-colors hover:bg-accent/10"
                      onClick={() => setPickerItemId(item.id)}
                    >
                      <Library className="h-3 w-3" />
                      Usar salvo
                    </button>
                  </div>
                  <label className="relative block">
                    <textarea
                      value={draft.prompt}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [item.id]: { ...draft, prompt: event.target.value },
                        }))
                      }
                      onBlur={() => {
                        if (dirty) void saveItem(item.id)
                      }}
                      rows={3}
                      placeholder="Prompt de lipsync para esta imagem…"
                      className="min-h-[4.5rem] w-full resize-y bg-transparent px-2.5 py-2 pr-7 text-xs leading-relaxed text-text placeholder:text-muted-2 focus:outline-none"
                      title="Editar prompt"
                    />
                    <Pencil
                      className="pointer-events-none absolute right-2 top-2 h-3 w-3 text-muted-2"
                      aria-hidden
                    />
                  </label>
                  <div className="flex items-center gap-0.5 border-t border-border/70 px-1.5 py-1">
                    <button
                      type="button"
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-medium text-muted transition-colors hover:bg-white/5 hover:text-text"
                      onClick={() => void copyPrompt(item.id)}
                    >
                      <Copy className="h-3 w-3" />
                      Copiar
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'inline-flex items-center justify-center rounded-lg px-1.5 py-1 text-[10px] font-medium transition-colors',
                        dirty ? 'text-accent hover:bg-accent/10' : 'text-muted-2',
                      )}
                      disabled={!dirty}
                      onClick={() => void saveItem(item.id)}
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-lg p-1 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                      aria-label="Remover"
                      disabled={busy}
                      onClick={() => void removeItem(item.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <ProjectEditorModal
        open={editorOpen}
        projectType="music"
        channels={channels}
        editing={null}
        form={projectForm}
        saving={projectSaving}
        allowScheduleOnCreate
        onChange={(patch) => setProjectForm((current) => ({ ...current, ...patch }))}
        onClose={() => {
          setEditorOpen(false)
          setProjectForm(EMPTY_PROJECT_FORM)
        }}
        onSubmit={() => void saveNewProject()}
      />

      <SavedPromptPicker
        open={pickerItemId !== null}
        onClose={() => setPickerItemId(null)}
        onPick={(prompt) => void applySavedPrompt(prompt)}
      />

      <ConfirmDialog
        open={discardOpen}
        title="Descartar referências de lipsync?"
        message={
          finishProject
            ? `As imagens e prompts de lipsync de “${finishProject.name}” serão apagados da fila. O projeto de música continua.`
            : 'As imagens e prompts de lipsync deste projeto serão apagados da fila. O projeto de música continua.'
        }
        confirmLabel="Descartar"
        onConfirm={() => void discardProjectRefs()}
        onClose={() => setDiscardOpen(false)}
      />
    </PageShell>
  )
}
