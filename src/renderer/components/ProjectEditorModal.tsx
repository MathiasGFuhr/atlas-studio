import { Tv } from 'lucide-react'
import type { Channel, Project, ProjectType } from '@shared/types'
import { Button } from './Button'
import { Input } from './Input'
import { Modal } from './Modal'
import { Textarea } from './Textarea'
import { ENVIRONMENTS } from '../lib/environments'
import { cn } from '../lib/utils'

export type ProjectFormValues = {
  name: string
  description: string
  channelId: string
}

export function ProjectEditorModal({
  open,
  projectType,
  channels,
  editing,
  form,
  saving,
  onChange,
  onClose,
  onSubmit,
}: {
  open: boolean
  projectType: ProjectType
  channels: Channel[]
  editing: Project | null
  form: ProjectFormValues
  saving: boolean
  onChange: (patch: Partial<ProjectFormValues>) => void
  onClose: () => void
  onSubmit: () => void
}) {
  const env = ENVIRONMENTS[projectType]

  return (
    <Modal
      open={open}
      title={editing ? `Editar projeto de ${env.label}` : `Novo projeto de ${env.label}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={saving} style={{ backgroundColor: env.color }} onClick={onSubmit}>
            {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar projeto'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input
          label="Nome do projeto"
          value={form.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={projectType === 'history' ? 'Ex.: Impérios esquecidos' : 'Ex.: Trilha do canal'}
        />
        <Textarea
          label="Descrição (opcional)"
          value={form.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />

        <div>
          <p className="mb-2 text-sm font-medium text-muted">Canal (opcional)</p>
          {channels.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-3 py-3 text-xs leading-relaxed text-muted">
              Nenhum canal cadastrado neste ambiente. Você pode salvar o projeto mesmo assim.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => onChange({ channelId: '' })}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                  form.channelId
                    ? 'border-border bg-card-2 hover:border-[#334049]'
                    : 'border-accent/50 bg-accent/10',
                )}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-muted-2">
                  <Tv className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">Sem canal</p>
                  <p className="truncate text-[11px] text-muted-2">Salvar sem vincular</p>
                </div>
              </button>
              {channels.map((channel) => {
                const selected = form.channelId === channel.id
                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => onChange({ channelId: channel.id })}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                      selected
                        ? 'border-accent/50 bg-accent/10'
                        : 'border-border bg-card-2 hover:border-[#334049]',
                    )}
                  >
                    <div
                      className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-border-soft"
                      style={{ background: `linear-gradient(145deg, ${channel.color}33, #10161a)` }}
                    >
                      {channel.avatarDataUrl ? (
                        <img src={channel.avatarDataUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Tv className="h-4 w-4" style={{ color: channel.color }} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text">{channel.name}</p>
                      <p className="truncate text-[11px] text-muted-2">
                        {channel.description || 'Sem descrição'}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
