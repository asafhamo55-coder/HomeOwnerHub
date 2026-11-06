import Link from 'next/link'
import { AuthHeader } from '@/components/auth/AuthShell'
import { signupNextPath } from '@/lib/safe-next-path'
import { SignupMethods } from './SignupMethods'

export const metadata = { title: 'Create account' }

// Two ways to sign up: email + password, or a no-password magic link (the
// latter handled by signInWithOtp with shouldCreateUser=true). Either way,
// first-time users land in onboarding after confirming their email.
export default async function SignupPage({ searchParams }: { searchParams: Promise<{ redirect?: string }> }) {
  const { redirect } = await searchParams
  const next = signupNextPath(redirect)
  return (
    <>
      <AuthHeader
        title="Create your account"
        description={
          <>
            Confirm your email, then set up your HOA in about a minute. Already have an account?{' '}
            <Link href={next === '/onboarding' ? '/login' : `/login?redirect=${encodeURIComponent(next)}`} className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </>
        }
      />
      <SignupMethods next={next} />
    </>
  )
}
