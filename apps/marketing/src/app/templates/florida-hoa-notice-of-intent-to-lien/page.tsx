import type { Metadata } from 'next'
import { ChecklistPage } from '@/components/georgia/checklist-page'
import { CHECKLISTS } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const x = CHECKLISTS['florida-hoa-notice-of-intent-to-lien']!

export const metadata: Metadata = pageMetadata({
  title: x.metaTitle,
  description: x.description,
  path: '/templates/florida-hoa-notice-of-intent-to-lien',
})

export default function Page() {
  return <ChecklistPage list={x} />
}
