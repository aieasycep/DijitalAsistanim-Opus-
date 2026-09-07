import { howItWorks } from '@/lib/content'

export function HowItWorks() {
  return (
    <section id="nasil-calisir" aria-labelledby="nasil-calisir-baslik" className="border-b border-hairline">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <p className="text-[13px] font-semibold tracking-wide text-primary uppercase">
          Nasıl çalışır
        </p>
        <h2
          id="nasil-calisir-baslik"
          className="mt-3 max-w-2xl text-[30px] leading-tight font-semibold tracking-tight text-ink sm:text-[38px]"
        >
          Üç adım, sonra sen hiçbir şey yapmıyorsun.
        </h2>

        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {howItWorks.map((step) => (
            <li key={step.index} className="da-card flex flex-col p-6">
              <span className="text-[13px] font-semibold text-primary">{step.index}</span>
              <h3 className="mt-3 text-[19px] font-semibold tracking-tight text-ink">
                {step.title}
              </h3>
              <p className="mt-2 flex-1 text-[15px] leading-7 text-muted">{step.body}</p>
              <p className="mt-4 text-[13px] text-faint">{step.detail}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
