import type { Metadata } from 'next'
import { ChecklistPage } from '@/components/georgia/checklist-page'
import { CHECKLISTS } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const x = CHECKLISTS['georgia-annual-meeting-report-checklist']!

export const metadata: Metadata = pageMetadata({
  title: x.metaTitle,
  description: x.description,
  path: '/templates/georgia-annual-meeting-report-checklist',
})

export default function Page() {
  return <ChecklistPage list={x} />
}
