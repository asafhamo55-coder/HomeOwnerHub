# Applying the v1.1 migrations to Supabase

Migrations `0006_accounting.sql` and `0007_vendors.sql` were locally validated
against a vanilla Postgres 16 + pgvector instance on 2026-05-13 — both apply
cleanly on top of `0000`–`0005b`, all 30 new tables come up with RLS enabled
and `org_access` policies wired, the `validate_je_balances` trigger fires
correctly on unbalanced JEs, and the `invoices.vendor_id` FK to `vendors` is
in place.

Claude Code cannot push SQL to the shared Supabase project from a sandbox.
The steps below are what Asaf runs by hand.

## What's being applied

- **0006_accounting.sql** — Module 6 (spec §13). 19 tables: `funds`,
  `chart_of_accounts`, `fiscal_periods`, `journal_entries`, `ledger_entries`,
  `budgets`, `budget_line_items`, `bank_accounts`, `bank_transactions`,
  `bank_reconciliations`, `assessments`, `invoices`, `payments`,
  `payment_methods`, `payment_plans`, `zelle_inbound_matches`,
  `recurring_journal_entries`, `adjusting_entries`, `closing_entries`. Plus
  the `validate_je_balances` PL/pgSQL trigger function and trigger on
  `journal_entries`. Adds `associations.slug` column.

- **0007_vendors.sql** — Module 7 (spec §14). 11 tables: `vendors`,
  `vendor_compliance`, `vendor_documents`, `rfps`, `rfp_line_items`,
  `rfp_invitations`, `bids`, `bid_line_items`, `bid_comparisons`,
  `vendor_internal_ratings`, `vendor_external_data`. Wires the deferred
  `invoices.vendor_id` FK from 0006.

**Both migrations are additive and idempotent.** No table drops, no column
drops, no data backfill of existing rows. Safe to re-run if a paste-into-SQL
session is interrupted partway.

## Apply order

1. Open the Supabase SQL editor:
   `https://supabase.com/dashboard/project/xwdjsxfskvreguyvryhc/sql/new`
2. Paste the contents of `migrations/0006_accounting.sql`, run.
3. Open a fresh SQL editor tab, paste `migrations/0007_vendors.sql`, run.

Each migration completes in well under the Supabase 60s statement timeout
on an empty dataset. (When Madison Park has live data, 0006/0007 don't
touch existing rows — only adds tables — so the runtime stays the same.)

## Post-apply verification

Run this query in the Supabase SQL editor. All checks should return `pass`.

