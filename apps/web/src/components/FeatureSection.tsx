import type { ReactNode } from 'react'
import type { FeatureCopy } from '@/lib/content'

type FeatureSectionProps = {
  readonly feature: FeatureCopy
  readonly media: ReactNode
  readonly reversed?: boolean
  readonly bordered?: boolean
}

export function FeatureSection({
  feature,
  media,
  reversed = false,
  bordered = true,
}: FeatureSectionProps) {
  return (
    <section
      id={feature.id}
      aria-labelledby={`${feature.id}-baslik`}
      className={bordered ? 'border-b border-hairline' : undefined}
    >
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div className={reversed ? 'lg:order-2' : undefined}>
          <p className="text-[13px] font-semibold tracking-wide text-primary uppercase">
            {feature.eyebrow}
          </p>
          <h2
            id={`${feature.id}-baslik`}
            className="mt-3 text-[28px] leading-tight font-semibold tracking-tight text-ink sm:text-[36px]"
          >
            {feature.title}
          </h2>
          <p className="mt-4 max-w-xl text-[16px] leading-8 text-muted sm:text-[17px]">
            {feature.body}
          </p>

          <ul className="mt-6 space-y-3">
            {feature.bullets.map((bullet) => (
              <li key={bullet} className="flex gap-3 text-[15px] leading-7 text-ink">
                <svg
                  aria-hidden="true"
                  className="mt-1.5 shrink-0 text-primary"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
                </svg>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={reversed ? 'lg:order-1' : undefined}>{media}</div>
      </div>
    </section>
  )
}
