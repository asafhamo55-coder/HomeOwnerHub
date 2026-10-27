import type { Metadata } from 'next'
import { ChecklistPage } from '@/components/georgia/checklist-page'
import { CHECKLISTS } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const list = CHECKLISTS['violation-notice-checklist']!

export const metadata: Metadata = pageMetadata({
  title: list.metaTitle,
  description: list.description,
  path: '/georgia/violation-notice-checklist',
})

export default function Page() {
  return <ChecklistPage list={list} />
}
