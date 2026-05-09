# HomeownerHub — Multi-Agent AI Routing
> Append this to PHASE1_IMPLEMENTATION.md. Replace the simple `packages/ai/src/client.ts` with this design.

## Design Principle

Not every task needs a 14B parameter model. Routing each task to the right LLM keeps costs low, latency fast, and quality high. We run a **router agent** that classifies each incoming task and dispatches to the best-fit model.

---

## Model Roster (Phase 1)

| Agent ID | Model | Where | Cost | Best For |
|----------|-------|--------|------|----------|
| `fast` | Qwen 2.5 3B (4-bit) | RunPod A10G (same pod) | ~$0.01 | Classification, short extraction, routing decisions |
| `main` | Qwen 2.5 14B (4-bit) | RunPod A10G | ~$0.05 | Letter drafting, legal analysis, meeting summaries |
| `reason` | Qwen 2.5 14B (4-bit, high temp off) | RunPod A10G | ~$0.05 | Compliance checks, CC&R matching, structured JSON |
| `vision` | Qwen 2.5-VL 7B | RunPod A10G (second slot) | ~$0.03 | Violation photo analysis |
| `cpu` | Qwen 2.5 7B (llama.cpp, CPU) | Always-warm fallback VM | ~$0.00 | Fallback when GPU is down |
| `cloud` | Claude Haiku 3.5 (Anthropic API) | API | ~$0.001/1K tokens | High-volume simple tasks (digest, status summaries) |

**Why Qwen 2.5 family throughout:** single model family = shared tokenizer, single vLLM deployment can serve multiple sizes, consistent output format. Run 3B and 14B on the same A10G pod using vLLM's model-switching or run them as separate named endpoints.

---

## Updated `packages/ai` Structure

```
packages/ai/src/
├── router.ts          ← Classifies task → picks agent
├── agents/
│   ├── fast.ts        ← Qwen 2.5 3B client
│   ├── main.ts        ← Qwen 2.5 14B client
│   ├── reason.ts      ← Qwen 2.5 14B (low temp, JSON mode)
│   ├── vision.ts      ← Qwen 2.5-VL 7B client (multimodal)
│   ├── cpu.ts         ← llama.cpp CPU fallback
│   └── cloud.ts       ← Claude Haiku (Anthropic API)
├── tasks/
│   ├── covenant-brain.ts
│   ├── draft-letter.ts
│   ├── compliance-check.ts
│   ├── draft-notice.ts
│   ├── meeting-summary.ts
│   ├── daily-digest.ts
│   ├── photo-analysis.ts
│   └── classify-violation.ts
└── index.ts           ← Public API: import { ai } from '@homeownerhub/ai'
```

---

## Task → Agent Routing Map

```typescript
// packages/ai/src/router.ts

export type TaskType =
  | 'classify_violation'       // Is this a CC&R violation? Which section?
  | 'draft_violation_letter'   // Write formal HOA letter
  | 'parse_document'           // Extract text/structure from CC&R PDF
  | 'meeting_summary'          // Summarize meeting transcript
  | 'daily_digest'             // Short morning summary
  | 'compliance_check'         // Eviction compliance check (structured)
  | 'draft_eviction_notice'    // Write legal eviction notice
  | 'photo_analysis'           // Analyze violation photo
  | 'classify_intent'          // Route user free-text to the right workflow

export type AgentId = 'fast' | 'main' | 'reason' | 'vision' | 'cpu' | 'cloud'

// Static routing table — no LLM needed to decide
export const TASK_ROUTING: Record<TaskType, AgentId> = {
  classify_violation:      'reason',   // Needs precise JSON, low hallucination
  draft_violation_letter:  'main',     // Creative writing, formal tone
  parse_document:          'reason',   // Structured extraction from long PDF text
  meeting_summary:         'main',     // Long context, coherent writing
  daily_digest:            'cloud',    // Short, high volume, Claude Haiku is perfect
  compliance_check:        'reason',   // Must be accurate, structured JSON output
  draft_eviction_notice:   'main',     // Legal writing, formal, long output
  photo_analysis:          'vision',   // Requires multimodal model
  classify_intent:         'fast',     // Simple classification, speed matters
}
```

