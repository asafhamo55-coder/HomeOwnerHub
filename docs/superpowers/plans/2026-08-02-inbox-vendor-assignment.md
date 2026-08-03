# Inbox Vendor Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a board member file an inbox thread under a vendor, create that vendor from the email when it doesn't exist, and auto-file future threads from the same address.

**Architecture:** A `vendor_id` column on `inbox_threads` (mirroring `unit_id`), a set of org-scoped server actions under `lib/inbox/vendor/`, a signature-extraction workflow `W33`, and a rail block rendered independently of the property block.

**Tech Stack:** Next.js 15 App Router (server actions), Supabase/Postgres, Zod, Vitest, OpenAI-compatible client via `@homeowner-portal/ai`.

**Spec:** `docs/superpowers/specs/2026-08-02-inbox-vendor-assignment-design.md`

## Global Constraints

- **Never log an email address, subject, or body.** Log `PostgrestError.code`/`.message` only — never `.details`. (Rule from `lib/inbox/draft/actions.ts`.)
- **Every server action** calls `requireBoardOrAdmin()` and scopes every query with `.eq('organization_id', org.id)`.
- **Every state transition is a conditional update** (`.eq(...)` on the expected prior state), never read-then-decide.
- **W33 never invents a field.** Anything the signature does not state is `null`.
- **W33 never extracts an EIN**, in any form.
- Supabase generated types lag the schema. The codebase's established workaround is `.from('table' as never)` and `as never` on insert payloads — see `apps/hoa/src/lib/vendors.ts` (22 uses). Use it rather than hand-editing `database.types.ts`.
- Tests run under the root vitest harness (`vitest.config.ts`): **pure modules only**. Server actions are testable only by mocking `@/lib/auth` and `@/lib/supabase/server`, per `lib/inbox/draft/actions.test.ts`.
- Run tests with `npx vitest run <path>`. Typecheck with `npx tsc --noEmit -p <tsconfig>`.

---

## File Structure

| File | Responsibility |
|---|---|
| `migrations/0037_inbox_vendor_assignment.sql` | Add `vendor_id` + partial index |
| `apps/hoa/src/lib/inbox/vendor/schema.ts` | `QuickCreateVendorSchema`, `isVendorIncomplete` |
| `apps/hoa/src/lib/inbox/vendor/actions.ts` | search / assign / unassign / quick-create / extract |
| `apps/hoa/src/lib/inbox/vendor/actions.test.ts` | Action tests (mocked supabase) |
| `apps/hoa/src/lib/inbox/vendor/schema.test.ts` | Pure schema tests |
| `packages/workflows/src/W33-vendor-extractor/prompt.ts` | System prompt + `PROMPT_VERSION` |
| `packages/workflows/src/W33-vendor-extractor/index.ts` | Workflow definition + pure response processor |
| `packages/workflows/src/W33-vendor-extractor/index.test.ts` | Processor tests (no live model) |
| `apps/hoa/src/app/(dashboard)/inbox/[id]/VendorRail.tsx` | Assigned/unassigned rail block |
| `apps/hoa/src/app/(dashboard)/inbox/[id]/AssignVendorForm.tsx` | Type-ahead + create affordance |
| `apps/hoa/src/app/(dashboard)/inbox/[id]/QuickCreateVendorModal.tsx` | Prefilled create form |

---

### Task 1: Migration, types, and `ThreadDetail.vendorId`

