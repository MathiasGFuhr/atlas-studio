import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Clapperboard, FolderKanban, FolderOpen, Files, Music2, Pencil, Plus, Scissors, Search, Tag, Trash2 } from 'lucide-react'
import type { Channel, Project, ProjectType } from '@shared/types'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { MusicPublicationCard } from '../components/MusicPublicationCard'
import { ConfirmDialog } from '../components/Modal'
import {
  ProjectEditorModal,
  type ProjectFormValues,
} from '../components/ProjectEditorModal'
import { getAtlasApi } from '../lib/api'
import { notifyProjectsChanged, onProjectsChanged } from '../lib/projectEvents'
import { onVideosChanged } from '../lib/videoEvents'
import { useToast } from '../components/Toast'
import { ENVIRONMENTS, environmentBreadcrumb, projectPath } from '../lib/environments'
import { cn, formatRelativeDate } from '../lib/utils'

const EMPTY_FORM: ProjectFormValues = { name: '', description: '', channelId: '' }

type ProjectListTab = 'active' | 'published' | 'music' | 'videos'

function hasLinkedVideo(project: Project) {
  return Boolean(project.scheduledVideoId)
}

/**
 * Lista de projetos de um ambiente. A mesma tela serve História e Música —
 * o `projectType` decide o filtro, o destaque visual e o tipo do novo projeto.
 */
