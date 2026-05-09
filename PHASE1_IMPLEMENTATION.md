# HomeownerHub — Phase 1 Implementation Plan
> Ready for Claude Code. Execute sections in order. All decisions are made.

**GitHub repo:** `https://github.com/asafhamo55-coder/HomeOwnerHub.git`  
**Supabase project:** `xwdjsxfskvreguyvryhc`  
**Supabase URL:** `https://xwdjsxfskvreguyvryhc.supabase.co`  
**Supabase anon key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3ZGpzeGZza3ZyZWd1eXZyeWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMTEwNjAsImV4cCI6MjA5MzY4NzA2MH0.4xSNopnsyFxN0OO7qq7LICin3QIH2VFxcqpSLgxTjps`  
**Phase 1 scope:** HOA Hub MVP + Eviction Hub (Harris County TX) + PM Hub alpha  
**Target:** Madison Park live in Week 4 · $2K MRR by Month 4

---

## Before You Start — One Thing to Do

### Run the Database Schema
1. Go to: https://supabase.com/dashboard/project/xwdjsxfskvreguyvryhc/sql
2. Open the file `schema.sql` from this folder
3. Paste the entire contents and click **Run**
4. Verify by checking the table list at the bottom of the output

---

## 1. Monorepo Scaffold

```bash
# Clone the existing repo first
git clone https://github.com/asafhamo55-coder/HomeOwnerHub.git homeownerhub
cd homeownerhub

# If starting fresh inside the existing repo:
echo "node_modules\n.next\n.env.local\n.turbo\ndist\n*.local" > .gitignore

pnpm init -y
pnpm add -D turbo typescript @types/node
```

**`package.json` (root):**
```json
{
  "name": "homeownerhub",
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "dev:hoa": "turbo run dev --filter=hoa",
    "dev:eviction": "turbo run dev --filter=eviction",
    "dev:pm": "turbo run dev --filter=pm"
  },
  "devDependencies": {
    "turbo": "latest",
    "typescript": "^5",
    "@types/node": "^22"
  }
}
```

**`pnpm-workspace.yaml`:**
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**`turbo.json`:**
```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": { "cache": false, "persistent": true },
    "lint": {},
    "typecheck": { "dependsOn": ["^build"] }
  }
}
```

**`tsconfig.base.json`:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "allowJs": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "incremental": true
  }
}
```

---

## 2. Shared Packages

### 2.1 `packages/db` — Database types + client

```bash
cd packages/db && pnpm init -y
pnpm add @supabase/supabase-js @supabase/ssr
pnpm add -D typescript
```

**`packages/db/src/client.ts`:**
```typescript
import { createBrowserClient as _createBrowserClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Browser client — RLS enforced via anon key
export function createBrowserClient() {
  return _createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY)
}

// Server client — use service role key for background jobs only
export function createAdminClient() {
  return createClient<Database>(
    SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

> **Generate TypeScript types:** After running the schema, run from the repo root:
> ```bash
> npx supabase gen types typescript \
>   --project-id xwdjsxfskvreguyvryhc \
>   --schema public \
>   > packages/db/src/database.types.ts
> ```

### 2.2 `packages/ai` — Multi-agent AI client

```bash
cd packages/ai && pnpm init -y
pnpm add openai @anthropic-ai/sdk
pnpm add -D typescript
```

See `PHASE1_AI_ROUTING.md` for the full multi-agent implementation. The agents map:

| Agent | Model | Used For |
|-------|-------|----------|
| `fast` | Qwen 2.5 3B | Classification, routing |
| `reason` | Qwen 2.5 14B (JSON mode, temp=0) | CC&R matching, compliance checks |
| `main` | Qwen 2.5 14B (temp=0.3) | Letter drafting, meeting summaries, notices |
| `vision` | Qwen 2.5-VL 7B | Violation photo analysis |
| `cloud` | Claude Haiku 4.5 | Daily digest, short summaries |
| `cpu` | Qwen 2.5 7B via Ollama | Always-warm GPU fallback |

### 2.3 `packages/ui` — Shared design system

```bash
cd packages/ui && pnpm init -y
pnpm add react react-dom
pnpm add class-variance-authority clsx tailwind-merge
pnpm add @radix-ui/react-dialog @radix-ui/react-dropdown-menu
pnpm add @radix-ui/react-select @radix-ui/react-toast @radix-ui/react-tabs
pnpm add @radix-ui/react-avatar @radix-ui/react-badge @radix-ui/react-separator
pnpm add @radix-ui/react-tooltip @radix-ui/react-popover @radix-ui/react-progress
pnpm add lucide-react
pnpm add framer-motion
pnpm add -D tailwindcss @tailwindcss/typography
```

See **Section 5** for the complete design system specification.

---

## 3. Environment Files

Copy these files (already created in your HomeownerHub folder) to the correct app directories:

```bash
# From the homeownerhub monorepo root:
cp /path/to/HomeownerHub/env.hoa.local       apps/hoa/.env.local
cp /path/to/HomeownerHub/env.eviction.local  apps/eviction/.env.local
cp /path/to/HomeownerHub/env.pm.local        apps/pm/.env.local
```

Fill in the `REPLACE_ME` values before running any app.

---

## 4. Database (Supabase)

**Project:** `xwdjsxfskvreguyvryhc`  
**Anon key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3ZGpzeGZza3ZyZWd1eXZyeWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMTEwNjAsImV4cCI6MjA5MzY4NzA2MH0.4xSNopnsyFxN0OO7qq7LICin3QIH2VFxcqpSLgxTjps`

