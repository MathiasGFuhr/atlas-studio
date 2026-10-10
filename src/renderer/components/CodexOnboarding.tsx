import { AtlasLogo } from './AtlasLogo'
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
        <AtlasLogo
          variant="mark"
          className="mx-auto h-16 w-16 rounded-2xl shadow-[0_0_24px_rgba(53,229,139,0.2)]"
        />

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
