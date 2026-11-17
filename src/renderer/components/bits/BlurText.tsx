import { memo } from 'react'
import { cn } from '../../lib/utils'

/**
 * React Bits · BlurText — palavras surgem do desfoque em cascata.
 * Puro CSS (uma animação por palavra, roda uma vez), memoizado para não reanimar.
 */
export const BlurText = memo(function BlurText({
  text,
  delay = 0,
  stagger = 70,
  className,
  wordClassName,
}: {
  text: string
  delay?: number
  stagger?: number
  className?: string
  wordClassName?: string
}) {
  const words = text.split(/(\s+)/)
  let index = 0
  return (
    <span className={className} aria-label={text}>
      {words.map((word, i) => {
        if (/^\s+$/.test(word)) return <span key={i}>{word}</span>
        const current = index++
        return (
          <span
            key={i}
            aria-hidden
            className={cn('atlas-blur-word', wordClassName)}
            style={{ animationDelay: `${delay + current * stagger}ms` }}
          >
            {word}
          </span>
        )
      })}
    </span>
  )
})
