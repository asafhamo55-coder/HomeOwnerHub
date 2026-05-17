# `apps/hoa` — HOA Hub

The HOA-facing Next.js app of HomeownerHub. Serves three user roles
(admin, board, resident) from one codebase via RBAC, with separate UI
trees per role.

## Quick orientation

| Role | URL tree | What they see |
|---|---|---|
| **Admin** | `/` (manager dashboard) + `/settings/members` | Everything Board sees, plus member management |
| **Board** | `/` (manager dashboard) | Vendors, RFPs, bids, violations, dues, accounting, governing docs, state law |
| **Resident** | `/resident/*` | My unit, dues balance, governing docs read-only, Ask the Docs, ARC submission, violation reporting, announcements |

Role lives on `org_members.role`. Migration `0012_rbac_roles.sql`
establishes the vocabulary and the SQL helpers (`auth_role_in_org`,
`auth_is_admin`, `auth_is_board_or_admin`, `auth_owner_unit_ids`)
that gate RLS on every sensitive table.

## Module map

| Module | Routes | Tables | Workflows |
|---|---|---|---|
| Governing Docs | `/documents/governing`, `/ai/ask`, `/resident/ask` | `governing_documents`, `governing_document_chunks` | **W1** Governing Docs Brain |
| Violations (formal) | `/violations`, `/violations/approval-queue` | `hoa_violations` | **W3** Violation Inspector |
| Violations (resident reports) | `/violations/reports`, `/resident/report-violation` | `resident_violation_reports` | — |
| Dues | `/dues`, `/resident/dues` | `hoa_dues`, `assessments`, `payments` (accounting) | — |
| Accounting | `/accounting/*` | `funds`, `journal_entries`, `ledger_entries`, `bank_*`, `invoices`, `payments`, `payment_methods`, … | **W18** Bank Reconciliation |
| Vendors | `/vendors`, `/vendors/invitations`, `/vendors/[id]/compliance`, `/vendor-onboard/[token]` | `vendors`, `vendor_compliance`, `vendor_documents`, `vendor_onboarding_invitations` | **W21** Vendor Onboarder |
| RFPs | `/rfps`, `/rfps/[id]`, `/rfps/[id]/bids`, `/rfp-bid/[token]` | `rfps`, `rfp_line_items`, `rfp_invitations` | **W22** RFP Composer |
| Bids | `/rfps/[id]/bids`, `/rfps/[id]/comparison` | `bids`, `bid_line_items`, `bid_comparisons` | **W23** Bid Comparator |
| ARC | `/arc`, `/resident/arc` | `arc_requests` | — |
| State Law | `/legal`, `/legal/ask`, `/legal/updates`, `/resident/legal`, `/resident/announcements` | `state_statutes`, `state_statute_chunks`, `state_law_updates` | **W30** State Law Brain |
| Members | `/settings/members` (admin only) | `org_members`, `profiles` | — |

## Workflows (`packages/workflows/src`)

Each workflow wraps an LLM pipeline behind a typed contract via
`defineWorkflow`. Inputs and outputs are zod-validated; runs persist
to `ai_runs` for audit.

- **W1** Governing Docs Brain — RAG over the association's CC&Rs,
  Bylaws, Rules. Returns answers with citations to specific chunks.
- **W3** Violation Inspector — drafts a violation notice grounded in
  the CC&Rs. Always lands as `pending_human_approval`.
- **W18** Bank Reconciliation — matches `bank_transactions` to
  `journal_entries` via memo code, fuzzy amount, and confidence
  scoring. (In-flight on a separate branch.)
- **W21** Vendor Onboarder — grades a vendor's COI/W-9/license
  against `associations.compliance_settings`, returns
  green/yellow/red/missing + deficiency list, upserts
  `vendor_compliance`.
- **W22** RFP Composer — turns the board's free-text need into a
  structured RFP (scope, line items, evaluation criteria, insurance
  requirements copied verbatim from association settings).
- **W23** Bid Comparator — aligns 2-5 submitted bids line-by-line,
  flags exclusions and additions, writes a board-facing
  recommendation memo. Never picks a winner.
- **W30** State Law Brain — RAG over state HOA statutes
  (`state_statutes`), state-scoped. Returns answers with code-section
  citations and a mandatory "not legal advice" disclaimer.

## Migration history

Numbered chronologically. Each is idempotent; apply in order via the
Supabase SQL editor (see `docs/APPLY_v1.1_MIGRATIONS.md` for the
procedure).