**Files:**
- Create: `migrations/0037_inbox_vendor_assignment.sql`
- Modify: `apps/hoa/src/lib/inbox/queries.ts` (`ThreadDetail` interface at line 524, and `getThreadDetail`'s select)

**Interfaces:**
- Consumes: nothing
- Produces: `ThreadDetail.vendorId: string | null`

- [ ] **Step 1: Write the migration**

Create `migrations/0037_inbox_vendor_assignment.sql`:

```sql
-- 0037_inbox_vendor_assignment.sql
--
-- File an inbox thread under a vendor, independently of its property
-- filing. Mirrors unit_id's treatment: ON DELETE SET NULL so removing a
-- vendor unfiles its threads rather than cascading them away, and a
-- partial index because vendor_id is null on most rows.

ALTER TABLE public.inbox_threads
  ADD COLUMN IF NOT EXISTS vendor_id uuid
    REFERENCES public.vendors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inbox_threads_vendor_idx
  ON public.inbox_threads(vendor_id, last_message_at DESC)
  WHERE vendor_id IS NOT NULL;
```

No RLS change: `inbox_threads` policies are row-scoped by org, not column-scoped.

- [ ] **Step 2: Apply it**

Per `docs/DEPLOY.md`, migrations are run by hand in the Supabase SQL editor. Paste the file contents and run. Then confirm:

```sql
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'inbox_threads' AND column_name = 'vendor_id';
```

Expected: one row, `is_nullable = YES`.

- [ ] **Step 3: Regenerate DB types**

Run: `pnpm --filter @homeowner-portal/db gen:types`

If the Supabase CLI is not authenticated, skip this — the `as never` pattern in Global Constraints covers it. Do not hand-edit `database.types.ts`.

- [ ] **Step 4: Add `vendorId` to `ThreadDetail`**

In `apps/hoa/src/lib/inbox/queries.ts`, add the field to the interface (currently ends at `messages` on line 532):

```typescript
export interface ThreadDetail {
  id: string
  subject: string | null
  status: string
  unitId: string | null
  vendorId: string | null
  matchConfidence: string
  matchReason: Record<string, unknown> | null
  matchSource: string
  messages: ThreadMessage[]
}
```

Then in `getThreadDetail`, add `vendor_id` to the thread `.select(...)` column list and map it into the returned object as `vendorId: row.vendor_id ?? null`. Follow the existing mapping style in that function exactly.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p apps/hoa/tsconfig.json`
Expected: No errors found.

- [ ] **Step 6: Commit**

```bash
git add migrations/0037_inbox_vendor_assignment.sql apps/hoa/src/lib/inbox/queries.ts
git commit -m "feat(inbox): add vendor_id to threads so mail can file under a vendor"
```

---

### Task 2: Vendor schema module

**Files:**
- Create: `apps/hoa/src/lib/inbox/vendor/schema.ts`
- Test: `apps/hoa/src/lib/inbox/vendor/schema.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `QuickCreateVendorSchema` (Zod object)
  - `type QuickCreateVendorInput = z.infer<typeof QuickCreateVendorSchema>`
  - `isVendorIncomplete(v: { ein: string | null; trades: string[] | null }): boolean`

This is a separate pure module (not inside `actions.ts`) because `'use server'` files may export only async functions — the same reason `blanks.ts` exists next to `draft/actions.ts`.

- [ ] **Step 1: Write the failing test**

Create `apps/hoa/src/lib/inbox/vendor/schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { QuickCreateVendorSchema, isVendorIncomplete } from './schema'

describe('QuickCreateVendorSchema', () => {
  it('accepts a name and email alone — an email cannot supply an EIN', () => {
    const result = QuickCreateVendorSchema.safeParse({
      legalName: 'ABC Landscaping',
      primaryEmail: 'jose@abclandscaping.com',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a missing email — it is the dedupe key', () => {
    const result = QuickCreateVendorSchema.safeParse({ legalName: 'ABC Landscaping' })
    expect(result.success).toBe(false)
  })

  it('rejects a malformed email', () => {
    const result = QuickCreateVendorSchema.safeParse({
      legalName: 'ABC Landscaping',
      primaryEmail: 'not-an-email',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a whitespace-only name', () => {
    const result = QuickCreateVendorSchema.safeParse({
      legalName: '   ',
      primaryEmail: 'jose@abclandscaping.com',
    })
    expect(result.success).toBe(false)
  })

  it('normalizes the email to lowercase so dedupe is case-insensitive', () => {
    const result = QuickCreateVendorSchema.parse({
      legalName: 'ABC Landscaping',
      primaryEmail: 'Jose@ABCLandscaping.com',
    })
    expect(result.primaryEmail).toBe('jose@abclandscaping.com')
  })
})

describe('isVendorIncomplete', () => {
  it('is incomplete without an EIN', () => {
    expect(isVendorIncomplete({ ein: null, trades: ['landscaping'] })).toBe(true)
  })

  it('is incomplete without trades', () => {
    expect(isVendorIncomplete({ ein: '123456789', trades: null })).toBe(true)
  })

  it('is incomplete with an empty trades array', () => {
    expect(isVendorIncomplete({ ein: '123456789', trades: [] })).toBe(true)
  })

  it('is complete with both', () => {
    expect(isVendorIncomplete({ ein: '123456789', trades: ['landscaping'] })).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/hoa/src/lib/inbox/vendor/schema.test.ts`
Expected: FAIL — cannot resolve `./schema`.

- [ ] **Step 3: Write the implementation**

Create `apps/hoa/src/lib/inbox/vendor/schema.ts`:

```typescript
/**
 * Fast-create validation, kept out of actions.ts because `'use server'`
 * modules may export only async functions (same reason draft/blanks.ts
 * exists).
 *
 * This is deliberately NOT `CreateVendorSchema` from lib/vendors.ts. That
 * schema requires a 9-digit EIN and at least one trade, because it guards
 * the full onboarding form where those drive 1099 reporting and license
 * validation. An email supplies neither. Weakening the shared schema would
 * weaken every caller, so fast-create gets its own, and the resulting row
 * is marked incomplete rather than pretending to be fully onboarded.
 */
import { z } from 'zod'

export const QuickCreateVendorSchema = z.object({
  legalName: z.string().trim().min(2, 'Company name is required.'),
  // Required and lowercased: this is the dedupe key and the auto-match key,
  // so 'Jose@X.com' and 'jose@x.com' must not create two vendors.
  primaryEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email('Email looks invalid.'),
  dba: z.string().trim().min(1).nullable().optional(),
  primaryPhone: z.string().trim().min(1).nullable().optional(),
  // Single trade, not an array: a signature block states at most one line
  // of business, and inventing a second would break the never-invent rule.
  // Mapped to vendors.trades (text[]) at insert time.
  trade: z.string().trim().min(1).nullable().optional(),
  address: z
    .object({
      line1: z.string().trim().min(1).nullable().optional(),
      city: z.string().trim().min(1).nullable().optional(),
      state: z.string().trim().min(1).nullable().optional(),
      postal_code: z.string().trim().min(1).nullable().optional(),
    })
    .nullable()
    .optional(),
  notes: z.string().trim().min(1).nullable().optional(),
  // True when any field above was filled by W33 rather than typed.
  aiGenerated: z.boolean().default(false),
})

export type QuickCreateVendorInput = z.infer<typeof QuickCreateVendorSchema>

/**
 * Completeness is DERIVED, never stored. A stored flag drifts out of sync
 * with the fields it describes the moment someone fills one in.
 */
export function isVendorIncomplete(vendor: {
  ein: string | null
  trades: string[] | null
}): boolean {
  return !vendor.ein || !vendor.trades || vendor.trades.length === 0
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/hoa/src/lib/inbox/vendor/schema.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/hoa/src/lib/inbox/vendor/schema.ts apps/hoa/src/lib/inbox/vendor/schema.test.ts
git commit -m "feat(inbox): add fast-create vendor schema with derived completeness"
```

---

### Task 3: Search, assign, and unassign actions

**Files:**
- Create: `apps/hoa/src/lib/inbox/vendor/actions.ts`
- Test: `apps/hoa/src/lib/inbox/vendor/actions.test.ts`

**Interfaces:**
- Consumes: `requireBoardOrAdmin` from `@/lib/auth`, `getSupabaseServerClient` from `@/lib/supabase/server`
- Produces:
  - `searchVendors(term: string): Promise<VendorOption[]>` where `VendorOption = { vendorId: string; legalName: string; primaryEmail: string | null; incomplete: boolean }`
  - `assignThreadToVendor(threadId: string, vendorId: string): Promise<{ ok: true } | { error: string }>`
  - `unassignThreadVendor(threadId: string): Promise<{ ok: true } | { error: string }>`

- [ ] **Step 1: Write the failing test**

Create `apps/hoa/src/lib/inbox/vendor/actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({
  requireBoardOrAdmin: vi.fn(async () => ({
    role: 'board' as const,
    org: { id: 'org-1', name: 'Madison Park', hub_type: 'hoa', plan: 'pro', doors_count: 120 },
  })),
}))

const fromMock = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: fromMock,
  })),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { assignThreadToVendor } from './actions'

type Result = { data: unknown; error: unknown }

/**
 * A filter-aware chain. `.eq()` calls are recorded so a test can assert the
 * action actually scoped its query — a dumb mock that ignores filters would
 * pass even if `.eq('organization_id', ...)` were deleted.
 */
function chainFor(rows: Record<string, unknown> | null, filters: Record<string, unknown>) {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    update: vi.fn(() => chain),
    eq: vi.fn((col: string, val: unknown) => {
      filters[col] = val
      return chain
    }),
    ilike: vi.fn(() => chain),
    or: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(async (): Promise<Result> => ({ data: rows, error: null })),
    then: (resolve: (r: Result) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
  }
  return chain
}

beforeEach(() => {
  fromMock.mockReset()
})

describe('assignThreadToVendor', () => {
  it('refuses when the vendor belongs to another org', async () => {
    const vendorFilters: Record<string, unknown> = {}
    fromMock.mockImplementation((table: string) => {
      if (table === 'vendors') return chainFor(null, vendorFilters) // no row for this org
      return chainFor({ id: 'thread-1' }, {})
    })

    const result = await assignThreadToVendor('thread-1', 'vendor-from-other-org')

    expect(result).toEqual({ error: 'Vendor not found.' })
    // The refusal must come from an org-scoped lookup, not a bare id lookup.
    expect(vendorFilters.organization_id).toBe('org-1')
  })

  it('scopes the thread lookup to the caller org before writing', async () => {
    const threadFilters: Record<string, unknown> = {}
    fromMock.mockImplementation((table: string) => {
      if (table === 'vendors') return chainFor({ id: 'vendor-1' }, {})
      return chainFor({ id: 'thread-1' }, threadFilters)
    })

    await assignThreadToVendor('thread-1', 'vendor-1')

    expect(threadFilters.organization_id).toBe('org-1')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/hoa/src/lib/inbox/vendor/actions.test.ts`
Expected: FAIL — cannot resolve `./actions`.

- [ ] **Step 3: Write the implementation**

Create `apps/hoa/src/lib/inbox/vendor/actions.ts`:

```typescript
'use server'

/**
 * Filing an inbox thread under a vendor.
 *
 * Both the thread AND the vendor are verified to belong to the caller's org
 * before any write. That is not defensive noise — it is the exact hazard
 * `linkThreadToResource` (lib/inbox/actions.ts) had to be patched for: a
 * foreign resource id arriving from a form and being stamped with this
 * org's id. A foreign key alone only proves the row exists somewhere.
 *
 * Never log an email address, subject, or body. PostgrestError `.code` and
 * `.message` only, never `.details`.
 */

import { revalidatePath } from 'next/cache'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { isVendorIncomplete } from './schema'

export interface VendorOption {
  vendorId: string
  legalName: string
  primaryEmail: string | null
  incomplete: boolean
}

/** Escapes `%` and `_` so a typed wildcard can't widen the search. */
function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (match) => `\\${match}`)
}

export async function searchVendors(term: string): Promise<VendorOption[]> {
  const { org } = await requireBoardOrAdmin()
  const trimmed = term.trim()
  if (!trimmed) return []

  const supabase = await getSupabaseServerClient()
  const pattern = `%${escapeLikePattern(trimmed)}%`

  const { data, error } = await supabase
    .from('vendors' as never)
    .select('id, legal_name, dba, primary_email, ein, trades')
    .eq('organization_id', org.id)
    .or(`legal_name.ilike.${pattern},dba.ilike.${pattern},primary_email.ilike.${pattern}`)
    .order('legal_name')
    .limit(20)

  if (error) {
    console.error(`searchVendors: ${error.code} ${error.message}`)
    return []
  }

  return ((data ?? []) as Array<{
    id: string
    legal_name: string
    primary_email: string | null
    ein: string | null
    trades: string[] | null
  }>).map((v) => ({
    vendorId: v.id,
    legalName: v.legal_name,
    primaryEmail: v.primary_email,
    incomplete: isVendorIncomplete({ ein: v.ein, trades: v.trades }),
  }))
}

export async function assignThreadToVendor(
  threadId: string,
  vendorId: string,
): Promise<{ ok: true } | { error: string }> {
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  // Vendor first, org-scoped. A vendorId from another tenant must not be
  // writable onto this org's thread.
  const { data: vendor, error: vendorError } = await supabase
    .from('vendors' as never)
    .select('id')
    .eq('id', vendorId)
    .eq('organization_id', org.id)
    .maybeSingle()

  if (vendorError) {
    console.error(`assignThreadToVendor: vendor lookup failed: ${vendorError.code} ${vendorError.message}`)
    return { error: 'Could not file this thread. Try again.' }
  }
  if (!vendor) return { error: 'Vendor not found.' }

  const { data, error } = await supabase
    .from('inbox_threads')
    .update({ vendor_id: vendorId } as never)
    .eq('id', threadId)
    .eq('organization_id', org.id)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error(`assignThreadToVendor: update failed: ${error.code} ${error.message}`)
    return { error: 'Could not file this thread. Try again.' }
  }
  if (!data) return { error: 'Thread not found.' }

  revalidatePath(`/inbox/${threadId}`)
  return { ok: true }
}

export async function unassignThreadVendor(
  threadId: string,
): Promise<{ ok: true } | { error: string }> {
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  const { data, error } = await supabase
    .from('inbox_threads')
    .update({ vendor_id: null } as never)
    .eq('id', threadId)
    .eq('organization_id', org.id)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error(`unassignThreadVendor: update failed: ${error.code} ${error.message}`)
    return { error: 'Could not unfile this thread. Try again.' }
  }
  if (!data) return { error: 'Thread not found.' }

  revalidatePath(`/inbox/${threadId}`)
  return { ok: true }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/hoa/src/lib/inbox/vendor/actions.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Verify the org-scope test is meaningful**

Temporarily delete `.eq('organization_id', org.id)` from the **vendor** lookup in `assignThreadToVendor`, re-run the test, and confirm the first test now fails. Restore the line immediately afterwards.

This proves the test guards the scoping rather than passing vacuously.

- [ ] **Step 6: Commit**

```bash
git add apps/hoa/src/lib/inbox/vendor/actions.ts apps/hoa/src/lib/inbox/vendor/actions.test.ts
git commit -m "feat(inbox): add org-scoped vendor search, assign, and unassign actions"
```

---

### Task 4: Quick-create action with duplicate block

**Files:**
- Modify: `apps/hoa/src/lib/inbox/vendor/actions.ts`
- Modify: `apps/hoa/src/lib/inbox/vendor/actions.test.ts`

**Interfaces:**
- Consumes: `QuickCreateVendorSchema` (Task 2), `assignThreadToVendor` (Task 3)
- Produces: `quickCreateVendor(threadId: string, input: unknown): Promise<{ ok: true; vendorId: string } | { error: string; duplicateVendorId?: string }>`

- [ ] **Step 1: Write the failing test**

Append to `apps/hoa/src/lib/inbox/vendor/actions.test.ts` (and add `quickCreateVendor` to the existing `import { assignThreadToVendor } from './actions'` line):

```typescript
describe('quickCreateVendor', () => {
  it('blocks an exact duplicate email and returns the existing vendor id', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'vendors') return chainFor({ id: 'existing-vendor' }, {})
      return chainFor({ id: 'thread-1' }, {})
    })

    const result = await quickCreateVendor('thread-1', {
      legalName: 'ABC Landscaping',
      primaryEmail: 'jose@abclandscaping.com',
    })

    expect(result).toMatchObject({ duplicateVendorId: 'existing-vendor' })
    expect('ok' in result).toBe(false)
  })

  it('rejects invalid input before touching the database', async () => {
    fromMock.mockImplementation(() => {
      throw new Error('must not query on invalid input')
    })

    const result = await quickCreateVendor('thread-1', { legalName: 'X' })

    expect('error' in result).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/hoa/src/lib/inbox/vendor/actions.test.ts`
Expected: FAIL — `quickCreateVendor` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `apps/hoa/src/lib/inbox/vendor/actions.ts`:

```typescript
import { QuickCreateVendorSchema } from './schema'

/**
 * Create a vendor from what an email can actually supply, then file the
 * thread under it.
 *
 * The duplicate check is server-side, not merely a UI affordance: the
 * client cannot be trusted to have run its type-ahead, and a double-submit
 * would otherwise create two vendors for one company. It returns the
 * existing id rather than a bare error so the caller can offer a one-click
 * "file under them instead" rather than a dead end.
 */
export async function quickCreateVendor(
  threadId: string,
  input: unknown,
): Promise<{ ok: true; vendorId: string } | { error: string; duplicateVendorId?: string }> {
  const { org } = await requireBoardOrAdmin()

  const parsed = QuickCreateVendorSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid vendor details.' }
  }
  const v = parsed.data

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  // Exact-email duplicate check, org-scoped. Schema lowercases the email so
  // this comparison is case-insensitive without a functional index.
  const { data: existing, error: dupeError } = await supabase
    .from('vendors' as never)
    .select('id')
    .eq('organization_id', org.id)
    .eq('primary_email', v.primaryEmail)
    .maybeSingle()

  if (dupeError) {
    console.error(`quickCreateVendor: duplicate check failed: ${dupeError.code} ${dupeError.message}`)
    return { error: 'Could not create this vendor. Try again.' }
  }
  if (existing) {
    return {
      error: 'A vendor already uses this email address.',
      duplicateVendorId: (existing as { id: string }).id,
    }
  }

  const address =
    v.address && Object.values(v.address).some((x) => x != null && x !== '')
      ? {
          line1: v.address.line1 ?? null,
          line2: null,
          city: v.address.city ?? null,
          state: v.address.state ?? null,
          postal_code: v.address.postal_code ?? null,
        }
      : null

  const { data: row, error } = await supabase
    .from('vendors' as never)
    .insert({
      organization_id: org.id,
      legal_name: v.legalName,
      dba: v.dba ?? null,
      // EIN is deliberately absent. It is never in a signature block and an
      // invented one would corrupt 1099 reporting. A human enters it later.
      ein: null,
      primary_email: v.primaryEmail,
      primary_phone: v.primaryPhone ?? null,
      // Single extracted trade -> the table's text[] column.
      trades: v.trade ? [v.trade] : null,
      address,
      notes: v.notes ?? null,
      status: 'prospect',
      ai_generated: v.aiGenerated,
      created_by: user.id,
    } as never)
    .select('id')
    .maybeSingle()

  if (error || !row) {
    console.error(`quickCreateVendor: insert failed: ${error?.code} ${error?.message}`)
    return { error: 'Could not create this vendor.' }
  }

  const vendorId = (row as { id: string }).id

  const assigned = await assignThreadToVendor(threadId, vendorId)
  if ('error' in assigned) {
    // The vendor exists and is valid; only the filing failed. Say so
    // precisely rather than implying nothing was created — otherwise the
    // user retries and creates a duplicate.
    return { error: 'Vendor created, but filing this thread under it failed. Assign it manually.' }
  }

  revalidatePath(`/inbox/${threadId}`)
  revalidatePath('/vendors')
  return { ok: true, vendorId }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/hoa/src/lib/inbox/vendor/actions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/hoa/src/lib/inbox/vendor/actions.ts apps/hoa/src/lib/inbox/vendor/actions.test.ts
git commit -m "feat(inbox): quick-create a prospect vendor from an email, blocking duplicates"
```

---

### Task 5: W33 vendor extractor workflow

**Files:**
- Create: `packages/workflows/src/W33-vendor-extractor/prompt.ts`
- Create: `packages/workflows/src/W33-vendor-extractor/index.ts`
- Test: `packages/workflows/src/W33-vendor-extractor/index.test.ts`
- Modify: `packages/workflows/src/index.ts`

**Interfaces:**
- Consumes: `defineWorkflow`, `type WorkflowExecuteApi` from `@homeowner-portal/ai`
- Produces:
  - `VendorExtractorOutputSchema` / `type VendorExtractorOutput`
  - `processVendorExtractorResponse(raw: string): VendorExtractorOutput` (pure, exported for tests)
  - `extractVendor(input: VendorExtractorInput, ctx: { organizationId: string }): Promise<VendorExtractorOutput & { runId: string }>`

`processVendorExtractorResponse` is exported separately because the root vitest harness is pure-modules-only and `run()` is closed over by `defineWorkflow` — the same reason W32 exports `processReplyDrafterResponse`.

- [ ] **Step 1: Write the failing test**

Create `packages/workflows/src/W33-vendor-extractor/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { processVendorExtractorResponse } from './index'

describe('processVendorExtractorResponse', () => {
  it('returns nulls for a signature-free email rather than inventing fields', () => {
    const raw = JSON.stringify({
      legalName: null,
      dba: null,
      primaryPhone: null,
      trade: null,
      address: null,
    })

    const out = processVendorExtractorResponse(raw)

    expect(out.legalName).toBeNull()
    expect(out.primaryPhone).toBeNull()
    expect(out.trade).toBeNull()
    expect(out.address).toBeNull()
  })

  it('extracts the fields a signature block does state', () => {
    const raw = JSON.stringify({
      legalName: 'ABC Landscaping LLC',
      dba: 'ABC Lawn',
      primaryPhone: '(555) 201-4417',
      trade: 'landscaping',
      address: { line1: '18 Mill Rd', city: 'Durham', state: 'NC', postal_code: '27703' },
    })

    const out = processVendorExtractorResponse(raw)

    expect(out.legalName).toBe('ABC Landscaping LLC')
    expect(out.trade).toBe('landscaping')
    expect(out.address?.city).toBe('Durham')
  })

  it('drops any ein the model volunteers — it must never reach a vendor row', () => {
    const raw = JSON.stringify({
      legalName: 'ABC Landscaping LLC',
      dba: null,
      primaryPhone: null,
      trade: null,
      address: null,
      ein: '12-3456789',
    })

    const out = processVendorExtractorResponse(raw)

    expect(out).not.toHaveProperty('ein')
  })

  it('throws a non-technical error on unparseable JSON, without echoing the body', () => {
    expect(() => processVendorExtractorResponse('not json at all')).toThrow(
      /unparseable/i,
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/workflows/src/W33-vendor-extractor/index.test.ts`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 3: Write the prompt**

Create `packages/workflows/src/W33-vendor-extractor/prompt.ts`:

```typescript
export const PROMPT_VERSION = 'W33-v1'

export const SYSTEM_PROMPT = `You extract vendor contact details from a business email.

You are reading an email an HOA received from an outside company (a landscaper, plumber, roofer, contractor, or similar). Extract only what the email STATES — normally from its signature block.

Return JSON with exactly these keys:
{
  "legalName": string | null,
  "dba": string | null,
  "primaryPhone": string | null,
  "trade": string | null,
  "address": { "line1": string|null, "city": string|null, "state": string|null, "postal_code": string|null } | null
}

RULES — these are absolute:
1. NEVER guess. If the email does not state a field, return null for it. A null is always better than a plausible invention.
2. Do NOT infer a company name from the email domain alone. "jose@abclandscaping.com" is not evidence the company is called "ABC Landscaping" — only a signature block or letterhead saying so is.
3. "trade" is a single lowercase word or short phrase describing the line of business ("landscaping", "plumbing", "roofing"). Only set it if the email states or unambiguously shows it. Never list two.
4. NEVER return an EIN, tax ID, SSN, or any government identifier, even if one appears in the email. Do not add extra keys.
5. Return the JSON object only. No prose, no markdown fence.`

export function userPromptFor(input: {
  subject: string | null
  bodyText: string
  senderEmail: string
  senderName: string | null
}): string {
  return [
    `Sender address: ${input.senderEmail}`,
    `Sender display name: ${input.senderName ?? '(none)'}`,
    `Subject: ${input.subject ?? '(none)'}`,
    '',
    'Email body:',
    input.bodyText,
  ].join('\n')
}
```

- [ ] **Step 4: Write the workflow**

Create `packages/workflows/src/W33-vendor-extractor/index.ts`:

```typescript
// W33 — Vendor Extractor
//
// Reads a business email's signature block and returns the vendor contact
// details it STATES. Everything is nullable and a missing field comes back
// null — a hallucinated phone number on a vendor record is worse than a
// blank one, and this output is shown to a human for confirmation before
// anything is written.
//
// EIN is deliberately not in the output schema at all. It is never present
// in a signature block, and an invented one would corrupt 1099 reporting.

import { z } from 'zod'
import OpenAI from 'openai'
import { defineWorkflow, type WorkflowExecuteApi } from '@homeowner-portal/ai'
import { PROMPT_VERSION, SYSTEM_PROMPT, userPromptFor } from './prompt'

export const VendorExtractorInputSchema = z.object({
  subject: z.string().nullable(),
  bodyText: z.string(),
  senderEmail: z.string(),
  senderName: z.string().nullable(),
})
export type VendorExtractorInput = z.infer<typeof VendorExtractorInputSchema>

export const VendorExtractorOutputSchema = z.object({
  legalName: z.string().nullable(),
  dba: z.string().nullable(),
  primaryPhone: z.string().nullable(),
  trade: z.string().nullable(),
  address: z
    .object({
      line1: z.string().nullable(),
      city: z.string().nullable(),
      state: z.string().nullable(),
      postal_code: z.string().nullable(),
    })
    .nullable(),
})
export type VendorExtractorOutput = z.infer<typeof VendorExtractorOutputSchema>

/**
 * Pure: parse + schema-validate the model's raw JSON.
 *
 * `.parse` strips unknown keys, which is what drops any `ein` the model
 * volunteers — the schema is the enforcement point, not a manual delete.
 */
export function processVendorExtractorResponse(raw: string): VendorExtractorOutput {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object')
  } catch (err) {
    // Never log `raw` or the error message — a JSON.parse SyntaxError
    // embeds a prefix of the offending input, which here is email content.
    console.error('[W33] model response parse failed', {
      errorName: err instanceof Error ? err.name : 'UnknownError',
      responseLength: raw.length,
    })
    throw new Error('The model returned an unparseable response. Please retry.')
  }
  return VendorExtractorOutputSchema.parse(parsed)
}

export const vendorExtractor = defineWorkflow({
  id: 'W33',
  name: 'Vendor Extractor',
  version: '1.0.0',
  promptVersion: PROMPT_VERSION,
  model: process.env.AI_MODEL ?? 'llama-3.3-70b-versatile',
  // The output is proposed into a form the board member confirms before any
  // vendor row is written — the same posture as W32's drafts.
  humanApprovalRequired: true,
  inputSchema: VendorExtractorInputSchema,
  outputSchema: VendorExtractorOutputSchema,

  async run(input, api, _ctx) {
    const completion = await getClient().chat.completions.create({
      model: process.env.AI_MODEL ?? 'llama-3.3-70b-versatile',
      temperature: 0,
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPromptFor(input) },
      ],
    })

    api.setModel(completion.model)
    api.setTokens(completion.usage?.prompt_tokens ?? null, completion.usage?.completion_tokens ?? null)

    const output = processVendorExtractorResponse(
      completion.choices[0]?.message?.content ?? '{}',
    )
    // Low confidence when the model found nothing to extract.
    api.setConfidence(output.legalName ? 0.7 : 0.2)
    return output
  },
})

let client: OpenAI | null = null
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.AI_API_KEY,
      baseURL: process.env.AI_BASE_URL,
    })
  }
  return client
}

