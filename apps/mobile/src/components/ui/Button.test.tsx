import { Text as RNText } from 'react-native'
import { fire, flattenStyle, press, renderWithProviders } from '../../test-utils'
import { Button } from './Button'
import { Pressable } from './Pressable'

/**
 * The app's only button, and where the no-dead-button rule is enforced at
 * runtime. `onPress` is required by the type, so the cases worth testing are
 * the ones where a press must *not* happen and the ones a screen reader
 * depends on.
 *
 * Queries come from the render result rather than the library's `screen`
 * global, which does not survive this project's module resolution.
 */

describe('Button', () => {
  it('renders its label and calls onPress', async () => {
    const onPress = jest.fn()
    const view = await renderWithProviders(<Button label="Onayla" onPress={onPress} testID="b" />)

    expect(view.getByText('Onayla')).toBeTruthy()
    await press(view.getByTestId('b'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not fire while disabled', async () => {
    const onPress = jest.fn()
    const view = await renderWithProviders(
      <Button label="Onayla" onPress={onPress} disabled testID="b" />,
    )

    await press(view.getByTestId('b'))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('does not fire while loading — a double tap must not send twice', async () => {
    // The approval screen's send button spends a second in this state, and a
    // second press there is a second email.
    const onPress = jest.fn()
    const view = await renderWithProviders(
      <Button label="Gönder" onPress={onPress} loading testID="b" />,
    )

    await press(view.getByTestId('b'))
    await press(view.getByTestId('b'))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('keeps the label visible while loading so the layout does not jump', async () => {
    const view = await renderWithProviders(
      <Button label="Gönder" onPress={jest.fn()} loading testID="b" />,
    )
    expect(view.getByText('Gönder')).toBeTruthy()
  })

  it('exposes its state to a screen reader', async () => {
    const view = await renderWithProviders(
      <Button
        label="Gönder"
        onPress={jest.fn()}
        loading
        accessibilityHint="Taslağı yollar"
        testID="b"
      />,
    )
    const button = view.getByTestId('b')
    expect(button.props.accessibilityRole).toBe('button')
    expect(button.props.accessibilityLabel).toBe('Gönder')
    expect(button.props.accessibilityHint).toBe('Taslağı yollar')
    expect(button.props.accessibilityState).toMatchObject({ disabled: true, busy: true })
  })

  const VARIANTS = ['primary', 'tonal', 'ghost', 'destructive', 'neutral'] as const
  const SCHEMES = ['light', 'dark'] as const

  it.each(VARIANTS.flatMap((variant) => SCHEMES.map((scheme) => [variant, scheme] as const)))(
    'renders the %s variant in the %s theme',
    async (variant, colorScheme) => {
      const view = await renderWithProviders(
        <Button label="Test" onPress={jest.fn()} variant={variant} testID="b" />,
        { colorScheme },
      )
      expect(flattenStyle(view.getByTestId('b').props.style).backgroundColor).toBeDefined()
    },
  )

  it.each(['sm', 'md', 'lg'] as const)(
    'meets the minimum touch target at size %s',
    async (size) => {
      // 44pt is the floor on both platforms; a button below it is a miss for
      // anyone without steady hands.
      const view = await renderWithProviders(
        <Button label="Test" onPress={jest.fn()} size={size} testID="b" />,
      )
      expect(flattenStyle(view.getByTestId('b').props.style).minHeight).toBeGreaterThanOrEqual(44)
    },
  )
})

describe('Pressable', () => {
  it('passes the press through and marks itself as a button', async () => {
    const onPress = jest.fn()
    const view = await renderWithProviders(
      <Pressable onPress={onPress} accessibilityLabel="Aç" testID="p">
        <RNText>İçerik</RNText>
      </Pressable>,
    )
    const pressable = view.getByTestId('p')
    expect(pressable.props.accessibilityRole).toBe('button')
    await press(pressable)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('still works without an onPress, for a control driven by press-in and press-out', async () => {
    const onPressIn = jest.fn()
    const onPressOut = jest.fn()
    const view = await renderWithProviders(
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityLabel="Bas ve konuş"
        testID="p"
      >
        <RNText>Bas</RNText>
      </Pressable>,
    )
    // Wrapped in `act`: press-in starts React Native's press state machine,
    // which schedules a long-press timer. Letting it settle here keeps it from
    // firing during the next test's render.
    await fire(view.getByTestId('p'), 'pressIn')
    await fire(view.getByTestId('p'), 'pressOut')
    expect(onPressIn).toHaveBeenCalledTimes(1)
    expect(onPressOut).toHaveBeenCalledTimes(1)
  })

  it('does not fire while disabled', async () => {
    const onPress = jest.fn()
    const view = await renderWithProviders(
      <Pressable onPress={onPress} disabled accessibilityLabel="Aç" testID="p">
        <RNText>İçerik</RNText>
      </Pressable>,
    )
    await press(view.getByTestId('p'))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('gives every tappable surface a 44pt floor and some hit slop', async () => {
    const view = await renderWithProviders(
      <Pressable onPress={jest.fn()} accessibilityLabel="Aç" testID="p">
        <RNText>x</RNText>
      </Pressable>,
    )
    const pressable = view.getByTestId('p')
    expect(pressable.props.hitSlop).toBeTruthy()
    expect(flattenStyle(pressable.props.style).minHeight).toBeGreaterThanOrEqual(44)
  })
})
