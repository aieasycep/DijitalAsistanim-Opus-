'use client'

import { useEffect } from 'react'

const SCHEME = process.env.NEXT_PUBLIC_APP_SCHEME ?? 'dijitalasistan'

/**
 * Try to hand the visitor off to the installed app.
 *
 * The attempt runs once, on mount, and only for a path the server already
 * validated — the scheme URL is assembled from a fixed allow-list rather than
 * from whatever was in the address bar, so a crafted link cannot be bounced
 * into an arbitrary custom-scheme target.
 *
 * There is deliberately no timer-based "if you are still here" logic: it fires
 * on every desktop visit and on iOS Safari even when the app did open, which
 * makes the page flash a store redirect at people who are already in the app.
 */
export function DeepLinkRedirect({ path }: { readonly path: string }) {
  useEffect(() => {
    const url = `${SCHEME}://${path}`
    // `location.replace` keeps the landing page out of the back stack, so
    // returning from the app does not bounce the user straight back into it.
    window.location.replace(url)
  }, [path])

  return null
}
