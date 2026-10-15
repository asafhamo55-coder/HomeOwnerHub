import Link from 'next/link'
import { Mail } from 'lucide-react'

export const metadata = { title: 'Check your email' }

export default function VerifyPage() {
  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary-subtle text-primary">
        <Mail className="size-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Check your email</h1>
        <p className="text-sm text-muted">
          Open the magic link we sent you to finish signing in.
        </p>
      </div>
      <p className="text-xs text-muted">
        Wrong email?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Start over
        </Link>
        .
      </p>
    </div>
  )
}
