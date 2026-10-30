import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, Button, Field, Input, LoadFailed, Page } from '@homeowner-portal/ui'
import { getCurrentUserRole } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { tryLoad } from '@/lib/load-or-fail'
import { propertyHref } from '@/lib/properties/href'
import { asPropertyId } from '@/lib/properties/resolve'
import { loadOwnerStatement } from '@/lib/properties/statement/load'
import { resolveStatementRange } from '@/lib/properties/statement/window'
import { statementBetween } from '@/lib/resident-ledger'
import { formatDay } from '@/lib/money/format'
import { StatementDocument } from '@/components/statement/StatementDocument'
import { PrintStatementButton } from '@/components/resident/PrintStatementButton'
import { EmailStatementButton } from '@/components/statement/EmailStatementButton'
import { loadStatementRecipientPreview } from '@/lib/resident-notify/statement-store'

export const metadata = { title: 'Owner statement' }
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * /properties/[id]/statement: the printable dues statement for one home,
 * for the board. Same running ledger the resident sees on
 * /resident/dues/statement, drawn by the same StatementDocument from the
 * same buildLedger, so the figures cannot differ. Read-only: it records
 * nothing; the only send is the board's explicit "Email to owner". Board and admins only; anyone else gets a
 * 404, decided before any database client is made.
 */
export default async function OwnerStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const [{ id }, sp, ctx] = await Promise.all([params, searchParams, getCurrentUserRole()])
  if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'board')) notFound()
  if (!UUID.test(id)) notFound()
  const propertyId = asPropertyId(id)
  const back = { href: propertyHref(propertyId), label: 'Property' }

  const supabase = await getSupabaseServerClient()
  const loaded = await tryLoad('owner statement', () => loadOwnerStatement(supabase, ctx.org.id, propertyId))
  if (!loaded.ok) {
    return (
      <Page width="default" title="Owner statement" back={back} linkAs={Link}>
        <LoadFailed what="this home’s ledger" hint="No statement was prepared." />
      </Page>
    )
  }
  if (!loaded.data) notFound()
  const d = loaded.data

  const range = resolveStatementRange({ from: sp.from, to: sp.to }, d.today)
  const w = statementBetween(d.ledger, range.from, range.to)
  // Masked only. A failed lookup just means the dialog says no address is on file.
  const recipients = await tryLoad('statement recipients', () => loadStatementRecipientPreview(supabase, ctx.org.id, propertyId))
  const masked = recipients.ok ? recipients.data : []

  return (
    <Page
      width="default"
      title="Owner statement"
      back={back}
      linkAs={Link}
      description="The dues statement this owner sees in their portal, for printing or saving as a PDF."
      actions={
        <div className="flex flex-wrap gap-2">
          <EmailStatementButton
            propertyId={propertyId}
            from={range.from}
            to={range.to}
            periodLabel={`${formatDay(range.from)} – ${formatDay(range.to)}`}
            maskedRecipients={masked}
          />
          <PrintStatementButton />
        </div>
      }
    >
      <div className="space-y-5">
        <form method="get" className="flex flex-wrap items-end gap-3 print:hidden" aria-label="Statement period">
          <Field label="From">
            <Input type="date" name="from" defaultValue={range.from} />
          </Field>
          <Field label="To">
            <Input type="date" name="to" defaultValue={range.to} />
          </Field>
          <Button type="submit" variant="secondary">
            Update period
          </Button>
        </form>

        {!d.hasUnit ? (
          <Alert variant="warning" title="No unit linked to this home" className="print:hidden">
            Dues are recorded on a unit, and this home has none, so the statement shows no charges.
          </Alert>
        ) : null}

        <StatementDocument
          associationName={d.associationName ?? 'Association'}
          statementDate={d.today}
          period={`${formatDay(range.from)} – ${formatDay(range.to)}`}
          all={false}
          from={range.from}
          window={w}
          preparedFor={{ name: d.ownerName }}
          homes={[d.home]}
          truncated={d.truncated}
          truncatedNote="This statement shows the most recent entries only; older history is not included."
          emptyHint="Choose a wider period to see older charges and payments."
          footer="Payments appear once they are approved, so anything received in the last few days may not be listed yet."
        />
      </div>
    </Page>
  )
}
