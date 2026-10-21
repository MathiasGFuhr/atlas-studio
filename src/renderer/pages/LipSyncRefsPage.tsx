import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  Check,
  Copy,
  FolderPlus,
  ImagePlus,
  LayoutGrid,
  Library,
  Mic2,
  MoreHorizontal,
  Plus,
  Replace,
  Search,
  Trash2,
  Users,
} from 'lucide-react'
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

function isDirty(item: LipSyncRef, draft: Draft): boolean {
  return (
    draft.label !== item.label ||
    draft.prompt !== item.prompt ||
    draft.lyrics !== item.lyrics ||
    draft.projectId !== (item.projectId ?? '')
  )
}

function sceneNumber(index: number): string {
  return String(index + 1).padStart(2, '0')
}

const TEXT_SOFT_LIMIT = 2000

type SceneMenuState = {
  id: string
  top: number
  left: number
  flip: boolean
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

function countClass(length: number): string {
  return length > TEXT_SOFT_LIMIT ? 'text-warning' : 'text-muted-2'
}

function SceneThumb({ src, alt, eager = false }: { src: string | null; alt: string; eager?: boolean }) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
        className="h-full w-full object-cover"
      />
    )
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-bg/30 text-muted-2">
      <ImagePlus className="h-4 w-4" aria-hidden />
    </div>
  )
}

type SceneRowProps = {
  item: LipSyncRef
  number: string
  name: string
  selected: boolean
  onSelect: (id: string) => void
  onOpenMenu: (id: string, anchor: HTMLButtonElement) => void
}

/** Memoizada: editar o prompt de uma cena não re-renderiza as demais linhas. */
const SceneListRow = memo(function SceneListRow({
  item,
  number,
  name,
  selected,
  onSelect,
  onOpenMenu,
}: SceneRowProps) {
  return (
    <li id={`lipsync-scene-${item.id}`}>
      <div
        className={cn(
          'flex items-center gap-1 rounded-xl border px-1.5 py-1.5',
          selected ? 'border-accent bg-accent/10' : 'border-transparent hover:bg-hover',
        )}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          aria-current={selected ? 'true' : undefined}
          onClick={() => onSelect(item.id)}
        >
          <div className="h-14 w-11 shrink-0 overflow-hidden rounded-md bg-bg/40">
            <SceneThumb src={item.imageDataUrl} alt={name} />
          </div>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-1.5">
              <span
                className={cn(
                  'text-[11px] font-semibold tabular-nums',
                  selected ? 'text-accent' : 'text-muted-2',
                )}
              >
                {number}
              </span>
              <span className="truncate text-xs font-medium text-text">{name}</span>
            </span>
            <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted">
              {item.subject === 'band' ? (
                <Users className="h-3 w-3" aria-hidden />
              ) : (
                <Mic2 className="h-3 w-3" aria-hidden />
              )}
              {LIPSYNC_SUBJECT_LABEL[item.subject]}
            </span>
          </span>
        </button>
        <button
          type="button"
          data-scene-menu-button
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-text"
          aria-label={`Opções da cena ${number}`}
          onClick={(event) => onOpenMenu(item.id, event.currentTarget)}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
    </li>
  )
})

