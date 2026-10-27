import type { Metadata } from 'next'
import { ChecklistPage } from '@/components/georgia/checklist-page'
import { CHECKLISTS } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const list = CHECKLISTS['hoa-violation-letter-georgia']!

export const metadata: Metadata = pageMetadata({
  title: list.metaTitle,
  description: list.description,
  path: '/templates/hoa-violation-letter-georgia',
})

export default function Page() {
  return <ChecklistPage list={list} />
}
