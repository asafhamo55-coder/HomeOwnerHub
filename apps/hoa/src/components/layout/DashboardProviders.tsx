'use client'

import { ConfirmProvider, ToastProvider } from '@homeowner-portal/ui'

// Client wrapper so the server-rendered (dashboard)/layout.tsx can hand
// state-bearing providers (Confirm modal, Toast viewport) to its
// children without becoming a client component itself.
export function DashboardProviders({ children }: { children: React.ReactNode }) {
  return (
    <ConfirmProvider>
      <ToastProvider>{children}</ToastProvider>
    </ConfirmProvider>
  )
}
