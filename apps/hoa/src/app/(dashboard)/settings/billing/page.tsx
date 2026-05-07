import { ComingSoon } from '@/components/layout/ComingSoon'

export const metadata = { title: 'Billing' }

export default function BillingPage() {
  return (
    <ComingSoon
      title="Billing"
      week="Week 3"
      description="Stripe Checkout for HOA Hub plans (Starter $39, Standard $79, Pro $149) plus a 'Manage subscription' link to the customer portal."
    />
  )
}
