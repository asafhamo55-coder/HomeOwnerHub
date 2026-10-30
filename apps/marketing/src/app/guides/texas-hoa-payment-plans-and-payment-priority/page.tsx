import type { Metadata } from 'next'
import { GuidePage } from '@/components/georgia/guide-page'
import { GUIDES } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const x = GUIDES['texas-hoa-payment-plans-and-payment-priority']!

export const metadata: Metadata = pageMetadata({
  title: x.metaTitle,
  description: x.description,
  path: '/guides/texas-hoa-payment-plans-and-payment-priority',
})

export default function Page() {
  return <GuidePage guide={x} />
}
