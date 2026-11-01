import type { Metadata } from 'next'
import { GuidePage } from '@/components/georgia/guide-page'
import { GUIDES } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const x = GUIDES['georgia-hoa-owners-take-control-from-declarant-44-3-232-1']!

export const metadata: Metadata = pageMetadata({
  title: x.metaTitle,
  description: x.description,
  path: '/guides/georgia-hoa-owners-take-control-from-declarant-44-3-232-1',
})

export default function Page() {
  return <GuidePage guide={x} />
}
