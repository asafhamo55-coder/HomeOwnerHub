'use client'

import { useRouter } from 'next/navigation'
import { Select } from '@homeowner-portal/ui'
import { COMMUNICATION_CATEGORY } from '@/lib/status/community'
import { communicationsHref } from '@/lib/communications/search'

/**
 * Category filter: applies on change (it is a URL param, so the list, the
 * back button and shared links all agree). Keeps the status filter and
 * resets paging.
 */
export function CategoryFilter({
  category,
  status,
  q,
  window,
  delivery,
}: {
  category?: string
  status?: string
  q?: string
  window?: string
  delivery?: string
}) {
  const router = useRouter()
  return (
    <div className="w-full sm:w-52">
      <label htmlFor="filter-category" className="sr-only">
        Filter by category
      </label>
      <Select
        key={category ?? "all"}
        id="filter-category"
        value={category}
        placeholder="All categories"
        onValueChange={(next) => {
          router.push(communicationsHref({ category: next || undefined, status, q, window, delivery }))
        }}
      >
        <option value="">All categories</option>
        {Object.entries(COMMUNICATION_CATEGORY).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
    </div>
  )
}
