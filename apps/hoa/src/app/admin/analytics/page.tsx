import { redirect } from 'next/navigation'
import { requirePlatformAdmin } from '@/lib/platform-admin'

// v1: analytics surface lives on the /admin overview. This route is a
// placeholder for a future deep-analytics page (cohort tables, ARR
// projections, etc.). Redirects to the overview for now.

export default async function AnalyticsPage() {
  await requirePlatformAdmin()
  redirect('/admin')
}
