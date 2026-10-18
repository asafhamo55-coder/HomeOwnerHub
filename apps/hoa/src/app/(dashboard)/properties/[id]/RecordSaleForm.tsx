'use client'

import { Plus, Trash2 } from 'lucide-react'
import { Alert, Button, Checkbox, ChoiceGroup, Field, Fieldset, Input, Radio, Textarea } from '@homeowner-portal/ui'
import { formatDay, usd } from '@/lib/money/format'
import { MAX_BUYERS } from '@/lib/properties/sale-rules'
import { addBuyer, removeBuyer, sharesTotal, updateBuyer, type SaleDraft } from '@/lib/properties/sale-form'

/**
 * The "Record a sale" form body (P3). Controlled: the dialog owns the
 * draft and the errors, so this renders the same from a test fixture as
 * in the app. Field error keys match the server's (sale-rules.ts).
 */
export interface RecordSaleFormProps {
  formId: string
  draft: SaleDraft
  onChange: (next: SaleDraft) => void
  onSubmit: () => void
  /** The association's today; the latest allowed settlement date. */
  today: string
  /** Current owners' display names (the sellers); empty = none on file. */
  sellers: string[]
  /** The home's open balance; null = couldn't load. */
  balance: number | null
  /** Tenants listed or on an active lease: asks whether they stay. */
  tenantCount: number
  fieldErrors: Record<string, string>
  error: string | null
  pending: boolean
}

