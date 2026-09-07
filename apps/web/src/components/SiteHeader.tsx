import Link from 'next/link'
import { navLinks } from '@/lib/content'
import { siteConfig } from '@/lib/site-config'
import { ThemeToggle } from '@/components/ThemeToggle'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-hairline bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 rounded-xs text-ink"
          aria-label={`${siteConfig.name} ana sayfa`}
        >
          <Mark />
          <span className="text-[15px] font-semibold tracking-tight">{siteConfig.name}</span>
        </Link>

        <nav aria-label="Ana menü" className="ml-auto hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-xs px-3 py-2 text-[14px] text-muted transition-colors hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-3">
          <ThemeToggle />
          <Link
            href="/#indir"
            className="hidden h-10 items-center rounded-full bg-primary px-4 text-[14px] font-medium text-on-primary transition-colors hover:bg-primary-pressed sm:inline-flex"
          >
            Ücretsiz başla
          </Link>

          <details className="relative lg:hidden">
            <summary
              className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border border-hairline bg-surface text-ink"
              aria-label="Menüyü aç"
            >
              <svg
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </summary>
            <div className="absolute right-0 top-12 w-60 rounded-xl border border-hairline bg-surface p-2 shadow-lift">
              <nav aria-label="Mobil menü" className="flex flex-col">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-xs px-3 py-2.5 text-[15px] text-ink transition-colors hover:bg-surface2"
                  >
                    {link.label}
                  </Link>
                ))}
                <Link
                  href="/#indir"
                  className="mt-1 rounded-xs bg-primary px-3 py-2.5 text-center text-[15px] font-medium text-on-primary"
                >
                  Ücretsiz başla
                </Link>
              </nav>
            </div>
          </details>
        </div>
      </div>
    </header>
  )
}

function Mark() {
  return (
    <span
      aria-hidden="true"
      className="da-dawn flex h-8 w-8 items-center justify-center rounded-[10px]"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.5 14.6 9.4 20.5 12l-5.9 2.6L12 20.5 9.4 14.6 3.5 12l5.9-2.6z" />
      </svg>
    </span>
  )
}
