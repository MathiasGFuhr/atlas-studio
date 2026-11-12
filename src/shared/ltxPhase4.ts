/**
 * Tipos da Fase 4 — validação controlada LTX (dry-run).
 * Mantidos em shared para o preload/renderer não importarem o main.
 */

import type { LtxControlledLipsyncTestGate, LtxEnvironmentPrepStatus } from './ltxEnvironment'
import type { LtxMigrationPlan } from './ltxMigration'
import type { LtxGpuRecoveryPlan } from './ltxRecovery'
import type { LtxWorkflowAnalysis } from './ltxWorkflowAnalysis'

export type ExportLtxWorkflowResult = {
  ok: boolean
  source: 'sqlite_settings'
  workflowName: string
  nodeCount: number
  classTypeCount: number
  exportPath: string | null
  analysisPath: string | null
  analysis: LtxWorkflowAnalysis
  message: string
}

export type ComfyModelPresence = {
  folder: string
  expectedFileName: string
  present: boolean | null
  listedInFolder: string[]
}

export type ComfyPodInventoryResult = {
  dryRun: true
  mutationCalls: 0
  accessible: boolean
  baseUrl: string
  pendingChecks: string[]
  system: {
    comfyuiVersion: string | null
    pytorchVersion: string | null
    pythonVersion: string | null
    os: string | null
    gpuName: string | null
    vramTotalGb: number | null
  }
  classTypes: {
    availableCount: number
    requiredPresent: string[]
    requiredMissing: string[]
    hasLtxMarker: boolean
    message: string
  }
  models: ComfyModelPresence[]
  modelFoldersAvailable: string[]
  notes: string[]
}

export type LtxPhase4ValidationStatus = {
  fetchedAt: string
  phase: 4
  dryRun: true
  mutationCalls: 0
  advancedToPhase5: false
  workflowExport: ExportLtxWorkflowResult
  workflowAnalysis: LtxWorkflowAnalysis
  inventory: ComfyPodInventoryResult
  migration: LtxMigrationPlan
  recovery: LtxGpuRecoveryPlan
  reproducibleEnv: {
    dockerfilePath: string
    requirementsPath: string
    manifestPath: string
    integrityChecks: string[]
    bootValidations: string[]
    pinsComplete: boolean
    notes: string[]
  }
  controlledLipsyncTest: LtxControlledLipsyncTestGate
  paidActionsRequiringApproval: string[]
  prep: LtxEnvironmentPrepStatus
}
