-- verify-0082-money-integrity.sql
--
-- Run AFTER 0082_money_integrity.sql. Every row returns PASS or FAIL.
-- Read-only: safe to run any number of times. Counts only, no row content.

SELECT 'closed-period triggers exist on journal_entries and assessments' AS check,
       CASE WHEN count(*) = 2 THEN 'PASS' ELSE 'FAIL: expected 2, got ' || count(*) END AS result
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgname IN ('journal_entries_closed_period_guard', 'assessments_closed_period_guard');

SELECT 'posted-immutable triggers exist on journal_entries and ledger_entries' AS check,
       CASE WHEN count(*) = 2 THEN 'PASS' ELSE 'FAIL: expected 2, got ' || count(*) END AS result
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgname IN ('journal_entries_posted_immutable', 'ledger_entries_posted_immutable');

SELECT 'the two online payment functions are exempt from the closed-period triggers' AS check,
       CASE WHEN count(*) = 2 THEN 'PASS' ELSE 'FAIL: expected 2, got ' || count(*) END AS result
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('record_online_payment_success', 'reverse_online_payment')
  AND 'app.money_already_moved=on' = ANY (proconfig);

SELECT 'unapplied_credits resident read is bounded by the ownership window' AS check,
       CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'unapplied_credits'
  AND policyname = 'unapplied_credits_resident_select'
  AND qual LIKE '%resident_credit_in_window%';

SELECT 'online_payment_adjustments.kind accepts refund_failed' AS check,
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                          WHERE conrelid = 'public.online_payment_adjustments'::regclass
                            AND conname = 'online_payment_adjustments_kind_check'
                            AND pg_get_constraintdef(oid) LIKE '%refund_failed%')
            THEN 'PASS' ELSE 'FAIL' END AS result;

SELECT 'reverse_online_payment handles refund_failed and stays service-role only' AS check,
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc
                          WHERE oid = 'public.reverse_online_payment(uuid,text,text,bigint,text,date,integer,uuid)'::regprocedure
                            AND prosrc LIKE '%refund_failed%')
             AND NOT has_function_privilege('authenticated',
                   'public.reverse_online_payment(uuid,text,text,bigint,text,date,integer,uuid)', 'EXECUTE')
            THEN 'PASS' ELSE 'FAIL' END AS result;

-- Rows that already sit in a closed period are not a failure: 0082 only blocks new
-- writes. A count above zero lists history that was posted before the backstop.
SELECT 'posted entries dated inside a closed period (history, for review)' AS check,
       count(*)::text AS result
FROM public.journal_entries je
JOIN public.fiscal_periods p
  ON p.association_id = je.association_id AND p.status = 'closed'
 AND je.entry_date BETWEEN p.start_date AND p.end_date
WHERE je.status = 'posted';
