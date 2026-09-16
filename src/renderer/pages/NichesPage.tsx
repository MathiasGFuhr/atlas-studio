import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, FolderOpen, Lightbulb, Plus, RefreshCw, Search } from 'lucide-react'
import type { DiscoveredSkill, Niche, SkillScanReport } from '@shared/types'
import { PageHeader } from '../components/PageHeader'
import { NicheCard } from '../components/NicheCard'
import { Button } from '../components/Button'
import { Select } from '../components/Select'
import { Modal } from '../components/Modal'
import { Input } from '../components/Input'
import { Textarea } from '../components/Textarea'
import { getAtlasApi } from '../lib/api'
import { useToast } from '../components/Toast'
import { Card } from '../components/Card'
import { environmentBreadcrumb } from '../lib/environments'

function normalizePath(value: string): string {
  return value.trim().replace(/[/\\]+/g, '\\').replace(/\\+$/, '').toLowerCase()
}

function basenameOf(value: string): string {
  return value.split(/[/\\]/).filter(Boolean).pop()?.trim().toLowerCase() ?? ''
}

function skillIsLinkedToNiche(skill: DiscoveredSkill, niches: Niche[]): boolean {
  const skillPath = normalizePath(skill.path)
  const skillName = skill.name.trim().toLowerCase()
  return niches.some((niche) => {
    const nichePath = normalizePath(niche.skillPath)
    const nicheSkillName = basenameOf(niche.skillPath)
    return Boolean(
      (skillPath && nichePath && skillPath === nichePath) ||
        (skillName && nicheSkillName && skillName === nicheSkillName),
    )
  })
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export function NichesPage() {
  const api = getAtlasApi()
  const { push } = useToast()
  const [searchParams] = useSearchParams()
  const [niches, setNiches] = useState<Niche[]>([])
  const [allNiches, setAllNiches] = useState<Niche[]>([])
  const [skills, setSkills] = useState<DiscoveredSkill[]>([])
  const [scanReport, setScanReport] = useState<SkillScanReport | null>(null)
  const [showScanLog, setShowScanLog] = useState(false)
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '')
  const [language, setLanguage] = useState('Todos')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Niche | null>(null)
  const [rescanning, setRescanning] = useState(false)
  const [form, setForm] = useState({
    name: '',
    defaultLanguage: 'Português',
    description: '',
    skillPath: '',
    scriptsPath: '',
    memoryPath: '',
    active: true,
  })

  async function load() {
    const [filtered, all] = await Promise.all([
      api.niches.list({
        query: query || undefined,
        language: language === 'Todos' ? undefined : language,
      }),
      api.niches.list(),
    ])
    setNiches(filtered)
    setAllNiches(all)
  }

  async function loadSkills(forceRescan = false) {
    try {
      if (forceRescan) {
        setRescanning(true)
        const result = await api.skills.rescan()
        setSkills(result.skills)
        setScanReport(result.report)
        const onlyOne = result.total <= 1
        setShowScanLog(onlyOne)
        if (onlyOne) {
          console.warn('[atlas][skills] diagnóstico do rescan', result.report)
        }
        const nichesNote =
          result.nichesCreated && result.nichesCreated > 0
            ? ` · ${countLabel(result.nichesCreated, 'nicho criado', 'nichos criados')}`
            : ''
        push(
          `${countLabel(result.total, 'skill detectada', 'skills detectadas')}${nichesNote}`,
          'success',
        )
      } else {
        const list = await api.skills.list()
        setSkills(list)
      }
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao carregar skills', 'error')
    } finally {
      setRescanning(false)
    }
  }

  useEffect(() => {
    const fromUrl = searchParams.get('q')
    if (fromUrl != null) setQuery(fromUrl)
  }, [searchParams])

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, language])

  useEffect(() => {
    void loadSkills(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const languages = useMemo(
    () => ['Todos', ...Array.from(new Set(niches.map((n) => n.defaultLanguage)))],
    [niches],
  )

  const selectedSkill = useMemo(
    () => skills.find((s) => s.path === form.skillPath) ?? null,
    [skills, form.skillPath],
  )

  const unassociatedSkills = useMemo(
    () => skills.filter((s) => !skillIsLinkedToNiche(s, allNiches)),
    [skills, allNiches],
  )

  const skillOptions = useMemo(() => {
    const options = skills.map((s) => ({ value: s.path, label: s.name }))
    if (form.skillPath && !options.some((o) => o.value === form.skillPath)) {
      const basename = form.skillPath.split(/[/\\]/).filter(Boolean).pop() ?? form.skillPath
      options.unshift({ value: form.skillPath, label: `${basename} (fora da lista)` })
    }
    return [{ value: '', label: 'Selecione uma skill…' }, ...options]
  }, [skills, form.skillPath])

  function openCreate(preselectedSkillPath?: string) {
    setEditing(null)
    setForm({
      name: '',
      defaultLanguage: 'Português',
      description: '',
      skillPath: preselectedSkillPath ?? '',
      scriptsPath: '',
      memoryPath: '',
      active: true,
    })
    setModalOpen(true)
    void loadSkills(false)
  }

  function openEdit(niche: Niche) {
    setEditing(niche)
    setForm({
      name: niche.name,
      defaultLanguage: niche.defaultLanguage,
      description: niche.description,
      skillPath: niche.skillPath,
      scriptsPath: niche.scriptsPath ?? '',
      memoryPath: niche.memoryPath,
      active: niche.active,
    })
    setModalOpen(true)
    void loadSkills(false)
  }

  async function pickScriptsFolder() {
    const folder = await api.dialog.selectFolder()
    if (folder) setForm((f) => ({ ...f, scriptsPath: folder }))
  }

  async function openSkillFolder() {
    if (!form.skillPath) {
      push('Selecione uma skill primeiro.', 'error')
      return
    }
    try {
      await api.system.openPath(form.skillPath)
    } catch (error) {
      push(error instanceof Error ? error.message : 'Não foi possível abrir a pasta', 'error')
    }
  }

  async function save() {
    try {
      if (!form.name.trim() || !form.skillPath.trim()) {
        push('Nome e skill associada são obrigatórios.', 'error')
        return
      }

      const validation = await api.skills.validate(form.skillPath)
      if (validation.status === 'invalid') {
        push(validation.issues[0] ?? 'Skill inválida.', 'error')
        return
      }

      const memoryPath = form.memoryPath.trim()

      const payload = {
        ...form,
        memoryPath,
        scriptsPath: form.scriptsPath.trim(),
        thumbnail: editing?.thumbnail ?? null,
      }

      if (editing) {
        await api.niches.update(editing.id, payload)
        push('Nicho atualizado.', 'success')
      } else {
        await api.niches.create(payload)
        push('Nicho criado.', 'success')
      }
      setModalOpen(false)
      await load()
    } catch (error) {
      push(error instanceof Error ? error.message : 'Falha ao salvar nicho', 'error')
    }
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <PageHeader
        breadcrumb={environmentBreadcrumb('history', 'Nichos')}
        title="Nichos"
        subtitle="Escolha o nicho que o sistema vai usar para escrever seus roteiros."
      />

      <p className="mb-4 text-xs text-muted-2">
        {countLabel(skills.length, 'skill detectada', 'skills detectadas')}
        {' · '}
        {countLabel(allNiches.length, 'nicho configurado', 'nichos configurados')}
        {' · '}
        {countLabel(unassociatedSkills.length, 'skill sem nicho', 'skills sem nicho')}
      </p>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar nicho..."
            className="h-11 w-full rounded-xl border border-border bg-card-2 pl-10 pr-3 text-sm text-text placeholder:text-muted-2 focus:border-accent/50 focus:outline-none"
          />
        </div>
        <div className="w-[180px]">
          <Select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            options={languages.map((l) => ({ value: l, label: l === 'Todos' ? 'Idioma: Todos' : l }))}
          />
        </div>
        <Button
          variant="secondary"
          icon={<RefreshCw className={`h-4 w-4 ${rescanning ? 'animate-spin' : ''}`} />}
          onClick={() => void loadSkills(true)}
          disabled={rescanning}
        >
          Rescanear skills
        </Button>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => openCreate()}>
          Novo nicho
        </Button>
      </div>

      {showScanLog && scanReport ? (
        <Card className="mb-5">
          <p className="text-xs font-medium text-muted">Diagnóstico do scan</p>
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed text-muted-2">
            {`root pesquisado:\n${scanReport.libraryRoot || '(vazio)'}\n\nSKILL.md encontrados (${scanReport.skillMdFound.length}):\n${scanReport.skillMdFound.join('\n') || '—'}\n\ndiretórios visitados (${scanReport.visitedDirectories.length}):\n${scanReport.visitedDirectories.join('\n') || '—'}\n\ndiretórios ignorados (${scanReport.ignoredDirectories.length}):\n${
              scanReport.ignoredDirectories.map((d) => `${d.path} (${d.reason})`).join('\n') || '—'
            }\n\nerros de filesystem (${scanReport.filesystemErrors.length}):\n${
              scanReport.filesystemErrors.map((e) => `${e.path}: ${e.error}`).join('\n') || '—'
            }`}
          </pre>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {niches.map((niche, index) => (
          <NicheCard key={niche.id} niche={niche} index={index} onEdit={() => openEdit(niche)} />
        ))}
        {unassociatedSkills.map((skill) => (
          <Card key={skill.path} className="flex flex-col gap-4 border-dashed">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-2">
                Skill disponível
              </p>
              <h3 className="mt-2 font-mono text-[15px] font-semibold text-text">{skill.name}</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Detectada na biblioteca. Ainda não há nicho usando esta skill.
              </p>
            </div>
            <div className="mt-auto">
              <Button className="h-9 px-3 text-xs" onClick={() => openCreate(skill.path)}>
                Criar nicho usando esta skill
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-text">
            <Lightbulb className="h-4 w-4 text-accent" />
            Como o nicho funciona
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted">
            {['Carrega a skill certa', 'Define o tom editorial', 'Evita roteiros repetitivos'].map(
              (item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  <Check className="h-4 w-4 text-accent" />
                  {item}
                </span>
              ),
            )}
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-muted-2">
          1 sistema. Vários nichos. A mesma praticidade.
        </p>
      </Card>

      <Modal
        open={modalOpen}
        title={editing ? 'Editar nicho' : 'Novo nicho'}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void save()}>Salvar</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="Nome do nicho"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Select
            label="Idioma padrão"
            value={form.defaultLanguage}
            onChange={(e) => setForm((f) => ({ ...f, defaultLanguage: e.target.value }))}
            options={['Português', 'Alemão', 'Inglês', 'Espanhol'].map((l) => ({
              value: l,
              label: l,
            }))}
          />
          <Textarea
            label="Descrição"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />

          <div>
            <Select
              label="Skill associada"
              value={form.skillPath}
              onChange={(e) => setForm((f) => ({ ...f, skillPath: e.target.value }))}
              options={skillOptions}
            />
            {form.skillPath ? (
              <p className="mt-1.5 break-all text-[11px] leading-relaxed text-muted-2">
                {form.skillPath}
              </p>
            ) : null}
            {selectedSkill?.validationStatus === 'warning' ? (
              <p className="mt-1 text-[11px] text-muted">{selectedSkill.validationMessage}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                className="h-9 px-3 text-xs"
                icon={<FolderOpen className="h-3.5 w-3.5" />}
                onClick={() => void openSkillFolder()}
                disabled={!form.skillPath}
              >
                Abrir pasta
              </Button>
              <Button
                variant="secondary"
                className="h-9 px-3 text-xs"
                icon={<RefreshCw className={`h-3.5 w-3.5 ${rescanning ? 'animate-spin' : ''}`} />}
                onClick={() => void loadSkills(true)}
                disabled={rescanning}
              >
                Atualizar lista
              </Button>
            </div>
          </div>

          <div className="flex items-end gap-2">
            <Input
              label="Pasta de roteiros do projeto"
              value={form.scriptsPath}
              onChange={(e) => setForm((f) => ({ ...f, scriptsPath: e.target.value }))}
              placeholder="Opcional — ex.: .../roteiros"
            />
            <Button variant="secondary" className="h-11 shrink-0" onClick={() => void pickScriptsFolder()}>
              Pasta
            </Button>
          </div>

          <Input
            label="Pasta de memória editorial"
            value={form.memoryPath}
            onChange={(e) => setForm((f) => ({ ...f, memoryPath: e.target.value }))}
            placeholder="Opcional"
          />
          <Select
            label="Status"
            value={form.active ? 'ativo' : 'inativo'}
            onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === 'ativo' }))}
            options={[
              { value: 'ativo', label: 'Ativo' },
              { value: 'inativo', label: 'Inativo' },
            ]}
          />
        </div>
      </Modal>
    </div>
  )
}