export async function extractVendor(
  input: VendorExtractorInput,
  ctx: { organizationId: string },
): Promise<VendorExtractorOutput & { runId: string }> {
  const result = await vendorExtractor.execute(input, { organizationId: ctx.organizationId })
  return { ...result.output, runId: result.runId }
}
```

Before running the test, open `packages/workflows/src/W32-reply-drafter/index.ts` and confirm the `getClient()` helper's env-var names match what you wrote above. If W32 uses different names, use W32's — it is the working reference.

- [ ] **Step 5: Export from the package index**

In `packages/workflows/src/index.ts`, append:

```typescript
export { vendorExtractor, extractVendor } from './W33-vendor-extractor'
export type {
  VendorExtractorInput,
  VendorExtractorOutput,
} from './W33-vendor-extractor'
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run packages/workflows/src/W33-vendor-extractor/index.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/workflows/src/W33-vendor-extractor packages/workflows/src/index.ts
git commit -m "feat(workflows): add W33 vendor extractor that never invents a field or an EIN"
```

---

### Task 6: Extraction action

**Files:**
- Modify: `apps/hoa/src/lib/inbox/vendor/actions.ts`

**Interfaces:**
- Consumes: `extractVendor` (Task 5), `stripQuotedReply` from `@homeowner-portal/mailbox`
- Produces: `extractVendorFromThread(threadId: string): Promise<{ ok: true; extracted: VendorExtractorOutput } | { error: string }>`

- [ ] **Step 1: Write the implementation**

Append to `apps/hoa/src/lib/inbox/vendor/actions.ts`:

```typescript
import { extractVendor, type VendorExtractorOutput } from '@homeowner-portal/workflows'

