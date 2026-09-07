import type { Metadata } from 'next'
import { Faq } from '@/components/Faq'
import { FinalCta } from '@/components/FinalCta'
import { PricingTable } from '@/components/PricingTable'
import { faqItems } from '@/lib/content'
import { siteConfig } from '@/lib/site-config'

const description = `Ücretsiz plan tek hesapla süresiz çalışır. Pro ${siteConfig.pricing.monthly} / ay veya ${siteConfig.pricing.annual} / yıl; ${siteConfig.pricing.trialDays} gün ücretsiz deneme.`

export const metadata: Metadata = {
  title: 'Fiyatlar',
  description,
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: `Fiyatlar — ${siteConfig.name}`,
    description,
    url: `${siteConfig.url}/pricing`,
  },
}

const billingQuestions = faqItems.filter((item) =>
  ['Aboneliğimi nasıl iptal ederim?', 'Hangi platformlarda çalışıyor?', 'Verilerim güvende mi?'].includes(
    item.question,
  ),
)

export default function PricingPage() {
  return (
    <>
      <PricingTable headingLevel="h1" />
      <Faq items={billingQuestions} title="Abonelik hakkında" />
      <FinalCta />
    </>
  )
}
