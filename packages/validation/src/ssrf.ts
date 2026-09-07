import { AppError } from '@da/domain'

/**
 * SSRF guard for the link-capture fetcher.
 *
 * The app fetches URLs the user pastes, from a server that sits inside a
 * private network with access to a database and a metadata endpoint. Without
 * this, "capture this link" is a request forgery primitive. Every fetch on the
 * server goes through `assertUrlAllowed` first, and again after each redirect
 * hop — a public URL that 302s to `169.254.169.254` is the whole attack.
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
])

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home', '.corp', '.intranet']

/** Only these two schemes are ever fetched. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

export const MAX_REDIRECTS = 3
export const FETCH_TIMEOUT_MS = 10_000
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024

function ipv4ToInt(parts: number[]): number {
  return ((parts[0] ?? 0) << 24) >>> 0 | ((parts[1] ?? 0) << 16) | ((parts[2] ?? 0) << 8) | (parts[3] ?? 0)
}

function parseIpv4(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!m) return null
  const parts = m.slice(1, 5).map(Number)
  return parts.every((p) => p >= 0 && p <= 255) ? parts : null
}

/** RFC1918, loopback, link-local, CGNAT, multicast, broadcast and 0.0.0.0/8. */
export function isPrivateIpv4(host: string): boolean {
  const parts = parseIpv4(host)
  if (!parts) return false
  const ip = ipv4ToInt(parts)
  const inRange = (cidrBase: string, bits: number): boolean => {
    const baseParts = parseIpv4(cidrBase)
    if (!baseParts) return false
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
    return (ip & mask) >>> 0 === (ipv4ToInt(baseParts) & mask) >>> 0
  }
  return (
    inRange('0.0.0.0', 8) ||
    inRange('10.0.0.0', 8) ||
    inRange('100.64.0.0', 10) ||
    inRange('127.0.0.0', 8) ||
    inRange('169.254.0.0', 16) ||
    inRange('172.16.0.0', 12) ||
    inRange('192.0.0.0', 24) ||
    inRange('192.168.0.0', 16) ||
    inRange('198.18.0.0', 15) ||
    inRange('224.0.0.0', 4) ||
    inRange('240.0.0.0', 4)
  )
}

export function isPrivateIpv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase()
  if (h === '::' || h === '::1') return true
  // Unique-local (fc00::/7) and link-local (fe80::/10).
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return true
  if (/^fe[89ab][0-9a-f]:/.test(h)) return true
  // IPv4-mapped (::ffff:169.254.169.254) tunnels straight past an IPv4 check.
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(h)
  if (mapped?.[1]) return isPrivateIpv4(mapped[1])
  return false
}

export interface UrlCheckResult {
  url: URL
  hostname: string
}

/**
 * Reject anything that is not a plainly public http(s) URL.
 *
 * Hostname-based checks alone cannot stop a DNS record that resolves to a
 * private address, so a deployment that can resolve names should also pass
 * `resolvedAddresses` from its DNS lookup; each is re-checked here.
 */
export function assertUrlAllowed(rawUrl: string, resolvedAddresses: string[] = []): UrlCheckResult {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new AppError('url_not_allowed', { detail: 'unparseable_url' })
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new AppError('url_not_allowed', { detail: `protocol:${url.protocol}` })
  }

  // Credentials in a URL are a redirection trick more often than a real need.
  if (url.username || url.password) {
    throw new AppError('url_not_allowed', { detail: 'embedded_credentials' })
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!hostname) throw new AppError('url_not_allowed', { detail: 'empty_host' })

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new AppError('url_not_allowed', { detail: 'blocked_hostname' })
  }
  if (BLOCKED_SUFFIXES.some((s) => hostname.endsWith(s))) {
    throw new AppError('url_not_allowed', { detail: 'blocked_suffix' })
  }
  // A bare label with no dot is an intranet name, not a public site.
  if (!hostname.includes('.') && !hostname.startsWith('[')) {
    throw new AppError('url_not_allowed', { detail: 'non_fqdn' })
  }
  if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) {
    throw new AppError('url_not_allowed', { detail: 'private_address' })
  }

  for (const addr of resolvedAddresses) {
    if (isPrivateIpv4(addr) || isPrivateIpv6(addr)) {
      throw new AppError('url_not_allowed', { detail: 'resolves_to_private_address' })
    }
  }

  // Non-standard ports are how internal services get reached; allow only the
  // two the web actually runs on.
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
  if (port !== 80 && port !== 443) {
    throw new AppError('url_not_allowed', { detail: `blocked_port:${port}` })
  }

  return { url, hostname }
}

export function isUrlAllowed(rawUrl: string, resolvedAddresses: string[] = []): boolean {
  try {
    assertUrlAllowed(rawUrl, resolvedAddresses)
    return true
  } catch {
    return false
  }
}
