import Link from 'next/link'
import { siteConfig } from '@/lib/site-config'

type FooterColumn = {
  readonly title: string
  readonly links: readonly { readonly href: string; readonly label: string }[]
}

const columns: readonly FooterColumn[] = [
  {
    title: 'Ürün',
    links: [
      { href: '/#ozellikler', label: 'Özellikler' },
      { href: '/#nasil-calisir', label: 'Nasıl çalışır' },
      { href: '/pricing', label: 'Fiyatlar' },
      { href: '/#sss', label: 'Sık sorulanlar' },
    ],
  },
  {
    title: 'Güven',
    links: [
      { href: '/privacy', label: 'Gizlilik Politikası' },
      { href: '/terms', label: 'Kullanım Koşulları' },
      { href: '/data-deletion', label: 'Veri Silme' },
      { href: '/oauth', label: 'Bağlantı ve izinler' },
    ],
  },
  {
    title: 'Destek',
    links: [
      { href: '/support', label: 'Destek merkezi' },
      { href: `mailto:${siteConfig.email.support}`, label: siteConfig.email.support },
      { href: `mailto:${siteConfig.email.privacy}`, label: siteConfig.email.privacy },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-hairline bg-surface">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-[15px] font-semibold text-ink">{siteConfig.name}</p>
            <p className="mt-3 max-w-xs text-[14px] leading-6 text-muted">
              Mailini, takvimini ve yapman gerekenleri tek yerde anlar. Gürültüyü değil, önemli
              olanı gösterir.
            </p>
          </div>

          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <p className="text-[13px] font-semibold tracking-wide text-faint uppercase">
                {column.title}
              </p>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={`${column.title}-${link.href}`}>
                    <Link
                      href={link.href}
                      className="rounded-xs text-[14px] text-muted transition-colors hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 border-t border-hairline pt-6">
          <p className="max-w-2xl text-[13px] leading-6 text-faint">
            Veriler aktarım sırasında ve saklanırken şifrelenir. Verilerin reklamverenlere satılmaz.
          </p>
          <p className="mt-3 text-[13px] text-faint">
            © {siteConfig.updatedAt.slice(-4)} {siteConfig.company}. Tüm hakları saklıdır.
          </p>
        </div>
      </div>
    </footer>
  )
}
