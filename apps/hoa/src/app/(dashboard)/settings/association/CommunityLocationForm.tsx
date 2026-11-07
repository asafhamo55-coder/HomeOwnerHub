'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, useToast } from '@homeowner-portal/ui'
import { saveCommunityLocation } from '@/lib/association-location-actions'
import { COMMUNITY_LOCATION_HELP } from '@/lib/association-location'

/** The community's city and ZIP, set once, so street-only home addresses can be found on the map. */
export function CommunityLocationForm({
  associationId,
  associationName,
  initialCity,
  initialZip,
}: {
  associationId: string
  associationName: string
  initialCity: string
  initialZip: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const [city, setCity] = useState(initialCity)
  const [zip, setZip] = useState(initialZip)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    start(async () => {
      const res = await saveCommunityLocation({ associationId, city, zip })
      if (res.ok) {
        toast({ tone: 'success', message: 'Location saved.' })
        router.refresh()
        return
      }
      setError(res.error)
      setFieldErrors(res.fieldErrors ?? {})
    })
  }

  return (
    <Card id="community-location">
      <CardHeader>
        <CardTitle>Where the community is · {associationName}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <p className="text-sm text-muted">{COMMUNITY_LOCATION_HELP}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="City" error={fieldErrors.city}>
              <Input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} disabled={pending} autoComplete="address-level2" className="min-h-11" />
            </Field>
            <Field label="ZIP code" error={fieldErrors.zip}>
              <Input
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                maxLength={10}
                inputMode="numeric"
                disabled={pending}
                autoComplete="postal-code"
                className="min-h-11"
              />
            </Field>
          </div>
          {error ? (
            <Alert variant="error" title="Couldn’t save">
              {error}
            </Alert>
          ) : null}
          <Button type="submit" size="lg" loading={pending}>
            Save location
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
