import Link from 'next/link'
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle, LoadFailed, Page } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getBoardZelleSettings } from '@/lib/pay-settings'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { AssociationNotSetUp } from '../../_components/AssociationNotSetUp'
import { ZelleSettingsForm } from './ZelleSettingsForm'
import { PaymentReceiptToggle } from './PaymentReceiptToggle'
import { getBoardPaymentReceiptSettings, type BoardPaymentReceiptLoad } from '@/lib/resident-notify/receipt-actions'

export const metadata = { title: 'Resident payments' }
export const dynamic = 'force-dynamic'

// Pay-by-Zelle setup (backlog BL-006). Board or admin: the treasurer is
// usually a board member, not the org admin.
//
// "Payment receipts" (BL-114): one switch for the whole association, OFF
// until a board turns it on — no automatic email reaches an owner before.

export default async function ResidentPaymentsSettingsPage() {
  const { role } = await requireBoardOrAdmin()
  const [load, receipts] = await Promise.all([getBoardZelleSettings(), getBoardPaymentReceiptSettings()])

  const page = (body: React.ReactNode) => (
    <Page
      width="narrow"
      title="Resident payments"
      description="Let residents pay dues with Zelle. Each charge gets a memo code, so deposits match to the right home automatically."
      tabs={<SettingsTabs current="/settings/payments" role={role} />}
      linkAs={Link}
    >
      {body}
    </Page>
  )

  if (!load.ok) {
    if (load.reason === 'no_association') {
      return page(
        <AssociationNotSetUp
          needFor="Resident payments attach to your association’s accounting, and this HOA doesn’t have one yet."
          returnTo="/settings/payments"
        />,
      )
    }
    return page(<LoadFailed what="your payment settings" />)
  }
  const { data } = load

  return page(
    <>
      {data.read.state === 'unverified' ? (
        <Alert variant="warning" title="Residents can’t see your Zelle details right now">
          The saved details were changed outside this screen, so they’re hidden from residents. Check them below and
          save again.
        </Alert>
      ) : null}
      <ZelleSettingsForm
        initial={data.initial}
        configured={data.read.state === 'configured'}
        updatedAt={data.read.state === 'configured' ? data.read.settings.updatedAt : null}
        sampleMemoCode={data.sampleMemoCode}
      />
      <PaymentReceiptsCard receipts={receipts} />
    </>,
  )
}

function PaymentReceiptsCard({ receipts }: { receipts: BoardPaymentReceiptLoad }) {
  return (
    <Card className="mt-6">
      <CardHeader className="pb-4">
        <CardTitle as="h2">Payment receipts</CardTitle>
        <CardDescription>
          One setting for the whole association, shared by every board member. Off until you turn it on — until then,
          owners get a receipt only when you select Send receipt on a payment in Dues.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!receipts.ok ? (
          <LoadFailed what="your payment receipt setting" />
        ) : (
          <>
            {receipts.data.state === 'unverified' ? (
              <Alert variant="warning" title="Automatic receipts are paused">
                The saved setting was changed outside this screen, so no receipt will send on its own. Turn it on again
                to resume.
              </Alert>
            ) : null}
            {!receipts.data.emailConfigured ? (
              <Alert variant="warning" title="Email isn’t set up on this server">
                You can turn this on, but no receipt will go out until email delivery is configured.
              </Alert>
            ) : null}
            <PaymentReceiptToggle initial={receipts.data.on} />
          </>
        )}
      </CardContent>
    </Card>
  )
}
