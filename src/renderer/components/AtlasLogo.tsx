import type { ImgHTMLAttributes } from 'react'
import logoMark from '../assets/brand/logo-mark.png'
import logoHorizontal from '../assets/brand/logo-horizontal.png'
import { cn } from '../lib/utils'

type AtlasLogoVariant = 'mark' | 'horizontal'

const sources: Record<AtlasLogoVariant, string> = {
  mark: logoMark,
  horizontal: logoHorizontal,
}

export function AtlasLogo({
  variant = 'mark',
  className,
  alt = 'Atlas Studio',
  ...props
}: {
  variant?: AtlasLogoVariant
  className?: string
  alt?: string
} & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'>) {
  return (
    <img
      src={sources[variant]}
      alt={alt}
      draggable={false}
      className={cn(
        'select-none object-contain',
        variant === 'mark' ? 'h-9 w-9' : 'h-8 w-auto',
        className,
      )}
      {...props}
    />
  )
}

export { logoMark, logoHorizontal }
