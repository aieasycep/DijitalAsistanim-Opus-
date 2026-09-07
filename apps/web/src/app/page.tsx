import type { ReactNode } from 'react'
import { BriefingShowcase } from '@/components/BriefingShowcase'
import { Faq } from '@/components/Faq'
import { FeatureSection } from '@/components/FeatureSection'
import { FinalCta } from '@/components/FinalCta'
import { Hero } from '@/components/Hero'
import { HowItWorks } from '@/components/HowItWorks'
import { IntegrationsStrip } from '@/components/IntegrationsStrip'
import { PricingTable } from '@/components/PricingTable'
import { SecuritySection } from '@/components/SecuritySection'
import { features } from '@/lib/content'

export default function HomePage() {
  const media: Record<string, ReactNode> = {
    'sabah-brifingi': <BriefingShowcase />,
    'mail-zekasi': <MailMedia />,
    'toplanti-hazirligi': <MeetingMedia />,
    'akilli-planlama': <PlanningMedia />,
    'ai-hafiza': <MemoryMedia />,
  }

  return (
    <>
      <Hero />
      <IntegrationsStrip />
      <HowItWorks />

      <div id="ozellikler">
        {features.map((feature, index) => (
          <FeatureSection
            key={feature.id}
            feature={feature}
            media={media[feature.id] ?? null}
            reversed={index % 2 === 1}
          />
        ))}
      </div>

      <SecuritySection />
      <PricingTable />
      <Faq />
      <FinalCta />
    </>
  )
}

const mailRows = [
  {
    sender: 'Ayşe Demir',
    subject: 'Teklif revizyonu — geri dönüş bekliyoruz',
    chip: 'Yanıt bekliyor',
    chipClass: 'bg-critical-soft text-critical-text',
  },
  {
    sender: 'Emlak ofisi',
    subject: 'Sözleşme imzası için son gün',
    chip: 'Son tarih',
    chipClass: 'bg-warning-soft text-warning-text',
  },
  {
    sender: 'Kargo bildirimi',
    subject: 'Gönderin dağıtıma çıktı',
    chip: 'Kargo',
    chipClass: 'bg-success-soft text-success-text',
  },
  {
    sender: 'Banka',
    subject: 'Kart ekstren hazır',
    chip: 'Ödeme',
    chipClass: 'bg-info-soft text-info-text',
  },
] as const

function MailMedia() {
  return (
    <div className="da-card p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold tracking-wide text-faint uppercase">Öne çıkanlar</p>
        <p className="text-[12px] text-faint">1.284 mail tarandı · 7 tanesi seni ilgilendiriyor</p>
      </div>

      <ul className="mt-4 space-y-2">
        {mailRows.map((row) => (
          <li key={row.subject} className="rounded-md border border-hairline bg-bg p-3.5">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-medium text-ink">{row.sender}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${row.chipClass}`}>
                {row.chip}
              </span>
            </div>
            <p className="mt-1 text-[13px] leading-5 text-muted">{row.subject}</p>
          </li>
        ))}
      </ul>

      <p className="mt-4 rounded-md bg-surface2 px-3.5 py-3 text-[12px] leading-5 text-muted">
        Geri kalan 1.277 mail sessize alındı. “Bu önemli değil” dediğin gönderenler bir daha öne
        çıkmaz.
      </p>
    </div>
  )
}

