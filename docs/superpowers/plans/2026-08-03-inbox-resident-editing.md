# Inbox Resident Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Edit an existing resident's name, email, and phone from the inbox right rail, reflected on the property page, with an email change actually redirecting that resident's future mail.

**Architecture:** No migration — every table and column exists. Widen the rail's resident data to carry `id` and `phone`, add one org-scoped server action that updates the resident *and* repoints the stale sender alias, and render an inline edit form per resident using the convention already established on the property page.

**Tech Stack:** Next.js 15 App Router (server actions), Supabase/Postgres, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-02-inbox-resident-editing-design.md`

## Global Constraints

- **Never log an email address, subject, or body.** Log `PostgrestError.code`/`.message` only — never `.details`.
- **Two different property ids.** `inbox_threads.unit_id` → `units.id`, and the `/properties/[id]` route is keyed by **this**. `property_residents.property_id` is `units.legacy_hoa_property_id` → `hoa_properties.id`. The ownership check uses the legacy id; the revalidation uses the unit id. Mixing them yields a check that never matches or a revalidation that refreshes nothing.
- **Every server action** calls `requireBoardOrAdmin()` and scopes every query with `.eq('organization_id', org.id)`.
- Supabase generated types lag some tables; the codebase workaround is `.from('table' as never)` plus an explicit row generic — see `apps/hoa/src/lib/property-residents.ts:203`. Use it only where a plain typed call fails.
- Tests run under the root harness (`vitest.config.ts`): **pure modules only**. Server actions are tested by mocking `@/lib/auth` and `@/lib/supabase/server`, per `apps/hoa/src/lib/inbox/draft/actions.test.ts`.
- Run tests with `npx vitest run <path>`. Typecheck with `npx tsc --noEmit -p apps/hoa/tsconfig.json`.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/hoa/src/lib/inbox/queries.ts` | Widen `PropertyContext['residents']` with `id` + `phone` |
| `apps/hoa/src/lib/property-residents.ts` | Add the missing role check to `updateResident` |
| `apps/hoa/src/lib/inbox/resident/actions.ts` | `updateResidentFromInbox` — update + alias repoint + audit |
| `apps/hoa/src/lib/inbox/resident/actions.test.ts` | Action tests (mocked Supabase) |
| `apps/hoa/src/app/(dashboard)/inbox/[id]/ResidentRailRow.tsx` | Client row: read view + inline edit form |
| `apps/hoa/src/app/(dashboard)/inbox/[id]/PropertyRail.tsx` | Render residents as a list instead of a joined string |

---

### Task 1: Widen the rail's resident data

**Files:**
- Modify: `apps/hoa/src/lib/inbox/queries.ts` (type at :553, select at :711-716, mapping at :880-884)

**Interfaces:**
- Consumes: nothing
- Produces: `PropertyContext['residents']` as `Array<{ id: string; name: string; role: string; email: string | null; phone: string | null }>`

A resident row that cannot be identified cannot be edited, so `id` is the load-bearing addition here.

- [ ] **Step 1: Widen the type**

In `apps/hoa/src/lib/inbox/queries.ts`, change the `residents` field of `PropertyContext`:

```typescript
  residents: Array<{
    id: string
    name: string
    role: string
    email: string | null
    phone: string | null
  }>
```

- [ ] **Step 2: Widen the select and its empty-case fallback**

Both branches of the ternary must agree, or the `Promise.all` result type breaks:

```typescript
      legacyId
        ? db
            .from('property_residents')
            .select('id, full_name, role, email, phone')
            .eq('organization_id', orgId)
            .eq('property_id', legacyId)
            .is('moved_out_at', null)
            .is('deleted_at', null)
        : Promise.resolve({
            data: [] as Array<{
              id: string
              full_name: string
              role: string
              email: string | null
              phone: string | null
            }>,
            error: null as PostgrestError | null,
          }),
```

Leave the four existing filters exactly as they are. `moved_out_at IS NULL` and `deleted_at IS NULL` are what keep moved-out and soft-deleted residents out of the rail, and therefore uneditable from it.

- [ ] **Step 3: Widen the mapping**

```typescript
    residents: (residentsData ?? []).map((r) => ({
      id: r.id,
      name: r.full_name,
      role: r.role,
      email: r.email,
      phone: r.phone,
    })),
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p apps/hoa/tsconfig.json`
Expected: No errors found.

