import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SignInForm } from '@/components/SignInForm'
import { readStaffSession } from '@/lib/auth'
import { isConfigured } from '@/lib/env'
import { messages } from '@/lib/messages'

export const metadata: Metadata = { title: messages.auth.signInTitle }

/** Cookies are read on every request, so this page is never prerendered. */
export const dynamic = 'force-dynamic'

export default async function SignInPage() {
  // A configuration failure must say so rather than presenting a form that
  // cannot possibly succeed.
  if (!isConfigured()) {
    return (
      <Frame>
        <p
          role="alert"
          className="rounded-md bg-critical-soft px-3 py-2 text-[12px] text-critical-text"
        >
          {messages.errors.configMissing}
        </p>
      </Frame>
    )
  }

  const session = await readStaffSession()
  // An operator who still has a live session (the middleware may have just
  // refreshed it) should not be asked to type a password again.
  if (session.kind === 'staff') redirect('/')

  return (
    <Frame>
      <SignInForm />
    </Frame>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-md bg-primary text-[12px] font-bold text-on-primary"
          >
            DA
          </span>
          <div className="leading-tight">
            <div className="text-[14px] font-semibold text-ink">{messages.app.name}</div>
            <div className="bo-kicker">{messages.app.suffix}</div>
          </div>
        </div>

        <div className="bo-panel p-5">
          <h1 className="text-[16px] font-semibold text-ink">{messages.auth.signInTitle}</h1>
          <p className="mt-1 mb-4 text-[12px] text-muted">{messages.auth.signInSubtitle}</p>
          {children}
        </div>

        <p className="mt-3 text-[11px] text-faint">{messages.app.privacyBanner}</p>
      </div>
    </div>
  )
}
