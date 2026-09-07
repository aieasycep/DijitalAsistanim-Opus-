import type { ReactNode } from 'react'

type DeviceFrameProps = {
  readonly caption: string
  readonly children: ReactNode
  readonly tone?: 'dawn' | 'night' | 'dusk'
}

const toneClass: Record<'dawn' | 'night' | 'dusk', string> = {
  dawn: 'da-dawn',
  night: 'da-night',
  dusk: 'da-dusk',
}

export function DeviceFrame({ caption, children, tone = 'dawn' }: DeviceFrameProps) {
  return (
    <figure className="mx-auto w-full max-w-[320px]">
      <div className="rounded-[38px] bg-ink/10 p-2 shadow-lift ring-1 ring-hairline">
        <div
          className={`${toneClass[tone]} relative overflow-hidden rounded-[30px] p-3 pt-8`}
        >
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-2.5 h-1.5 w-16 -translate-x-1/2 rounded-full bg-white/35"
          />
          <div className="rounded-[22px] bg-surface p-4">{children}</div>
        </div>
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  )
}
