-- verify-0074-polls.sql: READ-ONLY. Run after applying 0074_polls.sql.
-- Every row should say ok = true.

select 'tables exist' as check, count(*) = 4 as ok
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('polls', 'poll_options', 'poll_responses', 'poll_response_choices');

select 'RLS on' as check, count(*) = 4 as ok
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relrowsecurity
   and c.relname in ('polls', 'poll_options', 'poll_responses', 'poll_response_choices');

select 'one answer per home' as check, count(*) = 1 as ok
  from pg_indexes
 where schemaname = 'public' and tablename = 'poll_responses'
   and indexdef ilike '%unique%' and indexdef ilike '%(poll_id, unit_id)%';

select 'functions exist' as check, count(*) = 3 as ok
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('submit_poll_response', 'poll_results', 'poll_resident_association_ids');

-- Answer tables are read-only for the web roles, and anon has nothing.
select 'no web writes on answers' as check, count(*) = 0 as ok
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name in ('poll_responses', 'poll_response_choices')
   and grantee in ('anon', 'authenticated', 'PUBLIC')
   and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');

select 'anon has no table access' as check, count(*) = 0 as ok
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name in ('polls', 'poll_options', 'poll_responses', 'poll_response_choices')
   and grantee in ('anon', 'PUBLIC');

select 'anon cannot run the functions' as check,
       not has_function_privilege('anon', 'public.submit_poll_response(uuid, uuid, uuid[])', 'EXECUTE')
       and not has_function_privilege('anon', 'public.poll_results(uuid)', 'EXECUTE') as ok;

select 'same-org triggers' as check, count(*) = 7 as ok
  from pg_trigger
 where not tgisinternal and tgname like 'zz_org_fk_poll%';

-- The board has no SELECT policy on the answer tables.
select 'board cannot read answers' as check, count(*) = 0 as ok
  from pg_policies
 where schemaname = 'public'
   and tablename in ('poll_responses', 'poll_response_choices')
   and policyname not like '%own_home_select';
