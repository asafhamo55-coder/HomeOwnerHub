import type { Metadata } from 'next'
import { ChecklistPage } from '@/components/georgia/checklist-page'
import { CHECKLISTS } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const list = CHECKLISTS['hoa-announcement-templates']!

export const metadata: Metadata = pageMetadata({
  title: list.metaTitle,
  description: list.description,
  path: '/templates/hoa-announcement-templates',
})

export default function Page() {
  return <ChecklistPage list={list} />
}
