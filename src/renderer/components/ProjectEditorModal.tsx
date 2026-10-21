import { ImagePlus, Tv } from 'lucide-react'
import type { Channel, ChannelVideoStatus, Project, ProjectType } from '@shared/types'
import { Button } from './Button'
import { Input } from './Input'
import { Modal } from './Modal'
import { Select } from './Select'
import { Textarea } from './Textarea'
import { ENVIRONMENTS } from '../lib/environments'
import { cn } from '../lib/utils'

export type ProjectFormValues = {
  name: string
  description: string
  channelId: string
  /** Título da publicação no YouTube (quando há vídeo vinculado). */
  publicationTitle: string
  /** Descrição do vídeo (quando há vídeo vinculado). */
  publicationDescription: string
  scheduledDate: string
  publicationStatus: ChannelVideoStatus
}

export const EMPTY_PROJECT_FORM: ProjectFormValues = {
  name: '',
  description: '',
  channelId: '',
  publicationTitle: '',
  publicationDescription: '',
  scheduledDate: '',
  publicationStatus: 'colocando',
}

export function projectToFormValues(project: Project): ProjectFormValues {
  return {
    name: project.name,
    description: project.description,
    channelId: project.channelId ?? '',
    publicationTitle: project.scheduledVideoTitle || project.name,
    publicationDescription: project.scheduledVideoDescription ?? '',
    scheduledDate: project.scheduledDate ?? '',
    publicationStatus: project.scheduledVideoStatus ?? 'colocando',
  }
}

