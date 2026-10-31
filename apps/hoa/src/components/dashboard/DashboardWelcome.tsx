import { GreetingHeadline } from '@/components/dashboard/GreetingHeadline'

/**
 * The board dashboard's welcome band: greeting, today's date and the
 * association's name on a soft brand tint (the sign-in panel's violet,
 * lightened to a token so it follows light and dark), The one big action lives in the
 * "Do this next" card right below. GreetingHeadline renders the page's single <h1>.
 */
export function DashboardWelcome({
  name,
  associationName,
  fallbackDate,
}: {
  name: string | null
  associationName: string
  fallbackDate: string
}) {
  return (
    <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary-subtle via-surface to-surface p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <GreetingHeadline name={name} contextLabel={associationName} fallbackDate={fallbackDate} />
          <p className="text-sm text-foreground-secondary">Here’s where things stand today.</p>
        </div>
      </div>
    </header>
  )
}
