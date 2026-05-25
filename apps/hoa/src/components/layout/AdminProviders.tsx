'use client'

import { ConfirmProvider, ToastProvider } from '@homeowner-portal/ui'

export function AdminProviders({ children }: { children: React.ReactNode }) {
  return (
    <ConfirmProvider>
      <ToastProvider>
        {children}
      </ToastProvider>
    </ConfirmProvider>
  )
}
