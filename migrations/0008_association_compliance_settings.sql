-- 0008_association_compliance_settings.sql
-- v1.1 Module 7 — Add per-association vendor compliance requirements.
--
-- W21 (vendor onboarder) and W22 (RFP composer) both need per-association
-- insurance minima and license requirements. 0007_vendors.sql noted this
-- column as a follow-up; this migration ships it.
--
-- Shape:
--   {
--     "gl_per_occurrence_min": number | null,    -- $ per-occurrence general liability
--     "gl_aggregate_min": number | null,         -- $ aggregate general liability
--     "workers_comp_required": boolean,
--     "additional_insured_required": boolean,    -- COI must name the association
--     "umbrella_min": number | null,             -- $ umbrella, null if not required
--     "license_required_for": string[]           -- trades that need a contractor license
--   }
--
-- Default below mirrors Madison Park's standards (the v1 reference customer).
-- Boards override per association via the manager UI when it ships.
--
-- Idempotent. Safe to re-run.

ALTER TABLE public.associations
  ADD COLUMN IF NOT EXISTS compliance_settings jsonb
    NOT NULL DEFAULT jsonb_build_object(
      'gl_per_occurrence_min',        1000000,
      'gl_aggregate_min',             2000000,
      'workers_comp_required',        true,
      'additional_insured_required',  true,
      'umbrella_min',                 null,
      'license_required_for',         jsonb_build_array('plumbing', 'electrical', 'hvac', 'roofing')
    );

-- Validation: the column must always be a JSON object (never an array or
-- scalar). Cheap CHECK; the shape itself is enforced in app code.
ALTER TABLE public.associations
  DROP CONSTRAINT IF EXISTS associations_compliance_settings_object;
ALTER TABLE public.associations
  ADD CONSTRAINT associations_compliance_settings_object
  CHECK (jsonb_typeof(compliance_settings) = 'object');
