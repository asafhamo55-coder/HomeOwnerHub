// Cost guards for /api/chat. In memory, per server instance: the repo has no
// shared store on the marketing project (no Upstash, no KV), so these limits
// are best effort across serverless instances. The hard backstops are the
// daily cap (per instance) and the provider-side spend limit. Relative imports
// only: tests import this module.

export const MAX_MESSAGE_CHARS = 500
export const MAX_USER_TURNS = 10
export const MAX_BODY_CHARS = 12_000
export const IP_WINDOW_MS = 10 * 60 * 1000
export const IP_MAX_REQUESTS = 12
export const DEFAULT_DAILY_CAP = 400
export const MODEL_TIMEOUT_MS = 12_000

const hits = new Map<string, number[]>()
let day = ''
let dayCount = 0

/** True when this IP may make another request now (and records it). */
export function allowIp(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS)
  if (recent.length >= IP_MAX_REQUESTS) {
    hits.set(ip, recent)
    return false
  }
  recent.push(now)
  hits.set(ip, recent)
  // Keep the map from growing without bound.
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < IP_WINDOW_MS)) hits.delete(k)
  }
  return true
}

export function dailyCap(env: Record<string, string | undefined> = process.env): number {
  const n = Number.parseInt(env.CHAT_DAILY_CAP ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_CAP
}

/** True while today's global count is under the cap (and counts this request). */
export function allowToday(cap: number, now = new Date()): boolean {
  const d = now.toISOString().slice(0, 10)
  if (d !== day) {
    day = d
    dayCount = 0
  }
  if (dayCount >= cap) return false
  dayCount += 1
  return true
}

export function resetLimitsForTests(): void {
  hits.clear()
  day = ''
  dayCount = 0
}
