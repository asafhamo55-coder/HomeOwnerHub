import type { Metadata } from 'next'
import { GuidePage } from '@/components/georgia/guide-page'
import { GUIDES } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const x = GUIDES['georgia-hoa-annual-registration-secretary-of-state-14-3-1622']!

export const metadata: Metadata = pageMetadata({
  title: x.metaTitle,
  description: x.description,
  path: '/guides/georgia-hoa-annual-registration-secretary-of-state-14-3-1622',
})

export default function Page() {
  return <GuidePage guide={x} />
}
