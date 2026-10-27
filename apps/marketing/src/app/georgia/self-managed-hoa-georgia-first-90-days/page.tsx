import type { Metadata } from 'next'
import { GuidePage } from '@/components/georgia/guide-page'
import { GUIDES } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const guide = GUIDES['self-managed-hoa-georgia-first-90-days']!

export const metadata: Metadata = pageMetadata({
  title: guide.metaTitle,
  description: guide.description,
  path: '/georgia/self-managed-hoa-georgia-first-90-days',
})

export default function Page() {
  return <GuidePage guide={guide} />
}