export function ProjectsPage({ projectType }: { projectType: ProjectType }) {
  const api = getAtlasApi()
  const navigate = useNavigate()
  const { push } = useToast()
  const env = ENVIRONMENTS[projectType]

  const [projects, setProjects] = useState<Project[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<ProjectListTab>(projectType === 'music' ? 'videos' : 'active')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [deleting, setDeleting] = useState<Project | null>(null)
  const [form, setForm] = useState<ProjectFormValues>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const [projectList, channelList] = await Promise.all([
      api.projects.list({ projectType, query: query || undefined }),
      api.channels.list({ channelType: projectType }),
    ])
    setProjects(projectList)
    setChannels(channelList)
  }, [api, projectType, query])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const refresh = () => {
      void load()
    }
    const stopProjects = onProjectsChanged(refresh)
    const stopVideos = onVideosChanged(refresh)
    return () => {
      stopProjects()
      stopVideos()
    }
  }, [load])

  const publishedProjects = useMemo(
    () => projects.filter((project) => project.scheduledVideoStatus === 'publicado'),
    [projects],
  )
  const activeProjects = useMemo(
    () => projects.filter((project) => project.scheduledVideoStatus !== 'publicado'),
    [projects],
  )
  const musicProjects = useMemo(
    () => projects.filter((project) => !hasLinkedVideo(project)),
    [projects],
  )
  const videoProjects = useMemo(
    () => projects.filter((project) => hasLinkedVideo(project)),
    [projects],
  )
  const visibleProjects =
    tab === 'published'
      ? publishedProjects
      : tab === 'music'
        ? musicProjects
        : tab === 'videos'
          ? videoProjects
          : activeProjects

  useEffect(() => {
    setTab(projectType === 'music' ? 'videos' : 'active')
  }, [projectType])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(project: Project) {
    setEditing(project)
    setForm({
      name: project.name,
      description: project.description,
      channelId: project.channelId ?? '',
    })
    setModalOpen(true)
  }

  async function saveProject() {
    if (!form.name.trim()) {
      push('Informe o nome do projeto.', 'error')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        const updated = await api.projects.update(editing.id, {
          name: form.name.trim(),
          description: form.description.trim(),
          channelId: form.channelId || null,
        })
        if (!updated) throw new Error('Projeto não encontrado.')
        setModalOpen(false)
        setEditing(null)
        setForm(EMPTY_FORM)
        push('Projeto atualizado.', 'success')
        notifyProjectsChanged()
        await load()
        return
      }
      const project = await api.projects.create({
        name: form.name.trim(),
        description: form.description.trim(),
        projectType,
        channelId: form.channelId || null,
      })
      setModalOpen(false)
      setForm(EMPTY_FORM)
      notifyProjectsChanged()
      navigate(projectPath(projectType, project.id))
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao salvar projeto', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await api.projects.remove(deleting.id, {
        alsoRemovePublication: Boolean(deleting.scheduledVideoId),
      })
      push(
        deleting.scheduledVideoId
          ? 'Projeto e publicação removidos.'
          : 'Projeto removido.',
        'success',
      )
      setDeleting(null)
      notifyProjectsChanged()
      await load()
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao remover projeto', 'error')
    }
  }

  return (
    <PageShell>
      <PageHeader
        breadcrumb={environmentBreadcrumb(projectType)}
        title={env.label}
        subtitle={env.tagline}
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Buscar projeto de ${env.label}...`}
            className="h-11 w-full rounded-xl border border-border bg-card-2 pl-10 pr-3 text-sm text-text placeholder:text-muted-2 focus:border-accent/50 focus:outline-none"
          />
        </div>
        {projectType === 'history' ? (
          <>
            <Button
              variant="secondary"
              icon={<Files className="h-4 w-4" />}
              onClick={() => navigate('/historia/roteiros')}
            >
              Roteiros
            </Button>
            <Button
              variant="secondary"
              icon={<Tag className="h-4 w-4" />}
              onClick={() => navigate('/historia/nichos')}
            >
              Nichos
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            icon={<Scissors className="h-4 w-4" />}
            onClick={() => navigate('/musica/faixas')}
          >
            Faixas
          </Button>
        )}
        <Button
          icon={<Plus className="h-4 w-4" />}
          style={{ backgroundColor: env.color }}
          onClick={openCreate}
        >
          Novo projeto
        </Button>
      </div>

      <div
        role="tablist"
        aria-label={projectType === 'music' ? 'Vídeos e música' : 'Lista de projetos'}
        className="mb-5 inline-flex rounded-xl border border-border bg-card-2 p-1"
      >
        {projectType === 'music' ? (
          <>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'videos'}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                tab === 'videos' ? 'bg-accent-dark text-accent' : 'text-muted hover:text-text',
              )}
              style={tab === 'videos' ? { backgroundColor: `${env.color}1f`, color: env.color } : undefined}
              onClick={() => setTab('videos')}
            >
              <Clapperboard className="h-3.5 w-3.5" />
              Vídeos
              {videoProjects.length > 0 ? (
                <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] tabular-nums">
                  {videoProjects.length}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'music'}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                tab === 'music' ? 'bg-accent-dark text-accent' : 'text-muted hover:text-text',
              )}
              onClick={() => setTab('music')}
            >
              <Music2 className="h-3.5 w-3.5" />
              Música
              {musicProjects.length > 0 ? (
                <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] tabular-nums">
                  {musicProjects.length}
                </span>
              ) : null}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'active'}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                tab === 'active' ? 'bg-accent-dark text-accent' : 'text-muted hover:text-text',
              )}
              style={tab === 'active' ? { backgroundColor: `${env.color}1f`, color: env.color } : undefined}
              onClick={() => setTab('active')}
            >
              <FolderKanban className="h-3.5 w-3.5" />
              Projetos
              {activeProjects.length > 0 ? (
                <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] tabular-nums">
                  {activeProjects.length}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'published'}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                tab === 'published' ? 'bg-accent-dark text-accent' : 'text-muted hover:text-text',
              )}
              onClick={() => setTab('published')}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Publicados
              {publishedProjects.length > 0 ? (
                <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] tabular-nums">
                  {publishedProjects.length}
                </span>
              ) : null}
            </button>
          </>
        )}
      </div>

      {visibleProjects.length === 0 ? (
        <Card className="flex flex-col items-center py-14 text-center">
          {tab === 'videos' ? (
            <Clapperboard className="h-8 w-8 text-muted-2" />
          ) : (
            <env.icon className="h-8 w-8 text-muted-2" />
          )}
          <p className="mt-3 text-sm font-medium text-text">
            {query
              ? 'Nenhum projeto encontrado'
              : tab === 'published'
                ? 'Nenhum projeto publicado'
                : tab === 'videos'
                  ? 'Nenhum vídeo neste ambiente'
                  : tab === 'music'
                    ? 'Nenhum projeto de música ainda'
                    : `Nenhum projeto de ${env.label} ainda`}
          </p>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">
            {tab === 'published'
              ? 'Quando o vídeo do projeto for marcado como Publicado, ele sai do calendário e da agenda e o projeto aparece aqui.'
              : tab === 'videos'
                ? 'Quando o projeto tiver uma publicação no canal, ele aparece aqui como vídeo, separado das faixas.'
                : env.description}
          </p>
          {!query && tab !== 'published' && tab !== 'videos' ? (
            <Button
              className="mt-5"
              icon={<Plus className="h-4 w-4" />}
              style={{ backgroundColor: env.color }}
              onClick={openCreate}
            >
              Criar primeiro projeto
            </Button>
          ) : null}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleProjects.map((project) => (
            <Card
              key={project.id}
              className="flex cursor-pointer flex-col gap-3 transition-colors hover:border-[#334049]"
              onClick={() => navigate(projectPath(projectType, project.id))}
            >
              {tab === 'videos' ? (
                <MusicPublicationCard
                  bare
                  compact
                  title={project.scheduledVideoTitle || project.name}
                  description={project.scheduledVideoDescription}
                  thumbnailDataUrl={project.scheduledVideoThumbnailDataUrl}
                  channelName={project.scheduledVideoChannelName || project.channelName}
                  scheduledDate={project.scheduledDate}
                  status={project.scheduledVideoStatus}
                />
              ) : (
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${env.color}1f`, color: env.color }}
                  >
                    <env.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[15px] font-semibold text-text">{project.name}</h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                      {project.description || 'Sem descrição'}
                    </p>
                    <p className="mt-1.5 truncate text-xs text-muted-2">
                      {project.channelName ? `Canal: ${project.channelName}` : 'Sem canal vinculado'}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-muted">
                <span>
                  {projectType === 'history'
                    ? `${project.scriptCount ?? 0} ${(project.scriptCount ?? 0) === 1 ? 'roteiro' : 'roteiros'}`
                    : `${project.trackCount ?? 0} ${(project.trackCount ?? 0) === 1 ? 'faixa' : 'faixas'}`}
                </span>
                <span>{formatRelativeDate(project.updatedAt)}</span>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-muted-2">
                <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {project.projectFolderPath || 'Nenhuma pasta vinculada'}
                </span>
              </div>

              <div className="mt-auto flex justify-end gap-2">
                <Button
                  variant="ghost"
                  className="h-9 px-3 text-xs"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleting(project)
                  }}
                >
                  Excluir
                </Button>
                <Button
                  variant="secondary"
                  className="h-9 px-3 text-xs"
                  icon={<Pencil className="h-3.5 w-3.5" />}
                  onClick={(e) => {
                    e.stopPropagation()
                    openEdit(project)
                  }}
                >
                  Editar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ProjectEditorModal
        open={modalOpen}
        projectType={projectType}
        channels={channels}
        editing={editing}
        form={form}
        saving={saving}
        onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
        onClose={() => {
          setModalOpen(false)
          setEditing(null)
        }}
        onSubmit={() => void saveProject()}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Excluir projeto?"
        message={
          deleting?.scheduledVideoId
            ? 'Este projeto possui um vídeo no canal. Excluir o projeto também remove esse registro. Os arquivos físicos não serão apagados.'
            : 'O projeto será removido do Atlas. Os arquivos da pasta do projeto não serão apagados.'
        }
        confirmLabel={deleting?.scheduledVideoId ? 'Excluir projeto e publicação' : 'Excluir projeto'}
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleting(null)}
      />
    </PageShell>
  )
}
