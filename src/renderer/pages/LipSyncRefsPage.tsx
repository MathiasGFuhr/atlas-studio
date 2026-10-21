import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, Copy, FolderPlus, ImagePlus, Library, Mic2, Pencil, Plus, Replace, Trash2, Users } from 'lucide-react'
import type { LipSyncRef, LipSyncSubject } from '@shared/lipSyncRefs'
import { LIPSYNC_SUBJECT_LABEL } from '@shared/lipSyncRefs'
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
  lyrics: string
  projectId: string
}

function toDraft(source: {
  label: string
  prompt: string
  lyrics?: string
  projectId: string | null
}): Draft {
  return {
    label: source.label,
    prompt: source.prompt,
    lyrics: source.lyrics ?? '',
    projectId: source.projectId ?? '',
  }
}

function savedQueueMessage(archived: Array<{ subject: LipSyncSubject }>): string {
  const singer = archived.filter((item) => item.subject === 'singer').length
  const band = archived.filter((item) => item.subject === 'band').length
  const parts: string[] = []
  if (singer > 0) parts.push(singer === 1 ? '1 cena do cantor' : `${singer} cenas do cantor`)
  if (band > 0) parts.push(band === 1 ? '1 cena da banda' : `${band} cenas da banda`)
  const summary = parts.join(' e ') || 'Cenas'
  const plural = archived.length !== 1
  return `${summary} ${plural ? 'salvas' : 'salva'} na pasta do projeto e ${plural ? 'removidas' : 'removida'} da fila.`
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
  const [activeSubject, setActiveSubject] = useState<LipSyncSubject>('singer')
  const [attachProjectId, setAttachProjectId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [editorOpen, setEditorOpen] = useState(false)
  const [projectForm, setProjectForm] = useState<ProjectFormValues>(EMPTY_PROJECT_FORM)
  const [projectSaving, setProjectSaving] = useState(false)
  const [pickerItemId, setPickerItemId] = useState<string | null>(null)
  const [focusSceneId, setFocusSceneId] = useState<string | null>(null)

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
        scoped.map((item) => [item.id, toDraft(item)]),
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

  useEffect(() => {
    if (!focusSceneId) return
    const node = document.getElementById(`lipsync-scene-${focusSceneId}`)
    if (!node) return
    node.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    setFocusSceneId(null)
  }, [focusSceneId, items])

  function currentProjectId() {
    if (filterProjectId === FILTER_NONE) return ''
    if (filterProjectId !== FILTER_ALL) return filterProjectId
    return attachProjectId
  }

  function canCreateScene() {
    return filterProjectId === FILTER_NONE || Boolean(currentProjectId())
  }

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

  async function addScene() {
    const projectId = currentProjectId()
    if (!projectId && filterProjectId !== FILTER_NONE) {
      push('Selecione um projeto no filtro para criar a cena.')
      return
    }
    setBusy(true)
    try {
      const created = await api.lipSyncRefs.create({
        projectId: projectId || null,
        subject: activeSubject,
      })
      setFocusSceneId(created.id)
      await refresh()
      push('Cena criada.', 'success')
    } catch (error) {
      pushError(error, 'Não foi possível criar a cena.')
    } finally {
      setBusy(false)
    }
  }

  async function addImages() {
    const projectId = currentProjectId()
    if (!projectId && filterProjectId !== FILTER_NONE) {
      push('Selecione um projeto no filtro para vincular as imagens.')
      return
    }
    setBusy(true)
    try {
      const paths = await api.dialog.selectImages()
      if (paths.length === 0) return
      await api.lipSyncRefs.createMany(paths, projectId, activeSubject)
      await refresh()
      const phrase = activeSubject === 'singer' ? 'do cantor' : 'da banda'
      push(
        paths.length === 1 ? `Imagem ${phrase} adicionada.` : `${paths.length} imagens ${phrase} adicionadas.`,
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
        lyrics: draft.lyrics,
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
        [id]: toDraft(updated),
      }))
    } catch (error) {
      pushError(error, 'Não foi possível salvar.')
    }
  }

  async function replaceImage(id: string) {
    const draft = drafts[id]
    const item = items.find((entry) => entry.id === id)
    if (!draft && !item) return
    setBusy(true)
    try {
      const file = await api.dialog.selectImage()
      if (!file) return
      const updated = await api.lipSyncRefs.update(id, {
        imagePath: file,
        label: draft?.label ?? item?.label ?? '',
        prompt: draft?.prompt ?? item?.prompt ?? '',
        lyrics: draft?.lyrics ?? item?.lyrics ?? '',
        projectId: (draft?.projectId ?? item?.projectId) || null,
      })
      if (!updated) return
      if (itemLeavesCurrentFilter(updated.projectId)) {
        setItems((current) => current.filter((entry) => entry.id !== id))
        setDrafts((current) => {
          const next = { ...current }
          delete next[id]
          return next
        })
        return
      }
      setItems((current) => current.map((entry) => (entry.id === id ? updated : entry)))
      setDrafts((current) => ({
        ...current,
        [id]: toDraft(updated),
      }))
      push(item?.imagePath ? 'Imagem trocada.' : 'Imagem adicionada.', 'success')
    } catch (error) {
      pushError(error, 'Não foi possível trocar a imagem.')
    } finally {
      setBusy(false)
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

  async function applySavedPrompt(prompts: CustomPrompt[]) {
    const id = pickerItemId
    if (!id || prompts.length === 0) return
    const draft = drafts[id]
    const item = items.find((entry) => entry.id === id)
    if (!draft && !item) return
    const next: Draft = {
      label: draft?.label ?? item?.label ?? '',
      prompt: prompts
        .map((prompt) => prompt.text.trim())
        .filter(Boolean)
        .join('\n\n'),
      lyrics: draft?.lyrics ?? item?.lyrics ?? '',
      projectId: draft?.projectId ?? item?.projectId ?? '',
    }
    setPickerItemId(null)
    setDrafts((current) => ({ ...current, [id]: next }))
    try {
      const updated = await api.lipSyncRefs.update(id, {
        label: next.label,
        prompt: next.prompt,
        lyrics: next.lyrics,
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
        [id]: toDraft(updated),
      }))
      push(
        prompts.length === 1
          ? `“${prompts[0]?.name ?? 'Prompt'}” aplicado nesta cena.`
          : `${prompts.length} prompts aplicados nesta cena.`,
        'success',
      )
    } catch (error) {
      pushError(error, 'Não foi possível aplicar o prompt salvo.')
    }
  }

  async function copyPrompt(id: string) {
    const draft = drafts[id]
    const item = items.find((entry) => entry.id === id)
    const prompt = (draft?.prompt ?? item?.prompt ?? '').trim()
    const lyrics = (draft?.lyrics ?? item?.lyrics ?? '').trim()
    const text = [prompt, lyrics].filter(Boolean).join('\n\n')
    if (!text) {
      push('Prompt e trecho vazios.')
      return
    }
    try {
      await api.system.copyText(text)
      const message =
        prompt && lyrics ? 'Prompt e trecho copiados.' : lyrics ? 'Trecho copiado.' : 'Prompt copiado.'
      push(message, 'success')
    } catch (error) {
      pushError(error, 'Não foi possível copiar.')
    }
  }

  const projectOptions = projectsInFilter

  const visibleItems = useMemo(
    () => items.filter((item) => item.subject === activeSubject),
    [activeSubject, items],
  )

  const subjectCounts = useMemo(
    () => ({
      singer: items.filter((item) => item.subject === 'singer').length,
      band: items.filter((item) => item.subject === 'band').length,
    }),
    [items],
  )

  const finishProjectId = useMemo(() => {
    if (filterProjectId !== FILTER_ALL && filterProjectId !== FILTER_NONE) return filterProjectId
    const pool = visibleItems.length > 0 ? visibleItems : items
    if (pool.length === 0) return null
    const first = pool[0]?.projectId
    if (!first) return null
    return pool.every((item) => item.projectId === first) ? first : null
  }, [filterProjectId, items, visibleItems])

  const finishProject = finishProjectId
    ? projects.find((project) => project.id === finishProjectId) ?? null
    : null
  const canArchiveProject =
    Boolean(finishProjectId) && items.some((item) => item.projectId === finishProjectId)
  const canDiscardProject = Boolean(finishProjectId) && visibleItems.length > 0
  const subjectPhrase = activeSubject === 'singer' ? 'do cantor' : 'da banda'

  async function archiveProjectRefs() {
    if (!finishProjectId) {
      push('Selecione um projeto (ou deixe só refs do mesmo projeto) para salvar.')
      return
    }
    setBusy(true)
    try {
      const pending = items.filter((item) => item.projectId === finishProjectId)
      for (const item of pending) {
        const draft = drafts[item.id]
        if (!draft) continue
        const dirty =
          draft.label !== item.label ||
          draft.prompt !== item.prompt ||
          draft.lyrics !== item.lyrics ||
          draft.projectId !== (item.projectId ?? '')
        if (!dirty) continue
        await api.lipSyncRefs.update(item.id, {
          label: draft.label,
          prompt: draft.prompt,
          lyrics: draft.lyrics,
          projectId: draft.projectId || null,
        })
      }

      const archived = await api.lipSyncRefs.archiveByProject(finishProjectId)
      notifyProjectsChanged()
      await refresh()
      push(savedQueueMessage(archived), 'success')
    } catch (error) {
      pushError(error, 'Não foi possível salvar as referências no projeto.')
    } finally {
      setBusy(false)
    }
  }

  async function changeSubject(id: string, nextSubject: LipSyncSubject) {
    const draft = drafts[id]
    const item = items.find((entry) => entry.id === id)
    if (!item || item.subject === nextSubject) return
    try {
      const updated = await api.lipSyncRefs.update(id, {
        label: draft?.label ?? item.label,
        prompt: draft?.prompt ?? item.prompt,
        lyrics: draft?.lyrics ?? item.lyrics,
        projectId: (draft?.projectId ?? item.projectId) || null,
        subject: nextSubject,
      })
      if (!updated) return
      if (itemLeavesCurrentFilter(updated.projectId)) {
        setItems((current) => current.filter((entry) => entry.id !== id))
        setDrafts((current) => {
          const next = { ...current }
          delete next[id]
          return next
        })
        return
      }
      setItems((current) => current.map((entry) => (entry.id === id ? updated : entry)))
      setDrafts((current) => ({
        ...current,
        [id]: toDraft(updated),
      }))
    } catch (error) {
      pushError(error, 'Não foi possível mover a cena de aba.')
    }
  }

  async function discardProjectRefs() {
    if (!finishProjectId) return
    setBusy(true)
    try {
      const removed = await api.lipSyncRefs.removeByProject(finishProjectId, activeSubject)
      setDiscardOpen(false)
      await refresh()
      push(
        removed === 1
          ? `Cena ${subjectPhrase} descartada.`
          : `${removed} cenas ${subjectPhrase} descartadas.`,
        'success',
      )
    } catch (error) {
      pushError(error, 'Não foi possível descartar as referências.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageShell scroll={false} className="flex min-h-0 flex-col">
      <PageHeader
        breadcrumb={environmentBreadcrumb('music', 'Lipsync')}
        title="Lipsync"
        subtitle="Separe as cenas do cantor e da banda. Cada cena pode começar pela imagem, pelo prompt de lipsync ou pelo trecho da música."
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
          {canArchiveProject ? (
            <Button
              type="button"
              variant="secondary"
              className="shrink-0"
              icon={<Archive className="h-4 w-4" />}
              disabled={busy}
              title="Salva e remove as cenas do cantor e da banda deste projeto"
              onClick={() => void archiveProjectRefs()}
            >
              Salvar e limpar fila
            </Button>
          ) : null}
          {canDiscardProject ? (
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
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Cantor ou banda"
        className="mb-4 inline-flex rounded-xl border border-border bg-card-2 p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeSubject === 'singer'}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
            activeSubject === 'singer' ? 'bg-accent-dark text-accent' : 'text-muted hover:text-text',
          )}
          onClick={() => setActiveSubject('singer')}
        >
          <Mic2 className="h-3.5 w-3.5" />
          Cantor
          {subjectCounts.singer > 0 ? (
            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] tabular-nums">
              {subjectCounts.singer}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeSubject === 'band'}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
            activeSubject === 'band' ? 'bg-accent-dark text-accent' : 'text-muted hover:text-text',
          )}
          onClick={() => setActiveSubject('band')}
        >
          <Users className="h-3.5 w-3.5" />
          Banda
          {subjectCounts.band > 0 ? (
            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] tabular-nums">
              {subjectCounts.band}
            </span>
          ) : null}
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <div className="h-full overflow-y-auto pb-16">

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
      ) : visibleItems.length === 0 ? (
        <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card-2/40 px-6 py-16 text-center">
          <p className="text-sm font-medium text-text">Nenhuma cena {subjectPhrase} neste filtro</p>
          <p className="mt-1 max-w-md text-sm text-muted">
            Crie a cena e comece pela imagem, pelo prompt de lipsync ou pelo trecho da música. A
            imagem pode entrar depois.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              icon={<Plus className="h-4 w-4" />}
              disabled={busy || !canCreateScene()}
              onClick={() => void addScene()}
            >
              Nova cena
            </Button>
            <Button
              type="button"
              variant="secondary"
              icon={<ImagePlus className="h-4 w-4" />}
              disabled={busy || !canCreateScene()}
              onClick={() => void addImages()}
            >
              Anexar imagem
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
          {visibleItems.map((item) => {
            const draft = drafts[item.id] ?? toDraft(item)
            const dirty =
              draft.label !== item.label ||
              draft.prompt !== item.prompt ||
              draft.lyrics !== item.lyrics ||
              draft.projectId !== (item.projectId ?? '')
            return (
              <article
                id={`lipsync-scene-${item.id}`}
                key={item.id}
                className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card-2"
              >
                <div className="group/photo relative aspect-[3/4] w-full overflow-hidden bg-black/30">
                  {item.imageDataUrl ? (
                    <img
                      src={item.imageDataUrl}
                      alt={draft.label || 'Cena de lipsync'}
                      className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover/photo:scale-110"
                    />
                  ) : item.imagePath ? (
                    <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted">
                      Imagem indisponível
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center text-xs text-muted transition-colors hover:bg-white/5 hover:text-text disabled:opacity-50"
                      disabled={busy}
                      onClick={() => void replaceImage(item.id)}
                    >
                      <ImagePlus className="h-5 w-5" />
                      Adicionar imagem
                    </button>
                  )}
                  <select
                    value={item.subject}
                    aria-label="Mover entre cantor e banda"
                    title="Mover para a outra aba"
                    onChange={(event) => {
                      const next = event.target.value === 'band' ? 'band' : 'singer'
                      void changeSubject(item.id, next)
                    }}
                    className="absolute left-1.5 top-1.5 z-10 max-w-[calc(100%-0.75rem)] rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm focus:outline-none"
                  >
                    <option value="singer">{LIPSYNC_SUBJECT_LABEL.singer}</option>
                    <option value="band">{LIPSYNC_SUBJECT_LABEL.band}</option>
                  </select>
                  {item.imagePath ? (
                    <button
                      type="button"
                      className="absolute bottom-1.5 right-1.5 z-10 inline-flex items-center gap-1 rounded-lg bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm transition-colors hover:bg-black/85 disabled:opacity-50"
                      disabled={busy}
                      title="Trocar imagem"
                      onClick={() => void replaceImage(item.id)}
                    >
                      <Replace className="h-3 w-3" />
                      Trocar
                    </button>
                  ) : null}
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
                          lyrics: draft.lyrics,
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
                            [item.id]: toDraft(updated),
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
                      placeholder={activeSubject === 'singer' ? 'Nome do cantor' : 'Nome da banda'}
                      className="min-w-0 flex-1 bg-transparent text-[11px] font-medium text-text placeholder:text-muted-2 focus:outline-none focus:ring-0"
                      title="Editar nome da cena"
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
                      rows={2}
                      placeholder="Prompt de lipsync desta cena…"
                      className="min-h-[3.25rem] w-full resize-y bg-transparent px-2.5 py-1.5 pr-7 text-xs leading-relaxed text-text placeholder:text-muted-2 focus:outline-none"
                      title="Editar prompt"
                    />
                    <Pencil
                      className="pointer-events-none absolute right-2 top-2 h-3 w-3 text-muted-2"
                      aria-hidden
                    />
                  </label>
                  <div className="flex items-center justify-between gap-2 border-t border-border/70 px-2.5 pt-1.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-2">
                      Trecho
                    </span>
                  </div>
                  <label className="relative block">
                    <textarea
                      value={draft.lyrics}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [item.id]: { ...draft, lyrics: event.target.value },
                        }))
                      }
                      onBlur={() => {
                        if (dirty) void saveItem(item.id)
                      }}
                      rows={2}
                      placeholder="Trecho da música desta cena…"
                      className="min-h-[3.25rem] w-full resize-y bg-transparent px-2.5 py-1.5 pr-7 text-xs leading-relaxed text-text placeholder:text-muted-2 focus:outline-none"
                      title="Trecho da música"
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
        </div>
        {projects.length > 0 && visibleItems.length > 0 ? (
          <div className="pointer-events-none absolute bottom-3 right-16 z-20 flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="pointer-events-auto shadow-[0_10px_28px_rgba(0,0,0,0.4)]"
              icon={<ImagePlus className="h-4 w-4" />}
              disabled={busy || !canCreateScene()}
              onClick={() => void addImages()}
            >
              Anexar imagem
            </Button>
            <Button
              type="button"
              className="pointer-events-auto shadow-[0_10px_28px_rgba(0,0,0,0.4)]"
              icon={<Plus className="h-4 w-4" />}
              disabled={busy || !canCreateScene()}
              onClick={() => void addScene()}
            >
              Nova cena
            </Button>
          </div>
        ) : null}
      </div>

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
        onPick={(prompts) => void applySavedPrompt(prompts)}
      />

      <ConfirmDialog
        open={discardOpen}
        title="Descartar cenas de lipsync?"
        message={
          finishProject
            ? `As cenas ${subjectPhrase} de “${finishProject.name}” serão apagadas da fila. A outra aba e o projeto de música continuam.`
            : `As cenas ${subjectPhrase} deste projeto serão apagadas da fila. A outra aba e o projeto de música continuam.`
        }
        confirmLabel="Descartar"
        onConfirm={() => void discardProjectRefs()}
        onClose={() => setDiscardOpen(false)}
      />
    </PageShell>
  )
}
