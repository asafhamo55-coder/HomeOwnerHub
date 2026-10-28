import type { Metadata } from 'next'
import { GuidePage } from '@/components/georgia/guide-page'
import { GUIDES } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const x = GUIDES['give-hoa-cpa-attorney-limited-access']!

export const metadata: Metadata = pageMetadata({
  title: x.metaTitle,
  description: x.description,
  path: '/guides/give-hoa-cpa-attorney-limited-access',
})

export default function Page() {
  return <GuidePage guide={x} />
}
