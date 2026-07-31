/**
 * Pure, framework-free validation for the mailbox scope form.
 *
 * Extracted out of `actions.ts` so it can be unit tested without pulling in
 * `next/headers`/`next/cache` or a Supabase client (both of which
 * `actions.ts` imports at module scope and which only work inside a real
 * Next.js server request).
 *
 * The rules here MUST stay consistent with `packages/mailbox/src/scope.ts`
 * (`ADDRESS_RE` / `LABEL_RE` used by `buildScopeQuery`), so the action
 * rejects a scope submission at save time for exactly the same reasons a
 * sync would later reject it when building the Gmail query — never more
 * permissive (which would let an invalid scope through to sync, where it
 * currently throws and silently stalls the mailbox), and never stricter
 * (which would block a real address, e.g. a `+`-tagged alias or a
 * subdomain, that `buildScopeQuery` would happily accept).
 */

import { z } from 'zod'

// Mirrors packages/mailbox/src/scope.ts ADDRESS_RE exactly: a single `@`,
// no whitespace/quotes/parens/commas (Gmail query metacharacters), on
// both sides.
const ADDRESS_RE = /^[^\s"'()<>,]+@[^\s"'()<>,]+$/

// Mirrors packages/mailbox/src/scope.ts LABEL_RE exactly: conservative
// Gmail label id tokens only.
const LABEL_RE = /^[A-Za-z0-9_-]+$/

export const ScopeSchema = z
  .object({
    accountId: z.string().uuid(),
    scopeMode: z.enum(['address', 'label', 'all']),
    // Trimmed here — not just at the FormData layer — so a whitespace-only
    // value ("   ") can never slip past the emptiness check below, the
    // same fail-closed `.trim()` pattern packages/mailbox/src/scope.ts
    // uses in `isInScope`.
    scopeValue: z
      .string()
      .max(320)
      .optional()
      .transform((value) => value?.trim()),
  })
  .superRefine((data, ctx) => {
    if (data.scopeMode === 'all') return

    if (!data.scopeValue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scopeValue'],
        message: 'Pick an address or a label for this scope.',
      })
      return
    }

    // Cross-field check: the value must match the shape the SELECTED
    // mode requires. This is the fix for the critical bug — a stale
    // address value carried over while `label` mode is selected (or vice
    // versa) is rejected here instead of being persisted and only
    // discovered later when buildScopeQuery throws during a sync.
    if (data.scopeMode === 'address' && !ADDRESS_RE.test(data.scopeValue)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scopeValue'],
        message: 'Enter a single valid email address for this scope.',
      })
    }

    if (data.scopeMode === 'label' && !LABEL_RE.test(data.scopeValue)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scopeValue'],
        message: 'Pick a valid Gmail label for this scope.',
      })
    }
  })

export type ScopeInput = z.infer<typeof ScopeSchema>
