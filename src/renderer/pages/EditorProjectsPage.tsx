import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Film,
  FolderOpen,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
} from 'lucide-react'
import {
  EDITOR_ASPECTS,
  EDITOR_ASPECT_LABEL,
  EDITOR_DEFAULT_ASPECT,
  formatDuration,
  type EditorAspect,
  type EditorProject,
} from '@shared/editor/types'
import type { Channel } from '@shared/types'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { ConfirmDialog, Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { getAtlasApi } from '../lib/api'
import { cn, formatRelativeDate } from '../lib/utils'

const OTHER_GROUP_ID = '__outros__'

type SingerGroup = {
  id: string
  name: string
  projects: EditorProject[]
  coverUrl: string | null
}

function matchesQuery(project: EditorProject, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    project.name.toLowerCase().includes(q) ||
    (project.musicName?.toLowerCase().includes(q) ?? false) ||
    (project.channelName?.toLowerCase().includes(q) ?? false)
  )
}

function editedLabel(iso: string) {
  const relative = formatRelativeDate(iso)
  if (relative.startsWith('Hoje')) return 'Editado hoje'
  if (relative === 'Ontem') return 'Editado ontem'
  return `Editado ${relative}`
}

function displayName(project: EditorProject) {
  return project.name.trim() || project.musicName?.trim() || 'Sem nome'
}

function folderBaseName(folderPath: string) {
  const cleaned = folderPath.replace(/[\\/]+$/, '')
  const parts = cleaned.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1]?.trim() || ''
}