function ChannelPicker({
  channels,
  channelId,
  label,
  emptyHint,
  onChange,
}: {
  channels: Channel[]
  channelId: string
  label: string
  emptyHint: string
  onChange: (channelId: string) => void
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-muted">{label}</p>
      {channels.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-3 text-xs leading-relaxed text-muted">
          {emptyHint}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onChange('')}
            className={cn(
              'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
              channelId
                ? 'border-border bg-elevated hover:border-border-strong'
                : 'border-accent/50 bg-accent/10',
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-elevated text-muted-2">
              <Tv className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text">Sem canal</p>
              <p className="truncate text-[11px] text-muted-2">Salvar sem vincular</p>
            </div>
          </button>
          {channels.map((channel) => {
            const selected = channelId === channel.id
            return (
              <button
                key={channel.id}
                type="button"
                onClick={() => onChange(channel.id)}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                  selected
                    ? 'border-accent/50 bg-accent/10'
                    : 'border-border bg-elevated hover:border-border-strong',
                )}
              >
                <div
                  className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-border-soft"
                  style={{ background: `linear-gradient(145deg, ${channel.color}33, var(--color-elevated))` }}
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
  )
}

function ScheduleFields({
  form,
  thumbPreviewSrc,
  onChange,
  onPickThumbnail,
}: {
  form: ProjectFormValues
  thumbPreviewSrc?: string | null
  onChange: (patch: Partial<ProjectFormValues>) => void
  onPickThumbnail?: () => void
}) {
  return (
    <>
      <Input
        label="Título da publicação"
        value={form.publicationTitle}
        onChange={(e) => onChange({ publicationTitle: e.target.value })}
        placeholder="Título que vai no YouTube"
      />
      <Textarea
        label="Descrição da publicação"
        value={form.publicationDescription}
        onChange={(e) => onChange({ publicationDescription: e.target.value })}
        placeholder="Descrição do vídeo"
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="Agendado para"
          type="date"
          value={form.scheduledDate}
          onChange={(e) => onChange({ scheduledDate: e.target.value })}
        />
        <Select
          label="Status"
          value={form.publicationStatus}
          onChange={(e) => onChange({ publicationStatus: e.target.value as ChannelVideoStatus })}
          options={[
            { value: 'colocando', label: 'Colocando' },
            { value: 'editando', label: 'Editando' },
            { value: 'agendando', label: 'Agendando' },
            { value: 'publicado', label: 'Publicado' },
          ]}
        />
      </div>
      {onPickThumbnail ? (
        <div>
          <p className="mb-2 text-sm font-medium text-muted">Thumbnail</p>
          <div className="flex items-start gap-3">
            <div className="h-[90px] w-[160px] overflow-hidden rounded-xl border border-border bg-elevated">
              {thumbPreviewSrc ? (
                <img
                  src={thumbPreviewSrc}
                  alt="Preview da thumbnail"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-2">
                  <ImagePlus className="h-5 w-5" />
                </div>
              )}
            </div>
            <Button variant="secondary" className="h-9 px-3 text-xs" onClick={onPickThumbnail}>
              Escolher thumb
            </Button>
          </div>
        </div>
      ) : null}
    </>
  )
}

export function ProjectEditorModal({
  open,
  projectType,
  channels,
  editing,
  form,
  saving,
  thumbPreviewSrc,
  allowScheduleOnCreate = false,
  onChange,
  onPickThumbnail,
  onClose,
  onSubmit,
}: {
  open: boolean
  projectType: ProjectType
  channels: Channel[]
  editing: Project | null
  form: ProjectFormValues
  saving: boolean
  thumbPreviewSrc?: string | null
  /** No create, mostra título/descrição/data/status para agendar no canal. */
  allowScheduleOnCreate?: boolean
  onChange: (patch: Partial<ProjectFormValues>) => void
  onPickThumbnail?: () => void
  onClose: () => void
  onSubmit: () => void
}) {
  const env = ENVIRONMENTS[projectType]
  const hasPublication = Boolean(editing?.scheduledVideoId)
  const scheduleOnCreate = allowScheduleOnCreate && !editing
  const showScheduleFields = hasPublication || (scheduleOnCreate && Boolean(form.channelId))

  const channelPicker = (
    <ChannelPicker
      channels={channels}
      channelId={form.channelId}
      label={scheduleOnCreate ? 'Canal' : 'Canal (opcional)'}
      emptyHint={
        scheduleOnCreate
          ? 'Cadastre um canal de Música para vincular e agendar a publicação.'
          : 'Nenhum canal cadastrado neste ambiente. Você pode salvar o projeto mesmo assim.'
      }
      onChange={(channelId) => onChange({ channelId })}
    />
  )

  return (
    <Modal
      open={open}
      title={editing ? `Editar projeto de ${env.label}` : `Novo projeto de ${env.label}`}
      size={showScheduleFields || scheduleOnCreate ? 'xl' : 'lg'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={saving} onClick={onSubmit}>
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
          placeholder="Ex.: Trilha do canal"
        />

        {scheduleOnCreate ? (
          <>
            {channelPicker}
            {form.channelId ? (
              <>
                <p className="text-xs text-muted">
                  Preencha a data para já agendar a publicação neste canal. Sem data, só o projeto é
                  criado.
                </p>
                <ScheduleFields
                  form={form}
                  thumbPreviewSrc={thumbPreviewSrc}
                  onChange={onChange}
                  onPickThumbnail={onPickThumbnail}
                />
              </>
            ) : null}
            <Textarea
              label="Descrição do projeto (opcional)"
              value={form.description}
              onChange={(e) => onChange({ description: e.target.value })}
            />
          </>
        ) : (
          <>
            {showScheduleFields ? (
              <>
                <ScheduleFields
                  form={form}
                  thumbPreviewSrc={thumbPreviewSrc}
                  onChange={onChange}
                  onPickThumbnail={onPickThumbnail}
                />
                <Textarea
                  label="Descrição do projeto (opcional)"
                  value={form.description}
                  onChange={(e) => onChange({ description: e.target.value })}
                />
              </>
            ) : (
              <Textarea
                label="Descrição (opcional)"
                value={form.description}
                onChange={(e) => onChange({ description: e.target.value })}
              />
            )}
            {channelPicker}
          </>
        )}
      </div>
    </Modal>
  )
}
