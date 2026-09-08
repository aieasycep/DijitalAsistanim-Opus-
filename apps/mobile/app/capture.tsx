import { qk } from '@da/api-client'
import { spacing } from '@da/design-tokens'
import type { Capture, CaptureKind } from '@da/domain'
import { formatFullDate, formatMoney, formatTime } from '@da/i18n'
import { MaterialIcons } from '@expo/vector-icons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { Badge } from '../src/components/ui/Badge'
import { Button } from '../src/components/ui/Button'
import { Card } from '../src/components/ui/Card'
import { FilterChip } from '../src/components/ui/Controls'
import { Screen } from '../src/components/ui/Screen'
import { ScreenHeader } from '../src/components/ui/ScreenHeader'
import { ErrorState, SkeletonCard } from '../src/components/ui/States'
import { Text } from '../src/components/ui/Text'
import { TextField } from '../src/components/ui/TextField'
import { useCapture, useInvalidateAfterWrite } from '../src/hooks/queries'
import { drainSharedCaptures, stageSharedFile } from '../src/lib/native/shared-captures'
import { useEntitlements } from '../src/hooks/useEntitlements'
import { useUserContext } from '../src/hooks/useUserContext'
import { useI18n, useT } from '../src/i18n/I18nProvider'
import { track } from '../src/lib/analytics'
import { reportError } from '../src/lib/error-reporting'
import { uploadCaptureFile } from '../src/lib/upload'
import { errorMessageKey, isRetryable } from '../src/lib/query-client'
import { useApi } from '../src/providers/AppProviders'
import { useTheme } from '../src/theme/ThemeProvider'

type Mode = 'text' | 'link' | 'camera' | 'file'

/**
 * The four ways in, in the order they are offered.
 *
 * Each carries its own `testID` (`capture-text`, `capture-link`,
 * `capture-camera`, `capture-file`). The picker used to be one control with a
 * single id, so nothing could choose a mode: the screen opens on `text`, and
 * an end-to-end flow reaching for the link field found a field that had not
 * been rendered yet. The ids are the mode, and the controls inside each mode
 * are named for the action they perform.
 */
const MODES: ReadonlyArray<{ value: Mode; labelKey: string }> = [
  { value: 'text', labelKey: 'capture.kind.text' },
  { value: 'link', labelKey: 'capture.kind.link' },
  { value: 'camera', labelKey: 'capture.kind.camera' },
  { value: 'file', labelKey: 'capture.kind.file' },
]

/**
 * Capture — a photo, a file, a link or a note.
 *
 * The upload is a signed, user-scoped path: the file goes straight to storage
 * and only the path is sent to the backend, so the app never proxies bytes
 * through an endpoint that would have to be trusted with them.
 */
