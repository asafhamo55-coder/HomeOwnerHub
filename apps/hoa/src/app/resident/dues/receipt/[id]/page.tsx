import { notFound } from 'next/navigation'
import { LoadFailed } from '@homeowner-portal/ui'
import { getResidentActor } from '@/lib/impersonation'
import { getResidentUnits } from '@/lib/resident'
import { isReceiptId, loadResidentReceipt } from '@/lib/resident-receipt'
import { PrintStatementButton } from '@/components/resident/PrintStatementButton'
import { ReceiptView } from '@/components/resident/ReceiptView'
import { ScreenHeader } from '@/components/resident/screen'

export const metadata = { title: 'Receipt' }
export const dynamic = 'force-dynamic'

const BACK = { href: '/resident/dues/ledger', label: 'Ledger' }

// Printable payment receipt. The payment is read through the resident's own
// client (RLS: payments on their unit(s) only) and then checked against
// their unit ids; anything else, including a malformed id, is a 404.
export default async function ResidentReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isReceiptId(id)) notFound()

  const [actor, units] = await Promise.all([getResidentActor(), getResidentUnits()])
  const result = await loadResidentReceipt(actor.client, units, id, actor.orgId)
  if (result.status === 'not_found') notFound()
  if (result.status === 'failed') {
    return (
      <div className="space-y-6">
        <ScreenHeader title="Receipt" back={BACK} />
        <LoadFailed what="your receipt" hint="Nothing is wrong with your account. The read failed. Try again in a minute." />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        <ScreenHeader
          title="Receipt"
          back={BACK}
          subtitle="Print it, or choose “Save as PDF” in the print dialog."
          action={<PrintStatementButton />}
        />
      </div>
      <ReceiptView receipt={result.receipt} />
    </div>
  )
}