Run `schema.sql` in the SQL editor. The schema creates:
- 13 tables (orgs, profiles, org_members, 5× HOA, eviction_cases, 2× PM, audit_log)
- RLS policies on every table (`auth_org_ids()` helper)
- Auto-profile creation trigger on user signup
- `updated_at` triggers on all mutable tables
- Indexes for all common query patterns

**Supabase Storage buckets to create (Dashboard → Storage → New bucket):**
- `hoa-documents` — private — CC&Rs, bylaws, rules
- `hoa-photos` — private — violation photos
- `eviction-docs` — private — generated notice PDFs

---

## 5. UI Design System (`packages/ui`)

This is the foundation of everything. Build this package first before touching any app.

### 5.1 Design tokens

**`packages/ui/src/tokens.ts`:**
```typescript
// Shared across all three hubs via CSS variables.
// Hub-specific overrides applied at the app root level.

export const tokens = {
  // HOA Hub — teal/warm, designed for Linda (age 58)
  hoa: {
    primary:   '#00C9A7',
    primaryFg: '#ffffff',
    accent:    '#F59E0B',
    bg:        '#F8FFFE',
    surface:   '#ffffff',
    border:    '#E5F7F4',
    text:      '#0F2027',
    muted:     '#64748B',
    // Accessibility: minimum 18px body font, AAA 7:1 contrast
    fontSizeBase: '18px',
  },
  // PM Hub — blue/efficient
  pm: {
    primary:   '#3B82F6',
    primaryFg: '#ffffff',
    accent:    '#10B981',
    bg:        '#F8FAFF',
    surface:   '#ffffff',
    border:    '#DBEAFE',
    text:      '#0F172A',
    muted:     '#64748B',
    fontSizeBase: '16px',
  },
  // Eviction Hub — purple/calm, high stakes = high contrast
  eviction: {
    primary:   '#8B5CF6',
    primaryFg: '#ffffff',
    accent:    '#F59E0B',
    bg:        '#FAFAFF',
    surface:   '#ffffff',
    border:    '#EDE9FE',
    text:      '#0F0A1E',
    muted:     '#64748B',
    fontSizeBase: '16px',
    // AAA 7:1 contrast throughout — critical for legal notices
  },
} as const
```

**`packages/ui/tailwind.config.ts`:**
```typescript
import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // CSS variable driven — each hub overrides these at root
        primary: 'hsl(var(--primary))',
        'primary-fg': 'hsl(var(--primary-fg))',
        accent: 'hsl(var(--accent))',
        background: 'hsl(var(--background))',
        surface: 'hsl(var(--surface))',
        border: 'hsl(var(--border))',
        muted: 'hsl(var(--muted))',
        'muted-fg': 'hsl(var(--muted-fg))',
        destructive: 'hsl(var(--destructive))',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        lg: 'calc(var(--radius) + 4px)',
        xl: 'calc(var(--radius) + 8px)',
        '2xl': 'calc(var(--radius) + 16px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      animation: {
        'fade-in':      'fadeIn 0.3s ease-out',
        'slide-up':     'slideUp 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'pulse-soft':   'pulseSoft 2s ease-in-out infinite',
        'shimmer':      'shimmer 1.5s linear infinite',
      },
      keyframes: {
        fadeIn:         { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp:        { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideInRight:   { from: { opacity: '0', transform: 'translateX(12px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        pulseSoft:      { '0%,100%': { opacity: '1' }, '50%': { opacity: '.6' } },
        shimmer:        { from: { backgroundPosition: '-200% 0' }, to: { backgroundPosition: '200% 0' } },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
} satisfies Config
```

### 5.2 Core component library

Build these components in `packages/ui/src/components/`. Use **Radix UI primitives** + **class-variance-authority (CVA)** for variants. Every component must:
- Accept a `className` prop for overrides
- Be fully keyboard accessible (Radix handles this)
- Support dark mode via CSS variables
- Have TypeScript props with JSDoc comments

**Components to build (in this order):**

#### Primitives
```
Button          — variants: default, outline, ghost, destructive, link
                  sizes: sm, md, lg, icon
                  states: loading (spinner), disabled

Input           — variants: default, error
                  adornments: prefix icon, suffix icon, clear button

Textarea        — auto-resize, character count

Select          — Radix SelectRoot, full keyboard nav

Checkbox        — Radix CheckboxRoot

Badge           — variants: default, success, warning, destructive, outline
                  sizes: sm, md

Avatar          — image + initials fallback, sizes: sm, md, lg

Separator       — horizontal/vertical
```

#### Layout
```
Card            — Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
                  variants: default, elevated, ghost

Sheet           — slide-in drawer (Radix DialogRoot), positions: left, right
                  Use for: mobile nav, detail panels

Dialog          — modal dialog (Radix), sizes: sm, md, lg, full

Tooltip         — Radix TooltipRoot, delay: 400ms

Popover         — Radix PopoverRoot

Tabs            — Radix TabsRoot, variants: default, pills, underline

Progress        — Radix ProgressRoot, with animated fill
```

