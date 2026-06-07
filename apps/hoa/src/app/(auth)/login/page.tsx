import Link from 'next/link'
import { redirect as nextRedirect } from 'next/navigation'
import { LoginMethods } from './LoginMethods'

export const metadata = { title: 'Sign in' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  const { redirect } = await searchParams

  // Dev-only: if DEV_AUTOLOGIN is on, skip the magic-link form entirely
  // and route through the auto-login handler. Keeps direct /login visits
  // consistent with the middleware bounce.
  if (process.env.DEV_AUTOLOGIN === '1') {
    const target = redirect
      ? `/auth/dev-login?redirect=${encodeURIComponent(redirect)}`
      : '/auth/dev-login'
    nextRedirect(target)
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Sign in</h2>
        <p className="text-sm text-muted">
          Sign in with your password, or have a one-time link emailed to you.
          New here?{' '}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
          .
        </p>
      </div>
      <LoginMethods redirectTo={redirect} />
    </div>
  )
}
