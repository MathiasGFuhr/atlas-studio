import { getDb } from '../db/database'
import type { InterruptedRun } from '../../shared/types'

export const generationRunRepository = {
  markInterruptedAbandoned(maxAgeMinutes = 5): number {
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60_000).toISOString()
    const rows = getDb()
      .prepare(
        `SELECT id FROM generation_runs
         WHERE status = 'running' AND started_at < ?`,
      )
      .all(cutoff) as Array<{ id: string }>

    const update = getDb().prepare(
      `UPDATE generation_runs
       SET status = 'interrupted', error_message = ?, finished_at = ?
       WHERE id = ?`,
    )
    const now = new Date().toISOString()
    for (const row of rows) {
      update.run('Geração interrompida (app fechado ou processo abandonado).', now, row.id)
    }
    return rows.length
  },

  listInterrupted(): InterruptedRun[] {
    return (
      getDb()
        .prepare(
          `SELECT id, niche_id, started_at, error_message
           FROM generation_runs
           WHERE status IN ('interrupted', 'cancelled', 'error')
           ORDER BY started_at DESC
           LIMIT 10`,
        )
        .all() as Array<{
        id: string
        niche_id: string | null
        started_at: string
        error_message: string | null
      }>
    ).map((row) => ({
      id: row.id,
      nicheId: row.niche_id,
      startedAt: row.started_at,
      errorMessage: row.error_message,
    }))
  },

  updateStatus(
    id: string,
    status: 'running' | 'done' | 'error' | 'cancelled' | 'interrupted',
    errorMessage?: string | null,
    scriptId?: string | null,
  ) {
    getDb()
      .prepare(
        `UPDATE generation_runs
         SET status = ?, error_message = ?, finished_at = ?, script_id = COALESCE(?, script_id)
         WHERE id = ?`,
      )
      .run(
        status,
        errorMessage ?? null,
        new Date().toISOString(),
        scriptId ?? null,
        id,
      )
  },
}
