import { briefingDemo } from '@/lib/content'

type Tone = 'critical' | 'warning' | 'primary' | 'success' | 'info'

const dotClass: Record<Tone, string> = {
  critical: 'bg-critical',
  warning: 'bg-warning',
  primary: 'bg-primary',
  success: 'bg-success',
  info: 'bg-info',
}

type BriefingShowcaseProps = {
  readonly compact?: boolean
}

export function BriefingShowcase({ compact = false }: BriefingShowcaseProps) {
  const sections = compact ? briefingDemo.sections.slice(0, 2) : briefingDemo.sections

  return (
    <div className={compact ? 'space-y-4' : 'da-card p-6 sm:p-8'}>
      <header>
        <p className="text-[12px] font-medium tracking-wide text-faint uppercase">
          {briefingDemo.date}
        </p>
        <h3
          className={
            compact
              ? 'mt-1 font-editorial text-[20px] leading-tight text-ink'
              : 'mt-1 font-editorial text-[26px] leading-tight text-ink sm:text-[30px]'
          }
        >
          {briefingDemo.greeting}
        </h3>
        <p
          className={
            compact
              ? 'mt-2 font-editorial text-[13px] leading-6 text-muted'
              : 'mt-3 max-w-lg font-editorial text-[16px] leading-7 text-muted'
          }
        >
          {briefingDemo.lede}
        </p>
      </header>

      <dl className="mt-4 flex gap-2">
        {briefingDemo.stats.map((stat) => (
          <div
            key={stat.label}
            className="flex-1 rounded-md bg-surface2 px-3 py-2.5 text-center"
          >
            <dt className="sr-only">{stat.label}</dt>
            <dd>
              <span className="block text-[18px] font-semibold text-ink">{stat.value}</span>
              <span className="block text-[11px] text-faint">{stat.label}</span>
            </dd>
          </div>
        ))}
      </dl>

      <div className={compact ? 'mt-4 space-y-4' : 'mt-6 grid gap-5 sm:grid-cols-3'}>
        {sections.map((section) => (
          <section key={section.label}>
            <h4 className="text-[12px] font-semibold tracking-wide text-faint uppercase">
              {section.label}
            </h4>
            <ul className="mt-2 space-y-2">
              {section.items.map((item) => (
                <li
                  key={item.title}
                  className="flex gap-2.5 rounded-md bg-surface2 px-3 py-2.5"
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotClass[item.tone]}`}
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] leading-5 font-medium text-ink">
                      {item.title}
                    </span>
                    <span className="block text-[11px] leading-4 text-faint">{item.meta}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