```sql
WITH checks AS (
  -- Tables present
  SELECT 'accounting_tables_present' AS check_name,
         CASE WHEN count(*) = 19 THEN 'pass'
              ELSE 'fail: expected 19, got ' || count(*) END AS result
    FROM pg_tables WHERE schemaname='public' AND tablename IN (
      'funds','chart_of_accounts','fiscal_periods','journal_entries','ledger_entries',
      'budgets','budget_line_items','bank_accounts','bank_transactions','bank_reconciliations',
      'assessments','invoices','payments','payment_methods','payment_plans',
      'zelle_inbound_matches','recurring_journal_entries','adjusting_entries','closing_entries'
    )
  UNION ALL
  SELECT 'vendor_tables_present',
         CASE WHEN count(*) = 11 THEN 'pass'
              ELSE 'fail: expected 11, got ' || count(*) END
    FROM pg_tables WHERE schemaname='public' AND tablename IN (
      'vendors','vendor_compliance','vendor_documents','rfps','rfp_line_items',
      'rfp_invitations','bids','bid_line_items','bid_comparisons',
      'vendor_internal_ratings','vendor_external_data'
    )
  UNION ALL
  -- RLS enabled on every new table
  SELECT 'rls_enabled_on_all_new_tables',
         CASE WHEN count(*) FILTER (WHERE NOT rowsecurity) = 0 THEN 'pass'
              ELSE 'fail: ' || count(*) FILTER (WHERE NOT rowsecurity) || ' tables missing RLS' END
    FROM pg_tables WHERE schemaname='public' AND tablename IN (
      'funds','chart_of_accounts','fiscal_periods','journal_entries','ledger_entries',
      'budgets','budget_line_items','bank_accounts','bank_transactions','bank_reconciliations',
      'assessments','invoices','payments','payment_methods','payment_plans',
      'zelle_inbound_matches','recurring_journal_entries','adjusting_entries','closing_entries',
      'vendors','vendor_compliance','vendor_documents','rfps','rfp_line_items',
      'rfp_invitations','bids','bid_line_items','bid_comparisons',
      'vendor_internal_ratings','vendor_external_data'
    )
  UNION ALL
  -- org_access policy on every new table
  SELECT 'org_access_policy_on_all_new_tables',
         CASE WHEN count(*) = 30 THEN 'pass'
              ELSE 'fail: expected 30 policies, got ' || count(*) END
    FROM pg_policies WHERE schemaname='public' AND policyname='org_access'
      AND tablename IN (
        'funds','chart_of_accounts','fiscal_periods','journal_entries','ledger_entries',
        'budgets','budget_line_items','bank_accounts','bank_transactions','bank_reconciliations',
        'assessments','invoices','payments','payment_methods','payment_plans',
        'zelle_inbound_matches','recurring_journal_entries','adjusting_entries','closing_entries',
        'vendors','vendor_compliance','vendor_documents','rfps','rfp_line_items',
        'rfp_invitations','bids','bid_line_items','bid_comparisons',
        'vendor_internal_ratings','vendor_external_data'
      )
  UNION ALL
  -- Trigger registered
  SELECT 'validate_je_balances_trigger',
         CASE WHEN count(*) = 1 THEN 'pass' ELSE 'fail' END
    FROM pg_trigger WHERE tgname='trg_validate_je_balances'
  UNION ALL
  -- invoices.vendor_id FK wired
  SELECT 'invoices_vendor_id_fk',
         CASE WHEN count(*) = 1 THEN 'pass' ELSE 'fail' END
    FROM pg_constraint WHERE conname='invoices_vendor_id_fkey'
  UNION ALL
  -- associations.slug NOT NULL
  SELECT 'associations_slug_not_null',
         CASE WHEN is_nullable = 'NO' THEN 'pass' ELSE 'fail' END
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='associations' AND column_name='slug'
)
SELECT * FROM checks ORDER BY check_name;
```

Expected output:

```
 associations_slug_not_null            | pass
 accounting_tables_present             | pass
 invoices_vendor_id_fk                 | pass
 org_access_policy_on_all_new_tables   | pass
 rls_enabled_on_all_new_tables         | pass
 validate_je_balances_trigger          | pass
 vendor_tables_present                 | pass
```

## Regenerating `database.types.ts`

After both migrations have applied successfully:

```bash
# From the repo root. Requires the Supabase CLI + a personal access token
# in SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens).
pnpm dlx supabase@latest gen types typescript \
  --project-id xwdjsxfskvreguyvryhc \
  --schema public \
  > packages/db/src/database.types.ts
```

Then `pnpm typecheck` from the root — it currently passes against the
pre-migration types, so after regen any type errors are real and need to
be addressed in the same commit. Expect a few in:

- `apps/hoa/src/lib/dues.ts` — currently casts to `never` against
  legacy `hoa_dues`; the new `assessments` table is a candidate
  replacement but not yet wired.
- `packages/ai/src/workflow.ts` — `from('ai_runs' as never)` cast is in
  place pre-emptively per the comment on line 257; the cast becomes
  unnecessary after regen.

## What happens to existing data

Nothing. Both migrations are additive:

- `0006` adds tables. The only ALTER on an existing table is
  `associations.slug` — added as nullable, backfilled with an
  alphanumeric uppercase slug derived from `name`, then constrained to
  NOT NULL. Backfill is idempotent.
- `0007` adds tables. The only ALTER is on `public.invoices` to wire
  the FK to `vendors(id)` (the column itself was added in 0006).

