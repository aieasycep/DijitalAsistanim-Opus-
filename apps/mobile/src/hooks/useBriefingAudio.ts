import type { Briefing } from '@da/domain'
import { createAudioPlayer, type AudioPlayer } from 'expo-audio'
import * as Speech from 'expo-speech'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/I18nProvider'
import { reportError } from '../lib/error-reporting'
import { useApi } from '../providers/AppProviders'
import { useEntitlements } from './useEntitlements'

/**
 * Listening to a briefing.
 *
 * Two paths, and the fallback is not a degraded stub: when no server-side TTS
 * provider is configured the device's own speech synthesiser reads the same
 * narrative, so "listen" always works rather than being a button that explains
 * why it cannot.
 */
export function useBriefingAudio(briefing: Briefing | null): {
  available: boolean
  isPlaying: boolean
  isPreparing: boolean
  play: () => void
  stop: () => void
  error: unknown
} {
  const api = useApi()
  const { locale } = useI18n()
  const { can } = useEntitlements()
  const [isPlaying, setPlaying] = useState(false)
  const [isPreparing, setPreparing] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const playerRef = useRef<AudioPlayer | null>(null)

  const teardown = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.remove()
      playerRef.current = null
    }
    void Speech.stop()
  }, [])

  useEffect(() => teardown, [teardown])

  const stop = useCallback(() => {
    teardown()
    setPlaying(false)
  }, [teardown])

  const play = useCallback(() => {
    if (!briefing?.narrative) return
    setError(null)
    setPreparing(true)
    setPlaying(true)

    void (async () => {
      try {
        // A generated audio file is only worth requesting for a plan that
        // includes it; everyone else goes straight to on-device speech.
        const remote = can('voice_briefing')
          ? await api.briefings.requestAudio({ briefingId: briefing.id })
          : { audioUrl: null }

        if (remote.audioUrl) {
          const player = createAudioPlayer({ uri: remote.audioUrl })
          playerRef.current = player
          player.play()
          return
        }

        Speech.speak(briefing.narrative ?? '', {
          language: locale === 'tr' ? 'tr-TR' : 'en-GB',
          rate: 0.98,
          onDone: () => setPlaying(false),
          onStopped: () => setPlaying(false),
          onError: () => setPlaying(false),
        })
      } catch (caught) {
        reportError(caught, { scope: 'useBriefingAudio:play' })
        setError(caught)
        setPlaying(false)
      } finally {
        setPreparing(false)
      }
    })()
  }, [api, briefing, can, locale])

  return {
    available: Boolean(briefing?.narrative),
    isPlaying,
    isPreparing,
    play,
    stop,
    error,
  }
}