---

## Agent Client Implementations

### `packages/ai/src/agents/fast.ts` — Qwen 2.5 3B
```typescript
import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: process.env.AI_BASE_URL_FAST,   // Same RunPod pod, different model endpoint
  apiKey:  process.env.AI_API_KEY || 'local',
})

export const MODEL_FAST = 'Qwen/Qwen2.5-3B-Instruct'

export async function runFast(
  messages: OpenAI.ChatCompletionMessageParam[],
  opts?: { max_tokens?: number }
): Promise<string> {
  const res = await client.chat.completions.create({
    model: MODEL_FAST,
    messages,
    temperature: 0.1,                   // Fast agent: deterministic
    max_tokens: opts?.max_tokens ?? 256,
  })
  return res.choices[0]?.message?.content ?? ''
}
```

### `packages/ai/src/agents/main.ts` — Qwen 2.5 14B
```typescript
import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: process.env.AI_BASE_URL,
  apiKey:  process.env.AI_API_KEY || 'local',
})

export const MODEL_MAIN = 'Qwen/Qwen2.5-14B-Instruct'

export async function runMain(
  messages: OpenAI.ChatCompletionMessageParam[],
  opts?: { temperature?: number; max_tokens?: number }
): Promise<string> {
  const res = await client.chat.completions.create({
    model: MODEL_MAIN,
    messages,
    temperature: opts?.temperature ?? 0.3,
    max_tokens: opts?.max_tokens ?? 1500,
  })
  return res.choices[0]?.message?.content ?? ''
}
```

### `packages/ai/src/agents/reason.ts` — Qwen 2.5 14B (JSON mode)
```typescript
import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: process.env.AI_BASE_URL,
  apiKey:  process.env.AI_API_KEY || 'local',
})

export async function runReason<T>(
  messages: OpenAI.ChatCompletionMessageParam[],
  opts?: { max_tokens?: number }
): Promise<T> {
  const res = await client.chat.completions.create({
    model: 'Qwen/Qwen2.5-14B-Instruct',
    messages,
    temperature: 0.0,                   // Zero temp = most deterministic
    max_tokens: opts?.max_tokens ?? 512,
    response_format: { type: 'json_object' },  // Force valid JSON
  })
  const text = res.choices[0]?.message?.content ?? '{}'
  return JSON.parse(text) as T
}
```

### `packages/ai/src/agents/vision.ts` — Qwen 2.5-VL 7B (multimodal)
```typescript
import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: process.env.AI_BASE_URL_VISION,   // Separate vision model endpoint
  apiKey:  process.env.AI_API_KEY || 'local',
})

export async function analyzeImage(params: {
  imageUrl: string      // Supabase Storage URL
  question: string
}): Promise<string> {
  const res = await client.chat.completions.create({
    model: 'Qwen/Qwen2-VL-7B-Instruct',
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: params.imageUrl } },
        { type: 'text',      text: params.question },
      ],
    }],
    temperature: 0.1,
    max_tokens: 512,
  })
  return res.choices[0]?.message?.content ?? ''
}
```

### `packages/ai/src/agents/cloud.ts` — Claude Haiku (Anthropic)
```typescript
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function runCloud(
  systemPrompt: string,
  userMessage: string,
  opts?: { max_tokens?: number }
): Promise<string> {
  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',    // Cheapest, fastest Claude
    max_tokens: opts?.max_tokens ?? 512,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })
  return res.content[0].type === 'text' ? res.content[0].text : ''
}
```

### `packages/ai/src/agents/cpu.ts` — CPU Fallback
```typescript
import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: process.env.AI_FALLBACK_URL,   // llama.cpp or Ollama on CPU VM
  apiKey:  'local',
})

export async function runCPU(
  messages: OpenAI.ChatCompletionMessageParam[],
  opts?: { max_tokens?: number }
): Promise<string> {
  const res = await client.chat.completions.create({
    model: 'qwen2.5-7b',          // Smaller model for CPU speed
    messages,
    temperature: 0.2,
    max_tokens: opts?.max_tokens ?? 800,
  })
  return res.choices[0]?.message?.content ?? ''
}
```

---

## Updated Task Implementations

### Photo Analysis — now uses vision agent