const StoryboardItem = memo(function StoryboardItem({
  item,
  number,
  name,
  selected,
  width,
  onSelect,
}: Omit<SceneRowProps, 'onOpenMenu'> & { width: number }) {
  return (
    <button
      id={`lipsync-board-${item.id}`}
      type="button"
      className="shrink-0 text-left"
      style={{ width }}
      onClick={() => onSelect(item.id)}
    >
      <div
        className={cn(
          'aspect-[3/4] overflow-hidden rounded-lg border-2 bg-bg/40',
          selected ? 'border-accent' : 'border-transparent',
        )}
      >
        <SceneThumb src={item.imageDataUrl} alt={name} />
      </div>
      <p className="mt-1 truncate text-[10px] text-muted">
        <span className={cn('mr-1 font-semibold', selected ? 'text-accent' : 'text-muted-2')}>
          {number}
        </span>
        {name}
      </p>
    </button>
  )
})

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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [thumbSize, setThumbSize] = useState(96)
  const [menu, setMenu] = useState<SceneMenuState | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const storyboardRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const itemsRef = useRef(items)
  const draftsRef = useRef(drafts)
  itemsRef.current = items
  draftsRef.current = drafts
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

  const refreshSeq = useRef(0)
  const pushErrorRef = useRef(pushError)
  pushErrorRef.current = pushError

  const refresh = useCallback(async () => {
    const seq = ++refreshSeq.current
    const pending = itemsRef.current.filter((item) => {
      const draft = draftsRef.current[item.id]
      return Boolean(draft && isDirty(item, draft))
    })
    await Promise.all(
      pending.map((item) => {
        const draft = draftsRef.current[item.id]
        return api.lipSyncRefs.update(item.id, {
          label: draft.label,
          prompt: draft.prompt,
          lyrics: draft.lyrics,
          projectId: draft.projectId || null,
        })
      }),
    )

    const [list, projectList, channelList] = await Promise.all([
      api.lipSyncRefs.list(listFilters),
      api.projects.list({ projectType: 'music' }),
      api.channels.list({ channelType: 'music' }),
    ])
    // Trocas rápidas de filtro: só a resposta mais recente pode aplicar estado.
    if (seq !== refreshSeq.current) return
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
    setDrafts((current) =>
      Object.fromEntries(
        scoped.map((item) => {
          const previous = current[item.id]
          if (previous && isDirty(item, previous)) return [item.id, previous]
          return [item.id, toDraft(item)]
        }),
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
    let active = true
    setLoading(true)
    void refresh()
      .catch((error) => {
        if (active) pushError(error, 'Não foi possível carregar as referências.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [pushError, refresh])

  useEffect(() => {
    return () => {
      const pending = itemsRef.current.filter((item) => {
        const draft = draftsRef.current[item.id]
        return Boolean(draft && isDirty(item, draft))
      })
      for (const item of pending) {
        const draft = draftsRef.current[item.id]
        if (!draft) continue
        void api.lipSyncRefs
          .update(item.id, {
            label: draft.label,
            prompt: draft.prompt,
            lyrics: draft.lyrics,
            projectId: draft.projectId || null,
          })
          .catch((error) =>
            pushErrorRef.current(error, 'Não foi possível salvar uma cena de lipsync ao sair da tela.'),
          )
      }
    }
  }, [api])

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
        subject: 'singer',
      })
      await refresh()
      setQuery('')
      setSelectedId(created.id)
      setFocusSceneId(created.id)
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
      const created = await api.lipSyncRefs.createMany(paths, projectId, 'singer')
      await refresh()
      setQuery('')
      if (created[0]) {
        setSelectedId(created[0].id)
        setFocusSceneId(created[0].id)
      }
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

  async function saveItem(id: string): Promise<boolean> {
    const draft = drafts[id]
    if (!draft) return false
    try {
      const updated = await api.lipSyncRefs.update(id, {
        label: draft.label,
        prompt: draft.prompt,
        lyrics: draft.lyrics,
        projectId: draft.projectId || null,
      })
      if (!updated) return false
      if (itemLeavesCurrentFilter(updated.projectId)) {
        setItems((current) => current.filter((item) => item.id !== id))
        setDrafts((current) => {
          const next = { ...current }
          delete next[id]
          return next
        })
        return true
      }
      setItems((current) => current.map((item) => (item.id === id ? updated : item)))
      setDrafts((current) => ({
        ...current,
        [id]: toDraft(updated),
      }))
      return true
    } catch (error) {
      pushError(error, 'Não foi possível salvar.')
      return false
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

  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return items
    return items.filter((item) => {
      const draft = drafts[item.id]
      const label = (draft?.label ?? item.label).trim()
      const haystack = [
        label || 'Cena sem nome',
        draft?.prompt ?? item.prompt,
        draft?.lyrics ?? item.lyrics,
        item.projectName ?? '',
        LIPSYNC_SUBJECT_LABEL[item.subject],
      ]
        .join('\n')
        .toLowerCase()
      return haystack.includes(term)
    })
  }, [drafts, items, query])

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
  const canArchiveProject =
    Boolean(finishProjectId) && items.some((item) => item.projectId === finishProjectId)
  const canDiscardProject =
    Boolean(finishProjectId) && items.some((item) => item.projectId === finishProjectId)

  const indexById = useMemo(() => new Map(items.map((item, index) => [item.id, index])), [items])

  const selectedItem = filteredItems.find((item) => item.id === selectedId) ?? null
  const selectedDraft = selectedItem ? (drafts[selectedItem.id] ?? toDraft(selectedItem)) : null
  const selectedDirty = Boolean(selectedItem && selectedDraft && isDirty(selectedItem, selectedDraft))
  const selectedNumber =
    selectedItem === null ? '' : sceneNumber(indexById.get(selectedItem.id) ?? 0)
  const menuItem = menu ? (items.find((item) => item.id === menu.id) ?? null) : null

  useEffect(() => {
    setSelectedId((current) => {
      if (filteredItems.length === 0) return null
      if (current && filteredItems.some((item) => item.id === current)) return current
      return filteredItems[0]?.id ?? null
    })
  }, [filteredItems])

  useEffect(() => {
    if (!menu) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (menuRef.current?.contains(target)) return
      if (target instanceof Element && target.closest('[data-scene-menu-button]')) return
      setMenu(null)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenu(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  useEffect(() => {
    if (!selectedId) return
    document.getElementById(`lipsync-board-${selectedId}`)?.scrollIntoView({
      inline: 'nearest',
      block: 'nearest',
    })
  }, [selectedId])

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
        if (!isDirty(item, draft)) continue
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
      pushError(error, 'Não foi possível mudar o tipo da cena.')
    }
  }

  async function discardProjectRefs() {
    if (!finishProjectId) return
    setBusy(true)
    try {
      const removed = await api.lipSyncRefs.removeByProject(finishProjectId)
      setDiscardOpen(false)
      await refresh()
      push(removed === 1 ? 'Cena descartada.' : `${removed} cenas descartadas.`, 'success')
    } catch (error) {
      pushError(error, 'Não foi possível descartar as referências.')
    } finally {
      setBusy(false)
    }
  }

  function discardDraft(id: string) {
    const item = items.find((entry) => entry.id === id)
    if (!item) return
    setDrafts((current) => ({ ...current, [id]: toDraft(item) }))
  }

  function patchDraft(id: string, patch: Partial<Draft>) {
    setDrafts((current) => {
      const item = items.find((entry) => entry.id === id)
      const base = current[id] ?? (item ? toDraft(item) : null)
      if (!base) return current
      return { ...current, [id]: { ...base, ...patch } }
    })
  }

  async function selectScene(id: string) {
    if (id === selectedId) {
      setMenu(null)
      return
    }
    if (selectedId) {
      const currentItem = items.find((entry) => entry.id === selectedId)
      const draft = drafts[selectedId]
      if (currentItem && draft && isDirty(currentItem, draft)) {
        const saved = await saveItem(selectedId)
        if (!saved) return
      }
    }
    setMenu(null)
    setSelectedId(id)
    setFocusSceneId(id)
  }

  function openSceneMenu(id: string, anchor: HTMLButtonElement) {
    if (menu?.id === id) {
      setMenu(null)
      return
    }
    const rect = anchor.getBoundingClientRect()
    const flip = rect.bottom + 112 > window.innerHeight
    setMenu({
      id,
      top: flip ? rect.top - 4 : rect.bottom + 4,
      left: rect.right,
      flip,
    })
  }

  const selectSceneRef = useRef(selectScene)
  const openSceneMenuRef = useRef(openSceneMenu)
  selectSceneRef.current = selectScene
  openSceneMenuRef.current = openSceneMenu
  const handleSelectScene = useCallback((id: string) => void selectSceneRef.current(id), [])
  const handleOpenSceneMenu = useCallback(
    (id: string, anchor: HTMLButtonElement) => openSceneMenuRef.current(id, anchor),
    [],
  )

  function showAllScenes() {
    setQuery('')
    setThumbSize(72)
    storyboardRef.current?.scrollTo({ left: 0, behavior: 'smooth' })
  }

  const toolbarButtonClass = 'h-9 px-3 py-0 text-xs'

  return (
    <PageShell scroll={false} className="flex min-h-0 flex-col">
      <PageHeader
        className="mb-4 shrink-0"
        breadcrumb={environmentBreadcrumb('music', 'Lipsync')}
        title="Lipsync"
        subtitle="Separe as cenas do cantor e da banda. Cada cena pode começar pela imagem, pelo prompt de lipsync ou pelo trecho da música."
      />

      {loading ? (
        <p className="flex flex-1 items-center justify-center text-sm text-muted">Carregando…</p>
      ) : projects.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-elevated/40 px-6 py-16 text-center">
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
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
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
                className="h-9 min-w-[9.5rem] rounded-xl border border-border bg-elevated px-3 text-xs text-text focus:border-accent/60 focus:outline-none"
              >
                <option value={FILTER_ALL}>Todos</option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
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
                className="h-9 min-w-[9.5rem] rounded-xl border border-border bg-elevated px-3 text-xs text-text focus:border-accent/60 focus:outline-none"
              >
                <option value={FILTER_ALL}>Todos</option>
                <option value={FILTER_NONE}>Sem projeto</option>
                {projectOptions.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                title="Novo projeto"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-elevated text-muted transition-colors hover:text-text"
                onClick={openCreateProject}
              >
                <FolderPlus className="h-4 w-4" />
              </button>
            </div>
            <div className="relative min-w-[10rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar cenas..."
                aria-label="Buscar cenas"
                className="h-9 w-full rounded-xl border border-border bg-elevated pl-9 pr-3 text-xs text-text placeholder:text-muted-2 focus:border-accent/60 focus:outline-none"
              />
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                className={toolbarButtonClass}
                icon={<Archive className="h-3.5 w-3.5" />}
                disabled={busy || !canArchiveProject}
                title={
                  canArchiveProject
                    ? 'Salva e remove as cenas do cantor e da banda deste projeto'
                    : 'Filtre um projeto para salvar a fila'
                }
                onClick={() => void archiveProjectRefs()}
              >
                Salvar e limpar fila
              </Button>
              <Button
                type="button"
                variant="secondary"
                className={toolbarButtonClass}
                icon={<Trash2 className="h-3.5 w-3.5" />}
                disabled={busy || !canDiscardProject}
                title={
                  canDiscardProject
                    ? 'Apaga as cenas deste projeto da fila'
                    : 'Filtre um projeto para descartar a fila'
                }
                onClick={() => setDiscardOpen(true)}
              >
                Descartar
              </Button>
              <Button
                type="button"
                className={toolbarButtonClass}
                icon={<Plus className="h-3.5 w-3.5" />}
                disabled={busy || !canCreateScene()}
                onClick={() => void addScene()}
              >
                Nova cena
              </Button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 gap-3">
            <aside className="flex w-[272px] shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
                <h2 className="text-sm font-semibold text-text">
                  Cenas{' '}
                  <span className="font-medium text-muted">({filteredItems.length})</span>
                </h2>
                <button
                  type="button"
                  title="Anexar imagens"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-text disabled:opacity-50"
                  disabled={busy || !canCreateScene()}
                  onClick={() => void addImages()}
                >
                  <ImagePlus className="h-4 w-4" />
                </button>
              </div>
              <div
                className="min-h-0 flex-1 overflow-y-auto p-2"
                onScroll={() => setMenu(null)}
              >
                {filteredItems.length === 0 ? (
                  <p className="px-2 py-8 text-center text-xs leading-relaxed text-muted">
                    {items.length === 0
                      ? 'Nenhuma cena nesta fila. Crie a primeira pela imagem, pelo prompt ou pelo trecho.'
                      : 'Nenhuma cena encontrada.'}
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {filteredItems.map((item) => (
                      <SceneListRow
                        key={item.id}
                        item={item}
                        number={sceneNumber(indexById.get(item.id) ?? 0)}
                        name={(drafts[item.id]?.label ?? item.label).trim() || 'Cena sem nome'}
                        selected={item.id === selectedId}
                        onSelect={handleSelectScene}
                        onOpenMenu={handleOpenSceneMenu}
                      />
                    ))}
                  </ul>
                )}
              </div>
              <div className="border-t border-border p-2">
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-accent/40 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
                  disabled={busy || !canCreateScene()}
                  onClick={() => void addScene()}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar cena
                </button>
              </div>
            </aside>

            <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card">
              {selectedItem && selectedDraft ? (
                <>
                  <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
                    <h2 className="text-sm font-semibold text-text">Editar cena</h2>
                    <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-xs font-semibold text-accent">
                      #{selectedNumber}
                    </span>
                  </div>
                  <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 xl:grid-cols-[minmax(220px,0.9fr)_minmax(0,1.1fr)] xl:overflow-hidden">
                    <div className="flex min-h-[220px] flex-col">
                      <p className="mb-2 text-xs font-medium text-muted">Imagem da cena</p>
                      <div className="relative min-h-[200px] flex-1 overflow-hidden rounded-xl bg-bg/40">
                        {selectedItem.imageDataUrl ? (
                          <SceneThumb
                            src={selectedItem.imageDataUrl}
                            alt={selectedDraft.label || 'Cena de lipsync'}
                            eager
                          />
                        ) : selectedItem.imagePath ? (
                          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted">
                            Imagem indisponível
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-muted transition-colors hover:bg-hover hover:text-text disabled:opacity-50"
                            disabled={busy}
                            onClick={() => void replaceImage(selectedItem.id)}
                          >
                            <ImagePlus className="h-6 w-6" />
                            Adicionar imagem
                          </button>
                        )}
                        {selectedItem.imagePath ? (
                          <div className="absolute inset-x-0 bottom-3 flex justify-center">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 rounded-lg bg-overlay/70 px-3 py-1.5 text-xs font-semibold text-text backdrop-blur-sm transition-colors hover:bg-overlay/85 disabled:opacity-50"
                              disabled={busy}
                              onClick={() => void replaceImage(selectedItem.id)}
                            >
                              <Replace className="h-3.5 w-3.5" />
                              Substituir
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex min-h-0 flex-col gap-3 xl:overflow-y-auto xl:pr-1">
                      <div>
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <label className="text-xs font-medium text-muted" htmlFor="lipsync-scene-name">
                            {selectedItem.subject === 'band' ? 'Banda' : 'Cantor'}
                          </label>
                          {selectedItem.subject === 'singer' ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-text"
                              onClick={() => void changeSubject(selectedItem.id, 'band')}
                            >
                              <Plus className="h-3 w-3" />
                              Adicionar banda (opcional)
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="text-xs text-muted transition-colors hover:text-text"
                              onClick={() => void changeSubject(selectedItem.id, 'singer')}
                            >
                              Marcar como cantor
                            </button>
                          )}
                        </div>
                        <input
                          id="lipsync-scene-name"
                          value={selectedDraft.label}
                          onChange={(event) => patchDraft(selectedItem.id, { label: event.target.value })}
                          placeholder={selectedItem.subject === 'band' ? 'Nome da banda' : 'Nome do cantor'}
                          spellCheck={false}
                          className="h-10 w-full rounded-xl border border-border bg-bg/50 px-3 text-sm text-text placeholder:text-muted-2 focus:border-accent/60 focus:outline-none"
                        />
                      </div>

                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-muted">Projeto</span>
                        <select
                          value={selectedDraft.projectId}
                          onChange={(event) =>
                            patchDraft(selectedItem.id, { projectId: event.target.value })
                          }
                          className="h-10 w-full rounded-xl border border-border bg-bg/50 px-3 text-sm text-text focus:border-accent/60 focus:outline-none"
                        >
                          <option value="">Sem projeto</option>
                          {projects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="flex min-h-[8.5rem] flex-1 flex-col">
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-muted">Prompt de lipsync desta cena</span>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-accent transition-colors hover:text-accent-hover"
                            onClick={() => setPickerItemId(selectedItem.id)}
                          >
                            <Library className="h-3.5 w-3.5" />
                            Usar salvo
                          </button>
                        </div>
                        <textarea
                          value={selectedDraft.prompt}
                          onChange={(event) => patchDraft(selectedItem.id, { prompt: event.target.value })}
                          placeholder="Cantando com emoção, olhar para a câmera, iluminação cinematográfica…"
                          spellCheck={false}
                          className="min-h-[7.5rem] w-full flex-1 resize-y rounded-xl border border-border bg-bg/50 px-3 py-2 text-sm leading-relaxed text-text placeholder:text-muted-2 focus:border-accent/60 focus:outline-none"
                        />
                        <p className={cn('mt-1 text-right text-[10px] tabular-nums', countClass(selectedDraft.prompt.length))}>
                          {selectedDraft.prompt.length}/{TEXT_SOFT_LIMIT}
                        </p>
                      </div>

                      <div className="flex min-h-[8.5rem] flex-1 flex-col">
                        <span className="mb-1.5 block text-xs font-medium text-muted">
                          Trecho da música desta cena
                        </span>
                        <textarea
                          value={selectedDraft.lyrics}
                          onChange={(event) => patchDraft(selectedItem.id, { lyrics: event.target.value })}
                          placeholder="Trecho da música desta cena…"
                          spellCheck={false}
                          className="min-h-[7.5rem] w-full flex-1 resize-y rounded-xl border border-border bg-bg/50 px-3 py-2 text-sm leading-relaxed text-text placeholder:text-muted-2 focus:border-accent/60 focus:outline-none"
                        />
                        <p className={cn('mt-1 text-right text-[10px] tabular-nums', countClass(selectedDraft.lyrics.length))}>
                          {selectedDraft.lyrics.length}/{TEXT_SOFT_LIMIT}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-border px-4 py-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 justify-self-start rounded-lg px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-hover hover:text-text"
                      onClick={() => void copyPrompt(selectedItem.id)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copiar cena
                    </button>
                    <Button
                      type="button"
                      className="h-9 px-3 py-0 text-xs"
                      icon={<Check className="h-3.5 w-3.5" />}
                      disabled={!selectedDirty}
                      onClick={() => {
                        void saveItem(selectedItem.id).then((ok) => {
                          if (ok) push('Alterações salvas.', 'success')
                        })
                      }}
                    >
                      Salvar alterações
                    </Button>
                    <button
                      type="button"
                      className="justify-self-end rounded-lg px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-hover hover:text-text disabled:opacity-40"
                      disabled={!selectedDirty}
                      title="Descartar alterações desta cena"
                      onClick={() => discardDraft(selectedItem.id)}
                    >
                      Descartar
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                  <p className="text-sm font-medium text-text">
                    {query.trim() ? 'Nenhuma cena com essa busca' : 'Nenhuma cena selecionada'}
                  </p>
                  <p className="mt-1 max-w-sm text-sm text-muted">
                    Crie a cena e comece pela imagem, pelo prompt de lipsync ou pelo trecho da música.
                  </p>
                  <Button
                    type="button"
                    className="mt-5"
                    icon={<Plus className="h-4 w-4" />}
                    disabled={busy || !canCreateScene()}
                    onClick={() => void addScene()}
                  >
                    Nova cena
                  </Button>
                </div>
              )}
            </section>
          </div>

          <section className="mt-3 shrink-0 rounded-2xl border border-border bg-card px-3 py-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-text">Storyboard da música</h2>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-muted-2">
                  <span className="sr-only">Tamanho das miniaturas</span>
                  <Search className="h-3.5 w-3.5" aria-hidden />
                  <input
                    type="range"
                    min={72}
                    max={120}
                    value={thumbSize}
                    onChange={(event) => setThumbSize(Number(event.target.value))}
                    className="w-24 accent-accent"
                  />
                </label>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-hover hover:text-text"
                  onClick={showAllScenes}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Visualizar todas
                </button>
              </div>
            </div>
            <div ref={storyboardRef} className="flex items-start gap-2 overflow-x-auto pb-1">
              {filteredItems.map((item) => (
                <StoryboardItem
                  key={item.id}
                  item={item}
                  number={sceneNumber(indexById.get(item.id) ?? 0)}
                  name={(drafts[item.id]?.label ?? item.label).trim() || 'Sem nome'}
                  selected={item.id === selectedId}
                  width={thumbSize}
                  onSelect={handleSelectScene}
                />
              ))}
              <button
                type="button"
                className="flex shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-[10px] font-medium text-muted transition-colors hover:border-accent/40 hover:text-text disabled:opacity-50"
                style={{ width: thumbSize, height: Math.round(thumbSize * (4 / 3)) }}
                disabled={busy || !canCreateScene()}
                onClick={() => void addScene()}
              >
                <Plus className="h-4 w-4" />
                Nova cena
              </button>
            </div>
          </section>
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
        onPick={(prompts) => void applySavedPrompt(prompts)}
      />

      <ConfirmDialog
        open={discardOpen}
        title="Descartar cenas de lipsync?"
        message={
          finishProject
            ? `As cenas de “${finishProject.name}” serão apagadas da fila. O projeto de música continua.`
            : 'As cenas deste projeto serão apagadas da fila. O projeto de música continua.'
        }
        confirmLabel="Descartar"
        onConfirm={() => void discardProjectRefs()}
        onClose={() => setDiscardOpen(false)}
      />

      {menu && menuItem ? (
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-50 min-w-[11.5rem] rounded-xl border border-border-soft bg-elevated py-1 shadow-popover"
          style={{
            top: menu.top,
            left: menu.left,
            transform: menu.flip ? 'translate(-100%, -100%)' : 'translateX(-100%)',
          }}
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text hover:bg-hover"
            onClick={() => {
              const next = menuItem.subject === 'singer' ? 'band' : 'singer'
              setMenu(null)
              void changeSubject(menuItem.id, next)
            }}
          >
            {menuItem.subject === 'singer' ? <Users className="h-3.5 w-3.5" /> : <Mic2 className="h-3.5 w-3.5" />}
            {menuItem.subject === 'singer' ? 'Marcar como banda' : 'Marcar como cantor'}
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-danger hover:bg-danger/10"
            disabled={busy}
            onClick={() => {
              const id = menuItem.id
              setMenu(null)
              void removeItem(id)
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Excluir cena
          </button>
        </div>
      ) : null}
    </PageShell>
  )
}