| File | Adds |
|---|---|
| `0000_schema.sql` | Phase 1 — orgs, org_members, profiles, hoa_violations, hoa_documents, etc. |
| `0001_auth_fixes.sql` | Founder-flow INSERT policy |
| `0002_wizard_drafts.sql` | `wizard_drafts` table for resumable forms |
| `0003_storage_policies.sql` | RLS on `storage.objects` for hoa-photos, hoa-documents, eviction-docs |
| `0004_v1_schema_phase2a.sql` | associations, units, ownerships, tenancies, governing_documents, ai_runs |
| `0005_units_backfill.sql` | Backfill units / ownerships / tenancies from Phase-1 tables |
| `0005a_search_rpc.sql` | `search_governing_chunks` hybrid RPC |
| `0005b_embedding_dim_swap.sql` | vector(1024) → vector(768) for BGE-base-en-v1.5 |
| `0006_accounting.sql` | Module 6 — funds, journal_entries, ledger_entries, budgets, bank_*, invoices, payments, … |
| `0007_vendors.sql` | Module 7 — vendors, vendor_compliance, vendor_documents, rfps, rfp_invitations, bids, bid_comparisons, vendor_internal_ratings, vendor_external_data |
| `0008_association_compliance_settings.sql` | `associations.compliance_settings` jsonb |
| `0009_vendor_onboarding_invitations.sql` | Tokenized vendor self-service onboarding |
| `0010_state_statutes.sql` | Module 8 — state_statutes, state_statute_chunks, search_state_statute_chunks RPC |
| `0011_state_law_updates.sql` | Curated "recent legal updates" feed |
| `0012_rbac_roles.sql` | Module 9 — remaps `org_members.role` to {admin, board, resident}, adds auth helper functions, tightens RLS on board-only tables |
| `0013_resident_submissions.sql` | arc_requests + resident_violation_reports tables |
| `0014_bids_parsed_pdf_text.sql` | `bids.parsed_pdf_text` + `parsed_pdf_at` for board reading the uploaded bid PDF inline |

## Required environment variables

| Var | Used by |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | All client + server Supabase calls |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser client + RLS-bound server client |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin client (workflow audit logs, tokenized public flows, RPC bypass) |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | OpenAI-compatible LLM endpoint (e.g. Groq for the llama-3.3 family) |
| `HUGGINGFACE_API_TOKEN` | Embeddings via BAAI/bge-base-en-v1.5 |
| `NEXT_PUBLIC_APP_URL` | Used to build tokenized links in transactional emails |
| `RESEND_API_KEY` + `EMAIL_FROM` | Vendor + RFP invitations, manager notifications. Without these, links are surfaced via copy-button instead of email. |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | Billing (subscription management) |
| `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` | Background jobs |

## Public (non-auth) routes

Routes that bypass the auth redirect via `PUBLIC_PREFIXES` in
`src/middleware.ts`:

- `/login`, `/signup`, `/verify`, `/auth/*`
- `/vendor-onboard/[token]` — tokenized vendor self-service onboarding
- `/api/vendor-onboard/[token]/submit` — public submission API
- `/rfp-bid/[token]` — tokenized vendor bid submission
- `/api/rfp-bid/[token]/submit` — public submission API

Authentication for these flows is the unguessable token in the URL,
validated server-side via service-role client. RLS does not gate them
because the caller is anonymous.

## Local development

```bash
# from repo root
pnpm install
pnpm dev:hoa            # http://localhost:3000
```

Apply migrations to your Supabase project before first run (see
`docs/APPLY_v1.1_MIGRATIONS.md`).

For an admin-bypass during local dev, set `DEV_AUTOLOGIN=1` and
`DEV_AUTOLOGIN_EMAIL` in `.env.local`. Middleware will bounce
unauthenticated requests through `/auth/dev-login` and sign that user
in via the service-role client. Never enable in prod.

## Adding a new role-gated table

1. Migration: add table + `ENABLE ROW LEVEL SECURITY`.
2. RLS policy: `USING (organization_id = ANY (auth_org_ids()) AND auth_is_board_or_admin(organization_id))` for board-only; add a separate policy for resident own-row access if needed.
3. Server actions in `lib/<table>.ts` use the RLS-bound client
   (`getSupabaseServerClient()`), so RLS is the backstop. Call
   `requireBoardOrAdmin()` or `requireAdmin()` at the top of each
   action for clean 403 redirects (the dashboard layout already does
   this for page loads).
4. UI under `(dashboard)/<table>` for the manager surface, or
   `resident/<feature>` for resident-facing pages.

## Adding a new workflow (W##)

1. New directory `packages/workflows/src/W##-<name>/` with
   `prompt.ts`, `tools.ts`, `index.ts`, `eval.ts`. Match the W1 shape.
2. Wrap with `defineWorkflow({...})` from `@homeowner-portal/ai`.
3. Re-export from `packages/workflows/src/index.ts`.
4. Drive from a server action in `apps/hoa/src/lib/<feature>.ts`.

## Conventions

- Server actions live in `apps/hoa/src/lib/<feature>.ts`, marked
  `'use server'`. Reads + writes both go here.
- Server components consume server actions directly; client
  components use `useTransition` + a thin wrapper to call them.
- Token validation for public flows always goes through the
  admin (service-role) client because the caller is unauthenticated.
- All AI features ship with citation and a "not advice" disclaimer
  where applicable. The W30 prompt enforces this at the model layer;
  the UI surfaces the disclaimer verbatim.
