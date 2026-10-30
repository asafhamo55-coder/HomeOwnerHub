import type { Metadata } from 'next'
import { ChecklistPage } from '@/components/georgia/checklist-page'
import { CHECKLISTS } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const x = CHECKLISTS['hoa-board-conflict-of-interest-disclosure-checklist']!

export const metadata: Metadata = pageMetadata({
  title: x.metaTitle,
  description: x.description,
  path: '/templates/hoa-board-conflict-of-interest-disclosure-checklist',
})

export default function Page() {
  return <ChecklistPage list={x} />
}
