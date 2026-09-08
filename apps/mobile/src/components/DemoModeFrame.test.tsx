import { Text as RNText } from 'react-native'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import { isDemoMode } from '../lib/env'
import { flattenStyle, renderWithProviders } from '../test-utils'
import { DemoModeFrame } from './DemoModeFrame'

// Only the predicate is replaced. `env` itself is read at import time from
// `process.env`, so the real module stays in place and anything else this
// component's tree reaches for behaves as it does in the app.
jest.mock('../lib/env', () => ({
  ...jest.requireActual('../lib/env'),
  isDemoMode: jest.fn(),
}))

const mockIsDemoMode = jest.mocked(isDemoMode)

/** Reads the top inset the way every screen's header does. */
function InsetProbe() {
  return (
    <SafeAreaInsetsContext.Consumer>
      {(insets) => <RNText testID="probe">{String(insets?.top ?? 'none')}</RNText>}
    </SafeAreaInsetsContext.Consumer>
  )
}

describe('DemoModeFrame', () => {
  afterEach(() => {
    mockIsDemoMode.mockReset()
  })

  it('says the data is not real when the app is running on fixtures', async () => {
    mockIsDemoMode.mockReturnValue(true)
    const view = await renderWithProviders(
      <DemoModeFrame>
        <RNText>Bugün</RNText>
      </DemoModeFrame>,
    )
    // The exact sentence the product already shipped in both locales, and
    // rendered nowhere until this component existed.
    expect(view.getByText('Demo modundasın. Veriler örnektir.')).toBeTruthy()
    expect(view.getByText('Bugün')).toBeTruthy()
  })

  it('renders nothing of its own against a real backend', async () => {
    mockIsDemoMode.mockReturnValue(false)
    const view = await renderWithProviders(
      <DemoModeFrame>
        <RNText>Bugün</RNText>
      </DemoModeFrame>,
    )
    expect(view.queryByTestId('demo-mode-banner')).toBeNull()
    expect(view.getByText('Bugün')).toBeTruthy()
  })

  it('announces itself to a screen reader', async () => {
    mockIsDemoMode.mockReturnValue(true)
    const view = await renderWithProviders(
      <DemoModeFrame>
        <RNText>Bugün</RNText>
      </DemoModeFrame>,
    )
    // An advisory nobody is told about is decoration. The strip carries the
    // sentence as its own label so it is reachable by swipe, not only by sight.
    expect(view.getByLabelText('Demo modundasın. Veriler örnektir.')).toBeTruthy()
  })

  it('is not pressable, because there is nothing for a tap to do', async () => {
    mockIsDemoMode.mockReturnValue(true)
    const view = await renderWithProviders(
      <DemoModeFrame>
        <RNText>Bugün</RNText>
      </DemoModeFrame>,
    )
    expect(view.queryByRole('button')).toBeNull()
  })

  it('spends the status-bar inset once, not twice', async () => {
    // The strip sits above every screen and pads itself past the status bar.
    // Each screen's header then applies `insets.top` on its own account, so
    // without this override the app would open with two status bars of empty
    // space on every route — the kind of defect that only shows up on a device.
    mockIsDemoMode.mockReturnValue(true)
    const view = await renderWithProviders(
      <DemoModeFrame>
        <InsetProbe />
      </DemoModeFrame>,
    )
    expect(view.getByTestId('probe').props.children).toBe('0')
  })

  it('leaves the inset alone when there is no banner to pay for it', async () => {
    mockIsDemoMode.mockReturnValue(false)
    const view = await renderWithProviders(
      <DemoModeFrame>
        <InsetProbe />
      </DemoModeFrame>,
    )
    expect(view.getByTestId('probe').props.children).not.toBe('0')
  })

  it('pads the strip past the status bar rather than under it', async () => {
    mockIsDemoMode.mockReturnValue(true)
    const view = await renderWithProviders(
      <DemoModeFrame>
        <RNText>Bugün</RNText>
      </DemoModeFrame>,
    )
    const style = flattenStyle(view.getByTestId('demo-mode-banner').props.style)
    expect(typeof style.paddingTop).toBe('number')
    expect(style.paddingTop).toBeGreaterThan(0)
  })
})
