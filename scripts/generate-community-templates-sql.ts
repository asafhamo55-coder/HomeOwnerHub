/**
 * Compiles the typed registry into an idempotent seed migration.
 *
 * Global rows: organization_id IS NULL. Keyed on topic_slug via the partial
 * unique index from 0044 (comm_templates_global_slug_idx), so re-running
 * updates rather than duplicating.
 *
 * NOTE on providedFields: CommunityTemplate.providedFields (Task 11) —
 * placeholders supplied by code at render time (e.g. the lease-cap
 * occupancy figures) rather than by a board-facing question — has no
 * column in 0044 and is NOT persisted here. The registry in code remains
 * the source of truth for template structure; this seed only carries the
 * rendered artifact plus the board-facing question set. This means an
 * org-level clone of a global row (whenever that ships) will NOT inherit
 * providedFields — whoever implements cloning needs to resolve those
 * fields by slug at render time (see Task 14), not from the database row.
 *
 * Run: pnpm generate:community-sql
 */

import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { COMMUNITY_TEMPLATES } from '../apps/hoa/src/lib/community-templates/registry'
import {
  renderCommunityEmailHtml,
  renderCommunityEmailText,
} from '../apps/hoa/src/lib/community-templates/render'

// The generator runs at build time and only needs a syntactically valid
// origin — the real value is read at send time in the app. Because the
// visual block bakes emailAssetUrl() output into body_html at generation
// time, this placeholder host ends up stored in the database. If the
// production asset host ever changes, this seed must be regenerated (with
// the real EMAIL_ASSET_BASE_URL, or after updating this default) and
// re-applied — existing stored rows will not pick up the new host on
// their own.
process.env.EMAIL_ASSET_BASE_URL ??= 'https://app.homeownerhub.com'

/** Dollar-quoted so bodies containing quotes need no escaping. The tag is
 *  checked against the content to guarantee it cannot appear inside. */
function dollarQuote(s: string): string {
  let tag = 'tpl'
  while (s.includes(`$${tag}$`)) tag += 'x'
  return `$${tag}$${s}$${tag}$`
}

function sqlStr(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

async function main(): Promise<void> {
  const rows = COMMUNITY_TEMPLATES.map((t) => {
    const html = renderCommunityEmailHtml(t)
    const text = renderCommunityEmailText(t)
    const variables = [
      ...new Set(
        [t.subject, html].join(' ').match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) ?? [],
      ),
    ]
      .map((m) => m.replace(/[{}\s]/g, ''))
      .sort()

    return `  (
    ${sqlStr(t.slug)},
    ${sqlStr(t.name)},
    ${sqlStr(t.description)},
    ${sqlStr(t.shape)},
    ${sqlStr(t.accentColor)},
    ${sqlStr(t.subject)},
    ${dollarQuote(html)},
    ${dollarQuote(text)},
    ${dollarQuote(JSON.stringify(t.questions))}::jsonb,
    ${dollarQuote(JSON.stringify(t.visual))}::jsonb,
    ${dollarQuote(JSON.stringify(variables))}::jsonb
  )`
  }).join(',\n')

  const sql = `-- migrations/seed-community-templates.sql
--
-- GENERATED FILE — do not edit by hand.
-- Source: apps/hoa/src/lib/community-templates/
-- Regenerate: pnpm generate:community-sql
--
-- Global community templates (organization_id IS NULL). Idempotent: keyed
-- on topic_slug against the partial unique index from 0044
-- (comm_templates_global_slug_idx), so re-running updates the copy in
-- place rather than duplicating rows.
--
-- Requires 0044_community_templates.sql to have been applied first.
--
-- providedFields (CommunityTemplate, Task 11) is NOT persisted here — 0044
-- has no column for it. Those placeholders (e.g. lease-cap occupancy
-- figures) are supplied by application code at render time, keyed off
-- topic_slug (see Task 14). The registry in code stays the source of
-- truth for template structure; this seed only carries the rendered
-- artifact plus the board-facing question set. A future org-level clone
-- of a global row will NOT inherit providedFields for this reason.

BEGIN;

INSERT INTO public.communication_templates
  (organization_id, association_id, category, topic_slug, name, description,
   shape, accent_color, subject, body_html, body_text, questions, visual_block,
   variables, channels, is_active)
SELECT
  NULL, NULL, 'community', v.slug, v.name, v.description,
  v.shape, v.accent, v.subject, v.body_html, v.body_text, v.questions,
  v.visual_block, v.variables, ARRAY['email']::text[], true
FROM (VALUES
${rows}
) AS v(slug, name, description, shape, accent, subject, body_html, body_text,
       questions, visual_block, variables)
ON CONFLICT (topic_slug) WHERE organization_id IS NULL
DO UPDATE SET
  name         = EXCLUDED.name,
  description  = EXCLUDED.description,
  shape        = EXCLUDED.shape,
  accent_color = EXCLUDED.accent_color,
  subject      = EXCLUDED.subject,
  body_html    = EXCLUDED.body_html,
  body_text    = EXCLUDED.body_text,
  questions    = EXCLUDED.questions,
  visual_block = EXCLUDED.visual_block,
  variables    = EXCLUDED.variables,
  updated_at   = now();

COMMIT;

-- Verification
SELECT 'global community templates' AS check,
       CASE WHEN count(*) = ${COMMUNITY_TEMPLATES.length} THEN 'PASS'
            ELSE 'FAIL — got ' || count(*) END AS result
FROM public.communication_templates
WHERE organization_id IS NULL AND category = 'community';
`

  const out = path.join(process.cwd(), 'migrations/seed-community-templates.sql')
  await writeFile(out, sql)
  console.log(`${COMMUNITY_TEMPLATES.length} templates → ${out}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