/**
 * Read the newest inbound message on a thread and pull vendor details from
 * its signature block.
 *
 * Every failure path returns an error rather than throwing: the modal that
 * calls this stays fully usable with just the sender's address and display
 * name. Extraction is an enhancement, never a gate.
 */
export async function extractVendorFromThread(
  threadId: string,
): Promise<{ ok: true; extracted: VendorExtractorOutput } | { error: string }> {
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: message, error } = await supabase
    .from('inbox_messages')
    .select('subject, stripped_text, body_text, from_email, from_name')
    .eq('thread_id', threadId)
    .eq('organization_id', org.id)
    .eq('direction', 'inbound')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error(`extractVendorFromThread: message read failed: ${error.code} ${error.message}`)
    return { error: 'Could not read this thread.' }
  }
  if (!message?.from_email) return { error: 'No inbound message to read.' }

  // stripped_text already has the quoted reply chain removed at ingest; fall
  // back to the full body when it is null (older rows).
  const bodyText = message.stripped_text ?? message.body_text ?? ''
  if (!bodyText.trim()) return { error: 'This message has no body to read.' }

  try {
    const extracted = await extractVendor(
      {
        subject: message.subject ?? null,
        bodyText,
        senderEmail: message.from_email,
        senderName: message.from_name ?? null,
      },
      { organizationId: org.id },
    )
    return { ok: true, extracted }
  } catch (err) {
    console.error(
      `extractVendorFromThread: extraction failed: ${err instanceof Error ? err.name : 'UnknownError'}`,
    )
    return { error: 'Could not read the signature block. Fill the form in manually.' }
  }
}
```

All columns used above are verified present on `inbox_messages` in `migrations/0029_inbox.sql`: `subject`, `body_text`, `stripped_text`, `from_email`, `from_name`, `direction`, `organization_id`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p apps/hoa/tsconfig.json`
Expected: No errors found.

