import { redirect as nextRedirect } from 'next/navigation'
import { LoginView } from './LoginView'

export const metadata = { title: 'Sign in' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; reason?: string }>
}) {
  const { redirect, reason } = await searchParams

  // Dev-only: if DEV_AUTOLOGIN is on, skip the magic-link form entirely
  // and route through the auto-login handler. Keeps direct /login visits
  // consistent with the middleware bounce.
  if (process.env.DEV_AUTOLOGIN === '1') {
    const target = redirect
      ? `/auth/dev-login?redirect=${encodeURIComponent(redirect)}`
      : '/auth/dev-login'
    nextRedirect(target)
  }

  return <LoginView redirect={redirect} reason={reason} />
}
