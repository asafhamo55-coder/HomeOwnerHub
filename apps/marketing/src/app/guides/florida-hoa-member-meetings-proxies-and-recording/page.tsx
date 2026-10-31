import type { Metadata } from 'next'
import { GuidePage } from '@/components/georgia/guide-page'
import { GUIDES } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const x = GUIDES['florida-hoa-member-meetings-proxies-and-recording']!

export const metadata: Metadata = pageMetadata({
  title: x.metaTitle,
  description: x.description,
  path: '/guides/florida-hoa-member-meetings-proxies-and-recording',
})

export default function Page() {
  return <GuidePage guide={x} />
}
