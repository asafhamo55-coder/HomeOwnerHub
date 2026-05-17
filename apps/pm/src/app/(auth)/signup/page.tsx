import Link from 'next/link'
import { MagicLinkForm } from '../login/MagicLinkForm'

export const metadata = { title: 'Create account' }

export default function SignupPage() {
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Create your PM Hub account</h2>
        <p className="text-sm text-muted">
          We&apos;ll set up your workspace after you verify your email. Already have an account?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
          .
        </p>
      </div>
      <MagicLinkForm helperText="No password needed. We'll set up your workspace on the next step." />
    </div>
  )
}