export default function CaptureScreen() {
  const t = useT()
  const { locale } = useI18n()
  const theme = useTheme()
  const router = useRouter()
  const api = useApi()
  const queryClient = useQueryClient()
  const invalidate = useInvalidateAfterWrite()
  const { timeZone } = useUserContext()
  const { can } = useEntitlements()
  const params = useLocalSearchParams<{ id?: string; url?: string; text?: string }>()

  const shareIntake = useRef(false)
  const [mode, setMode] = useState<Mode>(params.url ? 'link' : 'text')
  const [link, setLink] = useState(params.url ?? '')
  const [note, setNote] = useState(params.text ?? '')
  const [captureId, setCaptureId] = useState<string | null>(params.id ?? null)

  // Once a capture exists the screen becomes its status view, polling until the
  // analysis settles.
  const captureQuery = useCapture(captureId)
  const capture = captureQuery.data ?? null

  const finish = useCallback(
    async (created: Capture) => {
      setCaptureId(created.id)
      track('capture_completed', { kind: created.kind })
      await queryClient.invalidateQueries({ queryKey: qk.captures() })
      await invalidate()
    },
    [invalidate, queryClient],
  )

  const createText = useMutation({
    mutationFn: () => api.captures.create({ kind: 'text', rawText: note.trim() }),
    onSuccess: finish,
  })

  const createLink = useMutation({
    mutationFn: () => api.captures.create({ kind: 'link', sourceUrl: link.trim() }),
    onSuccess: finish,
  })

  const createFile = useMutation({
    mutationFn: async (input: {
      uri: string
      name: string
      mimeType: string
      size: number
      kind: CaptureKind
    }) => {
      const target = await api.captures.uploadUrl({
        filename: input.name,
        mimeType: input.mimeType,
        sizeBytes: input.size,
      })
      await uploadCaptureFile(target.uploadUrl, input.uri, input.mimeType)
      return api.captures.create({
        kind: input.kind,
        storagePath: target.storagePath,
        mimeType: input.mimeType,
        sizeBytes: input.size,
      })
    },
    onSuccess: finish,
  })

  /**
   * "Yeniden incele" on a capture that could not be read.
   *
   * This used to refetch the row. The row is terminal — a failed capture stays
   * failed however often it is read — so the button looked like a retry and
   * was one only for a capture still being analysed, which is the one case
   * where it is not offered. It now sends the same source through the
   * pipeline again and the screen follows the new capture.
   */
  const reanalyse = useMutation({
    mutationFn: (source: Capture) =>
      api.captures.create({
        kind: source.kind,
        storagePath: source.storagePath,
        sourceUrl: source.sourceUrl,
        rawText: source.rawText,
        mimeType: source.mimeType,
        sizeBytes: source.sizeBytes,
      }),
    onSuccess: finish,
  })

  const pickPhoto = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      exif: false,
    })
    const asset = result.assets?.[0]
    if (result.canceled || !asset) return
    createFile.mutate({
      uri: asset.uri,
      name: asset.fileName ?? 'capture.jpg',
      mimeType: asset.mimeType ?? 'image/jpeg',
      size: asset.fileSize ?? 0,
      kind: 'photo',
    })
  }, [createFile])

  const takePhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) return
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8, exif: false })
    const asset = result.assets?.[0]
    if (result.canceled || !asset) return
    createFile.mutate({
      uri: asset.uri,
      name: asset.fileName ?? 'capture.jpg',
      mimeType: asset.mimeType ?? 'image/jpeg',
      size: asset.fileSize ?? 0,
      kind: 'camera',
    })
  }, [createFile])

  const pickFile = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'text/*', 'image/*'],
      copyToCacheDirectory: true,
    })
    const asset = result.assets?.[0]
    if (result.canceled || !asset) return
    createFile.mutate({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? 'application/octet-stream',
      size: asset.size ?? 0,
      kind: asset.mimeType === 'application/pdf' ? 'pdf' : 'file',
    })
  }, [createFile])

  // Anything the share extension queued while the app was closed is picked up
  // once, on the first open of this screen. Draining is destructive on the
  // native side, so the guard matters: a re-render must not lose a capture.
  useEffect(() => {
    if (shareIntake.current || params.id) return
    shareIntake.current = true

    const pending = drainSharedCaptures()
    const first = pending[0]
    if (!first) return

    if (first.url) {
      setMode('link')
      setLink(first.url)
      return
    }
    if (first.text) {
      setMode('text')
      setNote(first.text)
      return
    }
    const fileUri = first.fileUris[0]
    if (fileUri) {
      try {
        const staged = stageSharedFile(fileUri)
        createFile.mutate({
          uri: staged,
          name: staged.split('/').pop() ?? 'capture',
          mimeType: staged.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
          size: 0,
          kind: staged.toLowerCase().endsWith('.pdf') ? 'pdf' : 'photo',
        })
      } catch (caught) {
        reportError(caught, { scope: 'capture:shareIntake' })
      }
    }
  }, [createFile, params.id])

  const busy = createText.isPending || createLink.isPending || createFile.isPending
  const error = createText.error ?? createLink.error ?? createFile.error

  /**
   * A capture id in hand means this screen is that capture's status view, and
   * it stays that view until the row arrives or the fetch fails.
   *
   * It used to fall through to the composer whenever `data` was undefined, so
   * opening a capture from Today — or the moment right after creating one —
   * showed an empty "new capture" screen: the capture looked as though it had
   * never existed. The screen now says which of the two it is.
   */
  if (captureId && !capture) {
    return (
      <Screen scroll bottomInset={spacing.xxl}>
        <ScreenHeader title={t('capture.title')} dismiss onBack={() => router.back()} />
        <View style={{ gap: spacing.sm, paddingTop: spacing.sm }}>
          {captureQuery.isError ? (
            <ErrorState
              message={t(errorMessageKey(captureQuery.error))}
              {...(isRetryable(captureQuery.error)
                ? {
                    retryLabel: t('common.action.retry'),
                    onRetry: () => void captureQuery.refetch(),
                  }
                : {})}
              testID="capture-error"
            />
          ) : (
            // Still fetching. A skeleton says "we do not have this yet",
            // where the composer said "this never existed".
            <SkeletonCard />
          )}
        </View>
      </Screen>
    )
  }

  if (capture) {
    const extraction = capture.extracted
    return (
      <Screen scroll bottomInset={spacing.xxl}>
        <ScreenHeader title={t('capture.title')} dismiss onBack={() => router.back()} />

        <View style={{ gap: spacing.md, paddingTop: spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
            <Badge label={t(`capture.kind.${capture.kind}`)} tone="neutral" />
            <Badge
              label={t(`capture.status.${capture.status}`)}
              tone={
                capture.status === 'ready'
                  ? 'success'
                  : capture.status === 'failed'
                    ? 'critical'
                    : 'info'
              }
            />
            {capture.detectedIntent ? (
              <Badge label={t(`capture.intent.${capture.detectedIntent}`)} tone="primary" />
            ) : null}
          </View>

          {capture.status === 'failed' ? (
            <Card tone="critical" style={{ gap: spacing.xs }}>
              <Text variant="secondary" tone="critical">
                {t('capture.statusHint.failed')}
              </Text>
              {reanalyse.error ? (
                <Text variant="secondary" tone="critical">
                  {t(errorMessageKey(reanalyse.error))}
                </Text>
              ) : null}
              <Button
                label={t('capture.action.retryAnalysis')}
                onPress={() => reanalyse.mutate(capture)}
                variant="tonal"
                size="sm"
                loading={reanalyse.isPending}
                testID="capture-retry"
              />
            </Card>
          ) : null}

          {!extraction ? (
            <Card>
              <Text variant="secondary" tone="secondary">
                {t(`capture.statusHint.${capture.status}`)}
              </Text>
            </Card>
          ) : (
            <Card style={{ gap: spacing.xs }}>
              <Text variant="h3">{extraction.title}</Text>
              <Text variant="body" tone="secondary">
                {extraction.summary}
              </Text>

              {extraction.startsAt ? (
                <Text variant="secondary">
                  {formatFullDate(new Date(extraction.startsAt), locale, timeZone)} ·{' '}
                  {formatTime(new Date(extraction.startsAt), locale, timeZone)}
                </Text>
              ) : null}
              {extraction.location ? <Text variant="secondary">{extraction.location}</Text> : null}
              {extraction.amount ? (
                <View>
                  <Text variant="micro" tone="tertiary">
                    {t('capture.extraction.amountField')}
                  </Text>
                  <Text variant="secondary" tabular>
                    {formatMoney(extraction.amount.value, extraction.amount.currency, locale)}
                  </Text>
                </View>
              ) : null}
              {extraction.reference ? (
                <View>
                  <Text variant="micro" tone="tertiary">
                    {t('capture.extraction.codeField')}
                  </Text>
                  <Text variant="secondary" tabular>
                    {extraction.reference}
                  </Text>
                </View>
              ) : null}

              {/* An amount, a reference or a date is only stored when the
                  server found the sentence it was read from in the capture
                  itself, so anything shown above is quoted, not inferred. */}
              {extraction.startsAt || extraction.amount || extraction.reference ? (
                <Badge
                  label={t('capture.extraction.verified')}
                  tone="success"
                  icon="check-circle"
                />
              ) : null}

              {extraction.keyPoints.length > 0 ? (
                <View style={{ gap: 4, marginTop: spacing.xxs }}>
                  {extraction.keyPoints.map((point) => (
                    <View key={point} style={{ flexDirection: 'row', gap: spacing.xs }}>
                      <MaterialIcons
                        name="circle"
                        size={6}
                        color={theme.colors.textTertiary}
                        style={{ marginTop: 7 }}
                      />
                      <Text variant="secondary" style={{ flex: 1 }}>
                        {point}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {extraction.confidence < 0.6 ? (
                <Text variant="micro" tone="tertiary">
                  {t('capture.extraction.lowConfidence')}
                </Text>
              ) : null}
            </Card>
          )}

          <Button
            label={t('common.action.done')}
            onPress={() => router.back()}
            fullWidth
            testID="capture-done"
          />
        </View>
      </Screen>
    )
  }

  return (
    <Screen scroll={false}>
      <ScreenHeader title={t('capture.title')} dismiss onBack={() => router.back()} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ flex: 1, gap: spacing.md, paddingTop: spacing.sm }}>
          <Text variant="secondary" tone="secondary">
            {t('capture.subtitle')}
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            // The row is as tall as a chip. Without this it would grow into
            // the space the input below it needs, inside a flex column.
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ gap: spacing.xs, paddingRight: spacing.lg }}
            testID="capture-mode"
          >
            {MODES.map((entry) => (
              <FilterChip
                key={entry.value}
                label={t(entry.labelKey)}
                selected={mode === entry.value}
                onPress={() => setMode(entry.value)}
                testID={`capture-${entry.value}`}
              />
            ))}
          </ScrollView>

          {mode === 'text' ? (
            <>
              <TextField
                label={t('capture.textInput.label')}
                value={note}
                onChangeText={setNote}
                placeholder={t('capture.textInput.placeholder')}
                multiline
                height={160}
                // The field is focused as the mode opens, so choosing a mode
                // and typing is one gesture rather than two.
                autoFocus={note.length === 0}
                testID="capture-text-input"
              />
              <Button
                label={t('common.action.add')}
                onPress={() => createText.mutate()}
                fullWidth
                loading={busy}
                disabled={note.trim().length < 3}
                testID="capture-submit-text"
              />
            </>
          ) : null}

          {mode === 'link' ? (
            <>
              <TextField
                label={t('capture.linkInput.label')}
                value={link}
                onChangeText={setLink}
                placeholder={t('capture.linkInput.placeholder')}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                autoFocus={link.length === 0}
                testID="capture-link-input"
              />
              <Text variant="micro" tone="tertiary">
                {t('capture.linkInput.blocked')}
              </Text>
              <Button
                label={t('common.action.add')}
                onPress={() => createLink.mutate()}
                fullWidth
                loading={busy}
                disabled={!/^https?:\/\/\S+$/i.test(link.trim())}
                testID="capture-submit-link"
              />
            </>
          ) : null}

          {mode === 'camera' ? (
            <View style={{ gap: spacing.xs }}>
              <Button
                label={t('capture.kindHint.camera')}
                onPress={() => void takePhoto()}
                fullWidth
                loading={busy}
                leading={
                  <MaterialIcons name="photo-camera" size={18} color={theme.colors.onPrimary} />
                }
                testID="capture-take-photo"
              />
              <Button
                label={t('capture.kindHint.photo')}
                onPress={() => void pickPhoto()}
                variant="tonal"
                fullWidth
                loading={busy}
                testID="capture-pick-photo"
              />
            </View>
          ) : null}

          {mode === 'file' ? (
            <View style={{ gap: spacing.xs }}>
              <Button
                label={t('capture.kindHint.file')}
                onPress={() => void pickFile()}
                fullWidth
                loading={busy}
                testID="capture-pick-file"
              />
              <Text variant="micro" tone="tertiary">
                {t('capture.supportedTypes')}
              </Text>
            </View>
          ) : null}

          {!can('advanced_capture') ? (
            <Text variant="micro" tone="tertiary">
              {t('capture.monthlyLimit')}
            </Text>
          ) : null}

          {error ? (
            <Card tone="critical">
              <Text variant="secondary" tone="critical">
                {t(errorMessageKey(error))}
              </Text>
            </Card>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}