- [ ] **Step 3: Run the existing action tests**

Run: `npx vitest run apps/hoa/src/lib/inbox/vendor/actions.test.ts`
Expected: PASS (4 tests) — no regression from the new export.

- [ ] **Step 4: Commit**

```bash
git add apps/hoa/src/lib/inbox/vendor/actions.ts
git commit -m "feat(inbox): read vendor details from a thread's newest inbound message"
```

---

### Task 7: Rail UI — assign form and vendor block

**Files:**
- Create: `apps/hoa/src/app/(dashboard)/inbox/[id]/AssignVendorForm.tsx`
- Create: `apps/hoa/src/app/(dashboard)/inbox/[id]/VendorRail.tsx`
- Modify: `apps/hoa/src/app/(dashboard)/inbox/[id]/page.tsx`

**Interfaces:**
- Consumes: `searchVendors`, `assignThreadToVendor`, `unassignThreadVendor` (Task 3), `ThreadDetail.vendorId` (Task 1)
- Produces: `<VendorRail thread={thread} vendor={vendor} />`

- [ ] **Step 1: Write `AssignVendorForm`**

Create `apps/hoa/src/app/(dashboard)/inbox/[id]/AssignVendorForm.tsx`:

```tsx
'use client'

import { useEffect, useState, useTransition } from 'react'
import { Alert, Button } from '@homeowner-portal/ui'
import { searchVendors, assignThreadToVendor, type VendorOption } from '@/lib/inbox/vendor/actions'
import { QuickCreateVendorModal } from './QuickCreateVendorModal'

interface Props {
  threadId: string
  senderEmail: string | null
  senderName: string | null
}

/**
 * Type-ahead over existing vendors, modeled on AssignPropertyForm. The
 * "create new" affordance appears ONLY after a search has run and returned
 * nothing — searching first is what stops a second vendor being created for
 * a company already on file.
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
    startAssign(async () => {
      const result = await assignThreadToVendor(threadId, vendorId)
      if ('error' in result) setError(result.error)
    })
  }

  const noMatches = searched && !searchPending && results.length === 0

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
        File under vendor
      </label>
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search vendors by name or email…"
        className="w-full rounded-md border border-border bg-background p-2 text-sm"
        autoComplete="off"
      />

      {results.length > 0 ? (
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border">
          {results.map((vendor) => (
            <li key={vendor.vendorId}>
              <button
                type="button"
                disabled={assignPending}
                onClick={() => assign(vendor.vendorId)}
                className="block w-full px-2 py-1.5 text-left text-sm hover:bg-muted/10"
              >
                {vendor.legalName}
                {vendor.incomplete ? ' — setup incomplete' : ''}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {noMatches ? (
        <div className="space-y-1">
          <p className="text-xs text-muted">No matching vendors.</p>
          <Button size="sm" variant="outline" onClick={() => setModalOpen(true)} className="w-full">
            Create new vendor
          </Button>
        </div>
      ) : null}

      {error ? <Alert variant="error">{error}</Alert> : null}

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
```