**`packages/ai/src/tasks/photo-analysis.ts`:**
```typescript
import { analyzeImage } from '../agents/vision'

export async function analyzeViolationPhoto(params: {
  imageUrl: string
  propertyAddress: string
}): Promise<{
  violationDetected: boolean
  description: string
  possibleCCRViolations: string[]
}> {
  const question = `You are a HOA compliance inspector reviewing a photo of a property at ${params.propertyAddress}.

Describe what you see. Identify any potential CC&R violations such as:
- Prohibited items in front yard (vehicles, equipment, storage)
- Unapproved structures or modifications
- Landscaping violations
- Parking violations
- Trash/debris issues

Respond with JSON only:
{
  "violationDetected": true,
  "description": "What you see in plain language",
  "possibleCCRViolations": ["Specific possible violations as strings"]
}`

  const result = await analyzeImage({ imageUrl: params.imageUrl, question })
  return JSON.parse(result)
}
```

### Covenant Brain — now uses reason agent

**`packages/ai/src/tasks/covenant-brain.ts`:**
```typescript
import { runReason } from '../agents/reason'

export async function covenantBrainAnalyze(params: {
  violationDescription: string
  parsedCCRText: string
  propertyAddress: string
}): Promise<{
  ccrSection: string
  violationType: string
  severity: 'low' | 'medium' | 'high'
  confidence: 'high' | 'medium' | 'low'
}> {
  return runReason([{
    role: 'user',
    content: `You are a HOA compliance expert. Match this violation to the correct CC&R section.

CC&R Document (excerpt):
${params.parsedCCRText.slice(0, 8000)}

Property: ${params.propertyAddress}
Violation: ${params.violationDescription}

Respond with JSON only:
{
  "ccrSection": "Section X.X(x) — Title",
  "violationType": "short type name",
  "severity": "low|medium|high",
  "confidence": "high|medium|low"
}`,
  }])
}
```

### Daily Digest — now uses cloud agent (Claude Haiku)

**`packages/ai/src/tasks/daily-digest.ts`:**
```typescript
import { runCloud } from '../agents/cloud'

export async function generateDailyDigest(params: {
  hoaName: string
  openViolations: number
  overdueViolations: number
  overdueAmount: number
  pendingApprovals: number
  upcomingMeetings: string[]
}): Promise<string> {
  return runCloud(
    'You are the HOA Hub assistant. Write brief, actionable morning digests for HOA board members.',
    `HOA: ${params.hoaName}
Open violations: ${params.openViolations} (${params.overdueViolations} overdue)
Dues overdue: $${params.overdueAmount}
Items needing board approval: ${params.pendingApprovals}
Upcoming meetings: ${params.upcomingMeetings.join(', ') || 'none this week'}

Write a 2–4 sentence morning briefing. Lead with the most urgent item. Plain text only.`,
    { max_tokens: 200 }
  )
}
```

### Violation Letter Draft — uses main agent

**`packages/ai/src/tasks/draft-letter.ts`:**
```typescript
import { runMain } from '../agents/main'

export async function draftViolationLetter(params: {
  propertyAddress: string
  ownerName: string
  violationDescription: string
  ccrSection: string
  hoaName: string
  curePeriodDays: number
  fineAmount: number
}): Promise<string> {
  return runMain([{
    role: 'user',
    content: `Write a formal HOA violation letter. Professional but respectful tone.

HOA: ${params.hoaName}
Property: ${params.propertyAddress}
Owner: ${params.ownerName}
Violation: ${params.violationDescription}
CC&R Section: ${params.ccrSection}
Cure period: ${params.curePeriodDays} days from date of service
Daily fine if uncured: $${params.fineAmount}/day

Requirements:
- Do not include a date line (manager will add when serving)
- Include full signature block for HOA Manager
- Plain text, no markdown
- 3 paragraphs: (1) violation notice, (2) required action, (3) consequences`,
  }], { temperature: 0.2, max_tokens: 800 })
}
```

### Compliance Check — uses reason agent

