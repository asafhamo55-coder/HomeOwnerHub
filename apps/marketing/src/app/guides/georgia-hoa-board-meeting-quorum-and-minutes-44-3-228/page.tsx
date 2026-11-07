import type { Metadata } from 'next'
import { GuidePage } from '@/components/georgia/guide-page'
import { GUIDES } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const x = GUIDES['georgia-hoa-board-meeting-quorum-and-minutes-44-3-228']!

export const metadata: Metadata = pageMetadata({
  title: x.metaTitle,
  description: x.description,
  path: '/guides/georgia-hoa-board-meeting-quorum-and-minutes-44-3-228',
})

export default function Page() {
  return <GuidePage guide={x} />
}