If `PropertyRail.tsx` or a test fixture errors on the new required fields, fix those call sites now — do not widen the type back.

- [ ] **Step 5: Run the inbox tests**

Run: `npx vitest run apps/hoa/src/lib/inbox/`
Expected: PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add apps/hoa/src/lib/inbox/queries.ts
git commit -m "feat(inbox): carry resident id and phone into the rail context"
```

---

### Task 2: Close the authorization gap on `updateResident`

**Files:**
- Modify: `apps/hoa/src/lib/property-residents.ts` (`updateResident`, from :193)
- Test: `apps/hoa/src/lib/property-residents.test.ts` (create)

**Interfaces:**
- Consumes: `getCurrentOrg`, `getCurrentUserRoleInOrg` (already imported in this file's neighbours — check the top of `property-residents.ts` and add the import if absent)
- Produces: `updateResident` unchanged in signature, now rejecting non board/admin

`updateResident` performs no role check today, and the RLS policy on `property_residents` is `FOR ALL` with no `WITH CHECK`, so any org member — including `role='resident'` — can update any resident row in their org. `updateProperty` already guards this way; this makes them consistent.

- [ ] **Step 1: Write the failing test**

Create `apps/hoa/src/lib/property-residents.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getCurrentOrgMock = vi.fn(async () => ({ id: 'org-1', name: 'Madison Park' }))
const getRoleMock = vi.fn(async () => 'resident' as string)

vi.mock('@/lib/org', () => ({
  getCurrentOrg: getCurrentOrgMock,
  getCurrentUserRoleInOrg: getRoleMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: vi.fn(() => {
      throw new Error('updateResident must not query before checking the caller role')
    }),
  })),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('./property-events', () => ({ logPropertyEvent: vi.fn(async () => ({ ok: true, id: 'e1' })) }))

import { updateResident } from './property-residents'

beforeEach(() => {
  getRoleMock.mockReset()
})

describe('updateResident authorization', () => {
  it('refuses a caller whose role is resident', async () => {
    getRoleMock.mockResolvedValue('resident')

    const result = await updateResident('res-1', { full_name: 'New Name' })

    expect(result).toEqual({
      ok: false,
      error: "You don't have permission to perform this action.",
    })
  })

  it('refuses before touching the database', async () => {
    getRoleMock.mockResolvedValue('resident')

    // The supabase mock throws if `.from` is reached. A passing test proves
    // the role check runs before any query, not after.
    await expect(updateResident('res-1', { full_name: 'New Name' })).resolves.toMatchObject({
      ok: false,
    })
  })
})
```

**Before running:** open `apps/hoa/src/lib/property-residents.ts` and confirm the real import path for `getCurrentOrg`/`getCurrentUserRoleInOrg` (check what `apps/hoa/src/lib/properties/index.ts` imports them from — it may be `@/lib/org`, `@/lib/auth`, or a relative path). Fix the `vi.mock` path above to match, or the mock silently does nothing.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/hoa/src/lib/property-residents.test.ts`
Expected: FAIL — the resident-role caller is currently allowed through, so either the `.from` mock throws or the result is not the permission error.

- [ ] **Step 3: Add the role check**

In `updateResident`, immediately after the Zod parse and **before** `getSupabaseServerClient()`:

```typescript
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }
  const role = await getCurrentUserRoleInOrg(org.id)
  if (role !== 'admin' && role !== 'board') {
    return { ok: false, error: "You don't have permission to perform this action." }
  }
```

This is copied verbatim from `apps/hoa/src/lib/properties/index.ts:113-118` so the two read identically. Add the imports if the file lacks them.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/hoa/src/lib/property-residents.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Verify the property page still works**

Run: `npx vitest run apps/hoa/src/lib/` and `npx tsc --noEmit -p apps/hoa/tsconfig.json`
Expected: PASS / No errors found.

`ResidentRow.tsx` on the property page calls this action. A board or admin user is unaffected; only a `resident` caller is now refused, which is the intent.

- [ ] **Step 6: Commit**

```bash
git add apps/hoa/src/lib/property-residents.ts apps/hoa/src/lib/property-residents.test.ts
git commit -m "fix(residents): require board or admin to update a resident"
```

---

### Task 3: The inbox action — update, repoint the alias, audit

**Files:**
- Create: `apps/hoa/src/lib/inbox/resident/actions.ts`
- Test: `apps/hoa/src/lib/inbox/resident/actions.test.ts`

