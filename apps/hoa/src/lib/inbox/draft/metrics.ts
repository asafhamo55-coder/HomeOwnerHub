/**
 * BL-101 A10: how much work an AI reply draft saved the board.
 *
 * Pure functions only — no I/O — so the numbers are unit-testable and
 * shared by the approve path (which records them), the inbox header (which
 * shows this org's last 30 days) and the platform-admin analytics page
 * (which aggregates across tenants).
 *
 * What is stored is IDS AND NUMBERS ONLY. The draft body, the sent body,
 * the subject and the citation quotes are read to compute the figures and
 * then dropped; `DraftMetrics` has no string field except ids, and
 * `parseDraftMetrics` refuses a row carrying any other key, so a future
 * edit that sneaks text into the payload fails its test rather than
 * leaking resident PII into audit_log.
 *
 * Deliberately no `'use server'`: a server-action module may export only
 * async functions.
 */

/** audit_log.action for one approved AI reply draft. */
export const DRAFT_METRICS_ACTION = 'inbox_draft_metrics'
/** Bumped if the meaning of any field changes, so old rows can be told apart. */
export const DRAFT_METRICS_VERSION = 1
/**
 * "Light edits": at most a fifth of the words changed. A reply where the
 * board fixed a name and filled two blanks lands well under this; a reply
 * rewritten from scratch lands near 1.
 */
export const LIGHT_EDIT_RATIO = 0.2
/** Window the board card and the admin aggregate report on. */
export const DRAFT_METRICS_WINDOW_DAYS = 30
/**
 * Word cap for the edit distance (two-row DP, so O(n·m) time and O(m)
 * memory). A reply is a few hundred words; past this both sides are
 * truncated to keep the approve path fast, which can only UNDER-count
 * edits beyond the cap — documented, never silent: `truncated` is stored.
 */
export const MAX_DIFF_WORDS = 3000

export interface DraftMetrics {
  v: number
  draft_id: string
  thread_id: string | null
  ai_run_id: string | null
  /** Word-level edit distance / longer of the two bodies, 0..1, 3 decimals. */
  edit_ratio: number
  edit_words: number
  draft_words: number
  sent_words: number
  subject_edited: boolean
  /** `[[BLANK: …]]` markers in the generated subject + body. */
  blanks_at_draft: number
  /** Citations returned with the draft. */
  citations_total: number
  /** Of those, how many had their exact quote in the generated body. */
  citations_in_draft: number
  /** Of `citations_in_draft`, how many quotes survived into the sent body. */
  citations_kept: number
  /** Draft row created → approve, whole seconds, never negative. */
  seconds_to_approve: number
  truncated: boolean
}

const BLANK_MARKER = /\[\[\s*BLANK\s*:\s*[a-z_]+\s*\]\]/gi

export function countBlankMarkers(text: string): number {
  return text.match(BLANK_MARKER)?.length ?? 0
}

export function tokenize(text: string): string[] {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/) : []
}

/** Levenshtein distance over word arrays (insert, delete, substitute = 1). */
export function wordEditDistance(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let prev = new Array<number>(b.length + 1)
  let curr = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[b.length]
}

export function editRatio(draft: string, sent: string): {
  ratio: number
  distance: number
  draftWords: number
  sentWords: number
  truncated: boolean
} {
  const a = tokenize(draft)
  const b = tokenize(sent)
  const truncated = a.length > MAX_DIFF_WORDS || b.length > MAX_DIFF_WORDS
  const distance = wordEditDistance(a.slice(0, MAX_DIFF_WORDS), b.slice(0, MAX_DIFF_WORDS))
  const longest = Math.min(Math.max(a.length, b.length), MAX_DIFF_WORDS)
  const ratio = longest === 0 ? 0 : Math.round((distance / longest) * 1000) / 1000
  return { ratio: Math.min(1, ratio), distance, draftWords: a.length, sentWords: b.length, truncated }
}

const squash = (text: string) => text.replace(/\s+/g, ' ').trim()

/**
 * A citation counts as "in the draft" when its exact quote (whitespace
 * collapsed) appears in the generated body, and as "kept" when it still
 * appears in the body that was sent. Citations the model listed but never
 * quoted in the body are counted in `total` only — removing them is not an
 * edit the board made.
 */
export function citationRetention(
  citations: ReadonlyArray<{ quote?: unknown }>,
  draftBody: string,
  sentBody: string,
): { total: number; inDraft: number; kept: number } {
  const draft = squash(draftBody)
  const sent = squash(sentBody)
  let inDraft = 0
  let kept = 0
  for (const citation of citations) {
    const quote = typeof citation.quote === 'string' ? squash(citation.quote) : ''
    if (!quote || !draft.includes(quote)) continue
    inDraft++
    if (sent.includes(quote)) kept++
  }
  return { total: citations.length, inDraft, kept }
}

