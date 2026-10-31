'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Trash2 } from 'lucide-react'
import { Button, useConfirm, useToast } from '@homeowner-portal/ui'
import { addSampleCommunity, removeSampleData } from '@/lib/sample-community/actions'

/** "Try it with a sample community": fills the org with marked sample data. */
export function AddSampleButton() {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="secondary"
      icon={<Sparkles />}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await addSampleCommunity()
          if (!res.ok) {
            toast({ tone: 'error', title: 'Couldn’t add the sample community', message: res.error })
            return
          }
          toast({ tone: 'success', message: res.message })
          router.refresh()
        })
      }
    >
      Try it with a sample community
    </Button>
  )
}

/** "Remove sample data": deletes exactly the rows the sample fill made. */
export function RemoveSampleButton() {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  async function handleClick() {
    const ok = await confirm({
      title: 'Remove the sample data?',
      description:
        'The sample homes, dues, violations, requests, announcement and meeting are deleted. Anything you added yourself stays.',
      confirmLabel: 'Remove sample data',
      destructive: true,
    })
    if (!ok) return
    startTransition(async () => {
      const res = await removeSampleData()
      if (!res.ok) {
        toast({ tone: 'error', title: 'Couldn’t remove the sample data', message: res.error })
        return
      }
      toast({ tone: 'success', message: res.message })
      router.refresh()
    })
  }

  return (
    <Button variant="secondary" size="sm" icon={<Trash2 />} loading={pending} onClick={handleClick}>
      Remove sample data
    </Button>
  )
}
