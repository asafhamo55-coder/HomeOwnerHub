'use client'

import * as React from 'react'
import { Download } from 'lucide-react'
import { Button, useToast } from '@homeowner-portal/ui'
import { responseErrorMessage } from '@/lib/api/client'

/**
 * Fetches the board packet PDF rather than linking to it, so a refusal
 * (403), an unknown period (404) or a failed report read (500) shows the
 * envelope's message in a toast instead of a browser tab of raw JSON.
 */
export function BoardPacketButton({ periodId }: { periodId: string }) {
  const toast = useToast()
  const [busy, setBusy] = React.useState(false)

  async function download() {
    setBusy(true)
    try {
      const res = await fetch(`/api/accounting/board-packet/${encodeURIComponent(periodId)}`, { cache: 'no-store' })
      if (!res.ok) {
        const message = await responseErrorMessage(res, 'The board packet could not be generated. Try again.')
        toast({ tone: 'error', title: 'Couldn’t download the board packet', message })
        return
      }
      const blob = await res.blob()
      const name =
        /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'board-packet.pdf'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch {
      toast({
        tone: 'error',
        title: 'Couldn’t download the board packet',
        message: 'The download stopped before it finished, so no file was saved. Try again.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button onClick={download} variant="ghost" size="sm" loading={busy} icon={<Download aria-hidden />}>
      Board packet
    </Button>
  )
}
