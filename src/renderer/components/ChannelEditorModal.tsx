import { FolderOpen, FolderSearch, ImagePlus } from 'lucide-react'
import type { Channel, ChannelType, Niche } from '@shared/types'
import { PROJECT_TYPE_LABEL } from '@shared/types'
import { getAtlasApi } from '../lib/api'
import { Button } from './Button'
import { Input } from './Input'
import { Modal } from './Modal'
import { Select } from './Select'
import { Textarea } from './Textarea'
import { useToast } from './Toast'

export const CHANNEL_COLORS = ['#35e58b', '#5b8cff', '#f0b429', '#f07178', '#c084fc', '#38bdf8']

export type ChannelFormValues = {
  name: string
  description: string
  nicheId: string
  youtubeUrl: string
  color: string
  channelType: ChannelType
  active: boolean
  folderPath: string | null
}

export const EMPTY_CHANNEL_FORM: ChannelFormValues = {
  name: '',
  description: '',
  nicheId: '',
  youtubeUrl: '',
  color: CHANNEL_COLORS[0],
  channelType: 'music',
  active: true,
  folderPath: null,
}

export function ChannelEditorModal({
  open,
  editing,
  form,
  niches,
  pendingAvatar,
  saving,
  allowedTypes,
  hideNiche,
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
  allowedTypes?: ChannelType[]
  hideNiche?: boolean
  onChange: (patch: Partial<ChannelFormValues>) => void
  onClose: () => void
  onSubmit: () => void
  onPickAvatar: () => void
}) {
  const api = getAtlasApi()
  const { push, pushError } = useToast()
  const types = allowedTypes?.length ? allowedTypes : (['history', 'music'] as ChannelType[])
  const folderTitle = form.channelType === 'music' ? 'Pasta do artista' : 'Pasta do canal'

  async function pickFolder() {
    const folder = await api.dialog.selectFolder({
      title: folderTitle,
      defaultPath: form.folderPath || undefined,
    })
    if (folder) onChange({ folderPath: folder })
  }

  async function openFolder() {
    if (!form.folderPath) return
    try {
      await api.system.openPath(form.folderPath)
    } catch (error) {
      pushError(error, 'Falha ao abrir a pasta')
    }
  }
  const nicheOptions = [
    { value: '', label: 'Nenhum nicho vinculado' },
    ...niches.map((n) => ({ value: n.id, label: n.name })),
  ]
  const showNiche = false

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
          value={types.includes(form.channelType) ? form.channelType : types[0]}
          onChange={(e) => onChange({ channelType: e.target.value as ChannelType })}
          options={types.map((type) => ({ value: type, label: PROJECT_TYPE_LABEL[type] }))}
        />
        {showNiche ? (
        <Select
          label="Nicho vinculado"
          value={form.nicheId}
          onChange={(e) => onChange({ nicheId: e.target.value })}
          options={nicheOptions}
        />
        ) : null}
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
          <p className="mb-2 text-sm font-medium text-muted">{folderTitle}</p>
          {form.folderPath ? (
            <>
              <p className="mb-2 break-all rounded-xl border border-border-soft bg-card-2 px-3 py-2.5 font-mono text-xs text-muted">
                {form.folderPath}
              </p>
              {editing?.folderPath === form.folderPath && editing.folderExists === false ? (
                <p className="mb-2 text-xs text-yellow-500/80">A pasta vinculada não foi encontrada no disco.</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 px-3 text-xs"
                  icon={<FolderOpen className="h-3.5 w-3.5" />}
                  onClick={() => void openFolder()}
                >
                  Abrir pasta
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 px-3 text-xs"
                  icon={<FolderSearch className="h-3.5 w-3.5" />}
                  onClick={() => void pickFolder()}
                >
                  Alterar pasta
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 px-3 text-xs"
                  onClick={() => onChange({ folderPath: null })}
                >
                  Desvincular
                </Button>
              </div>
            </>
          ) : (
            <Button
              type="button"
              variant="secondary"
              className="h-9 px-3 text-xs"
              icon={<FolderSearch className="h-3.5 w-3.5" />}
              onClick={() => void pickFolder()}
            >
              Vincular pasta
            </Button>
          )}
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
