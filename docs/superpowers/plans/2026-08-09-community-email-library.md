# Community Email Template Library — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a global, illustrated, question-driven library of seven community email templates that boards can send in under a minute.

**Architecture:** Templates are typed TypeScript source in the repo, compiled to an idempotent seed migration and stored as global rows (`organization_id IS NULL`) in the existing `communication_templates` table. Rendering is pure functions — table-based HTML, inline styles, one opaque raster or one HTML-table meter per email. The composer asks each template's declared questions and turns the answers into a per-template merge bag rendered with `renderTemplateStrict`.

**Tech Stack:** TypeScript · Next.js App Router · Supabase Postgres + RLS · vitest (pure units) · `scripts/test-*.ts` (real Postgres) · Playwright (build-time SVG rasterisation) · Resend.

## Global Constraints

- **Email HTML is table-based.** `<table width="600" role="presentation">`, never `max-width` on a div. The Outlook Word engine ignores `max-width` and `margin:auto`.
- **No CSS gradients, no flexbox, no grid, no `border-radius` reliance** in email HTML. Solid `bgcolor` only.
- **Every element that sets `background-color` also sets `color`, inline, in the same style attribute.** Partial dark-mode inversion flips one without the other.
- **Every accent hex must have relative luminance between 0.10 and 0.30** inclusive.
- **Every generated PNG must be fully opaque** — no alpha channel. Background baked at accent-8%-over-`#FAFAFA`.
- **Delete every `<img>` and the email must remain complete and actionable.** Deadlines, affected areas, dates and reply instructions live in HTML text.
- **Image URLs come from `EMAIL_ASSET_BASE_URL` only.** Never `NEXT_PUBLIC_APP_URL`, never Supabase Storage.
- **Merge-field vocabulary is shared** (Appendix B of the spec). Single-property templates use `cure_window`, never `deadline_date`.
- Unit tests are **pure** — no Supabase, no network, no clock. Anything touching Postgres goes in `scripts/test-*.ts`.
- Run unit tests with `pnpm test:unit`. Typecheck with `pnpm typecheck`.
- Migrations are raw SQL in `migrations/`, applied by hand via the Supabase SQL editor. There is no migration runner. Every migration must be idempotent and re-runnable.

---

## File Structure

**New — `apps/hoa/src/lib/email/`** (shared email primitives, used by dues reminders and the community library)
- `shell.ts` — the outer table-based document wrapper
- `palette.ts` — luminance validation and tinting
- `meter.ts` — the HTML-table meter block
- `asset-url.ts` — `EMAIL_ASSET_BASE_URL` resolution
- `visual-block.ts` — dispatches block kind → HTML
- plus a colocated `.test.ts` for each

**New — `apps/hoa/src/lib/community-templates/`**
- `types.ts` — `CommunityTemplate`, `TemplateQuestion`, `VisualBlockSpec`
- `render.ts` — anatomy B body renderer
- `merge-bag.ts` — answers → merge bag
- `registry.ts` — the seven templates, exported as one array
- `templates/<slug>.ts` — one file per template (seven files, independently authorable)
- `lease-cap.ts` — the lease cap data adapter

**New — `scripts/`**
- `email-assets/pictogram.ts` — SVG composition
- `email-assets/glyphs.ts` — the Material Symbols path data we vendor
- `build-email-assets.ts` — Playwright rasterisation
- `generate-community-templates-sql.ts` — registry → seed SQL
- `test-community-templates.ts` — real-Postgres checks

**Modified**
- `apps/hoa/src/lib/dues-reminders/render.ts:151` — `renderShellHtml` uses the shared shell (Bug A)
- `apps/hoa/src/app/(dashboard)/communications/new/NewCommunicationWizard.tsx` — audience block extracted, `QuestionStep` added
- `apps/hoa/src/lib/communications/send.ts:247` — per-template merge bag, strict render
- `migrations/0044_community_templates.sql` — new
- `apps/hoa/public/email/v1/` — generated PNGs

---

## Task Dependency Order

```
Task 1 (palette) ──┬─→ Task 2 (shell + Bug A)
                   ├─→ Task 4 (pictogram SVG) ─→ Task 5 (rasterise) ─→ Task 6 (asset URL)
                   └─→ Task 7 (meter)
Task 3 (migration) ─────────────────────────────────────────────┐
Task 6, 7 ─→ Task 8 (visual block) ─→ Task 9 (body renderer) ───┤
Task 9 ─→ Task 10 (template types + registry) ─→ Task 11 (×7 templates, PARALLEL)
Task 11 ─→ Task 12 (SQL generator) ─→ Task 13 (merge bag + strict render)
Task 13 ─→ Task 14 (QuestionStep + wizard)
Task 11 ─→ Task 15 (images-off guard)
Task 3, 12 ─→ Task 16 (Postgres test)
```

**Task 11 is seven independent files** — dispatch in parallel.

---

### Task 1: Accent palette and luminance validation

**Files:**
- Create: `apps/hoa/src/lib/email/palette.ts`
- Test: `apps/hoa/src/lib/email/palette.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `relativeLuminance(hex: string): number`, `isValidAccent(hex: string): boolean`, `assertAccent(hex: string): void`, `tintOver(hex: string, alpha: number, base?: string): string`, `MIN_ACCENT_LUMINANCE`, `MAX_ACCENT_LUMINANCE`, `PANEL_BASE`

- [ ] **Step 1: Write the failing test**

```ts
// apps/hoa/src/lib/email/palette.test.ts
import { describe, it, expect } from 'vitest'
import {
  relativeLuminance,
  isValidAccent,
  assertAccent,
  tintOver,
  PANEL_BASE,
} from './palette'

describe('relativeLuminance', () => {
  it('returns 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
  })

  it('accepts hex with or without the leading hash, any case', () => {
    expect(relativeLuminance('2F8F5B')).toBeCloseTo(relativeLuminance('#2f8f5b'), 10)
  })

  it('throws on a malformed hex', () => {
    expect(() => relativeLuminance('#12345')).toThrow(/invalid hex/i)
    expect(() => relativeLuminance('nope')).toThrow(/invalid hex/i)
  })
})

describe('isValidAccent', () => {
  it('accepts a mid-tone accent', () => {
    // #2F8F5B — the pet-waste green, luminance ~0.22
    expect(isValidAccent('#2F8F5B')).toBe(true)
  })

  it('rejects a pastel that would vanish under dark-mode inversion', () => {
    expect(isValidAccent('#A8E6C4')).toBe(false)
  })

  it('rejects a near-black that reads as text rather than accent', () => {
    expect(isValidAccent('#0A0A0A')).toBe(false)
  })
})