**Interfaces:**
- Consumes: `requireBoardOrAdmin` from `@/lib/auth`, `getSupabaseServerClient` from `@/lib/supabase/server`, `logPropertyEvent` from `@/lib/property-events`
- Produces:
  ```
  updateResidentFromInbox(
    threadId: string,
    residentId: string,
    fields: { fullName: string; email: string | null; phone: string | null },
  ): Promise<{ ok: true; warning?: string } | { error: string }>
  ```

The alias repoint is the point of this feature. Without it, correcting an email looks successful and changes nothing about where that resident's mail files — `inbox_sender_aliases` is matched at higher precedence than the resident-email rule (`match.ts:145` before `:157`).

- [ ] **Step 1: Write the failing test**

Create `apps/hoa/src/lib/inbox/resident/actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({
  requireBoardOrAdmin: vi.fn(async () => ({
    role: 'board' as const,
    org: { id: 'org-1', name: 'Madison Park', hub_type: 'hoa', plan: 'pro', doors_count: 120 },
  })),
}))

const logPropertyEventMock = vi.fn(async () => ({ ok: true as const, id: 'evt-1' }))
vi.mock('@/lib/property-events', () => ({ logPropertyEvent: logPropertyEventMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const fromMock = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: fromMock,
  })),
}))

import { updateResidentFromInbox } from './actions'

interface Op {
  table: string
  kind: 'select' | 'update' | 'insert' | 'upsert' | 'delete'
  filters: Record<string, unknown>
  values?: Record<string, unknown>
}

/**
 * Records every operation so a test can assert what did — and did NOT —
 * happen. "The alias is untouched on a name-only edit" is only meaningful
 * if the harness would have recorded a touch.
 */
function harness(opts: {
  thread?: { unit_id: string | null } | null
  unit?: { legacy_hoa_property_id: string | null } | null
  resident?: { id: string; property_id: string; email: string | null } | null
  /** Make every inbox_sender_aliases write fail, to exercise the warning. */
  aliasFails?: boolean
}) {
  const ops: Op[] = []
  /** Filters applied to the property_residents SELECT, for org-scope asserts. */
  const residentSelectFilters: Record<string, unknown> = {}
  const thread = opts.thread === undefined ? { unit_id: 'unit-1' } : opts.thread
  const unit = opts.unit === undefined ? { legacy_hoa_property_id: 'legacy-1' } : opts.unit
  const resident =
    opts.resident === undefined
      ? { id: 'res-1', property_id: 'legacy-1', email: 'old@example.com' }
      : opts.resident

  fromMock.mockImplementation((table: string) => {
    const filters: Record<string, unknown> = {}
    let kind: Op['kind'] = 'select'
    let values: Record<string, unknown> | undefined

    const result = () => {
      if (table === 'inbox_threads') return { data: thread, error: null }
      if (table === 'units') return { data: unit, error: null }
      if (table === 'property_residents') return { data: resident, error: null }
      return { data: null, error: null }
    }

    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      update: vi.fn((v: Record<string, unknown>) => {
        kind = 'update'
        values = v
        return chain
      }),
      upsert: vi.fn((v: Record<string, unknown>) => {
        kind = 'upsert'
        values = v
        ops.push({ table, kind, filters, values })
        return Promise.resolve({
          error: opts.aliasFails ? { code: '23505', message: 'conflict' } : null,
        })
      }),
      delete: vi.fn(() => {
        kind = 'delete'
        return chain
      }),
      eq: vi.fn((column: string, value: unknown) => {
        filters[column] = value
        if (table === 'property_residents' && kind === 'select') {
          residentSelectFilters[column] = value
        }
        if (kind === 'delete') {
          ops.push({ table, kind, filters })
          return Promise.resolve({
            error: opts.aliasFails ? { code: '42501', message: 'denied' } : null,
          })
        }
        return chain
      }),
      maybeSingle: vi.fn(async () => {
        if (kind !== 'select') ops.push({ table, kind, filters, values })
        return result()
      }),
      then: (resolve: (r: unknown) => unknown) => {
        if (kind !== 'select') ops.push({ table, kind, filters, values })
        return Promise.resolve(result()).then(resolve)
      },
    }
    return chain
  })

  return { ops, residentSelectFilters }
}

beforeEach(() => {
  fromMock.mockReset()
  logPropertyEventMock.mockClear()
})

describe('updateResidentFromInbox', () => {
  it('refuses a resident belonging to another org, via an org-scoped lookup', async () => {
    // A cross-org residentId resolves to nothing once the query is scoped.
    const { residentSelectFilters } = harness({ resident: null })

    const result = await updateResidentFromInbox('thread-1', 'res-from-other-org', {
      fullName: 'Raja Nagula',
      email: 'a@b.com',
      phone: null,
    })

    expect(result).toEqual({ error: 'Resident not found.' })
    // The refusal must come from an org-scoped query, not a bare id lookup —
    // deleting .eq('organization_id', …) must fail this test.
    expect(residentSelectFilters.organization_id).toBe('org-1')
    expect(residentSelectFilters.id).toBe('res-from-other-org')
  })

  it('still succeeds when the alias repoint fails, and returns a warning', async () => {
    harness({ aliasFails: true })

    const result = await updateResidentFromInbox('thread-1', 'res-1', {
      fullName: 'Raja Nagula',
      email: 'new@example.com',
      phone: null,
    })

    // The resident record is already corrected — the user's primary intent.
    // Rolling that back over a secondary index write would be worse.
    expect(result).toMatchObject({ ok: true })
    expect((result as { warning?: string }).warning).toMatch(/old address/i)
  })

  it('refuses a resident belonging to a different property than the thread', async () => {
    harness({ resident: { id: 'res-1', property_id: 'other-legacy', email: 'a@b.com' } })

    const result = await updateResidentFromInbox('thread-1', 'res-1', {
      fullName: 'Raja Nagula',
      email: 'a@b.com',
      phone: null,
    })

    expect(result).toEqual({ error: 'Resident not found.' })
  })

  it('repoints the sender alias when the email changes', async () => {
    const { ops } = harness({})

    await updateResidentFromInbox('thread-1', 'res-1', {
      fullName: 'Raja Nagula',
      email: 'new@example.com',
      phone: null,
    })

    const aliasOps = ops.filter((o) => o.table === 'inbox_sender_aliases')
    expect(aliasOps.some((o) => o.kind === 'delete')).toBe(true)
    expect(aliasOps.some((o) => o.kind === 'upsert')).toBe(true)
    const upsert = aliasOps.find((o) => o.kind === 'upsert')
    expect(upsert?.values?.email_address).toBe('new@example.com')
    expect(upsert?.values?.resident_id).toBe('res-1')
  })

  it('leaves the alias completely untouched when only the name changes', async () => {
    const { ops } = harness({})

    await updateResidentFromInbox('thread-1', 'res-1', {
      fullName: 'Raja N.',
      email: 'old@example.com',
      phone: null,
    })

    expect(ops.filter((o) => o.table === 'inbox_sender_aliases')).toHaveLength(0)
  })

  it('logs an audit event for an email change, carrying both addresses', async () => {
    harness({})

    await updateResidentFromInbox('thread-1', 'res-1', {
      fullName: 'Raja Nagula',
      email: 'new@example.com',
      phone: null,
    })

    expect(logPropertyEventMock).toHaveBeenCalledTimes(1)
    const arg = logPropertyEventMock.mock.calls[0][0] as {
      kind: string
      payload: Record<string, unknown>
    }
    expect(arg.kind).toBe('note')
    expect(arg.payload.from).toBe('old@example.com')
    expect(arg.payload.to).toBe('new@example.com')
  })

  it('logs nothing when only the name or phone changes', async () => {
    harness({})

    await updateResidentFromInbox('thread-1', 'res-1', {
      fullName: 'Raja N.',
      email: 'old@example.com',
      phone: '555-0100',
    })

    expect(logPropertyEventMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/hoa/src/lib/inbox/resident/actions.test.ts`
