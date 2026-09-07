import type { MetadataRoute } from 'next'
import { siteConfig } from '@/lib/site-config'

// Bumped with each content release; a build-time clock would churn the sitemap on every deploy.
const LAST_MODIFIED = '2026-09-07T00:00:00.000Z'

type Entry = {
  readonly path: string
  readonly priority: number
  readonly changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
}

const entries: readonly Entry[] = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: '/pricing', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/support', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/oauth', priority: 0.6, changeFrequency: 'yearly' },
  { path: '/privacy', priority: 0.6, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.5, changeFrequency: 'yearly' },
  { path: '/data-deletion', priority: 0.6, changeFrequency: 'yearly' },
]

export default function sitemap(): MetadataRoute.Sitemap {
  return entries.map((entry) => ({
    url: `${siteConfig.url}${entry.path === '/' ? '' : entry.path}`,
    lastModified: LAST_MODIFIED,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }))
}