#### Feedback
```
Toast           — Radix ToastRoot, variants: default, success, error, warning
                  Position: bottom-right, auto-dismiss 4s

Skeleton        — animated shimmer placeholder, shapes: text, avatar, card

EmptyState      — icon + title + description + optional CTA button

Alert           — variants: info, success, warning, error
                  IMPORTANT: BarBGate is a special Alert variant (see below)
```

#### Navigation
```
Sidebar         — collapsible, responsive
                  NavItem with icon + label + badge
                  NavGroup with collapsible sections

Breadcrumb      — BreadcrumbItem, separator

CommandPalette  — ⌘K search modal (cmdk library)
```

#### Data Display
```
Table           — sortable columns, row selection, pagination
                  DataTable built on TanStack Table v8

StatCard        — large number + label + trend indicator + sparkline
                  Used in: Daily Digest, financials dashboard

Timeline        — vertical event list with icons and timestamps

StatusBadge     — semantic colors mapped to status strings
                  Maps: 'open'→yellow, 'resolved'→green, 'sent'→blue, etc.
```

#### Forms
```
Form            — react-hook-form + zod integration
FormField
FormItem
FormLabel
FormControl
FormDescription
FormMessage

FileUpload      — drag-and-drop, progress bar, preview
                  Accepts: PDF, images, DOCX
                  Max size: 50MB
```

#### AI-specific
```
AIResponseCard  — Displays AI-generated text with:
                  - Animated streaming text (typewriter effect)
                  - "AI Generated" badge
                  - Copy to clipboard button
                  - Confidence indicator (if applicable)

BarBGate        — CRITICAL COMPONENT — used before any AI content is sent
                  Layout:
                  ┌─────────────────────────────────────────┐
                  │ ⚠️  Human Review Required               │
                  │ This content was drafted by AI. Read    │
                  │ carefully before approving.             │
                  ├─────────────────────────────────────────┤
                  │ [Editable content area]                 │
                  │                                         │
                  ├─────────────────────────────────────────┤
                  │ [Request Changes]  [✓ Approve & Send]  │
                  └─────────────────────────────────────────┘
                  Props: content, onApprove, onReject, isLoading
                  The content area MUST be editable (textarea)
                  Approve button is disabled until user scrolls to bottom

StepWizard      — Multi-step form container
                  Props: steps[], currentStep, onNext, onBack
                  Shows: step indicator bar, step title, navigation buttons
```

### 5.3 Shared layouts

**`packages/ui/src/layouts/AppShell.tsx`** — The outer shell used by all three hubs:
```tsx
// Structure:
// <AppShell>
//   <AppShell.Sidebar>  ← collapsible on mobile
//   <AppShell.Main>
//     <AppShell.Header>  ← breadcrumb + user avatar + hub switcher
//     <AppShell.Content> ← page content goes here
```

**Hub switcher** in the header: dropdown showing all three hubs with external links. Allows users to navigate between hoa.homeownerhub.com, pm.homeownerhub.com, evict.homeownerhub.com.

### 5.4 Animation principles

- **Entry animations:** `animate-fade-in` on page load, `animate-slide-up` on card appearance
- **Interactions:** 150ms transitions on hover/focus states
- **Loading states:** Skeleton shimmer → content fade-in (never spinner blocks for >300ms)
- **AI streaming:** Typewriter at 20ms/char for short text, instant for long
- **Page transitions:** `framer-motion` `AnimatePresence` with `slideUp` variant
- **Micro-interactions:** Button press scale(0.97), card hover translateY(-2px)

### 5.5 Typography scale

```css
/* Base sizes — HOA Hub uses larger scale for accessibility */
--font-size-xs:   0.75rem;   /* 12px */
--font-size-sm:   0.875rem;  /* 14px */
--font-size-base: 1rem;      /* 16px — HOA Hub overrides to 1.125rem (18px) */
--font-size-lg:   1.125rem;  /* 18px */
--font-size-xl:   1.25rem;   /* 20px */
--font-size-2xl:  1.5rem;    /* 24px */
--font-size-3xl:  1.875rem;  /* 30px */
--font-size-4xl:  2.25rem;   /* 36px */
```

Font: **Inter** (primary) + **JetBrains Mono** (code/notice content)  
Load via `next/font/google` in each app's root layout.

---

## 6. HOA Hub App (`apps/hoa`)

```bash
cd apps/hoa
npx create-next-app@latest . \
  --typescript --tailwind --app --src-dir \
  --import-alias "@/*" \
  --turbopack

pnpm add @supabase/ssr @supabase/supabase-js
pnpm add stripe @stripe/stripe-js
pnpm add inngest
pnpm add react-dropzone
pnpm add date-fns
pnpm add zod react-hook-form @hookform/resolvers
pnpm add @tanstack/react-table
pnpm add framer-motion
pnpm add cmdk
pnpm add react-hot-toast  # or use Radix Toast from packages/ui
```

### 6.1 App Router structure

