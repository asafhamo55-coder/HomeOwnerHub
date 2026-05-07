import { ComingSoon } from '@/components/layout/ComingSoon'

export const metadata = { title: 'Dues' }

export default function DuesPage() {
  return (
    <ComingSoon
      title="Dues"
      week="Week 3"
      description="Month-by-month grid showing paid/unpaid status per property, automatic late-fee calculation, and one-click 'Mark as paid' actions."
    />
  )
}
