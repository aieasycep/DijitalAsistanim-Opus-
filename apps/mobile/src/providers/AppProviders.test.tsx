import { Text as RNText } from 'react-native'
import { act, render, screen } from '@testing-library/react-native'
import { AppProviders } from './AppProviders'
import { initEncryptedCache } from '../lib/secure-storage'

jest.mock('../lib/secure-storage', () => ({
  ...jest.requireActual('../lib/secure-storage'),
  initEncryptedCache: jest.fn(),
  wipeLocalData: jest.fn(async () => undefined),
}))

jest.mock('../lib/analytics', () => ({
  ...jest.requireActual('../lib/analytics'),
  initAnalytics: jest.fn(),
  trackEvent: jest.fn(),
}))

jest.mock('../lib/error-reporting', () => ({
  ...jest.requireActual('../lib/error-reporting'),
  initErrorReporting: jest.fn(),
  reportError: jest.fn(),
}))

const mockInit = jest.mocked(initEncryptedCache)

/**
 * What happens when the app cannot start.
 *
 * This is the path a release build actually took: `initEncryptedCache()` threw
 * on every fresh install, `boot()` caught it, and the recovery screen was the
 * only screen anyone ever saw. Nothing tested it — the failure lived in a
 * native call that Jest never reaches, and the recovery screen itself was
 * reachable only through a rejection nobody provoked.
 *
 * So the throw is provoked here, and what the person is shown is asserted.
 */

describe('when boot fails', () => {
  afterEach(() => {
    mockInit.mockReset()
  })

  it('shows the recovery screen rather than a blank app', async () => {
    mockInit.mockRejectedValue(new Error('nope'))
    await act(async () => {
      render(
        <AppProviders>
          <RNText>Bugün</RNText>
        </AppProviders>,
      )
    })
    expect(screen.getByTestId('boot-recovery')).toBeTruthy()
    expect(screen.queryByText('Bugün')).toBeNull()
  })

  it('names the step that failed and what it said', async () => {
    // `TypeError: Cannot read property 'getRandomValues' of undefined` is the
    // real one. On the screen it must arrive attributed to `cache`, because
    // "something went wrong" cost a whole build cycle to turn into a diagnosis.
    mockInit.mockRejectedValue(new TypeError("Cannot read property 'getRandomValues' of undefined"))
    await act(async () => {
      render(
        <AppProviders>
          <RNText>Bugün</RNText>
        </AppProviders>,
      )
    })
    const detail = screen.getByText(/getRandomValues/)
    expect(detail).toBeTruthy()
    expect(detail.props.children).toContain('cache:')
    expect(detail.props.children).toContain('TypeError')
  })

  it('offers a way out that is not a dead control', async () => {
    mockInit.mockRejectedValue(new Error('nope'))
    await act(async () => {
      render(
        <AppProviders>
          <RNText>Bugün</RNText>
        </AppProviders>,
      )
    })
    expect(screen.getByTestId('boot-retry')).toBeTruthy()
    expect(screen.getByTestId('boot-start-fresh')).toBeTruthy()
    expect(screen.getByTestId('boot-copy-detail')).toBeTruthy()
  })

  it('renders the app when boot succeeds', async () => {
    mockInit.mockResolvedValue(undefined)
    await act(async () => {
      render(
        <AppProviders>
          <RNText>Bugün</RNText>
        </AppProviders>,
      )
    })
    expect(screen.getByText('Bugün')).toBeTruthy()
    expect(screen.queryByTestId('boot-recovery')).toBeNull()
  })
})
