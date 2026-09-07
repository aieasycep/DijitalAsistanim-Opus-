export const dynamic = 'force-static'

const packageName = process.env.ANDROID_PACKAGE_NAME ?? 'com.dijitalasistan.app'
const fingerprint =
  process.env.ANDROID_SHA256_FINGERPRINT ??
  '00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00'

export function GET(): Response {
  const statements = [
    {
      relation: [
        'delegate_permission/common.handle_all_urls',
        'delegate_permission/common.get_login_creds',
      ],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: [fingerprint],
      },
    },
  ]

  return new Response(JSON.stringify(statements, null, 2), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=3600',
    },
  })
}
