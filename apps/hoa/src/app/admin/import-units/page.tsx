import { Alert, Page } from '@homeowner-portal/ui'
import { ImportForm } from './ImportForm'
import { loadImportFormOptions } from './actions'

export const metadata = { title: 'Import properties & residents' }

export default async function ImportUnitsPage() {
  const { orgs, associations } = await loadImportFormOptions()

  return (
    <Page
      width="narrow"
      title="Import properties & residents"
      description={
        <>
          Bulk-load <code className="font-mono text-xs">Properties.csv</code> and{' '}
          <code className="font-mono text-xs">Residents.csv</code> into a tenant. Properties become units; residents
          become ownerships (owners) or tenancies (tenants).
        </>
      }
    >
      <Alert variant="info" title="Safe to re-run">
        Units are matched on organization + address line 1, and ownerships on unit + owner email, so existing rows
        are reused rather than duplicated. Run a dry run first to check the counts.
      </Alert>
      <ImportForm orgs={orgs} associations={associations} />
    </Page>
  )
}
