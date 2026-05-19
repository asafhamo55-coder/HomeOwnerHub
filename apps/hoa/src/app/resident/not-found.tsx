import Link from 'next/link'
import { FileQuestion } from 'lucide-react'
import { Button, Card, CardContent } from '@homeowner-portal/ui'

export default function ResidentNotFound() {
  return (
    <div className="mx-auto max-w-xl py-12">
      <Card variant="elevated">
        <CardContent className="space-y-4 p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted/20 text-muted">
            <FileQuestion className="h-6 w-6" aria-hidden />
          </div>
          <div className="space-y-1">
            <h2>Page not found</h2>
            <p className="text-sm text-muted">
              The resident page you were looking for doesn't exist.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button asChild>
              <Link href="/resident">Back to My Home</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
