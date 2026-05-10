import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'

/**
 * `defineWorkflow` — the v1 primitive every AI workflow goes through.
 *
 * Wrapping a workflow with this gives you, for free:
 *  - Zod input/output validation at the boundary
 *  - Audit logging into `ai_runs` (powers customer audit log + transparency
 *    report, per spec §6)
 *  - Latency + token capture
 *  - Citation + reasoning trace capture (opt-in)
 *  - Human-approval routing flag in the audit row (the run lands as
 *    'pending_human_approval' and the UI elsewhere resolves it)
 *  - Deterministic input hashing for dedupe / replay
 *
 * Workflows return their declared `outputSchema` shape. The wrapper
 * ALSO returns the `ai_runs.id` so the caller can attach the run to the
 * domain row it produced (e.g. a violation, an ARC review).
 */

export type WorkflowExecutionStatus =
  | 'completed'
  | 'failed'
  | 'pending_human_approval'

export interface WorkflowExecutionContext {
  organizationId: string
  /** Caller-controlled correlation id; surfaces in logs but isn't stored. */
  correlationId?: string
}

export interface WorkflowResult<TOutput> {
  /** The validated output the workflow produced. */
  output: TOutput
  /** ai_runs row id — store this on the domain record for traceability. */
  runId: string
  status: WorkflowExecutionStatus
  citations: string[]
  confidence: number | null
  tokensIn: number | null
  tokensOut: number | null
  latencyMs: number
}

export interface WorkflowExecuteApi {
  /** Mark this run as needing board/manager approval before its output ships. */
  requireHumanApproval: () => void
  /** Attach citations (governing_document_chunks.id) used to ground the answer. */
  addCitations: (chunkIds: string[]) => void
  /** Record a 0..1 confidence score the workflow computed itself. */
  setConfidence: (value: number) => void
  /** Capture chain-of-thought / reasoning trace if the workflow returned one. */
  setReasoning: (text: string) => void
  /** Record token counts when known (the LLM client returns them). */
  setTokens: (tokensIn: number, tokensOut: number) => void
  /** Tag which model actually answered (overrides the default pinned in defineWorkflow). */
  setModel: (modelId: string) => void
}

export interface DefineWorkflowOptions<
  TInputSchema extends z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny,
> {
  /** Stable id from spec §5: 'W1', 'W2', ... */
  id: string
  /** Human-readable name. */
  name: string
  /** Semver of the workflow's behavior. Bump when prompt or tool surface changes meaningfully. */
  version: string
  /** Semver of the prompt only. Bump on prompt copy edits. */
  promptVersion: string
  /** Default model id (the workflow's run() can override via setModel). */
  model: string
  /** Whether this workflow's output cannot ship without human approval (W3, W4 etc). */
  humanApprovalRequired?: boolean
  inputSchema: TInputSchema
  outputSchema: TOutputSchema
  /**
   * The workflow body. Receives the validated input + a small API to
   * record metadata that gets stamped on the audit row.
   */
  run: (
    input: z.infer<TInputSchema>,
    api: WorkflowExecuteApi,
    ctx: WorkflowExecutionContext,
  ) => Promise<z.infer<TOutputSchema>>
}

export interface Workflow<
  TInputSchema extends z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny,
> {
  id: string
  name: string
  version: string
  promptVersion: string
  defaultModel: string
  humanApprovalRequired: boolean
  inputSchema: TInputSchema
  outputSchema: TOutputSchema
  execute: (
    input: z.infer<TInputSchema>,
    ctx: WorkflowExecutionContext,
  ) => Promise<WorkflowResult<z.infer<TOutputSchema>>>
}

export function defineWorkflow<
  TInputSchema extends z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny,
>(opts: DefineWorkflowOptions<TInputSchema, TOutputSchema>): Workflow<
  TInputSchema,
  TOutputSchema
