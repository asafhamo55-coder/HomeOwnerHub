# Editing resident details from the inbox rail

**Date:** 2026-08-02
**Status:** Approved design, not yet planned
**Scope:** HOA app, inbox module + property-residents

## Problem

A resident writes in from an address the association doesn't have on file, or
with a corrected phone number. The manager is looking straight at the
evidence in the shared inbox, but the rail is read-only — fixing the record
means leaving the thread, finding the property, and editing there.

## What this delivers

Edit an existing resident's **name, email, and phone** from the inbox right
rail, with the change reflected on the property page, and with an email
change actually redirecting that resident's future mail.

## What already exists

This feature is smaller than it looks. Most of the write path is built.

| Capability | Where |
|---|---|
| `updateResident(residentId, partial)` accepting name/email/phone | `apps/hoa/src/lib/property-residents.ts:193` |
| Inline resident edit form (pencil toggle, `useTransition`, toast, `router.refresh()`) | `apps/hoa/src/app/(dashboard)/properties/[id]/ResidentRow.tsx` |
| Property-event logging | `apps/hoa/src/lib/property-events.ts:51` (`logPropertyEvent`) |
| Role-check convention for a mutating action | `apps/hoa/src/lib/properties/index.ts:115-118` (`getCurrentUserRoleInOrg`) |

"Reflected in the property" is therefore close to free: `property_residents`
**is** the property's resident list, and the property page already renders and
edits it. The work is surfacing it in the rail, plus the two correctness
problems below.

## Decisions

| Decision | Choice |
|---|---|
| Scope | Edit existing fields only — no add, no move-out, no re-filing |
| Editable fields | `full_name`, `email`, `phone` |
| Email change | Repoint the sender alias in the same operation |
| Other copies of the email | Deliberately NOT synced; warn instead |
| Authorization | New action is board/admin; `updateResident` gains the same check |
| Audit | Log a `note` event for email changes only |
| UI form | Inline, not modal |

## Problem 1 — a stale alias outranks the corrected email

`inbox_sender_aliases` (`migrations/0029_inbox.sql:182-195`, unique on
`(organization_id, lower(email_address))` per `migrations/0033_inbox_sender_alias_uniq.sql:45-52`)
maps a literal sender address to a unit. It is written only by
`assignThreadToProperty` (`apps/hoa/src/lib/inbox/actions.ts:239-251`) behind
the "remember this sender" checkbox, and read only by `match.ts:352-365`.

The alias rule fires at **higher precedence** than the resident-email rule —
`match.ts:145` before `match.ts:157`, both `high` confidence. So after an
email is corrected from A to B:

- mail from A keeps auto-filing via the stale alias, at high confidence
- nothing in the repo ever invalidates that alias

Editing the email without touching the alias would therefore fail to deliver
the thing the feature exists for. **This is the central requirement, not an
edge case.**

### Resolution

When `email` changes, in the same action:

1. `DELETE` the alias row for the old address, org-scoped.
2. `UPSERT` an alias for the new address carrying the same `unit_id` and
   `resident_id`, with `onConflict: 'organization_id,email_address_lower'`.

Deleting alone would be sufficient for correctness — the resident-email rule
would then match B — but the upsert preserves high-confidence filing
continuity from the first message at the new address.

`assignThreadToProperty` never populates `inbox_sender_aliases.resident_id`
(it is always NULL today), so this becomes the first writer to set it. That
is a small improvement, not a behavior change: the column is read at
`match.ts:365` and flows into `outcome.residentId`.

If the resident has **no** existing alias, only the upsert runs. An alias is
not required for the edit to succeed.

## Problem 2 — no authorization on the existing action

`updateResident` performs **no role check**. Its RLS policy
(`migrations/0017_leases_and_property_360.sql:152-164`) is:

```sql
CREATE POLICY org_access ON public.property_residents
  USING (organization_id = ANY (public.auth_org_ids()));
```

`FOR ALL` with no `WITH CHECK`, so Postgres reuses `USING` as the check —
**any org member, including `role='resident'`, can update any resident row in
their org.** Contrast `updateProperty`, which rejects non-admin/board at
`apps/hoa/src/lib/properties/index.ts:115-118`.

