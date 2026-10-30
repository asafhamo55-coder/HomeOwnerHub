import type { Metadata } from 'next'
import { ChecklistPage } from '@/components/georgia/checklist-page'
import { CHECKLISTS } from '@/lib/georgia'
import { pageMetadata } from '@/lib/site'

const x = CHECKLISTS['apply-hoa-credit-to-owner-balance-checklist']!

export const metadata: Metadata = pageMetadata({
  title: x.metaTitle,
  description: x.description,
  path: '/templates/apply-hoa-credit-to-owner-balance-checklist',
})

export default function Page() {
  return <ChecklistPage list={x} />
}
