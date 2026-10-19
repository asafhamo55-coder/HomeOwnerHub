import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, LoadFailed, Page } from '@homeowner-portal/ui'
import { getCurrentUserRole } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { tryLoad } from '@/lib/load-or-fail'
import { propertyHref } from '@/lib/properties/href'
import { asPropertyId } from '@/lib/properties/resolve'
import { ESTOPPEL_PREPARED, recordEstoppelAudit } from '@/lib/properties/estoppel/audit'
import { loadEstoppelInput } from '@/lib/properties/estoppel/load'
import { VERIFY_DISCLAIMER } from '@/lib/properties/estoppel/law'
import { auditFigures, buildCertificate } from '@/lib/properties/estoppel/model'
import { LegalDisclaimer } from '@/components/knowledge/LegalDisclaimer'
import { EstoppelCertificate } from './EstoppelCertificate'

export const metadata = { title: 'Estoppel certificate' }
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * /properties/[id]/estoppel — prepare an estoppel / resale certificate
 * for one home (BL-087). Board and admins only: anyone else gets a 404,
 * decided before any database client is made. Opening it writes an
 * "estoppel_prepared" audit row (ids and amounts only); if that row
 * can't be written the certificate isn't shown, as with the roster.
 */
export default async function EstoppelPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, ctx] = await Promise.all([params, getCurrentUserRole()])
  if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'board')) notFound()
  if (!UUID.test(id)) notFound()
  const propertyId = asPropertyId(id)
  const back = { href: propertyHref(propertyId), label: 'Property' }

  const page = (body: React.ReactNode) => (
    <Page
      width="default"
      title="Estoppel certificate"
      back={back}
      linkAs={Link}
    >
      <div className="space-y-5">
        <p className="text-sm text-foreground-secondary print:hidden">
          The account status a buyer, title company or lender asks for before a closing, filled in from this home’s records.
        </p>
        {body}
      </div>
    </Page>
  )

  const supabase = await getSupabaseServerClient()
  const loaded = await tryLoad('estoppel certificate', () => loadEstoppelInput(supabase, ctx.org.id, propertyId))
  if (!loaded.ok) return page(<LoadFailed what="this home’s account" hint="No certificate was prepared." />)
  if (!loaded.data) notFound()
  const { input, today } = loaded.data

  const cert = buildCertificate(input, { requestDate: today, issueDate: today, delivery: 'electronic', expedited: false })
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const audit = user
    ? await recordEstoppelAudit(supabase, {
        action: ESTOPPEL_PREPARED,
        orgId: ctx.org.id,
        userId: user.id,
        metadata: { property_id: input.propertyId, unit_id: input.unitId, ...auditFigures(cert) },
      })
    : ({ ok: false, code: null } as const)
  if (!audit.ok) {
    return page(
      <Alert variant="error" title="Couldn’t record this certificate">
        Every estoppel certificate is logged, and the log couldn’t be written, so the certificate isn’t shown. Try again.
      </Alert>,
    )
  }

  return page(
    <div className="space-y-5">
      {input.unitId === null ? (
        <Alert variant="warning" title="No unit linked to this home" className="print:hidden">
          Dues are recorded on a unit, and this home has none, so the certificate shows no charges. Link a unit before relying on the balance.
        </Alert>
      ) : null}
      <EstoppelCertificate input={input} today={today} />
      <div className="print:hidden">
        <LegalDisclaimer>{VERIFY_DISCLAIMER}</LegalDisclaimer>
      </div>
    </div>,
  )
}
