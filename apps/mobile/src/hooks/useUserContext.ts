import { DEFAULT_TIME_ZONE, type Locale, isValidTimeZone } from '@da/domain'
import * as Localization from 'expo-localization'
import { useMemo } from 'react'
import { useI18n } from '../i18n/I18nProvider'
import { useSessionStore } from '../stores/session'

export interface UserContext {
  userId: string | null
  /** IANA zone every date in the UI is rendered in. */
  timeZone: string
  locale: Locale
  displayName: string | null
  givenName: string | null
}

/**
 * The user's rendering context.
 *
 * The time zone resolution order matters: the profile wins, because a user who
 * travels still wants their briefing at 07:30 *at home* rather than shifting
 * with the plane. The device zone is only a fallback for a profile that has not
 * loaded yet.
 */
export function useUserContext(): UserContext {
  const profile = useSessionStore((s) => s.profile)
  const userId = useSessionStore((s) => s.userId)
  const { locale } = useI18n()

  return useMemo(() => {
    const deviceZone = Localization.getCalendars()[0]?.timeZone ?? null
    const profileZone = profile?.timeZone ?? null

    const timeZone =
      profileZone && isValidTimeZone(profileZone)
        ? profileZone
        : deviceZone && isValidTimeZone(deviceZone)
          ? deviceZone
          : DEFAULT_TIME_ZONE

    return {
      userId,
      timeZone,
      locale,
      displayName: profile?.displayName ?? null,
      givenName: profile?.givenName ?? profile?.displayName?.split(' ')[0] ?? null,
    }
  }, [profile, userId, locale])
}
