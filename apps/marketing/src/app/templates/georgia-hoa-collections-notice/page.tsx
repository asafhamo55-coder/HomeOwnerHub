import type { Metadata } from 'next'
import { ChecklistPage } from '@/components/georgia/checklist-page'
import { CHECKLISTS } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const list = CHECKLISTS['georgia-hoa-collections-notice']!

export const metadata: Metadata = pageMetadata({
  title: list.metaTitle,
  description: list.description,
  path: '/templates/georgia-hoa-collections-notice',
})

export default function Page() {
  return <ChecklistPage list={list} />
}
