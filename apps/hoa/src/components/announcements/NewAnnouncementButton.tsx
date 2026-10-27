import Link from 'next/link'
import { Megaphone } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'

/**
 * BL-173: the one prominent way into "New announcement" (the occasion grid).
 * Used on the dashboard and at the top of Messages.
 */
export function NewAnnouncementButton({ size = 'md', href = '/communications/announce' }: { size?: 'md' | 'lg'; href?: string }) {
  return (
    <Button asChild size={size} icon={<Megaphone aria-hidden />}>
      <Link href={href}>New announcement</Link>
    </Button>
  )
}
