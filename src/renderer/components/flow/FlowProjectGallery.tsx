import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ChevronDown,
  FolderOpen,
  ImageIcon,
  Loader2,
  Plus,
  Search,
  Trash2,
  UserRound,
} from 'lucide-react'
import type { Channel, Project } from '@shared/types'
import { PageHeader } from '../PageHeader'
import { Button } from '../Button'
import { Card } from '../Card'
import { Input } from '../Input'
import { ConfirmDialog, Modal } from '../Modal'
import { getAtlasApi } from '../../lib/api'
import { environmentBreadcrumb } from '../../lib/environments'
import { cn, formatRelativeDate } from '../../lib/utils'

const OTHER_GROUP_ID = '__outros__'

type SingerGroup = {
  id: string
  name: string
  projects: Project[]
  coverUrl: string | null
}

function matchesQuery(project: Project, channelName: string, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    project.name.toLowerCase().includes(q) ||
    channelName.toLowerCase().includes(q) ||
    (project.description || '').toLowerCase().includes(q)
  )
}

function editedLabel(iso: string) {
  const relative = formatRelativeDate(iso)
  if (relative.startsWith('Hoje')) return 'Atualizado hoje'
  if (relative === 'Ontem') return 'Atualizado ontem'
  return `Atualizado ${relative}`
}

function folderBaseName(folderPath: string) {
  const cleaned = folderPath.replace(/[\\/]+$/, '')
  const parts = cleaned.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1]?.trim() || ''
}

function buildGroups(projects: Project[], channels: Channel[]): SingerGroup[] {
  const byChannel = new Map<string, Project[]>()
  for (const project of projects) {
    const id = project.channelId?.trim() || OTHER_GROUP_ID
    const list = byChannel.get(id) || []
    list.push(project)
    byChannel.set(id, list)
  }
  const groups: SingerGroup[] = channels
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      projects: [...(byChannel.get(channel.id) || [])].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
      coverUrl: channel.avatarDataUrl || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  const orphans = byChannel.get(OTHER_GROUP_ID) || []
  if (orphans.length > 0) {
    groups.push({
      id: OTHER_GROUP_ID,
      name: 'Sem cantor',
      projects: [...orphans].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      coverUrl: null,
    })
  }
  return groups
}

function CoverImage({ url, placeholder = true }: { url: string | null; placeholder?: boolean }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
  }, [url])
  if (!url || failed) {
    if (!placeholder) return null
    return (
      <div className="flex h-full w-full items-center justify-center bg-elevated">
        <ImageIcon className="h-10 w-10 text-muted-2" />
      </div>
    )
  }
  return (
    <img
      src={url}
      alt=""
      className="h-full w-full object-cover"
      draggable={false}
      loading="eager"
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}

