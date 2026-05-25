-- Add archived_at column to orgs for soft-archive (distinct from suspend).
-- Suspended tenants are temporarily blocked from sign-in.
-- Archived tenants are permanently hidden from active lists but kept for
-- record-keeping. They can be restored by a platform admin.

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