### Resolution

- The new inbox action calls `requireBoardOrAdmin()`, matching how the whole
  inbox is already gated at the RLS layer.
- `updateResident` gains the same `getCurrentUserRoleInOrg` check
  `updateProperty` uses, which closes the property page's path too.

**Not** tightening the RLS policy in this pass. That is a migration with a
real blast radius — the resident portal and the invite flow both touch these
rows, and neither was audited here. After this change no application path
lets a resident write, which is the reachable exposure. The policy remains a
known gap, recorded here.

## What is deliberately NOT synced

A resident's contact details are duplicated across five tables. This feature
writes exactly one, and says so in the UI rather than cascading silently:

| Copy | Consequence of divergence |
|---|---|
| `hoa_properties.owner_email` | Still matches the old address at lower priority (`resolve.ts:246`) |
| `ownerships.owner_email`, `tenancies.tenant_email` | Default communications audiences keep mailing the old address (`communications/audience.ts:192,197`) |
| `profiles.email` / `auth.users` | Resident portal unit resolution can stop matching (`apps/hoa/src/lib/resident.ts:120-133`) |

Syncing these is a multi-table cascade touching billing and portal access. It
deserves its own decision, not a ride-along on a rail edit.

The form therefore shows a brief, specific note when the email field is
changed — naming portal access and mailing lists — rather than a vague
warning or silence.

## Data model

**No migration.** Every table and column already exists.

`PropertyContext['residents']` is widened. Today
(`apps/hoa/src/lib/inbox/queries.ts:553`):

```ts
residents: Array<{ name: string; role: string; email: string | null }>
```

becomes:

```ts
residents: Array<{
  id: string
  name: string
  role: string
  email: string | null
  phone: string | null
}>
```

with `id` and `phone` added to the select at `queries.ts:711-716` and the
mapping at `queries.ts:880-884`. `id` is required — a row that cannot be
identified cannot be edited. The existing filters
(`.eq('organization_id').eq('property_id').is('moved_out_at', null).is('deleted_at', null)`)
are unchanged, so moved-out and soft-deleted residents stay out of the rail
and thus uneditable from it.

## Server action

`apps/hoa/src/lib/inbox/resident/actions.ts`:

```
updateResidentFromInbox(
  threadId: string,
  residentId: string,
  fields: { fullName: string; email: string | null; phone: string | null },
): Promise<{ ok: true } | { error: string }>
```

### Two different property ids — read this first

This action juggles two ids that both look like "the property":

- `inbox_threads.unit_id` → `units.id`. **The `/properties/[id]` route is
  keyed by this** (`PropertyRail.tsx:155` links to
  `/properties/${thread.unitId}`).
- `units.legacy_hoa_property_id` → `hoa_properties.id`. **`property_residents.property_id`
  is this one**, not the unit id (`queries.ts:691,704`).

So the ownership check resolves unit → legacy id, while the revalidation uses
the unit id. Mixing them up yields either a check that never matches or a
revalidation that refreshes nothing.

### Order of operations

1. `requireBoardOrAdmin()`.
2. Load the thread org-scoped; resolve its `unit_id`, then that unit's
   `legacy_hoa_property_id`.
3. Load the resident org-scoped **and** assert its `property_id` equals that
   legacy id. Both ends are verified — a `residentId` arriving from a form
   cannot be trusted to belong to this org or to this thread's property. Same
   hazard `linkThreadToResource` had to be patched for.
4. Read the current `email` before writing, so the alias step and the audit
   payload know the old value.
5. Update `property_residents`, org-scoped.
6. If the email changed, repoint the alias (Problem 1).
7. If the email changed, `logPropertyEvent`.
8. `revalidatePath('/inbox/' + threadId)` and
   `revalidatePath('/properties/' + unitId)` — note **unit** id, per above.

Step 8 is what satisfies "reflected in the property".

### Why this writes directly instead of calling `updateResident`

`updateResident` is not reused, for three reasons: it does not return the
previous email (step 4 needs it for both the alias and the audit payload), it
revalidates only `/properties/[id]` and nothing under `/inbox`
(`property-residents.ts:260`), and it resolves the property from the resident
row rather than verifying it against the thread. Threading those through it
would distort a function the property page depends on.

