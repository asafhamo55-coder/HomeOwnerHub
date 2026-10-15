'use client'

import { ConfirmProvider, ToastProvider } from '@homeowner-portal/ui'

// Client providers for the resident portal. Toasts sit above the sticky
// bottom tab bar (bottom-24) rather than covering it.
export function ResidentProviders({ children }: { children: React.ReactNode }) {
  return (
    <ConfirmProvider>
      <ToastProvider viewportClassName="bottom-24 sm:bottom-24">{children}</ToastProvider>
    </ConfirmProvider>
  )
}