```
apps/hoa/src/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx          ← Magic link + password login
│   │   ├── signup/
│   │   │   └── page.tsx          ← Create account → org setup wizard
│   │   ├── verify/
│   │   │   └── page.tsx          ← Magic link verification landing
│   │   └── layout.tsx            ← Centered card layout, HOA teal brand
│   │
│   ├── (dashboard)/
│   │   ├── layout.tsx            ← AppShell with HOA sidebar
│   │   ├── page.tsx              ← Daily Digest Dashboard
│   │   │
│   │   ├── violations/
│   │   │   ├── page.tsx          ← DataTable of all violations + filters
│   │   │   ├── new/
│   │   │   │   └── page.tsx      ← StepWizard: photo → analyze → draft → BarBGate
│   │   │   └── [id]/
│   │   │       └── page.tsx      ← Violation detail + timeline + letter history
│   │   │
│   │   ├── properties/
│   │   │   ├── page.tsx          ← Properties grid/list
│   │   │   ├── new/
│   │   │   │   └── page.tsx      ← Add property form
│   │   │   └── [id]/
│   │   │       └── page.tsx      ← Property detail: violations, dues history
│   │   │
│   │   ├── documents/
│   │   │   ├── page.tsx          ← Document library (CC&Rs, bylaws, rules)
│   │   │   └── upload/
│   │   │       └── page.tsx      ← Upload + AI parse + name document
│   │   │
│   │   ├── dues/
│   │   │   └── page.tsx          ← Dues ledger: grid by property + period
│   │   │
│   │   ├── meetings/
│   │   │   ├── page.tsx          ← Minutes list
│   │   │   └── new/
│   │   │       └── page.tsx      ← Paste transcript → AI summary → BarBGate approve
│   │   │
│   │   └── settings/
│   │       ├── page.tsx          ← Org name, logo, contact info
│   │       └── billing/
│   │           └── page.tsx      ← Stripe portal link + plan display
│   │
│   └── api/
│       ├── ai/
│       │   ├── analyze-violation/route.ts   ← vision + reason agents in sequence
│       │   ├── draft-letter/route.ts        ← main agent → violation letter
│       │   ├── parse-document/route.ts      ← reason agent → extract CCR text
│       │   ├── meeting-summary/route.ts     ← main agent → minutes + action items
│       │   └── daily-digest/route.ts        ← cloud agent (Claude Haiku) → digest
│       ├── webhooks/
│       │   └── stripe/route.ts
│       └── inngest/
│           └── route.ts
│
├── components/
│   ├── dashboard/
│   │   ├── DailyDigestCard.tsx      ← AI digest text with refresh button
│   │   ├── PendingApprovalsCard.tsx ← Count of Bar B items needing action
│   │   ├── ViolationSummaryCard.tsx ← Open/overdue count + sparkline
│   │   └── ComplianceCalendar.tsx   ← Heat map calendar: red/yellow/green by day
│   │
│   ├── violations/
│   │   ├── ViolationStepWizard.tsx  ← Full 4-step wizard component
│   │   ├── PhotoUpload.tsx          ← Dropzone + preview + AI analysis trigger
│   │   ├── CovenantBrainResult.tsx  ← Shows CC&R match with confidence badge
│   │   ├── LetterBarBGate.tsx       ← BarBGate configured for violation letters
│   │   ├── ViolationCard.tsx        ← Card view of a single violation
│   │   └── ViolationStatusBadge.tsx ← Color-coded status pill
│   │
│   ├── properties/
│   │   ├── PropertyCard.tsx
│   │   └── PropertyForm.tsx
│   │
│   └── meetings/
│       ├── TranscriptInput.tsx      ← Large textarea + paste helper
│       └── MeetingMinutesResult.tsx ← AI summary + action items + BarBGate
│
└── lib/
    ├── supabase/
    │   ├── server.ts          ← createServerClient() using @supabase/ssr
    │   ├── browser.ts         ← createBrowserClient()
    │   └── middleware.ts      ← Auth guard middleware
    ├── stripe.ts
    ├── inngest.ts
    └── ai/
        ├── analyze-violation.ts    ← Orchestrates vision + reason agents
        ├── draft-letter.ts
        ├── parse-document.ts
        ├── meeting-summary.ts
        └── daily-digest.ts
```

### 6.2 HOA Sidebar navigation

```
🏠  Dashboard          /
⚠️  Violations         /violations      [badge: open count]
🏘️  Properties         /properties
📄  Documents          /documents
💰  Dues               /dues            [badge: overdue count]
🗓️  Meetings           /meetings
──────────────────
⚙️  Settings           /settings
💳  Billing            /settings/billing
```

### 6.3 Daily Digest Dashboard — detailed spec

The home page (`app/(dashboard)/page.tsx`) layout:

```
┌─── Good morning, [Name] ─────────────────────────────────────────┐
│ [AI digest text — 3-4 sentences, refreshed at 7am]               │
│ Powered by Claude Haiku · Updated 7:02 AM                        │
└──────────────────────────────────────────────────────────────────┘

┌─── Action Required ─────┐  ┌─── Violations ──────────────────┐
│   3                     │  │  12 open  ·  4 overdue           │
│   items need approval   │  │  [Compliance Heat Map Calendar]  │
│   [Review Now →]        │  │                                  │
└─────────────────────────┘  └──────────────────────────────────┘

┌─── Dues Overview ───────────────────────────────┐
│  $2,350 overdue  ·  8 properties behind          │
│  [Progress bar: 41/49 paid this month]           │
└──────────────────────────────────────────────────┘
```

