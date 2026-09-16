import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { nicheRepository } from '../../repositories/nicheRepository'
import { scriptRepository } from '../../repositories/scriptRepository'
import { settingsRepository } from '../../repositories/settingsRepository'
import type { CodexService } from '../codex/CodexService'
import { logger } from '../logging/logger'
import type { Niche, ScriptRecord, ScriptVersion } from '../../../shared/types'

const SKILL_PATH =
  'C:\\Users\\Mathias e Josi\\Documents\\ChatGPT\\Histórias esquecidas, guerras, impérios e decisões que mudaram o mundo\\roteirista-historia-retencao-pt'

const SCRIPTS_PATH =
  'C:\\Users\\Mathias e Josi\\Documents\\ChatGPT\\Histórias esquecidas, guerras, impérios e decisões que mudaram o mundo\\roteiros'

const TOPIC = 'A fábrica alemã que sustentou uma cidade inteira e depois desapareceu'
const LANGUAGE = 'Alemão'
const ADJUST =
  'Deixe a abertura mais forte, menos genérica e mais específica, sem alterar os fatos.'

export type E2EChecklist = Record<string, boolean | string>

export async function runRealFlowTest(codexService: CodexService): Promise<{
  ok: boolean
  checklist: E2EChecklist
  scriptId?: string
}> {
  const checklist: E2EChecklist = {
    codex_detectado: false,
    codex_versao: false,
    codex_autenticado: false,
    app_server_ativo: false,
    skill_correta: false,
    codex_executou: false,
    roteiro_retornado: false,
    roteiro_em_alemao: false,
    salvo_sqlite: false,
    markdown_criado: false,
    aparece_biblioteca: false,
    ajuste_cria_v2: false,
    v1_intacta: false,
  }

  logger.info('e2e.start', { topic: TOPIC, language: LANGUAGE, skillPath: SKILL_PATH })

  settingsRepository.update({
    skillLibraryRoot:
      'C:\\Users\\Mathias e Josi\\Documents\\ChatGPT',
    skillsPath: 'C:\\Users\\Mathias e Josi\\Documents\\ChatGPT',
    defaultLanguage: LANGUAGE,
  })

  const niche = ensureTestNiche()
  checklist.skill_correta = path.resolve(niche.skillPath) === path.resolve(SKILL_PATH)

  const status = await codexService.connect()
  checklist.codex_detectado = Boolean(status.runtimePath)
  checklist.codex_versao = Boolean(status.codexVersion)
  checklist.codex_autenticado = Boolean(status.connected && status.authenticated)
  checklist.app_server_ativo = Boolean(status.appServerRunning)

  if (!status.connected) {
    checklist.erro = status.message
    return { ok: false, checklist }
  }

  const generated = await codexService.generateScript({
    nicheId: niche.id,
    language: LANGUAGE,
    topic: TOPIC,
    durationMinutes: 15,
    outputStyle: 'profissional',
    researchMode: 'automatica',
  })

  checklist.codex_executou = true
  checklist.roteiro_retornado = Boolean(generated.script.content?.trim())
  checklist.roteiro_em_alemao = looksGerman(generated.script.content)
  checklist.salvo_sqlite = Boolean(scriptRepository.get(generated.script.id))

  const v1File = path.join(generated.script.folderPath ?? '', 'script-v1.md')
  checklist.markdown_criado = fs.existsSync(v1File)

  const inLibrary = scriptRepository.list().some((s: ScriptRecord) => s.id === generated.script.id)
  checklist.aparece_biblioteca = inLibrary

  const v1Content = scriptRepository
    .versions(generated.script.id)
    .find((v: ScriptVersion) => v.versionNumber === 1)?.content

  const adjusted = await codexService.adjustScript({
    scriptId: generated.script.id,
    instruction: ADJUST,
  })

  checklist.ajuste_cria_v2 = adjusted.version.versionNumber >= 2
  const stillV1 = scriptRepository
    .versions(generated.script.id)
    .find((v: ScriptVersion) => v.versionNumber === 1)
  checklist.v1_intacta = Boolean(stillV1 && v1Content && stillV1.content === v1Content)

  const v2File = path.join(adjusted.script.folderPath ?? '', `script-v${adjusted.version.versionNumber}.md`)
  if (!fs.existsSync(v2File)) {
    checklist.markdown_criado = false
  }

  const ok = Object.entries(checklist)
    .filter(([k]) => k !== 'erro')
    .every(([, v]) => v === true)

  const reportPath = path.join(app.getPath('userData'), 'e2e-last-report.json')
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        ok,
        checklist,
        scriptId: generated.script.id,
        folderPath: adjusted.script.folderPath,
        title: adjusted.script.title,
        versions: scriptRepository.versions(generated.script.id).map((v: ScriptVersion) => ({
          n: v.versionNumber,
          chars: v.content.length,
        })),
        at: new Date().toISOString(),
      },
      null,
      2,
    ),
    { encoding: 'utf8' },
  )

  logger.info('e2e.done', { ok, reportPath, scriptId: generated.script.id })
  return { ok, checklist, scriptId: generated.script.id }
}

function ensureTestNiche() {
  const existing = nicheRepository
    .list()
    .find((n: Niche) => path.resolve(n.skillPath) === path.resolve(SKILL_PATH))
  if (existing) {
    return (
      nicheRepository.update(existing.id, {
        name: 'Histórias Esquecidas',
        defaultLanguage: LANGUAGE,
        description: 'Histórias esquecidas, guerras, impérios e decisões que mudaram o mundo.',
        skillPath: SKILL_PATH,
        scriptsPath: SCRIPTS_PATH,
        memoryPath: '',
        active: true,
      }) ?? existing
    )
  }

  return nicheRepository.create({
    name: 'Histórias Esquecidas',
    defaultLanguage: LANGUAGE,
    description: 'Histórias esquecidas, guerras, impérios e decisões que mudaram o mundo.',
    skillPath: SKILL_PATH,
    scriptsPath: SCRIPTS_PATH,
    memoryPath: '',
    thumbnail: null,
    active: true,
  })
}

function looksGerman(content: string): boolean {
  const sample = content.slice(0, 2500).toLowerCase()
  const markers = [
    ' der ',
    ' die ',
    ' das ',
    ' und ',
    ' nicht ',
    ' war ',
    ' eine ',
    ' einer ',
    ' den ',
    ' dem ',
    ' mit ',
    ' auf ',
    ' für ',
    'ß',
    'ä',
    'ö',
    'ü',
  ]
  const hits = markers.filter((m) => sample.includes(m)).length
  return hits >= 3
}
