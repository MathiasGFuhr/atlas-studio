import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Clapperboard, FileText, MessageSquare, Music2, Pencil, Plus, Scissors, Trash2 } from 'lucide-react'
import type { Channel, Project, ProjectType, ScriptRecord } from '@shared/types'
import type { MusicTrack } from '@shared/musicAnalysis'
import { formatTimecode } from '@shared/musicAnalysis'
import { channelVideoPath } from '@shared/channelVideos'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/Modal'
import {
  ProjectEditorModal,
  type ProjectFormValues,
} from '../components/ProjectEditorModal'
import { StatusBadge } from '../components/StatusBadge'
import { MusicPublicationCard } from '../components/MusicPublicationCard'
import { ProjectFolderPanel } from '../components/ProjectFolderPanel'
import { getAtlasApi } from '../lib/api'
import { notifyProjectsChanged } from '../lib/projectEvents'
import { onVideosChanged } from '../lib/videoEvents'
import { useToast } from '../components/Toast'
import { openAtlasChat } from '../lib/chatEvents'
import { ENVIRONMENTS, environmentBreadcrumb } from '../lib/environments'
import { formatRelativeDate } from '../lib/utils'

/**
 * Tela de um projeto. O conteúdo listado depende do ambiente:
 * História mostra roteiros, Música mostra faixas do cortador.
 */
