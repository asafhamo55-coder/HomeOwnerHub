'use client'

import { useEffect, useState, useTransition } from 'react'
import { Plus, Search } from 'lucide-react'
import { Alert, Button, Field, Input } from '@homeowner-portal/ui'
import {
  searchVendors,
  assignThreadToVendor,
  unassignThreadVendor,
  type VendorOption,
} from '@/lib/inbox/vendor/actions'
import { QuickCreateVendorModal } from './QuickCreateVendorModal'

interface Props {
  threadId: string
  senderEmail: string | null
  senderName: string | null
}

/**
 * Type-ahead over existing vendors, modeled on AssignPropertyForm.
 *
 * The "create new" affordance appears ONLY after a search has actually run
 * and returned nothing. Searching first is what stops a second vendor row
 * being created for a company already on file — the cheapest duplicate
 * prevention available, and the reason the create button is gated rather
 * than always visible.
 */
export function AssignVendorForm({ threadId, senderEmail, senderName }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<VendorOption[]>([])
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [searchPending, startSearch] = useTransition()
  const [assignPending, startAssign] = useTransition()

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      setSearched(false)
      return
    }
    const handle = setTimeout(() => {
      startSearch(async () => {
        setResults(await searchVendors(query))
        setSearched(true)
      })
    }, 250)
    return () => clearTimeout(handle)
  }, [query])

  function assign(vendorId: string) {
    setError(null)
    startAssign(async () => {
      const result = await assignThreadToVendor(threadId, vendorId)
      if ('error' in result) setError(result.error)
    })
  }

  const noMatches = searched && !searchPending && results.length === 0

  return (
    <div className="space-y-3">
      <Field label="File under vendor">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search vendors by name or email…"
          prefix={<Search aria-hidden />}
          autoComplete="off"
        />
      </Field>

      {results.length > 0 ? (
        <ul
          aria-label="Matching vendors"
          className="max-h-44 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-surface"
        >
          {results.map((vendor) => (
            <li key={vendor.vendorId}>
              <button
                type="button"
                disabled={assignPending}
                onClick={() => assign(vendor.vendorId)}
                className="block w-full px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none disabled:opacity-50"
              >
                {vendor.legalName}
                {vendor.incomplete ? <span className="text-xs text-warning"> — setup incomplete</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {noMatches ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">No matching vendors.</p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setModalOpen(true)}
            icon={<Plus aria-hidden />}
            className="w-full"
          >
            Create new vendor
          </Button>
        </div>
      ) : null}

      {error ? <Alert variant="error">{error}</Alert> : null}

      {/* Mounted only while open: mounting starts the signature extraction
          (a model call), which must not run on every thread view. */}
      {modalOpen ? (
        <QuickCreateVendorModal
          threadId={threadId}
          senderEmail={senderEmail}
          senderName={senderName}
          initialName={query}
          onClose={() => setModalOpen(false)}
        />
      ) : null}
    </div>
  )
}

export function UnassignVendorButton({ threadId }: { threadId: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        onClick={() =>
          start(async () => {
            const result = await unassignThreadVendor(threadId)
            if ('error' in result) setError(result.error)
          })
        }
      >
        Unfile vendor
      </Button>
      {error ? <Alert variant="error">{error}</Alert> : null}
    </>
  )
}
