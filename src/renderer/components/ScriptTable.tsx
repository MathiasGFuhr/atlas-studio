import { ArrowDown, MoreHorizontal } from 'lucide-react'
import type { ScriptRecord } from '@shared/types'
import { Button } from './Button'
import { StatusBadge } from './StatusBadge'

export function ScriptTable({
  scripts,
  onOpen,
}: {
  scripts: ScriptRecord[]
  onOpen: (id: string) => void
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border-soft bg-card">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border-soft text-xs text-muted">
            <th className="px-4 py-3 font-medium">Título</th>
            <th className="px-4 py-3 font-medium">Nicho</th>
            <th className="px-4 py-3 font-medium">Idioma</th>
            <th className="px-4 py-3 font-medium">
              <span className="inline-flex items-center gap-1">
                Data <ArrowDown className="h-3 w-3" />
              </span>
            </th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Ações</th>
          </tr>
        </thead>
        <tbody>
          {scripts.map((script) => (
            <tr
              key={script.id}
              className="border-b border-border-soft/70 transition-colors last:border-0 hover:bg-white/[0.02]"
            >
              <td className="max-w-[min(28rem,40vw)] truncate px-4 py-3.5 font-medium text-text" title={script.title}>
                {script.title}
              </td>
              <td className="px-4 py-3.5 text-muted">{script.nicheName}</td>
              <td className="px-4 py-3.5 text-muted">{script.language}</td>
              <td className="px-4 py-3.5 text-muted">
                {new Date(script.createdAt).toLocaleDateString('pt-BR')}
              </td>
              <td className="px-4 py-3.5">
                <StatusBadge status={script.status} />
              </td>
              <td className="px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    className="h-8 px-3 text-xs"
                    onClick={() => onOpen(script.id)}
                  >
                    Abrir
                  </Button>
                  <button
                    type="button"
                    className="rounded-lg p-1.5 text-muted hover:bg-white/5"
                    aria-label="Abrir roteiro"
                    onClick={() => onOpen(script.id)}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
