import Link from 'next/link'
import { MagicLinkForm } from './MagicLinkForm'

export const metadata = { title: 'Sign in' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  const { redirect } = await searchParams

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-muted">Sign in</h2>
        <p className="text-sm text-muted-fg">
          Enter your email to receive a magic link. New here?{' '}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
          .
        </p>
      </div>
      <MagicLinkForm redirectTo={redirect} />
    </div>
  )
}
