import type { Metadata } from 'next'
import { ChecklistPage } from '@/components/georgia/checklist-page'
import { CHECKLISTS } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const x = CHECKLISTS['georgia-hoa-fine-hearing-notice']!

export const metadata: Metadata = pageMetadata({
  title: x.metaTitle,
  description: x.description,
  path: '/templates/georgia-hoa-fine-hearing-notice',
})

export default function Page() {
  return <ChecklistPage list={x} />
}