**Compliance Heat Map Calendar:**
- 3-month rolling calendar view
- Each day cell colored:
  - 🔴 Red: violation cure date passed / dues overdue
  - 🟡 Yellow: cure date within 3 days / upcoming deadline
  - 🟢 Green: no issues on that date
  - ⚪ Grey: no events
- Click a day → popover with that day's details

### 6.4 Violation wizard — detailed spec

**Step 1 — Report (photo + description):**
```
[FileUpload dropzone — drag photo here or click]
[Photo preview with remove button]
[Textarea: "Describe what you observed"]
[Property selector dropdown]
→ Next
```

**Step 2 — AI Analysis (auto-runs on enter):**
```
[Spinner: "Analyzing with Covenant Brain..."]
→ Reveals:
┌─ CC&R Match ─────────────────────────────────────────┐
│ Section 4.2(b) — Front Yard Equipment               │
│ Confidence: High ●●●○○                              │
│ Severity: Medium                                    │
│ "No recreational equipment may be installed..."     │
└──────────────────────────────────────────────────────┘
[Edit manually if needed]
→ Draft Letter
```

**Step 3 — BarBGate:**
```
[AIResponseCard showing draft letter]
[BarBGate component]
  ↳ Editable textarea with the letter
  ↳ "Approve & Mark as Notice Sent" button
  ↳ Scroll-to-bottom enforcement before approving
```

**Step 4 — Confirmation:**
```
✅ Violation recorded. Notice marked as sent.
[View violation →]   [Create another →]
```

---

## 7. Eviction Hub App (`apps/eviction`)

```bash
cd apps/eviction
npx create-next-app@latest . \
  --typescript --tailwind --app --src-dir \
  --import-alias "@/*" \
  --turbopack

pnpm add @supabase/ssr @supabase/supabase-js
pnpm add stripe
pnpm add date-fns zod react-hook-form @hookform/resolvers
pnpm add framer-motion
```

### 7.1 App structure

```
apps/eviction/src/
├── app/
│   ├── (auth)/                  ← same pattern as HOA Hub
│   ├── (dashboard)/
│   │   ├── layout.tsx           ← AppShell with purple brand
│   │   ├── page.tsx             ← Cases list with status board
│   │   ├── cases/
│   │   │   ├── new/
│   │   │   │   └── page.tsx     ← 4-step intake wizard
│   │   │   └── [id]/
│   │   │       └── page.tsx     ← Case detail + timeline + documents
│   │   └── settings/billing/
│   │       └── page.tsx
│   └── api/
│       ├── ai/
│       │   ├── compliance-check/route.ts
│       │   └── draft-notice/route.ts
│       └── webhooks/stripe/route.ts
│
├── components/
│   ├── cases/
│   │   ├── CaseIntakeWizard.tsx   ← 4-step wizard
│   │   ├── ComplianceCheckCard.tsx ← Shows BLOCK or OK with legal citation
│   │   ├── NoticeBarBGate.tsx      ← BarBGate for eviction notices
│   │   ├── CaseTimeline.tsx        ← Milestone timeline with dates
│   │   ├── CaseStatusBoard.tsx     ← Kanban-style columns by status
│   │   └── FilingReadyAlert.tsx    ← Prominent alert when filing_eligible_date arrives
│   └── ui/
└── lib/
    ├── supabase/...
    ├── stripe.ts
    ├── compliance/
    │   └── harris-tx.ts        ← Static rule engine (no AI)
    └── ai/
        ├── compliance-check.ts
        └── draft-notice.ts
```

### 7.2 Cases list — Kanban board layout

Display cases in columns by status (use horizontal scroll on mobile):

```
[Intake] → [Notice Drafted] → [Notice Sent] → [Filing Ready] → [Filed] → [Resolved]
   2              1                 3                1              0          5
```

Each card shows:
- Tenant name + address
- County badge (Harris County TX)
- Days since case opened
- 🔴 Alert if filing date passed (action required)
- Click → case detail

### 7.3 Case intake wizard — detailed spec

**Step 1 — Property & Tenant:**
```
Address: [text input]
County:  [select — only "Harris County, TX" in Phase 1]
Tenant name: [text input]
Monthly rent: $[number input]
Days since last payment: [number input]
Special circumstances: [textarea — optional, for AI edge-case check]
→ Check Compliance
```

**Step 2 — Compliance Check (auto-runs):**
```
🛑 CANNOT FILE YET
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Texas Property Code §24.005 requires a written
3-Day Notice to Pay or Quit before JP Court filing.

Required: Serve notice TODAY
Earliest filing date: June 5, 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[This block cannot be dismissed or bypassed]
→ Generate Notice (step 3)
```

**Step 3 — Notice Review (BarBGate):**
```
[AI-generated 3-Day Notice — full text]
[BarBGate component — same as HOA Hub]
[Service method selector: personal delivery / posting / certified mail]
→ Approve Notice
```

