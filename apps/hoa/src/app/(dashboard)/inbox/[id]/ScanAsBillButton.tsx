'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Receipt } from 'lucide-react'
import { Alert, Button, Dialog, DialogContent, DialogTrigger } from '@homeowner-portal/ui'
import { scanAttachmentAsBill, type ScanAttachmentResult } from '@/lib/inbox/attachment-bill'

/**
 * BL-059 — "Scan as a bill" on a stored PDF or photo attachment. The AI
 * reads the file into a bill proposal in /approvals; nothing is entered or
 * paid until a board member approves it there. The action gates, checks
 * the file and draws on the AI limit; this is only the dialog.
 */
export function ScanAsBillButton({
  attachmentId,
  fileName,
}: {
  attachmentId: string
  /** Display only — never logged. */
  fileName: string
}) {
  const [result, setResult] = useState<ScanAttachmentResult | null>(null)
  const [pending, startTransition] = useTransition()

  const scan = () =>
    startTransition(async () => {
      try {
        setResult(await scanAttachmentAsBill(attachmentId))
      } catch {
        setResult({ ok: false, error: 'Couldn’t scan this bill. Try again, or enter it by hand.' })
      }
    })

  return (
    <Dialog
      onOpenChange={(open) => {
        // A failed try is cleared on close; a filed proposal stays shown.
        if (!open) setResult((r) => (r?.ok ? r : null))
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<Receipt aria-hidden />}
          // Starts with the visible text (WCAG 2.5.3 Label in Name).
          aria-label={`Scan as a bill: ${fileName}`}
        >
          Scan as a bill
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Scan as a bill"
        description="AI reads this file and sends a bill to Approvals for the board to check. Nothing is entered or paid until a board member approves it."
      >
        {result?.ok ? (
          <Alert variant="success">
            {result.duplicate
              ? 'This bill is already waiting in Approvals.'
              : result.missing && result.missing.length > 0
                ? `Sent to Approvals — incomplete. Add ${result.missing.join(', ')} with Edit details before approving.`
                : 'Sent to Approvals. Check the details against the bill before approving.'}{' '}
            <Link href="/approvals?type=bill" className="font-medium underline">
              Review in Approvals
            </Link>
          </Alert>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-foreground-secondary">
              Only the file is read, not the email. Anyone can email the association, so check the vendor and amount
              against what you expect before approving.
            </p>
            {result && !result.ok ? <Alert variant="error">{result.error}</Alert> : null}
            <div className="flex justify-end">
              <Button type="button" onClick={scan} loading={pending} icon={<Receipt aria-hidden />}>
                Scan bill
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