Expected: FAIL — cannot resolve `./actions`.

- [ ] **Step 3: Write the implementation**

Create `apps/hoa/src/lib/inbox/resident/actions.ts`:

```typescript
'use server'

/**
 * Correcting a resident's contact details from the thread that proves they
 * are wrong.
 *
 * The alias repoint is the point of this action, not a nicety.
 * `inbox_sender_aliases` maps a literal sender address to a unit and is
 * matched at HIGHER precedence than the resident-email rule (match.ts:145
 * before :157, both 'high'). Correcting the email without repointing it
 * would look successful and change nothing about where that resident's mail
 * files — nothing else in the repo ever invalidates an alias.
 *
 * Two different property ids are in play. `inbox_threads.unit_id` is a
 * `units.id` and keys the /properties/[id] route;
 * `property_residents.property_id` is `units.legacy_hoa_property_id`, an
 * `hoa_properties.id`. The ownership check uses the legacy id; the
 * revalidation uses the unit id.
 *
 * Never log an email address, subject, or body. PostgrestError `.code` and
 * `.message` only, never `.details`.
 */

import { revalidatePath } from 'next/cache'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { logPropertyEvent } from '@/lib/property-events'

export interface UpdateResidentFromInboxFields {
  fullName: string
  email: string | null
  phone: string | null
}

export async function updateResidentFromInbox(
  threadId: string,
  residentId: string,
  fields: UpdateResidentFromInboxFields,
): Promise<{ ok: true; warning?: string } | { error: string }> {
  const { org } = await requireBoardOrAdmin()

  const fullName = fields.fullName.trim()
  if (!fullName) return { error: 'Name is required.' }
  const email = fields.email?.trim().toLowerCase() || null
  const phone = fields.phone?.trim() || null

  const supabase = await getSupabaseServerClient()

  // 1. Thread -> unit, org-scoped.
  const { data: thread, error: threadError } = await supabase
    .from('inbox_threads')
    .select('unit_id')
    .eq('id', threadId)
    .eq('organization_id', org.id)
    .maybeSingle<{ unit_id: string | null }>()

  if (threadError) {
    console.error(`updateResidentFromInbox: thread read failed: ${threadError.code} ${threadError.message}`)
    return { error: 'Could not update this resident. Try again.' }
  }
  if (!thread?.unit_id) return { error: 'This thread is not filed under a property.' }

  // 2. Unit -> legacy hoa_properties id, which is what residents hang off.
  const { data: unit, error: unitError } = await supabase
    .from('units')
    .select('legacy_hoa_property_id')
    .eq('id', thread.unit_id)
    .eq('organization_id', org.id)
    .maybeSingle<{ legacy_hoa_property_id: string | null }>()

  if (unitError) {
    console.error(`updateResidentFromInbox: unit read failed: ${unitError.code} ${unitError.message}`)
    return { error: 'Could not update this resident. Try again.' }
  }
  if (!unit?.legacy_hoa_property_id) return { error: 'This property has no resident records.' }

  // 3. Resident must belong to this org AND to this thread's property. A
  //    residentId arriving from a form is not trustworthy on either count.
  const { data: resident, error: residentError } = await supabase
    .from('property_residents' as never)
    .select('id, property_id, email')
    .eq('id', residentId)
    .eq('organization_id', org.id)
    .maybeSingle<{ id: string; property_id: string; email: string | null }>()

  if (residentError) {
    console.error(`updateResidentFromInbox: resident read failed: ${residentError.code} ${residentError.message}`)
    return { error: 'Could not update this resident. Try again.' }
  }
  if (!resident || resident.property_id !== unit.legacy_hoa_property_id) {
    // Same message for "absent" and "belongs to someone else" — revealing
    // which would leak the existence of another tenant's row.
    return { error: 'Resident not found.' }
  }

  const previousEmail = resident.email?.trim().toLowerCase() || null
  const emailChanged = previousEmail !== email

  // 4. The write.
  const { error: updateError } = await supabase
    .from('property_residents' as never)
    .update({ full_name: fullName, email, phone } as never)
    .eq('id', residentId)
    .eq('organization_id', org.id)

  if (updateError) {
    console.error(`updateResidentFromInbox: update failed: ${updateError.code} ${updateError.message}`)
    return { error: 'Could not update this resident. Try again.' }
  }

  let warning: string | undefined

  // 5. Repoint the alias. Only on an actual email change — a name or phone
  //    edit must not disturb a mapping a manager taught deliberately.
  if (emailChanged) {
    const aliasError = await repointAlias(supabase, {
      orgId: org.id,
      unitId: thread.unit_id,
      residentId,
      previousEmail,
      email,
    })
    if (aliasError) {
      // The resident record is already corrected, which is the user's
      // primary intent. Rolling that back because a secondary index write
      // failed would be the worse trade — so report it instead.
      warning =
        'The resident was updated, but their old address may still route mail to this property. Check Settings → Mailbox.'
    }

    // 6. Audit. Best-effort: a failed history row must not fail the edit.
    const event = await logPropertyEvent({
      propertyId: unit.legacy_hoa_property_id,
      kind: 'note',
      payload: {
        field: 'email',
        from: previousEmail,
        to: email,
        alias_repointed: !aliasError,
      },
      notes: 'Resident email updated from the inbox',
    })
    if (!event.ok) {
      console.error(`updateResidentFromInbox: audit log failed: ${event.error}`)
    }
  }

  revalidatePath(`/inbox/${threadId}`)
  // The /properties route is keyed by UNIT id, not the legacy property id.
  revalidatePath(`/properties/${thread.unit_id}`)

  return warning ? { ok: true, warning } : { ok: true }
}

/**
 * Drop the alias for the address the resident no longer uses, and point one
 * at the new address.
 *
 * Deleting alone would be enough for correctness — the resident-email rule
 * would then match the new address — but the upsert preserves
 * high-confidence filing from the very first message at the new address.
 *
 * `assignThreadToProperty` never populates `resident_id` (it is always NULL
 * today), so this is the first writer to set it. The column is read at
 * match.ts:365 and flows into `outcome.residentId`.
 *
 * Returns an error to report, or null on success. Never throws.
 */
async function repointAlias(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  args: {
    orgId: string
    unitId: string
    residentId: string
    previousEmail: string | null
    email: string | null
  },
): Promise<string | null> {
  const { orgId, unitId, residentId, previousEmail, email } = args

  if (previousEmail) {
    const { error } = await supabase
      .from('inbox_sender_aliases')
      .delete()
      .eq('organization_id', orgId)
      .eq('email_address', previousEmail)
    if (error) {
      console.error(`repointAlias: delete failed: ${error.code} ${error.message}`)
      return error.message
    }
  }

  if (!email) return null

  // Unique index is (organization_id, lower(email_address)) — migration
  // 0033. The action lowercases the address before this point, so the
  // conflict target matches.
  const { error } = await supabase.from('inbox_sender_aliases').upsert(
    {
      organization_id: orgId,
      email_address: email,
      unit_id: unitId,
      resident_id: residentId,
      source: 'manual',
    } as never,
    { onConflict: 'organization_id,email_address_lower' },
  )

  if (error) {
    console.error(`repointAlias: upsert failed: ${error.code} ${error.message}`)
    return error.message
  }
  return null
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/hoa/src/lib/inbox/resident/actions.test.ts`
Expected: PASS (7 tests).

