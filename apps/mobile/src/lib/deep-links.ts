import * as Linking from 'expo-linking'
import { env } from './env'

/**
 * Deep-link routing.
 *
 * Three entry points converge here — the `dijitalasistan://` scheme, universal
 * links on the marketing domain, and push-notification taps — and all three
 * must land on the same screen for the same target. Centralising the mapping is
 * what keeps a push tap and a shared link from drifting apart.
 */

export type DeepLinkTarget =
  | { screen: 'today' }
  | { screen: 'briefing'; kind: 'morning' | 'midday' | 'evening' | 'weekly'; id?: string }
  | { screen: 'thread'; threadId: string }
  | { screen: 'event'; eventId: string }
  | { screen: 'meeting-prep'; eventId: string }
  | { screen: 'approval'; approvalId: string }
  | { screen: 'approvals' }
  | { screen: 'commitment'; commitmentId: string }
  | { screen: 'followups' }
  | { screen: 'person'; contactId: string }
  | { screen: 'capture'; sharedText?: string; sharedUrl?: string }
  | { screen: 'life-event'; lifeEventId: string }
  | { screen: 'assistant'; question?: string }
  | { screen: 'settings' }
  | { screen: 'paywall'; source?: string }
  | { screen: 'referral'; code?: string }

/** Map a parsed URL to a target. Returns null for anything unrecognised. */
export function parseDeepLink(url: string): DeepLinkTarget | null {
  let parsed: Linking.ParsedURL
  try {
    parsed = Linking.parse(url)
  } catch {
    return null
  }

  const path = (parsed.path ?? '').replace(/^\/+|\/+$/g, '')
  const q = parsed.queryParams ?? {}
  const str = (key: string): string | undefined => {
    const v = q[key]
    return typeof v === 'string' && v !== '' ? v : undefined
  }

  const segments = path.split('/').filter(Boolean)
  // Universal links are namespaced under /l so the marketing site's own routes
  // (/pricing, /privacy) are never swallowed by the app.
  const parts = segments[0] === 'l' ? segments.slice(1) : segments
  const [head, tail] = parts

  switch (head) {
    case undefined:
    case '':
    case 'today':
      return { screen: 'today' }

    case 'briefing': {
      const kind = tail
      if (kind === 'morning' || kind === 'midday' || kind === 'evening' || kind === 'weekly') {
        const id = str('id')
        return id ? { screen: 'briefing', kind, id } : { screen: 'briefing', kind }
      }
      return { screen: 'briefing', kind: 'morning' }
    }

    case 'thread':
    case 'email':
      return tail ? { screen: 'thread', threadId: tail } : null

    case 'event':
      return tail ? { screen: 'event', eventId: tail } : null

    case 'meeting':
      return tail ? { screen: 'meeting-prep', eventId: tail } : null

    case 'approval':
      return tail ? { screen: 'approval', approvalId: tail } : { screen: 'approvals' }

    case 'approvals':
      return { screen: 'approvals' }

    case 'commitment':
      return tail ? { screen: 'commitment', commitmentId: tail } : null

    case 'followups':
      return { screen: 'followups' }

    case 'person':
      return tail ? { screen: 'person', contactId: tail } : null

    case 'life':
      return tail ? { screen: 'life-event', lifeEventId: tail } : null

    case 'capture': {
      const sharedText = str('text')
      const sharedUrl = str('url')
      return {
        screen: 'capture',
        ...(sharedText ? { sharedText } : {}),
        ...(sharedUrl ? { sharedUrl } : {}),
      }
    }

    case 'assistant': {
      const question = str('q')
      return question ? { screen: 'assistant', question } : { screen: 'assistant' }
    }

    case 'settings':
      return { screen: 'settings' }

    case 'pro':
    case 'paywall': {
      const source = str('source')
      return source ? { screen: 'paywall', source } : { screen: 'paywall' }
    }

    case 'invite':
    case 'referral': {
      const code = tail ?? str('code')
      return code ? { screen: 'referral', code } : { screen: 'referral' }
    }

    default:
      return null
  }
}

/** The Expo Router path a target maps to. */
export function targetToRoute(target: DeepLinkTarget): string {
  switch (target.screen) {
    case 'today':
      return '/(tabs)/today'
    case 'briefing':
      return target.id
        ? `/briefing/${target.kind}?id=${encodeURIComponent(target.id)}`
        : `/briefing/${target.kind}`
    case 'thread':
      return `/thread/${encodeURIComponent(target.threadId)}`
    case 'event':
      return `/event/${encodeURIComponent(target.eventId)}`
    case 'meeting-prep':
      return `/meeting/${encodeURIComponent(target.eventId)}`
    case 'approval':
      return `/approval/${encodeURIComponent(target.approvalId)}`
    case 'approvals':
      return '/approvals'
    case 'commitment':
      return `/commitment/${encodeURIComponent(target.commitmentId)}`
    case 'followups':
      return '/followups'
    case 'person':
      return `/person/${encodeURIComponent(target.contactId)}`
    case 'life-event':
      return `/life/${encodeURIComponent(target.lifeEventId)}`
    case 'capture': {
      const params = new URLSearchParams()
      if (target.sharedText) params.set('text', target.sharedText)
      if (target.sharedUrl) params.set('url', target.sharedUrl)
      const qs = params.toString()
      return qs ? `/capture?${qs}` : '/capture'
    }
    case 'assistant':
      return target.question
        ? `/(tabs)/assistant?q=${encodeURIComponent(target.question)}`
        : '/(tabs)/assistant'
    case 'settings':
      return '/settings'
    case 'paywall':
      return target.source ? `/paywall?source=${encodeURIComponent(target.source)}` : '/paywall'
    case 'referral':
      return target.code ? `/referral?code=${encodeURIComponent(target.code)}` : '/referral'
  }
}

/** A shareable https link for a target, used by referral and share sheets. */
export function shareableLink(target: DeepLinkTarget): string {
  const base = `${env.webUrl.replace(/\/$/, '')}/l`
  switch (target.screen) {
    case 'referral':
      return target.code ? `${base}/invite/${encodeURIComponent(target.code)}` : `${base}/referral`
    case 'paywall':
      return `${base}/pro`
    default:
      return env.webUrl
  }
}
