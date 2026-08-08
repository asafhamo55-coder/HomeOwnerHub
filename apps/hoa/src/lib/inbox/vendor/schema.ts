/**
 * Fast-create validation, kept out of actions.ts because `'use server'`
 * modules may export only async functions — the same reason draft/blanks.ts
 * exists next to draft/actions.ts.
 *
 * This is deliberately NOT `CreateVendorSchema` from lib/vendors.ts. That
 * schema requires a 9-digit EIN and at least one trade, because it guards
 * the full onboarding form where both drive 1099 reporting and license
 * validation. An email supplies neither. Weakening the shared schema would
 * weaken every caller, so fast-create gets its own and the resulting row is
 * marked incomplete rather than pretending to be fully onboarded.
 */
import { z } from 'zod'

export const QuickCreateVendorSchema = z.object({
  legalName: z.string().trim().min(2, 'Company name is required.'),
  // Required and lowercased: this is both the duplicate key and the
  // auto-match key, so 'Jose@X.com' and 'jose@x.com' must not become two
  // vendors, and a later inbound from either casing must match one row.
  primaryEmail: z.string().trim().toLowerCase().email('Email looks invalid.'),
  dba: z.string().trim().min(1).nullable().optional(),
  primaryPhone: z.string().trim().min(1).nullable().optional(),
  // Single trade, not an array: a signature block states at most one line of
  // business, and inventing a second would break W33's never-invent rule.
  // Mapped onto vendors.trades (text[]) at insert time.
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
  ein: z
    .string()
    .trim()
    .transform((value) => value.replace(/\D/g, ''))
    .refine((digits) => digits.length === 9, 'EIN must contain exactly 9 digits.')
    .nullable()
    .optional(),
  // True when any field was filled by W33 rather than typed by a human.
  aiGenerated: z.boolean().default(false),
})

// `ein` is now accepted, where v1 stripped it.
//
// v1's reasoning was that the only possible source was model inference from
// prose, and an invented tax id corrupts 1099 reporting. That is still true
// of prose — W33 drops any EIN unless an attachment supplied it. What
// reaches this schema has been through a W-9 AND been confirmed by a
// reviewer looking at the document, so it is human-attested input like the
// phone number beside it.
//
// Validated to nine digits: a value that cannot be an EIN is a parse
// artefact, and a blank is better than a wrong tax id nobody re-checks.

export type QuickCreateVendorInput = z.infer<typeof QuickCreateVendorSchema>

/**
 * Completeness is DERIVED, never stored. A stored `is_quick_created` flag
 * drifts out of sync with the fields it describes the moment someone fills
 * one of them in.
 */
export function isVendorIncomplete(vendor: {
  ein: string | null
  trades: string[] | null
}): boolean {
  return !vendor.ein || !vendor.trades || vendor.trades.length === 0
}
