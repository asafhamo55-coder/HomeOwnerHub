'use client'

import { ConfirmProvider, ToastProvider } from '@homeowner-portal/ui'
import { Copilot } from '@/components/copilot/Copilot'

// Client wrapper so the server-rendered (dashboard)/layout.tsx can hand
// state-bearing providers (Confirm modal, Toast viewport) to its
// children without becoming a client component itself.
//
// We also mount <Copilot /> here so the right-side assistant panel
// persists across every (dashboard)/* route AND survives soft
// navigations — its in-memory conversation isn't blown away when the
// router swaps page segments.
export function DashboardProviders({ children }: { children: React.ReactNode }) {
  return (
    <ConfirmProvider>
      <ToastProvider>
        {children}
        <Copilot />
      </ToastProvider>
    </ConfirmProvider>
  )
}
