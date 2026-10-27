import type { Metadata } from 'next'
import { GuidePage } from '@/components/georgia/guide-page'
import { GUIDES } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const guide = GUIDES['switch-from-management-company-to-self-managed-hoa']!

export const metadata: Metadata = pageMetadata({
  title: guide.metaTitle,
  description: guide.description,
  path: '/guides/switch-from-management-company-to-self-managed-hoa',
})

export default function Page() {
  return <GuidePage guide={guide} />
}
