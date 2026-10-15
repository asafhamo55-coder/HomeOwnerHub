'use client'

import { useRouter } from 'next/navigation'
import { Select } from '@homeowner-portal/ui'
import { COMMUNICATION_CATEGORY } from '@/lib/status/community'

/**
 * Category filter: applies on change (it is a URL param, so the list, the
 * back button and shared links all agree). Keeps the status filter and
 * resets paging.
 */
export function CategoryFilter({ category, status }: { category?: string; status?: string }) {
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
          const q = new URLSearchParams()
          if (next) q.set('category', next)
          if (status) q.set('status', status)
          const qs = q.toString()
          router.push(qs ? `/communications?${qs}` : '/communications')
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
