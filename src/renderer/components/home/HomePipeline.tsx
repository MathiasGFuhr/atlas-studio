import type { ChannelVideo } from '@shared/types'
import { Music2 } from 'lucide-react'
import { StatusBadge } from '../StatusBadge'
import { Card } from '../Card'

export function HomePipeline({
  videos,
  onOpen,
  onSeeAll,
}: {
  videos: ChannelVideo[]
  onOpen: (video: ChannelVideo) => void
  onSeeAll: () => void
}) {
  return (
    <Card padding="lg" className="min-h-[280px]">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-2">
            Lançamentos
          </p>
          <h2 className="mt-1 text-[17px] font-semibold tracking-tight text-text">Pipeline</h2>
        </div>
        <button
          type="button"
          onClick={onSeeAll}
          className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-white/[0.04] hover:text-text"
        >
          Ver agenda
        </button>
      </div>

      {videos.length === 0 ? (
        <div className="flex h-[180px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.08] text-center">
          <p className="text-sm font-medium text-text">Nada no pipeline</p>
          <p className="mt-1 text-xs text-muted-2">Os próximos vídeos da agenda aparecem aqui.</p>
        </div>
      ) : (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {videos.map((video) => (
            <button
              key={video.id}
              type="button"
              onClick={() => onOpen(video)}
              className="group w-[220px] shrink-0 overflow-hidden rounded-2xl border border-white/[0.06] bg-black/20 text-left transition-all hover:-translate-y-0.5 hover:border-[#334049]"
            >
              <div
                className="relative aspect-video overflow-hidden bg-card-2"
                style={
                  !video.thumbnailDataUrl && video.channelColor
                    ? { background: `linear-gradient(145deg, ${video.channelColor}28, #151c21)` }
                    : undefined
                }
              >
                {video.thumbnailDataUrl ? (
                  <img
                    src={video.thumbnailDataUrl}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-2">
                    <Music2 className="h-5 w-5" />
                  </div>
                )}
                <div className="absolute left-2 top-2">
                  <StatusBadge status={video.status} className="bg-black/55 px-2 py-0.5 text-[10px] backdrop-blur" />
                </div>
              </div>
              <div className="px-3 py-2.5">
                <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-text">
                  {video.title || 'Sem título'}
                </p>
                <p className="mt-1 truncate text-[11px] text-muted">
                  {video.channelName ?? 'Canal'} · {video.scheduledDate}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </Card>
  )
}
