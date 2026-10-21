import { useEffect, useState } from 'react'
import type { ShortsJob } from '@shared/shorts'
import { shortsProjectStatusLabel } from '@shared/shortsProject'
import { Clapperboard } from 'lucide-react'
import { Card } from '../Card'
import { getAtlasApi } from '../../lib/api'

function formatDuration(seconds: number | null | undefined) {
  if (!seconds || !Number.isFinite(seconds)) return null
  const total = Math.max(0, Math.round(seconds))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function HomeShortsCard({
  jobs,
  onOpen,
  onOpenAll,
}: {
  jobs: ShortsJob[]
  onOpen: (jobId: string) => void
  onOpenAll: () => void
}) {
  const api = getAtlasApi()
  const items = jobs.slice(0, 3)
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({})

  const jobIds = items.map((job) => job.id).join('|')

  useEffect(() => {
    let cancelled = false
    const ids = jobIds ? jobIds.split('|') : []
    void Promise.all(
      ids.map(async (id) => {
        try {
          const url = await api.shorts.thumbnailUrl(id)
          return [id, url] as const
        } catch {
          return [id, null] as const
        }
      }),
    ).then((entries) => {
      if (cancelled) return
      setThumbs(Object.fromEntries(entries))
    })
    return () => {
      cancelled = true
    }
  }, [api, jobIds])

  return (
    <Card padding="lg" className="flex h-full min-h-[300px] flex-col">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-2">
            Studio
          </p>
          <h2 className="mt-1 text-[17px] font-semibold tracking-tight text-text">Shorts</h2>
        </div>
        <button
          type="button"
          onClick={onOpenAll}
          className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-text"
        >
          Ver todos
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <Clapperboard className="mb-2 h-5 w-5 text-muted-2" />
          <p className="text-sm text-muted-2">Nenhum Shorts ainda.</p>
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-3 gap-2.5">
          {items.map((job) => {
            const duration = formatDuration(job.probe?.duration ?? job.clips[0]?.end)
            const poster = job.clips.find((clip) => clip.posterUrl)?.posterUrl || thumbs[job.id]
            return (
              <button
                key={job.id}
                type="button"
                onClick={() => onOpen(job.id)}
                className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-border-soft bg-bg/20 text-left transition-colors hover:border-accent/30"
              >
                <div className="relative aspect-[9/14] overflow-hidden bg-elevated">
                  {poster ? (
                    <img
                      src={poster}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-2">
                      <Clapperboard className="h-5 w-5" />
                    </div>
                  )}
                  {duration ? (
                    <span className="absolute bottom-1.5 right-1.5 rounded-md bg-overlay/65 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-text backdrop-blur">
                      {duration}
                    </span>
                  ) : null}
                </div>
                <div className="px-2 py-2">
                  <p className="truncate text-[11px] font-medium text-text">{job.name}</p>
                  <p className="mt-0.5 truncate text-[10px] text-muted-2">
                    {shortsProjectStatusLabel(job)}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </Card>
  )
}
