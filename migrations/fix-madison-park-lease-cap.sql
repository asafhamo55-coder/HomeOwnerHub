-- Check current lease_cap_pct for Madison Park
SELECT id, name, lease_cap_pct
FROM public.associations
WHERE organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86';

-- Clear the cap (set to NULL = no cap enforced)
UPDATE public.associations
SET lease_cap_pct = NULL
WHERE organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'
  AND lease_cap_pct IS NOT NULL;
