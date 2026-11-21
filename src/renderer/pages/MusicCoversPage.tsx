import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Download, Eraser, ImagePlus, Maximize2, UploadCloud } from 'lucide-react'
import {
  MUSIC_COVER_JPEG_QUALITY,
  MUSIC_COVER_MAX_ZOOM,
  MUSIC_COVER_MIN_ZOOM,
  MUSIC_COVER_SIZE,
  buildCoverOutputFilename,
  clampCoverZoom,
  computeCoverDrawLayout,
  isLowResolutionCover,
} from '@shared/musicCover'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { getAtlasApi, isElectronRuntime } from '../lib/api'
import { environmentBreadcrumb } from '../lib/environments'
import { useToast } from '../components/Toast'
import { cn } from '../lib/utils'

type LoadedCoverImage = {
  url: string
  fileName: string
  sourcePath: string | null
  naturalWidth: number
  naturalHeight: number
  element: HTMLImageElement
}

function loadImageFromFile(file: File, sourcePath: string | null): Promise<LoadedCoverImage> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({
        url: objectUrl,
        fileName: file.name,
        sourcePath,
        naturalWidth: img.naturalWidth || 1,
        naturalHeight: img.naturalHeight || 1,
        element: img,
      })
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Não foi possível abrir essa imagem. Tente PNG, JPG ou WebP.'))
    }
    img.src = objectUrl
  })
}

