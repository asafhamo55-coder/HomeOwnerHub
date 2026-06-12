'use client'

import { ConfirmProvider, ToastProvider } from '@homeowner-portal/ui'

// Client provider stack: transient toasts + modal confirms, available app-wide
// (matches the HOA dashboard providers pattern).
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  )
}
