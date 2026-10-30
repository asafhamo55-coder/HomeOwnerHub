import * as React from 'react'
import Link from 'next/link'
import { Compass } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'
import { AuthShell, AuthPanel, AuthHeader } from '@/components/auth/AuthShell'

export const metadata = { title: 'Page not found' }

/**
 * App-wide fallback for any URL outside the (dashboard), resident and admin
 * trees, which keep their own scoped not-found pages. It fetches nothing so
 * it renders for signed-out visitors too.
 */
export default function NotFound() {
  return (
    <AuthShell split>
      <AuthPanel>
        <AuthHeader
          icon={<Compass />}
          title="We couldn't find that page."
          description="The address may be mistyped, or the page may have moved. Links in old emails can also expire. If you followed an invite or join link, ask your board to send a new one."
        />
        <div className="flex flex-col gap-2">
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Go to your dashboard</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/help">Help</Link>
          </Button>
        </div>
      </AuthPanel>
    </AuthShell>
  )
}
