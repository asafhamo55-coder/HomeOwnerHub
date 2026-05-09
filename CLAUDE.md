# HomeownerHub — Claude Code Project Guide

> This file is read first by Claude Code on every session. It contains everything needed to build, extend, and maintain the HomeownerHub platform without asking Asaf for context.

---

## What We Are Building and Why

HomeownerHub is an **AI-first property operations platform** comprising three standalone products under one brand:

| Hub | Domain | Who It Serves |
|-----|--------|---------------|
| **HOA Hub** | `hoa.homeownerhub.com` | Self-managed HOA boards + small management companies |
| **PM Hub** | `pm.homeownerhub.com` | Independent landlords (1–50 units) |
| **Eviction Hub** | `evict.homeownerhub.com` | Any landlord or HOA with a delinquent tenant/owner |

**The market we're disrupting.** 373,000 HOAs in the US collect $106B in annual assessments. 30–40% (~110,000–150,000) are entirely self-managed with no software at all. The incumbents (Vantaca, CINC Systems) serve only enterprise management companies — minimum $20K–$250K+/year, 8-week implementations, zero self-serve. **We serve the segment they ignore, at a price that makes AI feel like a no-brainer.**

**The primary competitor to beat is Vantaca.** Their HOAi product automates invoices (95% claimed), answers resident calls in 3 seconds, and handles violations. But they have three critical weaknesses we exploit:
1. No self-managed product whatsoever
2. UI is "click-heavy" (G2 reviews confirm) — ARC modules outdated, online voting not integrated
3. Custom enterprise pricing only — no transparency, no self-serve, no trial
4. 8-week guided onboarding vs. our 10-minute self-serve setup

**Our positioning in one sentence:** *AI that finishes the work — not just suggests it — at transparent flat-rate pricing, with your governing documents as the brain.*

---

## Repository Structure

```
homeownerhub/                          ← git root (https://github.com/asafhamo55-coder/HomeOwnerHub.git)
├── apps/
│   ├── hoa/                           ← HOA Hub (Next.js 15, port 3000)
│   ├── eviction/                      ← Eviction Hub (Next.js 15, port 3001)
│   └── pm/                            ← PM Hub (Next.js 15, port 3002)
├── packages/
│   ├── ui/                            ← Shared design system (ALL components live here)
│   ├── db/                            ← Supabase client + generated TypeScript types
│   └── ai/                            ← Multi-agent AI client (6 model variants)
├── schema.sql                         ← Full DB schema — run in Supabase SQL Editor
├── CLAUDE.md                          ← This file
├── PHASE1_IMPLEMENTATION.md           ← Full technical build plan (read this)
├── PHASE1_AI_ROUTING.md               ← Multi-agent AI architecture (read this)
├── env.hoa.local                      ← Copy to apps/hoa/.env.local
├── env.eviction.local                 ← Copy to apps/eviction/.env.local
└── env.pm.local                       ← Copy to apps/pm/.env.local
```

---

## Infrastructure & Credentials

### Supabase (single project, all three apps)
```
Project ID:  xwdjsxfskvreguyvryhc
URL:         https://xwdjsxfskvreguyvryhc.supabase.co
Anon key:    eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3ZGpzeGZza3ZyZWd1eXZyeWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMTEwNjAsImV4cCI6MjA5MzY4NzA2MH0.4xSNopnsyFxN0OO7qq7LICin3QIH2VFxcqpSLgxTjps
Service key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3ZGpzeGZza3ZyZWd1eXZyeWhjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODExMTA2MCwiZXhwIjoyMDkzNjg3MDYwfQ.hmjISE0A64pYoKx_sZBecme6HXj2aqDOp9zhbtZR9Xs
SQL Editor:  https://supabase.com/dashboard/project/xwdjsxfskvreguyvryhc/sql
```

> **RULE:** The anon key is used for all browser/server-component queries (RLS enforced). The service role key is used ONLY in Inngest background jobs and server-side webhook handlers. Never expose the service role key to the browser.

### Design Partner
```
Madison Park HOA — 49 homes, 3 board members
Plan: HOA Starter ($39/mo)
This is our live acceptance-test environment. Every v1 feature must work with real Madison Park data before it ships.
```

### Generate TypeScript types (run after any schema change)
```bash
npx supabase gen types typescript \
  --project-id xwdjsxfskvreguyvryhc \
  --schema public \
  > packages/db/src/database.types.ts
```

---

