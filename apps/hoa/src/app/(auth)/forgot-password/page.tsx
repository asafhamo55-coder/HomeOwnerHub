import Link from 'next/link'
import { ForgotPasswordForm } from './ForgotPasswordForm'

export const metadata = { title: 'Reset password' }

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Reset your password</h2>
        <p className="text-sm text-muted">
          Enter your email and we&apos;ll send you a link to set a new password.{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
          .
        </p>
      </div>
      <ForgotPasswordForm />
    </div>
  )
}
