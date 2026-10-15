'use client'

import { ConfirmProvider, ToastProvider } from '@homeowner-portal/ui'
import { CopilotProvider } from '@/components/copilot/Copilot'

// Client wrapper so the server-rendered (dashboard)/layout.tsx can hand
// state-bearing providers (Confirm modal, Toast viewport, Copilot state)
// to its children without becoming a client component itself.
//
// CopilotProvider lives here so the copilot's conversation and open state
// persist across every (dashboard)/* route and survive soft navigations.
// The trigger (top bar) and the panel (inside AppShell) are rendered by
// the layout.
export function DashboardProviders({ children }: { children: React.ReactNode }) {
  return (
    <ConfirmProvider>
      <ToastProvider>
        <CopilotProvider>{children}</CopilotProvider>
      </ToastProvider>
    </ConfirmProvider>
  )
}
