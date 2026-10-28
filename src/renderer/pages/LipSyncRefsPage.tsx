import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Clapperboard,
  Copy,
  FolderInput,
  FolderPlus,
  ImagePlus,
  LayoutGrid,
  Library,
  Mic2,
  MoreHorizontal,
  Music2,
  Plus,
  Replace,
  Search,
  Trash2,
  Users,
} from 'lucide-react'
import type { LipSyncFolderScan, LipSyncRef, LipSyncSubject } from '@shared/lipSyncRefs'
import { LIPSYNC_SUBJECT_LABEL, comfyDurationSeconds } from '@shared/lipSyncRefs'
import type { CustomPrompt } from '@shared/quickPrompts'
import type { Channel, Project } from '@shared/types'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { Button } from '../components/Button'
import { ConfirmDialog, Modal } from '../components/Modal'
import { SavedPromptPicker } from '../components/SavedPromptPicker'
import { ComfyBatchModal } from '../components/lipsync/ComfyBatchModal'
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

function formatSeconds(value: number): string {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`
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
            <SceneThumb src={item.imageThumbUrl ?? item.imageDataUrl} alt={name} />
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
              {item.audioDuration !== null ? (
                <span className="ml-1.5 inline-flex items-center gap-0.5 tabular-nums" title="Áudio da cena">
                  <Music2 className="h-3 w-3" aria-hidden />
                  {formatSeconds(item.audioDuration)}
                </span>
              ) : null}
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
        <SceneThumb src={item.imageThumbUrl ?? item.imageDataUrl} alt={name} />
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

export function LipSyncRefsPage() {
  const api = getAtlasApi()
  const { push, pushError } = useToast()
  const [items, setItems] = useState<LipSyncRef[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [attachProjectId, setAttachProjectId] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [thumbSize, setThumbSize] = useState(96)
  const [menu, setMenu] = useState<SceneMenuState | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const storyboardRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [folderImport, setFolderImport] = useState<LipSyncFolderScan | null>(null)
  const [comfyOpen, setComfyOpen] = useState(false)
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
      api.lipSyncRefs.list({ status: 'active' }),
      api.projects.list({ projectType: 'music' }),
      api.channels.list({ channelType: 'music' }),
    ])
    // Recargas concorrentes: só a resposta mais recente pode aplicar estado.
    if (seq !== refreshSeq.current) return
    setProjects(projectList)
    setChannels(channelList)

    setItems(list)
    setDrafts((current) =>
      Object.fromEntries(
        list.map((item) => {
          const previous = current[item.id]
          if (previous && isDirty(item, previous)) return [item.id, previous]
          return [item.id, toDraft(item)]
        }),
      ),
    )

    setAttachProjectId((current) => {
      if (current && projectList.some((project) => project.id === current)) return current
      return projectList[0]?.id ?? ''
    })
  }, [api])

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

  /** Nova cena entra no projeto da cena aberta; senão no projeto da fila; senão no primeiro projeto. */
  function currentProjectId() {
    const selected = selectedId ? items.find((item) => item.id === selectedId) : undefined
    const fromSelected = selected ? (drafts[selected.id]?.projectId ?? selected.projectId ?? '') : ''
    return fromSelected || items.find((item) => item.projectId)?.projectId || attachProjectId
  }

  function canCreateScene() {
    return Boolean(currentProjectId())
  }

  function openCreateProject() {
    setProjectForm({ ...EMPTY_PROJECT_FORM, publicationTitle: '' })
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
      setAttachProjectId(created.id)
      await refresh()
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
    if (!projectId) {
      push('Crie um projeto de música para criar a cena.')
      return
    }
    setBusy(true)
    try {
      const created = await api.lipSyncRefs.create({
        projectId,
        subject: 'singer',
      })
      await refresh()
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
    if (!projectId) {
      push('Crie um projeto de música para anexar as imagens.')
      return
    }
    setBusy(true)
    try {
      const paths = await api.dialog.selectImages()
      if (paths.length === 0) return
      const created = await api.lipSyncRefs.createMany(paths, projectId, 'singer')
      await refresh()
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

  /** Cenas da pasta que já têm a imagem ou o áudio que seria substituído. */
  function countFolderConflicts(scan: LipSyncFolderScan): number {
    const numbers = new Set<number>()
    for (const match of scan.matches) {
      if (items[match.number - 1]?.imagePath.trim()) numbers.add(match.number)
    }
    for (const audio of scan.audios) {
      if (items[audio.number - 1]?.audioPath.trim()) numbers.add(audio.number)
    }
    return numbers.size
  }

  function countFolderScenes(scan: LipSyncFolderScan): number {
    const lastScene = Math.max(items.length, scan.matches[scan.matches.length - 1]?.number ?? 0)
    const audios = scan.audios.filter((audio) => audio.number <= lastScene)
    return new Set([...scan.matches, ...audios].map((entry) => entry.number)).size
  }

  /** O usuário sempre escolhe a pasta; a do projeto só serve de ponto de partida no diálogo. */
  async function importFromFolder() {
    const projectId = currentProjectId()
    if (!projectId) {
      push('Crie um projeto de música para puxar as imagens.')
      return
    }
    const project = projects.find((entry) => entry.id === projectId)
    const linked =
      project?.projectFolderPath && project.folderExists !== false ? project.projectFolderPath : ''
    setBusy(true)
    try {
      const folder = await api.dialog.selectFolder({
        title: 'Pasta com as imagens e áudios da música',
        defaultPath: linked || undefined,
      })
      if (!folder) return
      const scan = await api.lipSyncRefs.scanFolder(folder)
      if (!linked && project) {
        await api.projects.update(project.id, { projectFolderPath: scan.folder })
        notifyProjectsChanged()
      }
      if (scan.matches.length === 0 && scan.audios.length === 0) {
        push(
          `Nenhuma imagem ou áudio com nome só de número (1.png, 1.mp3…) em ${scan.folder}.`,
          'error',
        )
        return
      }
      if (countFolderConflicts(scan) > 0) {
        setFolderImport(scan)
        return
      }
      await applyFolderImport(scan, true)
    } catch (error) {
      pushError(error, 'Não foi possível ler a pasta.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * Imagem e áudio N vão para a cena N. Imagens além da fila criam cenas, inclusive vazias, para
   * manter a numeração; áudios nunca criam cena.
   */
  async function applyFolderImport(scan: LipSyncFolderScan, replaceExisting: boolean) {
    setFolderImport(null)
    const projectId = currentProjectId() || null
    const queue = itemsRef.current
    const scenes = [...queue]
    const byNumber = new Map(scan.matches.map((match) => [match.number, match]))
    const lastNumber = scan.matches[scan.matches.length - 1]?.number ?? 0
    const withoutScene: string[] = []
    let applied = 0
    let audiosApplied = 0
    let kept = 0
    let keptAudios = 0
    let created = 0
    const failed: string[] = []
    setBusy(true)
    try {
      for (const match of scan.matches) {
        const item = queue[match.number - 1]
        if (!item) continue
        if (item.imagePath.trim() && !replaceExisting) {
          kept += 1
          continue
        }
        const draft = draftsRef.current[item.id]
        try {
          await api.lipSyncRefs.update(item.id, {
            imagePath: match.path,
            label: draft?.label ?? item.label,
            prompt: draft?.prompt ?? item.prompt,
            lyrics: draft?.lyrics ?? item.lyrics,
            projectId: (draft?.projectId ?? item.projectId) || null,
          })
          applied += 1
        } catch {
          failed.push(match.fileName)
        }
      }

      for (let number = queue.length + 1; number <= lastNumber; number += 1) {
        const match = byNumber.get(number)
        try {
          scenes.push(
            await api.lipSyncRefs.create({ projectId, subject: 'singer', imagePath: match?.path }),
          )
          if (match) applied += 1
          created += 1
        } catch {
          // Parar aqui: seguir criaria as próximas cenas com o número errado.
          failed.push(match?.fileName ?? `cena ${sceneNumber(number - 1)}`)
          break
        }
      }

      for (const audio of scan.audios) {
        const item = scenes[audio.number - 1]
        if (!item) {
          withoutScene.push(audio.fileName)
          continue
        }
        if (item.audioPath.trim() && !replaceExisting) {
          keptAudios += 1
          continue
        }
        try {
          await api.lipSyncRefs.setAudio(item.id, audio.path)
          audiosApplied += 1
        } catch {
          failed.push(audio.fileName)
        }
      }

      await refresh()

      const parts: string[] = []
      if (scan.matches.length > 0) {
        parts.push(applied === 1 ? '1 imagem aplicada' : `${applied} imagens aplicadas`)
      }
      if (scan.audios.length > 0) {
        parts.push(audiosApplied === 1 ? '1 áudio aplicado' : `${audiosApplied} áudios aplicados`)
      }
      if (created > 0) parts.push(created === 1 ? '1 cena criada' : `${created} cenas criadas`)
      if (kept > 0) parts.push(kept === 1 ? '1 card com imagem mantido' : `${kept} cards com imagem mantidos`)
      if (keptAudios > 0) {
        parts.push(keptAudios === 1 ? '1 card com áudio mantido' : `${keptAudios} cards com áudio mantidos`)
      }
      if (withoutScene.length > 0) parts.push(`sem cena: ${withoutScene.join(', ')}`)
      const ignored = [...scan.ignored, ...scan.ignoredAudios]
      if (ignored.length > 0) {
        const shown = ignored.slice(0, 5).join(', ')
        const extra = ignored.length > 5 ? ` e mais ${ignored.length - 5}` : ''
        parts.push(`ignorados: ${shown}${extra}`)
      }
      push(`${parts.join(' · ')}.`, 'success')
      if (failed.length > 0) {
        push(`Não foi possível importar: ${failed.join(', ')}.`, 'error')
      }
    } catch (error) {
      pushError(error, 'Não foi possível puxar as imagens e áudios da pasta.')
    } finally {
      setBusy(false)
    }
  }

  async function removeAudio(id: string) {
    setBusy(true)
    try {
      const updated = await api.lipSyncRefs.setAudio(id, '')
      if (updated) {
        setItems((current) => current.map((item) => (item.id === id ? updated : item)))
      }
      push('Áudio removido da cena.', 'success')
    } catch (error) {
      pushError(error, 'Não foi possível remover o áudio.')
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

  const indexById = useMemo(() => new Map(items.map((item, index) => [item.id, index])), [items])

  const selectedItem = items.find((item) => item.id === selectedId) ?? null
  const selectedDraft = selectedItem ? (drafts[selectedItem.id] ?? toDraft(selectedItem)) : null
  const selectedDirty = Boolean(selectedItem && selectedDraft && isDirty(selectedItem, selectedDraft))
  const selectedNumber =
    selectedItem === null ? '' : sceneNumber(indexById.get(selectedItem.id) ?? 0)
  const menuItem = menu ? (items.find((item) => item.id === menu.id) ?? null) : null

  useEffect(() => {
    setSelectedId((current) => {
      if (items.length === 0) return null
      if (current && items.some((item) => item.id === current)) return current
      return items[0]?.id ?? null
    })
  }, [items])

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
      setItems((current) => current.map((entry) => (entry.id === id ? updated : entry)))
      setDrafts((current) => ({
        ...current,
        [id]: toDraft(updated),
      }))
    } catch (error) {
      pushError(error, 'Não foi possível mudar o tipo da cena.')
    }
  }

  /** Apaga de vez as cenas da fila (imagem, prompt e trecho). Nada é salvo no projeto. */
  async function clearQueue() {
    const ids = itemsRef.current.map((item) => item.id)
    setClearOpen(false)
    if (ids.length === 0) return
    setBusy(true)
    try {
      const results = await Promise.allSettled(ids.map((id) => api.lipSyncRefs.remove(id)))
      const failed = results.filter((result) => result.status === 'rejected')
      // Sem isso o refresh tentaria gravar rascunhos de cenas que acabaram de ser apagadas.
      itemsRef.current = []
      draftsRef.current = {}
      setItems([])
      setDrafts({})
      await refresh()
      if (failed.length > 0) {
        const reason = (failed[0] as PromiseRejectedResult).reason
        pushError(reason, `${failed.length} de ${ids.length} cenas não puderam ser apagadas.`)
      } else {
        push(ids.length === 1 ? 'Fila limpa: 1 cena apagada.' : `Fila limpa: ${ids.length} cenas apagadas.`, 'success')
      }
    } catch (error) {
      pushError(error, 'Não foi possível limpar a fila.')
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
    setThumbSize(72)
    storyboardRef.current?.scrollTo({ left: 0, behavior: 'smooth' })
  }

  const toolbarButtonClass = 'h-9 px-3 py-0 text-xs'

  return (
    <PageShell className="flex flex-col">
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
        <div className="flex flex-1 flex-col">
          <div className="mb-3 flex shrink-0 flex-wrap items-center justify-end gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                className={toolbarButtonClass}
                icon={<Trash2 className="h-3.5 w-3.5" />}
                disabled={busy || items.length === 0}
                title="Apaga todas as cenas da fila. Nada é salvo."
                onClick={() => setClearOpen(true)}
              >
                Limpar fila
              </Button>
              <Button
                type="button"
                variant="secondary"
                className={toolbarButtonClass}
                icon={<FolderInput className="h-3.5 w-3.5" />}
                disabled={busy || !canCreateScene()}
                title="Escolha a pasta da música: cada imagem e áudio com nome só de número (1.png, 1.mp3…) vai para a cena de mesmo número."
                onClick={() => void importFromFolder()}
              >
                Puxar da pasta
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
              <Button
                variant="secondary"
                className={toolbarButtonClass}
                icon={<Clapperboard className="h-3.5 w-3.5" />}
                disabled={items.length === 0}
                title="Envia as cenas ao ComfyUI, 5 por vez na fila, e baixa cada vídeo assim que termina."
                onClick={() => setComfyOpen(true)}
              >
                Gerar no Comfy
              </Button>
            </div>
          </div>

          <div className="flex min-h-[560px] flex-1 gap-3">
            <aside className="flex w-[272px] shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
                <h2 className="text-sm font-semibold text-text">
                  Cenas{' '}
                  <span className="font-medium text-muted">({items.length})</span>
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
              {/* Lista posicionada em absoluto: a altura da coluna segue o card de edição, não o nº de cenas. */}
              <div className="relative min-h-[12rem] flex-1">
                <div
                  className="absolute inset-0 overflow-y-auto p-2"
                  onScroll={() => setMenu(null)}
                >
                  {items.length === 0 ? (
                    <p className="px-2 py-8 text-center text-xs leading-relaxed text-muted">
                      Nenhuma cena nesta fila. Crie a primeira pela imagem, pelo prompt ou pelo trecho.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {items.map((item) => (
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

            <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-border bg-card">
              {selectedItem && selectedDraft ? (
                <>
                  <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
                    <h2 className="text-sm font-semibold text-text">Editar cena</h2>
                    <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-xs font-semibold text-accent">
                      #{selectedNumber}
                    </span>
                  </div>
                  <div className="grid flex-1 grid-cols-1 gap-5 p-5 xl:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.2fr)]">
                    <div className="flex flex-col xl:sticky xl:top-0 xl:self-start">
                      <p className="mb-2 text-xs font-medium text-muted">Imagem da cena</p>
                      <div className="relative h-[360px] overflow-hidden rounded-xl bg-bg/40 xl:h-[460px]">
                        {selectedItem.imageDataUrl ? (
                          <SceneThumb
                            src={selectedItem.imagePreviewUrl ?? selectedItem.imageDataUrl}
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

                    <div className="flex flex-col gap-4">
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

                      <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-bg/30 px-3 py-2">
                        <span className="flex min-w-0 items-center gap-2 text-xs">
                          <Music2 className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                          {selectedItem.audioDuration !== null ? (
                            <span className="truncate text-text">
                              Áudio {formatSeconds(selectedItem.audioDuration)}
                              <span className="text-muted">
                                {' '}
                                · envio ao Comfy: {comfyDurationSeconds(selectedItem.audioDuration)} s
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted">
                              Sem áudio. Use “Puxar da pasta” com 1.mp3, 2.mp3…
                            </span>
                          )}
                        </span>
                        {selectedItem.audioPath ? (
                          <button
                            type="button"
                            className="shrink-0 text-xs font-medium text-muted transition-colors hover:text-text"
                            onClick={() => void removeAudio(selectedItem.id)}
                          >
                            Remover
                          </button>
                        ) : null}
                      </div>

                      <div className="flex flex-col">
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
                          className="h-32 w-full resize-none overflow-y-auto rounded-xl border border-border bg-bg/50 px-3 py-2 text-sm leading-relaxed text-text placeholder:text-muted-2 focus:border-accent/60 focus:outline-none"
                        />
                        <p className={cn('mt-1 text-right text-[10px] tabular-nums', countClass(selectedDraft.prompt.length))}>
                          {selectedDraft.prompt.length}/{TEXT_SOFT_LIMIT}
                        </p>
                      </div>

                      <div className="flex flex-col">
                        <span className="mb-1.5 block text-xs font-medium text-muted">
                          Trecho da música desta cena
                        </span>
                        <textarea
                          value={selectedDraft.lyrics}
                          onChange={(event) => patchDraft(selectedItem.id, { lyrics: event.target.value })}
                          placeholder="Trecho da música desta cena…"
                          spellCheck={false}
                          className="h-32 w-full resize-none overflow-y-auto rounded-xl border border-border bg-bg/50 px-3 py-2 text-sm leading-relaxed text-text placeholder:text-muted-2 focus:border-accent/60 focus:outline-none"
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
                    Nenhuma cena selecionada
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
              {items.map((item) => (
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
        open={clearOpen}
        title="Limpar fila de lipsync?"
        message={`${
          items.length === 1 ? 'A cena da fila será apagada' : `As ${items.length} cenas da fila serão apagadas`
        } de vez, com imagem, prompt e trecho. Nada é salvo. Os projetos de música continuam.`}
        confirmLabel="Limpar fila"
        onConfirm={() => void clearQueue()}
        onClose={() => setClearOpen(false)}
      />

      <ComfyBatchModal
        open={comfyOpen}
        onClose={() => setComfyOpen(false)}
        items={items}
        projectId={currentProjectId() || null}
        beforeStart={refresh}
      />

      <Modal
        open={folderImport !== null}
        title="Substituir imagens e áudios das cenas?"
        onClose={() => setFolderImport(null)}
        footer={
          folderImport ? (
            <>
              <Button variant="secondary" onClick={() => setFolderImport(null)}>
                Cancelar
              </Button>
              <Button variant="secondary" onClick={() => void applyFolderImport(folderImport, false)}>
                Só cards vazios
              </Button>
              <Button onClick={() => void applyFolderImport(folderImport, true)}>Substituir</Button>
            </>
          ) : null
        }
      >
        {folderImport ? (
          <p className="text-sm leading-relaxed text-muted">
            {(() => {
              const conflicts = countFolderConflicts(folderImport)
              const total = countFolderScenes(folderImport)
              return conflicts === 1
                ? `1 das ${total} cenas encontradas já tem imagem ou áudio.`
                : `${conflicts} das ${total} cenas encontradas já têm imagem ou áudio.`
            })()}{' '}
            Prompt e trecho de cada cena não mudam.
            <span className="mt-2 block truncate text-xs text-muted-2" title={folderImport.folder}>
              {folderImport.folder}
            </span>
          </p>
        ) : null}
      </Modal>

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
