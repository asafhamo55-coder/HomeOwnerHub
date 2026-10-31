import Link from 'next/link'
import { Alert } from '@homeowner-portal/ui'
import { AuthHeader } from '@/components/auth/AuthShell'
import { HashSessionHandler } from '@/components/auth/HashSessionHandler'
import { LoginMethods } from './LoginMethods'

/** The sign-in screen body. Split from page.tsx so the page keeps its dev-autologin bounce alone. */
export function LoginView({ redirect, reason }: { redirect?: string; reason?: string }) {
  return (
    <>
      <AuthHeader
        title="Sign in to HomeownerHub"
        description={
          <>
            New to HomeownerHub?{' '}
            <Link href="/signup" className="font-medium text-primary hover:underline">
              Create an account
            </Link>
          </>
        }
      />
      {reason === 'session-expired' ? (
        <Alert variant="warning" title="Your session expired" className="mb-5">
          Sessions stay open for up to 24 hours. Sign in again to pick up where you left off.
        </Alert>
      ) : null}
      <HashSessionHandler />
      <LoginMethods redirectTo={redirect} />
    </>
  )
}