If the harness does not record an op the assertions expect, adjust the **harness**, not the production code — the recording chain is test scaffolding and may need another method stubbed.

- [ ] **Step 5: Mutation-check the property ownership guard**

Temporarily delete `|| resident.property_id !== unit.legacy_hoa_property_id` from the guard, re-run the tests, and confirm the "different property" test now fails. Restore it immediately.

This proves the test guards the cross-property check rather than passing because the resident lookup happened to return nothing.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p apps/hoa/tsconfig.json`
Expected: No errors found.

- [ ] **Step 7: Commit**

```bash
git add apps/hoa/src/lib/inbox/resident/actions.ts apps/hoa/src/lib/inbox/resident/actions.test.ts
git commit -m "feat(inbox): edit a resident from a thread and repoint their sender alias"
```

---

### Task 4: The rail UI

**Files:**
- Create: `apps/hoa/src/app/(dashboard)/inbox/[id]/ResidentRailRow.tsx`
- Modify: `apps/hoa/src/app/(dashboard)/inbox/[id]/PropertyRail.tsx` (residents line at :63-66)

**Interfaces:**
- Consumes: `updateResidentFromInbox` (Task 3), `PropertyContext['residents']` (Task 1)
- Produces: `<ResidentRailRow threadId resident />`

- [ ] **Step 1: Write the row component**

Create `apps/hoa/src/app/(dashboard)/inbox/[id]/ResidentRailRow.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Alert, Button, useToast } from '@homeowner-portal/ui'
import { updateResidentFromInbox } from '@/lib/inbox/resident/actions'

