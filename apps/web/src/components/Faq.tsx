import type { FaqItem } from '@/lib/content'
import { faqItems } from '@/lib/content'

type FaqProps = {
  readonly items?: readonly FaqItem[]
  readonly title?: string
  readonly headingLevel?: 'h1' | 'h2'
}

export function Faq({ items = faqItems, title = 'Sık sorulanlar', headingLevel = 'h2' }: FaqProps) {
  const Heading = headingLevel

  return (
    <section id="sss" aria-labelledby="sss-baslik" className="border-b border-hairline bg-surface">
      <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
        <Heading
          id="sss-baslik"
          className="text-[30px] leading-tight font-semibold tracking-tight text-ink sm:text-[38px]"
        >
          {title}
        </Heading>

        <div className="mt-8 divide-y divide-hairline border-t border-hairline">
          {items.map((item) => (
            <details key={item.question} className="group py-1">
              <summary className="flex cursor-pointer list-none items-start gap-4 rounded-xs py-4 text-[16px] leading-7 font-medium text-ink sm:text-[17px]">
                <span className="flex-1">{item.question}</span>
                <svg
                  aria-hidden="true"
                  className="mt-1.5 shrink-0 text-faint transition-transform group-open:rotate-180"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              <p className="pb-5 pr-8 text-[15px] leading-7 text-muted">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
