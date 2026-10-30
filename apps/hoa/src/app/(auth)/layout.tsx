import { AuthPanel, AuthShell } from '@/components/auth/AuthShell'

// Split screen (brand panel + card) for /login, /signup, /verify, /forgot-password and
// /reset-password. Brand + auth form only — no sidebar, no nav, no chrome.
// Each page renders its own <h1> (AuthHeader).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthShell split>
      <AuthPanel>{children}</AuthPanel>
    </AuthShell>
  )
}
