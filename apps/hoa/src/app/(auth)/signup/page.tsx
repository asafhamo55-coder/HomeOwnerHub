import Link from 'next/link'
import { MagicLinkForm } from '../login/MagicLinkForm'

export const metadata = { title: 'Create account' }

// Magic link doesn't distinguish signup from sign-in (signInWithOtp with
// shouldCreateUser=true handles both). This page is just framing — first-
// time users land in the onboarding flow after verifying their email.
export default function SignupPage() {
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Create your HOA Hub account</h2>
        <p className="text-sm text-muted">
          We&apos;ll set up your HOA after you verify your email. Already have an account?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
          .
        </p>
      </div>
      <MagicLinkForm
        submitLabel="Send magic link"
        helperText="No password needed. We'll set up your HOA on the next step."
      />
    </div>
  )
}
