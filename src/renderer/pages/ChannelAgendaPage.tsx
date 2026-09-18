import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ChannelVideo } from '@shared/types'
import {
  AGENDA_UPCOMING_VIDEO_LIMIT,
  channelVideoPath,
  todayDateKey,
} from '@shared/channelVideos'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { HomeScheduledVideoCard } from '../components/home/HomeScheduledVideoCard'
import { getAtlasApi } from '../lib/api'
import { onVideosChanged } from '../lib/videoEvents'
import { useToast } from '../components/Toast'
import { projectPath } from '../lib/environments'

export function ChannelAgendaPage() {
  const api = getAtlasApi()
  const navigate = useNavigate()
  const { push } = useToast()
  const [videos, setVideos] = useState<ChannelVideo[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const list = await api.videos.list({
      from: todayDateKey(),
      limit: AGENDA_UPCOMING_VIDEO_LIMIT,
    })
    setVideos(list)
    setLoaded(true)
  }, [api])

  useEffect(() => {
    void load()
    const refresh = () => {
      void load()
    }
    const stop = onVideosChanged(refresh)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
    }
  }, [load])

  async function copyField(value: string, emptyMessage: string, successMessage: string) {
    const text = value.trim()
    if (!text) {
      push(emptyMessage, 'error')
      return
    }
    try {
      await api.system.copyText(text)
      push(successMessage, 'success')
    } catch {
      push('Não foi possível copiar.', 'error')
    }
  }

  return (
    <PageShell>
      <PageHeader
        breadcrumb="Atlas / Canais / Agenda"
        title="Vídeos agendados"
        subtitle="Próximos cadastros do calendário de todos os canais."
        hint="A lista vem da mesma tabela usada no calendário de cada canal."
      />

      {!loaded ? (
        <p className="text-sm text-muted">Carregando agenda…</p>
      ) : videos.length === 0 ? (
        <div className="rounded-2xl border border-border-soft bg-card px-4 py-4">
          <p className="text-sm text-muted">Nenhum vídeo agendado.</p>
          <button
            type="button"
            onClick={() => navigate('/canais')}
            className="mt-2 text-xs font-medium text-accent hover:underline"
          >
            Abrir canais
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {videos.map((video) => (
            <HomeScheduledVideoCard
              key={video.id}
              video={video}
              onOpen={() => navigate(channelVideoPath(video.channelId, video.id))}
              onOpenProject={
                video.channelType === 'music' && video.projectId
                  ? () => navigate(projectPath('music', video.projectId!))
                  : undefined
              }
              onCopyTitle={() =>
                void copyField(video.title, 'Este vídeo ainda não tem título.', 'Título copiado.')
              }
              onCopyDescription={() =>
                void copyField(
                  video.description,
                  'Este vídeo ainda não tem descrição.',
                  'Descrição copiada.',
                )
              }
            />
          ))}
        </div>
      )}
    </PageShell>
  )
}