> {
  return {
    id: opts.id,
    name: opts.name,
    version: opts.version,
    promptVersion: opts.promptVersion,
    defaultModel: opts.model,
    humanApprovalRequired: opts.humanApprovalRequired ?? false,
    inputSchema: opts.inputSchema,
    outputSchema: opts.outputSchema,

    async execute(rawInput, ctx) {
      const input = opts.inputSchema.parse(rawInput) as z.infer<TInputSchema>

      // Mutable bag the workflow body fills in via the api object.
      const captured: {
        citations: string[]
        confidence: number | null
        reasoning: string | null
        tokensIn: number | null
        tokensOut: number | null
        model: string
        humanApprovalRequired: boolean
      } = {
        citations: [],
        confidence: null,
        reasoning: null,
        tokensIn: null,
        tokensOut: null,
        model: opts.model,
        humanApprovalRequired: opts.humanApprovalRequired ?? false,
      }

      const api: WorkflowExecuteApi = {
        requireHumanApproval: () => {
          captured.humanApprovalRequired = true
        },
        addCitations: (ids) => {
          captured.citations.push(...ids)
        },
        setConfidence: (value) => {
          captured.confidence = clamp01(value)
        },
        setReasoning: (text) => {
          captured.reasoning = text
        },
        setTokens: (tokensIn, tokensOut) => {
          captured.tokensIn = tokensIn
          captured.tokensOut = tokensOut
        },
        setModel: (modelId) => {
          captured.model = modelId
        },
      }

      const startedAt = Date.now()
      let output: z.infer<TOutputSchema> | null = null
      let errorCode: string | null = null

      try {
        const raw = await opts.run(input, api, ctx)
        output = opts.outputSchema.parse(raw) as z.infer<TOutputSchema>
      } catch (err) {
        errorCode =
          err instanceof Error ? `${err.name}: ${err.message}` : String(err)
        // Still log the failure so the audit log captures it.
      }

      const latencyMs = Date.now() - startedAt

      const status: WorkflowExecutionStatus = errorCode
        ? 'failed'
        : captured.humanApprovalRequired
          ? 'pending_human_approval'
          : 'completed'

      const inputHash = await sha256(stableStringify(input))

      const runId = await persistRun({
        organizationId: ctx.organizationId,
        workflowId: opts.id,
        workflowVersion: opts.version,
        promptVersion: opts.promptVersion,
        model: captured.model,
        inputHash,
        input,
        output: output ?? { _error: errorCode },
        citations: captured.citations,
        reasoning: captured.reasoning,
        tokensIn: captured.tokensIn,
        tokensOut: captured.tokensOut,
        latencyMs,
        confidence: captured.confidence,
        errorCode,
        status,
      })

      if (errorCode || !output) {
        throw new Error(`workflow_${opts.id}_failed: ${errorCode}`)
      }

      return {
        output,
        runId,
        status,
        citations: captured.citations,
        confidence: captured.confidence,
        tokensIn: captured.tokensIn,
        tokensOut: captured.tokensOut,
        latencyMs,
      }
    },
  }
}

// ─── persistence ────────────────────────────────────────────────────

interface PersistRunInput {
  organizationId: string
  workflowId: string
  workflowVersion: string
  promptVersion: string
  model: string
  inputHash: string
  input: unknown
  output: unknown
  citations: string[]
  reasoning: string | null
  tokensIn: number | null
  tokensOut: number | null
  latencyMs: number
  confidence: number | null
  errorCode: string | null
  status: WorkflowExecutionStatus
}

async function persistRun(row: PersistRunInput): Promise<string> {
  const db = createAdminClient()
  // ai_runs requires service-role write because the run is logged from
  // the server side and may include prompt/output that the requesting
  // user doesn't have direct INSERT rights to. RLS still applies on
  // SELECT so customers can only see their own org's runs.
  const { data, error } = await db
    .from('ai_runs' as never)                  // typed in 0004; types regen post-migration
    .insert({
      organization_id: row.organizationId,
      workflow_id: row.workflowId,
      workflow_version: row.workflowVersion,
      prompt_version: row.promptVersion,
      model: row.model,
      input_hash: row.inputHash,
      input: row.input,
      output: row.output,
      citations: row.citations.length > 0 ? row.citations : null,
      reasoning_trace: row.reasoning,
      tokens_in: row.tokensIn,
      tokens_out: row.tokensOut,
      latency_ms: row.latencyMs,
      confidence: row.confidence,
      error_code: row.errorCode,
      status: row.status,
    } as never)
    .select('id')
    .single<{ id: string }>()

  if (error || !data) {
    // Audit failure should never silently succeed; fail loud so it
    // surfaces in Sentry / Vercel logs.
    throw new Error(`ai_runs_insert_failed: ${error?.message ?? 'unknown'}`)
  }
  return data.id
}

// ─── helpers ────────────────────────────────────────────────────────

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

async function sha256(input: string): Promise<string> {
  // Web Crypto API — available globally in Node 20+ and modern browsers,
  // so the workflow module can be imported by either runtime without
  // pulling in node:crypto (which webpack refuses to bundle for client).
  const data = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(hashBuffer)
  let hex = ''
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex
}

/**
 * Stable JSON stringify so the same input always hashes to the same
 * value regardless of key order. Cheap recursive sort; inputs are tiny.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`
}
