import { integrations } from '@/lib/content'

export function IntegrationsStrip() {
  return (
    <section
      aria-labelledby="entegrasyonlar-baslik"
      className="border-b border-hairline bg-surface"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <h2
          id="entegrasyonlar-baslik"
          className="text-[13px] font-semibold tracking-wide text-faint uppercase"
        >
          Zaten kullandığın hesaplarla çalışır
        </h2>

        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {integrations.map((integration) => (
            <li
              key={integration.name}
              className="rounded-md border border-hairline bg-bg px-4 py-3"
            >
              <p className="text-[15px] font-medium text-ink">{integration.name}</p>
              <p className="mt-0.5 text-[12px] text-faint">{integration.detail}</p>
            </li>
          ))}
        </ul>

        <p className="mt-6 max-w-2xl text-[14px] leading-6 text-muted">
          Bağlantıyı sağlayıcının kendi onay ekranından verirsin; şifreni asla görmeyiz. Bir hesabı
          istediğin an çıkarırsın, o hesaptan gelen veriler de silinir.
        </p>
      </div>
    </section>
  )
}
