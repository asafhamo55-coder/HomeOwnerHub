import Link from 'next/link'
import { AuthHeader } from '@/components/auth/AuthShell'
import { SignupMethods } from './SignupMethods'

export const metadata = { title: 'Create account' }

// Two ways to sign up: email + password, or a no-password magic link (the
// latter handled by signInWithOtp with shouldCreateUser=true). Either way,
// first-time users land in onboarding after confirming their email.
export default function SignupPage() {
  return (
    <>
      <AuthHeader
        title="Create your account"
        description={
          <>
            Confirm your email, then set up your HOA in about a minute. Already have an account?{' '}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </>
        }
      />
      <SignupMethods />
    </>
  )
}