function MeetingMedia() {
  return (
    <div className="da-card p-5 sm:p-6">
      <p className="text-[12px] font-medium tracking-wide text-faint uppercase">Bugün 11:00</p>
      <h3 className="mt-1 text-[20px] font-semibold tracking-tight text-ink">Ürün toplantısı</h3>
      <p className="mt-1 text-[13px] text-muted">3 katılımcı · 45 dakika · Çevrim içi</p>

      <div className="mt-5 space-y-3">
        <div className="rounded-md bg-surface2 p-3.5">
          <p className="text-[12px] font-semibold text-faint uppercase">Son yazışma</p>
          <p className="mt-1 text-[13px] leading-5 text-ink">
            Ayşe, cuma günü fiyat tablosunun güncel hâlini istedi.
          </p>
        </div>
        <div className="rounded-md bg-surface2 p-3.5">
          <p className="text-[12px] font-semibold text-faint uppercase">Açık kalan söz</p>
          <p className="mt-1 text-[13px] leading-5 text-ink">
            Geçen toplantıda entegrasyon takvimini paylaşacağını söylemiştin.
          </p>
        </div>
      </div>

      <div className="da-proposed mt-4 p-3.5">
        <p className="text-[12px] font-medium text-primary">Öneri · henüz gerçek değil</p>
        <p className="mt-1 text-[13px] leading-5 text-ink">
          Toplantı sonrası “Entegrasyon takvimini gönder” işi oluşturulsun mu?
        </p>
      </div>
    </div>
  )
}

const planningSlots = [
  { time: '09:00', label: 'Boş — odak için uygun', kind: 'free' },
  { time: '11:00', label: 'Ürün toplantısı', kind: 'busy' },
  { time: '12:00', label: 'Tedarikçi görüşmesi ile çakışıyor', kind: 'conflict' },
  { time: '16:00', label: 'Boş', kind: 'free' },
] as const

function PlanningMedia() {
  return (
    <div className="da-card p-5 sm:p-6">
      <div className="flex items-baseline justify-between">
        <p className="text-[13px] font-semibold tracking-wide text-faint uppercase">Günün yükü</p>
        <p className="text-[12px] text-faint">3 toplantı · 4 saat 15 dk</p>
      </div>

      <ul className="mt-4 space-y-2">
        {planningSlots.map((slot) => (
          <li key={slot.time} className="flex items-center gap-3">
            <span className="w-12 shrink-0 text-[12px] text-faint tabular-nums">{slot.time}</span>
            <span
              className={
                slot.kind === 'busy'
                  ? 'flex-1 rounded-md bg-primary-soft px-3 py-2.5 text-[13px] font-medium text-primary-on-soft'
                  : slot.kind === 'conflict'
                    ? 'flex-1 rounded-md bg-critical-soft px-3 py-2.5 text-[13px] font-medium text-critical-text'
                    : 'flex-1 rounded-md bg-surface2 px-3 py-2.5 text-[13px] text-muted'
              }
            >
              {slot.label}
            </span>
          </li>
        ))}
      </ul>

      <div className="da-proposed mt-4 p-3.5">
        <p className="text-[12px] font-medium text-primary">Önerilen odak bloğu</p>
        <p className="mt-1 text-[13px] leading-5 text-ink">
          09:00 – 10:30 arası teklif için ayrılsın mı? Onaylarsan takvime yazılır.
        </p>
      </div>
    </div>
  )
}

function MemoryMedia() {
  return (
    <div className="da-card p-5 sm:p-6">
      <div className="flex justify-end">
        <p className="max-w-[80%] rounded-lg rounded-br-sm bg-primary px-3.5 py-2.5 text-[14px] leading-6 text-on-primary">
          Ayşe’ye ne söz vermiştim?
        </p>
      </div>

      <div className="mt-4 max-w-[88%] rounded-lg rounded-bl-sm bg-surface2 px-3.5 py-3">
        <p className="text-[14px] leading-6 text-ink">
          Cuma günkü yazışmada fiyat tablosunun güncel hâlini bu hafta göndereceğini yazmışsın.
        </p>
        <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[11px] text-muted">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
          Kaynak: Ayşe Demir · 4 Eylül 16:42
        </p>
      </div>

      <div className="mt-3 max-w-[88%] rounded-lg rounded-bl-sm border border-hairline px-3.5 py-3">
        <p className="text-[13px] leading-6 text-muted">
          Tabloda hangi rakamın konuşulduğu sorulursa: <strong className="text-ink">Kaynakta
          kesinleşmiyor.</strong> Asistan tahmin etmez, boş bırakır.
        </p>
      </div>
    </div>
  )
}