- [ ] **Step 2: Write `VendorRail`**

Create `apps/hoa/src/app/(dashboard)/inbox/[id]/VendorRail.tsx`:

```tsx
import Link from 'next/link'
import type { ThreadDetail } from '@/lib/inbox/queries'
import { AssignVendorForm } from './AssignVendorForm'
import { UnassignVendorButton } from './AssignVendorForm'

export interface RailVendor {
  vendorId: string
  legalName: string
  trades: string[] | null
  status: string
  incomplete: boolean
}

/**
 * Rendered independently of PropertyRail, not nested inside it. A thread can
 * be filed under a vendor whether or not it has a property, and PropertyRail
 * early-returns on thread.unitId — nesting would make an unfiled thread
 * unable to receive a vendor at all.
 */
export function VendorRail({
  thread,
  vendor,
  senderEmail,
  senderName,
}: {
  thread: ThreadDetail
  vendor: RailVendor | null
  senderEmail: string | null
  senderName: string | null
}) {
  if (thread.vendorId && vendor) {
    return (
      <div className="space-y-2 border-t border-border p-3">
        <p className="text-[10px] uppercase tracking-wide text-muted">Vendor</p>
        <p className="font-semibold text-foreground">{vendor.legalName}</p>
        <p className="text-xs text-muted">
          {vendor.trades?.join(' · ') || 'No trades on file'} · {vendor.status}
        </p>
        {vendor.incomplete ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Setup incomplete — this vendor still needs an EIN and a trade before
            it can be used for 1099s, RFPs, or compliance checks.
          </p>
        ) : null}
        <Link href={`/vendors/${vendor.vendorId}`} className="block text-xs underline">
          Open vendor →
        </Link>
        <UnassignVendorButton threadId={thread.id} />
      </div>
    )
  }

  // vendorId set but the vendor row is gone — say so rather than silently
  // showing the assign form, which would misrepresent a filed thread.
  if (thread.vendorId && !vendor) {
    return (
      <div className="space-y-2 border-t border-border p-3">
        <p className="text-[10px] uppercase tracking-wide text-muted">Vendor</p>
        <p className="text-xs text-muted">
          Filed under a vendor that no longer exists. Re-file it below.
        </p>
        <AssignVendorForm threadId={thread.id} senderEmail={senderEmail} senderName={senderName} />
      </div>
    )
  }

  return (
    <div className="space-y-2 border-t border-border p-3">
      <AssignVendorForm threadId={thread.id} senderEmail={senderEmail} senderName={senderName} />
    </div>
  )
}
```

- [ ] **Step 3: Add `UnassignVendorButton`**

Append to `apps/hoa/src/app/(dashboard)/inbox/[id]/AssignVendorForm.tsx`:

```tsx
export function UnassignVendorButton({ threadId }: { threadId: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <>
      <Button
        size="sm"
        variant="outline"
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
```

Add `unassignThreadVendor` to the existing import from `@/lib/inbox/vendor/actions`.

- [ ] **Step 4: Wire it into the page**