export function MusicCoversPage() {
  const api = getAtlasApi()
  const { push, pushError } = useToast()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const previewBoxRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    baseOffsetX: number
    baseOffsetY: number
    previewSize: number
  } | null>(null)

  const [cover, setCover] = useState<LoadedCoverImage | null>(null)
  const [zoom, setZoom] = useState(MUSIC_COVER_MIN_ZOOM)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [previewBoxSize, setPreviewBoxSize] = useState(360)
  const [dragActive, setDragActive] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    return () => {
      if (cover?.url) URL.revokeObjectURL(cover.url)
    }
  }, [cover])

  useEffect(() => {
    const el = previewBoxRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const updateSize = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0) setPreviewBoxSize(rect.width)
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(el)
    return () => observer.disconnect()
  }, [cover])

  const layout = useMemo(() => {
    if (!cover) return null
    return computeCoverDrawLayout({
      naturalWidth: cover.naturalWidth,
      naturalHeight: cover.naturalHeight,
      frameSize: MUSIC_COVER_SIZE,
      zoom,
      offsetX,
      offsetY,
    })
  }, [cover, zoom, offsetX, offsetY])

  const acceptFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return
      if (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name)) {
        push('Selecione um arquivo de imagem (PNG, JPG ou WebP).', 'error')
        return
      }
      try {
        let sourcePath: string | null = null
        try {
          sourcePath = api.editor?.pathForFile?.(file) || null
        } catch {
          sourcePath = null
        }
        const next = await loadImageFromFile(file, sourcePath)
        setCover(next)
        setZoom(MUSIC_COVER_MIN_ZOOM)
        setOffsetX(0)
        setOffsetY(0)
      } catch (error) {
        pushError(error, 'Não foi possível carregar a imagem')
      }
    },
    [api, push, pushError],
  )

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const items = event.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            event.preventDefault()
            void acceptFile(file)
            return
          }
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [acceptFile])

  useEffect(() => {
    const el = previewBoxRef.current
    if (!el || !cover) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const factor = event.deltaY < 0 ? 0.08 : -0.08
      setZoom((current) => clampCoverZoom(Number((current + factor).toFixed(2))))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [cover])

  function fitToFrame() {
    setZoom(MUSIC_COVER_MIN_ZOOM)
    setOffsetX(0)
    setOffsetY(0)
  }

  function clearCover() {
    setCover(null)
    setZoom(MUSIC_COVER_MIN_ZOOM)
    setOffsetX(0)
    setOffsetY(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function onDropZoneDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    if (!dragActive) setDragActive(true)
  }

  function onDropZoneDragLeave() {
    setDragActive(false)
  }

  function onDropZoneDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragActive(false)
    const file = event.dataTransfer.files?.[0]
    void acceptFile(file)
  }

  async function exportJpg() {
    if (!cover || !layout || exporting) return
    setExporting(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = MUSIC_COVER_SIZE
      canvas.height = MUSIC_COVER_SIZE
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Contexto de imagem indisponível.')

      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, MUSIC_COVER_SIZE, MUSIC_COVER_SIZE)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(
        cover.element,
        layout.drawX,
        layout.drawY,
        layout.drawWidth,
        layout.drawHeight,
      )

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', MUSIC_COVER_JPEG_QUALITY),
      )
      if (!blob) throw new Error('Falha ao gerar o arquivo JPG.')

      const defaultName = buildCoverOutputFilename(cover.fileName)
      if (isElectronRuntime() && typeof api.music.saveCover === 'function') {
        const bytes = new Uint8Array(await blob.arrayBuffer())
        const savedPath = await api.music.saveCover({
          bytes,
          defaultName,
          sourcePath: cover.sourcePath,
        })
        if (savedPath) {
          push(`Capa salva em 1400×1400 JPG.`, 'success')
        }
        return
      }

      const downloadUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = downloadUrl
      anchor.download = defaultName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
      push('Capa exportada em 1400×1400 JPG.', 'success')
    } catch (error) {
      pushError(error, 'Não foi possível exportar a capa')
    } finally {
      setExporting(false)
    }
  }

  const lowResolution = cover ? isLowResolutionCover(cover.naturalWidth, cover.naturalHeight) : false
  const previewScale = previewBoxSize / MUSIC_COVER_SIZE
  const zoomPercent = Math.round(zoom * 100)

  return (
    <PageShell>
      <PageHeader
        breadcrumb={environmentBreadcrumb('music', 'Capas')}
        title="Capas"
        subtitle="Envie sua imagem e ajuste o enquadramento para o padrão 1400 × 1400 em JPG."
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void acceptFile(event.target.files?.[0])}
      />

      <Card className="mb-5">
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              fileInputRef.current?.click()
            }
          }}
          onDragOver={onDropZoneDragOver}
          onDragLeave={onDropZoneDragLeave}
          onDrop={onDropZoneDrop}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center transition-colors',
            cover ? 'py-7' : 'py-14',
            dragActive
              ? 'border-accent bg-accent-subtle/40'
              : 'border-border bg-elevated/40 hover:border-accent/45 hover:bg-elevated/70',
          )}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border-soft bg-surface text-accent">
            {cover ? <ImagePlus className="h-5 w-5" /> : <UploadCloud className="h-5 w-5" />}
          </div>
          <p className="mt-4 text-base font-semibold text-text">
            Arraste e solte sua imagem aqui
          </p>
          <p className="mt-1 text-xs text-muted">
            ou clique para selecionar (ou cole com Ctrl+V)
          </p>
          <Button
            type="button"
            className="mt-4 h-10 px-5"
            onClick={(event) => {
              event.stopPropagation()
              fileInputRef.current?.click()
            }}
          >
            {cover ? 'Trocar imagem' : 'Selecionar imagem'}
          </Button>
        </div>

        {cover && layout ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr] lg:items-start">
            <div>
              <div
                ref={previewBoxRef}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  event.currentTarget.setPointerCapture(event.pointerId)
                  dragStateRef.current = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    baseOffsetX: layout.clampedOffsetX,
                    baseOffsetY: layout.clampedOffsetY,
                    previewSize: previewBoxSize || 360,
                  }
                }}
                onPointerMove={(event) => {
                  const drag = dragStateRef.current
                  if (!drag || drag.pointerId !== event.pointerId) return
                  const ratio = MUSIC_COVER_SIZE / drag.previewSize
                  const nextX = drag.baseOffsetX + (event.clientX - drag.startX) * ratio
                  const nextY = drag.baseOffsetY + (event.clientY - drag.startY) * ratio
                  setOffsetX(nextX)
                  setOffsetY(nextY)
                }}
                onPointerUp={(event) => {
                  if (dragStateRef.current?.pointerId === event.pointerId) {
                    setOffsetX(layout.clampedOffsetX)
                    setOffsetY(layout.clampedOffsetY)
                    dragStateRef.current = null
                  }
                }}
                onPointerCancel={() => {
                  dragStateRef.current = null
                }}
                className="relative aspect-square w-full max-w-[380px] touch-none select-none overflow-hidden rounded-2xl border border-border bg-black cursor-grab active:cursor-grabbing"
              >
                <img
                  src={cover.url}
                  alt={cover.fileName}
                  draggable={false}
                  className="pointer-events-none max-w-none select-none"
                  style={{
                    position: 'absolute',
                    left: `${layout.drawX * previewScale}px`,
                    top: `${layout.drawY * previewScale}px`,
                    width: `${layout.drawWidth * previewScale}px`,
                    height: `${layout.drawHeight * previewScale}px`,
                  }}
                />
                {/* Grade 3x3 de enquadramento */}
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute inset-y-0 left-1/3 w-px bg-white/20" />
                  <div className="absolute inset-y-0 left-2/3 w-px bg-white/20" />
                  <div className="absolute inset-x-0 top-1/3 h-px bg-white/20" />
                  <div className="absolute inset-x-0 top-2/3 h-px bg-white/20" />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-border-soft bg-elevated/50 p-4">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-text">Zoom</span>
                  <span className="font-mono text-xs font-semibold tabular-nums text-accent">
                    {zoomPercent}%
                  </span>
                </div>
                <input
                  type="range"
                  aria-label="Zoom da capa"
                  min={Math.round(MUSIC_COVER_MIN_ZOOM * 100)}
                  max={Math.round(MUSIC_COVER_MAX_ZOOM * 100)}
                  step={1}
                  value={zoomPercent}
                  onChange={(event) => setZoom(clampCoverZoom(Number(event.target.value) / 100))}
                  className="w-full accent-[var(--color-accent,#35bf9b)]"
                />
                <p className="mt-2 text-xs text-muted">
                  Use o slider ou a roda do mouse sobre a capa para aproximar ou afastar.
                </p>
              </div>

              <Button
                type="button"
                variant="secondary"
                className="h-11 w-full"
                icon={<Maximize2 className="h-4 w-4" />}
                onClick={fitToFrame}
              >
                Ajustar ao quadro
              </Button>

              <div className="rounded-xl border border-border-soft bg-elevated/40 px-4 py-3 text-xs text-muted">
                Arraste a imagem para posicionar dentro do quadrado.
              </div>

              <div className="rounded-xl border border-border-soft bg-elevated/40 px-4 py-3 text-xs text-muted">
                Original:{' '}
                <strong className="text-text">
                  {cover.naturalWidth} × {cover.naturalHeight} px
                </strong>{' '}
                · Saída:{' '}
                <strong className="text-text">
                  {MUSIC_COVER_SIZE} × {MUSIC_COVER_SIZE} px (JPG)
                </strong>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            className="h-11 px-5"
            icon={<Download className="h-4 w-4" />}
            disabled={!cover || exporting}
            onClick={() => void exportJpg()}
          >
            {exporting ? 'Exportando...' : 'Baixar JPG 1400×1400'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-11 px-4"
            icon={<Eraser className="h-4 w-4" />}
            disabled={!cover || exporting}
            onClick={clearCover}
          >
            Limpar
          </Button>
        </div>

        <p
          className={cn(
            'mt-3 text-xs',
            lowResolution ? 'text-warning' : 'text-muted',
          )}
        >
          {!cover
            ? 'Pronto para editar.'
            : lowResolution
              ? 'Imagem pequena. Você pode ampliar, mas pode perder qualidade.'
              : 'Resolução ideal para capa 1400 × 1400.'}
        </p>
      </Card>

      <Card padding="sm" className="bg-elevated/40 p-5">
        <p className="text-sm font-semibold text-text">Dicas</p>
        <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-muted">
          <li>Edição 100% local (sem upload).</li>
          <li>Use o zoom para preencher o formato 1400 × 1400.</li>
          <li>Exportação em JPG com alta qualidade.</li>
        </ul>
      </Card>
    </PageShell>
  )
}
