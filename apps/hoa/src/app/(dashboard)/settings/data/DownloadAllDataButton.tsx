'use client'

import * as React from 'react'
import { Download } from 'lucide-react'
import { Alert, Button } from '@homeowner-portal/ui'
import { responseErrorMessage } from '@/lib/api/client'

const EXPORT_URL = '/api/settings/data-export'

/**
 * Fetches the export rather than linking to it, so a refusal (403, a
 * failed audit write) or a read that fails mid-archive shows a readable
 * message here instead of a browser download of an error page or a
 * truncated zip.
 */
export function DownloadAllDataButton() {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function download() {
    setBusy(true)
    setError(null)
    let res: Response
    try {
      res = await fetch(EXPORT_URL, { cache: 'no-store' })
    } catch {
      setError('The export could not be started. Check your connection and try again.')
      setBusy(false)
      return
    }
    if (!res.ok) {
      // RC-1 envelope { error: { code, message } }: show the server's message.
      setError(await responseErrorMessage(res, 'The export could not be started. Try again.'))
      setBusy(false)
      return
    }
    try {
      const blob = await res.blob()
      const name =
        /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'association-data.zip'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch {
      setError('The download stopped before it finished, so no file was saved. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <Button onClick={download} loading={busy} icon={<Download aria-hidden />}>
        {busy ? 'Preparing download…' : 'Download all data'}
      </Button>
      {error ? (
        <Alert variant="error" title="Download failed">
          {error}
        </Alert>
      ) : null}
    </div>
  )
}