In `apps/hoa/src/app/(dashboard)/inbox/[id]/page.tsx`:

1. Add `import { VendorRail, type RailVendor } from './VendorRail'`.
2. After `getThreadDetail` resolves, load the vendor when `thread.vendorId` is set:

```typescript
let railVendor: RailVendor | null = null
if (thread.vendorId) {
  const { data } = await supabase
    .from('vendors' as never)
    .select('id, legal_name, trades, status, ein')
    .eq('id', thread.vendorId)
    .eq('organization_id', org.id)
    .maybeSingle()
  if (data) {
    const v = data as { id: string; legal_name: string; trades: string[] | null; status: string; ein: string | null }
    railVendor = {
      vendorId: v.id,
      legalName: v.legal_name,
      trades: v.trades,
      status: v.status,
      incomplete: !v.ein || !v.trades || v.trades.length === 0,
    }
  }
}
```

3. Render `<VendorRail ... />` directly beneath the existing `<PropertyRail ... />`, passing the newest inbound message's `from_email`/`from_name` (already present in `thread.messages` — take the last entry with `direction === 'inbound'`).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p apps/hoa/tsconfig.json`
Expected: No errors found.

- [ ] **Step 6: Commit**

```bash
git add "apps/hoa/src/app/(dashboard)/inbox/[id]"
git commit -m "feat(inbox): show and set a thread's vendor in the rail"
```

---

### Task 8: Quick-create modal

**Files:**
- Create: `apps/hoa/src/app/(dashboard)/inbox/[id]/QuickCreateVendorModal.tsx`

**Interfaces:**
- Consumes: `quickCreateVendor` (Task 4), `extractVendorFromThread` (Task 6), `assignThreadToVendor` (Task 3)
- Produces: `<QuickCreateVendorModal threadId senderEmail senderName initialName onClose />`

- [ ] **Step 1: Write the modal**

Create `apps/hoa/src/app/(dashboard)/inbox/[id]/QuickCreateVendorModal.tsx`:

```tsx
'use client'

import { useEffect, useState, useTransition } from 'react'
import { Alert, Button } from '@homeowner-portal/ui'
import {
  quickCreateVendor,
  assignThreadToVendor,
  extractVendorFromThread,
} from '@/lib/inbox/vendor/actions'

interface Props {
  threadId: string
  senderEmail: string | null
  senderName: string | null
  initialName: string
  onClose: () => void
}

/**
 * Opens instantly with what the headers already give us (free and
 * deterministic), then fills the rest from the signature block.
 *
 * Every model-filled field carries a "from signature" chip that clears once
 * edited. That chip is what makes "you confirm" real rather than
 * decorative — the reviewer can see what was guessed versus what came from
 * the header. Extraction failure leaves the form fully usable.
 */
export function QuickCreateVendorModal({
  threadId,
  senderEmail,
  senderName,
  initialName,
  onClose,
}: Props) {
  const [legalName, setLegalName] = useState(initialName || senderName || '')
  const [primaryEmail, setPrimaryEmail] = useState(senderEmail ?? '')
  const [primaryPhone, setPrimaryPhone] = useState('')
  const [trade, setTrade] = useState('')
  const [aiFields, setAiFields] = useState<Set<string>>(new Set())
  const [extracting, setExtracting] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [duplicateId, setDuplicateId] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // Whether the name was already seeded from the search box or the display
  // name. Computed from props, NOT read out of state inside the effect —
  // mutating a Set inside a setState updater would double-fire under React
  // StrictMode and mislabel which fields the model actually supplied.
  const seededName = (initialName || senderName || '').trim()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await extractVendorFromThread(threadId)
      if (cancelled) return
      setExtracting(false)
      if ('error' in result) return // stay usable; extraction is not a gate

      const e = result.extracted
      const filled = new Set<string>()

      // Only fill the name when nothing was seeded — never overwrite what
      // the user already typed into the search box.
      if (e.legalName && !seededName) {
        setLegalName(e.legalName)
        filled.add('legalName')
      }
      if (e.primaryPhone) {
        setPrimaryPhone(e.primaryPhone)
        filled.add('primaryPhone')
      }
      if (e.trade) {
        setTrade(e.trade)
        filled.add('trade')
      }
      setAiFields(filled)
    })()
    return () => {
      cancelled = true
    }
  }, [threadId, seededName])

  function clearChip(field: string) {
    setAiFields((current) => {
      if (!current.has(field)) return current
      const next = new Set(current)
      next.delete(field)
      return next
    })
  }

  function submit() {
    setError(null)
    setDuplicateId(null)
    start(async () => {
      const result = await quickCreateVendor(threadId, {
        legalName,
        primaryEmail,
        primaryPhone: primaryPhone || null,
        trade: trade || null,
        aiGenerated: aiFields.size > 0,
      })
      if ('ok' in result) {
        onClose()
        return
      }
      setError(result.error)
      if (result.duplicateVendorId) setDuplicateId(result.duplicateVendorId)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md space-y-3 rounded-md border border-border bg-background p-4">
        <p className="text-sm font-semibold text-foreground">Create vendor from this email</p>
        {extracting ? <p className="text-xs text-muted">Reading the signature…</p> : null}

        <Field label="Company name" value={legalName} ai={aiFields.has('legalName')}
          onChange={(v) => { setLegalName(v); clearChip('legalName') }} />
        <Field label="Email" value={primaryEmail} ai={false}
          onChange={(v) => setPrimaryEmail(v)} />
        <Field label="Phone" value={primaryPhone} ai={aiFields.has('primaryPhone')}
          onChange={(v) => { setPrimaryPhone(v); clearChip('primaryPhone') }} />
        <Field label="Trade" value={trade} ai={aiFields.has('trade')}
          onChange={(v) => { setTrade(v); clearChip('trade') }} />

        <p className="text-xs text-muted">
          Created as a prospect. Add an EIN and trade on the vendor page before
          using it for 1099s, RFPs, or compliance.
        </p>

        {error ? <Alert variant="error">{error}</Alert> : null}
        {duplicateId ? (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() =>
              start(async () => {
                await assignThreadToVendor(threadId, duplicateId)
                onClose()
              })
            }
          >
            File this thread under the existing vendor instead
          </Button>
        ) : null}

        <div className="flex gap-2">
          <Button size="sm" loading={pending} onClick={submit} disabled={!legalName.trim() || !primaryEmail.trim()}>
            Create &amp; file
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  ai,
  onChange,
}: {
  label: string
  value: string
  ai: boolean
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
        {ai ? (
          <span className="rounded bg-primary/10 px-1 py-0.5 text-[10px] font-normal normal-case text-primary">
            from signature
          </span>
        ) : null}
      </label>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-border bg-background p-2 text-sm"
        autoComplete="off"
      />
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p apps/hoa/tsconfig.json`
Expected: No errors found.

- [ ] **Step 3: Commit**

