import type { Metadata } from 'next'
import { GuidePage } from '@/components/georgia/guide-page'
import { GUIDES } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const guide = GUIDES['fines-and-violation-hearings']!

export const metadata: Metadata = pageMetadata({
  title: guide.metaTitle,
  description: guide.description,
  path: '/georgia/fines-and-violation-hearings',
})

export default function Page() {
  return <GuidePage guide={guide} />
}
