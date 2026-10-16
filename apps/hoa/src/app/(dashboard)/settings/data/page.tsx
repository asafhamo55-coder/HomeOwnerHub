import Link from 'next/link'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Page,
} from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { EXPORT_TABLES } from '@/lib/data-export/tables'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { DownloadAllDataButton } from './DownloadAllDataButton'

export const metadata = { title: 'Your data' }
export const dynamic = 'force-dynamic'

// BL-011 full data export. Board or admin, like the export route itself:
// the treasurer is usually a board member, and /settings (General) is
// admin-only, so the action lives on its own settings tab.

export default async function DataExportSettingsPage() {
  const { role } = await requireBoardOrAdmin()

  return (
    <Page
      width="narrow"
      title="Your data"
      description="Your association’s records belong to you. Take a full copy whenever you like."
      tabs={<SettingsTabs current="/settings/data" role={role} />}
      linkAs={Link}
    >
      <Card>
        <CardHeader className="pb-4">
          <CardTitle as="h2">Download all data</CardTitle>
          <CardDescription>
            A zip file with one spreadsheet (CSV) per area, ready to open in Excel, Numbers or Google Sheets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <h3 className="mb-2 text-sm font-medium text-foreground">What’s included</h3>
            <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm text-muted sm:grid-cols-2">
              {EXPORT_TABLES.map((t) => (
                <li key={t.file} className="flex min-w-0 items-baseline justify-between gap-3">
                  <span className="min-w-0 text-foreground">{t.label}</span>
                  <span className="shrink-0 font-mono text-xs">{t.file}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-foreground">Not included</h3>
            <p className="text-sm text-muted">
              Uploaded files themselves (the documents index lists them), bank and payment connections, sign-in
              details, and vendor tax ids.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex-col items-start gap-3 py-4">
          <DownloadAllDataButton />
          <p className="text-xs text-muted">
            The file holds owners’ and residents’ names, emails and phone numbers. Each download is recorded in
            your association’s audit log. Keep the file somewhere private.
          </p>
        </CardFooter>
      </Card>
    </Page>
  )
}