interface RailResident {
  id: string
  name: string
  role: string
  email: string | null
  phone: string | null
}

/**
 * Inline edit, not a modal: `packages/ui` exports no Dialog/Modal/Sheet
 * (only the confirm-only Confirm.tsx, which cannot host children), and
 * inline is the convention this record type already uses on the property
 * page — see properties/[id]/ResidentRow.tsx, whose useTransition + toast +
 * router.refresh() shape this mirrors.
 */
export function ResidentRailRow({
  threadId,
  resident,
}: {
  threadId: string
  resident: RailResident
}) {
  const router = useRouter()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [fullName, setFullName] = useState(resident.name)
  const [email, setEmail] = useState(resident.email ?? '')
  const [phone, setPhone] = useState(resident.phone ?? '')

  const emailChanged = (email.trim().toLowerCase() || null) !== (resident.email ?? null)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (fullName.trim().length === 0) {
      setError('Name is required.')
      return
    }

    startTransition(async () => {
      const result = await updateResidentFromInbox(threadId, resident.id, {
        fullName,
        email: email.trim() || null,
        phone: phone.trim() || null,
      })
      if ('error' in result) {
        setError(result.error)
        return
      }
      toast({
        tone: result.warning ? 'warning' : 'success',
        message: result.warning ?? 'Resident updated.',
      })
      setEditing(false)
      router.refresh()
    })
  }

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs text-foreground">
            {resident.name} <span className="text-muted">({resident.role})</span>
          </p>
          {resident.email ? (
            <p className="truncate text-[11px] text-muted">{resident.email}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${resident.name}`}
          className="shrink-0 rounded p-1 text-muted hover:bg-muted/10 hover:text-foreground"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-md border border-border p-2">
      <RailField label="Name" value={fullName} onChange={setFullName} />
      <RailField label="Email" value={email} onChange={setEmail} type="email" />
      <RailField label="Phone" value={phone} onChange={setPhone} />

      {emailChanged ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Changing the email re-points where their mail files. It does not
          update their resident-portal sign-in or the mailing lists used for
          announcements — those still hold the old address.
        </p>
      ) : null}

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={pending}>
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setEditing(false)
            setError(null)
            setFullName(resident.name)
            setEmail(resident.email ?? '')
            setPhone(resident.phone ?? '')
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}

function RailField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-border bg-background p-1.5 text-xs"
        autoComplete="off"
      />
    </label>
  )
}
```

**Before running:** confirm `useToast` is exported from `@homeowner-portal/ui` and that `lucide-react` is a dependency of `apps/hoa` — both are used by `properties/[id]/ResidentRow.tsx`, so copy its import lines if these differ.

- [ ] **Step 2: Render the list in the rail**

In `apps/hoa/src/app/(dashboard)/inbox/[id]/PropertyRail.tsx`, replace the joined-string residents line (currently inside the `<p className="text-xs text-muted">` at :62-66):

```tsx
        {context.degraded.includes('residents') ? (
          <p className="text-xs text-muted">Residents couldn&apos;t load</p>
        ) : context.residents.length === 0 ? (
          <p className="text-xs text-muted">No residents on file</p>
        ) : (
          <div className="space-y-1.5">
            {context.residents.map((resident) => (
              <ResidentRailRow key={resident.id} threadId={thread.id} resident={resident} />
            ))}
          </div>
        )}
```

Add `import { ResidentRailRow } from './ResidentRailRow'`.

The `degraded` branch must stay first. `getPropertyContext` pushes `'residents'` onto `degraded` when the query fails and defaults the array to `[]` — without that branch, an unloadable list would render as an editable empty list, which is the exact class of lie `PropertyRail`'s existing comments guard against.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p apps/hoa/tsconfig.json`
Expected: No errors found.

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add "apps/hoa/src/app/(dashboard)/inbox/[id]/ResidentRailRow.tsx" "apps/hoa/src/app/(dashboard)/inbox/[id]/PropertyRail.tsx"
git commit -m "feat(inbox): edit resident name, email and phone from the rail"
```

---

## Manual verification

The alias repoint is the half no unit test can prove, because it depends on real rows and the matcher's precedence. Verify against the live app after Task 4:

1. Open a thread filed under a property that has at least one resident. The rail lists residents individually, each with a pencil.
2. Edit a resident's **phone** only, save. The property page shows the new phone; `inbox_sender_aliases` is unchanged; no new `property_events` row.
3. Edit a resident's **email**, save. Confirm in the database:
   - `property_residents.email` is the new address
   - the `inbox_sender_aliases` row for the **old** address is gone
   - a row for the **new** address exists with the right `unit_id` and a non-null `resident_id`
   - a `property_events` row of kind `note` exists with `payload.from` and `payload.to`
4. Confirm the amber note appears **only** while the email field differs from the stored value.
5. Sign in as a `resident` and confirm the property page's resident edit form now refuses (Task 2).
6. Open a thread that is **not** filed under a property. The rail shows the assign form and no resident list — the action should never be reachable there.