export function RecordSaleForm(props: RecordSaleFormProps) {
  const { formId, draft, onChange, onSubmit, today, sellers, balance, tenantCount, fieldErrors: fe, error, pending } = props
  const several = draft.buyers.length > 1
  const total = sharesTotal(draft)
  const sellerText = sellers.length === 0 ? 'The current owner' : sellers.length === 1 ? sellers[0]! : `${sellers.slice(0, -1).join(', ')} and ${sellers[sellers.length - 1]}`

  return (
    <form
      id={formId}
      noValidate
      aria-busy={pending}
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      {error ? (
        <Alert variant="error" title="Couldn’t record the sale">
          {error}
        </Alert>
      ) : null}

      <Field
        label="Settlement date"
        required
        error={fe.settlementDate}
        hint="The day the deed transferred. Today or earlier — access changes the moment you confirm."
      >
        <Input type="date" value={draft.settlementDate} max={today} onChange={(e) => onChange({ ...draft, settlementDate: e.currentTarget.value })} disabled={pending} className="sm:max-w-48" />
      </Field>

      <Fieldset
        legend={several ? `Buyers (${draft.buyers.length})` : 'Buyer'}
        hint={several ? 'Shares are each buyer’s ownership percentage; they add up to 100%.' : 'Add co-buyers below.'}
        error={fe.buyers}
      >
        <ol className="space-y-4">
          {draft.buyers.map((b, i) => {
            const k = (f: string) => fe[`buyers.${i}.${f}`]
            return (
              <li key={b.key} className="rounded-lg border border-border bg-subtle/40 p-3.5 sm:p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {several ? `Buyer ${i + 1}` : 'New owner'}
                    {i === 0 ? <span className="ml-2 text-xs font-normal text-muted">Primary — notices and dues go here</span> : null}
                  </p>
                  {several ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove buyer ${i + 1}`}
                      icon={<Trash2 aria-hidden />}
                      onClick={() => onChange(removeBuyer(draft, b.key))}
                      disabled={pending}
                    />
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Full name" required error={k('name')}>
                    <Input value={b.name} autoComplete="off" onChange={(e) => onChange(updateBuyer(draft, b.key, { name: e.currentTarget.value }))} disabled={pending} />
                  </Field>
                  {several ? (
                    <Field label="Share" required error={k('pct')} hint="Percent">
                      <Input inputMode="decimal" value={b.pct} onChange={(e) => onChange(updateBuyer(draft, b.key, { pct: e.currentTarget.value }))} disabled={pending} className="sm:max-w-28" />
                    </Field>
                  ) : null}
                  <Field label="Email" optional error={k('email')}>
                    <Input type="email" value={b.email} placeholder="name@example.com" autoComplete="off" onChange={(e) => onChange(updateBuyer(draft, b.key, { email: e.currentTarget.value }))} disabled={pending} />
                  </Field>
                  <Field label="Phone" optional error={k('phone')}>
                    <Input type="tel" value={b.phone} placeholder="(555) 555-5555" autoComplete="off" onChange={(e) => onChange(updateBuyer(draft, b.key, { phone: e.currentTarget.value }))} disabled={pending} />
                  </Field>
                  <Field
                    label="Mailing address"
                    optional
                    error={k('mailingAddress')}
                    hint="Only if mail should go somewhere other than this home."
                    className="sm:col-span-2"
                  >
                    <Textarea rows={2} value={b.mailingAddress} onChange={(e) => onChange(updateBuyer(draft, b.key, { mailingAddress: e.currentTarget.value }))} disabled={pending} />
                  </Field>
                </div>
              </li>
            )
          })}
        </ol>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {draft.buyers.length < MAX_BUYERS ? (
            <Button type="button" variant="ghost" size="sm" icon={<Plus aria-hidden />} onClick={() => onChange(addBuyer(draft))} disabled={pending}>
              Add a co-buyer
            </Button>
          ) : (
            <span className="text-xs text-muted">Up to {MAX_BUYERS} buyers.</span>
          )}
          {several ? (
            <span className={total === 100 ? 'num text-xs text-muted' : 'num text-xs font-medium text-danger'} aria-live="polite">
              Shares add up to {total}%
            </span>
          ) : null}
        </div>
      </Fieldset>

      {tenantCount > 0 ? (
        <Fieldset
          legend={`Do the tenants stay? (${tenantCount} on file)`}
          hint="If they leave, their leases end and they move out on the settlement date."
          error={fe.carryTenants}
        >
          <ChoiceGroup>
            <Radio
              name={`${formId}-tenants`}
              label="Yes — the tenants and their leases carry over to the buyer"
              checked={draft.carryTenants === true}
              onChange={() => onChange({ ...draft, carryTenants: true })}
              disabled={pending}
            />
            <Radio
              name={`${formId}-tenants`}
              label="No — they move out at settlement"
              description="Tenure goes back to “Unknown” for you to set."
              checked={draft.carryTenants === false}
              onChange={() => onChange({ ...draft, carryTenants: false })}
              disabled={pending}
            />
          </ChoiceGroup>
        </Fieldset>
      ) : null}

      <Checkbox
        label="Add the buyers to the household list"
        description="So notices reach them and you can invite them to the portal. No email is sent now."
        checked={draft.addBuyersAsResidents}
        onChange={(e) => onChange({ ...draft, addBuyersAsResidents: e.currentTarget.checked })}
        disabled={pending}
      />

      <section aria-labelledby={`${formId}-what`} className="rounded-lg border border-border bg-surface p-3.5 text-sm sm:p-4">
        <h3 id={`${formId}-what`} className="mb-2 font-medium text-foreground">
          When you confirm
        </h3>
        <ul className="list-disc space-y-1.5 pl-5 text-foreground-secondary">
          <li>
            {sellerText} {sellers.length > 1 ? 'become previous owners' : 'becomes a previous owner'}
            {draft.settlementDate ? ` on ${formatDay(draft.settlementDate)}` : ''}, and their portal access to this home ends.
          </li>
          <li>{sellers.length > 1 ? 'They' : 'The seller'} and their household move out of the household list. History is kept.</li>
          <li>
            {balance === null
              ? 'The balance stays with the home.'
              : balance > 0
                ? `The ${usd(balance)} balance stays with the home — it isn’t cleared or moved.`
                : 'The home has no open balance. Future charges bill the new owner.'}{' '}
            The buyer’s portal shows charges from the settlement date on; the board keeps the full ledger.
          </li>
        </ul>
      </section>
    </form>
  )
}
