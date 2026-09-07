import type { ApprovalAction, ApprovalPayload } from '@da/domain'
import { press, renderWithProviders } from '../../test-utils'
import { ApprovalCard } from './ApprovalCard'

/**
 * The approval card is the whole consent surface: it is the last thing a user
 * sees before something leaves the app and reaches a real mailbox or calendar.
 *
 * So the tests are about disclosure and about restraint — the recipient and
 * the subject must be on screen, and a card that is not pending must offer no
 * way to approve anything.
 */

const TZ = 'Europe/Istanbul'

const emailPayload: ApprovalPayload = {
  kind: 'email_send',
  connectedAccountId: 'acc-1',
  threadId: 'thread-1',
  inReplyToMessageId: 'msg-1',
  to: ['ayse@musteri.com'],
  cc: ['mehmet@musteri.com'],
  subject: 'Re: Teklif',
  body: 'Merhaba Ayşe, revizyonu Cuma günü gönderiyorum.',
  tone: 'friendly',
}

const approval = (over: Partial<ApprovalAction> = {}): ApprovalAction => ({
  id: 'apr-1',
  userId: 'user-1',
  createdAt: '2026-09-07T09:00:00.000Z',
  updatedAt: '2026-09-07T09:00:00.000Z',
  type: 'email_send',
  status: 'pending',
  what: 'Ayşe Yılmaz’a yanıt gönder',
  why: 'Sorusu iki gündür yanıtsız.',
  source: null,
  payload: emailPayload,
  originalPayload: emailPayload,
  idempotencyKey: 'user-1:email_send:thread-1',
  expiresAt: '2026-09-09T09:00:00.000Z',
  approvedAt: null,
  executedAt: null,
  rejectedAt: null,
  failureReason: null,
  attemptCount: 0,
  resultRef: null,
  ...over,
})

const handlers = () => ({
  onApprove: jest.fn(),
  onReject: jest.fn(),
  onEdit: jest.fn(),
})

describe('ApprovalCard, pending', () => {
  it('states what will happen and why', async () => {
    const view = await renderWithProviders(
      <ApprovalCard approval={approval()} timeZone={TZ} {...handlers()} />,
    )
    expect(view.getByText('Ayşe Yılmaz’a yanıt gönder')).toBeTruthy()
    expect(view.getByText('Sorusu iki gündür yanıtsız.')).toBeTruthy()
  })

  it('shows the exact recipient, cc and subject before anything is sent', async () => {
    // A summary sentence is not consent. The user has to see the address the
    // message is actually going to.
    const view = await renderWithProviders(
      <ApprovalCard approval={approval()} timeZone={TZ} {...handlers()} />,
    )
    expect(view.getByText('ayse@musteri.com')).toBeTruthy()
    expect(view.getByText('mehmet@musteri.com')).toBeTruthy()
    expect(view.getByText('Re: Teklif')).toBeTruthy()
    expect(view.getByText(/revizyonu Cuma günü/)).toBeTruthy()
  })

  it('offers approve, edit and reject, and calls exactly the one pressed', async () => {
    const h = handlers()
    const view = await renderWithProviders(
      <ApprovalCard approval={approval()} timeZone={TZ} {...h} />,
    )

    await press(view.getByLabelText('Onayla'))
    expect(h.onApprove).toHaveBeenCalledTimes(1)
    expect(h.onReject).not.toHaveBeenCalled()
    expect(h.onEdit).not.toHaveBeenCalled()

    await press(view.getByLabelText('Düzenle'))
    expect(h.onEdit).toHaveBeenCalledTimes(1)

    await press(view.getByLabelText('Reddet'))
    expect(h.onReject).toHaveBeenCalledTimes(1)
  })

  it('blocks a second approve while the first is in flight', async () => {
    const h = handlers()
    const view = await renderWithProviders(
      <ApprovalCard approval={approval()} timeZone={TZ} busy {...h} />,
    )
    await press(view.getByLabelText('Onayla'))
    await press(view.getByLabelText('Onayla'))
    expect(h.onApprove).not.toHaveBeenCalled()
  })

  it('hides the payload preview in a compact list, keeping the headline', async () => {
    const view = await renderWithProviders(
      <ApprovalCard approval={approval()} timeZone={TZ} compact {...handlers()} />,
    )
    expect(view.getByText('Ayşe Yılmaz’a yanıt gönder')).toBeTruthy()
    expect(view.queryByText('ayse@musteri.com')).toBeNull()
  })
})

describe('ApprovalCard, settled', () => {
  it.each(['executed', 'rejected', 'expired', 'approved', 'executing'] as const)(
    'offers no approve button once the status is %s',
    async (status) => {
      // Nothing outside `pending` may be approvable: re-approving an executed
      // action is how a message gets sent twice.
      const view = await renderWithProviders(
        <ApprovalCard approval={approval({ status })} timeZone={TZ} {...handlers()} />,
      )
      expect(view.queryByLabelText('Onayla')).toBeNull()
      expect(view.queryByLabelText('Reddet')).toBeNull()
      expect(view.queryByLabelText('Düzenle')).toBeNull()
    },
  )

  it('shows the failure reason and a retry when one is offered', async () => {
    const onRetry = jest.fn()
    const view = await renderWithProviders(
      <ApprovalCard
        approval={approval({ status: 'failed', failureReason: 'Sunucu yanıt vermedi.' })}
        timeZone={TZ}
        onRetry={onRetry}
        {...handlers()}
      />,
    )
    expect(view.getByText('Sunucu yanıt vermedi.')).toBeTruthy()
    await press(view.getByLabelText('Tekrar dene'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('offers no retry once the attempts are exhausted', async () => {
    const view = await renderWithProviders(
      <ApprovalCard
        approval={approval({ status: 'failed', failureReason: 'Sunucu yanıt vermedi.' })}
        timeZone={TZ}
        {...handlers()}
      />,
    )
    expect(view.queryByLabelText('Tekrar dene')).toBeNull()
  })
})

describe('ApprovalCard, other action types', () => {
  it('previews a calendar event with its own fields', async () => {
    const payload: ApprovalPayload = {
      kind: 'calendar_create',
      connectedAccountId: 'acc-1',
      title: 'Ayşe ile teklif görüşmesi',
      description: 'Revizyonu konuşacağız.',
      location: 'Levent ofis',
      startsAt: '2026-09-09T11:00:00.000Z',
      endsAt: '2026-09-09T12:00:00.000Z',
      timeZone: TZ,
      attendees: ['ayse@musteri.com'],
    }
    const view = await renderWithProviders(
      <ApprovalCard
        approval={approval({
          type: 'calendar_create',
          payload,
          originalPayload: payload,
          what: 'Takvime toplantı ekle',
        })}
        timeZone={TZ}
        {...handlers()}
      />,
    )
    expect(view.getByText('Ayşe ile teklif görüşmesi')).toBeTruthy()
    expect(view.getByText('Levent ofis')).toBeTruthy()
    // The time is shown in the user's zone: 11:00Z is 14:00 in Istanbul.
    expect(view.getByText(/14:00/)).toBeTruthy()
  })

  it('renders in English when the locale is English', async () => {
    const view = await renderWithProviders(
      <ApprovalCard approval={approval()} timeZone={TZ} {...handlers()} />,
      { locale: 'en' },
    )
    expect(view.getByLabelText('Approve')).toBeTruthy()
  })
})
