import { describe, expect, it } from 'vitest'
import {
  ALL_COLUMNS_VISIBLE,
  encodeHiddenColumns,
  encodeSort,
  nextSort,
  pageWindow,
  parseColumnVisibility,
  parsePage,
  parsePageSize,
  parseSort,
  withParams,
  type TableLocation,
} from '../table-url.ts'

/**
 * The table's URL arithmetic.
 *
 * Every one of these functions decides what an operator sees after a click, and
 * all of them are total: there is no input — a hand-edited parameter, a stale
 * bookmark, a sort naming a column that no longer exists — that may throw or
 * reach the database unchecked. That property is what these cases pin down.
 */

const location: TableLocation = {
  path: '/users',
  query: { plan: 'pro', page: '3', sort: 'created_at:desc' },
}

describe('withParams', () => {
  it('keeps every parameter the caller did not touch', () => {
    expect(withParams(location, { page: '4' })).toBe(
      '/users?page=4&plan=pro&sort=created_at%3Adesc',
    )
  })

  it('removes a parameter set to null or to an empty string', () => {
    expect(withParams(location, { page: null, sort: '' })).toBe('/users?plan=pro')
  })

  it('drops parameters that were already empty', () => {
    expect(withParams({ path: '/users', query: { plan: '' } }, {})).toBe('/users')
  })

  it('emits keys in a stable order, so one view is always one URL', () => {
    const a = withParams({ path: '/x', query: { b: '2', a: '1' } }, {})
    const b = withParams({ path: '/x', query: { a: '1', b: '2' } }, {})
    expect(a).toBe(b)
  })

  it('encodes values rather than pasting them in', () => {
    expect(withParams({ path: '/x', query: {} }, { q: 'a b&c=d' })).toBe('/x?q=a+b%26c%3Dd')
  })
})

describe('parseSort', () => {
  const allowed = ['created_at', 'cost_micros']

  it('reads a well-formed sort', () => {
    expect(parseSort('created_at:desc', allowed)).toEqual({
      key: 'created_at',
      direction: 'desc',
    })
  })

  it('refuses a column outside the allowlist', () => {
    // The value ends up in an `order by`; an unknown column is dropped rather
    // than passed through.
    expect(parseSort('password:desc', allowed)).toBeNull()
  })

  it('refuses a direction that is not asc or desc', () => {
    expect(parseSort('created_at:sideways', allowed)).toBeNull()
  })

  it('refuses malformed input instead of guessing', () => {
    expect(parseSort('created_at', allowed)).toBeNull()
    expect(parseSort(':desc', allowed)).toBeNull()
    expect(parseSort('', allowed)).toBeNull()
    expect(parseSort(undefined, allowed)).toBeNull()
  })
})

describe('nextSort', () => {
  it('opens on descending, because the interesting end is the big end', () => {
    expect(nextSort(null, 'cost')).toEqual({ key: 'cost', direction: 'desc' })
  })

  it('cycles desc → asc → cleared on the same column', () => {
    const first = nextSort(null, 'cost')
    const second = nextSort(first, 'cost')
    expect(second).toEqual({ key: 'cost', direction: 'asc' })
    expect(nextSort(second, 'cost')).toBeNull()
  })

  it('restarts at descending when a different column is clicked', () => {
    expect(nextSort({ key: 'cost', direction: 'asc' }, 'created_at')).toEqual({
      key: 'created_at',
      direction: 'desc',
    })
  })

  it('round-trips through the wire form', () => {
    const sort = { key: 'cost', direction: 'asc' } as const
    expect(parseSort(encodeSort(sort), ['cost'])).toEqual(sort)
  })
})

describe('column visibility', () => {
  it('distinguishes "no choice" from "chose to hide nothing"', () => {
    // The distinction is the whole reason for the sentinel: without it, hiding
    // nothing would drop out of the URL and re-apply every `defaultHidden`.
    expect(parseColumnVisibility(undefined)).toBeNull()
    expect(parseColumnVisibility(ALL_COLUMNS_VISIBLE)).toEqual([])
  })

  it('reads a list', () => {
    expect(parseColumnVisibility('a,b')).toEqual(['a', 'b'])
  })

  it('tolerates whitespace and stray separators', () => {
    expect(parseColumnVisibility(' a , ,b ')).toEqual(['a', 'b'])
    expect(parseColumnVisibility(',,')).toEqual([])
  })

  it('encodes to null when nothing is hidden, so the parameter disappears', () => {
    expect(encodeHiddenColumns([])).toBeNull()
    expect(encodeHiddenColumns(['b', 'a', 'b'])).toBe('a,b')
  })
})

describe('pageWindow', () => {
  it('describes a middle page', () => {
    expect(pageWindow(3, 25, 130)).toMatchObject({
      page: 3,
      lastPage: 6,
      firstRow: 51,
      lastRow: 75,
      hasPrevious: true,
      hasNext: true,
    })
  })

  it('clamps a page past the end rather than showing nothing', () => {
    // A bookmark to page 40 of a list that has shrunk must land somewhere real.
    expect(pageWindow(40, 25, 130)).toMatchObject({ page: 6, hasNext: false })
  })

  it('reports an empty result as an empty window, not as row 1 of 0', () => {
    expect(pageWindow(1, 25, 0)).toMatchObject({
      page: 1,
      lastPage: 1,
      firstRow: 0,
      lastRow: 0,
      hasPrevious: false,
      hasNext: false,
    })
  })

  it('caps the last row at the total on a partial final page', () => {
    expect(pageWindow(3, 25, 55)).toMatchObject({ firstRow: 51, lastRow: 55 })
  })
})

describe('parsePage and parsePageSize', () => {
  it('treats anything unusable as page one', () => {
    for (const raw of [undefined, '', '0', '-4', 'abc', 'NaN']) {
      expect(parsePage(raw)).toBe(1)
    }
  })

  it('accepts only an offered page size', () => {
    expect(parsePageSize('50', [25, 50, 100], 25)).toBe(50)
    expect(parsePageSize('9999', [25, 50, 100], 25)).toBe(25)
    expect(parsePageSize(undefined, [25, 50, 100], 25)).toBe(25)
  })
})