**Step 4 — Payment:**
```
Plan: Pay per case
Amount: $249
[Stripe Checkout element embedded]
OR
"You have an unlimited plan — no charge for this case"
→ Case created → confirmation screen
```

### 7.4 Compliance block UI

This is the most important UI component in the entire app. It must:
- Be impossible to miss (full-width, red left border, prominent icon)
- Show the legal citation verbatim
- Show the exact filing-eligible date
- Show a countdown: "X days until you can file"
- **Never have a bypass or dismiss button**

```tsx
// components/cases/ComplianceCheckCard.tsx
<div className="border-l-4 border-destructive bg-destructive/5 rounded-r-xl p-6">
  <div className="flex items-start gap-3">
    <ShieldAlert className="text-destructive mt-0.5 h-6 w-6 flex-shrink-0" />
    <div>
      <h3 className="font-bold text-destructive text-lg">Cannot File Yet</h3>
      <p className="text-sm text-muted-fg mt-1">{blockReason}</p>
      <div className="mt-3 p-3 bg-background rounded-lg border">
        <p className="text-xs font-mono text-muted-fg">Legal basis:</p>
        <p className="text-sm font-medium mt-1">{legalBasis}</p>
      </div>
      <div className="mt-4 flex items-center gap-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-primary">{daysUntilFiling}</p>
          <p className="text-xs text-muted-fg">days to wait</p>
        </div>
        <div>
          <p className="text-sm font-medium">Serve notice today</p>
          <p className="text-sm text-muted-fg">
            Earliest filing: {format(filingEligibleDate, 'MMMM d, yyyy')}
          </p>
        </div>
      </div>
    </div>
  </div>
</div>
```

---

## 8. PM Hub App (`apps/pm`) — Phase 1 Alpha

Minimal — 3 pages only. Focus on capturing landlords early.

```bash
cd apps/pm
npx create-next-app@latest . \
  --typescript --tailwind --app --src-dir \
  --import-alias "@/*" \
  --turbopack

pnpm add @supabase/ssr @supabase/supabase-js
pnpm add stripe date-fns zod react-hook-form @hookform/resolvers framer-motion
```

### 8.1 Three pages to build

**Page 1 — Dashboard** (`app/(dashboard)/page.tsx`):
- Welcome message with property name
- Rent status for current month (paid/unpaid/overdue)
- Days since rent was due
- Late fee calculated and shown
- **"Start Eviction" button** — most prominent action when rent is late

**Page 2 — Property Setup** (`app/(dashboard)/setup/page.tsx`):
- Add one property (free tier limit enforced: 1 unit max)
- Fields: address, tenant name/email/phone, rent amount, lease dates
- Shows upgrade prompt if user tries to add a second property

**Page 3 — Rent Tracker** (`app/(dashboard)/dues/page.tsx`):
- Month-by-month grid showing paid/unpaid status
- One-click "Mark as Paid" per month
- Auto-calculated late fee shown in red when overdue
- Payment history download (CSV)

### 8.2 Cross-hub handoff — the key PM Hub feature

```typescript
// On PM Hub: "Start Eviction" button click handler
function handleStartEviction(property: PMProperty, ledger: RentLedger) {
  const params = new URLSearchParams({
    address:      property.address,
    rent:         property.monthly_rent.toString(),
    tenant:       property.tenant_name ?? '',
    days_unpaid:  ledger.days_overdue.toString(),
    from:         'pm-hub',  // tracks cross-hub referrals
  })
  window.open(
    `${process.env.NEXT_PUBLIC_EVICTION_URL}/cases/new?${params}`,
    '_blank'
  )
}
```

On Eviction Hub, the intake wizard reads these URL params and pre-fills Step 1.

---

## 9. Authentication

Use Supabase Auth with magic links (no passwords in Phase 1 — simplest onboarding).

