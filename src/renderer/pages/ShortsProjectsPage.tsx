import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Clapperboard, Plus, Search } from 'lucide-react'
import type { ShortsJob } from '@shared/shorts'
import {
  exportedShortsCount,
  matchesShortsProjectSearch,
  shortsProjectDeleteMessage,
} from '@shared/shortsProject'
import type { ShortsImportResult } from '@shared/shortsProjectIdentity'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { ConfirmDialog, Modal } from '../components/Modal'
import { ShortsProjectCard } from '../components/shorts/ShortsProjectCard'
import { getAtlasApi } from '../lib/api'
import { useToast } from '../components/Toast'

export function ShortsProjectsPage() {
  const api = getAtlasApi()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const projectId = params.get('projectId')
  const { push } = useToast()

  const [projects, setProjects] = useState<ShortsJob[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [renaming, setRenaming] = useState<ShortsJob | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleting, setDeleting] = useState<ShortsJob | null>(null)
  const [existingImport, setExistingImport] = useState<ShortsImportResult | null>(null)

  const load = useCallback(async () => {
    const list = await api.shorts.list(projectId ? { projectId } : undefined)
    setProjects(list)
  }, [api, projectId])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(
    () => projects.filter((project) => matchesShortsProjectSearch(project, query)),
    [projects, query],
  )
  const exportedTotal = useMemo(
    () => projects.reduce((sum, project) => sum + exportedShortsCount(project.clips), 0),
    [projects],
  )

  function editorPath(id: string) {
    return projectId ? `/shorts/${id}?projectId=${encodeURIComponent(projectId)}` : `/shorts/${id}`
  }

  async function createProject() {
    setBusy(true)
    try {
      const result = await api.shorts.import(projectId)
      if (!result) return
      if (result.kind === 'existing') {
        setExistingImport(result)
        return
      }
      push('Projeto criado. O arquivo original permanece no lugar.', 'success')
      navigate(editorPath(result.project.id))
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao criar o projeto de Shorts', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function openExistingProject() {
    if (!existingImport) return
    const id = existingImport.project.id
    setExistingImport(null)
    navigate(editorPath(id))
  }

  async function forceCreateAnother() {
    if (!existingImport) return
    setBusy(true)
    try {
      const result = await api.shorts.createFromSourceVideo({
        sourcePath: existingImport.sourcePath,
        projectId,
        forceNew: true,
      })
      setExistingImport(null)
      push('Novo projeto criado a partir do mesmo vídeo.', 'success')
      navigate(editorPath(result.project.id))
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao criar o projeto de Shorts', 'error')
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
      const updated = await api.shorts.updateSettings(renaming.id, { name })
      if (updated) {
        setProjects((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      }
      setRenaming(null)
      push('Projeto renomeado.', 'success')
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao renomear o projeto', 'error')
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await api.shorts.remove(deleting.id)
      setProjects((current) => current.filter((item) => item.id !== deleting.id))
      setDeleting(null)
      push('Projeto excluído. O vídeo original e os exports foram preservados.', 'success')
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao excluir o projeto', 'error')
    }
  }

  return (
    <PageShell>
      <PageHeader
        breadcrumb="Atlas / Shorts Studio"
        title="SHORTS STUDIO"
        subtitle="Transforme vídeos completos em conteúdos verticais."
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar projeto..."
            className="h-11 w-full rounded-xl border border-border bg-card-2 pl-10 pr-3 text-sm text-text placeholder:text-muted-2 focus:border-accent/50 focus:outline-none"
          />
        </div>
        <Button icon={<Plus className="h-4 w-4" />} disabled={busy} onClick={() => void createProject()}>
          Novo Shorts
        </Button>
      </div>

      {projects.length > 0 ? (
        <p className="mb-4 text-xs text-muted-2">
          {projects.length} {projects.length === 1 ? 'projeto' : 'projetos'}
          {exportedTotal > 0
            ? ` · ${exportedTotal} ${exportedTotal === 1 ? 'Short exportado' : 'Shorts exportados'}`
            : ''}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <Card className="flex flex-col items-center py-16 text-center">
          <Clapperboard className="h-10 w-10 text-muted-2" />
          <p className="mt-3 text-sm font-medium text-text">
            {query ? 'Nenhum projeto encontrado' : 'Nenhum projeto de Shorts ainda.'}
          </p>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">
            {query
              ? 'Tente buscar pelo nome, arquivo original ou perfil.'
              : 'Importe um vídeo e deixe o Atlas encontrar os melhores momentos.'}
          </p>
          {!query ? (
            <Button
              className="mt-5"
              icon={<Plus className="h-4 w-4" />}
              disabled={busy}
              onClick={() => void createProject()}
            >
              Criar primeiro Shorts
            </Button>
          ) : null}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((project) => (
            <ShortsProjectCard
              key={project.id}
              project={project}
              onOpen={() => navigate(editorPath(project.id))}
              onRename={() => {
                setRenaming(project)
                setRenameValue(project.name)
              }}
              onDelete={() => setDeleting(project)}
            />
          ))}
        </div>
      )}

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
          id="shorts-project-rename"
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
        title="Excluir projeto de Shorts?"
        message={deleting ? shortsProjectDeleteMessage(exportedShortsCount(deleting.clips)) : ''}
        confirmLabel="Excluir projeto"
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleting(null)}
      />

      <Modal
        open={Boolean(existingImport)}
        title="Este vídeo já possui um projeto no Shorts Studio."
        onClose={() => setExistingImport(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setExistingImport(null)}>
              Cancelar
            </Button>
            {existingImport?.reason === 'same_source' ? (
              <Button variant="secondary" disabled={busy} onClick={() => void forceCreateAnother()}>
                Criar outro projeto
              </Button>
            ) : null}
            <Button disabled={busy} onClick={() => void openExistingProject()}>
              Abrir projeto existente
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-muted">
          {existingImport?.reason === 'export_of_existing'
            ? 'Este arquivo é um Short já exportado. O Atlas vai abrir o projeto do vídeo original em vez de criar um card novo.'
            : 'O comportamento padrão é reabrir o projeto existente. Criar outro projeto é uma ação explícita e gera um segundo card para o mesmo vídeo.'}
        </p>
        {existingImport ? (
          <p className="mt-3 truncate text-xs text-muted-2">{existingImport.project.name}</p>
        ) : null}
      </Modal>
    </PageShell>
  )
}