## The 17 AI Workflows (v1 — complete list)

These are the product. Every sprint prioritizes shipping the next workflow on this list over any other feature.

### HOA Hub Workflows

| # | Name | Agent Used | Bar Gate | What it does |
|---|------|-----------|---------|--------------|
| 1 | **Governing Docs Brain** | `reason` | None | RAG over this HOA's CC&Rs, bylaws, rules, minutes, and state statutes. Every other AI feature queries this first. Madison Park's Declaration is the reference implementation. |
| 2 | **AI Resident Concierge** | `main` + `fast` | None (auto-respond) | 24/7 email/SMS/chat. Classifies intent with `fast` agent, answers with `main` agent citing the exact CC&R section. Auto-creates a case if it can't resolve. |
| 3 | **AI Violation Inspector** | `vision` → `reason` → `main` | **Bar B** | Photo → vision agent describes violation → reason agent matches CC&R section → main agent drafts the notice. Human approves before sending. |
| 4 | **AI ARC Reviewer** | `reason` → `main` | **Bar B** | Homeowner submits modification request + photo → reason agent checks CC&R restrictions, setbacks, materials → main agent drafts board recommendation. |
| 5 | **AI Invoice Coding & AP** | `reason` | **Bar B** | Invoice → vendor lookup → GL coding → association allocation → approval routing. Target: 95%+ automation rate (Vantaca's headline claim — we match it). |
| 6 | **AI Assessment & Collections** | `reason` + `main` | **Bar B** | Drafts personalized late notices with payment plan offers based on resident history. Predicts next-cycle delinquencies. Flags hardship cases for human review. |
| 7 | **AI Board Packet Generator** | `main` | **Bar B** | Auto-pulls financials, open ARCs, open violations, vendor invoices, reserve status → produces board-ready PDF + executive summary 48 hours before meeting. |
| 8 | **AI Meeting Co-Pilot** | `main` | **Bar B** | Records/transcribes meeting → draft minutes → extracts motions/votes/action items → auto-creates tasks with owners + due dates. Quorum tracker. |
| 9 | **AI Reserve Study Analyst** | `reason` → `main` | **Bar B** | Ingest component list + age + replacement costs → 30-year reserve forecast → flags underfunding → suggests funding plan. (Replaces $2K–$10K consultant engagement.) |
| 10 | **AI Vendor Bid Comparator** | `reason` → `main` | **Bar B** | Upload 3 bids → AI normalizes scope, flags hidden exclusions, drafts board recommendation memo. |
| 11 | **AI Compliance Calendar** | `reason` | **Bar C** | Knows state HOA statute deadlines (GA/FL/CA/TX: annual report, audit, election notice, reserve study) → schedules tasks 60/30/7 days out automatically. |
| 12 | **AI Resident Onboarding & Resale Disclosure** | `main` | **Bar C** | New owner detected → welcome packet generated, account provisioned, autopay invitation, resale disclosure pack assembled. |
| 13 | **AI Work Order Triage & Vendor Dispatch** | `reason` → `main` | **Bar B** | Resident reports issue → classifies (emergency/routine/cosmetic), checks if HOA vs. homeowner responsibility per CC&Rs, dispatches correct vendor with templated SOW. |

### Eviction Hub Workflows

| # | Name | Agent Used | Bar Gate | What it does |
|---|------|-----------|---------|--------------|
| 14 | **AI Delinquency-to-Lien Pipeline** | `reason` → `main` | **Bar B** | Tracks 30/60/90/120-day delinquency triggers per state law → drafts demand letters → assembles lien filing packet → tracks lien status. Attorney approves before filing. |
| 15 | **AI Tenant Eviction Workflow** | `reason` → `main` | **Bar B** | State-specific notice generator (3-day, 7-day, 30-day, pay-or-quit) → court filing prep → hearing prep packet. Tracks every state's redemption rules. |
| 16 | **AI Document Intelligence** | `reason` | **Bar B** | Reads lease + payment history + communication log → produces "case strength" assessment and case timeline for the board or landlord. |
| 17 | **AI Settlement Negotiator** | `main` | **Bar B** | Drafts payment-plan settlements based on debtor history. Tracks promise-to-pay. Auto-escalates if missed. |

**Bar Gate definitions:**
- **Bar A:** Demo only. Never ships to production.
- **Bar B:** AI output displayed in an editable textarea inside the `BarBGate` component. User must scroll to the bottom and click Approve before any action is taken. **The approve button is disabled until the user has scrolled through the entire content.**
- **Bar C:** Fully automated. No human gate. Used only for non-reversible-consequence actions (scheduling tasks, sending welcome emails, flagging calendar items).

---

## AI Architecture (Multi-Agent)

Six model variants are available via `packages/ai`. **Always pick the right model for the task — do not default to `main` for everything.**

```
packages/ai/src/agents/
├── fast.ts     → Qwen 2.5 3B    — classification, intent routing, 256-token outputs
├── reason.ts   → Qwen 2.5 14B (JSON mode, temp=0) — CC&R matching, compliance checks, structured data extraction
├── main.ts     → Qwen 2.5 14B (temp=0.3) — letter drafting, notices, meeting summaries, board packets
├── vision.ts   → Qwen 2.5-VL 7B — violation photo analysis (only model that sees images)
├── cloud.ts    → Claude Haiku 4.5 (Anthropic API) — daily digest, short summaries, high-volume cheap tasks
└── cpu.ts      → Qwen 2.5 7B via Ollama — always-warm CPU fallback, used when GPU is down
```

**Task-to-agent routing table (from PHASE1_AI_ROUTING.md):**
```typescript
classify_violation      → reason   (needs JSON precision)
draft_violation_letter  → main     (needs quality writing)
parse_document          → reason   (structured extraction from long PDF)
meeting_summary         → main     (long context, coherent writing)
daily_digest            → cloud    (short, high-volume, Claude Haiku is perfect)
compliance_check        → reason   (must be accurate, JSON output)
draft_eviction_notice   → main     (legal writing, formal, long output)
photo_analysis          → vision   (requires multimodal model)
classify_intent         → fast     (simple classification, speed matters)
```

**Self-hosted LLM is a core business advantage — not a technical constraint.** The positioning story: "Your governing documents and resident data never leave our servers, never train any vendor's model." This is a real moat against Vantaca (which uses unspecified third-party AI). Every AI answer includes an audit log entry with the CC&R section cited, the agent used, and the confidence level. This is our legal-defensibility story for boards.

**Fallback chain:** RunPod A10G (primary) → Lambda Labs (warm failover) → Modal serverless → llama.cpp CPU (always warm). Every AI call wraps in `withFallback()` from `packages/ai/src/resilience.ts`. On total AI failure, show: *"AI unavailable — write this manually"* with a plain textarea. Never throw an unhandled exception to the user.

---

## Database Schema Rules

**13 tables, all in the `public` schema.** See `schema.sql` for full DDL.

```
orgs                  ← Each HOA, PM landlord, or eviction client is an org
profiles              ← One profile per auth.users entry (auto-created by trigger)
org_members           ← Many-to-many: one user can be in multiple orgs with different roles
hoa_properties        ← Physical units within an HOA org
hoa_documents         ← CC&Rs, bylaws, rules (stored in Supabase Storage)
hoa_violations        ← Violation records with AI draft + approved letter fields
hoa_meeting_minutes   ← Transcripts, AI summaries, action items, motions
hoa_dues              ← Monthly dues ledger per property
hoa_digests           ← Cached daily AI digest per org (refreshed at 7am by Inngest)
eviction_cases        ← Full eviction workflow state machine per case
pm_properties         ← Rental properties for PM Hub
pm_rent_ledger        ← Monthly rent tracking per property
audit_log             ← Every action, every AI output, every approval — permanent
```

**RLS is on every table.** The helper function `auth_org_ids()` returns all org IDs the current user belongs to. Every table policy uses `org_id = ANY(auth_org_ids())`. Never disable or work around RLS. If you need to query across tenants (e.g., Inngest jobs), use `createAdminClient()` from `packages/db` — which uses the service role key.

**Schema changes:** Write migration SQL, run it in Supabase SQL Editor, then regenerate TypeScript types with the command in the Infrastructure section above.

**Multi-tenancy model:**
- `orgs.hub_type` distinguishes HOA / PM / eviction orgs
- A single user (e.g., a property manager who also manages evictions) can be a member of multiple orgs with different roles
- CAM companies (management companies) are parent orgs — Phase 2, not Phase 1
- `audit_log` captures every material action for every tenant

---

## UI Design System

**All shared components live in `packages/ui`. Never duplicate a component in an app — extend it from the package instead.**

### Technology
- **Radix UI primitives** for all interactive elements (Dialog, Select, Tabs, Popover, Tooltip, Toast)
- **class-variance-authority (CVA)** for component variants
- **Tailwind CSS** with CSS variable tokens (each hub overrides root variables)
- **Framer Motion** for page transitions and micro-animations
- **TanStack Table v8** for all data tables
- **cmdk** for the command palette (⌘K)
- **react-hook-form + zod** for all forms

### Hub color tokens
```
HOA Hub      → primary: #00C9A7 (teal)   · accent: #F59E0B · font-size-base: 18px (accessibility)
PM Hub       → primary: #3B82F6 (blue)   · accent: #10B981
Eviction Hub → primary: #8B5CF6 (purple) · accent: #F59E0B · AAA 7:1 contrast required throughout
```

### Accessibility rules
- HOA Hub: **18px minimum body font** (designed for Linda, age 58 — our target board member)
- HOA Hub and Eviction Hub: **AAA 7:1 contrast ratio** throughout
- All interactive elements must be keyboard accessible (Radix handles this automatically)
- All images must have descriptive `alt` text
- No color-only information (always pair color with an icon or label)

### Animation principles
- Entry: `animate-fade-in` on page load, `animate-slide-up` on cards
- Hover: 150ms transitions, button hover = `scale(0.97)`, card hover = `translateY(-2px)`
- Loading: Skeleton shimmer → content fade-in. Never block the user with a spinner for more than 300ms
- AI streaming: typewriter at 20ms/char for short text, instant render for long text
- Page transitions: Framer Motion `AnimatePresence` with `slideUp` variant

### Critical UI components (build these first, in order)

1. **`BarBGate`** — The most important component in the entire codebase.
   - Shows amber warning banner: "⚠️ Human Review Required — This content was drafted by AI"
   - Editable textarea (board must be able to revise the AI output)
   - Approve button is **disabled until the user scrolls to the bottom**
   - Two actions: "Request Changes" (resets) | "✓ Approve & Send"
   - Used for: violation letters, eviction notices, meeting minutes, board packets, lien filings
   - Never skip this gate for any Bar B workflow. No exceptions.

2. **`ComplianceBlock`** — The most important component in the Eviction Hub.
   - Red left border, `ShieldAlert` icon, cannot be dismissed or bypassed
   - Shows the legal citation verbatim (e.g., "Texas Property Code §24.005")
   - Shows filing-eligible date and countdown ("X days until you can file")
   - No skip button. No dismiss button. No override.

3. **`AIResponseCard`** — Wraps all AI-generated text output.
   - "AI Generated" badge + confidence indicator
   - Streaming typewriter animation
   - Copy to clipboard button
   - Links to audit log entry

4. **`StepWizard`** — Multi-step form container used in violation creation, eviction intake, and document upload.

5. **`DailyDigestCard`** — Home page card showing AI-generated morning briefing.
   - Fetches from `hoa_digests` table (pre-generated at 7am by Inngest)
   - "Refresh" button triggers on-demand regeneration
   - Powered by Claude Haiku — cost ~$0.0001 per digest

6. **`ComplianceCalendar`** — Heat map calendar: red/yellow/green per day based on overdue items.
   - Red: cure period expired or dues overdue
   - Yellow: deadline within 3 days
   - Green: no issues
   - Grey: no events
   - Click any day → popover with that day's items

---

## Application Architecture Patterns

### Authentication
- Supabase Auth with **magic link only** (no passwords in Phase 1)
- Middleware in every app enforces auth on all routes except `/login`, `/signup`, `/verify`
- On first login → wizard to create or join an org
- Org creation sets `hub_type` based on which app the user is in

### Server Components vs. Client Components
- **Default to Server Components.** Fetch data from Supabase in async server components using `createServerClient()`.
- Use Client Components only when you need: `useState`, `useEffect`, event handlers, browser APIs, or animation.
- Mark client components with `'use client'` directive.

### Data fetching pattern
```typescript
// ✅ Server Component (preferred for data)
import { createServerClient } from '@/lib/supabase/server'

export default async function ViolationsPage() {
  const supabase = await createServerClient()
  const { data: violations } = await supabase
    .from('hoa_violations')
    .select('*, hoa_properties(address, owner_name)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  return <ViolationList violations={violations} />
}
```

### AI route pattern
```typescript
// app/api/ai/[workflow]/route.ts
// Always: validate input → check org membership → call AI → log to audit_log → return result
export async function POST(req: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  // Validate org membership (never trust org_id from request body)
  const body = await req.json()
  const { data: member } = await supabase
    .from('org_members')
    .select()
    .eq('org_id', body.org_id)
    .eq('user_id', user.id)
    .single()
  if (!member) return new Response('Forbidden', { status: 403 })

  // Call AI
  const result = await runWorkflow(body)

  // Log to audit_log
  await supabase.from('audit_log').insert({
    org_id: body.org_id,
    user_id: user.id,
    action: 'ai.violation.analyze',
    entity_type: 'violation',
    entity_id: body.violation_id,
    metadata: { agent: 'reason', workflow: 'covenant_brain', confidence: result.confidence },
  })

  return Response.json(result)
}
```

### Form pattern
```typescript
// Always: react-hook-form + zod schema + FormField components from packages/ui
const schema = z.object({
  description: z.string().min(10, 'Describe the violation in at least 10 characters'),
  property_id: z.string().uuid(),
})

export function ViolationForm() {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
  })
  // ...
}
```

### Error handling
```typescript
// Wrap every AI call
try {
  const result = await runAIWorkflow(params)
  return result
} catch (error) {
  console.error('[AI] Workflow failed:', error)
  // Never throw to the UI — always degrade gracefully
  return {
    success: false,
    fallback: true,
    message: 'AI unavailable — you can write this manually.',
  }
}
```

---

## Competitive Context (Know This — It Informs Every Product Decision)

### Why we win against Vantaca
| Vantaca | HomeownerHub |
|---------|-------------|
| $20K–$250K+/year, custom enterprise only | $39–$499/mo transparent flat-rate |
| 8-week guided implementation | 10-minute self-serve onboarding |
| No self-managed product | Built for the 110K+ self-managed segment |
| Third-party AI (no data privacy story) | Self-hosted LLM — data never leaves our servers |
| Opaque — no public roadmap | Public roadmap, weekly transparency report |
| Click-heavy UI (G2 verified) | Modern, accessible, mobile-first |

### Why we win against Buildium / AppFolio (PM segment)
| Them | PM Hub |
|------|--------|
| $250–$800/mo, no AI | $0–$29/mo + transaction fee |
| No eviction integration | Native one-click handoff to Eviction Hub |
| No cross-product moat | Data gravity across all three hubs |

### Why we win on Eviction
- $1,500–$5,000/case attorney fees → our price: $249/case or $99/mo unlimited
- **The compliance-first moat:** Our AI refuses to generate a defective notice. This is the product insight. It's not a limitation — it's the primary reason attorneys will recommend us.
- 3-county launch: Harris County TX (76,321 filings/yr), San Bernardino CA (highest per-capita), King County WA (66% above pre-pandemic)

### The self-hosted LLM positioning (use this language)
> "Your governing documents and resident data never leave our servers and never train any external AI model. Every AI decision is logged with the exact CC&R section cited, the model used, and the confidence level. Your board has full audit trail of every AI action."

This wins against any cloud-AI competitor and is a real legal-defensibility story for boards worried about duty of care.

---

## Pricing (hard-coded business rules — never change without Asaf's approval)

### HOA Hub
```
Starter:   $39/mo  ≤50 doors   (Madison Park's tier)
Standard:  $79/mo  51–300 doors
Pro:       $149/mo 301–600 doors
Enterprise: Custom  600+ doors
Per-door equivalent: $0.40–$0.80/door/mo
```

### PM Hub
```
Free:      $0/mo  1 unit (forever free, no credit card)
Investor:  $15/mo 2–15 units
Pro:       $29/mo 16–50 units
Transaction fee: 1.5–2.5% on rent collected via our platform
```

### Eviction Hub
```
Per case:  $249   one-time payment
Unlimited: $99/mo unlimited cases (for property managers)
```

---

## Business Rules (enforce in code)

1. **BarBGate for all Bar B workflows** — No exceptions. The approve button requires scroll-to-bottom. See the component spec in `packages/ui/src/components/ai/BarBGate.tsx`.

2. **Compliance block is non-bypassable** — In Eviction Hub, `ComplianceBlock` must always render when filing is not yet eligible. There is no prop to hide or skip it.

3. **Free tier limit: 1 unit for PM Hub** — On the `/setup` page, if `pm_properties.count > 0` for the org and plan is `free`, block the Add Property form and show upgrade prompt.

4. **HOA Starter enforced at 50 doors** — The `orgs.doors_count` field is updated on property add. If `doors_count > 50` and `plan = 'starter'`, trigger an upgrade prompt before allowing the add.

5. **Audit log is permanent** — Never write code that deletes from `audit_log`. Inserts only.

6. **Cross-hub handoff via URL params** — PM Hub "Start Eviction" passes `address`, `rent`, `tenant`, `days_unpaid`, `from=pm-hub` as query params to `evict.homeownerhub.com/cases/new`. The intake wizard reads these and pre-fills Step 1. Log the referral source in `eviction_cases.compliance_flags`.

7. **Madison Park is the acceptance test** — Every Phase 1 feature must work correctly with Madison Park's real data before it's considered done. The org ID for Madison Park will be set in the environment once they're onboarded. Tests that use a fake HOA are valid for unit tests; the Madison Park org is required for integration tests.

---

## File Naming and Code Style

- **Files:** `kebab-case.tsx` for components, `camelCase.ts` for utilities
- **Components:** `PascalCase` named exports
- **Types:** `PascalCase` for interfaces and types
- **Database queries:** Always destructure `{ data, error }` from Supabase and handle the error case
- **No `any` types** — generate and use Supabase types from `packages/db/src/database.types.ts`
- **No inline styles** — use Tailwind classes only; add tokens to `tailwind.config.ts` if needed
- **No default exports from components** (exception: Next.js page files which require it)
- **Prefer `const` over `let`** everywhere possible
- **All async functions must have proper error boundaries** — no unhandled promise rejections

---

## Running the Project

```bash
# Install dependencies (from repo root)
pnpm install

# Run all three apps simultaneously
pnpm dev

# Run individual apps
pnpm dev:hoa        # http://localhost:3000
pnpm dev:eviction   # http://localhost:3001
pnpm dev:pm         # http://localhost:3002

# Build all
pnpm build

# Type check all
pnpm typecheck

# Generate Supabase types (after schema changes)
npx supabase gen types typescript \
  --project-id xwdjsxfskvreguyvryhc \
  --schema public \
  > packages/db/src/database.types.ts
```

---

## What NOT to Build (Phase 1 hard stops)

- ❌ No CAM (management company) multi-tenant dashboard — Phase 2
- ❌ No online voting — Phase 2
- ❌ No mobile app — Progressive Web App only for Phase 1
- ❌ No white-label portal — Phase 2
- ❌ No San Bernardino CA or King County WA eviction rules — Harris County TX only for Phase 1
- ❌ No email marketing integration — Phase 2
- ❌ No Bar A features in production — demo only, never in the main codebase
- ❌ No feature flags system — if it's not built, hide the nav item

---

## Week-by-Week Build Order (Phase 1)

Follow this order exactly. Do not start Week 2 until Week 1 is complete.

**Week 1:** Monorepo scaffold → schema.sql in Supabase → generate types → `packages/ui` core components (Button, Card, Badge, Input, BarBGate) → `packages/ai` with all 6 agents → test AI round-trip (send prompt to RunPod, get response)

**Week 2:** `apps/hoa` auth + AppShell + Properties CRUD + Document upload + Violation wizard (Workflows 3 then 1) + Daily Digest page

**Week 3:** Dues ledger + Meeting minutes (Workflow 8) + Stripe HOA Starter checkout + Inngest late-fee job + `apps/eviction` full intake wizard (Workflows 15 then 14)

**Week 4:** Madison Park onboarding (49 properties, CC&Rs uploaded) + `apps/pm` 3 pages + cross-hub eviction handoff + deploy all three to Vercel

---

## The Non-Negotiables (memorize these)

1. **BarBGate on every Bar B output** — human reads it, edits it, approves it, before anything leaves the system
2. **RLS on every table** — anon key in the browser, service key only in background jobs
3. **AI errors never crash the UI** — always degrade to a manual text input fallback
4. **Compliance block cannot be bypassed** — no override, no dismiss, no skip
5. **Type safety end-to-end** — no `any`, use generated Supabase types everywhere
6. **Madison Park is the acceptance environment** — it works there or it doesn't ship
7. **Self-hosted LLM is the product story** — never route to cloud AI without the fallback chain being exhausted first (exception: Claude Haiku for daily digest via `cloud` agent, which is the intended design)

---

*Last updated: May 2026. For the full technical spec, see `PHASE1_IMPLEMENTATION.md`. For the AI agent architecture, see `PHASE1_AI_ROUTING.md`.*
