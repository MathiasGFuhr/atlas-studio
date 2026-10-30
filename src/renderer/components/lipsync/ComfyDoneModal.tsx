import { Button } from '../Button'
import { Modal } from '../Modal'

export function ComfyDoneModal({
  notice,
  onOk,
}: {
  notice: {
    projectName: string
    doneCount: number
    errorCount: number
  } | null
  onOk: () => void
}) {
  if (!notice) return null

  const name = notice.projectName.trim() || 'Projeto'
  const body =
    notice.errorCount > 0 && notice.doneCount === 0
      ? `O projeto “${name}” terminou, mas nenhuma cena ficou pronta.`
      : notice.errorCount > 0
        ? `O projeto “${name}” terminou. ${notice.doneCount} ${notice.doneCount === 1 ? 'cena pronta' : 'cenas prontas'}, ${notice.errorCount} com erro.`
        : notice.doneCount === 1
          ? `O projeto “${name}” terminou. 1 cena pronta.`
          : `O projeto “${name}” terminou. ${notice.doneCount} cenas prontas.`

  return (
    <Modal
      open
      title="Geração concluída"
      onClose={onOk}
      footer={
        <Button type="button" onClick={onOk}>
          Ok
        </Button>
      }
    >
      <p className="text-sm leading-relaxed text-muted">{body}</p>
    </Modal>
  )
}
