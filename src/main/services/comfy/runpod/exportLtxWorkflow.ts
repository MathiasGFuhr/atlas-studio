/**
 * Fase 4 — exporta o workflow real (API JSON) do SQLite do Atlas.
 * Não reconstrói a partir de stubs de teste.
 */

import fs from 'node:fs'
import path from 'node:path'
import type { ComfyApiWorkflow } from '../../../../shared/comfy'
import type { ExportLtxWorkflowResult } from '../../../../shared/ltxPhase4'
import { analyzeLtxWorkflow } from '../../../../shared/ltxWorkflowAnalysis'
import { getDb } from '../../../db/database'
import { logger } from '../../logging/logger'

export type { ExportLtxWorkflowResult }

export const EXPORTED_WORKFLOW_FILE = 'exported-workflow-from-sqlite.json'
export const EXPORTED_ANALYSIS_FILE = 'workflow-analysis.json'

function defaultResourcesDir(): string {
  return path.join(process.cwd(), 'resources', 'ltx-environment')
}

/**
 * Lê `comfyWorkflowJson` do SQLite e grava o JSON API + análise em disco.
 */
export function exportLtxWorkflowFromSqlite(options?: {
  workflow?: ComfyApiWorkflow | null
  workflowName?: string
  resourcesDir?: string
  writeFiles?: boolean
}): ExportLtxWorkflowResult {
  let workflow = options?.workflow ?? null
  let workflowName = options?.workflowName?.trim() || ''

  if (!workflow) {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('comfyWorkflowJson') as
      | { value: string }
      | undefined
    if (row?.value) {
      try {
        workflow = JSON.parse(row.value) as ComfyApiWorkflow
      } catch {
        workflow = null
      }
    }
  }

  if (!workflowName) {
    const cfg = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('comfyConfig') as
      | { value: string }
      | undefined
    if (cfg?.value) {
      try {
        const parsed = JSON.parse(cfg.value) as { workflowName?: string }
        workflowName = parsed.workflowName?.trim() || ''
      } catch {
        workflowName = ''
      }
    }
  }

  const analysis = analyzeLtxWorkflow(workflow)
  if (!workflow || analysis.source === 'empty') {
    return {
      ok: false,
      source: 'sqlite_settings',
      workflowName,
      nodeCount: 0,
      classTypeCount: 0,
      exportPath: null,
      analysisPath: null,
      analysis,
      message: 'Nenhum workflow importado no SQLite (chave comfyWorkflowJson).',
    }
  }

  let exportPath: string | null = null
  let analysisPath: string | null = null
  if (options?.writeFiles !== false) {
    const dir = options?.resourcesDir ?? defaultResourcesDir()
    fs.mkdirSync(dir, { recursive: true })
    exportPath = path.join(dir, EXPORTED_WORKFLOW_FILE)
    analysisPath = path.join(dir, EXPORTED_ANALYSIS_FILE)
    fs.writeFileSync(exportPath, `${JSON.stringify(workflow, null, 2)}\n`, 'utf8')
    fs.writeFileSync(
      analysisPath,
      `${JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          workflowName: workflowName || 'video_ltx2_3_ia2v.json',
          analysis,
        },
        null,
        2,
      )}\n`,
      'utf8',
    )
    logger.info('ltx.workflow.exported', {
      exportPath,
      nodeCount: analysis.nodeCount,
      classTypes: analysis.classTypes.length,
    })
  }

  return {
    ok: true,
    source: 'sqlite_settings',
    workflowName: workflowName || 'video_ltx2_3_ia2v.json',
    nodeCount: analysis.nodeCount,
    classTypeCount: analysis.classTypes.length,
    exportPath,
    analysisPath,
    analysis,
    message: `Workflow exportado: ${analysis.nodeCount} nós, ${analysis.classTypes.length} class_types.`,
  }
}