**`packages/ai/src/tasks/compliance-check.ts`:**
```typescript
import { runReason } from '../agents/reason'
// Note: For Harris County TX, use the static rule engine in lib/compliance/harris-tx.ts first.
// This AI check is for ambiguous edge cases (military protection, mixed-use, etc.)

export async function aiComplianceCheck(params: {
  county: string
  state: string
  daysUnpaid: number
  tenantSituation: string   // Free text about any special circumstances
}): Promise<{
  additionalFlags: string[]
  recommendation: string
  confidence: 'high' | 'medium' | 'low'
}> {
  return runReason([{
    role: 'user',
    content: `You are a landlord-tenant attorney reviewing an eviction case for edge-case flags.

County: ${params.county}, ${params.state}
Days unpaid: ${params.daysUnpaid}
Situation notes: ${params.tenantSituation}

Check for: military/SCRA protections, Section 8 / HUD rules, disability accommodations, domestic violence protections, any reason normal process should not apply.

Respond JSON:
{
  "additionalFlags": ["any flags as strings, empty array if none"],
  "recommendation": "1-2 sentence plain English guidance",
  "confidence": "high|medium|low"
}`,
  }])
}
```

---

## Orchestrated Workflows (Multi-Step Agent Chains)

Some tasks chain multiple agents together. These live in `packages/ai/src/tasks/`.

### Full Violation Workflow (3 agents in sequence)

```typescript
// packages/ai/src/tasks/violation-workflow.ts
// Step 1: Vision agent → describe photo
// Step 2: Reason agent → match CC&R section
// Step 3: Main agent → draft letter

import { analyzeViolationPhoto } from './photo-analysis'
import { covenantBrainAnalyze } from './covenant-brain'
import { draftViolationLetter } from './draft-letter'

export async function runViolationWorkflow(params: {
  photoUrl?: string
  manualDescription?: string
  propertyAddress: string
  ownerName: string
  hoaName: string
  parsedCCRText: string
  curePeriodDays: number
  fineAmount: number
}) {
  // Step 1: Describe the photo (if provided)
  let violationDescription = params.manualDescription ?? ''
  
  if (params.photoUrl) {
    const photoResult = await analyzeViolationPhoto({
      imageUrl: params.photoUrl,
      propertyAddress: params.propertyAddress,
    })
    // Combine photo description with any manual notes
    violationDescription = [
      photoResult.description,
      params.manualDescription,
    ].filter(Boolean).join('. ')
  }

  // Step 2: Match CC&R section
  const ccrMatch = await covenantBrainAnalyze({
    violationDescription,
    parsedCCRText: params.parsedCCRText,
    propertyAddress: params.propertyAddress,
  })

  // Step 3: Draft the letter
  const letterDraft = await draftViolationLetter({
    propertyAddress: params.propertyAddress,
    ownerName: params.ownerName,
    violationDescription,
    ccrSection: ccrMatch.ccrSection,
    hoaName: params.hoaName,
    curePeriodDays: params.curePeriodDays,
    fineAmount: params.fineAmount,
  })

  return {
    violationDescription,
    ccrSection: ccrMatch.ccrSection,
    violationType: ccrMatch.violationType,
    severity: ccrMatch.severity,
    confidence: ccrMatch.confidence,
    letterDraft,        // Bar B: must be reviewed by human before sending
  }
}
```

### Eviction Intake Workflow (2 agents + static rules)

