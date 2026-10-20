import Link from 'next/link'
import { Alert, Button } from '@homeowner-portal/ui'
import { BILLING_AUDIT_ACTIONS, billingAttention, billingAttentionMessage, type BillingAuditRow } from '@homeowner-portal/billing'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { openHoaPortal } from '@/lib/billing'

/**
 * Past-due / failed-payment banner on every dashboard page (BL-103). orgs
 * has no billing status column, so the Stripe webhook records
 * customer.subscription.updated statuses and invoice.payment_failed in
 * audit_log (ids and status only), and billingAttention() decides from
 * those rows for the org's CURRENT subscription. Read with the viewer's own
 * client (audit_log SELECT is org members today, board/admin after 0063;
 * the dashboard is board/admin only either way).
 *
 * Admins get a button straight into the Stripe billing portal (only admins
 * may change the payment method, as on Settings → Billing); board members
 * are told to ask one.
 *
 * Advisory: a failed read renders nothing rather than blocking the page.
 */
export async function BillingStatusBanner({ orgId, role, className }: { orgId: string; role: 'admin' | 'board'; className?: string }) {
  const supabase = await getSupabaseServerClient()
  const { data: org, error: orgError } = await supabase
    .from('orgs')
    .select('stripe_sub_id, stripe_customer_id')
    .eq('id', orgId)
    .maybeSingle()
  const subId = (org?.stripe_sub_id as string | null | undefined) ?? null
  if (orgError || !subId) return null

  const { data: rows, error } = await supabase
    .from('audit_log')
    .select('action, metadata')
    .eq('org_id', orgId)
    .in('action', [...BILLING_AUDIT_ACTIONS])
    .eq('metadata->>sub_id', subId)
    .is('user_id', null) // webhook-written rows only, never a member's insert
    .order('created_at', { ascending: false })
    .limit(50)
  if (error || !rows) return null

  const attention = billingAttention(rows as BillingAuditRow[], subId)
  if (!attention) return null
  const { title, body } = billingAttentionMessage(attention)
  const canOpenPortal = role === 'admin' && Boolean(org?.stripe_customer_id)

  return (
    <Alert
      variant="warning"
      title={title}
      className={className}
      actions={
        canOpenPortal ? (
          <form action={openHoaPortal}>
            <Button type="submit" size="sm">
              Update payment method
            </Button>
          </form>
        ) : null
      }
    >
      {body}{' '}
      {canOpenPortal ? null : role === 'admin' ? (
        <Link href="/settings/billing">Open billing</Link>
      ) : (
        <>
          Only an admin can update it. <Link href="/settings/billing">View billing</Link>
        </>
      )}
    </Alert>
  )
}
