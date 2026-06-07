import Link from 'next/link'
import { SignupMethods } from './SignupMethods'

export const metadata = { title: 'Create account' }

// Two ways to sign up: email + password, or a no-password magic link (the
// latter handled by signInWithOtp with shouldCreateUser=true). Either way,
// first-time users land in onboarding after confirming their email.
export default function SignupPage() {
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Create your HOA Hub account</h2>
        <p className="text-sm text-muted">
          We&apos;ll set up your HOA after you confirm your email. Already have an account?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
          .
        </p>
      </div>
      <SignupMethods />
    </div>
  )
}