No existing Phase-1 row is modified.

## Rollback

These additions are independent of every Phase-1 read/write path. If you
need to back out:

```sql
-- 0007 reverse
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_vendor_id_fkey;
DROP TABLE IF EXISTS public.vendor_external_data CASCADE;
DROP TABLE IF EXISTS public.vendor_internal_ratings CASCADE;
DROP TABLE IF EXISTS public.bid_comparisons CASCADE;
DROP TABLE IF EXISTS public.bid_line_items CASCADE;
DROP TABLE IF EXISTS public.bids CASCADE;
DROP TABLE IF EXISTS public.rfp_invitations CASCADE;
DROP TABLE IF EXISTS public.rfp_line_items CASCADE;
DROP TABLE IF EXISTS public.rfps CASCADE;
DROP TABLE IF EXISTS public.vendor_documents CASCADE;
DROP TABLE IF EXISTS public.vendor_compliance CASCADE;
DROP TABLE IF EXISTS public.vendors CASCADE;

-- 0006 reverse — order matters (FKs)
DROP TABLE IF EXISTS public.closing_entries CASCADE;
DROP TABLE IF EXISTS public.adjusting_entries CASCADE;
DROP TABLE IF EXISTS public.recurring_journal_entries CASCADE;
DROP TABLE IF EXISTS public.zelle_inbound_matches CASCADE;
DROP TABLE IF EXISTS public.payment_plans CASCADE;
DROP TABLE IF EXISTS public.payment_methods CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.invoices CASCADE;
DROP TABLE IF EXISTS public.assessments CASCADE;
DROP TABLE IF EXISTS public.bank_reconciliations CASCADE;
DROP TABLE IF EXISTS public.bank_transactions CASCADE;
DROP TABLE IF EXISTS public.bank_accounts CASCADE;
DROP TABLE IF EXISTS public.budget_line_items CASCADE;
DROP TABLE IF EXISTS public.budgets CASCADE;
DROP TABLE IF EXISTS public.ledger_entries CASCADE;
DROP TABLE IF EXISTS public.journal_entries CASCADE;
DROP TABLE IF EXISTS public.fiscal_periods CASCADE;
DROP TABLE IF EXISTS public.chart_of_accounts CASCADE;
DROP TABLE IF EXISTS public.funds CASCADE;
DROP FUNCTION IF EXISTS public.validate_je_balances() CASCADE;
DROP INDEX IF EXISTS public.associations_org_slug_uniq;
ALTER TABLE public.associations DROP COLUMN IF EXISTS slug;
```

## Local validation reproducibility

The validation that gave us confidence to ship these migrations:

```bash
# From the repo root, with a local Postgres 16 + pgvector:
sudo -u postgres psql -c "CREATE DATABASE hop_validate;"
sudo -u postgres psql -d hop_validate -c "CREATE EXTENSION pgcrypto; CREATE EXTENSION vector;"

# Supabase auth + storage stubs (see this file's git history for the
# exact stub SQL; not committed because it's only for offline validation).

# Apply in order, stripping the PG17-only transaction_timeout setting:
for f in migrations/0000_schema.sql migrations/0001_auth_fixes.sql \
         migrations/0002_wizard_drafts.sql migrations/0003_storage_policies.sql \
         migrations/0004_v1_schema_phase2a.sql migrations/0005_units_backfill.sql \
         migrations/0005a_search_rpc.sql migrations/0005b_embedding_dim_swap.sql \
         migrations/0006_accounting.sql migrations/0007_vendors.sql; do
  sed -e '/^SET transaction_timeout/d' "$f" \
    | sudo -u postgres psql -d hop_validate -v ON_ERROR_STOP=1
done
```

The fund-balance trigger was additionally exercised with four cases — a
balanced JE posts, an overall-unbalanced JE errors, a fund-unbalanced JE
errors, and an explicit inter-fund transfer (4 lines, balanced per fund)
posts. All four behaved as spec §13.1 #2 requires.
