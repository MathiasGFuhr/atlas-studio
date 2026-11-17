import fs from 'node:fs'
import path from 'node:path'
import { sceneNumberFromFileName } from '../../../shared/lipSyncRefs'
import { getDb } from '../../db/database'
import {
  ensureProjectFolder,
  lipSyncRefRepository,
} from '../../repositories/lipSyncRefRepository'
import { projectRepository } from '../../repositories/projectRepository'
import { archiveLipSyncRefToProjectFolder } from '../storage/lipSyncMedia'

export type FlowSceneStripItem = {
  number: number
  sent: boolean
  subject?: 'singer' | 'band'
}

export type FlowSceneStrip = {
  cutCount: number
  musicProjectId: string | null
  musicProjectName: string | null
  scenes: FlowSceneStripItem[]
}

function inferSubjectFromFlowPrompt(rawText: string | null | undefined): 'singer' | 'band' | null {
  const text = String(rawText || '').trim()
  if (!text) return null
  if (
    /\[cantor\]|@cantor|\[microfone\]|@microfone|\b(singer|vocalist|lead\s+vocal|cantor|cantora)\b/i.test(
      text,
    ) &&
    !/\b(without\s+sing|no\s+singer|sem\s+cantor|sem\s+cantar)\b/i.test(text)
  ) {
    return 'singer'
  }
  if (
    /\[banda\]|@banda|\[cenario\]|@cenario|\b(band|banda|drummer|bateria|trumpeter|trompete|guitarist|guitarra|bassist|baixo|pianist|piano|violin|violino|orchestra|orquestra|instrumental)\b/i.test(
      text,
    )
  ) {
    return 'band'
  }
  return null
}

function inferSubjectFromLipSyncRef(ref: {
  subject?: string | null
  lyrics?: string | null
}): 'singer' | 'band' {
  if (ref.subject === 'band') return 'band'
  const lyrics = String(ref.lyrics || '').trim()
  if (
    lyrics &&
    !/\bcantor/i.test(lyrics) &&
    (/^(banda|bateria|guitarra|guitarrista|viol[aã]o|violino|piano|baixo|teclado|sanfona|trompete|sax|instrumental)\b/i.test(
      lyrics,
    ) ||
      /^\[(instrumental|short\s+.*\s+intro|intro|.*guitar\s+solo.*|crowd.*)\]/i.test(lyrics))
  ) {
    return 'band'
  }
  return 'singer'
}

