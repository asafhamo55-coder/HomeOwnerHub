import Link from 'next/link'
import { FileQuestion } from 'lucide-react'
import { Button, Card, CardContent } from '@homeowner-portal/ui'

export default function AdminNotFound() {
  return (
    <div className="mx-auto w-full max-w-xl py-12">
      <Card>
        <CardContent className="space-y-5 p-8 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-subtle text-muted">
            <FileQuestion className="size-6" aria-hidden />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg">Page not found</h1>
            <p className="text-sm text-muted">
              That platform page doesn’t exist, or the tenant it pointed to is gone.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button asChild>
              <Link href="/admin/tenants" className="no-underline">
                All tenants
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/admin" className="no-underline">
                Platform overview
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
