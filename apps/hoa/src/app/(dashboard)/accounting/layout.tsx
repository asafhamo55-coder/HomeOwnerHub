import { AccountingTabs } from './AccountingTabs'

// Persistent in-page nav across every /accounting/* route. Highlights
// the active tab via the client-side `usePathname()` hook inside
// AccountingTabs.
export default function AccountingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <AccountingTabs />
      <div>{children}</div>
    </div>
  )
}