export function computeDraftMetrics(input: {
  draftId: string
  threadId: string | null
  aiRunId: string | null
  draftSubject: string
  draftBody: string
  sentSubject: string
  sentBody: string
  citations: unknown
  createdAt: string
  approvedAt: Date
}): DraftMetrics {
  const diff = editRatio(input.draftBody, input.sentBody)
  const citations = Array.isArray(input.citations)
    ? (input.citations as Array<{ quote?: unknown }>).filter((c) => c !== null && typeof c === 'object')
    : []
  const retention = citationRetention(citations, input.draftBody, input.sentBody)
  const created = Date.parse(input.createdAt)
  const seconds = Number.isFinite(created)
    ? Math.max(0, Math.round((input.approvedAt.getTime() - created) / 1000))
    : 0
  return {
    v: DRAFT_METRICS_VERSION,
    draft_id: input.draftId,
    thread_id: input.threadId,
    ai_run_id: input.aiRunId,
    edit_ratio: diff.ratio,
    edit_words: diff.distance,
    draft_words: diff.draftWords,
    sent_words: diff.sentWords,
    subject_edited: squash(input.draftSubject) !== squash(input.sentSubject),
    blanks_at_draft: countBlankMarkers(input.draftSubject) + countBlankMarkers(input.draftBody),
    citations_total: retention.total,
    citations_in_draft: retention.inDraft,
    citations_kept: retention.kept,
    seconds_to_approve: seconds,
    truncated: diff.truncated,
  }
}

export function draftMetricsAuditRow(args: { orgId: string; userId: string; metrics: DraftMetrics }) {
  return {
    action: DRAFT_METRICS_ACTION,
    org_id: args.orgId,
    user_id: args.userId,
    entity_type: 'inbox_draft',
    entity_id: args.metrics.draft_id,
    metadata: args.metrics,
  }
}

const NUMBER_KEYS = [
  'v',
  'edit_ratio',
  'edit_words',
  'draft_words',
  'sent_words',
  'blanks_at_draft',
  'citations_total',
  'citations_in_draft',
  'citations_kept',
  'seconds_to_approve',
] as const
const ID_KEYS = ['draft_id', 'thread_id', 'ai_run_id'] as const
const BOOL_KEYS = ['subject_edited', 'truncated'] as const
const ALLOWED_KEYS = new Set<string>([...NUMBER_KEYS, ...ID_KEYS, ...BOOL_KEYS])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Reads one stored payload back, or null if it is not exactly the shape
 * `computeDraftMetrics` writes: unknown keys, a non-uuid id, a non-finite
 * number. Also the "no text stored" check — a payload with any free-text
 * field is rejected rather than shown.
 */
export function parseDraftMetrics(value: unknown): DraftMetrics | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  for (const key of Object.keys(row)) if (!ALLOWED_KEYS.has(key)) return null
  for (const key of NUMBER_KEYS) {
    const n = row[key]
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return null
  }
  for (const key of BOOL_KEYS) if (typeof row[key] !== 'boolean') return null
  if (typeof row.draft_id !== 'string' || !UUID.test(row.draft_id)) return null
  for (const key of ['thread_id', 'ai_run_id'] as const) {
    const id = row[key]
    if (id !== null && (typeof id !== 'string' || !UUID.test(id))) return null
  }
  return row as unknown as DraftMetrics
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export interface DraftQualitySummary {
  drafts: number
  /** Share (0..1) sent with edit_ratio ≤ LIGHT_EDIT_RATIO. */
  lightEditShare: number | null
  /** Share sent with no body edit at all. */
  unchangedShare: number | null
  medianEditRatio: number | null
  medianSecondsToApprove: number | null
  medianBlanks: number | null
  /** Of drafts that quoted at least one citation, share that kept every quote. */
  citationsKeptShare: number | null
}

export function summarizeDraftMetrics(rows: readonly DraftMetrics[]): DraftQualitySummary {
  const n = rows.length
  const share = (count: number, of: number) => (of === 0 ? null : count / of)
  const cited = rows.filter((r) => r.citations_in_draft > 0)
  return {
    drafts: n,
    lightEditShare: share(rows.filter((r) => r.edit_ratio <= LIGHT_EDIT_RATIO).length, n),
    unchangedShare: share(rows.filter((r) => r.edit_words === 0).length, n),
    medianEditRatio: median(rows.map((r) => r.edit_ratio)),
    medianSecondsToApprove: median(rows.map((r) => r.seconds_to_approve)),
    medianBlanks: median(rows.map((r) => r.blanks_at_draft)),
    citationsKeptShare: share(cited.filter((r) => r.citations_kept === r.citations_in_draft).length, cited.length),
  }
}

export function formatPercent(share: number | null): string {
  return share === null ? '—' : `${Math.round(share * 100)}%`
}

/** "45 sec", "3 min", "2.5 h", "3 days". */
export function formatApproveTime(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds < 60) return `${Math.round(seconds)} sec`
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`
  if (seconds < 86_400) return `${Math.round((seconds / 3600) * 10) / 10} h`
  const days = Math.round(seconds / 86_400)
  return `${days} day${days === 1 ? '' : 's'}`
}
