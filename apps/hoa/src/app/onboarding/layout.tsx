import { ConfirmProvider, ToastProvider } from '@homeowner-portal/ui'

// Onboarding sits outside the (dashboard) layout, so it never got the
// Confirm/Toast providers — and /onboarding/setup renders the mailbox
// card, whose scope picker calls useToast(). With a mailbox connected the
// page crashed with "useToast() must be used inside <ToastProvider>".
// Both providers are client components; this layout stays a server one.
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConfirmProvider>
      <ToastProvider>{children}</ToastProvider>
    </ConfirmProvider>
  )
}
