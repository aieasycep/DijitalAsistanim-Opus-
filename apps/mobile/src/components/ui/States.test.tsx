import { flattenStyle, press, renderWithProviders } from '../../test-utils'
import { EmptyState, ErrorState, Skeleton, SkeletonCard } from './States'

/**
 * The three states a screen spends most of its life in.
 *
 * Two rules are enforced here rather than by convention: an empty state only
 * grows a button when there is a handler behind it (the other half of the
 * no-dead-button rule), and an error state announces itself to a screen reader
 * — an error nobody is told about is a blank screen.
 */

describe('EmptyState', () => {
  it('shows a title, and a description when one is given', async () => {
    const view = await renderWithProviders(
      <EmptyState icon="inbox" title="Bugün için bir şey yok" description="Her şey sakin." />,
    )
    expect(view.getByText('Bugün için bir şey yok')).toBeTruthy()
    expect(view.getByText('Her şey sakin.')).toBeTruthy()
  })

  it('renders no button when only a label is given', async () => {
    // A label with no handler would draw something that looks pressable and
    // does nothing, which is precisely what is not allowed.
    const view = await renderWithProviders(
      <EmptyState icon="inbox" title="Boş" actionLabel="Hesap bağla" />,
    )
    expect(view.queryByLabelText('Hesap bağla')).toBeNull()
  })

  it('renders no button when only a handler is given', async () => {
    const view = await renderWithProviders(
      <EmptyState icon="inbox" title="Boş" onAction={jest.fn()} />,
    )
    expect(view.queryByRole('button')).toBeNull()
  })

  it('renders a working button when both are given', async () => {
    const onAction = jest.fn()
    const view = await renderWithProviders(
      <EmptyState icon="inbox" title="Boş" actionLabel="Hesap bağla" onAction={onAction} />,
    )
    await press(view.getByLabelText('Hesap bağla'))
    expect(onAction).toHaveBeenCalledTimes(1)
  })
})

describe('ErrorState', () => {
  it('announces itself to a screen reader', async () => {
    const view = await renderWithProviders(
      <ErrorState message="Bağlantı kurulamadı." testID="err" />,
    )
    expect(view.getByTestId('err').props.accessibilityRole).toBe('alert')
  })

  it('shows the localised message it was handed', async () => {
    const view = await renderWithProviders(<ErrorState message="Bağlantı kurulamadı." />)
    expect(view.getByText('Bağlantı kurulamadı.')).toBeTruthy()
  })

  it('offers a retry only when there is something to retry with', async () => {
    const withoutHandler = await renderWithProviders(
      <ErrorState message="Hata" retryLabel="Tekrar dene" />,
    )
    expect(withoutHandler.queryByLabelText('Tekrar dene')).toBeNull()

    const onRetry = jest.fn()
    const withHandler = await renderWithProviders(
      <ErrorState message="Hata" retryLabel="Tekrar dene" onRetry={onRetry} />,
    )
    await press(withHandler.getByLabelText('Tekrar dene'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

describe('Skeleton', () => {
  it('takes the size it is told to and is hidden from a screen reader', async () => {
    // A loading placeholder read aloud as a row of empty boxes is noise, so the
    // component carries no label and no testID — it is queried through the tree.
    const view = await renderWithProviders(<Skeleton width={120} height={20} />)
    const root = view.toJSON()
    const node = Array.isArray(root) ? root[0] : root
    expect(node?.props.accessible).toBe(false)
    const style = flattenStyle(node?.props.style)
    expect(style.width).toBe(120)
    expect(style.height).toBe(20)
  })

  it('renders a card-shaped placeholder', async () => {
    const view = await renderWithProviders(<SkeletonCard />)
    expect(view.toJSON()).toBeTruthy()
  })
})
