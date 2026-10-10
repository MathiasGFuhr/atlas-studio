import { useCallback, useEffect, useRef, useState } from 'react'
import { HashRouter, Navigate, Route, Routes, useParams, useSearchParams } from 'react-router-dom'
import type { AtlasSession } from '@shared/account'
import type { AppSettings } from '@shared/types'
import { AppSidebar } from './components/AppSidebar'
import { TopBar } from './components/TopBar'
import { ToastProvider } from './components/Toast'
import { CreateActionsProvider } from './components/CreateActionsProvider'
import { CodexLinkModal } from './components/CodexLinkModal'
import { CodexOnboarding } from './components/CodexOnboarding'
import { INTRO_TOUR_STEPS, ProductTour } from './components/ProductTour'
import { PageTourHost } from './components/PageTourHost'
import { PRODUCT_TOUR_REPLAY_EVENT } from './lib/productTourEvents'
import { HomePage } from './pages/HomePage'
import { ProjectsPage } from './pages/ProjectsPage'
import { ProjectDetailPage } from './pages/ProjectDetailPage'
import { ChannelsPage } from './pages/ChannelsPage'
import { ChannelCalendarPage } from './pages/ChannelCalendarPage'
import { ChannelAgendaPage } from './pages/ChannelAgendaPage'
import { ChannelPublishedVideosPage } from './pages/ChannelPublishedVideosPage'
import { PromptsPage } from './pages/PromptsPage'
import { LipSyncRefsPage } from './pages/LipSyncRefsPage'
import { SettingsPage } from './pages/SettingsPage'
import { MusicPage } from './pages/MusicPage'
import { MusicEditorPage } from './pages/MusicEditorPage'
import { ShortsStudioPage } from './pages/ShortsStudioPage'
import { ShortsProjectsPage } from './pages/ShortsProjectsPage'
import { TasksPage } from './pages/TasksPage'
import { LoginPage } from './pages/LoginPage'
import { TeamChatPage } from './pages/TeamChatPage'
import { ChatDock } from './components/chat/ChatDock'
import { getAtlasApi } from './lib/api'
import { openAtlasChat } from './lib/chatEvents'
import { useCodexAuth } from './hooks/useCodexAuth'
import { WorkspaceCapabilitiesProvider } from './hooks/useWorkspaceCapabilities'
import { AppUpdateProvider } from './hooks/useAppUpdate'
import { ShortsGenerationProvider } from './hooks/useShortsGeneration'
import { MUSIC_LIPSYNC_PATH, MUSIC_PROMPTS_PATH } from '@shared/workspaceCapabilities'
import { version as appVersion } from '../../package.json'
import { AtlasLogo } from './components/AtlasLogo'

/** Mantém links antigos funcionando sem duplicar telas. */
function LegacyRedirect({ to }: { to: (id: string) => string }) {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={to(id ?? '')} replace />
}

function OpenChatRedirect() {
  const [params] = useSearchParams()
  useEffect(() => {
    openAtlasChat({ projectId: params.get('projectId') })
  }, [params])
  return <Navigate to="/" replace />
}

