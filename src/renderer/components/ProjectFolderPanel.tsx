import { useState } from 'react'
import { AlertTriangle, FolderOpen, FolderPlus, FolderSearch } from 'lucide-react'
import type { Project } from '@shared/types'
import { Card } from './Card'
import { Button } from './Button'
import { getAtlasApi } from '../lib/api'
import { useToast } from './Toast'

/**
 * Vínculo entre um projeto do Atlas e uma pasta física no computador.
 * Todas as operações de disco passam pelo IPC (renderer → preload → main).
 */
export function ProjectFolderPanel({
  project,
  onChange,
}: {
  project: Project
  onChange: (project: Project) => void
}) {
  const api = getAtlasApi()
  const { push } = useToast()
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<Project | null>, successMessage: string) {
    setBusy(true)
    try {
      const updated = await action()
      if (!updated) return
      onChange(updated)
      push(successMessage, 'success')
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha na operação de pasta', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function openFolder() {
    setBusy(true)
    try {
      await api.projects.openFolder(project.id)
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao abrir a pasta', 'error')
    } finally {
      setBusy(false)
    }
  }

  const linked = Boolean(project.projectFolderPath)

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <FolderOpen className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold text-text">Pasta do projeto</h3>
      </div>

      {linked ? (
        <>
          <p className="break-all rounded-xl border border-border-soft bg-card-2 px-3 py-2.5 font-mono text-xs text-muted">
            {project.projectFolderPath}
          </p>
          {project.folderExists === false ? (
            <p className="flex items-center gap-1.5 text-xs text-yellow-500/80">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              A pasta vinculada não foi encontrada no disco.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              className="h-9 px-3 text-xs"
              icon={<FolderOpen className="h-3.5 w-3.5" />}
              disabled={busy || project.folderExists === false}
              onClick={() => void openFolder()}
            >
              Abrir pasta
            </Button>
            <Button
              variant="ghost"
              className="h-9 px-3 text-xs"
              disabled={busy}
              onClick={() =>
                void run(() => api.projects.linkFolder(project.id), 'Pasta do projeto atualizada.')
              }
            >
              Alterar pasta
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs leading-relaxed text-muted">
            Nenhuma pasta vinculada a este projeto.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              className="h-9 px-3 text-xs"
              icon={<FolderPlus className="h-3.5 w-3.5" />}
              disabled={busy}
              onClick={() =>
                void run(() => api.projects.createFolder(project.id), 'Pasta criada e vinculada.')
              }
            >
              Criar pasta
            </Button>
            <Button
              variant="secondary"
              className="h-9 px-3 text-xs"
              icon={<FolderSearch className="h-3.5 w-3.5" />}
              disabled={busy}
              onClick={() =>
                void run(() => api.projects.linkFolder(project.id), 'Pasta vinculada ao projeto.')
              }
            >
              Selecionar pasta existente
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}
