'use client'

import * as React from 'react'
import { Download } from 'lucide-react'
import { Alert, Button } from '@homeowner-portal/ui'
import { responseErrorMessage } from '@/lib/api/client'

/**
 * A file export from an /api route (BL-115 activity log, BL-116 motion
 * log). Fetches rather than links, so a refusal (403, too many rows, a
 * failed audit write) shows the server's message here instead of a
 * browser download of a JSON error. Same pattern as the data export's
 * DownloadAllDataButton.
 */
export function ExportDownloadButton({
  url,
  label,
  fallbackName,
  variant = 'secondary',
}: {
  url: string
  label: string
  fallbackName: string
  variant?: 'primary' | 'secondary'
}) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function download() {
    setBusy(true)
    setError(null)
    let res: Response
    try {
      res = await fetch(url, { cache: 'no-store' })
    } catch {
      setError('The export could not be started. Check your connection and try again.')
      setBusy(false)
      return
    }
    if (!res.ok) {
      setError(await responseErrorMessage(res, 'The export could not be started. Try again.'))
      setBusy(false)
      return
    }
    try {
      const blob = await res.blob()
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(href), 10_000)
    } catch {
      setError('The download stopped before it finished, so no file was saved. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <Button variant={variant} onClick={download} loading={busy} icon={<Download aria-hidden />}>
        {busy ? 'Preparing download…' : label}
      </Button>
      {error ? (
        <Alert variant="error" title="Download failed">
          {error}
        </Alert>
      ) : null}
    </div>
  )
}