describe('assertAccent', () => {
  it('names the offending colour and its luminance', () => {
    expect(() => assertAccent('#A8E6C4')).toThrow(/#A8E6C4/)
    expect(() => assertAccent('#A8E6C4')).toThrow(/luminance/i)
  })

  it('is silent for a valid accent', () => {
    expect(() => assertAccent('#2F8F5B')).not.toThrow()
  })
})

describe('tintOver', () => {
  it('composites the accent over the panel base at the given alpha', () => {
    // 8% of #2F8F5B over #FAFAFA
    expect(tintOver('#2F8F5B', 0.08)).toBe('#eaf1ed')
  })

  it('returns the base unchanged at alpha 0', () => {
    expect(tintOver('#2F8F5B', 0)).toBe(PANEL_BASE.toLowerCase())
  })

  it('returns the accent itself at alpha 1', () => {
    expect(tintOver('#2F8F5B', 1)).toBe('#2f8f5b')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit apps/hoa/src/lib/email/palette.test.ts`
Expected: FAIL — `Failed to resolve import "./palette"`

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/hoa/src/lib/email/palette.ts
/**
 * Accent colour validation for email.
 *
 * Every accent in the library has to survive dark-mode inversion. Gmail iOS
 * and classic Outlook force-invert with no opt-out; Outlook.com and Gmail
 * Android invert *partially*, flipping backgrounds they judge light while
 * leaving others alone. A pastel accent inverts to near-white and disappears;
 * a near-black one is indistinguishable from body text.
 *
 * The 0.10–0.30 window is the band that reads as a deliberate accent in both
 * directions. It will reject colours a designer wants. That is the point.
 */

export const MIN_ACCENT_LUMINANCE = 0.1
export const MAX_ACCENT_LUMINANCE = 0.3

/** The neutral every tinted panel is composited over. Never pure white —
 *  #ffffff is the value partial-inversion engines most aggressively flip. */
export const PANEL_BASE = '#FAFAFA'

function parseHex(hex: string): [number, number, number] {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    throw new Error(`invalid hex colour: ${hex}`)
  }
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ]
}

function toHex(r: number, g: number, b: number): string {
  const part = (n: number): string =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

/** WCAG relative luminance. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex)
  const channel = (v: number): number => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function isValidAccent(hex: string): boolean {
  const l = relativeLuminance(hex)
  return l >= MIN_ACCENT_LUMINANCE && l <= MAX_ACCENT_LUMINANCE
}

/** Throws with the offending value — used at module load by the registry so
 *  a bad accent fails the build rather than shipping an invisible banner. */
export function assertAccent(hex: string): void {
  const l = relativeLuminance(hex)
  if (l < MIN_ACCENT_LUMINANCE || l > MAX_ACCENT_LUMINANCE) {
    throw new Error(
      `accent ${hex} has luminance ${l.toFixed(3)}, outside the required ` +
        `${MIN_ACCENT_LUMINANCE}–${MAX_ACCENT_LUMINANCE} window for dark-mode survival`,
    )
  }
}

/** Composite `hex` over `base` at `alpha`. Used for the tinted panel behind
 *  a pictogram, which must be a flat opaque colour — email cannot do alpha. */
export function tintOver(hex: string, alpha: number, base: string = PANEL_BASE): string {
  const [r1, g1, b1] = parseHex(hex)
  const [r0, g0, b0] = parseHex(base)
  return toHex(
    r0 + (r1 - r0) * alpha,
    g0 + (g1 - g0) * alpha,
    b0 + (b1 - b0) * alpha,
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit apps/hoa/src/lib/email/palette.test.ts`
Expected: PASS, 10 tests

- [ ] **Step 5: Commit**

```bash
git add apps/hoa/src/lib/email/palette.ts apps/hoa/src/lib/email/palette.test.ts
git commit -m "feat(email): accent luminance validation and panel tinting"
```

---

### Task 2: Table-based email shell (fixes Bug A)

**Files:**
- Create: `apps/hoa/src/lib/email/shell.ts`
- Test: `apps/hoa/src/lib/email/shell.test.ts`
- Modify: `apps/hoa/src/lib/dues-reminders/render.ts` (`renderShellHtml`, ~line 151)
- Modify: `apps/hoa/src/lib/dues-reminders/render.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 (shell is colour-agnostic; the band colour is passed in)
- Produces: `renderEmailDocument(opts: EmailDocumentOptions): string`, `EmailDocumentOptions`

- [ ] **Step 1: Write the failing test**

```ts
// apps/hoa/src/lib/email/shell.test.ts
import { describe, it, expect } from 'vitest'
import { renderEmailDocument } from './shell'

const BASE = {
  bodyHtml: '<p style="margin:0;color:#1a1d21;">Hello</p>',
  footerHtml: 'Sent by Madison Park',
}

describe('renderEmailDocument', () => {
  it('constrains width with a table attribute, not a CSS max-width', () => {
    const html = renderEmailDocument(BASE)
    expect(html).toContain('<table role="presentation" width="600"')
    // Bug A: the Word engine ignores both of these.
    expect(html).not.toContain('max-width')
    expect(html).not.toContain('margin:0 auto')
  })

  it('emits a full document with a doctype so Outlook does not quirks-mode it', () => {
    expect(renderEmailDocument(BASE)).toMatch(/^<!DOCTYPE html/i)
  })

  it('renders an optional accent band with both bgcolor and inline colours', () => {
    const html = renderEmailDocument({ ...BASE, band: { text: 'Madison Park', color: '#2F8F5B' } })
    expect(html).toContain('bgcolor="#2F8F5B"')
    expect(html).toContain('background-color:#2F8F5B')
    // Every background carries an explicit foreground — partial inversion rule.
    expect(html).toMatch(/background-color:#2F8F5B[^"]*color:#ffffff/)
    expect(html).toContain('Madison Park')
  })

  it('omits the band entirely when not supplied', () => {
    const withBand = renderEmailDocument({ ...BASE, band: { text: 'Madison Park', color: '#2F8F5B' } })
    const without = renderEmailDocument(BASE)
    expect(withBand).toContain('bgcolor="#2F8F5B"')
    expect(without).not.toContain('bgcolor="#2F8F5B"')
    expect(without).not.toContain('Madison Park')
  })

  it('keeps bgcolor attributes on the structural cells — Outlook needs them', () => {
    // The Word engine honours the ATTRIBUTE, not the inline style. Asserting
    // "no bgcolor anywhere" to prove the band is absent would forbid these
    // and silently degrade every email in Outlook.
    const html = renderEmailDocument(BASE)
    expect(html).toContain('bgcolor="#F1F3F5"') // page background
    expect(html).toContain('bgcolor="#FFFFFF"') // card
    expect(html).toContain('bgcolor="#FAFAFA"') // footer
  })

  it('escapes band text', () => {
    const html = renderEmailDocument({ ...BASE, band: { text: 'A & B <hi>', color: '#2F8F5B' } })
    expect(html).toContain('A &amp; B &lt;hi&gt;')
    expect(html).not.toContain('<hi>')
  })

  it('includes hidden preheader text when supplied', () => {
    const html = renderEmailDocument({ ...BASE, previewText: 'Four waste stations' })
    expect(html).toContain('Four waste stations')
    expect(html).toContain('display:none')
  })

  it('never emits a CSS gradient', () => {
    const html = renderEmailDocument({ ...BASE, band: { text: 'X', color: '#2F8F5B' } })
    expect(html).not.toContain('gradient')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit apps/hoa/src/lib/email/shell.test.ts`
Expected: FAIL — `Failed to resolve import "./shell"`

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/hoa/src/lib/email/shell.ts
/**
 * The outer document every HomeownerHub email is wrapped in.
 *
 * Width is set with the table's `width` ATTRIBUTE, not CSS. Outlook's Word
 * rendering engine ignores `max-width` and `margin:auto` outright — a div
 * centred that way renders full-bleed at reading-pane width. That was a live
 * bug in the dues reminder before this module existed.
 *
 * The band is a solid `bgcolor`. Not a gradient: the Word engine drops
 * `linear-gradient` entirely, leaving no background at all.
 */

export interface EmailBand {
  text: string
  /** Solid accent. Validate with palette.assertAccent before passing. */
  color: string
}

export interface EmailDocumentOptions {
  bodyHtml: string
  footerHtml: string
  band?: EmailBand
  /** Inbox preview line. Hidden in the body, shown in the list view. */
  previewText?: string
}

const PAGE_BG = '#F1F3F5'
const CARD_BG = '#FFFFFF'
const TEXT = '#1A1D21'
const MUTED = '#8A939B'
const LINE = '#E8EBED'
const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif"

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function bandRow(band: EmailBand): string {
  // bgcolor AND inline background-color: the attribute is what Outlook
  // honours, the inline style is what everything else honours. `color` is
  // set in the same declaration because partial-inversion engines flip a
  // background without its foreground and produce white-on-white.
  return `<tr><td bgcolor="${band.color}" style="background-color:${band.color};color:#ffffff;padding:13px 22px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">${escapeHtml(band.text)}</td></tr>`
}

function preheader(text: string): string {
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${PAGE_BG};">${escapeHtml(text)}</div>`
}

export function renderEmailDocument(opts: EmailDocumentOptions): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title></title>
</head>
<body style="margin:0;padding:0;background-color:${PAGE_BG};color:${TEXT};">
${opts.previewText ? preheader(opts.previewText) : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE_BG}" style="background-color:${PAGE_BG};color:${TEXT};">
<tr><td align="center" style="padding:18px;background-color:${PAGE_BG};color:${TEXT};">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${CARD_BG}" style="width:600px;background-color:${CARD_BG};color:${TEXT};border:1px solid ${LINE};">
${opts.band ? bandRow(opts.band) : ''}
<tr><td style="padding:22px;font-family:${FONT};color:${TEXT};background-color:${CARD_BG};">
${opts.bodyHtml}
</td></tr>
<tr><td bgcolor="#FAFAFA" style="background-color:#FAFAFA;color:${MUTED};padding:14px 22px;border-top:1px solid ${LINE};font-family:${FONT};font-size:10px;line-height:1.6;">
${opts.footerHtml}
</td></tr>
</table>
</td></tr></table>
</body></html>`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit apps/hoa/src/lib/email/shell.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Add a regression test to the dues reminder proving Bug A is gone**

Append to `apps/hoa/src/lib/dues-reminders/render.test.ts`:

```ts
describe('renderShellHtml — Outlook width (Bug A regression)', () => {
  it('uses a table width attribute rather than a CSS max-width', () => {
    const html = renderShellHtml({ portalUrl: 'https://example.com/dues' })
    expect(html).toContain('width="600"')
    expect(html).not.toContain('max-width')
  })

  it('still carries both merge placeholders and the portal link', () => {
    const html = renderShellHtml({ portalUrl: 'https://example.com/dues' })
    expect(html).toContain('{{association_name}}')
    expect(html).toContain('{{owner_name}}')
    expect(html).toContain('{{dues_table}}')
    expect(html).toContain('https://example.com/dues')
  })
})
```

- [ ] **Step 6: Run it to confirm it fails**

Run: `pnpm test:unit apps/hoa/src/lib/dues-reminders/render.test.ts`
Expected: FAIL — `expected '<div style="background:#f4f5f7…' to contain 'width="600"'`

- [ ] **Step 7: Rewrite `renderShellHtml` over the shared document**

Replace the body of `renderShellHtml` in `apps/hoa/src/lib/dues-reminders/render.ts` (currently the `<div style="max-width:600px…">` version at ~line 151) with:

```ts
export function renderShellHtml(opts: { note?: string; portalUrl: string }): string {
  const body = `<div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:${MUTED};font-weight:700;">{{association_name}}</div>
<p style="margin:12px 0 4px;font-size:15px;font-weight:700;color:${TEXT};">Hi {{owner_name}},</p>
<p style="margin:0 0 18px;font-size:13px;line-height:1.5;color:#4b5563;">Here&rsquo;s everything currently outstanding on your account.</p>
${renderNoteHtml(opts.note)}
{{dues_table}}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 0;">
<a href="${escapeHtml(opts.portalUrl)}" style="display:inline-block;background-color:#111827;color:#ffffff;font-size:13px;font-weight:700;padding:12px 28px;text-decoration:none;">View my dues</a>
</td></tr></table>
<p style="margin:16px 0 0;font-size:11px;line-height:1.6;color:${MUTED};text-align:center;">To pay or request a detailed statement, reply to this email or contact your community manager.</p>`

  return renderEmailDocument({
    bodyHtml: body,
    footerHtml: 'Sent by {{association_name}} because you are an owner of record.',
  })
}
```

Add the import at the top of `render.ts`:

```ts
import { renderEmailDocument } from '@/lib/email/shell'
```

- [ ] **Step 8: Run the full dues suite**

Run: `pnpm test:unit apps/hoa/src/lib/dues-reminders/`
Expected: PASS. If a snapshot-style assertion in `render.test.ts` asserted on the old `<div>` wrapper, update that assertion — the wrapper changed deliberately.

- [ ] **Step 9: Typecheck and commit**

```bash
pnpm typecheck
git add apps/hoa/src/lib/email/shell.ts apps/hoa/src/lib/email/shell.test.ts \
        apps/hoa/src/lib/dues-reminders/render.ts apps/hoa/src/lib/dues-reminders/render.test.ts
git commit -m "fix(email): table-based shell so Outlook honours the 600px width

renderShellHtml centred with max-width on a div. The Word engine ignores
max-width and margin:auto, so the shipped dues reminder rendered full-bleed
at reading-pane width in classic Outlook. Extracted a shared document
wrapper that sets width as a table attribute."
```

---

### Task 3: Migration — global templates, community category, new columns

**Files:**
- Create: `migrations/0044_community_templates.sql`
- Create: `migrations/verify-0044-community-templates.sql`

**Interfaces:**
- Consumes: nothing
- Produces: schema that Tasks 12 and 16 depend on — columns `topic_slug`, `shape`, `questions`, `visual_block`, `accent_color`, `source_template_id` on `communication_templates`; category value `community` on both CHECK constraints; `organization_id` nullable.

- [ ] **Step 1: Write the migration**

```sql
-- migrations/0044_community_templates.sql
--
-- Global community email template library.
--
-- Three changes, all idempotent and safe to re-run:
--   1. organization_id becomes nullable. NULL means "global" — a template
--      that ships with the product and is visible to every org.
--   2. A new category value, 'community', added to BOTH check constraints.
--      Widening only communication_templates lets template selection and
--      audience resolution succeed and then blows up at the communications
--      INSERT in send.ts, after the user has clicked Send.
--   3. Five columns carrying the template's shape, its declared questions,
--      its visual block config, its accent, and clone provenance.
--
-- The RLS rewrite is the dangerous part and is explained inline below.

BEGIN;

-- ─── 1. organization_id nullable ─────────────────────────────────────
ALTER TABLE public.communication_templates
  ALTER COLUMN organization_id DROP NOT NULL;

-- ─── 2. category: add 'community' to both tables ─────────────────────
ALTER TABLE public.communication_templates
  DROP CONSTRAINT IF EXISTS communication_templates_category_check;
ALTER TABLE public.communication_templates
  ADD CONSTRAINT communication_templates_category_check
  CHECK (category IN (
    'welcome', 'dues', 'meeting', 'violation', 'arc',
    'financial', 'emergency', 'announcement', 'custom', 'community'
  ));

ALTER TABLE public.communications
  DROP CONSTRAINT IF EXISTS communications_category_check;
ALTER TABLE public.communications
  ADD CONSTRAINT communications_category_check
  CHECK (category IN (
    'welcome', 'dues', 'meeting', 'violation', 'arc',
    'financial', 'emergency', 'announcement', 'custom', 'community'
  ));

-- ─── 3. new columns ──────────────────────────────────────────────────
ALTER TABLE public.communication_templates
  ADD COLUMN IF NOT EXISTS topic_slug         text,
  ADD COLUMN IF NOT EXISTS shape              text,
  ADD COLUMN IF NOT EXISTS questions          jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS visual_block       jsonb,
  ADD COLUMN IF NOT EXISTS accent_color       text,
  ADD COLUMN IF NOT EXISTS source_template_id uuid
    REFERENCES public.communication_templates(id) ON DELETE SET NULL;

ALTER TABLE public.communication_templates
  DROP CONSTRAINT IF EXISTS communication_templates_shape_check;
ALTER TABLE public.communication_templates
  ADD CONSTRAINT communication_templates_shape_check
  CHECK (shape IS NULL OR shape IN ('reminder', 'invitation', 'submission_request', 'notice'));

-- One global template per topic_slug. Partial so tenant clones of the same
-- topic don't collide with the global row or with each other.
CREATE UNIQUE INDEX IF NOT EXISTS comm_templates_global_slug_idx
  ON public.communication_templates(topic_slug)
  WHERE organization_id IS NULL;

-- ─── 4. RLS ──────────────────────────────────────────────────────────
-- The existing policy (0018:233-234) is:
--
--   CREATE POLICY org_access ON public.communication_templates
--     USING (organization_id = ANY (public.auth_org_ids()));
--
-- No FOR clause means FOR ALL, and no WITH CHECK means Postgres reuses the
-- USING expression as WITH CHECK. So simply adding "OR organization_id IS
-- NULL" to it would let any authenticated user INSERT and UPDATE rows in
-- the global library. Split into four per-command policies.
--
-- Note the helper is auth_org_ids() — plural, returns an array, compared
-- with = ANY. A user can belong to more than one org.
DROP POLICY IF EXISTS org_access ON public.communication_templates;

DROP POLICY IF EXISTS templates_select ON public.communication_templates;
CREATE POLICY templates_select ON public.communication_templates
  FOR SELECT
  USING (
    organization_id IS NULL
    OR organization_id = ANY (public.auth_org_ids())
  );

DROP POLICY IF EXISTS templates_insert ON public.communication_templates;
CREATE POLICY templates_insert ON public.communication_templates
  FOR INSERT
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = ANY (public.auth_org_ids())
  );

DROP POLICY IF EXISTS templates_update ON public.communication_templates;
CREATE POLICY templates_update ON public.communication_templates
  FOR UPDATE
  USING (
    organization_id IS NOT NULL
    AND organization_id = ANY (public.auth_org_ids())
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = ANY (public.auth_org_ids())
  );

DROP POLICY IF EXISTS templates_delete ON public.communication_templates;
CREATE POLICY templates_delete ON public.communication_templates
  FOR DELETE
  USING (
    organization_id IS NOT NULL
    AND organization_id = ANY (public.auth_org_ids())
  );

COMMIT;
```

**Note:** `public.auth_org_ids()` is verified against `migrations/0018_communications.sql:233-234`. Do not substitute a singular `auth_org_id()` — it does not exist in this schema.

- [ ] **Step 2: Write the verification script**

```sql
-- migrations/verify-0044-community-templates.sql
-- Run after 0044. Every row must report PASS.

SELECT 'organization_id nullable' AS check,
       CASE WHEN is_nullable = 'YES' THEN 'PASS' ELSE 'FAIL' END AS result
FROM information_schema.columns
WHERE table_name = 'communication_templates' AND column_name = 'organization_id';

SELECT 'community category on templates' AS check,
       CASE WHEN pg_get_constraintdef(oid) LIKE '%community%' THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_constraint WHERE conname = 'communication_templates_category_check';

SELECT 'community category on communications' AS check,
       CASE WHEN pg_get_constraintdef(oid) LIKE '%community%' THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_constraint WHERE conname = 'communications_category_check';

SELECT 'six new columns present' AS check,
       CASE WHEN count(*) = 6 THEN 'PASS' ELSE 'FAIL — got ' || count(*) END AS result
FROM information_schema.columns
WHERE table_name = 'communication_templates'
  AND column_name IN ('topic_slug','shape','questions','visual_block','accent_color','source_template_id');

SELECT 'four separate policies' AS check,
       CASE WHEN count(*) = 4 THEN 'PASS' ELSE 'FAIL — got ' || count(*) END AS result
FROM pg_policies
WHERE tablename = 'communication_templates'
  AND policyname IN ('templates_select','templates_insert','templates_update','templates_delete');

SELECT 'no FOR ALL policy remains' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_policies WHERE tablename = 'communication_templates' AND cmd = 'ALL';

SELECT 'insert policy forbids null org' AS check,
       CASE WHEN with_check LIKE '%IS NOT NULL%' THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_policies WHERE tablename = 'communication_templates' AND policyname = 'templates_insert';
```

- [ ] **Step 3: Apply and verify**

Paste `0044_community_templates.sql` into the Supabase SQL editor and run it. Then run `verify-0044-community-templates.sql`.
Expected: seven rows, all `PASS`.

- [ ] **Step 4: Regenerate the database types**

Run the project's usual type generation (check `packages/db/package.json` for the script name; typically `supabase gen types typescript`). Confirm the new columns appear:

```bash
grep -n "topic_slug\|visual_block\|accent_color" packages/db/src/database.types.ts | head
```

Expected: matches inside the `communication_templates` block.

- [ ] **Step 5: Commit**

```bash
git add migrations/0044_community_templates.sql \
        migrations/verify-0044-community-templates.sql \
        packages/db/src/database.types.ts
git commit -m "feat(db): global community templates — nullable org, split RLS, new columns

The old org_access policy was FOR ALL with USING and no WITH CHECK, which
Postgres reuses as WITH CHECK. Adding 'OR organization_id IS NULL' to it
would have let any tenant write the global library. Split into four
per-command policies so SELECT sees globals but writes require a non-null
own-org id."
```

---

### Task 4: Pictogram SVG composition

**Files:**
- Create: `apps/hoa/src/lib/email/glyphs.ts`
- Create: `apps/hoa/src/lib/email/pictogram.ts`
- Create: `apps/hoa/src/lib/email/pictogram-manifest.ts`
- Test: `apps/hoa/src/lib/email/pictogram.test.ts`

**Why not under `scripts/`:** the vitest include globs are `apps/**/src/**` and `packages/**/src/**`, so a test under `scripts/` would silently never run. The modules live under `apps/hoa/src/lib/email/` and the build script imports them.

**Why the manifest is its own module:** `scripts/build-email-assets.ts` calls `main()` at module scope. Anything importing the slug/accent list *from the build script* would launch Chromium as a side effect of the import — which would hang the test suite. The manifest is therefore a plain data module that both the build script and the tests import.

**Interfaces:**
- Consumes: `tintOver`, `assertAccent` from `./palette`
- Produces: `renderPictogramSvg(spec: PictogramSpec): string`, `PictogramSpec`, `GLYPHS: Record<GlyphName, string>`, `GlyphName`

- [ ] **Step 1: Write the failing test**

```ts
// apps/hoa/src/lib/email/pictogram.test.ts
import { describe, it, expect } from 'vitest'
import { renderPictogramSvg } from './pictogram'
import { GLYPHS } from './glyphs'

describe('GLYPHS', () => {
  it('covers every phase-1 topic glyph', () => {
    for (const name of ['pets', 'parking', 'recycling', 'construction', 'cleanup', 'pool', 'apartment'] as const) {
      expect(GLYPHS[name], `missing glyph: ${name}`).toBeTruthy()
      expect(GLYPHS[name]).toMatch(/^[Mm]/) // an SVG path starts with a moveto
    }
  })
})

describe('renderPictogramSvg', () => {
  const spec = { glyph: 'pets' as const, accentColor: '#2F8F5B' }

  it('emits a 1200x400 viewBox for 2x rasterisation of a 600x200 block', () => {
    expect(renderPictogramSvg(spec)).toContain('viewBox="0 0 1200 400"')
  })

  it('paints an opaque tinted panel — email cannot do transparency', () => {
    const svg = renderPictogramSvg(spec)
    // accent at 8% over #FAFAFA
    expect(svg).toContain('#eaf1ed')
    expect(svg).not.toContain('fill-opacity="0"')
    expect(svg).not.toContain('transparent')
  })

  it('draws the glyph in the accent colour', () => {
    expect(renderPictogramSvg(spec)).toContain('#2F8F5B')
  })

  it('rejects an accent that would not survive dark-mode inversion', () => {
    expect(() => renderPictogramSvg({ glyph: 'pets', accentColor: '#A8E6C4' })).toThrow(/luminance/i)
  })

  it('throws a helpful error for an unknown glyph', () => {
    // @ts-expect-error deliberately invalid
    expect(() => renderPictogramSvg({ glyph: 'nope', accentColor: '#2F8F5B' })).toThrow(/unknown glyph/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit apps/hoa/src/lib/email/pictogram.test.ts`
Expected: FAIL — cannot resolve `./pictogram`

- [ ] **Step 3: Vendor the glyph paths**

```ts
// apps/hoa/src/lib/email/glyphs.ts
/**
 * Material Symbols path data, Apache-2.0.
 *
 * Vendored rather than depended on: we need seven glyphs, not a 4,268-glyph
 * font, and the build has to run without network access. Paths are the
 * 24x24 filled variants, normalised to a 0 0 24 24 viewBox.
 *
 * Licence copy: docs/licenses/material-symbols-APACHE-2.0.txt
 * Source: https://github.com/google/material-design-icons (Apache-2.0)
 */

export const GLYPHS = {
  // pets — paw print
  pets: 'M4.5 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm4-5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm7 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm4 5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm-3.6 2.4c-.9-1-1.5-1.8-2.4-2.6-.5-.5-1.2-.8-1.9-.8h-.2c-.7 0-1.4.3-1.9.8-.9.8-1.5 1.6-2.4 2.6-.6.7-1.4 1.3-1.9 2.1-.3.5-.5 1-.5 1.6 0 1.5 1.2 2.7 2.7 2.7.6 0 1.2-.2 1.7-.4.7-.3 1.5-.4 2.4-.4s1.7.1 2.4.4c.5.2 1.1.4 1.7.4 1.5 0 2.7-1.2 2.7-2.7 0-.6-.2-1.1-.5-1.6-.5-.8-1.3-1.4-1.9-2.1z',
  // local_parking — P in a square
  parking: 'M3 3h18v18H3V3zm10.5 10.5c1.93 0 3.5-1.57 3.5-3.5S15.43 6.5 13.5 6.5H9v11h2v-4h2.5zm0-2H11V8.5h2.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z',
  // recycling — bin
  recycling: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  // construction — traffic cone / works
  construction: 'M13.7 2.6h-3.4L5.5 21h13l-4.8-18.4zM9.4 9h5.2l.8 3H8.6l.8-3zM3 22h18v2H3v-2z',
  // cleaning_services — broom
  cleanup: 'M16 2l-2.5 7h-3L8 2H6l2.8 8H7v2h1v8c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2v-8h1v-2h-1.8L18 2h-2z',
  // pool — water and swimmer
  pool: 'M2 15c1.5 0 2.5 1 4 1s2.5-1 4-1 2.5 1 4 1 2.5-1 4-1 2.5 1 4 1v2c-1.5 0-2.5-1-4-1s-2.5 1-4 1-2.5-1-4-1-2.5 1-4 1-2.5-1-4-1v-2zm4-4a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm12-6l-8 5 3 2 5-3V5z',
  // apartment — building, used for the lease cap notice
  apartment: 'M17 11V3H7v4H3v14h8v-4h2v4h8V11h-4zM7 19H5v-2h2v2zm0-4H5v-2h2v2zm0-4H5V9h2v2zm4 4H9v-2h2v2zm0-4H9V9h2v2zm0-4H9V5h2v2zm4 8h-2v-2h2v2zm0-4h-2V9h2v2zm0-4h-2V5h2v2zm4 12h-2v-2h2v2zm0-4h-2v-2h2v2z',
} as const

export type GlyphName = keyof typeof GLYPHS
```

- [ ] **Step 4: Write the pictogram manifest**

```ts
// apps/hoa/src/lib/email/pictogram-manifest.ts
/**
 * Which pictogram each phase-1 template uses.
 *
 * A plain data module with no side effects, deliberately separate from
 * scripts/build-email-assets.ts — that script calls main() at module scope,
 * so importing this list from it would launch Chromium during the test run.
 *
 * The slug is both the template slug and the generated PNG's filename, and
 * the accent must match the template's accentColor. Task 11's coverage test
 * asserts both, so the two cannot drift.
 */

import type { GlyphName } from './glyphs'

export interface PictogramEntry {
  slug: string
  glyph: GlyphName
  accent: string
}

export const PICTOGRAMS: readonly PictogramEntry[] = [
  { slug: 'dog-leash-and-waste', glyph: 'pets', accent: '#1C6772' },
  { slug: 'guest-parking', glyph: 'parking', accent: '#2C6FAF' },
  { slug: 'trash-and-recycling-bins', glyph: 'recycling', accent: '#268298' },
  { slug: 'work-on-site', glyph: 'construction', accent: '#7A6A1D' },
  { slug: 'community-cleanup-day', glyph: 'cleanup', accent: '#A63A87' },
  { slug: 'pool-pass-renewal', glyph: 'pool', accent: '#1C6F31' },
  { slug: 'lease-cap-status', glyph: 'apartment', accent: '#3A5AA8' },
]
```

Add to `apps/hoa/src/lib/email/pictogram.test.ts`:

```ts
import { PICTOGRAMS } from './pictogram-manifest'
import { isValidAccent } from './palette'

describe('PICTOGRAMS manifest', () => {
  it('has seven entries with unique slugs', () => {
    expect(PICTOGRAMS).toHaveLength(7)
    expect(new Set(PICTOGRAMS.map((p) => p.slug)).size).toBe(7)
  })

  it('every accent survives dark-mode inversion', () => {
    for (const p of PICTOGRAMS) {
      expect(isValidAccent(p.accent), `${p.slug}: ${p.accent}`).toBe(true)
    }
  })

  it('every glyph exists', () => {
    for (const p of PICTOGRAMS) expect(GLYPHS[p.glyph], p.slug).toBeTruthy()
  })
})
```

- [ ] **Step 5: Write the composer**

```ts
// apps/hoa/src/lib/email/pictogram.ts
/**
 * Composes a topic pictogram: one Material Symbols glyph, centred on an
 * opaque accent-tinted panel.
 *
 * This is the BASELINE visual. It exists because no open illustration
 * library draws neighbourhood conduct — a live query of unDraw returned
 * zero results for "dog waste" and "noise". A composed pictogram means a
 * new topic is a config line, so art never blocks adding a template.
 *
 * Output is a 1200x400 SVG, rasterised to a 600x200 CSS-pixel PNG at 2x by
 * scripts/build-email-assets.ts. It is never served as SVG — Gmail strips
 * <svg> entirely and Outlook has never supported it.
 */

import { assertAccent, tintOver } from './palette'
import { GLYPHS, type GlyphName } from './glyphs'

export interface PictogramSpec {
  glyph: GlyphName
  accentColor: string
}

const WIDTH = 1200
const HEIGHT = 400
/** Glyph box in the 1200x400 canvas. The source paths are 24x24. */
const GLYPH_SIZE = 180
const SCALE = GLYPH_SIZE / 24

export function renderPictogramSvg(spec: PictogramSpec): string {
  const path = GLYPHS[spec.glyph]
  if (!path) {
    throw new Error(`unknown glyph: ${spec.glyph}. Add it to email/glyphs.ts.`)
  }
  assertAccent(spec.accentColor)

  const panel = tintOver(spec.accentColor, 0.08)
  const halo = tintOver(spec.accentColor, 0.16)
  const tx = (WIDTH - GLYPH_SIZE) / 2
  const ty = (HEIGHT - GLYPH_SIZE) / 2

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
<rect width="${WIDTH}" height="${HEIGHT}" fill="${panel}"/>
<circle cx="${WIDTH / 2}" cy="${HEIGHT / 2}" r="150" fill="${halo}"/>
<g transform="translate(${tx} ${ty}) scale(${SCALE})"><path d="${path}" fill="${spec.accentColor}"/></g>
</svg>`
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test:unit apps/hoa/src/lib/email/pictogram.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 7: Save the licence**

```bash
mkdir -p docs/licenses
curl -sL https://raw.githubusercontent.com/google/material-design-icons/master/LICENSE \
  -o docs/licenses/material-symbols-APACHE-2.0.txt
head -3 docs/licenses/material-symbols-APACHE-2.0.txt
```

Expected: the Apache License 2.0 header. If the fetch fails, copy the licence text manually — shipping vendored glyphs without the licence file on disk is not acceptable.

- [ ] **Step 8: Commit**

```bash
git add apps/hoa/src/lib/email/glyphs.ts apps/hoa/src/lib/email/pictogram.ts \
        apps/hoa/src/lib/email/pictogram-manifest.ts \
        apps/hoa/src/lib/email/pictogram.test.ts docs/licenses/
git commit -m "feat(email): pictogram composer over vendored Material Symbols glyphs"
```

---

### Task 5: Build-time rasterisation

**Files:**
- Create: `scripts/build-email-assets.ts`
- Modify: `package.json` (add `build:email-assets` script)
- Create: `apps/hoa/public/email/v1/.gitkeep`

**Interfaces:**
- Consumes: `renderPictogramSvg`, `GLYPHS` from Task 4; `PHASE1_PICTOGRAMS` defined here and re-read by Task 11's templates via their `visual.asset` field
- Produces: PNG files at `apps/hoa/public/email/v1/<slug>.png`

- [ ] **Step 1: Write the build script**

```ts
// scripts/build-email-assets.ts
/**
 * Rasterises every topic pictogram to an opaque 2x PNG.
 *
 * Why Playwright rather than sharp/resvg: playwright is already a root
 * devDependency, so this adds no new dependency, and Chromium's SVG
 * renderer is the same engine the design was authored against.
 *
 * Why opaque: mail clients invert CSS colours but never image pixels. A
 * transparent PNG of a dark glyph becomes invisible in a large share of
 * inboxes and nobody reports it, because it looks like a missing image.
 * `omitBackground` is deliberately NOT set.
 *
 * Run: pnpm build:email-assets
 */

import { mkdir, writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { renderPictogramSvg } from '../apps/hoa/src/lib/email/pictogram'
import { PICTOGRAMS } from '../apps/hoa/src/lib/email/pictogram-manifest'

const OUT_DIR = path.join(process.cwd(), 'apps/hoa/public/email/v1')
const WIDTH = 1200
const HEIGHT = 400

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true })

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } })

  for (const p of PICTOGRAMS) {
    const svg = renderPictogramSvg({ glyph: p.glyph, accentColor: p.accent })
    await page.setContent(
      `<body style="margin:0;padding:0;">${svg}</body>`,
      { waitUntil: 'load' },
    )
    const buf = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
      // omitBackground stays false — the PNG must be fully opaque.
    })
    const file = path.join(OUT_DIR, `${p.slug}.png`)
    await writeFile(file, buf)
    console.log(`  ${p.slug}.png  ${(buf.length / 1024).toFixed(1)}kb`)
  }

  await browser.close()

  const written = (await readdir(OUT_DIR)).filter((f) => f.endsWith('.png'))
  if (written.length !== PICTOGRAMS.length) {
    throw new Error(`expected ${PICTOGRAMS.length} PNGs, wrote ${written.length}`)
  }
  console.log(`\n${written.length} assets → apps/hoa/public/email/v1/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Register the script**

Add to the root `package.json` `scripts` block:

```json
"build:email-assets": "tsx scripts/build-email-assets.ts",
```

- [ ] **Step 3: Run it**

Run: `pnpm build:email-assets`
Expected: seven lines of output, then `7 assets → apps/hoa/public/email/v1/`

- [ ] **Step 4: Write the opacity guard test**

```ts
// apps/hoa/src/lib/email/asset-opacity.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

const DIR = path.join(process.cwd(), 'apps/hoa/public/email/v1')

/**
 * A PNG's IHDR colour-type byte is at offset 25. Type 6 is RGBA and type 4
 * is grey+alpha — either means the image carries transparency, which in a
 * dark-mode inbox renders as an invisible glyph on an inverted background.
 */
function colourType(file: string): number {
  return readFileSync(file)[25]
}

describe('generated email assets', () => {
  it('the asset directory exists — run pnpm build:email-assets', () => {
    expect(existsSync(DIR), `missing ${DIR}`).toBe(true)
  })

  it('every PNG is fully opaque', () => {
    const pngs = readdirSync(DIR).filter((f) => f.endsWith('.png'))
    expect(pngs.length).toBeGreaterThan(0)
    for (const f of pngs) {
      const type = colourType(path.join(DIR, f))
      expect([4, 6], `${f} has an alpha channel (colour type ${type})`).not.toContain(type)
    }
  })
})
```

- [ ] **Step 5: Run it**

Run: `pnpm test:unit apps/hoa/src/lib/email/asset-opacity.test.ts`
Expected: PASS, 2 tests

- [ ] **Step 6: Commit**

```bash
git add scripts/build-email-assets.ts package.json \
        apps/hoa/public/email/v1/ apps/hoa/src/lib/email/asset-opacity.test.ts
git commit -m "feat(email): rasterise pictograms to opaque 2x PNGs via playwright"
```

---

### Task 6: Asset URL resolution

**Files:**
- Create: `apps/hoa/src/lib/email/asset-url.ts`
- Test: `apps/hoa/src/lib/email/asset-url.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `emailAssetUrl(filename: string): string`

- [ ] **Step 1: Write the failing test**

```ts
// apps/hoa/src/lib/email/asset-url.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { emailAssetUrl } from './asset-url'

const ORIGINAL = process.env.EMAIL_ASSET_BASE_URL
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.EMAIL_ASSET_BASE_URL
  else process.env.EMAIL_ASSET_BASE_URL = ORIGINAL
})

describe('emailAssetUrl', () => {
  it('joins the base and the versioned path', () => {
    process.env.EMAIL_ASSET_BASE_URL = 'https://app.homeownerhub.com'
    expect(emailAssetUrl('pet-waste.png')).toBe(
      'https://app.homeownerhub.com/email/v1/pet-waste.png',
    )
  })

  it('tolerates a trailing slash on the base', () => {
    process.env.EMAIL_ASSET_BASE_URL = 'https://app.homeownerhub.com/'
    expect(emailAssetUrl('pet-waste.png')).toBe(
      'https://app.homeownerhub.com/email/v1/pet-waste.png',
    )
  })

  it('throws when the var is unset rather than falling back', () => {
    delete process.env.EMAIL_ASSET_BASE_URL
    expect(() => emailAssetUrl('x.png')).toThrow(/EMAIL_ASSET_BASE_URL/)
  })

  it('refuses a localhost base — that would ship broken images forever', () => {
    process.env.EMAIL_ASSET_BASE_URL = 'http://localhost:3000'
    expect(() => emailAssetUrl('x.png')).toThrow(/localhost/i)
  })

  it('refuses a Vercel preview base', () => {
    process.env.EMAIL_ASSET_BASE_URL = 'https://hoa-git-branch-team.vercel.app'
    expect(() => emailAssetUrl('x.png')).toThrow(/preview/i)
  })

  it('refuses a non-https base', () => {
    process.env.EMAIL_ASSET_BASE_URL = 'http://app.homeownerhub.com'
    expect(() => emailAssetUrl('x.png')).toThrow(/https/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit apps/hoa/src/lib/email/asset-url.test.ts`
Expected: FAIL — cannot resolve `./asset-url`

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/hoa/src/lib/email/asset-url.ts
/**
 * Resolves the public URL of a generated email asset.
 *
 * Deliberately NOT built on NEXT_PUBLIC_APP_URL / appUrl(). That helper
 * returns whatever host the current deployment is on, which for a preview
 * build is a vercel.app subdomain and locally is localhost:3000. Email is
 * immutable once delivered — a preview hostname baked into a sent message
 * is a permanently broken image in the recipient's archive, and it will not
 * be caught in review because it renders correctly on the machine that
 * sent it.
 *
 * So: a separate variable, and hard failure rather than a fallback.
 */

const ASSET_PATH = 'email/v1'

export function emailAssetUrl(filename: string): string {
  const base = process.env.EMAIL_ASSET_BASE_URL
  if (!base) {
    throw new Error(
      'EMAIL_ASSET_BASE_URL is not set. Email images need a stable public ' +
        'origin — do not fall back to NEXT_PUBLIC_APP_URL.',
    )
  }
  if (!base.startsWith('https://')) {
    throw new Error(`EMAIL_ASSET_BASE_URL must be https, got: ${base}`)
  }
  if (/localhost|127\.0\.0\.1/.test(base)) {
    throw new Error(`EMAIL_ASSET_BASE_URL points at localhost (${base}); sent mail would break permanently`)
  }
  if (/\.vercel\.app/.test(base)) {
    throw new Error(`EMAIL_ASSET_BASE_URL points at a Vercel preview host (${base}); use the production domain`)
  }
  return `${base.replace(/\/+$/, '')}/${ASSET_PATH}/${filename}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit apps/hoa/src/lib/email/asset-url.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Document the variable**

Append to `.env.example` (create it if absent):

```
# Stable public origin for email images. Must be the production domain over
# https — never a preview host, never localhost. Email is immutable once
# delivered, so a wrong value here breaks images permanently.
EMAIL_ASSET_BASE_URL=https://app.homeownerhub.com
```

- [ ] **Step 6: Commit**

```bash
git add apps/hoa/src/lib/email/asset-url.ts apps/hoa/src/lib/email/asset-url.test.ts .env.example
git commit -m "feat(email): EMAIL_ASSET_BASE_URL resolution that fails loudly"
```

---

### Task 7: Meter block renderer

**Files:**
- Create: `apps/hoa/src/lib/email/meter.ts`
- Test: `apps/hoa/src/lib/email/meter.test.ts`

**Interfaces:**
- Consumes: `assertAccent`, `tintOver` from `./palette`; `escapeHtml` from `./shell`
- Produces: `renderMeterHtml(o: MeterOptions): string`, `MeterOptions`

- [ ] **Step 1: Write the failing test**

```ts
// apps/hoa/src/lib/email/meter.test.ts
import { describe, it, expect } from 'vitest'
import { renderMeterHtml } from './meter'

const BASE = {
  label: 'Homes currently leased',
  valuePct: 12.5,
  capPct: 15,
  accentColor: '#3A5AA8',
  valueLabel: '10 of 80 homes',
  capLabel: '15% cap',
}

describe('renderMeterHtml', () => {
  it('contains no image at all', () => {
    expect(renderMeterHtml(BASE)).not.toContain('<img')
  })

  it('renders the fill as a percentage of the cap, not of 100', () => {
    // 12.5 of a 15 cap = 83.33% of the bar
    expect(renderMeterHtml(BASE)).toContain('width="83.3%"')
  })

  it('renders an empty bar at zero without dividing by zero', () => {
    const html = renderMeterHtml({ ...BASE, valuePct: 0 })
    expect(html).toContain('width="0%"')
    expect(html).not.toContain('NaN')
  })

  it('caps the fill at 100% when over the limit and marks it in TEXT', () => {
    const html = renderMeterHtml({ ...BASE, valuePct: 18, valueLabel: '15 of 80 homes' })
    expect(html).toContain('width="100%"')
    expect(html).toContain('over the cap')
  })

  it('does not rely on colour alone to signal over-cap', () => {
    const over = renderMeterHtml({ ...BASE, valuePct: 18 })
    const under = renderMeterHtml(BASE)
    // The distinguishing signal must survive a greyscale render.
    expect(over.replace(/#[0-9A-Fa-f]{6}/g, '')).not.toBe(under.replace(/#[0-9A-Fa-f]{6}/g, ''))
  })

  it('sets a foreground colour on every element that sets a background', () => {
    const html = renderMeterHtml(BASE)
    const bgs = html.match(/background-color:[^;"]+/g) ?? []
    expect(bgs.length).toBeGreaterThan(0)
    for (const m of html.matchAll(/style="([^"]*background-color:[^"]*)"/g)) {
      expect(m[1], `background without color: ${m[1]}`).toContain('color:')
    }
  })

  it('escapes the labels', () => {
    const html = renderMeterHtml({ ...BASE, label: '<script>x</script>' })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('rejects a cap of zero', () => {
    expect(() => renderMeterHtml({ ...BASE, capPct: 0 })).toThrow(/cap/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit apps/hoa/src/lib/email/meter.test.ts`
Expected: FAIL — cannot resolve `./meter`

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/hoa/src/lib/email/meter.ts
/**
 * A meter: one exact ratio against a published policy limit.
 *
 * Not a chart. A chart is a statistical aggregate — it needs a volume
 * threshold, it can re-identify a household in a small association, and in
 * this schema it would be grouping on AI-generated free text. A meter is a
 * FACT: 10 of 80 homes leased against a 15% cap is exactly right every time,
 * names nobody, and needs no caveat.
 *
 * Rendered as nested tables with bgcolor fills rather than a generated
 * image, so it renders identically in classic Outlook with images blocked,
 * costs ~2KB instead of a 50KB fetch, and survives dark mode for free.
 */

import { assertAccent, tintOver } from './palette'
import { escapeHtml } from './shell'

export interface MeterOptions {
  /** What is being measured, e.g. "Homes currently leased". */
  label: string
  /** Current value as a percentage of the whole, e.g. 12.5. */
  valuePct: number
  /** The policy limit as a percentage, e.g. 15. Must be > 0. */
  capPct: number
  accentColor: string
  /** Human count under the bar, e.g. "10 of 80 homes". */
  valueLabel: string
  /** The limit in words, e.g. "15% cap". */
  capLabel: string
}

const TEXT = '#1A1D21'
const MUTED = '#5C6670'
const OVER = '#B42318'
const TRACK = '#E8EBED'

export function renderMeterHtml(o: MeterOptions): string {
  if (!(o.capPct > 0)) {
    throw new Error(`meter cap must be greater than zero, got ${o.capPct}`)
  }
  assertAccent(o.accentColor)

  const over = o.valuePct > o.capPct
  const ratio = Math.min(100, Math.max(0, (o.valuePct / o.capPct) * 100))
  // One decimal: enough to be honest, not so much it looks computed.
  const width = `${Math.round(ratio * 10) / 10}%`
  const fill = over ? OVER : o.accentColor
  const panel = tintOver(o.accentColor, 0.06)

  // The over-cap state is carried by TEXT, not only by the bar turning red —
  // a greyscale or inverted render must still communicate it.
  const status = over
    ? `<div style="margin-top:8px;font-size:12px;font-weight:700;color:${OVER};background-color:${panel};">This is over the cap.</div>`
    : ''

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${panel}" style="background-color:${panel};color:${TEXT};margin:14px 0;">
<tr><td style="padding:15px 17px;background-color:${panel};color:${TEXT};font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="font-size:12px;font-weight:700;color:${TEXT};">${escapeHtml(o.label)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:9px 0 7px;">
<tr>
<td width="${width}" bgcolor="${fill}" style="width:${width};background-color:${fill};color:${fill};font-size:1px;line-height:18px;">&nbsp;</td>
<td bgcolor="${TRACK}" style="background-color:${TRACK};color:${TRACK};font-size:1px;line-height:18px;">&nbsp;</td>
</tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font-size:11px;color:${MUTED};background-color:${panel};">${escapeHtml(o.valueLabel)}</td>
<td align="right" style="font-size:11px;font-weight:700;color:${TEXT};background-color:${panel};">${escapeHtml(o.capLabel)}</td>
</tr></table>
${status}
</td></tr></table>`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit apps/hoa/src/lib/email/meter.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add apps/hoa/src/lib/email/meter.ts apps/hoa/src/lib/email/meter.test.ts
git commit -m "feat(email): meter block — deterministic ratio as nested tables, no image"
```

---

### Task 8: Visual block dispatcher

**Files:**
- Create: `apps/hoa/src/lib/email/visual-block.ts`
- Test: `apps/hoa/src/lib/email/visual-block.test.ts`

**Interfaces:**
- Consumes: `emailAssetUrl` (Task 6), `renderMeterHtml`/`MeterOptions` (Task 7), `tintOver` (Task 1), `escapeHtml` (Task 2)
- Produces: `renderVisualBlock(block: VisualBlockSpec, accentColor: string): string`, `VisualBlockSpec`

- [ ] **Step 1: Write the failing test**

```ts
// apps/hoa/src/lib/email/visual-block.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { renderVisualBlock } from './visual-block'

beforeAll(() => {
  process.env.EMAIL_ASSET_BASE_URL = 'https://app.homeownerhub.com'
})

const ACCENT = '#2F8F5B'

describe('renderVisualBlock', () => {
  it('renders an image block with a versioned absolute URL', () => {
    const html = renderVisualBlock(
      { kind: 'illustration', asset: 'dog-leash-and-waste.png', alt: 'A dog owner at a waste station' },
      ACCENT,
    )
    expect(html).toContain('https://app.homeownerhub.com/email/v1/dog-leash-and-waste.png')
  })

  it('gives the image real alt text — for blocked images the alt IS the block', () => {
    const html = renderVisualBlock(
      { kind: 'illustration', asset: 'x.png', alt: 'A dog owner at a waste station' },
      ACCENT,
    )
    expect(html).toContain('alt="A dog owner at a waste station"')
  })

  it('rejects empty or decorative alt text', () => {
    expect(() => renderVisualBlock({ kind: 'illustration', asset: 'x.png', alt: '' }, ACCENT))
      .toThrow(/alt/i)
    expect(() => renderVisualBlock({ kind: 'illustration', asset: 'x.png', alt: 'illustration' }, ACCENT))
      .toThrow(/alt/i)
  })

  it('sets explicit width and height so a blocked image reserves its space', () => {
    const html = renderVisualBlock({ kind: 'illustration', asset: 'x.png', alt: 'A real description' }, ACCENT)
    expect(html).toContain('width="600"')
    expect(html).toContain('height="200"')
  })

  it('paints the containing cell so a blocked image looks deliberate', () => {
    const html = renderVisualBlock({ kind: 'illustration', asset: 'x.png', alt: 'A real description' }, ACCENT)
    expect(html).toContain('bgcolor="#eaf1ed"')
  })

  it('delegates the meter kind and emits no image', () => {
    const html = renderVisualBlock(
      {
        kind: 'meter',
        label: 'Homes currently leased',
        valuePct: 12.5,
        capPct: 15,
        valueLabel: '10 of 80 homes',
        capLabel: '15% cap',
      },
      '#3A5AA8',
    )
    expect(html).toContain('Homes currently leased')
    expect(html).not.toContain('<img')
  })

  it('renders nothing for the none kind', () => {
    expect(renderVisualBlock({ kind: 'none' }, ACCENT)).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit apps/hoa/src/lib/email/visual-block.test.ts`
Expected: FAIL — cannot resolve `./visual-block`

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/hoa/src/lib/email/visual-block.ts
/**
 * Dispatches a template's visual block to its renderer.
 *
 * Image kinds share one renderer because they share every constraint: an
 * opaque 600x200 raster, explicit dimensions so a blocked image reserves its
 * space, a painted container cell, and alt text that carries real meaning.
 *
 * That last point is not politeness. Classic Outlook and Office 365 OWA
 * block remote images by default, so for a meaningful slice of recipients
 * the alt text IS the visual block.
 */

import { emailAssetUrl } from './asset-url'
import { renderMeterHtml } from './meter'
import { tintOver } from './palette'
import { escapeHtml } from './shell'

export type VisualBlockSpec =
  | { kind: 'illustration' | 'map' | 'photo'; asset: string; alt: string }
  | {
      kind: 'meter'
      label: string
      valuePct: number
      capPct: number
      valueLabel: string
      capLabel: string
    }
  | { kind: 'none' }

const WIDTH = 600
const HEIGHT = 200

/** Alt text that describes the medium rather than the content is worse than
 *  none — it tells a screen-reader user and a blocked-image reader nothing. */
const USELESS_ALT = /^(image|illustration|photo|picture|graphic|banner|icon)$/i

function renderImageBlock(
  asset: string,
  alt: string,
  accentColor: string,
): string {
  const trimmed = alt.trim()
  if (!trimmed || USELESS_ALT.test(trimmed)) {
    throw new Error(
      `visual block alt text must describe the content, got: "${alt}". ` +
        'With images blocked the alt text is the whole block.',
    )
  }
  const panel = tintOver(accentColor, 0.08)
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:13px 0;">
<tr><td align="center" bgcolor="${panel}" style="background-color:${panel};color:#1A1D21;">
<img src="${escapeHtml(emailAssetUrl(asset))}" alt="${escapeHtml(trimmed)}" width="${WIDTH}" height="${HEIGHT}" style="display:block;width:100%;max-width:${WIDTH}px;height:auto;border:0;outline:none;text-decoration:none;" />
</td></tr></table>`
}

export function renderVisualBlock(block: VisualBlockSpec, accentColor: string): string {
  switch (block.kind) {
    case 'none':
      return ''
    case 'meter':
      return renderMeterHtml({
        label: block.label,
        valuePct: block.valuePct,
        capPct: block.capPct,
        accentColor,
        valueLabel: block.valueLabel,
        capLabel: block.capLabel,
      })
    case 'illustration':
    case 'map':
    case 'photo':
      return renderImageBlock(block.asset, block.alt, accentColor)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit apps/hoa/src/lib/email/visual-block.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add apps/hoa/src/lib/email/visual-block.ts apps/hoa/src/lib/email/visual-block.test.ts
git commit -m "feat(email): visual block dispatcher with enforced meaningful alt text"
```

---

### Task 9: Community template body renderer (anatomy B)

**Files:**
- Create: `apps/hoa/src/lib/community-templates/types.ts`
- Create: `apps/hoa/src/lib/community-templates/render.ts`
- Test: `apps/hoa/src/lib/community-templates/render.test.ts`

**Interfaces:**
- Consumes: `renderEmailDocument`/`escapeHtml` (Task 2), `renderVisualBlock`/`VisualBlockSpec` (Task 8), `assertAccent`/`tintOver` (Task 1)
- Produces: `renderCommunityEmailHtml(t, ctx)`, `renderCommunityEmailText(t)`, and the types `CommunityTemplate`, `TemplateQuestion`, `TemplateShape`, `QuestionType`

- [ ] **Step 1: Write the types**

```ts
// apps/hoa/src/lib/community-templates/types.ts
import type { VisualBlockSpec } from '@/lib/email/visual-block'

/** How the email behaves, which determines what the composer must collect.
 *  See §4.1 of the design spec. */
export type TemplateShape = 'reminder' | 'invitation' | 'submission_request' | 'notice'

export type TemplateGenre =
  | 'conduct' | 'maintenance' | 'safety'
  | 'community-life' | 'governance' | 'seasonal' | 'family'

export type TemplateAudience = 'broadcast' | 'segment' | 'single_property'

export type QuestionType =
  | 'text' | 'textarea' | 'date' | 'time' | 'number' | 'select' | 'multiselect'

export interface TemplateQuestion {
  /** snake_case, and IS the merge field name. Draw from the shared
   *  vocabulary in Appendix B of the design spec — the same concept must
   *  use the same field name in every template. */
  id: string
  label: string
  type: QuestionType
  /** Required for select and multiselect, ignored otherwise. */
  options?: readonly string[]
  required: boolean
  /** Shown under the field. Use it to tell the board member what good
   *  looks like, not to restate the label. */
  help?: string
  /** Used when the question is optional and unanswered, so strict render
   *  still has a value. */
  fallback?: string
}

export interface CommunityTemplate {
  slug: string
  name: string
  description: string
  genre: TemplateGenre
  shape: TemplateShape
  audience: TemplateAudience
  /** Mid-tone hex; validated at registry load. */
  accentColor: string
  visual: VisualBlockSpec
  /** Both may contain {{ merge_field }} placeholders. */
  subject: string
  /** Inbox preview line. */
  preview: string
  /** Ordered body blocks. */
  body: BodyBlock[]
  questions: readonly TemplateQuestion[]
  /** Rendered as a highlighted panel. The practical detail a resident needs. */
  callout?: string
  cta?: { label: string; urlField: string }
  /** Not rendered. Shown to the board member in the composer, and the
   *  reason several of these templates exist at all. */
  legalNote?: string
}

export type BodyBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'visual' }
  | { type: 'callout'; text: string }
  | { type: 'list'; items: string[] }
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/hoa/src/lib/community-templates/render.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { renderCommunityEmailHtml, renderCommunityEmailText } from './render'
import type { CommunityTemplate } from './types'

beforeAll(() => {
  process.env.EMAIL_ASSET_BASE_URL = 'https://app.homeownerhub.com'
})

const T: CommunityTemplate = {
  slug: 'pet-waste',
  name: 'Pet Waste — Community Reminder',
  description: 'A friendly nudge.',
  genre: 'conduct',
  shape: 'reminder',
  audience: 'broadcast',
  accentColor: '#1C6772',
  visual: { kind: 'illustration', asset: 'dog-leash-and-waste.png', alt: 'A dog owner at a waste station' },
  subject: 'A friendly reminder about pet waste in {{association_name}}',
  preview: 'Four waste stations, all stocked with bags.',
  body: [
    { type: 'paragraph', text: 'Hi {{recipient_name}},' },
    { type: 'paragraph', text: "We've had reports near {{affected_areas}}." },
    { type: 'visual' },
    { type: 'callout', text: 'Bag stations: {{station_locations}}.' },
  ],
  questions: [
    { id: 'affected_areas', label: 'Which areas?', type: 'multiselect', options: ['East entrance'], required: true },
    { id: 'station_locations', label: 'Where are the stations?', type: 'text', required: true },
  ],
}

describe('renderCommunityEmailHtml', () => {
  it('puts the community name in an accent band above the body', () => {
    const html = renderCommunityEmailHtml(T)
    expect(html).toContain('bgcolor="#1C6772"')
    expect(html).toContain('{{association_name}}')
  })

  it('places the headline and first paragraph BEFORE the visual', () => {
    const html = renderCommunityEmailHtml(T)
    expect(html.indexOf('Hi {{recipient_name}}')).toBeLessThan(html.indexOf('<img'))
  })

  it('preserves merge placeholders untouched for the strict renderer', () => {
    const html = renderCommunityEmailHtml(T)
    expect(html).toContain('{{affected_areas}}')
    expect(html).toContain('{{station_locations}}')
  })

  it('is a complete document with the preview line', () => {
    const html = renderCommunityEmailHtml(T)
    expect(html).toMatch(/^<!DOCTYPE/i)
    expect(html).toContain('Four waste stations')
  })

  it('remains complete and actionable with every img removed', () => {
    const stripped = renderCommunityEmailHtml(T).replace(/<img[^>]*>/g, '')
    expect(stripped).toContain('{{affected_areas}}')
    expect(stripped).toContain('{{station_locations}}')
    expect(stripped).toContain('Hi {{recipient_name}}')
  })

  it('rejects an accent outside the dark-mode-safe window', () => {
    expect(() => renderCommunityEmailHtml({ ...T, accentColor: '#A8E6C4' })).toThrow(/luminance/i)
  })

  it('sets a foreground on every background', () => {
    const html = renderCommunityEmailHtml(T)
    for (const m of html.matchAll(/style="([^"]*background-color:[^"]*)"/g)) {
      expect(m[1], `background without color: ${m[1]}`).toContain('color:')
    }
  })
})

describe('renderCommunityEmailText', () => {
  it('carries the same placeholders and drops the visual', () => {
    const text = renderCommunityEmailText(T)
    expect(text).toContain('{{affected_areas}}')
    expect(text).toContain('{{station_locations}}')
    expect(text).not.toContain('<')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test:unit apps/hoa/src/lib/community-templates/render.test.ts`
Expected: FAIL — cannot resolve `./render`

- [ ] **Step 4: Write minimal implementation**

```ts
// apps/hoa/src/lib/community-templates/render.ts
/**
 * Renders a community template to HTML and plain text — anatomy B: an
 * accent band carrying the community name, then the headline and the ask,
 * then the visual, then the practical detail.
 *
 * The ordering is not cosmetic. The headline and the first paragraph land
 * before any image so the message is intact when a client blocks pictures.
 *
 * Merge placeholders are passed through untouched. This renderer produces
 * the template BODY that gets stored; substitution happens later, via
 * renderTemplateStrict, once the composer has the board member's answers.
 */

import { renderEmailDocument, escapeHtml } from '@/lib/email/shell'
import { renderVisualBlock } from '@/lib/email/visual-block'
import { assertAccent, tintOver } from '@/lib/email/palette'
import type { CommunityTemplate, BodyBlock } from './types'

const TEXT = '#1A1D21'
const BODY = '#3D454D'
const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif"

/** Placeholders must survive escaping — they are our own syntax, not user
 *  input — so we escape the literal text and then restore the braces. */
function escapePreservingMerge(s: string): string {
  return escapeHtml(s).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, '{{$1}}')
}

function renderBlock(block: BodyBlock, t: CommunityTemplate): string {
  switch (block.type) {
    case 'paragraph':
      return `<p style="margin:0 0 11px;font-size:14px;line-height:1.55;color:${BODY};font-family:${FONT};">${escapePreservingMerge(block.text)}</p>`
    case 'visual':
      return renderVisualBlock(t.visual, t.accentColor)
    case 'callout': {
      const panel = tintOver(t.accentColor, 0.09)
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${panel}" style="background-color:${panel};color:${TEXT};margin:13px 0;">
<tr><td style="padding:11px 14px;font-size:13px;line-height:1.55;color:${TEXT};background-color:${panel};font-family:${FONT};border-left:4px solid ${t.accentColor};">${escapePreservingMerge(block.text)}</td></tr></table>`
    }
    case 'list':
      return `<ul style="margin:0 0 11px;padding-left:20px;font-size:14px;line-height:1.6;color:${BODY};font-family:${FONT};">${block.items
        .map((i) => `<li style="margin-bottom:4px;color:${BODY};">${escapePreservingMerge(i)}</li>`)
        .join('')}</ul>`
  }
}

export function renderCommunityEmailHtml(t: CommunityTemplate): string {
  assertAccent(t.accentColor)

  const headline = `<h1 style="margin:0 0 12px;font-size:20px;line-height:1.25;color:${TEXT};font-weight:700;font-family:${FONT};">${escapePreservingMerge(t.name.split('—').pop()?.trim() || t.name)}</h1>`

  const cta = t.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 0;"><tr>
<td bgcolor="${t.accentColor}" style="background-color:${t.accentColor};color:#ffffff;">
<a href="{{${t.cta.urlField}}}" style="display:inline-block;padding:11px 18px;font-size:13px;font-weight:600;color:#ffffff;text-decoration:none;font-family:${FONT};">${escapeHtml(t.cta.label)}</a>
</td></tr></table>`
    : ''

  return renderEmailDocument({
    band: { text: '{{association_name}}', color: t.accentColor },
    previewText: t.preview,
    bodyHtml: headline + t.body.map((b) => renderBlock(b, t)).join('\n') + cta,
    footerHtml: 'Sent to residents of {{association_name}}.',
  })
}

export function renderCommunityEmailText(t: CommunityTemplate): string {
  const lines: string[] = ['{{association_name}}', '']
  for (const block of t.body) {
    switch (block.type) {
      case 'paragraph':
        lines.push(block.text, '')
        break
      case 'callout':
        lines.push(block.text, '')
        break
      case 'list':
        for (const i of block.items) lines.push(`  - ${i}`)
        lines.push('')
        break
      case 'visual':
        break // no visual in the text part
    }
  }
  return lines.join('\n').trimEnd()
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test:unit apps/hoa/src/lib/community-templates/render.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 6: Commit**

```bash
git add apps/hoa/src/lib/community-templates/types.ts \
        apps/hoa/src/lib/community-templates/render.ts \
        apps/hoa/src/lib/community-templates/render.test.ts
git commit -m "feat(comms): anatomy-B renderer for community templates"
```

---

### Task 10: Template registry with load-time validation

**Files:**
- Create: `apps/hoa/src/lib/community-templates/registry.ts`
- Test: `apps/hoa/src/lib/community-templates/registry.test.ts`

**Interfaces:**
- Consumes: `CommunityTemplate` (Task 9), `assertAccent` (Task 1)
- Produces: `COMMUNITY_TEMPLATES: readonly CommunityTemplate[]`, `validateTemplate(t): void`, `getTemplate(slug): CommunityTemplate | undefined`

Task 11 adds the seven template files and imports them here. This task builds the registry with an empty array plus the validation the seven will be checked against, so the seven can be written in parallel against a stable contract.

- [ ] **Step 1: Write the failing test**

```ts
// apps/hoa/src/lib/community-templates/registry.test.ts
import { describe, it, expect } from 'vitest'
import { validateTemplate, COMMUNITY_TEMPLATES, getTemplate } from './registry'
import type { CommunityTemplate } from './types'

function tpl(over: Partial<CommunityTemplate> = {}): CommunityTemplate {
  return {
    slug: 'x-topic',
    name: 'X — Topic',
    description: 'd',
    genre: 'conduct',
    shape: 'reminder',
    audience: 'broadcast',
    accentColor: '#1C6772',
    visual: { kind: 'illustration', asset: 'x.png', alt: 'A real description of the scene' },
    subject: 'Hello {{association_name}}',
    preview: 'p',
    body: [{ type: 'paragraph', text: 'Hi {{recipient_name}}, see {{affected_areas}}.' }],
    questions: [
      { id: 'affected_areas', label: 'Where?', type: 'multiselect', options: ['A'], required: true },
    ],
    ...over,
  }
}

describe('validateTemplate', () => {
  it('accepts a well-formed template', () => {
    expect(() => validateTemplate(tpl())).not.toThrow()
  })

  it('rejects a merge field with no question and no ambient source', () => {
    expect(() => validateTemplate(tpl({
      body: [{ type: 'paragraph', text: 'Deadline is {{deadline_date}}.' }],
    }))).toThrow(/deadline_date/)
  })

  it('accepts ambient fields the send pipeline always provides', () => {
    expect(() => validateTemplate(tpl({
      body: [{ type: 'paragraph', text: 'Hi {{recipient_name}} of {{association_name}}.' }],
      questions: [],
    }))).not.toThrow()
  })

  it('rejects a question that the body never uses', () => {
    expect(() => validateTemplate(tpl({
      questions: [
        { id: 'affected_areas', label: 'Where?', type: 'multiselect', options: ['A'], required: true },
        { id: 'unused_field', label: 'Unused', type: 'text', required: true },
      ],
    }))).toThrow(/unused_field/)
  })

  it('rejects a non-snake_case question id', () => {
    expect(() => validateTemplate(tpl({
      body: [{ type: 'paragraph', text: 'See {{affectedAreas}}.' }],
      questions: [{ id: 'affectedAreas', label: 'Where?', type: 'text', required: true }],
    }))).toThrow(/snake_case/i)
  })

  it('rejects an accent outside the safe luminance window', () => {
    expect(() => validateTemplate(tpl({ accentColor: '#A8E6C4' }))).toThrow(/luminance/i)
  })

  it('rejects a select question with no options', () => {
    expect(() => validateTemplate(tpl({
      body: [{ type: 'paragraph', text: 'Tone {{tone}}.' }],
      questions: [{ id: 'tone', label: 'Tone', type: 'select', required: true }],
    }))).toThrow(/options/i)
  })

  it('rejects more than five questions — the composer must stay under a minute', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({
      id: `f_${i}`, label: `L${i}`, type: 'text' as const, required: true,
    }))
    expect(() => validateTemplate(tpl({
      body: [{ type: 'paragraph', text: six.map((q) => `{{${q.id}}}`).join(' ') }],
      questions: six,
    }))).toThrow(/five/i)
  })

  it('rejects deadline_date on a single-property template', () => {
    expect(() => validateTemplate(tpl({
      audience: 'single_property',
      body: [{ type: 'paragraph', text: 'By {{deadline_date}}.' }],
      questions: [{ id: 'deadline_date', label: 'By when?', type: 'date', required: true }],
    }))).toThrow(/cure_window/)
  })
})

describe('COMMUNITY_TEMPLATES', () => {
  it('has unique slugs', () => {
    const slugs = COMMUNITY_TEMPLATES.map((t) => t.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('every registered template validates', () => {
    for (const t of COMMUNITY_TEMPLATES) {
      expect(() => validateTemplate(t), `invalid: ${t.slug}`).not.toThrow()
    }
  })

  it('getTemplate finds by slug and returns undefined otherwise', () => {
    expect(getTemplate('definitely-not-a-slug')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit apps/hoa/src/lib/community-templates/registry.test.ts`
Expected: FAIL — cannot resolve `./registry`

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/hoa/src/lib/community-templates/registry.ts
/**
 * The community template library.
 *
 * Validation runs at module load, so a malformed template fails the build
 * and the test suite rather than shipping a broken email. The two rules
 * that matter most:
 *
 *   - Every {{ placeholder }} in the body must be answerable. Either a
 *     question produces it or the send pipeline always provides it. This is
 *     what stops the bug the seeded transactional templates still have,
 *     where 71 merge fields silently render as empty string.
 *   - Single-property templates use cure_window, never deadline_date. The
 *     naming split keeps courtesy nudges linguistically separate from
 *     enforcement deadlines, so a board cannot accidentally send what reads
 *     as a defective formal notice.
 */

import { assertAccent } from '@/lib/email/palette'
import type { CommunityTemplate, BodyBlock } from './types'

/** Fields the send pipeline supplies for every message. */
export const AMBIENT_FIELDS = new Set([
  'association_name',
  'recipient_name',
  'owner_name',
  'unit_id',
])

const MAX_QUESTIONS = 5
const SNAKE = /^[a-z][a-z0-9_]*$/

function blockText(b: BodyBlock): string {
  switch (b.type) {
    case 'paragraph':
    case 'callout':
      return b.text
    case 'list':
      return b.items.join(' ')
    case 'visual':
      return ''
  }
}

function placeholdersIn(t: CommunityTemplate): Set<string> {
  const source = [t.subject, ...t.body.map(blockText)].join(' ')
  const found = new Set<string>()
  for (const m of source.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) found.add(m[1])
  if (t.cta) found.add(t.cta.urlField)
  return found
}

export function validateTemplate(t: CommunityTemplate): void {
  // assertAccent knows the colour but not whose it is. With seven templates
  // "accent #A8E6C4 has luminance 0.85" does not tell you where to look, and
  // every other error in this function is slug-prefixed.
  try {
    assertAccent(t.accentColor)
  } catch (err) {
    throw new Error(`${t.slug}: ${(err as Error).message}`)
  }

  if (t.questions.length > MAX_QUESTIONS) {
    throw new Error(
      `${t.slug}: ${t.questions.length} questions, limit is five — the composer must stay under a minute`,
    )
  }

  for (const q of t.questions) {
    if (!SNAKE.test(q.id)) {
      throw new Error(`${t.slug}: question id "${q.id}" must be snake_case`)
    }
    if ((q.type === 'select' || q.type === 'multiselect') && !q.options?.length) {
      throw new Error(`${t.slug}: question "${q.id}" is ${q.type} and needs options`)
    }
    if (t.audience === 'single_property' && q.id === 'deadline_date') {
      throw new Error(
        `${t.slug}: single-property templates use cure_window, not deadline_date — ` +
          'a soft courtesy window must not be worded as an enforcement deadline',
      )
    }
  }

  const used = placeholdersIn(t)
  const answered = new Set(t.questions.map((q) => q.id))

  for (const field of used) {
    if (!answered.has(field) && !AMBIENT_FIELDS.has(field)) {
      throw new Error(
        `${t.slug}: body uses {{${field}}} but no question produces it and it is not ambient. ` +
          'It would render as empty string.',
      )
    }
  }

  for (const q of t.questions) {
    if (!used.has(q.id)) {
      throw new Error(`${t.slug}: question "${q.id}" is never used in the subject or body`)
    }
  }
}

// Task 11 populates this array.
const ALL: CommunityTemplate[] = []

for (const t of ALL) validateTemplate(t)

export const COMMUNITY_TEMPLATES: readonly CommunityTemplate[] = Object.freeze(ALL)

export function getTemplate(slug: string): CommunityTemplate | undefined {
  return COMMUNITY_TEMPLATES.find((t) => t.slug === slug)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit apps/hoa/src/lib/community-templates/registry.test.ts`
Expected: PASS, 12 tests

- [ ] **Step 5: Commit**

```bash
git add apps/hoa/src/lib/community-templates/registry.ts \
        apps/hoa/src/lib/community-templates/registry.test.ts
git commit -m "feat(comms): template registry with load-time validation

Every placeholder must be answerable by a question or ambient field —
the rule that prevents the empty-merge-field bug the seeded transactional
templates still have."
```

---

### Task 11: The seven templates — PARALLEL

**Dispatch all seven concurrently.** Each is one new file plus one line in `registry.ts`. No shared state.

**Files (per template):**
- Create: `apps/hoa/src/lib/community-templates/templates/<slug>.ts`
- Modify: `apps/hoa/src/lib/community-templates/registry.ts` (import + push into `ALL`)

**Interfaces:**
- Consumes: `CommunityTemplate` from `../types`
- Produces: a default export of type `CommunityTemplate`

**Shared instructions for every subagent working this task:**

1. Read `apps/hoa/src/lib/community-templates/types.ts` and `registry.ts` first. `validateTemplate` is the contract.
2. Copy must be **neighbourly, specific, and never accusatory**. Say "we've had reports", never "you are violating". Assume the reader is one of the majority already doing the right thing.
3. Never use the words *violation*, *fine*, *penalty* or *cure period* unless the template is genuinely opening enforcement. None of these seven are.
4. Draw merge-field names from the shared vocabulary: `deadline_date`, `start_date`, `end_date`, `event_date`, `effective_date`, `start_time`, `end_time`, `hours_window`, `affected_areas`, `contact_name`, `contact_phone`, `report_contact`, `reason`, `submission_method`, `required_items`, `vendor_name`, `fee_amount`, `policy_reference`, `consequence_note`, `tone`.
5. Max five questions. Each answerable in twenty seconds. Prefer `select`/`multiselect` over free text. Never ask what the app already knows.
6. Every `{{placeholder}}` needs a question or must be ambient (`association_name`, `recipient_name`, `owner_name`, `unit_id`).
7. Put the ask in the **first paragraph**, before the `{ type: 'visual' }` block.
8. Fill `legalNote` from the catalogue caution for that topic (spec Appendix A).
9. Accent and asset filename come from `PICTOGRAMS` in `scripts/build-email-assets.ts` — they must match exactly.

**Worked reference — implement `dog-leash-and-waste.ts` exactly as below, then follow its pattern for the rest:**

```ts
// apps/hoa/src/lib/community-templates/templates/dog-leash-and-waste.ts
import type { CommunityTemplate } from '../types'

const template: CommunityTemplate = {
  slug: 'dog-leash-and-waste',
  name: 'Dogs — Leash Rules and Picking Up After Your Pet',
  description:
    'A community-wide nudge about pet waste and off-leash dogs, naming the areas where it has become a problem and where the bag stations are. Send before anything formal.',
  genre: 'conduct',
  shape: 'reminder',
  audience: 'broadcast',
  accentColor: '#1C6772',
  visual: {
    kind: 'illustration',
    asset: 'dog-leash-and-waste.png',
    alt: 'A resident walking a leashed dog past a waste bag station',
  },
  subject: 'A friendly reminder about dogs in {{association_name}}',
  preview: 'Where the bag stations are, and a note about leashes.',
  body: [
    { type: 'paragraph', text: 'Hi {{recipient_name}},' },
    {
      type: 'paragraph',
      text: "We've had a number of reports about {{issue_type}} over the past few weeks, most often around {{affected_areas}}.",
    },
    { type: 'visual' },
    {
      type: 'paragraph',
      text: 'The overwhelming majority of dog owners here already clean up and keep their dogs leashed in shared spaces. This is just a nudge for everyone to keep at it.',
    },
    {
      type: 'callout',
      text: 'Bag stations are at {{station_locations}}. If you find one empty or damaged, reply to this email and we will restock it.',
    },
    {
      type: 'paragraph',
      text: 'Thanks for helping keep the neighbourhood pleasant for everyone — including the neighbours who are nervous around dogs they do not know.',
    },
  ],
  questions: [
    {
      id: 'issue_type',
      label: 'What is the problem right now?',
      type: 'select',
      options: [
        'pet waste left on lawns and paths',
        'dogs off leash in shared spaces',
        'both pet waste and off-leash dogs',
      ],
      required: true,
    },
    {
      id: 'affected_areas',
      label: 'Where is it worst?',
      type: 'multiselect',
      options: [
        'the east entrance',
        'the main walking path',
        'the mailboxes',
        'the playground',
        'the clubhouse lawn',
        'the north cul-de-sac',
      ],
      required: true,
      help: 'Naming the actual spots is what makes people recognise themselves.',
    },
    {
      id: 'station_locations',
      label: 'Where are the bag stations?',
      type: 'text',
      required: true,
      help: 'e.g. "the clubhouse, the east entrance, and the playground"',
    },
  ],
  legalNote:
    'Keep this community-wide. Do not describe a specific dog, breed, unit or time of day that identifies one household, and never attach a camera still of an identifiable person — that turns a nudge into a public accusation. Breed-specific wording invites discrimination and insurance disputes. If a bite occurred, handle it directly, not here. Service and assistance animals are not pets.',
}

export default template
```

- [ ] **Step 1: Write `dog-leash-and-waste.ts` exactly as above**

- [ ] **Step 2: Write the remaining six**

Follow the same structure. Required values:

| File | slug | shape | accent | asset | visual kind |
|---|---|---|---|---|---|
| `guest-parking.ts` | `guest-parking` | reminder | `#2C6FAF` | `guest-parking.png` | map |
| `trash-and-recycling-bins.ts` | `trash-and-recycling-bins` | reminder | `#268298` | `trash-and-recycling-bins.png` | illustration |
| `work-on-site.ts` | `work-on-site` | notice | `#7A6A1D` | `work-on-site.png` | map |
| `community-cleanup-day.ts` | `community-cleanup-day` | invitation | `#A63A87` | `community-cleanup-day.png` | illustration |
| `pool-pass-renewal.ts` | `pool-pass-renewal` | submission_request | `#1C6F31` | `pool-pass-renewal.png` | illustration |
| `lease-cap-status.ts` | `lease-cap-status` | notice | `#3A5AA8` | — | **meter** |

Shape-specific requirements:

- **`work-on-site`** (notice): must carry `start_date`, `end_date`, `affected_areas`, and what the disruption actually is. Residents need to know whether to move a car.
- **`community-cleanup-day`** (invitation): must carry `event_date`, `start_time`, `end_time`, where to meet, and what is provided. Include the prohibited-items list if a dumpster is involved — hazardous waste in an association-rented container is the association's problem.
- **`pool-pass-renewal`** (submission_request): must carry `deadline_date`, `required_items`, `submission_method`. State the deadline in the first paragraph, not only in the callout. `legalNote` must cover the three traps: age-based swim rules can be familial-status discrimination; a parent-signed waiver for a minor is unenforceable in several states; some states restrict conditioning amenity access on unpaid assessments.
- **`lease-cap-status`** (notice, meter): `visual` is `{ kind: 'meter', label: 'Homes currently leased', valuePct: 0, capPct: 1, valueLabel: '', capLabel: '' }` as a placeholder — Task 14 replaces it at render time with live values. Body must explain, in text, that exceeding the cap can make units unmortgageable under FHA and Fannie Mae owner-occupancy rules. Questions must **not** ask for the cap or the current count — those come from the database. `legalNote`: never name who is leasing or waiting; state the cap as the governing documents state it and cite the section.

- [ ] **Step 3: Register all seven**

In `registry.ts`, replace `const ALL: CommunityTemplate[] = []` with:

```ts
import dogLeashAndWaste from './templates/dog-leash-and-waste'
import guestParking from './templates/guest-parking'
import trashAndRecyclingBins from './templates/trash-and-recycling-bins'
import workOnSite from './templates/work-on-site'
import communityCleanupDay from './templates/community-cleanup-day'
import poolPassRenewal from './templates/pool-pass-renewal'
import leaseCapStatus from './templates/lease-cap-status'

const ALL: CommunityTemplate[] = [
  dogLeashAndWaste,
  guestParking,
  trashAndRecyclingBins,
  workOnSite,
  communityCleanupDay,
  poolPassRenewal,
  leaseCapStatus,
]
```

- [ ] **Step 4: Add a coverage test**

```ts
// apps/hoa/src/lib/community-templates/coverage.test.ts
import { describe, it, expect } from 'vitest'
import { COMMUNITY_TEMPLATES } from './registry'
import { PICTOGRAMS } from '@/lib/email/pictogram-manifest'

describe('phase 1 library', () => {
  it('ships exactly seven templates', () => {
    expect(COMMUNITY_TEMPLATES).toHaveLength(7)
  })

  it('covers all four shapes', () => {
    const shapes = new Set(COMMUNITY_TEMPLATES.map((t) => t.shape))
    expect([...shapes].sort()).toEqual(['invitation', 'notice', 'reminder', 'submission_request'])
  })

  it('is broadcast-only in phase 1', () => {
    for (const t of COMMUNITY_TEMPLATES) expect(t.audience, t.slug).toBe('broadcast')
  })

  it('uses no chart block', () => {
    for (const t of COMMUNITY_TEMPLATES) expect(t.visual.kind, t.slug).not.toBe('chart')
  })

  it('every image asset has a matching generated PNG entry', () => {
    const built = new Set(PICTOGRAMS.map((p) => `${p.slug}.png`))
    for (const t of COMMUNITY_TEMPLATES) {
      if (t.visual.kind === 'illustration' || t.visual.kind === 'map' || t.visual.kind === 'photo') {
        expect(built, `${t.slug} references ${t.visual.asset}`).toContain(t.visual.asset)
      }
    }
  })

  it('accent colours match the asset build config', () => {
    const byslug = new Map(PICTOGRAMS.map((p) => [p.slug, p.accent]))
    for (const t of COMMUNITY_TEMPLATES) {
      const expected = byslug.get(t.slug)
      if (expected) expect(t.accentColor, t.slug).toBe(expected)
    }
  })

  it('every template carries a legal note', () => {
    for (const t of COMMUNITY_TEMPLATES) {
      expect(t.legalNote, `${t.slug} has no legalNote`).toBeTruthy()
    }
  })
})
```

- [ ] **Step 5: Run the full suite**

Run: `pnpm test:unit apps/hoa/src/lib/community-templates/`
Expected: PASS. A failure here names the offending template and the rule it broke.

- [ ] **Step 6: Typecheck and commit**

```bash
pnpm typecheck
git add apps/hoa/src/lib/community-templates/
git commit -m "feat(comms): seven phase-1 community templates"
```

---

### Task 12: Registry → seed SQL generator

**Files:**
- Create: `scripts/generate-community-templates-sql.ts`
- Create: `migrations/seed-community-templates.sql` (generated)
- Modify: `package.json`

**Interfaces:**
- Consumes: `COMMUNITY_TEMPLATES` (Task 11), `renderCommunityEmailHtml`/`renderCommunityEmailText` (Task 9)
- Produces: an idempotent seed migration

- [ ] **Step 1: Write the generator**

```ts
// scripts/generate-community-templates-sql.ts
/**
 * Compiles the typed registry into an idempotent seed migration.
 *
 * Global rows: organization_id IS NULL. Keyed on topic_slug via the partial
 * unique index from 0044, so re-running updates rather than duplicating.
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
// origin — the real value is read at send time in the app.
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
-- on topic_slug against the partial unique index from 0044, so re-running
-- updates the copy in place rather than duplicating rows.
--
-- Requires 0044_community_templates.sql to have been applied first.

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
```

- [ ] **Step 2: Register the script**

Add to root `package.json`:

```json
"generate:community-sql": "tsx scripts/generate-community-templates-sql.ts",
```

- [ ] **Step 3: Generate and eyeball**

```bash
pnpm generate:community-sql
head -40 migrations/seed-community-templates.sql
grep -c "DOCTYPE" migrations/seed-community-templates.sql
```

Expected: `7` doctypes — one per template body.

- [ ] **Step 4: Apply and verify**

Paste `migrations/seed-community-templates.sql` into the Supabase SQL editor and run it.
Expected: final row reads `PASS`. Run it a second time — still `PASS`, still 7 rows. That is the idempotency check.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-community-templates-sql.ts migrations/seed-community-templates.sql package.json
git commit -m "feat(comms): generate idempotent global seed SQL from the template registry"
```

---

### Task 13: Per-template merge bag and strict rendering

**Files:**
- Create: `apps/hoa/src/lib/community-templates/merge-bag.ts`
- Test: `apps/hoa/src/lib/community-templates/merge-bag.test.ts`
- Modify: `apps/hoa/src/lib/communications/send.ts` (~line 247)

**Interfaces:**
- Consumes: `TemplateQuestion` (Task 9), `AMBIENT_FIELDS` (Task 10)
- Produces: `buildMergeBag(questions, answers, ambient): MergeBag`, `AnswerMap`

- [ ] **Step 1: Write the failing test**

```ts
// apps/hoa/src/lib/community-templates/merge-bag.test.ts
import { describe, it, expect } from 'vitest'
import { buildMergeBag } from './merge-bag'
import type { TemplateQuestion } from './types'

const AMBIENT = { association_name: 'Madison Park', recipient_name: 'Sarah', owner_name: 'Sarah', unit_id: 'u1' }

const QS: TemplateQuestion[] = [
  { id: 'issue_type', label: 'What?', type: 'select', options: ['pet waste'], required: true },
  { id: 'affected_areas', label: 'Where?', type: 'multiselect', options: ['A', 'B', 'C'], required: true },
  { id: 'note', label: 'Note', type: 'text', required: false, fallback: 'no extra note' },
]

describe('buildMergeBag', () => {
  it('passes ambient fields straight through', () => {
    const bag = buildMergeBag(QS, { issue_type: 'pet waste', affected_areas: ['A'] }, AMBIENT)
    expect(bag.association_name).toBe('Madison Park')
    expect(bag.recipient_name).toBe('Sarah')
  })

  it('joins a two-item multiselect with "and"', () => {
    const bag = buildMergeBag(QS, { issue_type: 'x', affected_areas: ['A', 'B'] }, AMBIENT)
    expect(bag.affected_areas).toBe('A and B')
  })

  it('uses an Oxford-style list for three or more', () => {
    const bag = buildMergeBag(QS, { issue_type: 'x', affected_areas: ['A', 'B', 'C'] }, AMBIENT)
    expect(bag.affected_areas).toBe('A, B and C')
  })

  it('returns a single item unadorned', () => {
    const bag = buildMergeBag(QS, { issue_type: 'x', affected_areas: ['A'] }, AMBIENT)
    expect(bag.affected_areas).toBe('A')
  })

  it('throws when a required answer is missing', () => {
    expect(() => buildMergeBag(QS, { affected_areas: ['A'] }, AMBIENT)).toThrow(/issue_type/)
  })

  it('throws when a required multiselect is empty', () => {
    expect(() => buildMergeBag(QS, { issue_type: 'x', affected_areas: [] }, AMBIENT)).toThrow(/affected_areas/)
  })

  it('uses the fallback for an unanswered optional question', () => {
    const bag = buildMergeBag(QS, { issue_type: 'x', affected_areas: ['A'] }, AMBIENT)
    expect(bag.note).toBe('no extra note')
  })

  it('never leaves an optional field undefined — strict render would throw', () => {
    const qs: TemplateQuestion[] = [{ id: 'opt', label: 'O', type: 'text', required: false }]
    const bag = buildMergeBag(qs, {}, AMBIENT)
    expect(bag.opt).toBe('')
    expect('opt' in bag).toBe(true)
  })

  it('rejects an answer for a question the template does not declare', () => {
    expect(() => buildMergeBag(QS, { issue_type: 'x', affected_areas: ['A'], sneaky: 'v' }, AMBIENT))
      .toThrow(/sneaky/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit apps/hoa/src/lib/community-templates/merge-bag.test.ts`
Expected: FAIL — cannot resolve `./merge-bag`

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/hoa/src/lib/community-templates/merge-bag.ts
/**
 * Turns the board member's answers into the merge bag the template renders
 * against.
 *
 * This is the fix for the bug the seeded transactional templates still have:
 * send.ts built a hardcoded four-key bag and renderTemplate blanked anything
 * else silently, so 71 merge fields across the library rendered as empty
 * string and the dues reminder went out reading "your dues of  are due on ."
 *
 * Every declared question produces a key here — including optional ones,
 * which fall back rather than being omitted. That guarantee is what lets the
 * send path use renderTemplateStrict, which throws on a missing field, so a
 * half-baked message can never leave the system.
 */

import type { TemplateQuestion } from './types'
import type { MergeBag } from '@/lib/communications/templates'

export type AnswerMap = Record<string, string | string[] | undefined>

/** "A", "A and B", "A, B and C" — reads like a person wrote it. */
export function joinHumanList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

export function buildMergeBag(
  questions: readonly TemplateQuestion[],
  answers: AnswerMap,
  ambient: Record<string, string>,
): MergeBag {
  const declared = new Set(questions.map((q) => q.id))
  for (const key of Object.keys(answers)) {
    if (!declared.has(key)) {
      throw new Error(`answer supplied for undeclared question "${key}"`)
    }
  }

  const bag: MergeBag = { ...ambient }

  for (const q of questions) {
    const raw = answers[q.id]
    const value = Array.isArray(raw) ? joinHumanList(raw) : (raw ?? '').trim()

    if (!value) {
      if (q.required) {
        throw new Error(`missing required answer: ${q.id} (${q.label})`)
      }
      bag[q.id] = q.fallback ?? ''
      continue
    }
    bag[q.id] = value
  }

  return bag
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit apps/hoa/src/lib/community-templates/merge-bag.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 5: Wire strict rendering into the send path**

In `apps/hoa/src/lib/communications/send.ts`, the `deliverOne` function currently starts with a hardcoded bag at ~line 247. Change the signature so the caller passes a per-message bag, and switch to strict rendering:

```ts
  // The caller builds this from the template's declared questions via
  // buildMergeBag. Ambient recipient fields are merged in per recipient.
  async function deliverOne(recipient: RecipientRow, extraFields: MergeBag): Promise<Outcome> {
    const bag: MergeBag = {
      ...extraFields,
      owner_name: recipient.recipient_name ?? 'Resident',
      recipient_name: recipient.recipient_name ?? 'Resident',
      association_name: associationName,
      unit_id: recipient.unit_id ?? '',
    }

    // Strict: throws rather than silently blanking. A template whose fields
    // are not all supplied must fail loudly before Resend is called.
    let subject: string
    let html: string
    let text: string | undefined
    try {
      subject = renderTemplateStrict(value.subject, bag)
      html = renderTemplateStrict(value.bodyHtml, bag)
      text = value.bodyText ? renderTemplateStrict(value.bodyText, bag) : undefined
    } catch (err) {
      await markFailed(supabase, recipient.id, (err as Error).message)
      return 'skipped'
    }
```

Update the import at the top of the file:

```ts
import { renderTemplateStrict, type MergeBag } from './templates'
```

Update the call site of `deliverOne` to pass the answers bag (default `{}` for the existing transactional path so its behaviour is unchanged until those templates are migrated).

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: clean. If the existing call site does not compile, pass `{}` explicitly rather than making the parameter optional — an optional parameter here reintroduces the silent-blank failure mode.

- [ ] **Step 7: Commit**

```bash
git add apps/hoa/src/lib/community-templates/merge-bag.ts \
        apps/hoa/src/lib/community-templates/merge-bag.test.ts \
        apps/hoa/src/lib/communications/send.ts
git commit -m "feat(comms): per-template merge bags with strict rendering

renderTemplate blanks unknown fields silently. Switching the send path to
renderTemplateStrict means a template with an unsupplied field fails before
Resend is called instead of delivering an email with holes in it."
```

---

### Task 14: Lease cap data adapter

**Files:**
- Create: `apps/hoa/src/lib/community-templates/lease-cap.ts`
- Test: `apps/hoa/src/lib/community-templates/lease-cap.test.ts`

**Interfaces:**
- Consumes: `LeaseStats` shape from `@/lib/leases` (`getLeaseStats` at `apps/hoa/src/lib/leases.ts:74` returns `leasedCount`, `totalUnits`, `leasedPct`, `capPct`), `VisualBlockSpec` (Task 8)
- Produces: `buildLeaseCapVisual(stats, waitingCount): VisualBlockSpec`, `buildLeaseCapFields(stats, waitingCount): Record<string,string>`

Kept pure — it takes already-fetched stats rather than querying, so it is unit-testable under the no-Supabase rule.

- [ ] **Step 1: Write the failing test**

```ts
// apps/hoa/src/lib/community-templates/lease-cap.test.ts
import { describe, it, expect } from 'vitest'
import { buildLeaseCapVisual, buildLeaseCapFields } from './lease-cap'

const STATS = { leasedCount: 10, totalUnits: 80, leasedPct: 12.5, capPct: 15 }

describe('buildLeaseCapVisual', () => {
  it('builds a meter against the cap', () => {
    const v = buildLeaseCapVisual(STATS, 3)
    expect(v).toMatchObject({ kind: 'meter', valuePct: 12.5, capPct: 15 })
  })

  it('labels the count without naming anyone', () => {
    const v = buildLeaseCapVisual(STATS, 3)
    if (v.kind !== 'meter') throw new Error('expected meter')
    expect(v.valueLabel).toBe('10 of 80 homes')
    expect(v.capLabel).toBe('15% cap')
  })

  it('refuses to render when the cap is unset rather than guessing', () => {
    expect(() => buildLeaseCapVisual({ ...STATS, capPct: null }, 0)).toThrow(/cap is not set/i)
  })

  it('refuses a zero cap', () => {
    expect(() => buildLeaseCapVisual({ ...STATS, capPct: 0 }, 0)).toThrow(/cap/i)
  })
})

describe('buildLeaseCapFields', () => {
  it('produces text fields carrying the same numbers as the meter', () => {
    const f = buildLeaseCapFields(STATS, 3)
    expect(f.leased_count).toBe('10')
    expect(f.total_units).toBe('80')
    expect(f.leased_pct).toBe('12.5%')
    expect(f.cap_pct).toBe('15%')
    expect(f.waiting_count).toBe('3')
  })

  it('says how many more homes may be leased', () => {
    // floor(0.15 * 80) = 12 permitted, 10 leased → 2 remaining
    expect(buildLeaseCapFields(STATS, 0).remaining_slots).toBe('2')
  })

  it('reports zero remaining rather than a negative when over the cap', () => {
    const over = { leasedCount: 14, totalUnits: 80, leasedPct: 17.5, capPct: 15 }
    expect(buildLeaseCapFields(over, 0).remaining_slots).toBe('0')
  })

  it('pluralises the waiting list correctly', () => {
    expect(buildLeaseCapFields(STATS, 1).waiting_phrase).toBe('1 household is on the waiting list')
    expect(buildLeaseCapFields(STATS, 3).waiting_phrase).toBe('3 households are on the waiting list')
    expect(buildLeaseCapFields(STATS, 0).waiting_phrase).toBe('no households are on the waiting list')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit apps/hoa/src/lib/community-templates/lease-cap.test.ts`
Expected: FAIL — cannot resolve `./lease-cap`

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/hoa/src/lib/community-templates/lease-cap.ts
/**
 * Turns lease statistics into the meter and text fields for the lease cap
 * notice.
 *
 * Pure by design: it takes stats already fetched by getLeaseStats
 * (apps/hoa/src/lib/leases.ts:74) rather than querying, so it is unit
 * testable and the query stays in one place.
 *
 * Two hard rules, both enforced here rather than left to the copy:
 *
 *   - Totals only. Never a unit number, never a resident name, never a
 *     property_id from lease_waiting_list. This email goes to the whole
 *     community and in a small association a single identifying detail
 *     names the household.
 *   - If the board has not set a cap, refuse. Never substitute
 *     lease_cap_ai_suggested_pct — that value is an advisory reading of the
 *     governing documents and has not been reviewed. A wrong cap stated in
 *     a mass email reads as a rule change.
 */

import type { VisualBlockSpec } from '@/lib/email/visual-block'

export interface LeaseCapStats {
  leasedCount: number
  totalUnits: number
  leasedPct: number
  capPct: number | null
}

function requireCap(stats: LeaseCapStats): number {
  if (stats.capPct === null || stats.capPct === undefined) {
    throw new Error(
      'lease cap is not set for this association. Set it from the lease policy ' +
        'screen before sending — the AI-suggested value is advisory and must not be used here.',
    )
  }
  if (!(stats.capPct > 0)) {
    throw new Error(`lease cap must be greater than zero, got ${stats.capPct}`)
  }
  return stats.capPct
}

function round1(n: number): string {
  return `${Math.round(n * 10) / 10}`
}

export function buildLeaseCapVisual(stats: LeaseCapStats, _waitingCount: number): VisualBlockSpec {
  const cap = requireCap(stats)
  return {
    kind: 'meter',
    label: 'Homes currently leased',
    valuePct: stats.leasedPct,
    capPct: cap,
    valueLabel: `${stats.leasedCount} of ${stats.totalUnits} homes`,
    capLabel: `${round1(cap)}% cap`,
  }
}

export function buildLeaseCapFields(
  stats: LeaseCapStats,
  waitingCount: number,
): Record<string, string> {
  const cap = requireCap(stats)
  const permitted = Math.floor((cap / 100) * stats.totalUnits)
  const remaining = Math.max(0, permitted - stats.leasedCount)

  const waitingPhrase =
    waitingCount === 0
      ? 'no households are on the waiting list'
      : waitingCount === 1
        ? '1 household is on the waiting list'
        : `${waitingCount} households are on the waiting list`

  return {
    leased_count: String(stats.leasedCount),
    total_units: String(stats.totalUnits),
    leased_pct: `${round1(stats.leasedPct)}%`,
    cap_pct: `${round1(cap)}%`,
    permitted_count: String(permitted),
    remaining_slots: String(remaining),
    waiting_count: String(waitingCount),
    waiting_phrase: waitingPhrase,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit apps/hoa/src/lib/community-templates/lease-cap.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Verify the LeaseCapStats shape matches the real helper**

```bash
grep -n "leasedCount\|totalUnits\|leasedPct\|capPct" apps/hoa/src/lib/leases.ts | head
```

Expected: the `LeaseStats` interface at ~line 37 has all four. If a name differs, fix `LeaseCapStats` to match — do not adapt at the call site.

- [ ] **Step 6: Commit**

```bash
git add apps/hoa/src/lib/community-templates/lease-cap.ts \
        apps/hoa/src/lib/community-templates/lease-cap.test.ts
git commit -m "feat(comms): lease cap meter and fields, refusing to guess an unset cap"
```

---

### Task 15: The images-off guard

**Files:**
- Create: `apps/hoa/src/lib/community-templates/images-off.test.ts`

**Interfaces:**
- Consumes: `COMMUNITY_TEMPLATES` (Task 11), `renderCommunityEmailHtml` (Task 9)
- Produces: nothing — this is the enforcement of the spec's core invariant

The spec calls for a lint rule. A test is the same enforcement with less machinery and it runs in the existing suite, so this implements it as a test.

- [ ] **Step 1: Write the guard**

```ts
// apps/hoa/src/lib/community-templates/images-off.test.ts
/**
 * The invariant from §7.6 of the design spec:
 *
 *   Delete every <img> and the email must still be complete and actionable.
 *
 * Classic Outlook and Office 365 OWA block remote images by default. For a
 * meaningful share of recipients the alt text IS the visual block. If a
 * template ever puts the deadline, the affected streets or the event date
 * only in the image, those recipients get an unusable email — and nobody
 * notices, because the people testing it use Gmail.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { COMMUNITY_TEMPLATES } from './registry'
import { renderCommunityEmailHtml } from './render'
import { findBackgroundWithoutColor } from '@/lib/email/test-helpers'

beforeAll(() => {
  process.env.EMAIL_ASSET_BASE_URL = 'https://app.homeownerhub.com'
})

function stripImages(html: string): string {
  return html.replace(/<img[^>]*>/gi, '')
}

function textOf(html: string): string {
  return stripImages(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

describe.each(COMMUNITY_TEMPLATES.map((t) => [t.slug, t] as const))(
  'images-off: %s',
  (_slug, t) => {
    const html = renderCommunityEmailHtml(t)

    it('every declared merge field survives image removal', () => {
      const stripped = stripImages(html)
      for (const q of t.questions) {
        expect(stripped, `{{${q.id}}} only appears inside an image`).toContain(`{{${q.id}}}`)
      }
    })

    it('still has substantial readable text', () => {
      expect(textOf(html).length).toBeGreaterThan(200)
    })

    it('names the community in text', () => {
      expect(textOf(html)).toContain('{{association_name}}')
    })

    it('has at most one image', () => {
      expect((html.match(/<img/gi) ?? []).length).toBeLessThanOrEqual(1)
    })

    it('sets a foreground on every background', () => {
      // Uses the shared helper, NOT `toContain('color:')` — that assertion is
      // vacuous, because "background-color:" itself contains "color:".
      const violations = findBackgroundWithoutColor(html)
      expect(violations, `background without color in ${t.slug}`).toEqual([])
    })

    it('uses no gradient, flexbox or grid', () => {
      expect(html).not.toMatch(/gradient|display:\s*flex|display:\s*grid/)
    })
  },
)
```

- [ ] **Step 2: Run it**

Run: `pnpm test:unit apps/hoa/src/lib/community-templates/images-off.test.ts`
Expected: PASS — six assertions × seven templates = 42 tests. A failure names the template and the rule.

- [ ] **Step 3: Commit**

```bash
git add apps/hoa/src/lib/community-templates/images-off.test.ts
git commit -m "test(comms): enforce the images-off invariant across every template"
```

---

### Task 16: QuestionStep and wizard wiring

**Files:**
- Create: `apps/hoa/src/app/(dashboard)/communications/new/QuestionStep.tsx`
- Create: `apps/hoa/src/app/(dashboard)/communications/new/AudienceStep.tsx`
- Modify: `apps/hoa/src/app/(dashboard)/communications/new/NewCommunicationWizard.tsx`

**Interfaces:**
- Consumes: `TemplateQuestion` (Task 9), `buildMergeBag`/`AnswerMap` (Task 13)
- Produces: `<QuestionStep questions answers onChange />`, `<AudienceStep … />`

- [ ] **Step 1: Extract the audience block first**

`NewCommunicationWizard.tsx` is 896 lines and the audience section spans roughly lines 390–743. Move it verbatim into `AudienceStep.tsx` as a component taking the audience state and setters as props, and render `<AudienceStep … />` in its place. Change no behaviour.

- [ ] **Step 2: Verify nothing broke**

Run: `pnpm typecheck && pnpm test:unit`
Expected: clean, same test count as before.

- [ ] **Step 3: Commit the extraction on its own**

```bash
git add "apps/hoa/src/app/(dashboard)/communications/new/"
git commit -m "refactor(comms): extract AudienceStep from the wizard

Pure move, no behaviour change — the wizard was 896 lines and the audience
block was 350 of them."
```

- [ ] **Step 4: Write QuestionStep**

```tsx
// apps/hoa/src/app/(dashboard)/communications/new/QuestionStep.tsx
'use client'

import type { TemplateQuestion } from '@/lib/community-templates/types'
import type { AnswerMap } from '@/lib/community-templates/merge-bag'

interface Props {
  questions: readonly TemplateQuestion[]
  answers: AnswerMap
  onChange: (id: string, value: string | string[]) => void
}

/**
 * The declared-questions step. Each question maps 1:1 to a merge field, and
 * the answers become the merge bag — so an unanswered required question here
 * is what stops an email going out with a hole in it.
 */
export function QuestionStep({ questions, answers, onChange }: Props) {
  if (questions.length === 0) return null

  return (
    <div className="space-y-4">
      {questions.map((q) => {
        const value = answers[q.id]
        const id = `q-${q.id}`

        return (
          <div key={q.id} className="space-y-1">
            <label htmlFor={id} className="block text-sm font-medium text-gray-900">
              {q.label}
              {q.required && <span className="ml-1 text-red-600" aria-hidden="true">*</span>}
            </label>

            {q.type === 'multiselect' && q.options ? (
              <fieldset className="space-y-1" aria-describedby={q.help ? `${id}-help` : undefined}>
                <legend className="sr-only">{q.label}</legend>
                {q.options.map((opt) => {
                  const selected = Array.isArray(value) && value.includes(opt)
                  return (
                    <label key={opt} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => {
                          const current = Array.isArray(value) ? value : []
                          onChange(
                            q.id,
                            e.target.checked
                              ? [...current, opt]
                              : current.filter((v) => v !== opt),
                          )
                        }}
                      />
                      {opt}
                    </label>
                  )
                })}
              </fieldset>
            ) : q.type === 'select' && q.options ? (
              <select
                id={id}
                className="w-full rounded border-gray-300 text-sm"
                value={typeof value === 'string' ? value : ''}
                onChange={(e) => onChange(q.id, e.target.value)}
                aria-describedby={q.help ? `${id}-help` : undefined}
              >
                <option value="">— choose —</option>
                {q.options.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : q.type === 'textarea' ? (
              <textarea
                id={id}
                rows={3}
                className="w-full rounded border-gray-300 text-sm"
                value={typeof value === 'string' ? value : ''}
                onChange={(e) => onChange(q.id, e.target.value)}
                aria-describedby={q.help ? `${id}-help` : undefined}
              />
            ) : (
              <input
                id={id}
                type={q.type === 'date' ? 'date' : q.type === 'time' ? 'time' : q.type === 'number' ? 'number' : 'text'}
                className="w-full rounded border-gray-300 text-sm"
                value={typeof value === 'string' ? value : ''}
                onChange={(e) => onChange(q.id, e.target.value)}
                aria-describedby={q.help ? `${id}-help` : undefined}
              />
            )}

            {q.help && (
              <p id={`${id}-help`} className="text-xs text-gray-500">{q.help}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 5: Wire it into the wizard**

In `NewCommunicationWizard.tsx`:

1. Add state: `const [answers, setAnswers] = useState<AnswerMap>({})`
2. Reset it whenever the selected template changes, inside the existing template-select handler at ~line 251: `setAnswers({})`
3. Render `<QuestionStep questions={selectedTemplate?.questions ?? []} answers={answers} onChange={(id, v) => setAnswers((a) => ({ ...a, [id]: v }))} />` between the template step (§ line 743) and the subject/body step (§ line 767).
4. In `handleSubmit` (~line 349), before calling `sendCommunication`, build the bag and substitute:

```ts
import { buildMergeBag } from '@/lib/community-templates/merge-bag'
import { renderTemplate } from '@/lib/communications/templates'

// …inside handleSubmit, before sendCommunication:
if (selectedTemplate?.questions?.length) {
  let bag
  try {
    bag = buildMergeBag(selectedTemplate.questions, answers, {})
  } catch (err) {
    toast.error((err as Error).message)
    return
  }
  // Substitute the answered fields now; ambient fields stay as placeholders
  // for the per-recipient pass in send.ts.
  subject = renderTemplate(subject, bag).rendered
  bodyHtml = renderTemplate(bodyHtml, bag).rendered
}
```

- [ ] **Step 6: Verify by hand**

Run `pnpm dev:hoa`, open `/communications/new`, choose category **Community**, pick **Dogs — Leash Rules and Picking Up After Your Pet**.
Expected: three questions appear. Leaving "Which areas?" empty and submitting shows the error naming that field. Answering all three fills the areas into the body as a human-readable list.

- [ ] **Step 7: Typecheck, test, commit**

```bash
pnpm typecheck && pnpm test:unit
git add "apps/hoa/src/app/(dashboard)/communications/new/"
git commit -m "feat(comms): declared-questions step in the communications wizard"
```

---

### Task 17: Real-Postgres verification

**Files:**
- Create: `scripts/test-community-templates.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: the schema from Task 3 and the seeded rows from Task 12
- Produces: nothing — a verification harness

- [ ] **Step 1: Write the harness**

Follow the existing `scripts/test-comms.ts` structure exactly: `import './_load-env'`, a service-role `createClient`, and a `check(name, ok, detail)` helper that prints and tracks failures.

```ts
// scripts/test-community-templates.ts
/**
 * Real-Postgres checks for the global community template library.
 *
 * Cases:
 *   A. Seven global rows exist with category 'community'
 *   B. Every one has questions, visual_block and accent_color populated
 *   C. Every merge field in body_html is covered by a question or is ambient
 *   D. An anon/tenant client can SELECT globals but cannot INSERT one
 *   E. The communications CHECK accepts category 'community'
 *
 * Run: pnpm test:community-templates
 */

import './_load-env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../packages/db/src/database.types'

type Db = SupabaseClient<Database>

let failures = 0
function check(name: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const AMBIENT = new Set(['association_name', 'recipient_name', 'owner_name', 'unit_id'])

async function main(): Promise<void> {
  const admin: Db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: rows, error } = await admin
    .from('communication_templates')
    .select('topic_slug, name, shape, accent_color, questions, visual_block, body_html, subject')
    .is('organization_id', null)
    .eq('category', 'community')

  if (error) {
    check('A. query global templates', false, error.message)
    process.exit(1)
  }

  check('A. seven global community templates', rows!.length === 7, `got ${rows!.length}`)

  for (const r of rows!) {
    const qs = (r.questions ?? []) as Array<{ id: string }>
    check(
      `B. ${r.topic_slug} fully populated`,
      Boolean(r.accent_color) && Boolean(r.visual_block) && Array.isArray(qs),
    )

    const used = new Set(
      [...String(r.body_html).matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]),
    )
    const answered = new Set(qs.map((q) => q.id))
    const orphans = [...used].filter((f) => !answered.has(f) && !AMBIENT.has(f))
    check(`C. ${r.topic_slug} has no orphan merge fields`, orphans.length === 0, orphans.join(', '))
  }

  // D. RLS — the anon key must read globals but never write one.
  const anon: Db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const { data: readable } = await anon
    .from('communication_templates')
    .select('topic_slug')
    .is('organization_id', null)
  check('D1. globals are readable', (readable?.length ?? 0) > 0)

  const { error: insertErr } = await anon.from('communication_templates').insert({
    organization_id: null,
    category: 'community',
    name: 'rls probe',
    subject: 's',
    body_html: '<p>x</p>',
  } as never)
  check('D2. tenant cannot insert a global', insertErr !== null, insertErr?.message ?? 'INSERT SUCCEEDED')

  // E. The communications CHECK must accept 'community' too. Widening only
  // communication_templates passes every check above and then blows up at
  // the communications INSERT in send.ts — after the audience has resolved
  // and the board member has clicked Send. Prove it by actually inserting
  // a communications row with category 'community' and rolling it back.
  const { data: assoc } = await admin
    .from('associations')
    .select('id, organization_id')
    .limit(1)
    .maybeSingle()

  if (!assoc) {
    check('E. communications accepts community', false, 'no association to test against')
  } else {
    const probe = {
      organization_id: assoc.organization_id,
      association_id: assoc.id,
      category: 'community',
      subject: 'rls/check probe',
      body_html: '<p>probe</p>',
      status: 'draft',
    }
    const { data: inserted, error: commErr } = await admin
      .from('communications')
      .insert(probe as never)
      .select('id')
      .maybeSingle()

    check(
      'E. communications CHECK accepts category community',
      commErr === null,
      commErr?.message,
    )

    if (inserted?.id) {
      await admin.from('communications').delete().eq('id', inserted.id)
    }
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Register the script**

```json
"test:community-templates": "tsx scripts/test-community-templates.ts",
```

- [ ] **Step 3: Run it**

Run: `pnpm test:community-templates`
Expected: every line `PASS`, then `All checks passed.`

**If D2 reports `INSERT SUCCEEDED`, stop.** The RLS split in Task 3 did not take, and the global library is tenant-writable.

- [ ] **Step 4: Commit**

```bash
git add scripts/test-community-templates.ts package.json
git commit -m "test(comms): real-Postgres verification for the global template library"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §4.3 Bug A — Outlook shell | 2 |
| §4.3 Bug B — merge bag, strict render | 13 |
| §5.1 Global templates, four RLS policies | 3, 17 (D2) |
| §5.2 `community` on both CHECKs | 3 |
| §5.3 Five new columns | 3 |
| §6 Authoring in git, idempotent seed | 12 |
| §7.1 Table shell | 2 |
| §7.2 Opaque raster, dimensions, painted cell | 5, 8 |
| §7.3 Dark mode — luminance, colour pairing | 1, 7, 9, 15 |
| §7.4 `EMAIL_ASSET_BASE_URL` | 6 |
| §7.5 No VML, no CID, no gradient | 2, 15 |
| §7.6 Images-off invariant | 15 |
| §8 Pictogram baseline | 4, 5 |
| §8.1 Meter vs chart | 7 |
| §8.2 Lease cap worked example | 11, 14 |
| §9.1 Declared questions | 10, 16 |
| §9.2 Merge-bag contract | 13 |
| §10 Chart cut from phase 1 | 11 (coverage test asserts it) |
| §11 Seven templates, four shapes | 11 |
| §13 Testing matrix | 1–17 |

**Gaps accepted:** §9.3 (AI interview) and §12 (single-property routing, counsel review, `age-verification-55plus` gate) are explicitly phase 2+ in the spec.

**One deviation:** §7.6 specifies a lint rule; Task 15 implements it as a parameterised test. Same enforcement, runs in the existing suite, no new tooling.

**Type consistency:** `MergeBag` is imported from `@/lib/communications/templates` throughout. `VisualBlockSpec` is defined once in Task 8 and imported by Tasks 9 and 14. `TemplateQuestion.id` is the merge-field name everywhere. `PICTOGRAMS` slug/accent values in Task 5 are asserted against the registry by Task 11's coverage test, so the two cannot drift.

---

## Parallelism

- **Tasks 1, 3** — no dependencies, start together.
- **Tasks 4, 6, 7** — after Task 1.
- **Task 11** — seven independent files, dispatch all seven at once.
- Everything else is sequential on the graph at the top.
