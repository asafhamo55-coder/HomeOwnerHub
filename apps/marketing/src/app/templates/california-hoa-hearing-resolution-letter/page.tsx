import type { Metadata } from 'next'
import { ChecklistPage } from '@/components/georgia/checklist-page'
import { CHECKLISTS } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const x = CHECKLISTS['california-hoa-hearing-resolution-letter']!

export const metadata: Metadata = pageMetadata({
  title: x.metaTitle,
  description: x.description,
  path: '/templates/california-hoa-hearing-resolution-letter',
})

export default function Page() {
  return <ChecklistPage list={x} />
}
