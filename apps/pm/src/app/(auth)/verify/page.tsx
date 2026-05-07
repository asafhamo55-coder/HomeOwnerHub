import Link from 'next/link'
import { Mail } from 'lucide-react'

export const metadata = { title: 'Check your email' }

export default function VerifyPage() {
  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Mail className="h-6 w-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-muted">Check your email</h2>
        <p className="text-sm text-muted-fg">
          Open the magic link we sent you to finish signing in.
        </p>
      </div>
      <p className="text-xs text-muted-fg">
        Wrong email?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Start over
        </Link>
        .
      </p>
    </div>
  )
}
