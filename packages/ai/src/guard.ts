/**
 * BL-112 — the one gate every model and embedding call passes through.
 *
 * Before this module, BL-108's AI_PLATFORM_KILL_SWITCH lived only in
 * apps/hoa's `checkAndRecordAiUsage`, so it stopped the routes that call
 * `requireAiQuota` and nothing else: background jobs, embeddings and the
 * board server actions that never drew on a bucket kept calling the
 * provider with the switch on. Now:
 *
 *   - every OpenAI-compatible client is built through `guardAiClient`
 *     (packages/ai agents and every packages/workflows W* client), whose
 *     `chat.completions.create` runs `beforeAiCall('chat')` first;
 *   - `embedTexts` runs `beforeAiCall('embed')` before any request;
 *   - the two raw-fetch call sites in apps/hoa (guide ask-model,
 *     community-qa loop) call `beforeAiCall('chat')` themselves.
 *
 * With the switch on, `beforeAiCall` throws `AiPausedError` BEFORE any
 * network request. Routes map it to BL-108's friendly 503 (withRoute);
 * jobs catch it with `isAiPausedError` and skip until the next run.
 *
 * Metering. Calls a user makes are already counted, once per request, by
 * the per-bucket ledger (`ai.usage.<bucket>`). Calls nobody's bucket pays
 * for are counted here, at platform level, so the daily spend alert sees
 * them:
 *   - `ai.usage.embed`        — one row per embedding HTTP request;
 *   - `ai.usage.job.<name>`   — one row per chat call made inside a job's
 *     metering scope (packages/jobs `meterJobAi`, which listens through
 *     `addAiCallObserver`).
 * Rows carry no text: action, optional org id, and counts in metadata.
 *
 * Runtime-neutral on purpose: no node built-ins (AsyncLocalStorage lives
 * in packages/jobs, which is server-only) and no runtime `openai` import,
 * so `@homeowner-portal/ai/guard` is cheap to import from any route.
 */

/** Vercel env flag: set to 1 / true / on / yes to refuse every AI call. */
export const AI_KILL_SWITCH_ENV = 'AI_PLATFORM_KILL_SWITCH'

type Env = Readonly<Record<string, string | undefined>>

export function aiKillSwitchOn(env: Env = process.env): boolean {
  const v = env[AI_KILL_SWITCH_ENV]?.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'on' || v === 'yes'
}

/**
 * The typed error every guarded call throws while the kill switch is on.
 * Its message is fixed and carries no input, so it is safe to log.
 */
export class AiPausedError extends Error {
  readonly code = 'ai_paused' as const
  constructor() {
    super('AI is paused platform-wide (AI_PLATFORM_KILL_SWITCH)')
    this.name = 'AiPausedError'
  }
}

/**
 * True for an AiPausedError anywhere in the `.cause` chain. defineWorkflow
 * re-throws a plain Error with the original as `.cause`, so a workflow
 * caller never sees the class directly. The `code` check covers a second
 * copy of this module (two bundles, two classes).
 */
export function isAiPausedError(err: unknown): boolean {
  let cur: unknown = err
  for (let depth = 0; depth < 5 && cur; depth++) {
    if (cur instanceof AiPausedError) return true
    if (typeof cur === 'object' && (cur as { code?: unknown }).code === 'ai_paused' && (cur as Error).name === 'AiPausedError') {
      return true
    }
    cur = (cur as { cause?: unknown }).cause
  }
  return false
}

export type AiCallKind = 'chat' | 'embed'

type AiCallObserver = (kind: AiCallKind) => void
const observers = new Set<AiCallObserver>()

/**
 * Listen to every guarded call (after the kill-switch check passed).
 * Returns the unsubscribe. Observers must not throw; one that does is
 * ignored so it can never block a model call.
 */
export function addAiCallObserver(fn: AiCallObserver): () => void {
  observers.add(fn)
  return () => {
    observers.delete(fn)
  }
}

/** The gate: throws AiPausedError with the switch on, else notifies observers. */
export function beforeAiCall(kind: AiCallKind, env: Env = process.env): void {
  if (aiKillSwitchOn(env)) throw new AiPausedError()
  for (const fn of observers) {
    try {
      fn(kind)
    } catch {
      // never block a call on an observer
    }
  }
}

/** Minimal client shape (the OpenAI SDK client, or a test double). */
interface ChatClient {
  chat: { completions: { create: (...args: never[]) => unknown } }
}

const GUARDED = Symbol.for('homeowner-portal.ai.guarded')

/**
 * Route a client's chat calls through `beforeAiCall`. Returns the same
 * client, patched in place (idempotent). The original `create` keeps its
 * return value — an APIPromise — untouched; the gate throws synchronously
 * before it is ever reached.
 */
export function guardAiClient<T extends ChatClient>(client: T): T {
  const completions = client.chat.completions as T['chat']['completions'] & { [GUARDED]?: true }
  if (completions[GUARDED]) return client
  const original = completions.create.bind(completions) as (...args: unknown[]) => unknown
  ;(completions as { create: unknown }).create = (...args: unknown[]) => {
    beforeAiCall('chat')
    return original(...args)
  }
  completions[GUARDED] = true
  return client
}

// ─── Platform usage rows ──────────────────────────────────────────────

/** Platform-level usage labels (`ai.usage.<label>`): the spend alert prices each. */
export const PLATFORM_AI_USAGE_LABELS = ['embed', 'job.plaid_sync', 'job.plaid_webhook'] as const
export type PlatformAiUsageLabel = (typeof PLATFORM_AI_USAGE_LABELS)[number]

export interface PlatformAiUsage {
  label: PlatformAiUsageLabel
  /** Rows to write: one per provider call. */
  calls: number
  orgId?: string | null
}

export type AiUsageRecorder = (usage: PlatformAiUsage) => Promise<void>

/**
 * Default: insert `calls` rows into audit_log with the service role.
 * Skipped under vitest (a unit test must never write to a real database)
 * and when the service-role env is absent (scripts, local tools).
 */
const defaultRecorder: AiUsageRecorder = async ({ label, calls, orgId }) => {
  if (process.env.VITEST) return
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return
  const { createAdminClient } = await import('@homeowner-portal/db')
  const rows = Array.from({ length: calls }, () => ({
    action: `ai.usage.${label}`,
    org_id: orgId ?? null,
    metadata: {},
  }))
  const { error } = await createAdminClient().from('audit_log').insert(rows)
  if (error) console.error('[ai-usage] platform usage write failed', { label, calls, code: error.code ?? null })
}

let recorder: AiUsageRecorder = defaultRecorder

/** Replace the recorder (tests). `null` restores the default. */
export function setAiUsageRecorder(fn: AiUsageRecorder | null): void {
  recorder = fn ?? defaultRecorder
}

/** Record platform AI usage. Never throws: metering must not break the call it meters. */
export async function recordPlatformAiUsage(usage: PlatformAiUsage): Promise<void> {
  if (usage.calls <= 0) return
  try {
    await recorder(usage)
  } catch (err) {
    console.error('[ai-usage] platform usage write failed', {
      label: usage.label,
      calls: usage.calls,
      error: err instanceof Error ? err.name : 'unknown',
    })
  }
}
