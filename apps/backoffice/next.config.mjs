/**
 * The backoffice is an internal operations tool. Its config is deliberately
 * stricter than the marketing site's: it must never be indexed, never be
 * framed, and never leak a referrer to a third party, because its URLs contain
 * user ids.
 *
 * `transpilePackages` lets the workspace packages ship as TypeScript source, so
 * the backoffice consumes @da/domain the same way the mobile app does.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  /**
   * Normally `.next`, and something else while the end-to-end suite is running.
   *
   * That suite builds the console and serves it for a couple of minutes, and a
   * developer may well have `next dev` — or another build — writing to `.next`
   * at the same time. Two writers on one output directory produce a server that
   * loads half of one build and half of another, and the failure looks like a
   * missing chunk in a page nobody touched. Giving the suite a directory of its
   * own is the whole fix.
   */
  distDir: process.env.BACKOFFICE_DIST_DIR ?? '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@da/domain', '@da/design-tokens', '@da/validation'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // No referrer at all: a backoffice path can carry a user id.
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "img-src 'self' data:",
              // Next injects inline bootstrap scripts and styles.
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self' data:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "form-action 'self'",
              "base-uri 'self'",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

export default nextConfig
