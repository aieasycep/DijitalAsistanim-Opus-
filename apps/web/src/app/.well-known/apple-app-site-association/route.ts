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
          paths: ['/oauth/*', '/support', '/privacy', '/terms', '/data-deletion'],
          components: [
            { '/': '/oauth/*', comment: 'OAuth dönüş ve bağlantı ekranları' },
            { '/': '/support', comment: 'Destek sayfası' },
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