export function ProjectDetailPage({ projectType }: { projectType: ProjectType }) {
  const api = getAtlasApi()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { push } = useToast()
  const env = ENVIRONMENTS[projectType]

  const [project, setProject] = useState<Project | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [scripts, setScripts] = useState<ScriptRecord[]>([])
  const [tracks, setTracks] = useState<MusicTrack[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<ProjectFormValues>({ name: '', description: '', channelId: '' })

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const found = await api.projects.get(id)
      if (!found) {
        push('Projeto não encontrado.', 'error')
        navigate(env.basePath, { replace: true })
        return
      }
      // Projeto aberto pela rota do ambiente errado: redireciona sem perder o contexto.
      if (found.projectType !== projectType) {
        navigate(`${ENVIRONMENTS[found.projectType].projectsPath}/${found.id}`, { replace: true })
        return
      }
      setProject(found)
      const [channelList, content] = await Promise.all([
        api.channels.list({ channelType: projectType }),
        found.projectType === 'history'
          ? api.scripts.list({ projectId: found.id })
          : api.music.list({ projectId: found.id }),
      ])
      setChannels(channelList)
      if (found.projectType === 'history') {
        setScripts(content as ScriptRecord[])
      } else {
        setTracks(content as MusicTrack[])
      }
    } finally {
      setLoading(false)
    }
  }, [api, env.basePath, id, navigate, projectType, push])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    return onVideosChanged(() => {
      void load()
    })
  }, [load])

  async function importTrack() {
    if (!project) return
    setImporting(true)
    try {
      const track = await api.music.import(project.id)
      if (!track) return
      push('Música importada. Abrindo o editor de cortes.', 'success')
      navigate(`/musica/faixas/${track.id}`)
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao importar a música', 'error')
    } finally {
      setImporting(false)
    }
  }

  function openEdit() {
    if (!project) return
    setForm({
      name: project.name,
      description: project.description,
      channelId: project.channelId ?? '',
    })
    setEditOpen(true)
  }

  async function saveProject() {
    if (!project) return
    if (!form.name.trim()) {
      push('Informe o nome do projeto.', 'error')
      return
    }
    setSaving(true)
    try {
      const updated = await api.projects.update(project.id, {
        name: form.name.trim(),
        description: form.description.trim(),
        channelId: form.channelId || null,
      })
      if (!updated) throw new Error('Projeto não encontrado.')
      setProject(updated)
      setEditOpen(false)
      notifyProjectsChanged()
      push('Projeto atualizado.', 'success')
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao salvar projeto', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function removeProject() {
    if (!project) return
    setConfirmDelete(false)
    try {
      await api.projects.remove(project.id, {
        alsoRemovePublication: Boolean(project.scheduledVideoId),
      })
      notifyProjectsChanged()
      push(
        project.scheduledVideoId ? 'Projeto e publicação removidos.' : 'Projeto removido.',
        'success',
      )
      navigate(env.basePath, { replace: true })
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao remover projeto', 'error')
    }
  }

  if (loading && !project) {
    return <div className="p-8 text-sm text-muted">Carregando projeto...</div>
  }
  if (!project) return null

  return (
    <PageShell>
      <Button
        variant="ghost"
        className="mb-3 h-9 px-2 text-xs"
        icon={<ArrowLeft className="h-3.5 w-3.5" />}
        onClick={() => navigate(env.basePath)}
      >
        Voltar para {env.label}
      </Button>

      <PageHeader
        breadcrumb={environmentBreadcrumb(projectType, project.name)}
        title={project.name}
        subtitle={project.description || env.tagline}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          {projectType === 'music' && project.scheduledVideoId ? (
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-text">Publicação</h2>
              <MusicPublicationCard
                title={project.scheduledVideoTitle || project.name}
                description={project.scheduledVideoDescription}
                thumbnailDataUrl={project.scheduledVideoThumbnailDataUrl}
                channelName={project.scheduledVideoChannelName || project.channelName}
                scheduledDate={project.scheduledDate}
                status={project.scheduledVideoStatus}
                onOpen={
                  project.scheduledVideoChannelId
                    ? () =>
                        navigate(
                          channelVideoPath(
                            project.scheduledVideoChannelId!,
                            project.scheduledVideoId!,
                            project.scheduledVideoStatus === 'publicado'
                              ? { tab: 'publicados' }
                              : undefined,
                          ),
                        )
                    : undefined
                }
              />
            </div>
          ) : null}

          <div data-tour="page-actions" className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-text">
              {projectType === 'history' ? 'Roteiros do projeto' : 'Faixas do projeto'}
            </h2>
            {projectType === 'history' ? (
              <Button
                icon={<Plus className="h-4 w-4" />}
                style={{ backgroundColor: env.color }}
                onClick={() => navigate(`/historia/criar?projectId=${project.id}`)}
              >
                Criar roteiro
              </Button>
            ) : (
              <Button
                icon={<Plus className="h-4 w-4" />}
                style={{ backgroundColor: env.color }}
                disabled={importing}
                onClick={() => void importTrack()}
              >
                {importing ? 'Importando...' : 'Importar música'}
              </Button>
            )}
          </div>

          {projectType === 'history' ? (
            scripts.length === 0 ? (
              <EmptyState
                icon={<FileText className="h-8 w-8 text-muted-2" />}
                title="Nenhum roteiro neste projeto"
                message="Gere um roteiro para começar. As Skills e os Nichos da sua biblioteca continuam disponíveis."
              />
            ) : (
              <div className="space-y-3">
                {scripts.map((script) => (
                  <Card
                    key={script.id}
                    padding="sm"
                    className="flex cursor-pointer items-center gap-3 transition-colors hover:border-[#334049]"
                    onClick={() => navigate(`/historia/roteiros/${script.id}`)}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-dark text-accent">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-text">{script.title}</div>
                      <div className="text-xs text-muted-2">
                        {script.nicheName ? `${script.nicheName} · ` : ''}
                        {formatRelativeDate(script.updatedAt)}
                      </div>
                    </div>
                    <StatusBadge status={script.status} />
                  </Card>
                ))}
              </div>
            )
          ) : tracks.length === 0 ? (
            <EmptyState
              icon={<Music2 className="h-8 w-8 text-muted-2" />}
              title="Nenhuma faixa neste projeto"
              message="Importe uma música para o Atlas analisar o áudio e montar os cortes."
            />
          ) : (
            <div className="space-y-3">
              {tracks.map((track) => (
                <Card
                  key={track.id}
                  padding="sm"
                  className="flex cursor-pointer items-center gap-3 transition-colors hover:border-[#334049]"
                  onClick={() => navigate(`/musica/faixas/${track.id}`)}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${env.color}1f`, color: env.color }}
                  >
                    <Scissors className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-text">{track.name}</div>
                    <div className="text-xs text-muted-2">
                      {formatTimecode(track.duration)} · {track.cuts.length}{' '}
                      {track.cuts.length === 1 ? 'corte' : 'cortes'}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <Button
            variant="secondary"
            fullWidth
            className="h-9 text-xs"
            icon={<Clapperboard className="h-3.5 w-3.5" />}
            onClick={() => navigate(`/shorts?projectId=${project.id}`)}
          >
            Abrir Shorts Studio
          </Button>

          <Button
            variant="secondary"
            fullWidth
            className="h-9 text-xs"
            icon={<MessageSquare className="h-3.5 w-3.5" />}
            onClick={() => openAtlasChat({ projectId: project.id })}
          >
            Conversar com IA
          </Button>

          <Button
            variant="secondary"
            fullWidth
            className="h-9 text-xs"
            icon={<Pencil className="h-3.5 w-3.5" />}
            onClick={openEdit}
          >
            Editar projeto
          </Button>

          <ProjectFolderPanel project={project} onChange={setProject} />

          <Card padding="sm" className="space-y-2 text-xs text-muted">
            <div className="flex justify-between gap-3">
              <span>Canal</span>
              <span className="truncate text-right text-text">
                {project.channelName || 'Sem canal vinculado'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Ambiente</span>
              <span style={{ color: env.color }}>{env.label}</span>
            </div>
            <div className="flex justify-between">
              <span>Criado</span>
              <span>{formatRelativeDate(project.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span>Atualizado</span>
              <span>{formatRelativeDate(project.updatedAt)}</span>
            </div>
          </Card>

          <Button
            variant="ghost"
            fullWidth
            className="h-9 text-xs"
            icon={<Trash2 className="h-3.5 w-3.5" />}
            onClick={() => setConfirmDelete(true)}
          >
            Remover projeto
          </Button>
        </aside>
      </div>

      <ProjectEditorModal
        open={editOpen}
        projectType={projectType}
        channels={channels}
        editing={project}
        form={form}
        saving={saving}
        onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
        onClose={() => setEditOpen(false)}
        onSubmit={() => void saveProject()}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Excluir projeto?"
        message={
          project.scheduledVideoId
            ? 'Este projeto possui um vídeo no canal. Excluir o projeto também remove esse registro. Os arquivos físicos não serão apagados.'
            : 'O projeto será removido do Atlas. Os arquivos da pasta do projeto não serão apagados.'
        }
        confirmLabel={project.scheduledVideoId ? 'Excluir projeto e publicação' : 'Excluir projeto'}
        onConfirm={() => void removeProject()}
        onClose={() => setConfirmDelete(false)}
      />
    </PageShell>
  )
}

function EmptyState({
  icon,
  title,
  message,
}: {
  icon: ReactNode
  title: string
  message: string
}) {
  return (
    <Card className="flex flex-col items-center py-12 text-center">
      {icon}
      <p className="mt-3 text-sm font-medium text-text">{title}</p>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">{message}</p>
    </Card>
  )
}
