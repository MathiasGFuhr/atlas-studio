import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2,
  Clock3,
  FileText,
  ListTodo,
  Plus,
  Search,
  Sparkles,
  Upload,
  Pencil,
} from 'lucide-react'
import type { Niche, ScriptRecord } from '@shared/types'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { ScriptTable } from '../components/ScriptTable'
import { Select } from '../components/Select'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { getAtlasApi } from '../lib/api'
import { environmentBreadcrumb } from '../lib/environments'
import { formatRelativeDate } from '../lib/utils'

export function ScriptsPage() {
  const api = getAtlasApi()
  const navigate = useNavigate()
  const [scripts, setScripts] = useState<ScriptRecord[]>([])
  const [niches, setNiches] = useState<Niche[]>([])
  const [query, setQuery] = useState('')
  const [nicheId, setNicheId] = useState('Todos')
  const [language, setLanguage] = useState('Todos')
  const [summary, setSummary] = useState({
    total: 0,
    prontos: 0,
    rascunhos: 0,
    emRevisao: 0,
    erros: 0,
  })

  useEffect(() => {
    void (async () => {
      const [list, nicheList, stats] = await Promise.all([
        api.scripts.list({
          query: query || undefined,
          nicheId: nicheId === 'Todos' ? undefined : nicheId,
          language: language === 'Todos' ? undefined : language,
        }),
        api.niches.list(),
        api.scripts.summary(),
      ])
      setScripts(list)
      setNiches(nicheList)
      setSummary(stats)
    })()
  }, [api, query, nicheId, language])

  const languages = ['Todos', 'Alemão', 'Inglês', 'Português']

  return (
    <PageShell>
      <div className="grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0">
          <PageHeader
            breadcrumb={environmentBreadcrumb('history', 'Roteiros')}
            title="Roteiros"
            subtitle="Encontre, abra e continue seus roteiros gerados."
          />

          <div className="mb-5 flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1 sm:min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar roteiro..."
                className="h-11 w-full min-w-0 rounded-xl border border-border bg-card-2 pl-10 pr-3 text-sm text-text placeholder:text-muted-2 focus:border-accent/50 focus:outline-none"
              />
            </div>
            <div className="w-full min-w-0 sm:w-[180px]">
              <Select
                value={nicheId}
                onChange={(e) => setNicheId(e.target.value)}
                options={[
                  { value: 'Todos', label: 'Nicho: Todos' },
                  ...niches.map((n) => ({ value: n.id, label: n.name })),
                ]}
              />
            </div>
            <div className="w-full min-w-0 sm:w-[160px]">
              <Select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                options={languages.map((l) => ({
                  value: l,
                  label: l === 'Todos' ? 'Idioma: Todos' : l,
                }))}
              />
            </div>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/historia/criar')}>
              Novo roteiro
            </Button>
          </div>

          <div id="lista-roteiros">
            <ScriptTable scripts={scripts} onOpen={(id) => navigate(`/historia/roteiros/${id}`)} />
          </div>

          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-text">Atividade recente</h2>
              <button
                type="button"
                className="text-sm text-muted hover:text-accent"
                onClick={() => {
                  document.getElementById('lista-roteiros')?.scrollIntoView({ behavior: 'smooth' })
                }}
              >
                Ver todas &gt;
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {scripts.slice(0, 3).map((script, index) => {
                const Icon = index === 0 ? Plus : index === 1 ? Pencil : Upload
                const label =
                  index === 0 ? 'Roteiro criado' : index === 1 ? 'Roteiro revisado' : 'Roteiro exportado'
                return (
                  <Card
                    key={script.id}
                    padding="sm"
                    className="flex cursor-pointer items-center gap-3 transition-colors hover:border-[#334049]"
                    onClick={() => navigate(`/historia/roteiros/${script.id}`)}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-dark text-accent">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-muted">{label}</div>
                      <div className="truncate text-sm font-medium text-text">{script.title}</div>
                      <div className="text-xs text-muted-2">{formatRelativeDate(script.createdAt)}</div>
                    </div>
                  </Card>
                )
              })}
            </div>
          </section>
        </div>

        <aside className="min-w-0">
          <h3 className="mb-4 text-sm font-semibold text-text">Resumo</h3>
          <div className="grid grid-cols-2 gap-3 2xl:grid-cols-1">
            {[
              { label: 'Total', value: summary.total, icon: FileText },
              { label: 'Prontos', value: summary.prontos, icon: CheckCircle2 },
              { label: 'Rascunhos', value: summary.rascunhos, icon: ListTodo },
              { label: 'Em revisão', value: summary.emRevisao, icon: Clock3 },
            ].map((item) => (
              <Card key={item.label} padding="sm" className="flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card-2 text-accent">
                    <item.icon className="h-4 w-4" />
                  </div>
                  <span className="text-sm text-muted">{item.label}</span>
                </div>
                <span className="text-lg font-semibold text-text">{item.value}</span>
              </Card>
            ))}
          </div>
          <Button
            fullWidth
            className="mt-5 h-11"
            icon={<Sparkles className="h-4 w-4" />}
            onClick={() => navigate('/historia/criar')}
          >
            Gerar roteiro
          </Button>
        </aside>
      </div>
    </PageShell>
  )
}
