import { ImagePlus } from 'lucide-react'
import type { Channel, ChannelType, Niche } from '@shared/types'
import { PROJECT_TYPE_LABEL } from '@shared/types'
import { Button } from './Button'
import { Input } from './Input'
import { Modal } from './Modal'
import { Select } from './Select'
import { Textarea } from './Textarea'

export const CHANNEL_COLORS = ['#35e58b', '#5b8cff', '#f0b429', '#f07178', '#c084fc', '#38bdf8']

export type ChannelFormValues = {
  name: string
  description: string
  nicheId: string
  youtubeUrl: string
  color: string
  channelType: ChannelType
  active: boolean
}

export const EMPTY_CHANNEL_FORM: ChannelFormValues = {
  name: '',
  description: '',
  nicheId: '',
  youtubeUrl: '',
  color: CHANNEL_COLORS[0],
  channelType: 'history',
  active: true,
}

export function ChannelEditorModal({
  open,
  editing,
  form,
  niches,
  pendingAvatar,
  saving,
  onChange,
  onClose,
  onSubmit,
  onPickAvatar,
}: {
  open: boolean
  editing: Channel | null
  form: ChannelFormValues
  niches: Niche[]
  pendingAvatar: string | null
  saving?: boolean
  onChange: (patch: Partial<ChannelFormValues>) => void
  onClose: () => void
  onSubmit: () => void
  onPickAvatar: () => void
}) {
  const nicheOptions = [
    { value: '', label: 'Nenhum nicho vinculado' },
    ...niches.map((n) => ({ value: n.id, label: n.name })),
  ]

  return (
    <Modal
      open={open}
      title={editing ? 'Editar canal' : 'Novo canal'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={saving} onClick={onSubmit}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input
          label="Nome do canal"
          value={form.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <Textarea
          label="Descrição"
          value={form.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
        <Select
          label="Ambiente"
          value={form.channelType}
          onChange={(e) => onChange({ channelType: e.target.value as ChannelType })}
          options={[
            { value: 'history', label: PROJECT_TYPE_LABEL.history },
            { value: 'music', label: PROJECT_TYPE_LABEL.music },
          ]}
        />
        <Select
          label="Nicho vinculado"
          value={form.nicheId}
          onChange={(e) => onChange({ nicheId: e.target.value })}
          options={nicheOptions}
        />
        <Input
          label="URL do YouTube"
          value={form.youtubeUrl}
          onChange={(e) => onChange({ youtubeUrl: e.target.value })}
          placeholder="https://youtube.com/@canal"
        />
        <div>
          <p className="mb-2 text-sm font-medium text-muted">Cor do calendário</p>
          <div className="flex flex-wrap gap-2">
            {CHANNEL_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Cor ${color}`}
                onClick={() => onChange({ color })}
                className="h-8 w-8 rounded-full border-2"
                style={{
                  background: color,
                  borderColor: form.color === color ? '#fff' : 'transparent',
                }}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-muted">Foto do canal</p>
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 overflow-hidden rounded-xl border border-border bg-card-2">
              {editing?.avatarDataUrl ? (
                <img src={editing.avatarDataUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-2">
                  <ImagePlus className="h-5 w-5" />
                </div>
              )}
            </div>
            <Button variant="secondary" className="h-9 px-3 text-xs" onClick={onPickAvatar}>
              {pendingAvatar ? 'Imagem selecionada' : 'Escolher imagem'}
            </Button>
          </div>
        </div>
        <Select
          label="Status"
          value={form.active ? 'ativo' : 'inativo'}
          onChange={(e) => onChange({ active: e.target.value === 'ativo' })}
          options={[
            { value: 'ativo', label: 'Ativo' },
            { value: 'inativo', label: 'Inativo' },
          ]}
        />
      </div>
    </Modal>
  )
}
