import Link from 'next/link'
import { Tabs } from '@homeowner-portal/ui'

const ITEMS = [
  { label: 'All documents', href: '/documents' },
  { label: 'Governing documents', href: '/documents/governing' },
]

/** Sub-navigation shared by the two Documents list pages. */
export function DocumentTabs({ current }: { current: '/documents' | '/documents/governing' }) {
  return <Tabs items={ITEMS.map((i) => ({ ...i, active: i.href === current }))} linkAs={Link} aria-label="Document sections" />
}

export function formatBytes(n: number | null): string {
  if (!n) return '—'
  const mb = n / 1024 / 1024
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}
