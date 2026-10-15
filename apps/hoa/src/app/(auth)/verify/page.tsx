import Link from 'next/link'
import { MailCheck } from 'lucide-react'
import { AuthHeader } from '@/components/auth/AuthShell'

export const metadata = { title: 'Check your email' }

// Plain status page. Users land here only when they hit /verify directly
// (e.g. bookmark), since the magic-link form shows its own success state
// inline. The actual code exchange happens at /auth/callback.
export default function VerifyPage() {
  return (
    <>
      <AuthHeader
        icon={<MailCheck />}
        title="Check your email"
        description="Open the link we sent you to finish signing in. It works once, on the device you open it on."
      />
      <ul className="space-y-2 rounded-lg bg-subtle p-4 text-sm text-foreground-secondary">
        <li>Nothing after a minute? Check your spam or promotions folder.</li>
        <li>Links expire — if yours has, request a new one.</li>
      </ul>
      <p className="mt-6 border-t border-border pt-4 text-center text-sm text-muted">
        Wrong email?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Start over
        </Link>
      </p>
    </>
  )
}
