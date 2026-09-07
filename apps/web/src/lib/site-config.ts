const withFallback = (value: string | undefined, fallback: string): string =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback

const DOWNLOAD_ANCHOR = '#indir'

const siteUrl = withFallback(process.env.NEXT_PUBLIC_SITE_URL, 'https://dijitalasistan.app')

export type StoreLink = {
  readonly label: string
  readonly href: string
  readonly available: boolean
}

const iosHref = withFallback(process.env.NEXT_PUBLIC_IOS_APP_URL, DOWNLOAD_ANCHOR)
const androidHref = withFallback(process.env.NEXT_PUBLIC_ANDROID_APP_URL, DOWNLOAD_ANCHOR)

export const siteConfig = {
  name: 'Dijital Asistan',
  shortName: 'Dijital Asistan',
  tagline: 'Bugün bilmen gereken 5 şey var.',
  description:
    'Dijital Asistan; mailini, takvimini ve yapman gerekenleri tek yerde anlar. Her sabah seni ilgilendiren beş şeyi öne çıkarır, gerisini sessize alır.',
  url: siteUrl,
  locale: 'tr_TR',
  company: 'Dijital Asistan Yazılım A.Ş.',
  address: 'Levent Mah. 1. Cadde No: 24, Beşiktaş, İstanbul, Türkiye',
  email: {
    support: 'destek@dijitalasistan.app',
    privacy: 'gizlilik@dijitalasistan.app',
    legal: 'hukuk@dijitalasistan.app',
    deletion: 'silme@dijitalasistan.app',
  },
  store: {
    ios: { label: 'App Store', href: iosHref, available: iosHref !== DOWNLOAD_ANCHOR },
    android: {
      label: 'Google Play',
      href: androidHref,
      available: androidHref !== DOWNLOAD_ANCHOR,
    },
  } satisfies Record<'ios' | 'android', StoreLink>,
  pricing: {
    monthly: '199 TL',
    annual: '1.490 TL',
    trialDays: 7,
    annualSavingHint: 'Yıllıkta iki aydan fazlasını kazanırsın.',
  },
  retention: {
    default: '90 gün',
    options: ['30 gün', '90 gün', '1 yıl', 'silene kadar'] as const,
  },
  updatedAt: '7 Eylül 2026',
} as const

export const downloadAnchor = DOWNLOAD_ANCHOR

export const absoluteUrl = (path: string): string =>
  path.startsWith('http') ? path : `${siteConfig.url}${path.startsWith('/') ? path : `/${path}`}`