**`apps/hoa/src/middleware.ts`** (copy to all three apps, same code):
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') ||
                      request.nextUrl.pathname.startsWith('/signup') ||
                      request.nextUrl.pathname.startsWith('/verify')

  if (!user && !isAuthRoute) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/webhooks).*)'],
}
```

**Login page pattern:**
```tsx
// Magic link — no password, maximum simplicity
async function handleLogin(email: string) {
  const supabase = createBrowserClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/verify`,
    },
  })
  // Show "Check your email" state
}
```

---

## 10. Stripe Setup

### Products to create in Stripe Dashboard

Go to: https://dashboard.stripe.com/test/products

Create these products and copy the price IDs into your `.env.local` files:

| Product name | Price | Billing | Env var |
|---|---|---|---|
| HOA Hub Starter | $39.00 | Monthly | `STRIPE_PRICE_STARTER` |
| HOA Hub Standard | $79.00 | Monthly | `STRIPE_PRICE_STANDARD` |
| HOA Hub Pro | $149.00 | Monthly | `STRIPE_PRICE_PRO` |
| Eviction Hub - Per Case | $249.00 | One-time | `STRIPE_PRICE_PER_CASE` |
| Eviction Hub - Unlimited | $99.00 | Monthly | `STRIPE_PRICE_UNLIMITED` |
| PM Hub - Investor | $15.00 | Monthly | `STRIPE_PRICE_PM_INVESTOR` |
| PM Hub - Pro | $29.00 | Monthly | `STRIPE_PRICE_PM_PRO` |

For each product, add metadata: `hub_type: hoa` / `eviction` / `pm`

### Checkout session creation

```typescript
// lib/stripe.ts (same pattern in all three apps)
import Stripe from 'stripe'
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function createCheckoutSession(params: {
  orgId: string
  priceId: string
  plan: string
  successUrl: string
  cancelUrl: string
}) {
  return stripe.checkout.sessions.create({
    mode: params.priceId.includes('one_time') ? 'payment' : 'subscription',
    line_items: [{ price: params.priceId, quantity: 1 }],
    metadata: { org_id: params.orgId, plan: params.plan },
    success_url: params.successUrl + '?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: params.cancelUrl,
  })
}
```

### Stripe webhook (copy to all three apps)

```typescript
// app/api/webhooks/stripe/route.ts
import { stripe } from '@/lib/stripe'
import { createAdminClient } from '@homeownerhub/db'

export async function POST(req: Request) {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature')!

  let event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return new Response('Invalid signature', { status: 400 })
  }

  const db = createAdminClient()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      if (session.metadata?.org_id) {
        await db.from('orgs').update({
          plan: session.metadata.plan,
          stripe_customer_id: session.customer as string,
          stripe_sub_id: session.subscription as string,
        }).eq('id', session.metadata.org_id)
      }
      break
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object
      await db.from('orgs').update({ plan: 'free' })
        .eq('stripe_customer_id', sub.customer as string)
      break
    }
  }

  return new Response('ok')
}
```

---

## 11. Inngest Background Jobs

```typescript
// lib/inngest.ts (same in all apps)
import { Inngest } from 'inngest'
export const inngest = new Inngest({ id: 'homeownerhub' })

// app/api/inngest/route.ts
import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest'
import { dailyDigestJob, lateFeeJob, evictionReminderJob } from '@/lib/jobs'

export const { GET, POST, PUT } = serve({ client: inngest, functions: [
  dailyDigestJob,
  lateFeeJob,
  evictionReminderJob,
]})
```

**Three jobs to implement (HOA Hub):**

```typescript
// lib/jobs.ts

// Job 1: Regenerate daily digest at 7am for all active orgs
export const dailyDigestJob = inngest.createFunction(
  { id: 'daily-digest', name: 'Generate Daily Digest' },
  { cron: 'TZ=America/New_York 0 7 * * *' },
  async ({ step }) => {
    const db = createAdminClient()
    const { data: orgs } = await db.from('orgs')
      .select('id, name').eq('hub_type', 'hoa').neq('plan', 'free')

    for (const org of orgs ?? []) {
      await step.run(`digest-${org.id}`, async () => {
        // Fetch counts, call Claude Haiku, upsert into hoa_digests
      })
    }
  }
)

// Job 2: Calculate late fees daily at midnight
export const lateFeeJob = inngest.createFunction(
  { id: 'late-fees', name: 'Calculate Late Fees' },
  { cron: 'TZ=America/New_York 0 0 * * *' },
  async ({ step }) => {
    // Find dues where status=pending and due_date < today
    // Apply 5% late fee, update status to 'late'
  }
)

// Job 3: Eviction filing reminders at 8am
export const evictionReminderJob = inngest.createFunction(
  { id: 'eviction-reminders' },
  { cron: 'TZ=America/New_York 0 8 * * *' },
  async ({ step }) => {
    // Find eviction_cases where filing_eligible_date = today
    // Send email via Supabase Auth emails or Resend
  }
)
```

---

## 12. Deployment (Vercel)

### Setup

```bash
npm i -g vercel
vercel login
```

Create three Vercel projects, one per app. In each project settings, set:
- **Root Directory:** `apps/hoa` (or `apps/eviction`, `apps/pm`)
- **Framework:** Next.js
- **Build command:** `cd ../.. && pnpm build --filter=hoa` (adjust per app)

### Custom domains

| App | Domain |
|-----|--------|
| HOA Hub | `hoa.homeownerhub.com` |
| Eviction Hub | `evict.homeownerhub.com` |
| PM Hub | `pm.homeownerhub.com` |

Point DNS CNAME to `cname.vercel-dns.com` for each.

### Stripe webhook endpoint

After deploying, register webhook in Stripe Dashboard:
- URL: `https://hoa.homeownerhub.com/api/webhooks/stripe`
- Events: `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`

---

## 13. Build Order (Week by Week)

### Week 1 — Foundation (do these first, in order)
- [ ] Scaffold monorepo (Section 1)
- [ ] Run `schema.sql` in Supabase SQL Editor — verify all 13 tables created
- [ ] Generate TypeScript types from Supabase schema → `packages/db/src/database.types.ts`
- [ ] Build `packages/ui` core components: Button, Card, Badge, Input, Textarea, Toast, Skeleton
- [ ] Build `packages/ui` BarBGate component (critical — used everywhere)
- [ ] Build `packages/ai` with all 6 agents wired up
- [ ] Test AI round-trip: send prompt to RunPod vLLM, get response back

### Week 2 — HOA Hub core
- [ ] Create `apps/hoa` with auth working (magic link login → org creation)
- [ ] AppShell + HOA Sidebar navigation
- [ ] Properties CRUD (list, add, detail)
- [ ] Documents upload → Supabase Storage → AI parse
- [ ] Violation wizard: photo → Covenant Brain → letter draft → BarBGate
- [ ] Daily Digest dashboard (hardcoded counts first, AI digest second)

### Week 3 — HOA Hub complete + Eviction Hub
- [ ] Dues ledger (HOA Hub)
- [ ] Meeting minutes: paste transcript → AI summary → BarBGate
- [ ] Compliance Heat Map Calendar (HOA Hub)
- [ ] Stripe billing: HOA Starter checkout ($39/mo)
- [ ] Inngest: late fee job + daily digest job
- [ ] `apps/eviction` case intake wizard (Harris County TX)
- [ ] Compliance block UI (non-bypassable)
- [ ] Stripe: per-case checkout ($249)

### Week 4 — Madison Park + PM alpha
- [ ] Onboard Madison Park: create org, add 49 properties, upload CC&Rs
- [ ] Fix all bugs found during real Madison Park onboarding
- [ ] `apps/pm` three pages: dashboard, property setup, rent tracker
- [ ] Cross-hub "Start Eviction" button with URL param handoff
- [ ] Deploy all three apps to Vercel
- [ ] Run through Madison Park demo checklist (Section 14)

### Month 2–4
- [ ] San Bernardino CA compliance rules (Eviction Hub)
- [ ] King County WA compliance rules (Eviction Hub)
- [ ] Meeting Co-Pilot live mode (transcript in real-time via microphone → streaming AI)
- [ ] CommandPalette (⌘K) for power users
- [ ] Mobile responsive polish across all three apps
- [ ] Attio CRM integration via Zapier

---

## 14. Madison Park Demo Checklist

Run through every item before the first board meeting demo:

```
Onboarding
[ ] Magic link login sends email in under 30 seconds
[ ] Create "Madison Park HOA" org → hub_type=hoa, plan=starter
[ ] 49 properties added (can be CSV import or manual batch)
[ ] CC&R PDF uploaded and parsed (AI extracts section list)

Core workflows
[ ] Create a test violation → see photo analyzed → CC&R section found → letter drafted
[ ] BarBGate appears and cannot be bypassed — letter requires approval
[ ] Approve letter → violation status updates to 'notice_sent'
[ ] Daily Digest shows correct open violation count and overdue dues

Dashboard
[ ] Compliance Heat Map shows correct colors for any pre-entered dates
[ ] Pending approvals count matches actual Bar B items

Billing
[ ] Stripe Starter checkout completes ($39/mo)
[ ] Org plan updates to 'starter' in database within 5 seconds of payment

Performance
[ ] Login → Dashboard loads in under 2 seconds
[ ] AI analysis (Covenant Brain) returns in under 10 seconds
[ ] No console errors on any page
```

---

## 15. Quality Rules (enforced, non-negotiable)

1. **BarBGate is mandatory** — Zero AI-generated letters, notices, or meeting minutes are sent without going through the `BarBGate` component. The approve button must not appear until the user scrolls to the bottom of the content.

2. **RLS always on** — Every Supabase query from a Next.js Server Component or route handler that returns user-visible data must use the anon client (RLS enforced). The admin client (service role) is only used in Inngest background jobs.

3. **AI errors degrade gracefully** — Every AI call is wrapped in try/catch. On failure, show a message: "AI unavailable — write this manually" with a plain textarea fallback. Never throw an unhandled rejection to the user.

4. **Compliance block cannot be bypassed** — The eviction notice wizard's compliance check result must always be displayed. There is no "skip" or "I understand" dismiss. The only path forward is to generate the notice and come back when the notice period has elapsed.

5. **Type safety end-to-end** — Generate Supabase TypeScript types and use them everywhere. No `any` types. No untyped `fetch` responses.

6. **Accessibility baseline** — All interactive elements must be keyboard accessible. All images must have alt text. Minimum contrast: AA (4.5:1). HOA Hub: minimum contrast AAA (7:1).

7. **No feature flags in Phase 1** — If it's not built, hide the nav item. Ship fewer, working features over many broken ones.

---

## 16. Files in This Folder

| File | Purpose |
|------|---------|
| `PHASE1_IMPLEMENTATION.md` | This file — full build plan |
| `PHASE1_AI_ROUTING.md` | Multi-agent AI architecture (extends Section 2.2) |
| `schema.sql` | Full database schema — run in Supabase SQL Editor |
| `env.hoa.local` | Copy to `apps/hoa/.env.local` |
| `env.eviction.local` | Copy to `apps/eviction/.env.local` |
| `env.pm.local` | Copy to `apps/pm/.env.local` |
| `board_presentation.html` | Board presentation (15 slides) |
| `HomeownerHub_Master_Plan.docx` | 9-agent synthesis document |
| `HomeownerHub_Strategy_v2.docx` | Strategy document |
| `PROJECT_FOUNDATION.md` | Original product foundation |

---

*Start with Section 1. Work through in order. Ask before deviating from any decision made in this plan.*
