'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Save } from 'lucide-react'
import { Button, Input } from '@homeowner-portal/ui'
import { updateTenant } from '@/lib/platform-admin'

interface Props {
  orgId: string
  initialName: string
  initialPlan: string
  initialDoorsCount: number | null
}

export function EditTenantForm({
  orgId,
  initialName,
  initialPlan,
  initialDoorsCount,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(formData: FormData) {
    setError(null)
    setSuccess(false)
    const name = String(formData.get('name') ?? '').trim()
    const plan = String(formData.get('plan') ?? 'free') as 'free' | 'pro' | 'enterprise'
    const doorsRaw = String(formData.get('doors_count') ?? '').trim()
    const doorsCount = doorsRaw ? Number(doorsRaw.replace(/[^0-9]/g, '')) : null

    startTransition(async () => {
      const result = await updateTenant({ orgId, name, plan, doorsCount })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSuccess(true)
      router.refresh()
    })
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Name</span>
        <Input name="name" required defaultValue={initialName} />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Plan</span>
          <select
            name="plan"
            defaultValue={initialPlan}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Doors / units</span>
          <Input
            name="doors_count"
            inputMode="numeric"
            defaultValue={initialDoorsCount != null ? String(initialDoorsCount) : ''}
          />
        </label>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Saved.
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          <Save className="h-4 w-4" />
          {isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