```bash
git add "apps/hoa/src/app/(dashboard)/inbox/[id]/QuickCreateVendorModal.tsx"
git commit -m "feat(inbox): add quick-create vendor modal with signature provenance chips"
```

---

### Task 9: Auto-match on ingest

**Files:**
- Modify: `apps/hoa/src/lib/inbox/match.ts`
- Test: `apps/hoa/src/lib/inbox/match.test.ts` (exists)

**Interfaces:**
- Consumes: nothing from earlier tasks (reads `vendors.primary_email` directly)
- Produces: `findVendorBySenderEmail(supabase, orgId, senderEmail): Promise<string | null>`

- [ ] **Step 1: Write the failing test**

Append to `apps/hoa/src/lib/inbox/match.test.ts`:

```typescript
import { shouldSetVendor } from './match'

describe('shouldSetVendor', () => {
  it('sets the vendor when the thread has none', () => {
    expect(shouldSetVendor(null, 'vendor-1')).toBe(true)
  })

  it('never overwrites a vendor already on the thread — a human assignment wins', () => {
    expect(shouldSetVendor('vendor-existing', 'vendor-1')).toBe(false)
  })

  it('does nothing when no vendor matched the sender', () => {
    expect(shouldSetVendor(null, null)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/hoa/src/lib/inbox/match.test.ts`
Expected: FAIL — `shouldSetVendor` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `apps/hoa/src/lib/inbox/match.ts`:

```typescript
/**
 * Vendor identity is an EXACT email match — no confidence tiers, no
 * heuristics. It is deliberately kept out of `decideMatch`, which is a
 * confidence ladder for property/resident matching: folding an exact-match
 * rule into that ladder would add a tier that means something different
 * from all the others and perturb every existing case.
 *
 * A human's manual assignment always wins, so this only ever fills a null.
 */
export function shouldSetVendor(
  currentVendorId: string | null,
  matchedVendorId: string | null,
): boolean {
  return currentVendorId === null && matchedVendorId !== null
}

export async function findVendorBySenderEmail(
  supabase: SupabaseClient<Database>,
  orgId: string,
  senderEmail: string | null,
): Promise<string | null> {
  if (!senderEmail) return null

  const { data, error } = await supabase
    .from('vendors' as never)
    .select('id')
    .eq('organization_id', orgId)
    .eq('primary_email', senderEmail.trim().toLowerCase())
    .maybeSingle()

  if (error) {
    logDbError('findVendorBySenderEmail', 'vendors', { orgId }, error)
    return null
  }
  return data ? (data as { id: string }).id : null
}
```

Use whatever `SupabaseClient`/`Database` type names `match.ts` already imports at the top — do not add new imports if equivalent ones are present.

**Coverage boundary — read this.** The spec asks for a test that auto-match "sets `vendor_id` on exact sender-email hit, and leaves it null otherwise." Only the *decision* half (`shouldSetVendor`) is unit-testable: `findVendorBySenderEmail` issues a real query, and the root harness is pure-modules-only. The query half is covered by manual verification step 7, not by an automated test. Do not fake a passing test over a mocked query and call that equivalent — it would assert the mock, not the lookup.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/hoa/src/lib/inbox/match.test.ts`
Expected: PASS — all pre-existing tests plus the 3 new ones.

- [ ] **Step 5: Call it from `applyMatch`**

In `applyMatch`, after the existing property-match update, add a vendor pass that is independent of the property outcome (a thread may auto-file to a vendor while remaining `needs_review` for a property):

```typescript
const matchedVendorId = await findVendorBySenderEmail(supabase, orgId, senderEmail)
if (shouldSetVendor(existingVendorId, matchedVendorId)) {
  // Conditional on vendor_id still being null, so a human who assigned a
  // vendor between the read and this write is never overwritten.
  const { error: vendorError } = await supabase
    .from('inbox_threads')
    .update({ vendor_id: matchedVendorId } as never)
    .eq('id', threadId)
    .eq('organization_id', orgId)
    .is('vendor_id', null)
  if (vendorError) logDbError('applyMatch', 'inbox_threads', { orgId, threadId }, vendorError)
}
```

Read `applyMatch`'s existing signature first to get the real variable names for `supabase`, `orgId`, `threadId`, and the sender email; add `existingVendorId` by including `vendor_id` in whatever thread row it already reads. A vendor-match failure must never fail the whole ingest — log and continue, matching how the surrounding code treats non-fatal errors.

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: PASS, with no pre-existing test broken.

- [ ] **Step 7: Commit**

```bash
git add apps/hoa/src/lib/inbox/match.ts apps/hoa/src/lib/inbox/match.test.ts
git commit -m "feat(inbox): auto-file threads from a known vendor address"
```

---

### Task 10: Completeness banner on the vendor page

**Files:**
- Modify: `apps/hoa/src/app/(dashboard)/vendors/[id]/page.tsx`

**Interfaces:**
- Consumes: `isVendorIncomplete` (Task 2)

- [ ] **Step 1: Add the banner**

Read the vendor detail page first to find where the vendor row is already loaded and what it selects. Ensure `ein` and `trades` are in that select, then render above the main content:

```tsx
{isVendorIncomplete({ ein: vendor.ein, trades: vendor.trades }) ? (
  <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
    <p className="font-semibold">Finish setting up this vendor</p>
    <p className="mt-1 text-xs">
      Still missing:{' '}
      {[!vendor.ein ? 'EIN' : null, !vendor.trades?.length ? 'trade' : null]
        .filter(Boolean)
        .join(' and ')}
      . This vendor cannot be used for 1099 reporting, RFP invitations, or
      compliance checks until both are set.
    </p>
  </div>
) : null}
```

Import `isVendorIncomplete` from `@/lib/inbox/vendor/schema`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p apps/hoa/tsconfig.json`
Expected: No errors found.

- [ ] **Step 3: Full verification**

Run: `npx vitest run`
Expected: PASS, all tests.

Run: `npx tsc --noEmit -p apps/hoa/tsconfig.json && npx tsc --noEmit -p packages/workflows/tsconfig.json`
Expected: No errors found.

- [ ] **Step 4: Commit**

```bash
git add "apps/hoa/src/app/(dashboard)/vendors/[id]/page.tsx"
git commit -m "feat(vendors): flag a quick-created vendor as needing EIN and trade"
```

---

## Manual verification

After Task 10, verify end-to-end against the live app:

1. Open a thread from a non-resident sender. The rail shows "File under vendor".
2. Search a nonsense string → "No matching vendors" + "Create new vendor".
3. Open the modal → email and display name are filled immediately; "Reading the signature…" appears, then phone/trade fill with "from signature" chips.
4. Edit the phone → its chip disappears.
5. Create → the thread's rail shows the vendor with a "Setup incomplete" warning.
6. Open the vendor page → the "Finish setting up this vendor" banner lists EIN and trade.
7. Create a second thread from the same sender address and re-run ingest → it auto-files to that vendor.
8. Try creating a second vendor with the same email → blocked, with the "file under the existing vendor instead" button.