export function FlowProjectGallery({
  projects,
  channels,
  groupId,
  onGroupId,
  busy,
  onOpenProject,
  onCreate,
  onDeleteProject,
  onDeleteProjects,
}: {
  projects: Project[] | null
  channels: Channel[]
  groupId: string | null
  onGroupId: (id: string | null) => void
  busy: boolean
  onOpenProject: (project: Project) => void
  onCreate: (input: { name: string; channelId: string; folderPath: string }) => Promise<void>
  onDeleteProject: (project: Project) => Promise<void>
  onDeleteProjects: (projects: Project[]) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createChannelId, setCreateChannelId] = useState('')
  const [createFolder, setCreateFolder] = useState('')
  const [folderTouched, setFolderTouched] = useState(false)
  const [deleting, setDeleting] = useState<Project | null>(null)
  const [deletingGroup, setDeletingGroup] = useState<SingerGroup | null>(null)
  const [covers, setCovers] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!projects) return
    const listCovers = getAtlasApi().atlasFlowV1?.listProjectCovers
    if (typeof listCovers !== 'function') return
    let cancelled = false
    void (async () => {
      try {
        const list = await listCovers()
        if (cancelled) return
        const next: Record<string, string> = {}
        for (const item of list) {
          if (item.atlasProjectId && item.coverUrl) next[item.atlasProjectId] = item.coverUrl
        }
        setCovers(next)
      } catch (error) {
        console.error('[atlas-flow] capas dos projetos', error)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projects])

  const groups = useMemo(() => buildGroups(projects ?? [], channels), [projects, channels])
  const activeGroup = useMemo(
    () => (groupId ? groups.find((group) => group.id === groupId) ?? null : null),
    [groupId, groups],
  )
  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups.filter(
      (group) =>
        group.name.toLowerCase().includes(q) ||
        group.projects.some((project) => matchesQuery(project, group.name, query)),
    )
  }, [groups, query])
  const visibleProjects = useMemo(() => {
    if (!activeGroup) return []
    return activeGroup.projects.filter((project) => matchesQuery(project, activeGroup.name, query))
  }, [activeGroup, query])
  const selectedChannel = channels.find((channel) => channel.id === createChannelId) ?? null
  const flowCount = useMemo(
    () => groups.reduce((total, group) => total + group.projects.length, 0),
    [groups],
  )

  useEffect(() => {
    if (!groupId || projects === null) return
    const singerExists =
      channels.some((channel) => channel.id === groupId) ||
      (groupId === OTHER_GROUP_ID &&
        projects.some((project) => !project.channelId?.trim()))
    if (!singerExists) onGroupId(null)
  }, [groupId, channels, projects, onGroupId])

  function folderForChannel(channelId: string) {
    const channel = channels.find((item) => item.id === channelId)
    if (!channel?.folderPath || channel.folderExists === false) return ''
    return channel.folderPath
  }

  function openCreate() {
    setCreateName('')
    const preferred =
      (groupId && groupId !== OTHER_GROUP_ID ? groupId : '') || channels[0]?.id || ''
    setCreateChannelId(preferred)
    setCreateFolder(folderForChannel(preferred))
    setFolderTouched(false)
    setCreating(true)
  }

  async function pickDestinationFolder() {
    const folder = await getAtlasApi().dialog.selectFolder({
      title: 'Pasta onde as imagens baixadas serão salvas',
      defaultPath: createFolder || undefined,
    })
    if (!folder) return
    setCreateFolder(folder)
    setFolderTouched(true)
    const folderName = folderBaseName(folder)
    if (folderName) {
      setCreateName(folderName)
    }
  }

  async function confirmCreate() {
    const folderPath = createFolder.trim()
    const name = createName.trim() || folderBaseName(folderPath)
    if (!name || !createChannelId.trim() || !folderPath) return
    await onCreate({ name, channelId: createChannelId.trim(), folderPath })
    setCreating(false)
  }

  return (
    <>
      <PageHeader
        breadcrumb={
          activeGroup
            ? environmentBreadcrumb('music', 'Flow', activeGroup.name)
            : environmentBreadcrumb('music', 'Flow')
        }
        title={activeGroup ? activeGroup.name.toUpperCase() : 'FLOW'}
        subtitle={
          activeGroup
            ? 'Projetos deste cantor no Google Flow.'
            : 'Escolha o cantor e crie o projeto do Flow aqui.'
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        {activeGroup ? (
          <Button
            variant="secondary"
            icon={<ArrowLeft className="h-4 w-4" />}
            onClick={() => onGroupId(null)}
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
      ) : visibleGroups.length === 0 ? (
        <Card className="flex flex-col items-center py-16 text-center">
          <ImageIcon className="h-10 w-10 text-muted-2" />
          <p className="mt-3 text-sm font-medium text-text">
            {query ? 'Nenhum resultado encontrado' : 'Nenhum cantor cadastrado.'}
          </p>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">
            {query
              ? 'Tente buscar pelo nome do cantor ou do projeto de Flow.'
              : 'Cadastre um cantor de música para criar projetos só do Flow.'}
          </p>
        </Card>
      ) : !activeGroup ? (
        <>
          <p className="mb-4 text-xs text-muted-2">
            {visibleGroups.length} {visibleGroups.length === 1 ? 'cantor' : 'cantores'} · {flowCount}{' '}
            {flowCount === 1 ? 'projeto de Flow' : 'projetos de Flow'}
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visibleGroups.map((group) => (
              <Card
                key={group.id}
                padding="none"
                className="group/card relative overflow-hidden transition-colors hover:border-border-strong"
              >
                <button type="button" onClick={() => onGroupId(group.id)} className="block w-full text-left">
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
                            {group.projects.length === 0
                              ? 'Nenhum projeto de Flow'
                              : `${group.projects.length} ${group.projects.length === 1 ? 'projeto de Flow' : 'projetos de Flow'}`}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
                {group.projects.length > 0 ? (
                  <button
                    type="button"
                    title="Excluir projetos do Flow"
                    onClick={() => setDeletingGroup(group)}
                    className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-danger group-hover/card:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </Card>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="mb-4 text-xs text-muted-2">
            {visibleProjects.length}{' '}
            {visibleProjects.length === 1 ? 'projeto de Flow' : 'projetos de Flow'}
          </p>
          {visibleProjects.length === 0 ? (
            <Card className="flex flex-col items-center py-16 text-center">
              <ImageIcon className="h-10 w-10 text-muted-2" />
              <p className="mt-3 text-sm font-medium text-text">Nenhum projeto de Flow deste cantor.</p>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">
                Crie o projeto aqui. Ele também é criado no Google Flow.
              </p>
              <Button className="mt-5" icon={<Plus className="h-4 w-4" />} disabled={busy} onClick={openCreate}>
                Novo projeto
              </Button>
            </Card>
          ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visibleProjects.map((project) => {
              return (
                <Card
                  key={project.id}
                  padding="none"
                  className="group/card overflow-hidden transition-colors hover:border-border-strong"
                >
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => onOpenProject(project)}
                      className="block w-full text-left"
                    >
                      <div className="relative aspect-video overflow-hidden bg-elevated">
                        <CoverImage url={covers[project.id] ?? null} placeholder={false} />
                      </div>
                    </button>
                    <button
                      type="button"
                      title="Excluir projeto"
                      onClick={() => setDeleting(project)}
                      className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-danger group-hover/card:opacity-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenProject(project)}
                    className="block w-full px-3 py-3 text-left"
                  >
                    <p className="truncate text-sm font-semibold text-text">{project.name}</p>
                    <p className="mt-0.5 text-[11px] text-muted-2">{editedLabel(project.updatedAt)}</p>
                  </button>
                </Card>
              )
            })}
          </div>
          )}
        </>
      )}

      <Modal
        open={creating}
        title="Novo projeto"
        onClose={() => !busy && setCreating(false)}
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button
              icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              disabled={busy || !createName.trim() || !createChannelId.trim() || !createFolder.trim()}
              onClick={() => void confirmCreate()}
            >
              {busy ? 'Criando...' : 'Criar projeto'}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
              <Input
                id="flow-project-name"
                label="Nome do projeto"
                value={createName}
                placeholder="Digite o nome do projeto"
                onChange={(event) => setCreateName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void confirmCreate()
                  }
                }}
                autoFocus
              />

              <div className="flex flex-col gap-2">
                <label htmlFor="flow-project-channel" className="text-sm font-medium text-muted">
                  Cantor
                </label>
                {channels.length === 0 ? (
                  <p className="rounded-xl border border-border-soft bg-elevated px-3.5 py-3 text-sm text-muted">
                    Nenhum cantor cadastrado. Crie um canal de música antes de abrir o Flow.
                  </p>
                ) : (
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center overflow-hidden rounded-lg bg-accent-subtle text-accent">
                      {selectedChannel?.avatarDataUrl ? (
                        <img src={selectedChannel.avatarDataUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <UserRound className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <select
                      id="flow-project-channel"
                      value={createChannelId}
                      onChange={(event) => {
                        const nextId = event.target.value
                        setCreateChannelId(nextId)
                        if (!folderTouched) setCreateFolder(folderForChannel(nextId))
                      }}
                      className="h-11 w-full appearance-none rounded-xl border border-border bg-input pl-12 pr-10 text-sm text-text transition-colors hover:border-border-strong focus:border-accent/70 focus:outline-none"
                    >
                      <option value="">Selecione o cantor...</option>
                      {channels.map((channel) => (
                        <option key={channel.id} value={channel.id}>
                          {channel.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-muted">Pasta de destino</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void pickDestinationFolder()}
                  className="flex h-11 items-center gap-2.5 rounded-xl border border-border bg-input px-2.5 text-left transition-colors hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent">
                    <FolderOpen className="h-3.5 w-3.5" />
                  </span>
                  <span
                    className={cn('min-w-0 flex-1 truncate text-sm', createFolder ? 'text-text' : 'text-muted-2')}
                    title={createFolder || undefined}
                  >
                    {createFolder ? createFolder.replace(/\\/g, '/') : 'Escolha onde salvar as imagens'}
                  </span>
                  <span className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-accent">Alterar</span>
                </button>
                <p className="rounded-xl border border-border-soft bg-elevated/70 px-3.5 py-2.5 text-xs leading-relaxed text-muted">
                  As imagens baixadas deste projeto ficam nessa pasta. O projeto também é criado no Google Flow, neste cantor.
                </p>
              </div>
            </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Excluir projeto?"
        message={
          deleting
            ? `“${deleting.name}” será removido do Flow e, se estiver vinculado, também do Google Flow. A pasta no disco não é apagada.`
            : ''
        }
        confirmLabel="Excluir projeto"
        onConfirm={() => {
          if (!deleting) return
          const target = deleting
          setDeleting(null)
          void onDeleteProject(target)
        }}
        onClose={() => setDeleting(null)}
      />

      <ConfirmDialog
        open={Boolean(deletingGroup)}
        title={
          deletingGroup && deletingGroup.projects.length === 1
            ? 'Excluir projeto?'
            : 'Excluir projetos deste cantor?'
        }
        message={
          deletingGroup
            ? deletingGroup.projects.length === 1
              ? `“${deletingGroup.projects[0]?.name}” será removido do Flow e do Google Flow. A pasta no disco não é apagada.`
              : `Os ${deletingGroup.projects.length} projetos de Flow de “${deletingGroup.name}” serão removidos. As pastas no disco não são apagadas.`
            : ''
        }
        confirmLabel={
          deletingGroup && deletingGroup.projects.length === 1 ? 'Excluir projeto' : 'Excluir projetos'
        }
        onConfirm={() => {
          if (!deletingGroup) return
          const targets = deletingGroup.projects
          setDeletingGroup(null)
          void onDeleteProjects(targets)
        }}
        onClose={() => setDeletingGroup(null)}
      />
    </>
  )
}
