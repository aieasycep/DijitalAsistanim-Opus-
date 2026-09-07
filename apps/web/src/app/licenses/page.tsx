import type { Metadata } from 'next'
import { LegalPage } from '@/components/LegalPage'
import { siteConfig } from '@/lib/site-config'

const description =
  'Dijital Asistan uygulamasında kullanılan açık kaynak yazılımlar, yazı tipleri ve lisansları.'

export const metadata: Metadata = {
  title: 'Lisanslar',
  description,
  alternates: { canonical: '/licenses' },
  openGraph: {
    title: `Lisanslar — ${siteConfig.name}`,
    description,
    url: `${siteConfig.url}/licenses`,
  },
}

/**
 * Third-party notices.
 *
 * Grouped by what each dependency does rather than alphabetically: someone
 * reading this page is usually checking a specific concern ("what renders my
 * mail?", "what talks to the network?"), not auditing a package list.
 */
const groups = [
  {
    title: 'Uygulama çatısı',
    items: [
      ['React Native', 'MIT', 'Meta Platforms, Inc.'],
      ['React', 'MIT', 'Meta Platforms, Inc.'],
      ['Expo SDK ve Expo Router', 'MIT', '650 Industries, Inc.'],
      ['React Navigation', 'MIT', 'React Navigation contributors'],
      ['Reanimated', 'MIT', 'Software Mansion'],
      ['React Native Gesture Handler', 'MIT', 'Software Mansion'],
      ['FlashList', 'MIT', 'Shopify Inc.'],
    ],
  },
  {
    title: 'Veri ve durum',
    items: [
      ['TanStack Query', 'MIT', 'Tanner Linsley'],
      ['Zustand', 'MIT', 'Poimandres'],
      ['Zod', 'MIT', 'Colin McDonnell'],
      ['supabase-js', 'MIT', 'Supabase Inc.'],
      ['react-native-mmkv', 'MIT', 'Marc Rousavy'],
    ],
  },
  {
    title: 'Web sitesi',
    items: [
      ['Next.js', 'MIT', 'Vercel, Inc.'],
      ['Tailwind CSS', 'MIT', 'Tailwind Labs Inc.'],
    ],
  },
  {
    title: 'Yazı tipleri ve simgeler',
    items: [
      ['Geist', 'SIL OFL 1.1', 'Vercel, Inc.'],
      ['Lora', 'SIL OFL 1.1', 'Cyreal'],
      ['Material Icons', 'Apache 2.0', 'Google LLC'],
    ],
  },
] as const

export default function LicensesPage() {
  return (
    <LegalPage
      title="Lisanslar"
      lede="Dijital Asistan, aşağıdaki açık kaynak projelerin üzerine kuruludur. Her birinin lisans metni ilgili projenin deposunda yayımlanır."
      updatedAt={siteConfig.updatedAt}
    >
      {groups.map((group) => (
        <section key={group.title}>
          <h2>{group.title}</h2>
          <table>
            <thead>
              <tr>
                <th>Bileşen</th>
                <th>Lisans</th>
                <th>Telif</th>
              </tr>
            </thead>
            <tbody>
              {group.items.map(([name, license, holder]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{license}</td>
                  <td>{holder}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <h2>Tam liste</h2>
      <p>
        Yukarıdaki tablo doğrudan bağımlılıkları kapsar. Geçişli bağımlılıklar dahil tam listeyi ve
        her paketin lisans metnini <a href={`mailto:${siteConfig.email.legal}`}>{siteConfig.email.legal}</a>{' '}
        adresinden isteyebilirsin.
      </p>
    </LegalPage>
  )
}
