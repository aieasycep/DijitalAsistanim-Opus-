import { describe, expect, it } from 'vitest'
import { AppError } from '@da/domain'
import {
  assertUrlAllowed,
  isPrivateIpv4,
  isPrivateIpv6,
  isUrlAllowed,
  MAX_REDIRECTS,
  MAX_RESPONSE_BYTES,
  FETCH_TIMEOUT_MS,
} from './ssrf.ts'

/**
 * The link fetcher runs server-side, inside a network that can reach the
 * database and a cloud metadata endpoint. Every case below is an actual way
 * that "capture this link" becomes a request-forgery primitive, so each one is
 * pinned rather than left to the implementation's judgement.
 */

const reason = (url: string, resolved: string[] = []): string => {
  try {
    assertUrlAllowed(url, resolved)
    return 'allowed'
  } catch (error) {
    expect(error).toBeInstanceOf(AppError)
    return (error as AppError).detail ?? 'no_detail'
  }
}

describe('assertUrlAllowed', () => {
  it('allows an ordinary public URL', () => {
    const result = assertUrlAllowed('https://example.com/a/b?c=d#e')
    expect(result.hostname).toBe('example.com')
    expect(result.url.pathname).toBe('/a/b')
  })

  it('allows plain http on the default port', () => {
    expect(isUrlAllowed('http://example.com/')).toBe(true)
  })

  it.each([
    ['file:///etc/passwd', 'protocol:file:'],
    ['ftp://example.com/x', 'protocol:ftp:'],
    ['gopher://example.com/', 'protocol:gopher:'],
    ['data:text/html,<script>', 'protocol:data:'],
    ['javascript:alert(1)', 'protocol:javascript:'],
  ])('rejects %s', (url, detail) => {
    expect(reason(url)).toBe(detail)
  })

  it.each([
    'http://localhost/admin',
    'http://localhost.localdomain/',
    'http://ip6-localhost/',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://instance-data/',
  ])('rejects the loopback or metadata name %s', (url) => {
    expect(reason(url)).toBe('blocked_hostname')
  })

  it.each([
    'http://db.internal/',
    'http://printer.local/',
    'http://wiki.corp/',
    'http://gateway.lan/',
    'http://nas.home/',
    'http://portal.intranet/',
    'http://api.localhost/',
  ])('rejects the internal suffix in %s', (url) => {
    expect(reason(url)).toBe('blocked_suffix')
  })

  it('rejects a bare hostname with no dot as an intranet name', () => {
    expect(reason('http://intranet/')).toBe('non_fqdn')
  })

  it.each([
    'http://127.0.0.1/',
    'http://127.1.2.3/',
    'http://10.0.0.5/',
    'http://172.16.4.9/',
    'http://172.31.255.254/',
    'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://100.64.0.1/',
    'http://0.0.0.0/',
    'http://[::1]/',
    'http://[fd00::1]/',
    'http://[fe80::1]/',
    // `new URL()` canonicalises these to `[::ffff:a9fe:a9fe]` and
    // `[64:ff9b::7f00:1]`, so the dotted-quad form never reaches the check.
    'http://[::ffff:169.254.169.254]/',
    'http://[::ffff:10.0.0.1]/',
    'http://[64:ff9b::127.0.0.1]/',
  ])('rejects the private address %s', (url) => {
    expect(reason(url)).toBe('private_address')
  })

  it('rejects a public hostname that resolves to a private address', () => {
    // The DNS-rebinding case: the name is fine, the answer is not.
    expect(reason('https://rebind.example.com/', ['169.254.169.254'])).toBe(
      'resolves_to_private_address',
    )
    expect(reason('https://rebind.example.com/', ['93.184.216.34'])).toBe('allowed')
  })

  it('rejects embedded credentials', () => {
    expect(reason('https://user:pass@example.com/')).toBe('embedded_credentials')
  })

  it.each([
    ['https://example.com:8080/', 'blocked_port:8080'],
    ['http://example.com:22/', 'blocked_port:22'],
    ['http://example.com:5432/', 'blocked_port:5432'],
    ['http://example.com:6379/', 'blocked_port:6379'],
  ])('rejects the non-web port in %s', (url, detail) => {
    expect(reason(url)).toBe(detail)
  })

  it('accepts the explicit default ports', () => {
    expect(reason('https://example.com:443/')).toBe('allowed')
    expect(reason('http://example.com:80/')).toBe('allowed')
  })

  it('rejects an unparseable URL', () => {
    expect(reason('not a url')).toBe('unparseable_url')
    expect(reason('')).toBe('unparseable_url')
  })

  it('normalises a trailing-dot FQDN before matching', () => {
    // `localhost.` resolves exactly like `localhost`.
    expect(reason('http://localhost./')).toBe('blocked_hostname')
  })

  it('is case-insensitive about the hostname', () => {
    expect(reason('http://LOCALHOST/')).toBe('blocked_hostname')
    expect(reason('http://Metadata.Google.Internal/')).toBe('blocked_hostname')
  })
})

describe('address classification', () => {
  it.each([
    ['10.255.255.255', true],
    ['11.0.0.1', false],
    ['172.15.255.255', false],
    ['172.16.0.0', true],
    ['172.32.0.1', false],
    ['192.168.255.255', true],
    ['192.169.0.1', false],
    ['169.254.0.1', true],
    ['8.8.8.8', false],
    ['1.1.1.1', false],
    ['224.0.0.1', true],
    ['255.255.255.255', true],
  ])('classifies %s', (ip, expected) => {
    expect(isPrivateIpv4(ip)).toBe(expected)
  })

  it('does not treat a non-address as private', () => {
    expect(isPrivateIpv4('example.com')).toBe(false)
    expect(isPrivateIpv4('999.1.1.1')).toBe(false)
  })

  it.each([
    ['::1', true],
    ['::', true],
    ['fc00::1', true],
    ['fd12:3456::1', true],
    ['fe80::abcd', true],
    ['2606:4700:4700::1111', false],
    ['[::1]', true],
    // The canonicalised IPv4-mapped forms.
    ['::ffff:a9fe:a9fe', true],
    ['::ffff:7f00:1', true],
    ['::ffff:808:808', false],
    ['64:ff9b::a9fe:a9fe', true],
  ])('classifies the v6 address %s', (ip, expected) => {
    expect(isPrivateIpv6(ip)).toBe(expected)
  })
})

describe('fetch budgets', () => {
  it('caps redirects, response size and time', () => {
    // These are the other half of the guard: a URL that passes every check can
    // still hang the function or return a gigabyte.
    expect(MAX_REDIRECTS).toBeLessThanOrEqual(5)
    expect(MAX_RESPONSE_BYTES).toBeLessThanOrEqual(8 * 1024 * 1024)
    expect(FETCH_TIMEOUT_MS).toBeLessThanOrEqual(30_000)
  })
})