```typescript
// packages/ai/src/tasks/eviction-workflow.ts
// Step 1: Static rule engine (no AI, deterministic)
// Step 2: Reason agent → edge-case check
// Step 3: Main agent → draft notice

import { checkHarrisCountyCompliance } from '../../apps/eviction/src/lib/compliance/harris-tx'
import { aiComplianceCheck } from './compliance-check'
import { draftEvictionNotice } from './draft-notice'

export async function runEvictionIntake(params: {
  county: 'harris_tx'
  daysUnpaid: number
  monthlyRent: number
  tenantName: string
  propertyAddress: string
  landlordName: string
  tenantSituation?: string   // Any free-text notes about edge cases
}) {
  // Step 1: Static county rules (fast, free, 100% reliable)
  const staticCheck = checkHarrisCountyCompliance({
    daysUnpaid: params.daysUnpaid,
    isCommercial: false,
    monthlyRent: params.monthlyRent,
  })

  // Step 2: AI edge-case check (only if landlord noted special circumstances)
  let aiFlags = { additionalFlags: [], recommendation: '', confidence: 'high' as const }
  if (params.tenantSituation && params.tenantSituation.trim().length > 0) {
    aiFlags = await aiComplianceCheck({
      county: 'Harris County',
      state: 'TX',
      daysUnpaid: params.daysUnpaid,
      tenantSituation: params.tenantSituation,
    })
  }

  // Step 3: Draft notice (reason agent handles legal precision)
  const noticeDraft = await draftEvictionNotice({
    tenantName: params.tenantName,
    propertyAddress: params.propertyAddress,
    county: params.county,
    noticeType: staticCheck.requiredNoticeType,
    rentAmount: params.monthlyRent,
    daysUnpaid: params.daysUnpaid,
    landlordName: params.landlordName,
  })

  return {
    staticCheck,
    aiFlags,
    noticeDraft,        // Bar B: must be reviewed by human
    filingEligibleDate: staticCheck.filingEligibleDate,
  }
}
```

---

## Fallback Chain (Resilience)

Every agent call goes through this wrapper. If the primary model fails, it falls back automatically:

```typescript
// packages/ai/src/resilience.ts

import { runMain } from './agents/main'
import { runCPU } from './agents/cpu'

export async function withFallback(
  primary: () => Promise<string>,
  taskDescription: string
): Promise<{ result: string; usedFallback: boolean }> {
  try {
    const result = await Promise.race([
      primary(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 15_000)
      ),
    ])
    return { result, usedFallback: false }
  } catch (err) {
    console.error(`[AI] Primary failed for "${taskDescription}":`, err)
    // Attempt CPU fallback for short tasks
    try {
      const result = await runCPU([{ role: 'user', content: taskDescription }])
      return { result, usedFallback: true }
    } catch {
      throw new Error(`AI unavailable: ${taskDescription}`)
    }
  }
}
```

---

## Environment Variables (Updated for Multi-Model)

Add these to each app's `.env.local` and Vercel settings:

```env
# Qwen 2.5 14B (main + reason agents) — RunPod A10G
AI_BASE_URL=https://your-pod-id-8000.proxy.runpod.net/v1
AI_API_KEY=your-runpod-api-key
AI_MODEL=Qwen/Qwen2.5-14B-Instruct

# Qwen 2.5 3B (fast agent) — same pod, different port or model-id
AI_BASE_URL_FAST=https://your-pod-id-8001.proxy.runpod.net/v1
AI_MODEL_FAST=Qwen/Qwen2.5-3B-Instruct

# Qwen 2.5-VL 7B (vision agent) — separate RunPod pod (only needed when photo analysis used)
AI_BASE_URL_VISION=https://your-vision-pod-id-8000.proxy.runpod.net/v1
AI_MODEL_VISION=Qwen/Qwen2-VL-7B-Instruct

# CPU fallback — always-warm VM (llama.cpp / Ollama)
AI_FALLBACK_URL=http://your-cpu-vm-ip:11434/v1

# Claude Haiku — Anthropic API (daily digest + simple summaries)
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Cost Estimate Per Task

| Task | Agent Used | Approx. Cost |
|------|-----------|-------------|
| Daily digest (per org per day) | Claude Haiku | ~$0.0001 |
| Photo analysis | Vision 7B | ~$0.02 |
| CC&R violation match | Reason 14B | ~$0.03 |
| Violation letter draft | Main 14B | ~$0.05 |
| Meeting summary (1hr transcript) | Main 14B | ~$0.08 |
| Compliance check (simple) | Static rules (free) | $0 |
| Compliance check (edge case) | Reason 14B | ~$0.02 |
| Eviction notice draft | Main 14B | ~$0.05 |
| Intent classification | Fast 3B | ~$0.002 |

**For a typical HOA customer (Starter, $39/mo):** ~10 violations/mo, 1 meeting/mo, 30 digest calls/mo ≈ **~$3.50/mo AI cost** at full usage. Gross margin: ~91%.

---

*This file extends PHASE1_IMPLEMENTATION.md Section 2.2 (`packages/ai`). Replace the simple `chat()` function with the multi-agent router above.*