function groupProjects(projects: EditorProject[]): SingerGroup[] {
  const map = new Map<string, SingerGroup>()
  for (const project of projects) {
    const id = project.channelId?.trim() || OTHER_GROUP_ID
    const name = project.channelName?.trim() || (id === OTHER_GROUP_ID ? 'Sem cantor' : 'Cantor')
    const current = map.get(id)
    if (current) {
      current.projects.push(project)
      if (!current.coverUrl && project.coverUrl) current.coverUrl = project.coverUrl
    } else {
      map.set(id, {
        id,
        name,
        projects: [project],
        coverUrl: project.coverUrl ?? null,
      })
    }
  }
  return [...map.values()]
    .map((group) => ({
      ...group,
      projects: [...group.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      coverUrl:
        group.coverUrl ??
        [...group.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).find((item) => item.coverUrl)
          ?.coverUrl ??
        null,
    }))
    .sort((a, b) => {
      if (a.id === OTHER_GROUP_ID) return 1
      if (b.id === OTHER_GROUP_ID) return -1
      return a.name.localeCompare(b.name, 'pt-BR')
    })
}

function CoverImage({ url, className }: { url: string | null; className?: string }) {
  if (!url) {
    return (
      <div className={cn('flex h-full w-full items-center justify-center bg-elevated', className)}>
        <Film className="h-10 w-10 text-muted-2" />
      </div>
    )
  }
  return (
    <img
      src={url}
      alt=""
      className={cn('h-full w-full object-cover', className)}
      style={{ imageRendering: 'auto' }}
      draggable={false}
      loading="eager"
      decoding="async"
    />
  )
}

export function EditorProjectsPage() {
  const api = getAtlasApi()
  const navigate = useNavigate()
  const { push, pushError } = useToast()

  const [projects, setProjects] = useState<EditorProject[] | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [groupId, setGroupId] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createAspect, setCreateAspect] = useState<EditorAspect>(EDITOR_DEFAULT_ASPECT)
  const [createChannelId, setCreateChannelId] = useState('')
  const [channels, setChannels] = useState<Channel[]>([])

  const [renaming, setRenaming] = useState<EditorProject | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleting, setDeleting] = useState<EditorProject | null>(null)
  const [deletingGroup, setDeletingGroup] = useState<SingerGroup | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const list = await api.editor.list()
    setProjects(list)
  }, [api])

  useEffect(() => {
    void load().catch((error) => {
      console.error('[atlas] falha ao listar projetos do editor', error)
      pushError(error, 'Não foi possível carregar os projetos do editor')
      setProjects([])
    })
  }, [load, pushError])

  useEffect(() => {
    void api.channels
      .list({ channelType: 'music' })
      .then((list) => setChannels(list.filter((channel) => channel.active !== false)))
      .catch((error) => console.error('[atlas] falha ao listar cantores', error))
  }, [api])

  useEffect(() => {
    if (!menuId) return
    function onPointerDown() {
      setMenuId(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuId])

  const filtered = useMemo(
    () => (projects ?? []).filter((project) => matchesQuery(project, query)),
    [projects, query],
  )
  const groups = useMemo(() => groupProjects(filtered), [filtered])
  const activeGroup = useMemo(
    () => (groupId ? groups.find((group) => group.id === groupId) ?? null : null),
    [groupId, groups],
  )

  useEffect(() => {
    if (groupId && projects && !groups.some((group) => group.id === groupId)) {
      setGroupId(null)
    }
  }, [groupId, groups, projects])

  function openCreate() {
    setCreateName('')
    setCreateAspect(EDITOR_DEFAULT_ASPECT)
    const preferred =
      (groupId && groupId !== OTHER_GROUP_ID ? groupId : '') ||
      channels[0]?.id ||
      ''
    setCreateChannelId(preferred)
    setCreating(true)
  }

  useEffect(() => {
    if (creating) setCreateAspect(EDITOR_DEFAULT_ASPECT)
  }, [creating])

  async function pickNameFromFolder() {
    try {
      const folder = await api.dialog.selectFolder({
        title: 'Escolher pasta da música',
      })
      if (!folder) return
      const name = folderBaseName(folder)
      if (!name) {
        push('Não foi possível ler o nome da pasta.', 'error')
        return
      }
      setCreateName(name)
      push(`Nome vinculado: ${name}`, 'success')
    } catch (error) {
      pushError(error, 'Não foi possível escolher a pasta')
    }
  }

  async function confirmCreate() {
    const name = createName.trim()
    if (!name) {
      push('Informe o nome do projeto (ex.: nome da música).', 'error')
      return
    }
    if (!createChannelId.trim()) {
      push('Escolha um cantor para o projeto.', 'error')
      return
    }
    setBusy(true)
    try {
      const project = await api.editor.create({
        name,
        aspect: createAspect,
        channelId: createChannelId.trim(),
      })
      setCreating(false)
      push('Projeto criado.', 'success')
      navigate(`/editor/${project.id}`)
    } catch (error) {
      pushError(error, 'Falha ao criar o projeto')
    } finally {
      setBusy(false)
    }
  }

  async function saveRename() {
    if (!renaming) return
    const name = renameValue.trim()
    if (!name) {
      push('Informe o nome do projeto.', 'error')
      return
    }
    try {
      const updated = await api.editor.update(renaming.id, { name })
      if (updated) {
        setProjects((current) =>
          (current ?? []).map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
        )
      }
      setRenaming(null)
      push('Projeto renomeado.', 'success')
    } catch (error) {
      pushError(error, 'Falha ao renomear o projeto')
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await api.editor.remove(deleting.id)
      setProjects((current) => (current ?? []).filter((item) => item.id !== deleting.id))
      setDeleting(null)
      push('Projeto excluído.', 'success')
    } catch (error) {
      pushError(error, 'Falha ao excluir o projeto')
    }
  }

  async function confirmDeleteGroup() {
    if (!deletingGroup) return
    const targets = deletingGroup.projects
    setBusy(true)
    try {
      for (const project of targets) {
        await api.editor.remove(project.id)
      }
      const removed = new Set(targets.map((item) => item.id))
      setProjects((current) => (current ?? []).filter((item) => !removed.has(item.id)))
      setDeletingGroup(null)
      if (groupId === deletingGroup.id) setGroupId(null)
      push(
        targets.length === 1 ? 'Projeto excluído.' : `${targets.length} projetos excluídos.`,
        'success',
      )
    } catch (error) {
      pushError(error, 'Falha ao excluir os projetos')
    } finally {
      setBusy(false)
    }
  }

  const showingProjects = Boolean(activeGroup)

  return (
    <PageShell>
      <PageHeader
        breadcrumb={
          activeGroup ? `Atlas / Editor / ${activeGroup.name}` : 'Atlas / Editor'
        }
        title={activeGroup ? activeGroup.name.toUpperCase() : 'EDITOR'}
        subtitle={
          activeGroup
            ? 'Projetos de edição deste cantor.'
            : 'Escolha o cantor para ver as edições — ou crie um projeto novo.'
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        {activeGroup ? (
          <Button
            variant="secondary"
            icon={<ArrowLeft className="h-4 w-4" />}
            onClick={() => setGroupId(null)}
          >
            Cantores
          </Button>
        ) : null}
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={activeGroup ? 'Buscar projeto ou música...' : 'Buscar cantor ou música...'}
            className="h-11 w-full rounded-xl border border-border bg-elevated pl-10 pr-3 text-sm text-text placeholder:text-muted-2 focus:border-accent/50 focus:outline-none"
          />
        </div>
        <Button icon={<Plus className="h-4 w-4" />} disabled={busy} onClick={openCreate}>
          Novo projeto
        </Button>
      </div>

      {projects === null ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando projetos...
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center py-16 text-center">
          <Film className="h-10 w-10 text-muted-2" />
          <p className="mt-3 text-sm font-medium text-text">
            {query ? 'Nenhum resultado encontrado' : 'Nenhum projeto de edição ainda.'}
          </p>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">
            {query
              ? 'Tente buscar por cantor ou nome da música.'
              : 'Crie um projeto com o nome da música, ou deixe o Comfy criar automaticamente.'}
          </p>
          {!query ? (
            <Button className="mt-5" icon={<Plus className="h-4 w-4" />} disabled={busy} onClick={openCreate}>
              Criar primeiro projeto
            </Button>
          ) : null}
        </Card>
      ) : !showingProjects ? (
        <>
          <p className="mb-4 text-xs text-muted-2">
            {groups.length} {groups.length === 1 ? 'cantor' : 'cantores'} · {filtered.length}{' '}
            {filtered.length === 1 ? 'projeto' : 'projetos'}
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {groups.map((group) => (
              <Card
                key={group.id}
                padding="none"
                className="group/card relative overflow-hidden transition-colors hover:border-border-strong"
              >
                <button
                  type="button"
                  onClick={() => setGroupId(group.id)}
                  className="block w-full text-left"
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-elevated">
                    <CoverImage url={group.coverUrl} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm">
                          {group.id === OTHER_GROUP_ID ? (
                            <FolderOpen className="h-4 w-4" />
                          ) : (
                            <UserRound className="h-4 w-4" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">{group.name}</p>
                          <p className="text-[11px] text-white/75">
                            {group.projects.length}{' '}
                            {group.projects.length === 1 ? 'projeto' : 'projetos'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  title="Excluir projetos"
                  onClick={(event) => {
                    event.stopPropagation()
                    setDeletingGroup(group)
                  }}
                  className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-danger hover:text-white group-hover/card:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="mb-4 text-xs text-muted-2">
            {activeGroup!.projects.length}{' '}
            {activeGroup!.projects.length === 1 ? 'projeto' : 'projetos'}
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {activeGroup!.projects.map((project) => {
              const menuOpen = menuId === project.id
              return (
                <Card
                  key={project.id}
                  padding="none"
                  className="group/card overflow-hidden transition-colors hover:border-border-strong"
                >
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => navigate(`/editor/${project.id}`)}
                      className="block w-full text-left"
                    >
                      <div className="relative aspect-video overflow-hidden bg-elevated">
                        <CoverImage url={project.coverUrl ?? null} />
                        <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white">
                          {formatDuration(project.duration)}
                        </span>
                        <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {project.timeline.aspect}
                        </span>
                      </div>
                    </button>
                    <button
                      type="button"
                      title="Excluir projeto"
                      onClick={(event) => {
                        event.stopPropagation()
                        setDeleting(project)
                      }}
                      className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-danger group-hover/card:opacity-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex items-start gap-2 px-3 py-3">
                    <button
                      type="button"
                      onClick={() => navigate(`/editor/${project.id}`)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-sm font-semibold text-text">{displayName(project)}</p>
                      {project.musicName &&
                      project.musicName.trim().toLowerCase() !== displayName(project).toLowerCase() ? (
                        <p className="mt-0.5 truncate text-[11px] text-muted">{project.musicName}</p>
                      ) : null}
                      <p className="mt-0.5 text-[11px] text-muted-2">{editedLabel(project.updatedAt)}</p>
                    </button>

                    <div className="relative" onPointerDown={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        title="Mais opções"
                        onClick={() => setMenuId(menuOpen ? null : project.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-text"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {menuOpen ? (
                        <div className="absolute right-0 z-10 mt-1 w-40 overflow-hidden rounded-xl border border-border bg-elevated shadow-card">
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text hover:bg-hover"
                            onClick={() => {
                              setMenuId(null)
                              setRenaming(project)
                              setRenameValue(displayName(project))
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Renomear
                          </button>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-danger hover:bg-hover"
                            onClick={() => {
                              setMenuId(null)
                              setDeleting(project)
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Excluir
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </>
      )}

      <Modal
        open={creating}
        title="Novo projeto de edição"
        onClose={() => !busy && setCreating(false)}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button
              disabled={busy || channels.length === 0 || !createChannelId.trim()}
              onClick={() => void confirmCreate()}
            >
              {busy ? 'Criando...' : 'Criar e abrir'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="editor-project-channel" className="mb-1.5 block text-xs font-medium text-muted">
              Cantor
            </label>
            {channels.length === 0 ? (
              <p className="rounded-xl border border-border-soft bg-elevated px-3 py-3 text-xs text-muted">
                Nenhum cantor cadastrado. Crie um canal em Canais antes de abrir o Editor.
              </p>
            ) : (
              <select
                id="editor-project-channel"
                value={createChannelId}
                onChange={(event) => setCreateChannelId(event.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-input px-3.5 text-sm text-text focus:border-accent/50 focus:outline-none"
              >
                <option value="">Selecione o cantor...</option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label htmlFor="editor-project-name" className="text-xs font-medium text-muted">
                Nome (música ou como preferir)
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => void pickNameFromFolder()}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-accent hover:bg-accent-subtle disabled:opacity-50"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Buscar da pasta
              </button>
            </div>
            <Input
              id="editor-project-name"
              value={createName}
              placeholder="Ex.: Quando Tudo Passar"
              onChange={(event) => setCreateName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void confirmCreate()
                }
              }}
              autoFocus
            />
            <p className="mt-1.5 text-[11px] text-muted-2">
              Escolha a pasta da música para preencher o nome automaticamente.
            </p>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted">Formato</p>
            <div className="grid grid-cols-3 gap-2">
              {EDITOR_ASPECTS.map((aspect) => (
                <button
                  key={aspect}
                  type="button"
                  onClick={() => setCreateAspect(aspect)}
                  className={cn(
                    'rounded-xl border px-2 py-2.5 text-center transition-colors',
                    createAspect === aspect
                      ? 'border-accent/60 bg-accent-subtle text-accent'
                      : 'border-border-soft text-muted hover:border-border-strong hover:text-text',
                  )}
                >
                  <span className="block text-xs font-semibold">{aspect}</span>
                  <span className="mt-0.5 block text-[10px] opacity-80">{EDITOR_ASPECT_LABEL[aspect]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(renaming)}
        title="Renomear projeto"
        onClose={() => setRenaming(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenaming(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void saveRename()}>Salvar</Button>
          </>
        }
      >
        <Input
          id="editor-project-rename"
          label="Nome do projeto"
          value={renameValue}
          onChange={(event) => setRenameValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void saveRename()
            }
          }}
        />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Excluir projeto de edição?"
        message={
          deleting
            ? `Tem certeza que deseja excluir “${displayName(deleting)}”? A timeline e os assets serão removidos. Os arquivos originais no disco não são apagados.`
            : ''
        }
        confirmLabel="Excluir projeto"
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleting(null)}
      />

      <ConfirmDialog
        open={Boolean(deletingGroup)}
        title={
          deletingGroup && deletingGroup.projects.length === 1
            ? 'Excluir projeto de edição?'
            : 'Excluir projetos deste cantor?'
        }
        message={
          deletingGroup
            ? deletingGroup.projects.length === 1
              ? `Tem certeza que deseja excluir “${displayName(deletingGroup.projects[0])}”? A timeline e os assets serão removidos. Os arquivos originais no disco não são apagados.`
              : `Tem certeza que deseja excluir os ${deletingGroup.projects.length} projetos de “${deletingGroup.name}”? As timelines serão removidas. Os arquivos originais no disco não são apagados.`
            : ''
        }
        confirmLabel={
          deletingGroup && deletingGroup.projects.length === 1 ? 'Excluir projeto' : 'Excluir projetos'
        }
        onConfirm={() => void confirmDeleteGroup()}
        onClose={() => setDeletingGroup(null)}
      />
    </PageShell>
  )
}