`updateResident` is still hardened with the role check (Problem 2) — that
fixes the property page's own exposure, independently of this action.

A consequence left standing: an edit made on the **property page** still does
not refresh an open inbox thread, because `updateResident` revalidates no
`/inbox` path. Listed under Deferred.

**Never log an email address, subject, or body.** `PostgrestError.code` and
`.message` only, never `.details`.

## Audit

Contact edits log nothing today, deliberately — `property-residents.ts:233-240`:

> *"Only log on the changes that materially change the resident's relationship to the property — name/contact tweaks aren't history-worthy."*

That reasoning predates the email being load-bearing for mail routing. An
email change now silently redirects a resident's incoming mail and rewrites a
matching alias, which is precisely the kind of change a board needs to be
able to reconstruct. So:

- **Email change** → `logPropertyEvent({ kind: 'note', payload: { field: 'email', from, to, alias_repointed: boolean }, notes: 'Resident email updated from the inbox' })`
- **Name or phone only** → no event, matching the existing bar

`kind` is the existing enum `public.property_event_kind`
(`migrations/0017_leases_and_property_360.sql:112-124`); `note` is already used
for a role change at `property-residents.ts:243`. No new enum value.

`logPropertyEvent` resolves `organization_id` from `getCurrentOrg()`, so it
must be called from the request context — which this action is.

## UI

`PropertyRail.tsx` is a server component and renders residents as one joined
string (`PropertyRail.tsx:65`):

```tsx
context.residents.map((r) => `${r.name} (${r.role})`).join(' · ')
```

That becomes a list, one row per resident, each a client component with a
pencil toggle into an inline form over name / email / phone.

The pattern is copied from `ResidentRow.tsx`, the established convention for
this record type: controlled `useState` per field, `useTransition`, local
error state, `useToast` on success, `router.refresh()`. **Not** a modal —
`packages/ui` exports no `Dialog`/`Modal`/`Sheet` (only the confirm-only
`Confirm.tsx`, which cannot host children).

The degraded case is preserved: `getPropertyContext` pushes `'residents'` onto
`degraded` on failure, and the rail already renders that as "Residents
couldn't load" rather than an empty list. An unloadable resident list must not
render as an editable empty list.

## Error handling

- A resident that fails the org/property ownership check returns
  `'Resident not found.'` — the same shape the vendor actions use, revealing
  nothing about other tenants.
- An alias repoint failure after a successful resident update **does not**
  fail the action. The record is corrected and that is the user's primary
  intent; the failure is logged and the response carries a warning that
  future mail may still file to the old address. Rolling back a correct edit
  because a secondary index write failed would be the worse trade.
- The audit write is best-effort and logged on failure, never fatal.

## Testing

Pure and mocked-Supabase, per the root harness's constraints
(`vitest.config.ts`: pure modules only; mock `@/lib/auth` and
`@/lib/supabase/server` as `lib/inbox/draft/actions.test.ts` does):

- A `residentId` belonging to another org is refused, and the refusal comes
  from an org-scoped query (assert the `.eq('organization_id', …)` filter, so
  deleting it fails the test).
- A `residentId` belonging to a different property than the thread's is
  refused.
- Changing the email deletes the old alias and upserts the new one.
- Changing only name/phone leaves `inbox_sender_aliases` **untouched**.
- Changing only name/phone logs no property event.
- Changing the email logs a `note` event whose payload carries `from` and `to`.
- A caller whose role is `resident` is rejected.
- An alias-repoint failure still returns success, with a warning.

## Deferred

- **Syncing the other four copies** of a resident's contact details.
- **Tightening the `property_residents` RLS policy** to a read-for-org /
  write-for-board-or-admin split, as migration 0012 did for vendors.
- **`updateResident` revalidating `/inbox`**, so a property-page edit
  refreshes an open thread.
- **Adding or removing residents** from the rail.
- **Re-pointing `inbox_threads.resident_id`** when the matcher picked the
  wrong person. Note that column currently has no readers anywhere in the
  codebase, and `assignThreadToProperty` leaves it stale after a manual
  re-assign — a pre-existing issue, not one this feature introduces.
