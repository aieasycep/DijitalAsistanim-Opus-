import { AppError } from '@da/domain'
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'
import { File } from 'expo-file-system'
import { useCallback, useState } from 'react'
import { useI18n } from '../i18n/I18nProvider'
import { reportError } from '../lib/error-reporting'
import { useApi } from '../providers/AppProviders'

/** Anything shorter is a mis-tap; anything longer is not a question. */
export const MIN_RECORDING_MS = 700
export const MAX_RECORDING_MS = 60_000

export type VoiceState = 'idle' | 'recording' | 'transcribing' | 'done' | 'error'

/**
 * Record a question and turn it into text.
 *
 * The audio is uploaded for one transcription call and is never stored: the
 * local file is deleted as soon as the request returns, and the backend keeps
 * only the resulting text. That is what the privacy line on the screen claims,
 * so it has to be true here.
 */
export function useVoiceCapture(): {
  state: VoiceState
  transcript: string
  durationMs: number
  meter: number
  start: () => Promise<void>
  stop: () => Promise<string | null>
  cancel: () => Promise<void>
  reset: () => void
  error: unknown
} {
  const api = useApi()
  const { locale } = useI18n()
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const recorderState = useAudioRecorderState(recorder, 200)

  const [state, setState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<unknown>(null)

  const start = useCallback(async () => {
    setError(null)
    setTranscript('')
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync()
      if (!permission.granted) {
        throw new AppError('permission_denied', { detail: 'microphone permission refused' })
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
      await recorder.prepareToRecordAsync()
      recorder.record()
      setState('recording')
    } catch (caught) {
      setState('error')
      setError(caught)
    }
  }, [recorder])

  const discardFile = useCallback((uri: string | null) => {
    if (!uri) return
    try {
      const file = new File(uri)
      if (file.exists) file.delete()
    } catch (caught) {
      // A leftover temp file is not worth failing the flow over, but it is
      // worth knowing about.
      reportError(caught, { scope: 'useVoiceCapture:discardFile' })
    }
  }, [])

  const stop = useCallback(async (): Promise<string | null> => {
    if (state !== 'recording') return null
    let uri: string | null = null
    try {
      await recorder.stop()
      uri = recorder.uri
      if (!uri) throw new AppError('capture_failed', { detail: 'no recording produced' })

      setState('transcribing')
      const file = new File(uri)
      const audioBase64 = file.base64Sync()
      const result = await api.assistant.transcribe({
        audioBase64,
        mimeType: 'audio/m4a',
        locale,
      })
      setTranscript(result.text)
      setState('done')
      return result.text
    } catch (caught) {
      setState('error')
      setError(caught)
      return null
    } finally {
      discardFile(uri)
      await setAudioModeAsync({ allowsRecording: false })
    }
  }, [api, discardFile, locale, recorder, state])

  const cancel = useCallback(async () => {
    if (state === 'recording') {
      try {
        await recorder.stop()
      } catch (caught) {
        reportError(caught, { scope: 'useVoiceCapture:cancel' })
      }
      discardFile(recorder.uri)
    }
    await setAudioModeAsync({ allowsRecording: false })
    setState('idle')
    setTranscript('')
  }, [discardFile, recorder, state])

  return {
    state,
    transcript,
    durationMs: recorderState.durationMillis,
    meter: recorderState.metering ?? -60,
    start,
    stop,
    cancel,
    reset: useCallback(() => {
      setState('idle')
      setTranscript('')
      setError(null)
    }, []),
    error,
  }
}
