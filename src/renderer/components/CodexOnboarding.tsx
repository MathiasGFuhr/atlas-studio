import { Modal } from './Modal'
import { Button } from './Button'

export function CodexOnboarding({
  open,
  onLink,
  onSkip,
}: {
  open: boolean
  onLink: () => void
  onSkip: () => void
}) {
  return (
    <Modal open={open} title="Conecte o Codex" onClose={onSkip}>
      <div className="space-y-5 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-dark">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M4 18L12 4L20 18H15.5L12 11.5L8.5 18H4Z"
              fill="currentColor"
              className="text-accent"
            />
          </svg>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-text">Pronto para gerar com IA</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            O Atlas usa o Codex para pesquisar, escrever e revisar seus roteiros.
            Vincule sua conta para começar a gerar conteúdo.
          </p>
        </div>

        <div className="space-y-3">
          <Button fullWidth className="h-12 text-[15px] font-semibold" onClick={onLink}>
            Vincular com ChatGPT
          </Button>

          <button
            type="button"
            onClick={onSkip}
            className="w-full py-2 text-sm text-muted transition-colors hover:text-text"
          >
            Pular por enquanto
          </button>
        </div>
      </div>
    </Modal>
  )
}
