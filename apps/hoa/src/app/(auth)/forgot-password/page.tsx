import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { AuthHeader } from '@/components/auth/AuthShell'
import { ForgotPasswordForm } from './ForgotPasswordForm'

export const metadata = { title: 'Reset password' }

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeader
        title="Reset your password"
        description="Enter the email you sign in with and we’ll send you a link to choose a new password."
      />
      <ForgotPasswordForm />
      <p className="mt-6 border-t border-border pt-4 text-center text-sm">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to sign in
        </Link>
      </p>
    </>
  )
}
