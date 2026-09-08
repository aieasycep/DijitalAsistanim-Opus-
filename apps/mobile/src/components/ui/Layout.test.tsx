import { fire, flattenStyle, press, renderWithProviders, type RenderResult } from '../../test-utils'
import { Button } from './Button'
import { SegmentedControl, Toggle } from './Controls'
import { ListRow, SectionHeader } from './Layout'

/**
 * The settings row and the controls that ride in it.
 *
 * The rule this file exists to hold: a row must never swallow the control
 * inside it. `accessible` on a container collapses its whole subtree into one
 * element on iOS, and a switch inside such a container is not just awkward to
 * reach — it is absent from the accessibility tree, so VoiceOver cannot toggle
 * it at all. Thirteen settings switches sat inside one, Reduce Motion among
 * them, which meant the accessibility setting was itself inaccessible.
 *
 * Queries come from the render result rather than the library's `screen`
 * global, which does not survive this project's module resolution.
 */

type TreeNode = ReturnType<RenderResult['getByTestId']>

/**
 * Does an ancestor declare itself a single accessibility element?
 *
 * This is the exact condition that hides a nested control on iOS, so the tests
 * assert on it directly rather than on the markup that happens to produce it.
 */
function insideCollapsedElement(node: TreeNode): boolean {
  let current = node.parent
  while (current) {
    if (current.props.accessible === true) return true
    current = current.parent
  }
  return false
}

describe('ListRow with an accessory', () => {
  it('leaves a toggle reachable instead of collapsing it into the row', async () => {
    const onValueChange = jest.fn()
    const view = await renderWithProviders(
      <ListRow
        title="Hareketi azalt"
        accessory={
          <Toggle
            value={false}
            onValueChange={onValueChange}
            accessibilityLabel="Hareketi azalt"
            testID="row-toggle"
          />
        }
        testID="row"
      />,
    )

    const toggle = view.getByTestId('row-toggle')
    expect(insideCollapsedElement(toggle)).toBe(false)
  })

  it('lets the toggle actually change value', async () => {
    // Reachable and inert would be no better than unreachable.
    const onValueChange = jest.fn()
    const view = await renderWithProviders(
      <ListRow
        title="Hareketi azalt"
        accessory={
          <Toggle
            value={false}
            onValueChange={onValueChange}
            accessibilityLabel="Hareketi azalt"
            testID="row-toggle"
          />
        }
      />,
    )

    await fire(view.getByTestId('row-toggle'), 'valueChange', true)
    expect(onValueChange).toHaveBeenCalledWith(true)
  })

  it('still groups the row’s own text into one element', async () => {
    // The fix must not go the other way and read the row out word by word.
    const view = await renderWithProviders(
      <ListRow
        title="Bildirimler"
        subtitle="Yalnızca önemliyse"
        accessory={
          <Toggle value onValueChange={jest.fn()} accessibilityLabel="Bildirimler" testID="t" />
        }
      />,
    )

    expect(insideCollapsedElement(view.getByText('Bildirimler'))).toBe(true)
    expect(insideCollapsedElement(view.getByText('Yalnızca önemliyse'))).toBe(true)
  })

  it('keeps the accessory out of a tappable row, and both handlers separate', async () => {
    // The VIP list is this shape: the row opens the person, the trailing button
    // removes them. Nested inside the row's pressable, the button is gone for
    // VoiceOver and its press is ambiguous for everyone else.
    const onRowPress = jest.fn()
    const onRemove = jest.fn()
    const view = await renderWithProviders(
      <ListRow
        title="Ayşe Yılmaz"
        subtitle="ayse@musteri.com"
        onPress={onRowPress}
        accessory={<Button label="Kaldır" onPress={onRemove} variant="ghost" testID="remove" />}
        testID="row"
      />,
    )

    expect(insideCollapsedElement(view.getByTestId('remove'))).toBe(false)

    await press(view.getByTestId('remove'))
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onRowPress).not.toHaveBeenCalled()

    await press(view.getByTestId('row'))
    expect(onRowPress).toHaveBeenCalledTimes(1)
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('announces a tappable row by its title and hints with its subtitle', async () => {
    const view = await renderWithProviders(
      <ListRow title="Dil" subtitle="Türkçe" onPress={jest.fn()} testID="row" />,
    )
    const row = view.getByTestId('row')
    expect(row.props.accessibilityRole).toBe('button')
    expect(row.props.accessibilityLabel).toBe('Dil')
    expect(row.props.accessibilityHint).toBe('Türkçe')
  })
})

describe('SectionHeader', () => {
  it('gives the section action a full-size target and real hit slop', async () => {
    // The action is one line of micro text. The target it sits in is not.
    const view = await renderWithProviders(
      <SectionHeader title="ÖNCELİKLERİN" actionLabel="Tümü" onAction={jest.fn()} />,
    )

    const action = view.getByLabelText('Tümü')
    expect(flattenStyle(action.props.style).minHeight).toBeGreaterThanOrEqual(44)
    expect(action.props.hitSlop).toBeTruthy()
  })

  it('calls the action it advertises', async () => {
    const onAction = jest.fn()
    const view = await renderWithProviders(
      <SectionHeader title="ÖNCELİKLERİN" actionLabel="Tümü" onAction={onAction} />,
    )
    await press(view.getByLabelText('Tümü'))
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('renders no action when there is nothing for it to do', async () => {
    const view = await renderWithProviders(<SectionHeader title="ÖNCELİKLERİN" />)
    expect(view.queryByLabelText('Tümü')).toBeNull()
  })
})

describe('the state a row’s control reports', () => {
  it('reports a disabled accessory as disabled, not merely dimmed', async () => {
    const onPress = jest.fn()
    const view = await renderWithProviders(
      <ListRow
        title="Öğle özeti"
        accessory={<Button label="Kaldır" onPress={onPress} disabled testID="acc" />}
      />,
    )

    const accessory = view.getByTestId('acc')
    expect(accessory.props.accessibilityState).toMatchObject({ disabled: true })
    expect(accessory).toBeDisabled()
    await press(accessory)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('reports which segment is selected, so the choice is not colour alone', async () => {
    const view = await renderWithProviders(
      <SegmentedControl
        options={[
          { value: 'light', label: 'Açık' },
          { value: 'dark', label: 'Koyu' },
        ]}
        value="dark"
        onChange={jest.fn()}
      />,
    )

    expect(view.getByLabelText('Koyu').props.accessibilityState).toMatchObject({ selected: true })
    expect(view.getByLabelText('Açık').props.accessibilityState).toMatchObject({ selected: false })
  })
})
