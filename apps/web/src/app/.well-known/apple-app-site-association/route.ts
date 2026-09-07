export const dynamic = 'force-static'

const teamId = process.env.APPLE_TEAM_ID ?? 'TEAMID0000'
const bundleId = process.env.APPLE_BUNDLE_ID ?? 'com.dijitalasistan.app'
const appId = `${teamId}.${bundleId}`

export function GET(): Response {
  const association = {
    applinks: {
      apps: [],
      details: [
        {
          appID: appId,
          appIDs: [appId],
          // Only paths the app can actually handle. The legal and support
          // pages are deliberately absent: claiming them would open the app
          // when someone taps "Gizlilik Politikası" in a browser, which is the
          // opposite of what they asked for.
          paths: ['/l/*', '/davet/*'],
          components: [
            { '/': '/l/*', comment: 'Uygulama içi derin bağlantılar' },
            { '/': '/davet/*', comment: 'Davet kodu bağlantıları' },
          ],
        },
      ],
    },
    webcredentials: { apps: [appId] },
    appclips: { apps: [] },
  }

  return new Response(JSON.stringify(association, null, 2), {
    headers: {
      // Apple fetches this without an extension and requires application/json.
      'content-type': 'application/json',
      'cache-control': 'public, max-age=3600',
    },
  })
}