export default function App() {
  const api = getAtlasApi()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [session, setSession] = useState<AtlasSession | 'loading'>('loading')
  const [tourOpen, setTourOpen] = useState(false)
  const [tourChecked, setTourChecked] = useState(false)
  const codexAuth = useCodexAuth()
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [pageTourOpen, setPageTourOpen] = useState(false)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  useEffect(() => {
    void api.settings.get().then((next) => {
      setSettings(next)
      if (!next.productTourCompleted) setTourOpen(true)
      setTourChecked(true)
    })
    void api.account.getSession().then(setSession)
    return api.account.onChanged(setSession)
  }, [api])

  useEffect(() => {
    function replay() {
      setTourOpen(true)
    }
    window.addEventListener(PRODUCT_TOUR_REPLAY_EVENT, replay)
    return () => window.removeEventListener(PRODUCT_TOUR_REPLAY_EVENT, replay)
  }, [])

  const finishTour = useCallback(() => {
    setTourOpen(false)
    const seen = settingsRef.current?.seenProductTours ?? []
    const seenProductTours = seen.includes('home') ? seen : [...seen, 'home']
    void api.settings.update({ productTourCompleted: true, seenProductTours }).then(setSettings)
  }, [api])

  const finishTourAndConnect = useCallback(() => {
    setTourOpen(false)
    const seen = settingsRef.current?.seenProductTours ?? []
    const seenProductTours = seen.includes('home') ? seen : [...seen, 'home']
    void api.settings.update({ productTourCompleted: true, seenProductTours }).then(setSettings)
    codexAuth.dismissOnboarding()
    setLinkModalOpen(true)
  }, [api, codexAuth])

  const markPageTourSeen = useCallback((id: string) => {
    const seen = settingsRef.current?.seenProductTours ?? []
    if (seen.includes(id)) return
    const seenProductTours = [...seen, id]
    settingsRef.current = settingsRef.current
      ? { ...settingsRef.current, seenProductTours }
      : settingsRef.current
    setSettings((current) => (current ? { ...current, seenProductTours } : current))
    void api.settings.update({ seenProductTours }).then(setSettings)
  }, [api])

  const handleOnboardingLink = useCallback(() => {
    codexAuth.dismissOnboarding()
    setLinkModalOpen(true)
  }, [codexAuth])

  const handleOnboardingSkip = useCallback(() => {
    codexAuth.dismissOnboarding()
  }, [codexAuth])

  if (session === 'loading') {
    return (
      <div className="atlas-shell flex h-full w-full flex-col items-center justify-center gap-4 text-sm text-muted">
        <AtlasLogo variant="mark" className="h-14 w-14 rounded-2xl shadow-[0_0_28px_rgba(53,229,139,0.22)]" />
        Abrindo o Atlas...
      </div>
    )
  }

  if (!session.user) {
    return (
      <ToastProvider>
        <LoginPage onSignedIn={setSession} />
      </ToastProvider>
    )
  }

  return (
        <ToastProvider>
      <HashRouter>
        <AppUpdateProvider>
        <WorkspaceCapabilitiesProvider>
        <CreateActionsProvider>
        <ShortsGenerationProvider>
        <div className="atlas-shell flex h-full w-full overflow-hidden text-text">
          <AppSidebar codexStatus={codexAuth.status} accountId={session.user.id} />
          <div className="flex min-w-0 flex-1 flex-col bg-transparent">
            <TopBar settings={settings} />
            <main className="min-h-0 flex-1 overflow-hidden bg-transparent">
              <Routes>
                <Route path="/" element={<HomePage />} />

                <Route path="/musica" element={<ProjectsPage projectType="music" />} />
                <Route path="/musica/projetos/:id" element={<ProjectDetailPage projectType="music" />} />
                <Route path="/musica/faixas" element={<MusicPage />} />
                <Route path="/musica/faixas/:id" element={<MusicEditorPage />} />
                <Route path={MUSIC_PROMPTS_PATH} element={<PromptsPage />} />
                <Route path={MUSIC_LIPSYNC_PATH} element={<LipSyncRefsPage />} />

                <Route path="/canais" element={<ChannelsPage />} />
                <Route path="/canais/agenda" element={<ChannelAgendaPage />} />
                <Route path="/canais/publicados" element={<ChannelPublishedVideosPage />} />
                <Route path="/canais/:id/videos/:videoId" element={<ChannelCalendarPage />} />
                <Route path="/canais/:id" element={<ChannelCalendarPage />} />
                <Route path="/shorts" element={<ShortsProjectsPage />} />
                <Route path="/shorts/:jobId" element={<ShortsStudioPage />} />
                <Route path="/tarefas" element={<TasksPage />} />
                <Route path="/equipe" element={<TeamChatPage account={session.user} />} />
                <Route path="/chat" element={<OpenChatRedirect />} />
                <Route path="/prompts" element={<Navigate to={MUSIC_PROMPTS_PATH} replace />} />
                <Route
                  path="/configuracoes"
                  element={
                    <SettingsPage
                      onSettingsSaved={setSettings}
                      codexAuth={codexAuth}
                      onRequestLink={() => setLinkModalOpen(true)}
                    />
                  }
                />

                <Route path="/historia" element={<Navigate to="/musica" replace />} />
                <Route path="/historia/*" element={<Navigate to="/musica" replace />} />
                <Route path="/create" element={<Navigate to="/musica" replace />} />
                <Route path="/nichos" element={<Navigate to="/musica" replace />} />
                <Route path="/niches" element={<Navigate to="/musica" replace />} />
                <Route path="/roteiros" element={<Navigate to="/musica" replace />} />
                <Route path="/scripts" element={<Navigate to="/musica" replace />} />
                <Route path="/roteiros/:id" element={<Navigate to="/musica" replace />} />
                <Route path="/scripts/:id" element={<Navigate to="/musica" replace />} />
                <Route path="/musicas" element={<Navigate to="/musica" replace />} />
                <Route
                  path="/musicas/:id"
                  element={<LegacyRedirect to={(id) => `/musica/faixas/${id}`} />}
                />
                <Route path="/channels" element={<Navigate to="/canais" replace />} />
                <Route
                  path="/channels/:id"
                  element={<LegacyRedirect to={(id) => `/canais/${id}`} />}
                />
                <Route path="/settings" element={<Navigate to="/configuracoes" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </div>
        <ChatDock />
        <div
          role="status"
          aria-label="Versão do aplicativo"
          className="pointer-events-none fixed bottom-3 right-20 z-[40] text-[11px] tabular-nums tracking-wide text-muted"
        >
          v{appVersion}
        </div>

        <ProductTour
          open={tourOpen}
          steps={INTRO_TOUR_STEPS}
          aiConnected={codexAuth.isConnected}
          offerConnect
          focusHome
          onComplete={finishTour}
          onConnectAi={finishTourAndConnect}
        />
        <PageTourHost
          ready={tourChecked}
          blocked={tourOpen || codexAuth.showOnboarding || linkModalOpen}
          seen={settings?.seenProductTours ?? []}
          onSeen={markPageTourSeen}
          onActiveChange={setPageTourOpen}
        />

        {/* Onboarding modal - first run only, depois do tour */}
        <CodexOnboarding
          open={tourChecked && !tourOpen && !pageTourOpen && codexAuth.showOnboarding}
          onLink={handleOnboardingLink}
          onSkip={handleOnboardingSkip}
        />

        {/* Link/unlink modal */}
        <CodexLinkModal
          open={linkModalOpen}
          codexAuth={codexAuth}
          onClose={() => setLinkModalOpen(false)}
        />
        </ShortsGenerationProvider>
        </CreateActionsProvider>
        </WorkspaceCapabilitiesProvider>
        </AppUpdateProvider>
      </HashRouter>
    </ToastProvider>
  )
}
