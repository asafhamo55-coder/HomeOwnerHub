import type { Metadata } from 'next'
import { GuidePage } from '@/components/georgia/guide-page'
import { GUIDES } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const x = GUIDES['georgia-hoa-annual-meeting-notice-and-reports-44-3-230']!

export const metadata: Metadata = pageMetadata({
  title: x.metaTitle,
  description: x.description,
  path: '/guides/georgia-hoa-annual-meeting-notice-and-reports-44-3-230',
})

export default function Page() {
  return <GuidePage guide={x} />
}
