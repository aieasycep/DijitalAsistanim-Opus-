import Link from 'next/link'
import { messages } from '@/lib/messages'

export default function BackofficeNotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="bo-panel w-full max-w-md p-6 text-center">
        <span className="bo-kicker">404</span>
        <h1 className="mt-1 text-[16px] font-semibold text-ink">{messages.errors.notFoundTitle}</h1>
        <p className="mt-1 text-[13px] text-muted">{messages.errors.notFoundBody}</p>
        <Link
          href="/"
          className="mt-4 inline-flex h-8 items-center rounded-md bg-primary px-4 text-[13px] font-medium text-on-primary hover:bg-primary-pressed"
        >
          {messages.auth.backToOverview}
        </Link>
      </div>
    </div>
  )
}
