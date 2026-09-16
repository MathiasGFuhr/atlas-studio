import type { TaskCategory, TaskPriority, TaskRelatedType } from '@shared/types'
import {
  TASK_CATEGORIES,
  TASK_CATEGORY_LABEL,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_RELATED_LABEL,
} from '@shared/tasks'
import { Button } from './Button'
import { Input } from './Input'
import { Modal } from './Modal'
import { Select } from './Select'
import { Textarea } from './Textarea'

export type TaskFormValues = {
  title: string
  description: string
  category: TaskCategory
  priority: TaskPriority
  dueDate: string
  relatedType: '' | TaskRelatedType
  relatedId: string
}

export const EMPTY_TASK_FORM: TaskFormValues = {
  title: '',
  description: '',
  category: 'general',
  priority: 'normal',
  dueDate: '',
  relatedType: '',
  relatedId: '',
}

export function TaskEditorModal({
  open,
  editing,
  form,
  relatedOptions,
  saving,
  onChange,
  onClose,
  onSubmit,
}: {
  open: boolean
  editing: boolean
  form: TaskFormValues
  relatedOptions: Array<{ value: string; label: string }>
  saving: boolean
  onChange: (patch: Partial<TaskFormValues>) => void
  onClose: () => void
  onSubmit: () => void
}) {
  return (
    <Modal
      open={open}
      title={editing ? 'Editar tarefa' : 'Nova tarefa'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            {editing ? 'Salvar' : 'Criar tarefa'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          label="Título"
          value={form.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Ex.: Cadastrar canal Abraham Cole"
          autoFocus
        />
        <Textarea
          label="Descrição (opcional)"
          value={form.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Detalhes, se precisar"
          className="min-h-[88px]"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label="Categoria"
            value={form.category}
            options={TASK_CATEGORIES.map((value) => ({
              value,
              label: TASK_CATEGORY_LABEL[value],
            }))}
            onChange={(e) => onChange({ category: e.target.value as TaskCategory })}
          />
          <Select
            label="Prioridade"
            value={form.priority}
            options={TASK_PRIORITIES.map((value) => ({
              value,
              label: TASK_PRIORITY_LABEL[value],
            }))}
            onChange={(e) => onChange({ priority: e.target.value as TaskPriority })}
          />
        </div>
        <Input
          label="Prazo (opcional)"
          type="date"
          value={form.dueDate}
          onChange={(e) => onChange({ dueDate: e.target.value })}
        />
        <Select
          label="Relacionar com (opcional)"
          value={form.relatedType}
          options={[
            { value: '', label: 'Nada — tarefa geral' },
            { value: 'history', label: TASK_RELATED_LABEL.history },
            { value: 'music', label: TASK_RELATED_LABEL.music },
            { value: 'channel', label: TASK_RELATED_LABEL.channel },
          ]}
          onChange={(e) =>
            onChange({
              relatedType: e.target.value as '' | TaskRelatedType,
              relatedId: '',
            })
          }
        />
        {form.relatedType ? (
          <Select
            label={form.relatedType === 'channel' ? 'Canal' : 'Projeto'}
            value={form.relatedId}
            options={relatedOptions}
            onChange={(e) => onChange({ relatedId: e.target.value })}
          />
        ) : null}
      </div>
    </Modal>
  )
}
