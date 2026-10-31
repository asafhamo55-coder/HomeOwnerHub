import Link from 'next/link'
import { Alert, Button } from '@homeowner-portal/ui'
import { AuthHeader } from '@/components/auth/AuthShell'
import type { LinkErrorCode } from './link-error'
import { LoginMethods } from './LoginMethods'

/** The sign-in screen body. Split from page.tsx so the page keeps its dev-autologin bounce alone. */
export function LoginView({
  redirect,
  reason,
  linkError,
}: {
  redirect?: string
  reason?: string
  linkError?: LinkErrorCode
}) {
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
      {linkError ? (
        <Alert
          variant="warning"
          title="That link has expired or was already used"
          className="mb-5"
          actions={
            <>
              <Button asChild size="sm" variant="secondary">
                <Link href="/forgot-password">Send a new reset link</Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href="/signup">Create account</Link>
              </Button>
            </>
          }
        >
          Email links work once and expire. Request a new one, or sign in below.
        </Alert>
      ) : null}
      <LoginMethods redirectTo={redirect} />
    </>
  )
}