function normalizeName(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function namesMatch(a: string, b: string): boolean {
  const left = normalizeName(a)
  const right = normalizeName(b)
  if (!left || !right) return false
  return left === right || left.includes(right) || right.includes(left)
}

/** Projeto de música (workspace music) ligado ao projeto Flow pelo nome/pasta. */
export function resolveMusicProjectForFlow(atlasProjectId: string): {
  id: string
  name: string
} | null {
  const flow = projectRepository.get(atlasProjectId)
  if (!flow) return null
  if ((flow.workspace || 'music') !== 'flow') {
    // Projeto já é de música: usa ele mesmo.
    return { id: flow.id, name: flow.name }
  }

  const musicProjects = projectRepository.list({ workspace: 'music', projectType: 'music' })
  const exact = musicProjects.find((project) => namesMatch(project.name, flow.name))
  if (exact) return { id: exact.id, name: exact.name }

  const flowFolder = flow.projectFolderPath?.trim()
  if (flowFolder) {
    const byFolder = musicProjects.find(
      (project) =>
        project.projectFolderPath &&
        path.resolve(project.projectFolderPath) === path.resolve(flowFolder),
    )
    if (byFolder) return { id: byFolder.id, name: byFolder.name }
  }

  // Fallback: projeto de lipsync com o mesmo nome que já tem cenas.
  const withRefs = musicProjects
    .map((project) => ({
      project,
      refs: lipSyncRefRepository.list({ projectId: project.id, status: 'active' }).length,
    }))
    .filter((entry) => entry.refs > 0 && namesMatch(entry.project.name, flow.name))
    .sort((a, b) => b.refs - a.refs)
  const best = withRefs[0]?.project
  if (best) return { id: best.id, name: best.name }

  // Último recurso: o próprio projeto Flow (mesma pasta do canal).
  return { id: flow.id, name: flow.name }
}

function sceneNumbersSentFromFlow(atlasProjectId: string): Set<number> {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT p.position
       FROM flow_result_bindings rb
       JOIN flow_attempts a ON a.id = rb.attempt_id
       JOIN flow_prompt_revisions r ON r.id = a.prompt_revision_id
       JOIN flow_prompts p ON p.id = r.prompt_id
       WHERE p.atlas_project_id = ?
         AND rb.lipsync_sent_at IS NOT NULL
         AND TRIM(rb.lipsync_sent_at) != ''`,
    )
    .all(atlasProjectId) as Array<{ position: number }>
  const sent = new Set<number>()
  for (const row of rows) {
    const n = Number(row.position)
    if (Number.isInteger(n) && n > 0) sent.add(n)
  }
  return sent
}

/** Faixa com as cenas do Flow e vínculo de cantor/banda com o LipSync. */
export function buildSceneStrip(atlasProjectId: string): FlowSceneStrip {
  const music = resolveMusicProjectForFlow(atlasProjectId)
  const promptRows = getDb()
    .prepare(
      `SELECT p.position, r.raw_text
       FROM flow_prompts p
       LEFT JOIN flow_prompt_revisions r ON r.id = p.active_revision_id
       WHERE p.atlas_project_id = ? AND p.archived_at IS NULL
       ORDER BY p.position ASC`,
    )
    .all(atlasProjectId) as Array<{ position: number; raw_text: string | null }>

  const promptTextByPos = new Map<number, string>()
  const promptPositions: number[] = []
  for (const row of promptRows) {
    const n = Number(row.position)
    if (Number.isInteger(n) && n > 0) {
      promptPositions.push(n)
      if (row.raw_text) promptTextByPos.set(n, String(row.raw_text))
    }
  }

  const refByNumber = new Map<number, { subject?: string | null; lyrics?: string | null }>()
  if (music?.id) {
    const refs = lipSyncRefRepository.list({ projectId: music.id, status: 'active' })
    refs.forEach((ref, index) => {
      const n =
        sceneNumberFromFileName(ref.label) ??
        (/^\d+$/.test(ref.label.trim()) ? Number(ref.label.trim()) : null) ??
        index + 1
      if (Number.isInteger(n) && n > 0 && !refByNumber.has(n)) {
        refByNumber.set(n, ref)
      }
    })
  }

  const onlyDefaultEmptyPrompt =
    promptRows.length <= 1 && !String(promptRows[0]?.raw_text || '').trim()
  const positions =
    onlyDefaultEmptyPrompt && refByNumber.size > 0
      ? Array.from(refByNumber.keys()).sort((a, b) => a - b)
      : promptPositions

  const sent = sceneNumbersSentFromFlow(atlasProjectId)
  const scenes: FlowSceneStripItem[] = positions.map((number) => {
    const ref = refByNumber.get(number)
    const fromPrompt = inferSubjectFromFlowPrompt(promptTextByPos.get(number))
    const subject: 'singer' | 'band' = ref
      ? ref.subject === 'band'
        ? 'band'
        : (fromPrompt ?? inferSubjectFromLipSyncRef(ref))
      : (fromPrompt ?? 'singer')
    return {
      number,
      sent: sent.has(number),
      subject,
    }
  })
  return {
    cutCount: scenes.length,
    musicProjectId: music?.id || null,
    musicProjectName: music?.name || null,
    scenes,
  }
}

export function sendFlowResultToLipSync(resultBindingId: string): {
  ok: boolean
  error?: string
  sceneNumber?: number
  musicProjectId?: string
  imagePath?: string
} {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT rb.id, rb.atlas_asset_id, rb.retrieval_state, rb.mime_type,
              p.id AS prompt_id, p.position, p.atlas_project_id
       FROM flow_result_bindings rb
       JOIN flow_attempts a ON a.id = rb.attempt_id
       JOIN flow_prompt_revisions r ON r.id = a.prompt_revision_id
       JOIN flow_prompts p ON p.id = r.prompt_id
       WHERE rb.id = ?`,
    )
    .get(resultBindingId) as
    | {
        id: string
        atlas_asset_id: string | null
        retrieval_state: string
        mime_type: string | null
        prompt_id: string
        position: number
        atlas_project_id: string
      }
    | undefined

  if (!row) return { ok: false, error: 'RESULT_NOT_FOUND' }
  if (row.retrieval_state !== 'retrieved' || !row.atlas_asset_id) {
    return { ok: false, error: 'RESULT_FILE_NOT_READY' }
  }
  if (!fs.existsSync(row.atlas_asset_id)) return { ok: false, error: 'FILE_MISSING' }

  const sceneNumber = Number(row.position)
  if (!Number.isInteger(sceneNumber) || sceneNumber < 1) {
    return { ok: false, error: 'SCENE_NUMBER_INVALID' }
  }

  const music = resolveMusicProjectForFlow(row.atlas_project_id)
  if (!music) return { ok: false, error: 'MUSIC_PROJECT_NOT_FOUND' }

  const folder = ensureProjectFolder(music.id)
  const sourceExt = path.extname(row.atlas_asset_id).toLowerCase() || '.png'
  const label = String(sceneNumber)
  const archived = archiveLipSyncRefToProjectFolder({
    sourceImagePath: row.atlas_asset_id,
    projectFolder: folder,
    label,
    prompt: '',
    lyrics: '',
    refId: resultBindingId,
  })
  if (!archived.imagePath) return { ok: false, error: 'FOLDER_COPY_FAILED' }

  // Garante nome aceito pelo parser de cena (`1.png`, não `cena_1.png`).
  const preferred = path.join(path.dirname(archived.imagePath), `${sceneNumber}${sourceExt}`)
  let finalImagePath = archived.imagePath
  if (path.resolve(archived.imagePath) !== path.resolve(preferred)) {
    if (fs.existsSync(preferred)) fs.unlinkSync(preferred)
    fs.renameSync(archived.imagePath, preferred)
    finalImagePath = preferred
    const oldTxt = archived.promptPath
    const newTxt = path.join(path.dirname(preferred), `${sceneNumber}.txt`)
    if (fs.existsSync(oldTxt)) {
      if (fs.existsSync(newTxt)) fs.unlinkSync(newTxt)
      fs.renameSync(oldTxt, newTxt)
    }
  }

  const refs = lipSyncRefRepository.list({ projectId: music.id, status: 'active' })
  const ordered = [...refs].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
  let target =
    ordered.find((ref) => {
      const fromLabel =
        sceneNumberFromFileName(ref.label) ??
        (/^\d+$/.test(ref.label.trim()) ? Number(ref.label.trim()) : null)
      return fromLabel === sceneNumber
    }) || ordered[sceneNumber - 1] || null

  if (target) {
    lipSyncRefRepository.update(target.id, {
      imagePath: finalImagePath,
      label: target.label?.trim() || label,
    })
  } else {
    lipSyncRefRepository.create({
      imagePath: finalImagePath,
      label,
      projectId: music.id,
    })
  }

  const now = new Date().toISOString()
  // Uma imagem enviada por cena: limpa o certo anterior da mesma linha.
  db.prepare(
    `UPDATE flow_result_bindings
     SET lipsync_sent_at = NULL
     WHERE id IN (
       SELECT rb.id
       FROM flow_result_bindings rb
       JOIN flow_attempts a ON a.id = rb.attempt_id
       JOIN flow_prompt_revisions r ON r.id = a.prompt_revision_id
       JOIN flow_prompts p ON p.id = r.prompt_id
       WHERE p.atlas_project_id = ?
         AND p.position = ?
         AND rb.id != ?
     )`,
  ).run(row.atlas_project_id, sceneNumber, resultBindingId)
  db.prepare(`UPDATE flow_result_bindings SET lipsync_sent_at = ? WHERE id = ?`).run(
    now,
    resultBindingId,
  )
  db.persist()

  return {
    ok: true,
    sceneNumber,
    musicProjectId: music.id,
    imagePath: finalImagePath,
  }
}
