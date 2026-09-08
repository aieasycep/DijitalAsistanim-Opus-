import { darkColors, fontFamily, lightColors, radius, spacing, typography } from '@da/design-tokens'
import type { CSSProperties } from 'react'
import { announcementMessages } from '@/lib/messages/announcements'

/**
 * How the notice will actually read on somebody's phone.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS DRAWN FROM `@da/design-tokens` AND NOT FROM THE CONSOLE'S CLASSES
 * ---------------------------------------------------------------------------
 *
 * The console has its own Tailwind theme: same palette, tighter density,
 * smaller base size. Rendering the preview with `bg-surface` and `text-[13px]`
 * would produce something that looks like the backoffice, which is precisely
 * the thing an operator must not be shown before deciding to publish — a title
 * that fits on one line at the console's 13px wraps to three at the app's 17px.
 *
 * So the values here come from `@da/design-tokens`, the same module the mobile
 * app renders from: `typography.h3` and `typography.secondary` for the two type
 * styles, `lightColors` / `darkColors` for the two themes the app ships, and
 * `radius.cardSm` and `spacing` for the geometry. If a token moves, this moves
 * with it.
 *
 * The one honest gap is the typeface. `fontFamily.sans` is Geist, which the app
 * bundles and the console does not; the stack below falls back to the system
 * sans, so line breaks in the preview are close but not pixel-exact. Everything
 * that decides whether a notice reads well — the scale, the leading, the
 * contrast, the width — is the app's own.
 *
 * ---------------------------------------------------------------------------
 * BOTH THEMES, ALWAYS
 * ---------------------------------------------------------------------------
 *
 * The app has a dark mode and roughly half its users are in it. A preview that
 * showed one theme would be a preview that missed the contrast problem half the
 * audience gets, so both are rendered side by side and neither is the default.
 */

const SANS_STACK = `'${fontFamily.sans}', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif`

function typeStyle(token: keyof typeof typography): CSSProperties {
  const style = typography[token]
  return {
    fontFamily: SANS_STACK,
    fontSize: `${style.fontSize}px`,
    lineHeight: `${style.lineHeight}px`,
    fontWeight: style.fontWeight,
    letterSpacing: `${style.letterSpacing}px`,
  }
}

export interface AnnouncementPreviewProps {
  title: string
  body: string
  dismissible: boolean
  /** False draws the draft watermark: an unpublished notice reaches nobody. */
  published: boolean
  /**
   * `stacked` for a narrow column — the editor's sidebar. Side by side is the
   * default because comparing the two themes is the point.
   */
  layout?: 'columns' | 'stacked'
}

export function AnnouncementPreview({
  title,
  body,
  dismissible,
  published,
  layout = 'columns',
}: AnnouncementPreviewProps) {
  return (
    <div className={layout === 'stacked' ? 'flex flex-col gap-3' : 'grid gap-3 sm:grid-cols-2'}>
      <PreviewFrame
        colors={lightColors}
        label={announcementMessages.preview.lightLabel}
        title={title}
        body={body}
        dismissible={dismissible}
        published={published}
      />
      <PreviewFrame
        colors={darkColors}
        label={announcementMessages.preview.darkLabel}
        title={title}
        body={body}
        dismissible={dismissible}
        published={published}
      />
    </div>
  )
}

interface PreviewFrameProps {
  colors: typeof lightColors
  label: string
  title: string
  body: string
  dismissible: boolean
  published: boolean
}

function PreviewFrame({ colors, label, title, body, dismissible, published }: PreviewFrameProps) {
  const shownTitle = title.trim() === '' ? announcementMessages.preview.emptyTitle : title
  const shownBody = body.trim() === '' ? announcementMessages.preview.emptyBody : body
  const placeholder = title.trim() === '' || body.trim() === ''

  return (
    <figure className="m-0 flex min-w-0 flex-col gap-1.5">
      <figcaption className="bo-kicker">{label}</figcaption>

      <div
        className="flex min-w-0 flex-col"
        style={{
          backgroundColor: colors.bg,
          borderRadius: `${radius.cardSm}px`,
          padding: `${spacing.md}px`,
        }}
      >
        <div
          className="flex min-w-0 items-start"
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.hairline}`,
            borderRadius: `${radius.cardSm}px`,
            padding: `${spacing.md}px`,
            gap: `${spacing.sm}px`,
          }}
        >
          {/* The brand mark the app puts on a system notice: indigo, not an
              emoji, and the same swatch as every primary action in the product. */}
          <span
            aria-hidden="true"
            style={{
              backgroundColor: colors.primarySoft,
              color: colors.primaryOnSoft,
              borderRadius: `${radius.chip}px`,
              width: '28px',
              height: '28px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              ...typeStyle('caption'),
            }}
          >
            i
          </span>

          <div className="min-w-0 flex-1">
            <p
              className="m-0 break-words"
              style={{
                ...typeStyle('h3'),
                color: placeholder ? colors.textTertiary : colors.text,
              }}
            >
              {shownTitle}
            </p>
            <p
              className="m-0 whitespace-pre-wrap break-words"
              style={{
                ...typeStyle('secondary'),
                color: placeholder ? colors.textTertiary : colors.textSecondary,
                marginTop: `${spacing.xxs}px`,
              }}
            >
              {shownBody}
            </p>

            {dismissible ? null : (
              <p
                className="m-0"
                style={{
                  ...typeStyle('micro'),
                  color: colors.warningText,
                  marginTop: `${spacing.xs}px`,
                  textTransform: 'uppercase',
                }}
              >
                {announcementMessages.preview.pinnedLabel}
              </p>
            )}
          </div>

          {dismissible ? (
            <span
              aria-hidden="true"
              style={{
                ...typeStyle('body'),
                color: colors.textTertiary,
                flexShrink: 0,
                lineHeight: 1,
              }}
              title={announcementMessages.preview.dismissLabel}
            >
              ×
            </span>
          ) : null}
        </div>

        {published ? null : (
          <p
            className="m-0 text-center"
            style={{
              ...typeStyle('micro'),
              color: colors.textTertiary,
              marginTop: `${spacing.sm}px`,
              textTransform: 'uppercase',
            }}
          >
            {announcementMessages.preview.draftWatermark}
          </p>
        )}
      </div>
    </figure>
  )
}
